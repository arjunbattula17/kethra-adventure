// First light's camera (BUG-022): with a view yaw wound several turns by mouse-look, the turn to
// the throttle takes the short way (no multi-turn spin), and the push-in ends facing forward, into
// the viewport, not at the wall the throttle is on.
//   node stress_tests/s11-firstlight.mjs [shotsDir]
import { launch, openPage, check, clean, failures, settled, until } from './lib.mjs';

const SHOTS = process.argv[2];
const browser = await launch();
const { page, context, errors } = await openPage(browser, '?newGame=1&skipIntro=1&unlockKethra=1&tier=low&seed=7');
await settled(page, 'ShipInteriorScene');
await page.evaluate(() => window.__DEBUG__.flow.tutorial?.skip?.());
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const s = window.__DEBUG__.engine.getCurrentScene();
  s.player.yaw = 2 * Math.PI * 2; // two whole turns of mouse-look
  window.__YAW__ = [];
  const tick = () => { const sc = window.__DEBUG__.engine.getCurrentScene(); if (sc?.kind !== 'ShipInteriorScene') return; window.__YAW__.push(sc.player.yaw); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  window.__DEBUG__.bus.emit('galaxy:travel_to', 'kethra');
});
await page.waitForSelector('.first-light-hint', { timeout: 60000 });
const offered = await page.evaluate(() => window.__YAW__.length);
await page.keyboard.down('Space');
await until(page, () => window.__DEBUG__.engine.getCurrentScene()?.power?.stage === 'full', 30000);
await page.keyboard.up('Space');
if (SHOTS) { await page.waitForTimeout(900); await page.screenshot({ path: `${SHOTS}/firstlight-push.png` }); }
await until(page, () => window.__DEBUG__.engine.getCurrentScene()?.kind === 'CruiseScene', 60000);
const yaw = await page.evaluate(() => window.__YAW__);
// Heading change per frame (a whole-turn step in the yaw value is the same heading, invisible).
const wrap = (a) => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
let turn = 0;
for (let i = 1; i < offered; i++) turn += Math.abs(wrap(yaw[i] - yaw[i - 1]));
const last = yaw[yaw.length - 1];
const wrapped = ((last + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
check('BUG-022: the turn to the throttle takes the short way round', turn <= Math.PI + 0.1, `turned ${turn.toFixed(2)} rad`);
check('BUG-022: the push-in ends facing forward, into the viewport', Math.abs(wrapped) < 0.1, `last yaw ${last.toFixed(2)} (${wrapped.toFixed(2)} wrapped)`);
await clean(page, errors, 'First light');
await context.close();
await browser.close();
console.log(failures() ? `\n${failures()} failed` : '\nall passed');
process.exit(failures() ? 1 : 0);
