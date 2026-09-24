// Downscales texture files in place to a target size, for bringing over-resolved textures to the
// texel-density standard in TEXTURE_AUDIT.md.
//
// Works on raw pixels end to end, because every canvas shortcut changed the art in game:
// - Decode goes through WebGL with premultiplication and colour conversion off, the way three.js's
//   kit loader decodes. An <img> decode applies embedded colour profiles (Leaves.png carries one),
//   which three ignores.
// - Resampling is an area average in plain JS. A 2D canvas stores pixels premultiplied, so every
//   fully transparent texel of a leaf atlas came back black instead of white, and the GPU's own
//   mip chain then blended leaf edges toward black: canopies rendered visibly darker.
// - PNGs are written by a small encoder below (lossless, RGBA, straight alpha) for the same reason.
//   JPEGs are opaque, so the canvas encoder is safe for them.
// Normal maps are re-normalized after averaging (averaged normals shrink toward flat). Each run
// prints a mean-colour drift against the original as a gate on all of the above.
//
// Originals are not copied anywhere: every file this touches is tracked in git, and TEXTURE_AUDIT.md
// records the revision to restore from (`git checkout <rev> -- <path>`).
//
//   node tools/resize-textures.mjs <path>=<width>[x<height>] ... [--quality=0.9] [--dry]
//   e.g. node tools/resize-textures.mjs public/textures/planets/sun.jpg=1024x512
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const quality = Number(args.find((a) => a.startsWith('--quality='))?.split('=')[1] ?? 0.9);
const jobs = args
  .filter((a) => !a.startsWith('--'))
  .map((a) => {
    const [path, size] = a.split('=');
    const [w, h] = size.split('x').map(Number);
    return { path, w, h: h || w };
  });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.goto('about:blank');

for (const job of jobs) {
  const bytes = readFileSync(job.path);
  const png = job.path.toLowerCase().endsWith('.png');
  // Matches the map-type suffix only: "Bark_NormalTree.jpg" is a colour map whose tree is called Normal.
  const normal = /(_normal|nor_gl)\.[a-z]+$/i.test(job.path);
  const out = await page.evaluate(
    async ({ b64, mime, w, h, normal, png, quality }) => {
      const rawDecode = async (blob) => {
        const bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
        const gl = document.createElement('canvas').getContext('webgl2');
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, bmp);
        const fb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        const px = new Uint8Array(bmp.width * bmp.height * 4);
        gl.readPixels(0, 0, bmp.width, bmp.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return { w: bmp.width, h: bmp.height, px };
      };

      // Separable area-average resample (exact coverage weights, so odd sizes like 1008x981 work).
      const resample = (src, sw, sh, dw, dh) => {
        const axis = (sLen, dLen) => {
          const scale = sLen / dLen, spans = [];
          for (let d = 0; d < dLen; d++) {
            const a = d * scale, b = a + scale, taps = [];
            for (let s = Math.floor(a); s < Math.min(sLen, Math.ceil(b)); s++) {
              const wgt = Math.min(b, s + 1) - Math.max(a, s);
              if (wgt > 0) taps.push([s, wgt / scale]);
            }
            spans.push(taps);
          }
          return spans;
        };
        const xs = axis(sw, dw), ys = axis(sh, dh);
        const tmp = new Float32Array(dw * sh * 4);
        for (let y = 0; y < sh; y++)
          for (let x = 0; x < dw; x++)
            for (const [s, wgt] of xs[x]) for (let k = 0; k < 4; k++) tmp[(y * dw + x) * 4 + k] += src[(y * sw + s) * 4 + k] * wgt;
        const dst = new Uint8Array(dw * dh * 4);
        for (let y = 0; y < dh; y++)
          for (let x = 0; x < dw; x++)
            for (let k = 0; k < 4; k++) {
              let v = 0;
              for (const [s, wgt] of ys[y]) v += tmp[(s * dw + x) * 4 + k] * wgt;
              dst[(y * dw + x) * 4 + k] = Math.round(Math.min(255, Math.max(0, v)));
            }
        return dst;
      };

      const crcTable = Array.from({ length: 256 }, (_, n) => {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        return c >>> 0;
      });
      const crc32 = (bytes) => {
        let c = 0xffffffff;
        for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
        return (c ^ 0xffffffff) >>> 0;
      };
      const encodePNG = async (pw, ph, px) => {
        const raw = new Uint8Array((pw * 4 + 1) * ph);
        for (let y = 0; y < ph; y++) raw.set(px.subarray(y * pw * 4, (y + 1) * pw * 4), y * (pw * 4 + 1) + 1);
        const z = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
        const chunk = (type, data) => {
          const out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
          dv.setUint32(0, data.length);
          out.set(new TextEncoder().encode(type), 4);
          out.set(data, 8);
          dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
          return out;
        };
        const ihdr = new Uint8Array(13), dv = new DataView(ihdr.buffer);
        dv.setUint32(0, pw); dv.setUint32(4, ph);
        ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit, RGBA, deflate, no filter, no interlace
        return new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', z), chunk('IEND', new Uint8Array())], { type: 'image/png' });
      };
      const encodeJPEG = async (pw, ph, px) => {
        const c = document.createElement('canvas');
        c.width = pw; c.height = ph;
        c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(px), pw, ph), 0, 0);
        return new Promise((ok) => c.toBlob(ok, 'image/jpeg', quality));
      };
      const meanOf = ({ px }) => {
        const m = [0, 0, 0]; let n = 0;
        for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 128) { m[0] += px[i]; m[1] += px[i + 1]; m[2] += px[i + 2]; n++; }
        return m.map((v) => v / Math.max(1, n));
      };

      const src = await rawDecode(await (await fetch(`data:${mime};base64,${b64}`)).blob());
      const before = `${src.w}x${src.h}`;
      if (src.w <= w && src.h <= h) return { skipped: true, before };
      const px = resample(src.px, src.w, src.h, w, h);
      if (normal) {
        for (let i = 0; i < px.length; i += 4) {
          const x = px[i] / 127.5 - 1, y = px[i + 1] / 127.5 - 1, z = px[i + 2] / 127.5 - 1;
          const len = Math.hypot(x, y, z) || 1;
          px[i] = Math.round((x / len + 1) * 127.5);
          px[i + 1] = Math.round((y / len + 1) * 127.5);
          px[i + 2] = Math.round((z / len + 1) * 127.5);
        }
      }
      const blob = png ? await encodePNG(w, h, px) : await encodeJPEG(w, h, px);
      const back = await rawDecode(blob);
      const [m0, m1] = [meanOf(src), meanOf(back)];
      const drift = Math.max(...m0.map((v, i) => Math.abs(v - m1[i])));
      const outBytes = new Uint8Array(await blob.arrayBuffer());
      let bin = '';
      for (let i = 0; i < outBytes.length; i += 0x8000) bin += String.fromCharCode(...outBytes.subarray(i, i + 0x8000));
      return { before, after: `${w}x${h}`, b64: btoa(bin), drift: +drift.toFixed(2) };
    },
    { b64: bytes.toString('base64'), mime: png ? 'image/png' : 'image/jpeg', w: job.w, h: job.h, normal, png, quality },
  );
  if (out.skipped) {
    console.log(`skip  ${job.path} (already ${out.before})`);
    continue;
  }
  const buf = Buffer.from(out.b64, 'base64');
  console.log(`${dry ? 'dry ' : ''}${job.path}  ${out.before} -> ${out.after}  ${(bytes.length / 1024).toFixed(0)}KB -> ${(buf.length / 1024).toFixed(0)}KB  mean-colour drift ${out.drift}`);
  if (!dry) writeFileSync(job.path, buf);
}
await browser.close();
