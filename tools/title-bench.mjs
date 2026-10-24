// The title screen, measured the way a judge meets it: installed Chrome on this machine's real GPU, a
// brand-new browser profile per run (no HTTP cache, no compiled-shader cache), the title left to idle,
// then one button.
//
//   npx vite preview --port 4190 --strictPort   (in another terminal)
//   node tools/title-bench.mjs <label> [baseUrl] [--runs=3] [--idle=8] [--path=new|continue|none]
//        [--w=1366] [--h=768] [--headed]
//
// Per run: first paint, the title's buttons, the 3D backdrop's first frame (the 'title:backdrop' mark,
// where a build has it), every requestAnimationFrame interval while the title idles (median, p95, share
// over 20 ms and 50 ms), long tasks, JS heap, a screenshot at the end of the idle, then the time from
// the click to the next scene being on screen ('intro:uncovered' or 'ship:playable').
// --path=continue first makes a save in the same profile and reloads, as a returning player would.
// Writes docs/perf/<label>/title.json and title-<run>.png.
import { chromium } from 'playwright';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CHROME_ARGS } from './lib/probe.mjs';

const args = process.argv.slice(2);
const opt = (name, d) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? d;
const [LABEL = 'title', BASE = 'http://localhost:4190/kethra-adventure/'] = args.filter((a) => !a.startsWith('--'));
const RUNS = Number(opt('runs', 3));
const IDLE = Number(opt('idle', 8));
const PATH = opt('path', 'new');
const W = Number(opt('w', 1366));
const H = Number(opt('h', 768));
const OUT = `docs/perf/${LABEL}`;
mkdirSync(OUT, { recursive: true });

function probe() {
  const prof = (window.__title = { frames: [], long: [] });
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) prof.long.push([e.startTime, e.duration]);
    }).observe({ type: 'longtask', buffered: true });
  } catch {}
  let last = performance.now();
  const tick = (now) => {
    prof.frames.push([now, now - last]);
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  new MutationObserver(() => {
    if (!prof.buttons && document.querySelector('.title-btn')) prof.buttons = performance.now();
  }).observe(document, { subtree: true, childList: true });
}

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);

async function run(i) {
  const dir = mkdtempSync(join(tmpdir(), 'kethra-title-'));
  const context = await chromium.launchPersistentContext(dir, { headless: !args.includes('--headed'), args: CHROME_ARGS, viewport: { width: W, height: H } });
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    if (PATH === 'continue') {
      await page.goto(`${BASE}?newGame=1&skipIntro=1`);
      await page.waitForFunction(() => window.__DEBUG__?.gameState, null, { timeout: 120000 });
      await page.evaluate(() => localStorage.setItem('kethra_save_v1', window.__DEBUG__.gameState.toJSON()));
    }
    await page.addInitScript(probe);
    await page.goto(BASE);
    await page.waitForSelector('.title-btn', { timeout: 60000 });
    await page.waitForTimeout(IDLE * 1000);
    await page.screenshot({ path: `${OUT}/title-${i}.png` });
    const idle = await page.evaluate(() => {
      const p = window.__title;
      const mark = (n) => performance.getEntriesByName(n)[0]?.startTime ?? null;
      const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null;
      return { p, fcp, shown: mark('title:shown'), backdrop: mark('title:backdrop'), heap: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null, gpu: (() => {
        try {
          const gl = document.createElement('canvas').getContext('webgl2');
          const ext = gl.getExtension('WEBGL_debug_renderer_info');
          return gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
        } catch { return null; }
      })() };
    });
    // Judge the frames from 3 s after the buttons on, once the reveal has had its start.
    const from = (idle.p.buttons ?? 0) + 3000;
    const dts = idle.p.frames.filter(([t]) => t > from).map(([, dt]) => dt).sort((a, b) => a - b);
    const long = idle.p.long.filter(([t]) => t < from + IDLE * 1000);
    const result = {
      run: i,
      gpu: idle.gpu,
      fcpMs: r1(idle.fcp),
      buttonsMs: r1(idle.p.buttons),
      backdropMs: r1(idle.backdrop),
      idleFrames: dts.length,
      fpsMedian: dts.length ? r1(1000 / pct(dts, 0.5)) : null,
      p95Ms: r1(pct(dts, 0.95)),
      over20: dts.length ? r1((100 * dts.filter((d) => d > 20).length) / dts.length) : null,
      over50: dts.filter((d) => d > 50).length,
      longTaskMs: r1(long.reduce((a, [, d]) => a + d, 0)),
      longestTaskMs: r1(Math.max(0, ...long.map(([, d]) => d))),
      heapMb: r1(idle.heap),
      errors,
    };
    if (PATH !== 'none') {
      const label = PATH === 'continue' ? /continue/i : /new game/i;
      const target = PATH === 'continue' ? 'ship:playable' : 'intro:uncovered';
      const t0 = await page.evaluate(() => performance.now());
      await page.locator('.title-btn', { hasText: label }).first().click();
      await page.waitForFunction((n) => performance.getEntriesByName(n).length > 0, target, { timeout: 180000 });
      result.clickToSceneMs = r1((await page.evaluate((n) => performance.getEntriesByName(n)[0].startTime, target)) - t0);
    }
    return result;
  } finally {
    await context.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

const results = [];
for (let i = 0; i < RUNS; i++) {
  const r = await run(i);
  results.push(r);
  console.log(JSON.stringify(r));
}
const med = (k) => {
  const v = results.map((r) => r[k]).filter((x) => typeof x === 'number').sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : null;
};
const summary = Object.fromEntries(['fcpMs', 'buttonsMs', 'backdropMs', 'fpsMedian', 'p95Ms', 'over20', 'over50', 'longTaskMs', 'longestTaskMs', 'heapMb', 'clickToSceneMs'].map((k) => [k, med(k)]));
console.log('median', JSON.stringify(summary));
writeFileSync(`${OUT}/title.json`, JSON.stringify({ label: LABEL, base: BASE, path: PATH, viewport: [W, H], idle: IDLE, summary, results }, null, 2));
