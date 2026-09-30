// Start-up timeline, measured the way a judge meets the game: installed Chrome on this machine's real
// GPU, a brand-new browser profile per run (no HTTP cache, no compiled-shader cache), the title screen,
// New game, the intro, and the hand-over to the Wren.
//
//   npx vite preview --port 4190 --strictPort   (in another terminal)
//   node tools/startup-profile.mjs <label> [baseUrl] [--runs=1] [--cold-gpu] [--visits=1] [--mbps=0]
//        [--skip-at=<intro seconds>] [--title-idle=3] [--ship-seconds=5] [--headless] [--path=new|continue]
//        [--timeout=300]
//
// --cold-gpu   also defeats the graphics driver's own shader cache, which a fresh browser profile does
//              not reach (Intel keeps one per user, outside the browser). Every shader gets a harmless
//              per-run term appended (a step() on the fragment position scaled by 1e-20), so its compiled
//              code is new to the driver. Nothing on the machine is deleted.
// --visits=2   a second visit in the same profile: what a returning player (or a judge's second try) sees.
// --skip-at=N  press Space N seconds into the intro, as an impatient player would.
// --timeout=S  a milestone that doesn't arrive in S seconds is recorded as a stuck load (with the last
//              events and a screenshot) instead of hanging the run.
//
// Milestones come from the page itself: the title's buttons appearing, the click, the flow state
// (window.__DEBUG__.flow), which scene is current, the intro's clock starting and the loading overlay,
// plus the game's own User Timing marks and spans where a build has them. Frame intervals are every
// requestAnimationFrame interval; long tasks are the browser's own. Writes docs/perf/<label>/startup.json.
import { chromium } from 'playwright';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pageProbe, stats, longStats, CHROME_ARGS } from './lib/probe.mjs';

const args = process.argv.slice(2);
const opt = (name, d) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? d;
const flag = (name) => args.includes(`--${name}`);
const [LABEL = 'startup', BASE = 'http://localhost:4190/kethra-adventure/'] = args.filter((a) => !a.startsWith('--'));
const RUNS = Number(opt('runs', 1));
const VISITS = Number(opt('visits', 1));
const MBPS = Number(opt('mbps', 0));
const SKIP_AT = opt('skip-at', null);
const TITLE_IDLE = Number(opt('title-idle', 3));
const SHIP_SECONDS = Number(opt('ship-seconds', 5));
const PATH = opt('path', 'new');
const TIMEOUT = Number(opt('timeout', 300)) * 1000;
const COLD_GPU = flag('cold-gpu');
const OUT = `docs/perf/${LABEL}`;
mkdirSync(OUT, { recursive: true });


async function visit(context, runIndex, visitIndex) {
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  if (MBPS > 0) {
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: (MBPS * 1e6) / 8, uploadThroughput: (5 * 1e6) / 8 });
  }
  let bytes = 0;
  cdp.on('Network.loadingFinished', (e) => {
    bytes += e.encodedDataLength;
  });
  const errors = [];
  page.on('crash', () => {
    errors.push('PAGE CRASHED');
    console.log('   !! page crashed');
  });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const nonce = COLD_GPU ? Math.floor(Math.random() * 1e6) : 0;
  await page.addInitScript(pageProbe, [nonce]);
  if (continueSave) await page.addInitScript((json) => { try { localStorage.setItem('kethra_save_v1', json); } catch {} }, continueSave);

  const out = { run: runIndex, visit: visitIndex, nonce, phases: {}, events: {}, spans: {}, frames: {}, longTasks: {}, bytes: {}, stuck: null };
  const hasEvent = (name) => page.evaluate((n) => window.__prof.events.some((e) => e[0] === n) || performance.getEntriesByName(n).length > 0, name);
  const waitEvent = async (name, what) => {
    const until = Date.now() + TIMEOUT;
    while (Date.now() < until) {
      if (await hasEvent(name).catch(() => false)) return true;
      await new Promise((r) => setTimeout(r, 100));
    }
    out.stuck = { waitingFor: what ?? name, events: await page.evaluate(() => window.__prof.events.slice(-12).map(([n, t]) => `${Math.round(t)} ${n}`)).catch(() => ['(page unreachable)']) };
    await page.screenshot({ path: `${OUT}/stuck-run${runIndex}.png` }).catch(() => {});
    console.log(`   !! stuck waiting for ${what ?? name}: ${out.stuck.events.join(' | ')}`);
    return false;
  };

  await page.goto(BASE, { waitUntil: 'commit' });
  let ok = await waitEvent('title:shown', 'the title screen');
  out.bytes.title = +(bytes / 1048576).toFixed(2);
  if (ok) {
    await page.waitForTimeout(TITLE_IDLE * 1000);
    await page.locator('.title-btn', { hasText: PATH === 'continue' ? /continue/i : /new game/i }).first().click();
    if (PATH === 'new') {
      ok = await waitEvent('intro:clock', 'the intro to start');
      out.bytes.intro = +(bytes / 1048576).toFixed(2);
      if (ok && SKIP_AT !== null) {
        await page.waitForFunction((s) => (window.__DEBUG__.engine.getCurrentScene()?.elapsed ?? 0) >= s, Number(SKIP_AT), { timeout: 120000, polling: 50 });
        // HoldToSkip: a held key, not a tap.
        await page.keyboard.down('Space');
        await page.waitForTimeout(1500);
        await page.keyboard.up('Space');
      }
    }
    if (ok) ok = await waitEvent('ship:playable', 'the Wren to be playable');
    if (ok) await page.waitForTimeout(SHIP_SECONDS * 1000);
  }
  out.bytes.total = +(bytes / 1048576).toFixed(2);

  const dump = await page.evaluate(() => ({
    events: window.__prof.events,
    marks: performance.getEntriesByType('mark').map((m) => [m.name, m.startTime]),
    spans: [...performance.getEntriesByType('measure').map((m) => [m.name, m.startTime, m.duration]), ...(window.__prof.spans ?? [])],
    paint: performance.getEntriesByType('paint').map((p) => [p.name, p.startTime]),
    frames: window.__prof.frames,
    long: window.__prof.long,
    heap: window.__prof.heap,
    gl: window.__prof.gl,
    tier: window.__DEBUG__?.engine.getQualityTier(),
    benchmarkMs: window.__DEBUG__?.engine.lastBenchmarkMs,
    programs: window.__DEBUG__?.engine.renderer.info.programs?.length,
    textures: window.__DEBUG__?.engine.renderer.info.memory.textures,
    geometries: window.__DEBUG__?.engine.renderer.info.memory.geometries,
    gpu: (() => {
      try {
        const gl = window.__DEBUG__.engine.renderer.getContext();
        const i = gl.getExtension('WEBGL_debug_renderer_info');
        return String(gl.getParameter(i ? i.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
      } catch {
        return null;
      }
    })(),
  })).catch(() => null);
  if (!dump) {
    out.errors = [...new Set(errors)];
    await page.close().catch(() => {});
    return out;
  }
  // First occurrence of each event, plus the game's own marks.
  for (const [name, t] of [...dump.marks, ...dump.events]) if (out.events[name] == null) out.events[name] = Math.round(t);
  for (const [name, start, dur] of dump.spans) if (!out.spans[name]) out.spans[name] = { at: Math.round(start), ms: Math.round(dur) };
  out.allSpans = dump.spans.map(([n, s, d]) => [Math.round(s), Math.round(d), n]).sort((a, b) => a[0] - b[0]);
  out.timeline = dump.events.map(([n, t]) => [Math.round(t), n]);
  out.paint = Object.fromEntries(dump.paint.map(([n, t]) => [n, Math.round(t)]));
  Object.assign(out, { tier: dump.tier, benchmarkMs: dump.benchmarkMs, programs: dump.programs, textures: dump.textures, geometries: dump.geometries, gpu: dump.gpu });
  out.gl = dump.gl;
  out.heapMaxMB = dump.heap.reduce((m, h) => Math.max(m, h[1]), 0);
  out.heapEndMB = dump.heap.at(-1)?.[1] ?? null;

  const at = (name) => out.events[name] ?? null;
  const click = at(PATH === 'continue' ? 'click:continue' : 'click:new game');
  const introClock = at('intro:clock');
  const introScene = at('scene:intro');
  // The intro is done when the flow leaves it (the handover's transition begins).
  const introDone = dump.events.find(([n, t]) => introClock != null && t > introClock && n === 'state:intro*')?.[1] ?? null;
  const shipPlayable = at('ship:playable');
  out.phases = {
    titleShownMs: at('title:shown'),
    clickToIntroSceneMs: introScene && click ? introScene - click : null,
    clickToIntroClockMs: introClock && click ? introClock - click : null,
    introDoneToShipPlayableMs: introDone && shipPlayable ? Math.round(shipPlayable - introDone) : null,
    clickToShipPlayableMs: shipPlayable && click ? shipPlayable - click : null,
  };
  const between = (list, a, b) => (a == null || b == null ? [] : list.filter((x) => x[0] >= a && x[0] < b));
  const end = dump.frames.at(-1)?.[0] ?? null;
  const windows = {
    boot: [0, at('title:shown')],
    titleIdle: [at('title:shown'), click],
    loading: [click, introClock ?? shipPlayable ?? end],
    intro: [introClock, introDone ?? end],
    handover: [introDone, shipPlayable ?? end],
    ship: [shipPlayable, shipPlayable == null ? null : shipPlayable + SHIP_SECONDS * 1000],
  };
  for (const [k, [a, b]] of Object.entries(windows)) {
    out.frames[k] = stats(between(dump.frames, a, b));
    out.longTasks[k] = longStats(between(dump.long, a, b));
  }
  out.gaps = dump.frames.filter((f) => f[1] > 50).map((f) => [Math.round(f[0]), Math.round(f[1])]);
  out.long = dump.long.map((x) => [Math.round(x[0]), Math.round(x[1])]);
  out.errors = [...new Set(errors)].slice(0, 8);
  await page.close().catch(() => {});
  return out;
}

// --path=continue needs a save from after the opening. It is made in a separate, throwaway browser (so
// the measured profile stays cold) and written into the measured one before the page reads it.
let continueSave = null;
if (PATH === 'continue') {
  const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu'] });
  const pg = await b.newPage();
  await pg.goto(`${BASE}?newGame=1&skipIntro=1`);
  await pg.waitForFunction(() => window.__DEBUG__?.flow.state === 'wren' && !window.__DEBUG__.flow.isTransitioning(), undefined, { timeout: TIMEOUT });
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
    args: CHROME_ARGS,
  });
  for (let v = 0; v < VISITS; v++) {
    const res = await visit(context, r, v);
    results.runs.push(res);
    const p = res.phases;
    const f = res.frames;
    const s = (ms) => (ms == null ? '—' : `${(ms / 1000).toFixed(1)} s`);
    console.log(`run ${r} visit ${v}: title ${s(p.titleShownMs)} | click -> intro scene ${s(p.clickToIntroSceneMs)}, intro clock ${s(p.clickToIntroClockMs)} | intro end -> ship ${s(p.introDoneToShipPlayableMs)} | click -> ship ${s(p.clickToShipPlayableMs)} | tier ${res.tier} | programs ${res.programs} | heap max ${res.heapMaxMB} MB | ${res.stuck ? 'STUCK' : 'ok'} | errors ${res.errors?.length}`);
    for (const k of Object.keys(f)) {
      const st = f[k];
      const l = res.longTasks[k];
      if (st) console.log(`   ${k.padEnd(10)} ${String(st.fps).padStart(5)} fps  p95 ${String(st.p95).padStart(6)}  p99 ${String(st.p99).padStart(6)}  max ${String(st.max).padStart(7)}  >50 ${st.over50}  >100 ${st.over100}  >250 ${st.over250}  >1s ${st.over1000} | long tasks ${l.count} (${l.totalMs} ms, max ${l.max})`);
    }
    const spans = Object.entries(res.spans).sort((a, b) => a[1].at - b[1].at);
    if (spans.length) console.log('   spans: ' + spans.map(([n, sp]) => `${n} ${sp.ms}`).join(' | '));
    if (res.gl) {
      const w = res.gl.waits;
      console.log(`   programs linked ${res.gl.links.length} | blocked in compile-status waits ${Math.round(w.reduce((a, x) => a + x[1], 0))} ms over ${w.length} calls (max ${Math.max(0, ...w.map((x) => x[1]))} ms)`);
    }
    if (res.errors?.length) console.log('   errors: ' + res.errors.join(' || ').slice(0, 600));
  }
  await context.close();
  rmSync(dir, { recursive: true, force: true });
}
writeFileSync(`${OUT}/startup.json`, JSON.stringify(results, null, 1));
console.log(`wrote ${OUT}/startup.json`);
