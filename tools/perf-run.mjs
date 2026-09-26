// Performance run on a simulated weak laptop (docs/PERF_AUDIT.md): CPU throttled, network
// throttled with a cold cache, 1366x768 at device pixel ratio 1. Measures what a judge would feel:
// time to the title and to first play, bytes downloaded, frame times and hitches per scene, long
// main-thread tasks, draw calls, and heap across a loop through every level and back.
//
//   npx vite preview   (in another terminal)
//   node tools/perf-run.mjs <label> [baseUrl] [--cpu=6] [--mbps=10] [--tier=low|medium|high|auto] [--levels=kethra,vessek]
//
// Writes docs/perf/<label>/results.json and prints a summary. The GPU is whatever this machine has
// (headless Chromium uses the real GPU through ANGLE): CPU and network are what's simulated.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (name, d) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? d;
const [LABEL = 'run', BASE = 'http://localhost:4173/kethra-adventure/'] = args.filter((a) => !a.startsWith('--'));
const CPU = Number(opt('cpu', 6));
const MBPS = Number(opt('mbps', 10));
const TIER = opt('tier', 'auto');
const LEVELS = opt('levels', 'kethra,vessek').split(',').filter(Boolean);
const OUT = `docs/perf/${LABEL}`;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  // --expose-gc lets each heap reading follow a full garbage collection, so heap numbers show what
  // is actually kept alive rather than whenever the collector last happened to run.
  args: ['--use-gl=angle', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--enable-precise-memory-info', '--js-flags=--expose-gc'],
});
const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('Network.enable');
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
if (MBPS > 0) {
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 40,
    downloadThroughput: (MBPS * 1e6) / 8,
    uploadThroughput: (5 * 1e6) / 8,
  });
}
if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });

let bytes = 0;
const byType = {};
const bigAssets = [];
const urls = new Map();
cdp.on('Network.responseReceived', (e) => urls.set(e.requestId, { url: e.response.url, type: e.type }));
cdp.on('Network.loadingFinished', (e) => {
  bytes += e.encodedDataLength;
  const info = urls.get(e.requestId);
  if (info) {
    byType[info.type] = (byType[info.type] ?? 0) + e.encodedDataLength;
    bigAssets.push({ url: info.url.replace(BASE, ''), bytes: e.encodedDataLength });
  }
});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

// Long tasks, collected for the whole session and bucketed by phase.
await page.addInitScript(() => {
  window.__longTasks = [];
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__longTasks.push({ t: e.startTime, d: e.duration });
    }).observe({ type: 'longtask', buffered: true });
  } catch {}
});

const results = { label: LABEL, cpuThrottle: CPU, networkMbps: MBPS, tier: TIER, viewport: '1366x768@1x', load: {}, scenes: {}, heap: {} };
const mb = (b) => +(b / 1048576).toFixed(2);
const waitScene = (k, timeout = 600000) => page.waitForFunction((k) => window.__DEBUG__?.engine.getCurrentScene()?.kind === k, k, { timeout, polling: 500 });

/** Frame deltas over `seconds` of real play: the camera pans slowly, as a player looking around. */
async function sampleFrames(seconds) {
  return page.evaluate(async (seconds) => {
    const engine = window.__DEBUG__.engine;
    const scene = engine.getCurrentScene();
    const deltas = [];
    let last = performance.now();
    const start = last;
    const info = engine.renderer.info;
    // The post-processing chain renders several passes per frame and three.js resets its counters
    // on every render() call by default, which would report only the last pass. Count whole frames.
    info.autoReset = false;
    info.reset();
    let calls = 0;
    let tris = 0;
    let frames = 0;
    await new Promise((resolve) => {
      const tick = (now) => {
        deltas.push(now - last);
        last = now;
        if (scene?.player) scene.player.yaw += 0.004;
        calls += info.render.calls;
        tris += info.render.triangles;
        info.reset();
        frames++;
        if (now - start < seconds * 1000) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    info.autoReset = true;
    window.gc?.();
    deltas.shift();
    const sorted = [...deltas].sort((a, b) => a - b);
    const q = (p) => +sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))].toFixed(1);
    return {
      frames: deltas.length,
      fps: +(1000 / (deltas.reduce((a, b) => a + b, 0) / deltas.length)).toFixed(1),
      p50: q(0.5),
      p95: q(0.95),
      p99: q(0.99),
      max: +sorted[sorted.length - 1].toFixed(1),
      hitchesOver50ms: deltas.filter((d) => d > 50).length,
      drawCallsPerFrame: Math.round(calls / frames),
      trianglesPerFrame: Math.round(tris / frames),
      tier: engine.getQualityTier(),
      benchmarkMs: engine.lastBenchmarkMs ?? null,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
    };
  }, seconds);
}
async function longTasksSince(t) {
  return page.evaluate((t) => {
    const list = window.__longTasks.filter((x) => x.t >= t).map((x) => x.d).sort((a, b) => b - a);
    return { count: list.length, totalMs: Math.round(list.reduce((a, b) => a + b, 0)), top: list.slice(0, 10).map((d) => Math.round(d)) };
  }, t);
}
const now = () => page.evaluate(() => performance.now());

// Title: the first thing a judge sees.
const t0 = Date.now();
const tierQuery = TIER === 'auto' ? '' : `?tier=${TIER}`;
await page.goto(BASE + tierQuery, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.title-btn', { timeout: 600000 });
results.load.titleVisibleMs = Date.now() - t0;
results.load.titleBytesMB = mb(bytes);

// New game: loading (real progress), then the intro's first frame, which is the first thing the
// player can act on (it's skippable), then the ship.
await page.getByRole('button', { name: 'New game' }).click();
const tNew = Date.now();
await waitScene('IntroScene');
await page.waitForFunction(() => !document.querySelector('.loading-indicator.visible'), undefined, { timeout: 600000, polling: 250 });
results.load.introPlayableMs = Date.now() - t0;
results.load.introFromNewGameMs = Date.now() - tNew;
results.load.introBytesMB = mb(bytes);
await page.waitForTimeout(3000);
let mark = await now();
results.scenes.intro = await sampleFrames(6);
results.scenes.intro.longTasks = await longTasksSince(mark);
await page.keyboard.press('Space');
await waitScene('ShipInteriorScene');
results.load.shipPlayableMs = Date.now() - t0;
await page.waitForTimeout(4000);
mark = await now();
results.scenes.ship = await sampleFrames(8);
results.scenes.ship.longTasks = await longTasksSince(mark);
results.heap.afterFirstShipMB = results.scenes.ship.heapMB;

// Every level, and back to the ship after each: the heap should come back, not climb.
await page.evaluate(() => {
  const g = window.__DEBUG__.gameState;
  for (const f of ['tutorial_battle_complete', 'galaxy_revealed', 'logs_available', 'damage_assessed', 'kethra_mechanism_solved']) g.setFlag(f);
  for (const p of ['kethra', 'vessek']) if (!g.data.planetsUnlocked.includes(p)) g.data.planetsUnlocked.push(p);
  window.__DEBUG__.flow.tutorial?.skip?.();
});
const loops = [];
for (let loop = 0; loop < 2; loop++) {
for (const level of LEVELS) {
  const kind = level === 'kethra' ? 'KethraScene' : 'VessekScene';
  const tt = Date.now();
  mark = await now();
  await page.evaluate((l) => window.__DEBUG__.flow.travelToPlanet(l), level);
  await waitScene(kind);
  await page.waitForTimeout(500);
  // First visits are what a judge sees; second visits only check for leaks.
  if (loop === 0) {
    results.load[`${level}TransitionMs`] = Date.now() - tt;
    results.scenes[`${level}Load`] = { longTasks: await longTasksSince(mark) };
    await page.waitForTimeout(4000);
    mark = await now();
    results.scenes[level] = await sampleFrames(8);
    results.scenes[level].longTasks = await longTasksSince(mark);
  }
  await page.evaluate(() => window.__DEBUG__?.engine.getCurrentScene().onDepart?.());
  await waitScene('ShipInteriorScene');
  await page.waitForTimeout(3000);
}
loops.push((await sampleFrames(2)).heapMB);
}
await page.evaluate(() => window.gc?.());
const back = await sampleFrames(3);
results.heap.afterLoopMB = back.heapMB;
results.heap.growthPct = results.heap.afterFirstShipMB ? +(((back.heapMB - results.heap.afterFirstShipMB) / results.heap.afterFirstShipMB) * 100).toFixed(1) : null;
// The first loop fills the kit and texture caches on purpose (a second visit is instant). Leaks show
// as growth between the end of loop 1 and the end of loop 2.
results.heap.afterEachLoopMB = loops;
results.heap.loopToLoopGrowthPct = loops.length === 2 ? +(((loops[1] - loops[0]) / loops[0]) * 100).toFixed(1) : null;

results.bytes = { totalMB: mb(bytes), byTypeMB: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, mb(v)])) };
results.largestAssets = bigAssets.sort((a, b) => b.bytes - a.bytes).slice(0, 12).map((a) => ({ ...a, bytes: undefined, MB: mb(a.bytes) }));
results.consoleErrors = [...new Set(errors)];
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));

console.log(`\n${LABEL}: CPU ${CPU}x, ${MBPS || 'unthrottled'} Mbps, tier ${TIER}`);
console.log(`title ${results.load.titleVisibleMs} ms (${results.load.titleBytesMB} MB), intro playable ${results.load.introPlayableMs} ms, ship ${results.load.shipPlayableMs} ms, total ${results.bytes.totalMB} MB`);
for (const [k, v] of Object.entries(results.scenes)) {
  if (v.fps) console.log(`${k.padEnd(8)} ${String(v.fps).padStart(5)} fps  p50 ${v.p50}  p95 ${v.p95}  max ${v.max}  hitches>50ms ${v.hitchesOver50ms}  calls ${v.drawCallsPerFrame}  tier ${v.tier}  heap ${v.heapMB} MB  longtasks ${v.longTasks.count}`);
}
console.log(`heap after first ship ${results.heap.afterFirstShipMB} MB, after loops ${loops.join(' -> ')} MB (loop-to-loop ${results.heap.loopToLoopGrowthPct}%)`);
console.log(`console errors: ${results.consoleErrors.length}`);
await browser.close();
