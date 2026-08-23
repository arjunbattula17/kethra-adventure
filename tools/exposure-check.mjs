// Objective value-structure meter: grades a render against the matching reference crop, so
// exposure and contrast are tuned against the bar's actual numbers rather than impressions.
//
//   node tools/exposure-check.mjs <piece> [morePieces...]      compare renders/latest vs reference
//   node tools/exposure-check.mjs --raw <png> [morePngs...]    just print one image's stats
//
// Every statistic is measured in perceived sRGB luma. "ours minus theirs" deltas are what to
// close; the verdict line flags any statistic outside its tolerance.
import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'node:fs';

const VIEWS = {
  lighting: 'hero',
  floor: 'floor',
  walls: 'wallLeft',
  ceiling: 'ceiling',
  console: 'console',
  displays: 'displays',
  airlock: 'airlock',
  props: 'props',
  starfieldWindow: 'window',
};

// How far from the reference each statistic may drift before it is called out.
const TOL = { median: 0.05, p95: 0.07, p05: 0.05, hot: 3.0, crushed: 6.0 };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 100, height: 100 } });
await page.goto('about:blank');

const measure = (file) =>
  page.evaluate(async (s) => {
    const img = new Image();
    img.src = s;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    const bins = new Uint32Array(256);
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      bins[(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) | 0]++;
      n++;
    }
    const pct = (from, to) => {
      let s2 = 0;
      for (let i = from; i <= to; i++) s2 += bins[i];
      return (s2 / n) * 100;
    };
    const q = (p) => {
      let acc = 0;
      for (let i = 0; i < 256; i++) {
        acc += bins[i];
        if (acc >= n * p) return i / 255;
      }
      return 1;
    };
    return { w: c.width, h: c.height, hot: pct(230, 255), crushed: pct(0, 5), p05: q(0.05), median: q(0.5), p95: q(0.95) };
  }, 'data:image/png;base64,' + readFileSync(file).toString('base64'));

const argv = process.argv.slice(2);

if (argv[0] === '--raw') {
  for (const f of argv.slice(1)) {
    const m = await measure(f);
    console.log(`\n${f} (${m.w}x${m.h})`);
    console.log(`  p05 ${m.p05.toFixed(3)}  median ${m.median.toFixed(3)}  p95 ${m.p95.toFixed(3)}  hot ${m.hot.toFixed(2)}%  crushed ${m.crushed.toFixed(2)}%`);
  }
} else {
  const pieces = argv.length ? argv : Object.keys(VIEWS);
  for (const piece of pieces) {
    const view = VIEWS[piece];
    if (!view) {
      console.error(`unknown piece "${piece}" — expected one of: ${Object.keys(VIEWS).join(', ')}`);
      continue;
    }
    const ourPath = `renders/latest/${view}.png`;
    const refPath = `reference/crops/${piece}.png`;
    if (!existsSync(ourPath) || !existsSync(refPath)) {
      console.error(`missing image for ${piece} (${ourPath} / ${refPath})`);
      continue;
    }
    const ours = await measure(ourPath);
    const ref = await measure(refPath);
    const rows = [
      ['p05     ', ours.p05, ref.p05, TOL.p05, 'shadow floor — too high means milky, washed-out blacks'],
      ['median  ', ours.median, ref.median, TOL.median, 'overall exposure'],
      ['p95     ', ours.p95, ref.p95, TOL.p95, 'highlight ceiling — too high reads as blown out'],
    ];
    console.log(`\n=== ${piece} ===  ours: ${ourPath}   reference: ${refPath}`);
    for (const [name, o, r, tol, why] of rows) {
      const d = o - r;
      const ok = Math.abs(d) <= tol;
      console.log(
        `  ${name} ours ${o.toFixed(3)}  ref ${r.toFixed(3)}  delta ${d >= 0 ? '+' : ''}${d.toFixed(3)}  ${ok ? 'ok  ' : 'MISS'}  ${ok ? '' : (d > 0 ? 'too bright: ' : 'too dark: ') + why}`,
      );
    }
    for (const [name, key, tol] of [['hot     ', 'hot', TOL.hot], ['crushed ', 'crushed', TOL.crushed]]) {
      const d = ours[key] - ref[key];
      const ok = Math.abs(d) <= tol;
      console.log(`  ${name} ours ${ours[key].toFixed(2)}%  ref ${ref[key].toFixed(2)}%  delta ${d >= 0 ? '+' : ''}${d.toFixed(2)}  ${ok ? 'ok' : 'MISS'}`);
    }
  }
}

await browser.close();
