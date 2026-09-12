// Free-camera capture rig for the galaxy-reveal ("outer space") scene: freezes the cinematic
// sequencer and parks the camera at hand-picked framings so each model can be judged on its own
// instead of only at the three keyframes the cutscene happens to fly through.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const baseUrl = process.argv[2] || 'http://localhost:5180/kethra-adventure/';
const outDir = process.argv[3] || 'renders/space-audit';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('framenavigated', (f) => { if (f === page.mainFrame()) console.log('[navigated]', f.url()); });

await page.goto(baseUrl + '?skipIntro=1&tier=high', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__DEBUG__?.gameState, { timeout: 15000 });
await page.waitForTimeout(400);
await page.evaluate(() => { void window.__DEBUG__.flow['transitionToGalaxyReveal']?.(); });
await page.waitForFunction(() => !!window.__DEBUG__.engine.getCurrentScene()?.ship, { timeout: 45000 });
await page.waitForTimeout(2500);

// Freeze the cinematic: replace update() with one that only advances the shader uniforms the
// still frames need (cloud time, atmosphere camera position), leaving the camera under our control.
await page.evaluate(() => {
  const s = window.__DEBUG__.engine.getCurrentScene();
  s.update = function (dt, elapsed) {
    for (const inst of this.planetInstances) inst.update(elapsed, dt);
  };
  window.__AUDIT__ = {
    scene: s,
    park(target, dist, dir, fov) {
      const cam = s.camera;
      const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
      cam.position.set(
        target[0] + (dir[0] / len) * dist,
        target[1] + (dir[1] / len) * dist,
        target[2] + (dir[2] / len) * dist,
      );
      cam.lookAt(target[0], target[1], target[2]);
      if (fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
    },
    planetWorldPos(id) {
      const g = s.planetMeshes.find((m) => m.userData.planetId === id);
      return g ? [g.position.x, g.position.y, g.position.z] : null;
    },
  };
});

if (process.env.NO_AO) await page.evaluate(() => window.__DEBUG__.engine.setAOEnabled(false));
if (process.env.NO_BLOOM) await page.evaluate(() => window.__DEBUG__.engine.setBloomEnabled(false));

const shots = JSON.parse(process.env.SHOTS || '[]');
for (const shot of shots) {
  const target = await page.evaluate((s) => {
    if (s.planet) return window.__AUDIT__.planetWorldPos(s.planet);
    return s.target;
  }, shot);
  await page.evaluate(([t, dist, dir, fov]) => window.__AUDIT__.park(t, dist, dir, fov), [target, shot.dist, shot.dir, shot.fov || 50]);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${outDir}/${shot.name}.png` });
  console.log('saved', shot.name);
}

await browser.close();
