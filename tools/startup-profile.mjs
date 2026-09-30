// Start-up timeline, measured the way a judge meets the game: installed Chrome on this machine's
// real GPU, a brand-new browser profile per run (no HTTP cache, no compiled-shader cache), the title
// screen, New game, the intro, and the hand-over to the Wren.
//
//   npx vite preview   (in another terminal)
//   node tools/startup-profile.mjs <label> [baseUrl] [--runs=1] [--cold-gpu] [--visits=1] [--mbps=0]
//        [--skip-at=<intro seconds>] [--title-idle=3] [--ship-seconds=5] [--headless] [--path=new|continue]
//
// --cold-gpu   also defeats the graphics driver's own shader cache, which a fresh browser profile does
//              not reach (Intel keeps one per user, outside the browser). Every shader gets a harmless
//              per-run term appended (a step() on the fragment position scaled by 1e-20), so its compiled
//              code is new to the driver. Nothing on the machine is deleted.
// --visits=2   a second visit in the same profile: what a returning player (or a judge's second try) sees.
// --skip-at=N  press Space N seconds into the intro, as an impatient player would.
//
// Reads the game's own User Timing spans (src/core/perfMarks.ts), long tasks, and every
// requestAnimationFrame interval, and reports each phase's wall time and smoothness.
// Writes docs/perf/<label>/startup.json.
import { chromium } from 'playwright';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, d) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? d;
const flag = (name) => args.includes(`--${name}`);
const [LABEL = 'startup', BASE = 'http://localhost:4173/kethra-adventure/'] = args.filter((a) => !a.startsWith('--'));
const RUNS = Number(opt('runs', 1));
const VISITS = Number(opt('visits', 1));
const MBPS = Number(opt('mbps', 0));
const SKIP_AT = opt('skip-at', null);
const TITLE_IDLE = Number(opt('title-idle', 3));
const SHIP_SECONDS = Number(opt('ship-seconds', 5));
const PATH = opt('path', 'new');
const COLD_GPU = flag('cold-gpu');
// Experiment: every 2D canvas CPU-backed (willReadFrequently), to measure GPU canvas readback cost.
const CPU_CANVAS = flag('cpu-canvas');
const OUT = `docs/perf/${LABEL}`;
mkdirSync(OUT, { recursive: true });

/** Injected before the game's own scripts. */
function pageProbe([nonce, cpuCanvas]) {
  if (cpuCanvas) {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, opts) {
      return get.call(this, type, type === '2d' ? { ...(opts || {}), willReadFrequently: true } : opts);
    };
  }
  window.__prof = { long: [], frames: [] };
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__prof.long.push([e.startTime, e.duration]);
    }).observe({ type: 'longtask', buffered: true });
  } catch {}
  let last = performance.now();
  const tick = (now) => {
    window.__prof.frames.push([now, now - last]);
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  if (!nonce) return;
  const patch = (proto) => {
    const orig = proto.shaderSource;
    proto.shaderSource = function (shader, src) {
      const m = /void\s+main\s*\(\s*(?:void)?\s*\)\s*\{/.exec(src);
      if (!m) return orig.call(this, shader, src);
      const k = `${1000000 + nonce}.5`;
      let tail = null;
      if (/gl_Position\s*=/.test(src)) {
        tail = `void main() { kethra_nonce_main(); gl_Position.x += step(${k}, gl_Position.y) * 1e-20; }`;
      } else {
        const out = /#version\s+300\s+es/.test(src) ? /\bout\s+(?:highp\s+|mediump\s+|lowp\s+)?vec4\s+(\w+)\s*;/.exec(src)?.[1] : 'gl_FragColor';
        if (out) tail = `void main() { kethra_nonce_main(); ${out}.a += step(${k}, gl_FragCoord.x) * 1e-20; }`;
      }
      if (!tail) return orig.call(this, shader, src);
      return orig.call(this, shader, `${src.slice(0, m.index)}void kethra_nonce_main() {${src.slice(m.index + m[0].length)}\n${tail}\n`);
    };
  };
  patch(WebGL2RenderingContext.prototype);
  patch(WebGLRenderingContext.prototype);
}

function stats(frames) {
  if (!frames.length) return null;
  const d = frames.map((f) => f[1]).sort((a, b) => a - b);
  const q = (p) => +d[Math.min(d.length - 1, Math.floor(d.length * p))].toFixed(1);
  const total = frames.reduce((s, f) => s + f[1], 0);
  return {
    frames: d.length,
    fps: +((1000 * d.length) / total).toFixed(1),
    p50: q(0.5),
    p95: q(0.95),
    p99: q(0.99),
    max: +d[d.length - 1].toFixed(1),
    over50: d.filter((x) => x > 50).length,
    over100: d.filter((x) => x > 100).length,
    over250: d.filter((x) => x > 250).length,
  };
}
const longStats = (list) => ({
  count: list.length,
  totalMs: Math.round(list.reduce((s, x) => s + x[1], 0)),
  max: Math.round(list.reduce((m, x) => Math.max(m, x[1]), 0)),
  top: list.map((x) => Math.round(x[1])).sort((a, b) => b - a).slice(0, 8),
});

async function visit(context, runIndex, visitIndex) {
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  if (MBPS > 0) {
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: (MBPS * 1e6) / 8, uploadThroughput: (5 * 1e6) / 8 });
  }
  let bytes = 0;
  const bytesAt = [];
  cdp.on('Network.loadingFinished', (e) => {
    bytes += e.encodedDataLength;
  });
  const errors = [];
  page.on('crash', () => { errors.push('PAGE CRASHED'); console.log('   !! page crashed'); });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const nonce = COLD_GPU ? Math.floor(Math.random() * 1e6) : 0;
  await page.addInitScript(pageProbe, [nonce, CPU_CANVAS]);
  if (continueSave) await page.addInitScript((json) => { try { localStorage.setItem('kethra_save_v1', json); } catch {} }, continueSave);

  const out = { run: runIndex, visit: visitIndex, nonce, phases: {}, marks: {}, spans: {}, frames: {}, longTasks: {}, bytes: {} };
  const pnow = () => page.evaluate(() => performance.now());

  // --path=direct: the tools' ?skipIntro route, which builds the Wren straight behind the loading bar
  // (the same code path as Continue), for timing a scene's preparation on its own.
  if (PATH === 'direct') {
    await page.goto(`${BASE}?newGame=1&skipIntro=1`, { waitUntil: 'commit' });
    await page.waitForFunction(() => performance.getEntriesByName('ship:playable').length > 0, undefined, { timeout: 600000, polling: 100 });
    await page.waitForTimeout(SHIP_SECONDS * 1000);
    const d = await page.evaluate(() => ({ spans: performance.getEntriesByType('measure').map((m) => [m.name, Math.round(m.duration)]), playable: Math.round(performance.getEntriesByName('ship:playable')[0].startTime), programs: window.__DEBUG__.engine.renderer.info.programs.length, long: window.__prof.long.map((x) => Math.round(x[1])).sort((a, b) => b - a).slice(0, 6), gaps: (() => { const c = performance.getEntriesByName('ShipInteriorScene:compile')[0]; const f = window.__prof.frames.filter((x) => c && x[0] >= c.startTime && x[0] <= c.startTime + c.duration).map((x) => x[1]); return { frames: f.length, over50: f.filter((x) => x > 50).length, over100: f.filter((x) => x > 100).length, max: Math.round(Math.max(0, ...f)) }; })() }));
    await page.close();
    return { run: runIndex, visit: visitIndex, direct: d, phases: {}, frames: {}, longTasks: {}, spans: {}, errors: [...new Set(errors)] };
  }
  await page.goto(BASE, { waitUntil: 'commit' });
  await page.waitForSelector('.title-btn', { timeout: 120000 });
  const titleSeenAt = await pnow();
  out.bytes.title = +(bytes / 1048576).toFixed(2);
  await page.waitForTimeout(TITLE_IDLE * 1000);
  const idleEnd = await pnow();

  // What a judge clicks.
  const label = PATH === 'continue' ? /Continue/ : /New game/;
  await page.getByRole('button', { name: label }).first().click();
  if (PATH === 'continue') {
    await page.waitForFunction(() => performance.getEntriesByName('ship:playable').length > 0, undefined, { timeout: 600000, polling: 100 });
  } else {
    await page.waitForFunction(() => performance.getEntriesByName('intro:clock').length > 0, undefined, { timeout: 600000, polling: 100 });
    out.bytes.intro = +(bytes / 1048576).toFixed(2);
    if (SKIP_AT !== null) {
      await page.waitForFunction((s) => (window.__DEBUG__.engine.getCurrentScene()?.elapsed ?? 0) >= s, Number(SKIP_AT), { timeout: 120000, polling: 50 });
      await page.keyboard.press('Space');
    }
    await page.waitForFunction(() => performance.getEntriesByName('ship:playable').length > 0, undefined, { timeout: 600000, polling: 100 });
  }
  await page.waitForTimeout(SHIP_SECONDS * 1000);
  out.bytes.total = +(bytes / 1048576).toFixed(2);

  const dump = await page.evaluate(() => ({
    marks: performance.getEntriesByType('mark').map((m) => [m.name, m.startTime]),
    spans: performance.getEntriesByType('measure').map((m) => [m.name, m.startTime, m.duration]),
    paint: performance.getEntriesByType('paint').map((p) => [p.name, p.startTime]),
    nav: (() => { const n = performance.getEntriesByType('navigation')[0]; return n ? { responseEnd: n.responseEnd, dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd } : null; })(),
    frames: window.__prof.frames,
    long: window.__prof.long,
    tier: window.__DEBUG__?.engine.getQualityTier(),
    benchmarkMs: window.__DEBUG__?.engine.lastBenchmarkMs,
    programs: window.__DEBUG__?.engine.renderer.info.programs?.length,
    textures: window.__DEBUG__?.engine.renderer.info.memory.textures,
    geometries: window.__DEBUG__?.engine.renderer.info.memory.geometries,
    heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
  }));
  const at = (name) => dump.marks.find((m) => m[0] === name)?.[1] ?? null;
  for (const [name, t] of dump.marks) out.marks[name] = Math.round(t);
  for (const [name, start, dur] of dump.spans) {
    // A span can repeat (the ship is built again after a planet); keep the first and count repeats.
    if (!out.spans[name]) out.spans[name] = { at: Math.round(start), ms: Math.round(dur) };
  }
  out.paint = Object.fromEntries(dump.paint.map(([n, t]) => [n, Math.round(t)]));
  out.nav = dump.nav;
  out.tier = dump.tier;
  out.benchmarkMs = dump.benchmarkMs;
  out.programs = dump.programs;
  out.textures = dump.textures;
  out.geometries = dump.geometries;
  out.heapMB = dump.heapMB;

  const click = at(PATH === 'continue' ? 'title:continue' : 'title:newGame');
  const introClock = at('intro:clock');
  const introUncovered = at('intro:uncovered');
  const introDone = at('intro:done');
  const shipPlayable = at('ship:playable');
  out.phases = {
    titleShownMs: Math.round(at('title:shown') ?? titleSeenAt),
    titleSeenByHarnessMs: Math.round(titleSeenAt),
    clickToIntroUncoveredMs: introUncovered && click ? Math.round(introUncovered - click) : null,
    clickToIntroClockMs: introClock && click ? Math.round(introClock - click) : null,
    introDoneToShipPlayableMs: introDone && shipPlayable ? Math.round(shipPlayable - introDone) : null,
    clickToShipPlayableMs: shipPlayable && click ? Math.round(shipPlayable - click) : null,
  };
  const between = (list, a, b) => (a == null || b == null ? [] : list.filter((x) => x[0] >= a && x[0] < b));
  const windows = {
    boot: [0, titleSeenAt],
    titleIdle: [titleSeenAt, idleEnd],
    loading: [click, introUncovered ?? introClock ?? shipPlayable],
    introSettle: [introUncovered, introClock],
    intro: [introClock, introDone],
    handover: [introDone, shipPlayable],
    ship: [shipPlayable, shipPlayable == null ? null : shipPlayable + SHIP_SECONDS * 1000],
  };
  for (const [k, [a, b]] of Object.entries(windows)) {
    out.frames[k] = stats(between(dump.frames, a, b));
    out.longTasks[k] = longStats(between(dump.long, a, b));
  }
  // Raw events for tools/startup-gaps.mjs: every frame interval over 50 ms and every long task.
  out.gaps = dump.frames.filter((f) => f[1] > 50).map((f) => [Math.round(f[0]), Math.round(f[1])]);
  out.long = dump.long.map((x) => [Math.round(x[0]), Math.round(x[1])]);
  out.errors = [...new Set(errors)].slice(0, 8);
  await page.close();
  return out;
}

// --path=continue needs a save from after the opening. It is made in a separate, throwaway browser (so
// the measured profile stays cold) and written into the measured one before the page reads it.
let continueSave = null;
if (PATH === 'continue') {
  const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu'] });
  const pg = await b.newPage();
  await pg.goto(`${BASE}?newGame=1&skipIntro=1`);
  await pg.waitForFunction(() => performance.getEntriesByName('ship:playable').length > 0, undefined, { timeout: 600000 });
  continueSave = await pg.evaluate(() => window.__DEBUG__.gameState.toJSON());
  await b.close();
}

const results = { label: LABEL, base: BASE, coldGpu: COLD_GPU, mbps: MBPS, skipAt: SKIP_AT, path: PATH, runs: [] };
for (let r = 0; r < RUNS; r++) {
  const dir = mkdtempSync(join(tmpdir(), 'kethra-startup-'));
  const context = await chromium.launchPersistentContext(dir, {
    channel: 'chrome',
    headless: flag('headless'),
    viewport: { width: 1366, height: 768 },
    deviceScaleFactor: 1,
    args: ['--use-angle=d3d11', '--enable-gpu', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--enable-precise-memory-info'],
  });
  for (let v = 0; v < VISITS; v++) {
    const res = await visit(context, r, v);
    results.runs.push(res);
    if (res.direct) {
      const sp = Object.fromEntries(res.direct.spans);
      console.log(`run ${r} visit ${v}: ship playable at ${res.direct.playable} ms | init ${sp['ShipInteriorScene:init']} compile ${sp['ShipInteriorScene:compile']} upload ${sp['ShipInteriorScene:upload']} firstDraw ${sp['ShipInteriorScene:firstDraw']} | compile frames: >50ms ${res.direct.gaps.over50}, >100ms ${res.direct.gaps.over100}, max ${res.direct.gaps.max} | programs ${res.direct.programs} | longest tasks ${res.direct.long.join(' ')} | errors ${res.errors.length}`);
      continue;
    }
    const p = res.phases;
    const f = res.frames;
    console.log(`run ${r} visit ${v}: title ${p.titleShownMs} ms | New game -> intro uncovered ${p.clickToIntroUncoveredMs} ms, clock ${p.clickToIntroClockMs} ms | intro end -> ship ${p.introDoneToShipPlayableMs} ms | click -> ship ${p.clickToShipPlayableMs} ms | tier ${res.tier} | programs ${res.programs} | errors ${res.errors.length}`);
    for (const k of Object.keys(f)) {
      const s = f[k];
      const l = res.longTasks[k];
      if (s) console.log(`   ${k.padEnd(11)} ${String(s.fps).padStart(5)} fps  p95 ${String(s.p95).padStart(6)}  p99 ${String(s.p99).padStart(6)}  max ${String(s.max).padStart(7)}  >50 ${s.over50}  >100 ${s.over100}  >250 ${s.over250} | long tasks ${l.count} (${l.totalMs} ms, max ${l.max})`);
    }
    const spans = Object.entries(res.spans).sort((a, b) => a[1].at - b[1].at);
    console.log('   spans: ' + spans.map(([n, s]) => `${n} ${s.ms}`).join(' | '));
  }
  await context.close();
  rmSync(dir, { recursive: true, force: true });
}
writeFileSync(`${OUT}/startup.json`, JSON.stringify(results, null, 1));
console.log(`wrote ${OUT}/startup.json`);
