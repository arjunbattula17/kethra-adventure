// JS CPU profile of a scene's steady-state frame loop, plus renderer statistics.
//
//   node tools/perf-profile.mjs <interior|kethra|reveal> [seconds] [baseUrl]
//
// Complements tools/frame-trace.mjs: frame-trace says HOW SLOW frames are, this says WHERE the
// main-thread time goes (top functions by self time, GC share) and how much the renderer draws
// (calls/triangles/programs). Sampling runs via the Chrome DevTools Protocol Profiler domain at
// 100us resolution, so it sees real function-level attribution, not guesses. GPU-side cost
// (SwiftShader rasterisation in the harness, real GPU on hardware) lives in another process and
// deliberately does NOT appear here — pair with frame-trace for whole-frame numbers.
import { chromium } from 'playwright';

const scene = process.argv[2] || 'interior';
const seconds = Number(process.argv[3] || '8');
const baseUrl = process.argv[4] || 'http://localhost:4173/kethra-adventure/';

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 200)));

await page.goto(baseUrl + '?skipIntro=1' + (scene === 'kethra' ? '&unlockKethra=1' : '&newGame=1'), { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__DEBUG__?.gameState, undefined, { timeout: 60000, polling: 500 });
// Boot-race guard: flow.start()'s setScene must resolve before anything else drives the flow.
await page.waitForFunction(() => !!window.__DEBUG__.engine.getCurrentScene(), undefined, { timeout: 120000, polling: 500 });

if (scene === 'kethra') {
  await page.evaluate(() => window.__DEBUG__.flow['travelToPlanet']?.('kethra'));
  await page.waitForFunction(() => window.__DEBUG__.engine.getCurrentScene()?.kind !== 'ShipInteriorScene', undefined, { timeout: 180000, polling: 500 });
  await page.waitForTimeout(3000);
} else if (scene === 'reveal') {
  await page.evaluate(() => window.__DEBUG__.flow['transitionToGalaxyReveal']?.());
  await page.waitForFunction(() => !!window.__DEBUG__.engine.getCurrentScene()?.ship, undefined, { timeout: 180000, polling: 500 });
  await page.waitForTimeout(1500);
} else {
  await page.waitForTimeout(1500);
}

const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
await cdp.send('Profiler.start');
await page.waitForTimeout(seconds * 1000);
const { profile } = await cdp.send('Profiler.stop');

const stats = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const e = window.__DEBUG__.engine;
      const info = e.renderer.info;
      // info.render auto-resets at the end of every render() call (and the composer issues
      // several per frame), so a read from outside the loop sees a near-zero remnant. Disable
      // auto-reset around exactly one full frame to get the real per-frame totals.
      info.autoReset = false;
      requestAnimationFrame(() => {
        info.reset();
        requestAnimationFrame(() => {
          const out = {
            scene: e.getCurrentScene()?.kind ?? e.getCurrentScene()?.constructor?.name,
            tier: e.getQualityTier(),
            pixelRatio: e.renderer.getPixelRatio(),
            drawCalls: info.render.calls,
            triangles: info.render.triangles,
            geometries: info.memory.geometries,
            textures: info.memory.textures,
            programs: info.programs?.length,
          };
          info.autoReset = true;
          resolve(out);
        });
      });
    }),
);
await browser.close();

// Attribute each sample's self time to its top-of-stack node.
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const selfMicros = new Map();
const total = profile.endTime - profile.startTime;
const deltas = profile.timeDeltas ?? [];
profile.samples?.forEach((id, i) => {
  selfMicros.set(id, (selfMicros.get(id) ?? 0) + (deltas[i] ?? 0));
});

const rows = [...selfMicros.entries()]
  .map(([id, us]) => {
    const n = byId.get(id);
    const f = n?.callFrame ?? {};
    const url = (f.url ?? '').split('/').slice(-1)[0];
    return { name: f.functionName || '(anonymous)', where: url ? `${url}:${(f.lineNumber ?? 0) + 1}` : '', ms: us / 1000 };
  })
  .sort((a, b) => b.ms - a.ms);

console.log(JSON.stringify(stats));
console.log(`profile: ${(total / 1000).toFixed(0)}ms sampled`);
for (const r of rows.slice(0, 30)) {
  console.log(`${r.ms.toFixed(1).padStart(8)}ms  ${((r.ms * 100000) / total).toFixed(1).padStart(5)}%  ${r.name}  ${r.where}`);
}
