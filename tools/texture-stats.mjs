// Decodes every PNG in a directory and reports what is actually in it: dimensions, per-channel mean
// and standard deviation, and whether the alpha channel carries information. Used to decide, per
// file, whether it can be re-encoded as JPEG (and at what quality) without losing anything that
// matters — normal and ORM maps are linear data, not colour, so that decision cannot be made by
// looking at file sizes alone.
// Usage: node tools/texture-stats.mjs <dir>
import { chromium } from 'playwright';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] || 'public/models/quaternius/Textures';
const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.png'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 64, height: 64 } });
await page.goto('about:blank');

const rows = [];
for (const f of files) {
  const b64 = readFileSync(join(dir, f)).toString('base64');
  const stat = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const n = d.length / 4;
    const sum = [0, 0, 0, 0], sq = [0, 0, 0, 0];
    let alphaMin = 255;
    for (let i = 0; i < d.length; i += 4) {
      for (let k = 0; k < 4; k++) { const v = d[i + k]; sum[k] += v; sq[k] += v * v; }
      if (d[i + 3] < alphaMin) alphaMin = d[i + 3];
    }
    const mean = sum.map((s) => s / n);
    const sd = sq.map((s, k) => Math.sqrt(Math.max(0, s / n - mean[k] * mean[k])));
    return { w: c.width, h: c.height, mean, sd, alphaMin };
  }, b64);
  rows.push({ f, ...stat, bytes: readFileSync(join(dir, f)).length });
}
rows.sort((a, b) => b.bytes - a.bytes);
console.log('file                                  size    dims        mean R/G/B       sd R/G/B        alpha');
for (const r of rows) {
  const m = r.mean.slice(0, 3).map((v) => v.toFixed(0).padStart(3)).join('/');
  const s = r.sd.slice(0, 3).map((v) => v.toFixed(1).padStart(5)).join('/');
  const a = r.alphaMin === 255 ? 'opaque' : `USED (min ${r.alphaMin})`;
  console.log(`${r.f.padEnd(36)} ${(r.bytes / 1048576).toFixed(2)}MB  ${String(r.w) + 'x' + r.h}`.padEnd(60) + ` ${m}  ${s}  ${a}`);
}
await browser.close();
