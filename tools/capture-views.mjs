// Deterministic still captures for before/after texture comparisons: each view parks the camera,
// pauses the engine, renders exactly one frame by hand and screenshots it, so animation phase
// can't differ between runs. Diff two output folders with tools/compare-renders.mjs.
//
//   node tools/capture-views.mjs <baseUrl> <outDir> [scene=ship|kethra|intro]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [BASE = 'http://localhost:5173/kethra-adventure/', OUT = 'renders/views', SCENE = 'ship'] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });

// [name, camera position, look-at target]
const VIEWS = {
  ship: [
    ['ship-console', [0, 1.62, 3.5], [0, 1.4, -6]],
    ['ship-wall-port', [0.5, 1.6, 0], [-6, 1.5, 0.5]],
    ['ship-wall-starboard', [-0.5, 1.6, 1], [6, 1.4, 1.5]],
    ['ship-aft', [0, 1.62, -3], [0, 1.3, 8]],
    ['ship-floor', [1, 1.7, 1], [2.5, 0, 3.5]],
    ['ship-ceiling', [0, 1.6, 1], [0.5, 5, -2]],
    // Arm's length from a painted wall bay: where wall texel density is actually judged.
    ['ship-wall-close', [-4.2, 1.7, 1.2], [-8, 1.9, 1.6]],
  ],
  kethra: [
    ['kethra-spawn', null, null],
    ['kethra-trees', [0, 2.2, 4], [6, 3, -6]],
    ['kethra-rocks', [0, 1.7, 0], [-8, 0.5, -4]],
    ['kethra-ground', [0, 1.7, 0], [2, 0, -3]],
  ],
  intro: [['intro-wide', null, null]],
};

const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const query = SCENE === 'kethra' ? '?skipIntro=1&unlockKethra=1&newGame=1&tier=high' : SCENE === 'intro' ? '?newGame=1&tier=high' : '?skipIntro=1&newGame=1&tier=high';
const kind = { ship: 'ShipInteriorScene', kethra: 'KethraScene', intro: 'IntroScene' }[SCENE];
await page.goto(BASE + query, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__DEBUG__?.engine.getCurrentScene(), undefined, { timeout: 240000, polling: 250 });
if (SCENE === 'kethra') await page.evaluate(() => window.__DEBUG__.flow.travelToPlanet('kethra'));
await page.waitForFunction((k) => window.__DEBUG__?.engine.getCurrentScene()?.kind === k, kind, { timeout: 240000, polling: 250 });
await page.waitForTimeout(SCENE === 'intro' ? 9000 : 3000);

for (const [name, pos, look] of VIEWS[SCENE]) {
  await page.evaluate(({ pos, look }) => {
    const e = window.__DEBUG__.engine;
    const s = e.getCurrentScene();
    e.setPaused(true);
    if (pos) {
      if (s.player) s.player.enabled = false;
      const cam = s.camera;
      // The player rig parents the camera in walkable scenes; detach the offset by zeroing the rig.
      if (s.player?.rig) { s.player.rig.position.set(0, 0, 0); s.player.rig.rotation.set(0, 0, 0); }
      cam.position.set(pos[0], pos[1], pos[2]);
      cam.rotation.set(0, 0, 0);
      cam.lookAt(look[0], look[1], look[2]);
      cam.updateMatrixWorld(true);
    }
    e.postFx.render();
  }, { pos, look });
  await page.screenshot({ path: `${OUT}/${name}.png` });
}
await browser.close();
console.log('captured', VIEWS[SCENE].length, 'views ->', OUT);
