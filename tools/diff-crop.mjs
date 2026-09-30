// Where two renders differ most: finds the 96x96 window with the largest summed difference and
// writes that window from both images (4x, nearest-neighbour) plus an amplified difference, side by
// side, so a reviewer can see what changed rather than read a number.
//
//   node tools/diff-crop.mjs <a.png> <b.png> <out.png>
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const [A, B, OUT] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
const png = await page.evaluate(async ({ a, b }) => {
  const load = (s) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = 'data:image/png;base64,' + s; });
  const [ia, ib] = await Promise.all([load(a), load(b)]);
  const grab = (img) => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0); return g.getImageData(0, 0, c.width, c.height).data; };
  const da = grab(ia), db = grab(ib);
  const W = ia.width, H = ia.height, S = 96;
  const diff = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) diff[i] = Math.max(Math.abs(da[i * 4] - db[i * 4]), Math.abs(da[i * 4 + 1] - db[i * 4 + 1]), Math.abs(da[i * 4 + 2] - db[i * 4 + 2]));
  let best = [0, 0, -1];
  for (let y = 0; y + S <= H; y += 16) for (let x = 0; x + S <= W; x += 16) {
    let s = 0;
    for (let yy = y; yy < y + S; yy++) for (let xx = x; xx < x + S; xx++) s += diff[yy * W + xx];
    if (s > best[2]) best = [x, y, s];
  }
  const [bx, by] = best;
  const Z = 4, out = document.createElement('canvas');
  out.width = S * Z * 3 + 16; out.height = S * Z;
  const g = out.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(ia, bx, by, S, S, 0, 0, S * Z, S * Z);
  g.drawImage(ib, bx, by, S, S, S * Z + 8, 0, S * Z, S * Z);
  const d = g.createImageData(S, S);
  for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) { const v = Math.min(255, diff[(by + yy) * W + bx + xx] * 8); const i = (yy * S + xx) * 4; d.data[i] = v; d.data[i + 1] = v; d.data[i + 2] = v; d.data[i + 3] = 255; }
  const t = document.createElement('canvas'); t.width = S; t.height = S; t.getContext('2d').putImageData(d, 0, 0);
  g.drawImage(t, 0, 0, S, S, S * Z * 2 + 16, 0, S * Z, S * Z);
  return { url: out.toDataURL('image/png'), at: [bx, by] };
}, { a: readFileSync(A).toString('base64'), b: readFileSync(B).toString('base64') });
writeFileSync(OUT, Buffer.from(png.url.split(',')[1], 'base64'));
console.log(`worst 96x96 window at ${png.at.join(',')} -> ${OUT}`);
await browser.close();
