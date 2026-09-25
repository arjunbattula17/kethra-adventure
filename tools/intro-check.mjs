// Verifies the opening cinematic against its budget and its text rules (INTRO_DESIGN.md):
// frame times and long tasks, one exposition line on screen at a time, each line's on-screen time
// against 2.5 s + 0.35 s/word, screenshots at chosen beats, and (optionally) a skip mid-sequence.
//
//   npm run build && npx vite preview   (or npm run dev)
//   node tools/intro-check.mjs [--url=http://localhost:4173/kethra-adventure/] [--tier=low]
//        [--cpu=4] [--size=1920x1080] [--shots=1,6.8,13,19,23.5] [--out=renders/intro]
//        [--skip-at=9.2]
//
// The ship interior is built and first-drawn under the loading overlay before the intro's clock
// starts (GameFlow), so these numbers are the intro's own cost on the real boot path.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const arg = (name, d) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? d;
const URL = arg('url', 'http://localhost:4173/kethra-adventure/');
const tier = arg('tier', 'low');
const cpu = Number(arg('cpu', '1'));
const [w, h] = arg('size', '1920x1080').split('x').map(Number);
const shots = arg('shots', '').split(',').filter(Boolean).map(Number);
const out = arg('out', 'renders/intro');
const skipAt = arg('skip-at', null);
if (shots.length) mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: [`--window-size=${w + 16},${h + 140}`, '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
const page = await browser.newPage({ viewport: { width: w, height: h } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${URL}?newGame=1&tier=${tier}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__DEBUG__?.engine.getCurrentScene()?.kind === 'IntroScene', undefined, { timeout: 180000, polling: 100 });
if (cpu > 1) await (await page.context().newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: cpu });

await page.evaluate(() => {
  const e = window.__DEBUG__.engine;
  const L = (window.__intro = { frames: [], long: [], lines: {}, overlapAt: [], doneAt: null });
  const clock = () => e.getCurrentScene()?.elapsed ?? -1;
  new PerformanceObserver((l) => { for (const x of l.getEntries()) L.long.push([+clock().toFixed(2), Math.round(x.duration)]); }).observe({ type: 'longtask' });
  let last = performance.now();
  const tick = () => {
    const now = performance.now();
    const s = e.getCurrentScene();
    if (s?.kind === 'IntroScene' && s.elapsed > 0) {
      L.frames.push([s.elapsed, now - last]);
      const on = [...document.querySelectorAll('.intro-line.on')];
      if (on.length > 1) L.overlapAt.push(+s.elapsed.toFixed(2));
      on.forEach((el) => {
        const k = el.textContent;
        const r = (L.lines[k] ??= { from: now, to: now, words: k.trim().split(/\s+/).length });
        r.to = now;
      });
    }
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  const s = e.getCurrentScene();
  const orig = s.onDone;
  s.onDone = () => { L.doneAt = +s.elapsed.toFixed(2); orig?.(); };
});

const clock = () => page.evaluate(() => { const s = window.__DEBUG__.engine.getCurrentScene(); return s?.kind === 'IntroScene' ? s.elapsed : -1; });
const waitClock = async (target) => { for (;;) { const c = await clock(); if (c < 0 || c >= target) return c; await page.waitForTimeout(30); } };
for (const at of shots) {
  if ((await waitClock(at)) < 0) break;
  await page.screenshot({ path: `${out}/t${String(at).replace('.', '_')}.png` });
}
let skipMs = null;
if (skipAt) {
  await waitClock(Number(skipAt));
  const t0 = Date.now();
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__intro.doneAt !== null, undefined, { timeout: 5000 });
  skipMs = Date.now() - t0;
  await page.waitForTimeout(1500);
} else {
  await page.waitForFunction(() => window.__intro.doneAt !== null, undefined, { timeout: 180000, polling: 250 });
}
const r = await page.evaluate(() => window.__intro);
const dts = r.frames.map((f) => f[1]).slice(2).sort((a, b) => a - b);
const pct = (q) => +dts[Math.min(dts.length - 1, Math.floor(dts.length * q))].toFixed(1);
const lines = Object.entries(r.lines).map(([text, v]) => {
  const shown = (v.to - v.from) / 1000;
  const need = 2.5 + 0.35 * v.words;
  return { text, words: v.words, shownS: +shown.toFixed(2), requiredS: +need.toFixed(2), ok: v.words <= 12 && shown + 0.1 >= need };
});
console.log(JSON.stringify({
  tier, cpu, size: `${w}x${h}`,
  frames: dts.length, p50: pct(0.5), p95: pct(0.95), p99: pct(0.99), max: pct(1),
  over33: r.frames.filter((f) => f[1] > 33.4).map((f) => `${f[0].toFixed(1)}s:${Math.round(f[1])}ms`).slice(0, 12),
  longTasks: r.long.filter((x) => x[1] > 50),
  lines, totalWords: lines.reduce((s, l) => s + l.words, 0),
  twoLinesAtOnce: r.overlapAt.length, doneAt: r.doneAt, skipMs, errors: [...new Set(errors)].slice(0, 5),
}, null, 1));
await browser.close();
