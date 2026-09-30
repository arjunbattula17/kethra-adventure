// Frame-cost benchmark on this machine's real GPU, per scene and per quality tier. perf-run.mjs
// measures what a judge feels (load times, bytes, vsync-capped frames); this one measures where each
// frame's time goes, so a change can be judged in milliseconds rather than in "still 60 fps".
//
//   npx vite preview   (in another terminal)
//   node tools/perf-frames.mjs <label> [baseUrl] [--tiers=low,medium,high] [--scenes=ship,kethra,vessek,reveal,intro]
//        [--cpu=1] [--seconds=6] [--passes=1] [--capped] [--headed] [--viewport=1366x768] [--dpr=1]
//
// --tiers=auto runs without pinning a tier, so the start-up benchmark, the runtime governor and the
// steady-30 cap all behave as they do for a player on Auto. Combine with --capped for what a player sees.
//
// Runs installed Chrome (channel 'chrome'), not Playwright's bundled Chromium, with vsync and the
// frame-rate limit off, so a frame's interval is the whole pipeline's real cost (CPU or GPU, whichever
// is slower) instead of being rounded up to 16.7 ms. Per frame it also records:
//   cpuMs  the JavaScript time of the scene's update plus the render call (draw-call submission)
//   gpuMs  the GPU time of the render, from EXT_disjoint_timer_query_webgl2 where the browser has it
// A frame whose interval is far above its cpuMs is GPU-bound. The camera turns one full circle over the
// sample window, so every scene is judged on every view from the spawn point, not whichever way it faced.
// --passes=2 turns the circle twice: the first pass includes anything paid on first sight (texture
// uploads, late shader work), the second is the steady state.
//
// Writes docs/perf/<label>/frames.json and prints a table.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (name, d) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? d;
const flag = (name) => args.includes(`--${name}`);
const [LABEL = 'frames', BASE = 'http://localhost:4190/kethra-adventure/'] = args.filter((a) => !a.startsWith('--'));
const TIERS = opt('tiers', 'low,medium,high').split(',');
// Extra query parameters for every page, e.g. --query=seed=7 (A/B flags while testing).
const EXTRA_QUERY = opt('query', '') ? `&${opt('query', '')}` : '';
const SCENES = opt('scenes', 'ship,kethra,vessek,reveal').split(',');
const CPU = Number(opt('cpu', 1));
const SECONDS = Number(opt('seconds', 6));
const [VW, VH] = opt('viewport', '1366x768').split('x').map(Number);
const DPR = Number(opt('dpr', 1));
const CAPPED = flag('capped');
const PASSES = Number(opt('passes', 1));
const OUT = `docs/perf/${LABEL}`;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  channel: 'chrome',
  headless: !flag('headed'),
  args: [
    '--use-angle=d3d11',
    '--enable-gpu',
    ...(CAPPED ? [] : ['--disable-gpu-vsync', '--disable-frame-rate-limit']),
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--enable-precise-memory-info',
    '--js-flags=--expose-gc',
  ],
});

const KIND = { ship: 'ShipInteriorScene', kethra: 'KethraScene', vessek: 'VessekScene', reveal: 'GalaxyRevealScene', intro: 'IntroScene' };
const results = { label: LABEL, cpuThrottle: CPU, viewport: `${VW}x${VH}@${DPR}`, capped: CAPPED, gpu: null, runs: [] };

/** Samples SECONDS of frames with the camera turning a full circle. Runs in the page. */
async function sample(page, seconds) {
  return page.evaluate(async (seconds) => {
    const engine = window.__DEBUG__.engine;
    const scene = engine.getCurrentScene();
    const gl = engine.renderer.getContext();
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const info = engine.renderer.info;
    info.autoReset = false;
    info.reset();

    // Wrap update and render. Everything is recorded per *drawn* frame, at the render call: the engine
    // can skip display refreshes (the steady-30 and low-battery caps), so requestAnimationFrame's own
    // rhythm is not the frame rate the player sees.
    const postFx = engine.postFx;
    const origRender = postFx.render.bind(postFx);
    const origUpdate = scene.update.bind(scene);
    let updateMs = 0;
    const pending = [];
    const gpuTimes = [];
    const drawTimes = [];
    const cpu = [];
    let calls = 0;
    let tris = 0;
    postFx.render = () => {
      let q = null;
      if (ext) {
        q = gl.createQuery();
        gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
      }
      const t = performance.now();
      drawTimes.push(t);
      origRender();
      cpu.push(updateMs + (performance.now() - t));
      updateMs = 0;
      if (q) {
        gl.endQuery(ext.TIME_ELAPSED_EXT);
        pending.push(q);
      }
      calls += info.render.calls;
      tris += info.render.triangles;
      info.reset();
    };
    scene.update = (dt, el) => {
      const t = performance.now();
      origUpdate(dt, el);
      updateMs += performance.now() - t;
    };
    const drainQueries = () => {
      while (pending.length) {
        const q = pending[0];
        if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
        if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) gpuTimes.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
        gl.deleteQuery(q);
        pending.shift();
      }
    };

    const player = scene.player;
    const yaw0 = player?.yaw ?? 0;
    const start = performance.now();
    await new Promise((resolve) => {
      const tick = (now) => {
        if (player) player.yaw = yaw0 + ((now - start) / (seconds * 1000)) * Math.PI * 2;
        if (ext) drainQueries();
        if (now - start < seconds * 1000) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    postFx.render = origRender;
    scene.update = origUpdate;
    info.autoReset = true;
    const drawn = drawTimes.length;
    const deltas = [];
    for (let i = 1; i < drawTimes.length; i++) deltas.push(drawTimes[i] - drawTimes[i - 1]);
    // The first entries straddle the wrap; drop them.
    deltas.splice(0, 2);
    cpu.splice(0, 3);
    const stats = (arr) => {
      if (!arr.length) return null;
      const s = [...arr].sort((a, b) => a - b);
      const q = (p) => +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(2);
      return { mean: +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2), p50: q(0.5), p95: q(0.95), p99: q(0.99), max: +s[s.length - 1].toFixed(2) };
    };
    return {
      frames: deltas.length,
      fps: +(1000 / (deltas.reduce((a, b) => a + b, 0) / deltas.length)).toFixed(1),
      frameMs: stats(deltas),
      cpuMs: stats(cpu),
      gpuMs: stats(gpuTimes.slice(2)),
      over34: deltas.filter((d) => d > 34).length,
      over50: deltas.filter((d) => d > 50).length,
      drawCalls: Math.round(calls / drawn),
      triangles: Math.round(tris / drawn),
      programs: info.programs?.length ?? null,
      textures: info.memory.textures,
      geometries: info.memory.geometries,
      tier: engine.getQualityTier(),
      pixelRatio: engine.renderer.getPixelRatio(),
      heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
    };
  }, seconds);
}

for (const tier of TIERS) {
  const tierQuery = (tier === 'auto' ? '' : `&tier=${tier}`) + EXTRA_QUERY;
  const context = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: DPR });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const cdp = await context.newCDPSession(page);
  // The galaxy reveal carries no `kind` in builds before 2026-09-27; smoke.mjs's shape test finds it there.
  const waitScene = (k) => page.waitForFunction((k) => { const s = window.__DEBUG__?.engine.getCurrentScene(); return (s?.kind === k || (k === 'GalaxyRevealScene' && !!s?.ship && !s.player)) && !document.querySelector('.loading-indicator.visible'); }, k, { timeout: 600000, polling: 250 });
  const settle = async () => {
    // Close any chapter card / toast-driven pause and let first-use work finish before sampling.
    await page.evaluate(() => window.__DEBUG__.engine.setPaused(false));
    // On Auto the runtime governor needs its 4 s grace plus a judging window before it acts.
    await page.waitForTimeout(tier === 'auto' ? 9000 : 3000);
  };
  const run = async (name) => {
    for (let pass = 1; pass <= PASSES; pass++) await runOnce(PASSES > 1 ? `${name}#${pass}` : name);
  };
  const runOnce = async (name) => {
    if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
    const r = await sample(page, SECONDS);
    if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    results.runs.push({ scene: name, tierRequested: tier, ...r });
    writeFileSync(`${OUT}/frames.json`, JSON.stringify(results, null, 2));
    const g = r.gpuMs ? `gpu p50 ${String(r.gpuMs.p50).padStart(6)} p95 ${String(r.gpuMs.p95).padStart(6)}` : 'gpu n/a';
    console.log(`${tier.padEnd(6)} ${name.padEnd(7)} ${String(r.fps).padStart(6)} fps | frame p50 ${String(r.frameMs.p50).padStart(6)} p95 ${String(r.frameMs.p95).padStart(6)} max ${String(r.frameMs.max).padStart(7)} | cpu p50 ${String(r.cpuMs.p50).padStart(6)} p95 ${String(r.cpuMs.p95).padStart(6)} | ${g} | calls ${String(r.drawCalls).padStart(4)} tris ${String(r.triangles).padStart(7)} progs ${r.programs} tex ${r.textures} | >34ms ${r.over34} >50ms ${r.over50}`);
  };

  const needsShip = SCENES.some((s) => s !== 'intro');
  if (SCENES.includes('intro')) {
    await page.goto(`${BASE}?newGame=1${tierQuery}`);
    await waitScene('IntroScene');
    if (!results.gpu) results.gpu = await page.evaluate(() => { const gl = window.__DEBUG__.engine.renderer.getContext(); const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); });
    await page.waitForTimeout(2000);
    await run('intro');
  }
  if (needsShip) {
    await page.goto(`${BASE}?skipIntro=1&unlockVessek=1&newGame=1${tierQuery}`);
    await waitScene('ShipInteriorScene');
    if (!results.gpu) results.gpu = await page.evaluate(() => { const gl = window.__DEBUG__.engine.renderer.getContext(); const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); });
    await page.evaluate(() => window.__DEBUG__.flow.tutorial?.skip?.());
    await settle();
    if (SCENES.includes('ship')) await run('ship');
    for (const level of ['kethra', 'vessek']) {
      if (!SCENES.includes(level)) continue;
      await page.evaluate((l) => window.__DEBUG__.flow.debugGo(l), level);
      await waitScene(KIND[level]);
      await settle();
      await run(level);
      await page.evaluate(() => window.__DEBUG__.engine.getCurrentScene().onDepart?.());
      await waitScene('ShipInteriorScene');
      await page.waitForTimeout(1000);
    }
    if (SCENES.includes('reveal')) {
      await page.evaluate(() => window.__DEBUG__.flow.debugGo('reveal'));
      await waitScene('GalaxyRevealScene');
      await settle();
      await run('reveal');
    }
  }
  results.runs.filter((r) => r.tierRequested === tier).forEach((r) => (r.consoleErrors = [...new Set(errors)]));
  if (errors.length) console.log(`  console errors (${tier}): ${[...new Set(errors)].slice(0, 5).join(' | ')}`);
  await context.close();
}

console.log(`GPU: ${results.gpu}`);
writeFileSync(`${OUT}/frames.json`, JSON.stringify(results, null, 2));
await browser.close();
