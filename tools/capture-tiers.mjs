// Side-by-side quality tiers: every scene from the same camera at the Performance (low) and
// Quality (high) tiers, for docs/perf/tiers/. The point is to check Low looks like a designed,
// simpler version of the game and never like a broken one.
//
//   npx vite preview   (in another terminal)
//   node tools/capture-tiers.mjs [baseUrl]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:4173/kethra-adventure/';
const OUT = 'docs/perf/tiers';
mkdirSync(OUT, { recursive: true });
const VIEWS = {
  ship: [['spawn', 0, 0, 4, 0, 0], ['console', 0, 0, -1.5, 0, -0.15]],
  kethra: [['plaza', 0, 0.4, 9.5, 0, -0.05], ['heart', 0, 1.5, -12.5, 0, 0.08]],
  vessek: [['concourse', 2, 0, 9.4, 0, 0], ['hydroponics', -2.2, 0, -4.6, 0.7, -0.15]],
};
const browser = await chromium.launch({ args: ['--use-gl=angle', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
for (const tier of ['low', 'high']) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
  await page.goto(`${BASE}?skipIntro=1&unlockVessek=1&newGame=1&tier=${tier}`, { waitUntil: 'domcontentloaded' });
  const scene = (k) => page.waitForFunction((k) => window.__DEBUG__?.engine.getCurrentScene()?.kind === k, k, { timeout: 900000, polling: 500 });
  await scene('ShipInteriorScene');
  for (const [name, kind] of [['ship', 'ShipInteriorScene'], ['kethra', 'KethraScene'], ['vessek', 'VessekScene']]) {
    if (name !== 'ship') {
      await page.evaluate((l) => window.__DEBUG__.flow.travelToPlanet(l), name);
      await scene(kind);
    }
    await page.waitForTimeout(6500);
    await page.evaluate(() => { document.getElementById('ui-root').style.visibility = 'hidden'; });
    for (const [view, x, y, z, yaw, pitch] of VIEWS[name]) {
      await page.evaluate(({ x, y, z, yaw, pitch }) => {
        const s = window.__DEBUG__?.engine.getCurrentScene();
        s.player.teleport(new s.player.rig.position.constructor(x, y, z), yaw);
        s.player.pitch = pitch;
      }, { x, y, z, yaw, pitch });
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${OUT}/${name}-${view}-${tier}.png` });
    }
    await page.evaluate(() => { document.getElementById('ui-root').style.visibility = ''; });
    if (name !== 'ship') {
      await page.evaluate(() => window.__DEBUG__?.engine.getCurrentScene().onDepart?.());
      await scene('ShipInteriorScene');
    }
  }
  await page.close();
}
await browser.close();
console.log('captured', OUT);
