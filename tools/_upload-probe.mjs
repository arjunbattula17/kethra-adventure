import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome', headless: false, args: ['--use-angle=d3d11', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: 800, height: 600 } });
await p.goto('http://localhost:4173/kethra-adventure/');
await p.waitForSelector('.title-btn');
const r = await p.evaluate(async () => {
  const gl = window.__DEBUG__.engine.renderer.getContext();
  const out = [];
  const base = location.pathname + 'models/quaternius/Textures/';
  for (const file of ['T_Trim_02_Normal.jpg', 'T_Decals.png', 'T_Trim_01_ORM.jpg', 'T_Trim_02_Normal.jpg']) {
    const blob = await (await fetch(base + file)).blob();
    for (const [label, opts] of [
      ['none/none resize', { premultiplyAlpha: 'none', colorSpaceConversion: 'none', resizeWidth: 1024, resizeHeight: 1024, resizeQuality: 'high' }],
      ['none/none full', { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }],
      ['default resize', { resizeWidth: 1024, resizeHeight: 1024, resizeQuality: 'high' }],
    ]) {
      const t0 = performance.now();
      const bmp = await createImageBitmap(blob, opts);
      const decode = performance.now() - t0;
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      const t1 = performance.now();
      gl.texStorage2D(gl.TEXTURE_2D, 11, gl.RGBA8, bmp.width, bmp.height);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, bmp);
      const call = performance.now() - t1;
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
      const total = performance.now() - t1;
      out.push(`${file.padEnd(22)} ${label.padEnd(18)} ${bmp.width}x${bmp.height} decode ${decode.toFixed(0)} ms, texSubImage2D call ${call.toFixed(0)} ms, with mips+sync ${total.toFixed(0)} ms`);
      gl.deleteTexture(tex);
      bmp.close();
    }
  }
  return out;
});
console.log(r.join('\n'));
await b.close();
