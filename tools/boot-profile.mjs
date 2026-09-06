// Measures what a cold boot actually costs: wall-clock to the loading spinner disappearing, main
// thread blocking time (the browser's own long-task observer), bytes over the wire, and the GPU
// shader-program count the first scene ends up compiling.
//
// Absolute numbers are inflated by the software rasteriser this environment uses, so read them as
// a before/after comparison against an identical run, not as real-device timings.
//
// Usage: node tools/boot-profile.mjs [--prod]
import { chromium } from 'playwright';

const prod = process.argv.includes('--prod');
const baseUrl = process.env.BASE_URL || (prod ? 'http://localhost:5181/kethra-adventure/' : 'http://localhost:5180/kethra-adventure/');

const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

// Long tasks are the browser's own measure of "the main thread was blocked and could not paint".
await page.addInitScript(() => {
  window.__LONG__ = [];
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) window.__LONG__.push({ start: e.startTime, dur: e.duration });
  }).observe({ entryTypes: ['longtask'] });
});

const bytes = new Map();
page.on('response', async (r) => {
  try {
    const len = Number(r.headers()['content-length'] || 0) || (await r.body()).length;
    const u = new URL(r.url()).pathname;
    bytes.set(u, (bytes.get(u) || { n: 0, b: 0 }));
    bytes.get(u).n += 1;
    bytes.get(u).b = len;
  } catch { /* body already gone (redirects, aborted) */ }
});

const t0 = Date.now();
await page.goto(baseUrl + '?skipIntro=1&newGame=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => {
  const el = document.querySelector('.loading-indicator');
  return !!window.__DEBUG__?.engine?.getCurrentScene?.() && el && !el.classList.contains('visible');
}, undefined, { timeout: 180000 });
const wall = Date.now() - t0;
await page.waitForTimeout(1500);

const stats = await page.evaluate(() => {
  const r = window.__DEBUG__.engine.renderer;
  const long = window.__LONG__ || [];
  return {
    programs: r.info.programs?.length ?? -1,
    geometries: r.info.memory.geometries,
    textures: r.info.memory.textures,
    longCount: long.length,
    longMs: Math.round(long.reduce((s, e) => s + e.dur, 0)),
    checkShaderErrors: r.debug.checkShaderErrors,
  };
});

let total = 0, reqs = 0, dupes = 0;
const rows = [];
for (const [u, v] of bytes) { total += v.b * v.n; reqs += v.n; if (v.n > 1) dupes += v.n - 1; rows.push([u, v.n, v.b]); }
rows.sort((a, b) => b[1] * b[2] - a[1] * a[2]);

console.log(`${prod ? 'PROD ' : 'DEV  '} boot -> spinner hidden: ${wall} ms`);
console.log(`  main-thread blocking: ${stats.longMs} ms across ${stats.longCount} long tasks`);
console.log(`  shader programs: ${stats.programs}   geometries: ${stats.geometries}   textures: ${stats.textures}   checkShaderErrors: ${stats.checkShaderErrors}`);
console.log(`  network: ${(total / 1048576).toFixed(2)} MB over ${reqs} requests (${dupes} duplicate fetches)`);
console.log('  heaviest:');
for (const [u, n, b] of rows.slice(0, 10)) console.log(`    ${((n * b) / 1048576).toFixed(2)} MB  ${n > 1 ? `x${n}  ` : '     '}${u}`);
await browser.close();
