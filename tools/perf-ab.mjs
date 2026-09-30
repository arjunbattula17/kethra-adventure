// A/B timing of one change, on this machine's real GPU. A laptop's frame times drift 10-20% as it
// heats up, so two separate runs can't settle a 5% question; this alternates the two versions
// (A B A B ...) in one browser and compares the averages.
//
//   Two builds:      node tools/perf-ab.mjs <tier> <scene> builds <portA> <portB>
//   A page toggle:   node tools/perf-ab.mjs <tier> <scene> <toggle>        (toggles listed in TOGGLES)
//
// For two builds, serve each on its own port, e.g. the old build copied to dist-before/:
//   npx vite preview --outDir dist-before --port 4174     and     npx vite preview --port 4173
// tier: low | medium | high. scene: ship | kethra | vessek. REPS=<n> sets the repeats (default 3),
// SETTLE=<ms> the wait after flipping a toggle (raise it for toggles that recompile shaders).
//
// Each measurement holds the camera at four fixed headings from the spawn point (the Wren's first is
// its heaviest view, the navigation console) with vsync off, and reports the mean frame interval and
// the JavaScript time of the render call at each. Used for docs/PERF_LOG.md, 2026-09-27.
import { chromium } from 'playwright';

const [TIER = 'low', SCENE = 'ship', SET = 'builds', PORT_A = '4174', PORT_B = '4173'] = process.argv.slice(2);
const REPS = Number(process.env.REPS || 3);
const SETTLE = Number(process.env.SETTLE || 500);

/** Page-side toggles: A is the game as built, B the variant. */
const TOGGLES = {
  bloom: { A: () => { window.__DEBUG__.engine.postFx.bloomPass.enabled = true; }, B: () => { window.__DEBUG__.engine.postFx.bloomPass.enabled = false; } },
  shadows: { A: () => window.__DEBUG__.engine.setShadowsEnabled(true), B: () => window.__DEBUG__.engine.setShadowsEnabled(false) },
  scale85: {
    A: () => { const e = window.__DEBUG__.engine; e.renderer.setPixelRatio(1); e.postFx.setPixelRatio(1); },
    B: () => { const e = window.__DEBUG__.engine; e.renderer.setPixelRatio(0.85); e.postFx.setPixelRatio(0.85); },
  },
  nearToFar: {
    A: () => {},
    B: () => window.__DEBUG__.engine.renderer.setOpaqueSort((a, b) => a.groupOrder - b.groupOrder || a.renderOrder - b.renderOrder || a.z - b.z || a.id - b.id),
  },
  // Point lights at zero intensity cost nothing (the light-skip patch), so this halves the lighting
  // work without recompiling anything.
  halfLights: {
    A: () => { window.__DEBUG__.engine.getCurrentScene().scene.traverse((o) => { if (o.isPointLight && o.userData.abOff) { o.intensity = o.userData.abOff; o.userData.abOff = 0; } }); },
    B: () => {
      const lights = [];
      window.__DEBUG__.engine.getCurrentScene().scene.traverse((o) => { if (o.isPointLight) lights.push(o); });
      lights.sort((a, b) => a.intensity * a.distance ** 2 - b.intensity * b.distance ** 2);
      for (const l of lights.slice(0, Math.floor(lights.length / 2))) { l.userData.abOff = l.intensity; l.intensity = 0; }
    },
  },
  noNormalMaps: {
    A: () => { window.__DEBUG__.engine.getCurrentScene().scene.traverse((o) => { const m = o.material; if (m && !Array.isArray(m) && m.userData.abNormal) { m.normalMap = m.userData.abNormal; m.userData.abNormal = null; m.needsUpdate = true; } }); },
    B: () => { window.__DEBUG__.engine.getCurrentScene().scene.traverse((o) => { const m = o.material; if (m && !Array.isArray(m) && m.normalMap) { m.userData.abNormal = m.normalMap; m.normalMap = null; m.needsUpdate = true; } }); },
  },
};
if (SET !== 'builds' && !TOGGLES[SET]) {
  console.log(`unknown toggle "${SET}"; one of: builds, ${Object.keys(TOGGLES).join(', ')}`);
  process.exit(1);
}

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--disable-gpu-vsync', '--disable-frame-rate-limit', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});

async function open(port) {
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 })).newPage();
  page.on('pageerror', (e) => console.log('page error:', e.message));
  await page.goto(`http://localhost:${port}/kethra-adventure/?skipIntro=1&unlockVessek=1&newGame=1&tier=${TIER}`);
  const waitScene = (k) => page.waitForFunction((k) => window.__DEBUG__?.engine.getCurrentScene()?.kind === k && !document.querySelector('.loading-indicator.visible'), k, { timeout: 900000, polling: 250 });
  await waitScene('ShipInteriorScene');
  await page.evaluate(() => window.__DEBUG__.flow.tutorial?.skip?.());
  if (SCENE !== 'ship') {
    await page.evaluate((l) => window.__DEBUG__.flow.travelToPlanet(l), SCENE);
    await waitScene(SCENE === 'kethra' ? 'KethraScene' : 'VessekScene');
  }
  await page.waitForTimeout(1500);
  return page;
}

/** Mean frame interval and render-call JavaScript time at four fixed headings. Pauses the page after. */
const measure = (page) => page.evaluate(async () => {
  const e = window.__DEBUG__.engine;
  e.setPaused(false);
  const player = e.getCurrentScene().player;
  const pf = e.postFx;
  const orig = pf.render;
  let cpu = 0;
  pf.render = function () { const t = performance.now(); orig.call(pf); cpu += performance.now() - t; };
  const frame = [];
  const js = [];
  for (let k = 0; k < 4; k++) {
    if (player) player.yaw = (k * Math.PI) / 2 + 0.3;
    await new Promise((r) => setTimeout(r, 700));
    cpu = 0;
    const d = [];
    let last = performance.now();
    const t0 = last;
    await new Promise((res) => { const f = (n) => { d.push(n - last); last = n; if (n - t0 < 1500) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    const n = d.length;
    d.splice(0, 2);
    frame.push(d.reduce((s, x) => s + x, 0) / d.length);
    js.push(cpu / n);
  }
  pf.render = orig;
  e.setPaused(true);
  return { frame, js };
});

let switchTo;
if (SET === 'builds') {
  const pageA = await open(PORT_A);
  await pageA.evaluate(() => window.__DEBUG__.engine.setPaused(true));
  const pageB = await open(PORT_B);
  await pageB.evaluate(() => window.__DEBUG__.engine.setPaused(true));
  switchTo = async (v) => (v === 'A' ? pageA : pageB);
} else {
  const page = await open(PORT_B);
  switchTo = async (v) => {
    await page.evaluate(TOGGLES[SET][v]);
    await page.evaluate(() => window.__DEBUG__.engine.setPaused(false));
    await page.waitForTimeout(SETTLE);
    return page;
  };
}

// Two unrecorded rounds first: shader compiles and first-sight uploads for both versions.
for (const v of ['A', 'B', 'A', 'B']) await measure(await switchTo(v));
const res = { A: [], B: [] };
for (let rep = 0; rep < REPS; rep++) for (const v of ['A', 'B']) res[v].push(await measure(await switchTo(v)));

const avg = (runs, key) => runs[0][key].map((_, k) => runs.reduce((s, r) => s + r[key][k], 0) / runs.length);
const mean = (x) => x.reduce((s, y) => s + y, 0) / x.length;
const row = (label, x, base) => `${label} ${x.map((v) => v.toFixed(1).padStart(6)).join(' ')} | mean ${mean(x).toFixed(2)}${base ? ` (${(((mean(x) - mean(base)) / mean(base)) * 100).toFixed(1)}%)` : ''}`;
console.log(`${TIER} ${SCENE} ${SET}: at four fixed headings`);
const fa = avg(res.A, 'frame'), fb = avg(res.B, 'frame');
const ja = avg(res.A, 'js'), jb = avg(res.B, 'js');
console.log(row('frame ms  A', fa));
console.log(row('frame ms  B', fb, fa));
console.log(row('render JS A', ja));
console.log(row('render JS B', jb, ja));
await browser.close();
