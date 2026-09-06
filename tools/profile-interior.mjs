// Measures actual render cost of the ship interior scene: draw calls, triangles, texture/geometry
// counts, shadow-casting light count, and real frame timing (not a guess).
import { chromium } from 'playwright';

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:5180';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));

await page.goto(baseUrl + '?skipIntro=1&newGame=1', { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForFunction(() => !!window.__DEBUG__?.gameState, undefined, { timeout: 45000 });
await page.waitForFunction(
  () => {
    const s = window.__DEBUG__.engine.getCurrentScene?.();
    return !!(s && s.player && (s.kind ?? s.constructor.name) === 'ShipInteriorScene');
  },
  undefined,
  { timeout: 45000 },
);
await page.waitForTimeout(2500);

const stats = await page.evaluate(async () => {
  const engine = window.__DEBUG__.engine;
  const scene = engine.getCurrentScene();
  const renderer = engine.renderer;

  let meshCount = 0;
  let lightCount = 0;
  let shadowCasterCount = 0;
  const shadowLights = [];
  const materials = new Set();
  const geometries = new Set();
  scene.scene.traverse((o) => {
    if (o.isMesh) {
      meshCount++;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) if (m) materials.add(m.uuid);
      if (o.geometry) geometries.add(o.geometry.uuid);
    }
    if (o.isLight) {
      lightCount++;
      if (o.castShadow) {
        shadowCasterCount++;
        shadowLights.push({ type: o.type, mapSize: o.shadow?.mapSize ? [o.shadow.mapSize.x, o.shadow.mapSize.y] : null });
      }
    }
  });

  // Render several frames and measure actual GPU-bound frame time via rAF deltas. renderer.info
  // resets its per-frame counters (calls/triangles) at the start of the NEXT render() call, so read
  // it synchronously inside the same rAF tick that just rendered, not after the loop ends.
  const frameTimes = [];
  let lastCalls = 0;
  let lastTriangles = 0;
  await new Promise((resolve) => {
    let last = performance.now();
    let n = 0;
    function tick() {
      const now = performance.now();
      frameTimes.push(now - last);
      last = now;
      lastCalls = renderer.info.render.calls;
      lastTriangles = renderer.info.render.triangles;
      n++;
      if (n < 90) requestAnimationFrame(tick);
      else resolve();
    }
    requestAnimationFrame(tick);
  });
  frameTimes.shift(); // first delta is bogus (time since last unrelated frame)

  // EffectComposer's render() calls renderer.render() once per pass (RenderPass, GTAOPass,
  // UnrealBloomPass, the grade ShaderPass, OutputPass); WebGLRenderer resets info.render at the
  // start of EACH render() call, so reading it after the full composer pipeline only ever shows
  // the last pass's fullscreen-quad draw (which is exactly the bogus "calls:1, triangles:1" seen
  // above). Render the scene directly, once, outside the composer to get the real scene cost.
  renderer.render(scene.scene, scene.camera);
  const info = renderer.info;
  return {
    meshCount,
    uniqueMaterials: materials.size,
    uniqueGeometries: geometries.size,
    lightCount,
    shadowCasterCount,
    shadowLights,
    render: { calls: info.render.calls, triangles: info.render.triangles, points: info.render.points, lines: info.render.lines },
    memory: { geometries: info.memory.geometries, textures: info.memory.textures },
    programs: info.programs?.length ?? null,
    avgFrameMs: frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length,
    maxFrameMs: Math.max(...frameTimes),
    minFrameMs: Math.min(...frameTimes),
    pixelRatio: renderer.getPixelRatio(),
    canvasSize: [renderer.domElement.width, renderer.domElement.height],
  };
});

console.log(JSON.stringify(stats, null, 2));
await browser.close();
