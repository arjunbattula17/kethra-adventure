// Pixel-diffs two directories of identically-named renders and reports how far apart they are.
// Used to decide whether an asset change (texture re-encode, material tweak) actually altered what
// the player sees, rather than arguing from statistics about the assets themselves.
// Usage: node tools/compare-renders.mjs <dirA> <dirB>
import { chromium } from 'playwright';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const [a, b] = process.argv.slice(2);
const files = readdirSync(a).filter((f) => f.endsWith('.png') && readdirSync(b).includes(f));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 64, height: 64 } });
await page.goto('about:blank');

const rows = [];
for (const f of files) {
  const r = await page.evaluate(async ({ x, y }) => {
    const load = (b64) => new Promise((ok, err) => { const i = new Image(); i.onload = () => ok(i); i.onerror = err; i.src = 'data:image/png;base64,' + b64; });
    const [ia, ib] = await Promise.all([load(x), load(y)]);
    const c1 = document.createElement('canvas'); c1.width = ia.width; c1.height = ia.height;
    c1.getContext('2d', { willReadFrequently: true }).drawImage(ia, 0, 0);
    const c2 = document.createElement('canvas'); c2.width = ib.width; c2.height = ib.height;
    c2.getContext('2d', { willReadFrequently: true }).drawImage(ib, 0, 0);
    const d1 = c1.getContext('2d').getImageData(0, 0, c1.width, c1.height).data;
    const d2 = c2.getContext('2d').getImageData(0, 0, c2.width, c2.height).data;
    let sum = 0, n = 0, over8 = 0, over32 = 0, max = 0;
    for (let i = 0; i < d1.length; i += 4) {
      let px = 0;
      for (let k = 0; k < 3; k++) px = Math.max(px, Math.abs(d1[i + k] - d2[i + k]));
      sum += px; n++;
      if (px > 8) over8++;
      if (px > 32) over32++;
      if (px > max) max = px;
    }
    return { mean: sum / n, over8: (over8 / n) * 100, over32: (over32 / n) * 100, max };
  }, { x: readFileSync(join(a, f)).toString('base64'), y: readFileSync(join(b, f)).toString('base64') });
  rows.push({ f, ...r });
}
rows.sort((p, q) => q.mean - p.mean);
console.log('worst frames by mean per-pixel difference:');
for (const r of rows.slice(0, 8)) {
  console.log(`  ${r.f.padEnd(22)} mean ${r.mean.toFixed(2)}  >8: ${r.over8.toFixed(2)}%  >32: ${r.over32.toFixed(2)}%  max ${r.max}`);
}
const mean = rows.reduce((s, r) => s + r.mean, 0) / rows.length;
const o8 = rows.reduce((s, r) => s + r.over8, 0) / rows.length;
const o32 = rows.reduce((s, r) => s + r.over32, 0) / rows.length;
console.log(`\nacross ${rows.length} frames: mean ${mean.toFixed(2)}/255, ${o8.toFixed(2)}% of pixels differ by >8, ${o32.toFixed(2)}% by >32`);
await browser.close();
