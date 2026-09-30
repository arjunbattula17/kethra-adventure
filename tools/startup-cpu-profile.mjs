// Where the page's main thread spends New game -> intro, by function, per start-up span.
// Samples the JavaScript CPU profile (100 us) in installed Chrome on a fresh profile, then attributes
// each sample to the game's User Timing span it fell in (src/core/perfMarks.ts).
//
// Function names need an unminified build:
//   npx vite build --minify false --outDir <dir> && npx vite preview --outDir <dir> --port 4176
//   node tools/startup-cpu-profile.mjs [baseUrl] [--spans=ship:floor,ship:walls,...] [--top=15]
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const opt = (name, d) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? d;
const [BASE = 'http://localhost:4176/kethra-adventure/'] = args.filter((a) => !a.startsWith('--'));
const TOP = Number(opt('top', 15));
const UNTIL = opt('until', 'intro:uncovered');

const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--use-angle=d3d11', '--enable-gpu', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
if (args.includes('--title')) {
  // Profile the title screen from the first byte: boot, the engine, and whatever runs while it waits.
  await cdp.send('Profiler.start');
  await page.goto(BASE);
  await page.waitForSelector('.title-btn');
  await page.waitForTimeout(4000);
} else {
  await page.goto(BASE);
  await page.waitForSelector('.title-btn');
  await page.waitForTimeout(1000);
  await cdp.send('Profiler.start');
  await page.getByRole('button', { name: /New game/ }).click();
  await page.waitForFunction((m) => performance.getEntriesByName(m).length > 0, UNTIL, { timeout: 600000, polling: 200 });
}
const nowAtStop = await page.evaluate(() => performance.now());
const { profile } = await cdp.send('Profiler.stop');
const spans = await page.evaluate(() => performance.getEntriesByType('measure').map((m) => [m.name, m.startTime, m.startTime + m.duration]));
await browser.close();

// Profile timestamps are monotonic microseconds; User Timing is ms since the page's time origin.
// Anchor the two at the moment profiling stopped (a few ms of IPC error, fine for spans this long).
const offset = profile.endTime / 1000 - nowAtStop;
const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const label = (n) => {
  const f = n.callFrame;
  const file = f.url ? f.url.split('/').pop() : '';
  return `${f.functionName || '(anonymous)'} ${file}:${f.lineNumber + 1}`;
};
let t = profile.startTime;
const samples = [];
for (let i = 0; i < profile.samples.length; i++) {
  t += profile.timeDeltas[i];
  samples.push([t / 1000 - offset, profile.samples[i], profile.timeDeltas[i + 1] ?? 0]);
}
const wanted = opt('spans', null)?.split(',');
const report = (name, a, b) => {
  const self = new Map();
  const total = new Map();
  let ms = 0;
  for (const [ts, id, dt] of samples) {
    if (ts < a || ts > b) continue;
    const d = dt / 1000;
    ms += d;
    const n = nodes.get(id);
    const k = label(n);
    self.set(k, (self.get(k) ?? 0) + d);
    // inclusive: walk up, count each distinct frame once
    const seen = new Set();
    for (let cur = id; cur !== undefined; cur = parent.get(cur)) {
      const kk = label(nodes.get(cur));
      if (seen.has(kk)) continue;
      seen.add(kk);
      total.set(kk, (total.get(kk) ?? 0) + d);
    }
  }
  console.log(`\n== ${name}: ${Math.round(b - a)} ms wall, ${Math.round(ms)} ms sampled`);
  console.log('  self:');
  for (const [k, v] of [...self].sort((x, y) => y[1] - x[1]).slice(0, TOP)) console.log(`   ${String(Math.round(v)).padStart(6)}  ${k}`);
  console.log('  inclusive:');
  for (const [k, v] of [...total].sort((x, y) => y[1] - x[1]).filter(([k]) => !/^\(root\)|^\(program\)/.test(k)).slice(0, TOP)) console.log(`   ${String(Math.round(v)).padStart(6)}  ${k}`);
};
for (const [name, a, b] of spans) {
  if (wanted && !wanted.includes(name)) continue;
  if (b - a < 150) continue;
  report(name, a, b);
}
