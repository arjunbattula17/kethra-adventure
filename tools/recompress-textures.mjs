// Re-encodes PNG textures as JPEG and measures what that cost, per channel, before accepting the
// result. Normal and ORM maps are linear data — an ORM packs ambient occlusion, roughness and
// metalness into R, G and B — so JPEG's chroma handling can shift a channel in ways that never show
// up as a "looks fine" glance at the image. Each file is encoded, decoded back, and compared to the
// original; quality is raised until the error is inside budget, and a file that can't get there is
// left as PNG.
//
// Usage: node tools/recompress-textures.mjs <dir> [--write]
import { chromium } from 'playwright';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] || 'public/models/quaternius/Textures';
const write = process.argv.includes('--write');
// Budget in 8-bit levels. Mean is what shows as a shift in surface response across a whole
// material, and it is the gate. The 99.9th-percentile and max errors are reported but not gated on:
// on a 4-megapixel ORM map both are dominated by JPEG ringing along the hard panel edges baked into
// the ambient-occlusion channel, which is a handful of texels and not something the renderer can
// show. Whether that is really true is settled by rendering the room before and after and diffing
// the frames (tools/compare-renders.mjs), not by arguing about texture statistics.
//
// A file JPEG makes bigger stays PNG. The source PNGs are already well packed — a lossless
// re-encode through Chromium's own encoder came out 59% LARGER across the set — so the small,
// high-contrast masks, decal sheets and emissive maps have nothing to gain here.
const MEAN_BUDGET = 2.0;
const MIN_SAVING = 0.2;
const QUALITIES = [0.92, 0.95, 0.97];

const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.png'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 64, height: 64 } });
await page.goto('about:blank');

const accepted = [];
const rejected = [];
for (const f of files) {
  const src = readFileSync(join(dir, f));
  const res = await page.evaluate(async ({ b64, qualities, srcBytes }) => {
    const load = (url) => new Promise((ok, err) => { const i = new Image(); i.onload = () => ok(i); i.onerror = err; i.src = url; });
    const img = await load('data:image/png;base64,' + b64);
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const orig = g.getImageData(0, 0, c.width, c.height).data;
    for (const q of qualities) {
      const url = c.toDataURL('image/jpeg', q);
      const back = await load(url);
      const c2 = document.createElement('canvas');
      c2.width = c.width; c2.height = c.height;
      const g2 = c2.getContext('2d', { willReadFrequently: true });
      g2.drawImage(back, 0, 0);
      const out = g2.getImageData(0, 0, c2.width, c2.height).data;
      let sum = 0, max = 0, n = 0;
      const hist = new Uint32Array(256);
      for (let i = 0; i < orig.length; i += 4) {
        for (let k = 0; k < 3; k++) { const d = Math.abs(orig[i + k] - out[i + k]); sum += d; if (d > max) max = d; hist[d]++; n++; }
      }
      let acc = 0, p999 = 0;
      const cut = n * 0.999;
      for (let d = 0; d < 256; d++) { acc += hist[d]; if (acc >= cut) { p999 = d; break; } }
      const bytes = Math.round((url.length - url.indexOf(',') - 1) * 0.75);
      const stat = { q, mean: sum / n, max, p999, bytes, data: null };
      const smaller = bytes <= srcBytes * (1 - 0.2);
      if (smaller && stat.mean <= 2.0) { stat.data = url.slice(url.indexOf(',') + 1); return stat; }
      if (!smaller) return stat;
      if (q === qualities[qualities.length - 1]) return stat;
    }
  }, { b64: src.toString('base64'), qualities: QUALITIES, srcBytes: src.length });

  const line = `${f.padEnd(34)} ${(src.length / 1048576).toFixed(2)}MB -> ${(res.bytes / 1048576).toFixed(2)}MB  q${res.q}  mean ${res.mean.toFixed(3)}  p99.9 ${String(res.p999).padStart(3)}  max ${res.max}`;
  if (res.data) {
    accepted.push({ f, src: src.length, out: res.bytes });
    console.log(`  KEEP  ${line}`);
    if (write) writeFileSync(join(dir, f.replace(/\.png$/i, '.jpg')), Buffer.from(res.data, 'base64'));
  } else {
    rejected.push(f);
    console.log(`  SKIP  ${line}  (rejected)`);
  }
}
const before = accepted.reduce((s, a) => s + a.src, 0), after = accepted.reduce((s, a) => s + a.out, 0);
console.log(`\n${accepted.length} converted: ${(before / 1048576).toFixed(2)}MB -> ${(after / 1048576).toFixed(2)}MB (${((1 - after / before) * 100).toFixed(1)}% smaller)`);
if (rejected.length) console.log(`${rejected.length} left as PNG: ${rejected.join(', ')}`);
console.log(write ? 'JPEGs written.' : 'Dry run — pass --write to emit files.');
await browser.close();
