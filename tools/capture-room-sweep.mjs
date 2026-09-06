// Yaw sweep of the ship interior from a few standing positions, at the player's real eye height.
// Usage: node tools/capture-room-sweep.mjs <outDir>
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const outDir = process.argv[2] || 'renders/sweep';
const baseUrl = process.env.BASE_URL || 'http://localhost:5180/kethra-adventure/';

// [label, x, z] standing spots; each is swept through eight yaws.
const SPOTS = [
  ['spawn', 0, 5.5],
  ['mid', 0, 0],
  ['console', 0, -3.0],
  ['left', -4.0, 0],
  ['right', 4.0, 0],
  ['door', 0, 6.6],
];
const YAWS = [0, 0.785, 1.571, 2.356, 3.142, 3.927, 4.712, 5.498];

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(baseUrl + '?skipIntro=1&newGame=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForFunction(() => !!window.__DEBUG__?.gameState, undefined, { timeout: 90000 });
await page.waitForFunction(() => {
  const s = window.__DEBUG__.engine.getCurrentScene?.();
  return !!(s && s.player && s.constructor.name === 'ShipInteriorScene');
}, undefined, { timeout: 90000 });
await page.waitForTimeout(3500);
await page.addStyleTag({ content: `body > *:not(#app){display:none!important}#app > *:not(canvas){display:none!important}` });
const setupErr = await page.evaluate(() => {
  try {
  const s = window.__DEBUG__.engine.getCurrentScene();
  s.player.enabled = false;
  window.__SETVIEW__ = (x, z, yaw, pitch) => {
    const sc = window.__DEBUG__.engine.getCurrentScene();
    sc.player.rig.position.set(x, 0, z);
    sc.player.rig.rotation.set(0, yaw, 0);
    sc.camera.position.set(0, 1.7, 0);
    sc.camera.rotation.set(pitch, 0, 0);
    sc.camera.fov = 70;
    sc.camera.updateProjectionMatrix();
  };
  return null;
  } catch (e) { return String(e && e.stack || e); }
});
if (setupErr) { console.log('SETUP FAILED:', setupErr); process.exit(1); }

for (const [label, x, z] of SPOTS) {
  for (const yaw of YAWS) {
    await page.evaluate(([x, z, y]) => window.__SETVIEW__(x, z, y, 0), [x, z, yaw]);
    await page.waitForTimeout(220);
    await page.screenshot({ path: `${outDir}/${label}_y${Math.round((yaw * 180) / Math.PI)}.png` });
  }
}
// Two look-up / look-down passes from the middle for ceiling and floor coverage.
for (const [tag, pitch] of [['up', 0.7], ['down', -0.7]]) {
  for (const yaw of [0, 1.571, 3.142, 4.712]) {
    await page.evaluate(([y, p]) => window.__SETVIEW__(0, 0, y, p), [yaw, pitch]);
    await page.waitForTimeout(220);
    await page.screenshot({ path: `${outDir}/mid_${tag}_y${Math.round((yaw * 180) / Math.PI)}.png` });
  }
}
if (errors.length) console.log('PAGE ERRORS:\n' + [...new Set(errors)].slice(0, 15).join('\n'));
console.log('done ->', outDir);
await browser.close();
