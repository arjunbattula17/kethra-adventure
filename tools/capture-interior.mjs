// Deterministic per-piece screenshots of the ship interior.
// Usage: node tools/capture-interior.mjs <outDir> [viewName ...]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const outDir = process.argv[2] || 'renders';
const only = process.argv.slice(3);
const baseUrl = process.env.BASE_URL || 'http://localhost:5180';

// pos = eye position, yaw radians (0 = -Z, toward console), pitch radians (+ = up), fov.
const VIEWS = {
  hero:      { pos: [0, 1.62, 5.3],   yaw: 0,           pitch: -0.045, fov: 70 },
  ceiling:   { pos: [0, 1.60, 1.6],   yaw: 0,           pitch: 0.62,   fov: 70 },
  floor:     { pos: [0, 1.65, 2.2],   yaw: 0,           pitch: -0.52,  fov: 70 },
  wallLeft:  { pos: [1.2, 1.60, 0.5], yaw: Math.PI / 2, pitch: 0.05,   fov: 70 },
  wallRight: { pos: [-1.2, 1.60, 0.5], yaw: -Math.PI / 2, pitch: 0.05, fov: 70 },
  console:   { pos: [0, 1.60, -1.5],  yaw: 0,           pitch: -0.10,  fov: 62 },
  displays:  { pos: [0, 1.62, -0.2],  yaw: 0,           pitch: 0.16,   fov: 62 },
  airlock:   { pos: [0, 1.60, 1.0],   yaw: Math.PI,     pitch: 0.02,   fov: 70 },
  props:     { pos: [-1.4, 1.60, 3.2], yaw: -1.15,       pitch: -0.06,  fov: 70 },
  window:    { pos: [2.3, 1.62, -1.1], yaw: -0.34,       pitch: 0.13,   fov: 70 },
};

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

// 'load' has been observed to hang indefinitely in this environment even once the page is fully
// interactive (no pending requests) — domcontentloaded plus the explicit __DEBUG__ poll below is
// an equivalent readiness check that doesn't wedge.
await page.goto(baseUrl + '?skipIntro=1&newGame=1', { waitUntil: 'domcontentloaded', timeout: 20000 });
// The 2nd positional param to waitForFunction is `arg`, not `options` — passing the timeout object
// there silently falls through to the 30s default instead of the intended timeout. Scene init with
// the current procedural texture load measures ~33s, so both waits need `undefined` for arg and a
// margin above that in options.
await page.waitForFunction(() => !!window.__DEBUG__?.gameState, undefined, { timeout: 45000 });
await page.waitForFunction(() => {
  const s = window.__DEBUG__.engine.getCurrentScene?.();
  return !!(s && s.player && s.constructor.name === 'ShipInteriorScene');
}, undefined, { timeout: 45000 });
await page.waitForTimeout(2500);

// Hide HUD chrome so the screenshot is pure render.
// Hide every DOM overlay so the screenshot is the pure WebGL render.
await page.addStyleTag({ content: `
  body > *:not(#app) { display: none !important; }
  #app > *:not(canvas) { display: none !important; }
` });

await page.evaluate(() => {
  const s = window.__DEBUG__.engine.getCurrentScene();
  s.player.enabled = false;
  window.__SETVIEW__ = (v) => {
    const sc = window.__DEBUG__.engine.getCurrentScene();
    sc.player.rig.position.set(v.pos[0], 0, v.pos[2]);
    sc.player.rig.rotation.set(0, v.yaw, 0);
    sc.camera.position.set(0, v.pos[1], 0);
    sc.camera.rotation.set(v.pitch, 0, 0);
    sc.camera.fov = v.fov;
    sc.camera.updateProjectionMatrix();
  };
});

const names = only.length ? only : Object.keys(VIEWS);
for (const name of names) {
  const v = VIEWS[name];
  if (!v) { console.error('unknown view', name); continue; }
  await page.evaluate((vv) => window.__SETVIEW__(vv), v);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log('captured', name);
}

if (errors.length) console.log('PAGE ERRORS:\n' + [...new Set(errors)].slice(0, 15).join('\n'));
await browser.close();
