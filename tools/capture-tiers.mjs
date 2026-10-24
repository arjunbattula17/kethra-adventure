// Side-by-side quality tiers: every scene from the same camera at the Performance (low) and
// Quality (high) tiers, for docs/perf/tiers/. The point is to check Low looks like a designed,
// simpler version of the game and never like a broken one.
//
//   npx vite preview   (in another terminal)
//   node tools/capture-tiers.mjs [baseUrl]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:4173/kethra-adventure/';
// Optional: an output folder and a comma-separated tier list (e.g. docs/perf/x low), for before/after captures.
const OUT = process.argv[3] || 'docs/perf/tiers';
const TIERS = (process.argv[4] || 'low,high').split(',');
mkdirSync(OUT, { recursive: true });
const VIEWS = {
  ship: [['spawn', 0, 0, 4, 0, 0], ['console', 0, 0, -1.5, 0, -0.15]],
  kethra: [['plaza', 0, 0.4, 9.5, 0, -0.05], ['heart', 0, 1.5, -12.5, 0, 0.08]],
  vessek: [['concourse', 2, 0, 9.4, 0, 0], ['hydroponics', -2.2, 0, -4.6, 0.7, -0.15]],
};
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
// Each level on a fresh page by ?jump= (chained transitions stalled on the way to Vessek).
const LEVELS = [['ship', 'ShipInteriorScene', ''], ['kethra', 'KethraScene', '&unlockKethra=1&jump=kethra'], ['vessek', 'VessekScene', '&unlockVessek=1&jump=vessek']];
for (const tier of TIERS) {
  for (const [name, kind, jump] of LEVELS) {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
    await page.goto(`${BASE}?skipIntro=1&newGame=1&tier=${tier}&seed=7${jump}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction((k) => window.__DEBUG__?.engine.getCurrentScene()?.kind === k && !window.__DEBUG__.flow.isTransitioning(), kind, { timeout: 300000, polling: 500 });
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
    await page.close();
  }
}
await browser.close();
console.log('captured', OUT);
