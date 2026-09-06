// Drives the real player with real key input and asserts movement behaves as intended: ramps are
// walkable, a step taller than MAX_STEP_UP is not climbable, and falling off the level returns the
// player instead of stranding them. Uses keyboard events rather than calling update() directly so
// the InputManager path is exercised too.
// Usage: node tools/movement-check.mjs [ship|kethra]
import { chromium } from 'playwright';

const scene = process.argv.includes('ship') ? 'ship' : 'kethra';
const baseUrl = process.env.BASE_URL || 'http://localhost:5180/kethra-adventure/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
await page.goto(`${baseUrl}?skipIntro=1&newGame=1&unlockKethra=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForFunction(() => !!window.__DEBUG__?.gameState, undefined, { timeout: 90000 });
await page.waitForFunction(() => !!window.__DEBUG__.engine.getCurrentScene?.(), undefined, { timeout: 90000 });
if (scene === 'kethra') await page.evaluate(() => window.__DEBUG__.bus.emit('galaxy:travel_to', 'kethra'));
const cls = scene === 'kethra' ? 'KethraScene' : 'ShipInteriorScene';
await page.waitForFunction((c) => {
  const s = window.__DEBUG__.engine.getCurrentScene?.();
  return !!(s && s.player && s.constructor.name === c);
}, cls, { timeout: 90000 });
await page.waitForTimeout(3500);

// yaw such that PlayerController's forward, (-sin(yaw), 0, -cos(yaw)), points at (dx, dz).
const yawTo = (dx, dz) => Math.atan2(-dx, -dz);

async function walk(x, z, dx, dz, ms) {
  await page.evaluate(([x, z, yaw]) => {
    const sc = window.__DEBUG__.engine.getCurrentScene();
    const V = sc.player.rig.position.constructor;
    sc.player.teleport(new V(x, 2, z), yaw);
  }, [x, z, yawTo(dx, dz)]);
  await page.waitForTimeout(500);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(ms);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(250);
  return page.evaluate(() => {
    const p = window.__DEBUG__.engine.getCurrentScene().player.rig.position;
    return [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)];
  });
}

const checks = scene === 'kethra'
  ? [
      ['chamber ramp is walkable (plaza -> chamber)', 0, -3.0, 0, -1, 3500, (p) => p[2] < -9.5 && p[1] > 1.4],
      ['west ramp is walkable (plaza -> west terrace)', -7.0, -0.5, -1, 0, 3000, (p) => p[0] < -12 && p[1] > 0.9],
      ['ledge stair is walkable (west -> secret ledge)', -20.6, -2.0, 0, -1, 3500, (p) => p[2] < -6.9 && p[1] > 2.7],
      ['1.80m ledge face is NOT climbable off-stair', -19.2, -5.6, 0, -1, 3000, (p) => p[1] < 1.5],
      // z = -4.5 is clear of the east ramp (z -3..2) and of Pine_2's trunk collider
      // (x 5.68..9.67, z 2.14..5.72), so this is a real unguarded edge over a 3.6-unit void.
      // W stays held after the reset, so the player walks on from the respawn point facing -Z;
      // what matters is that they are back on the landing terrace and not left on the catch plane.
      ['walking off the plaza edge returns the player', 7.0, -4.5, 1, 0, 5000, (p) => p[1] > -1 && Math.abs(p[0]) < 3 && p[2] > 10],
    ]
  : [
      ['deck is walkable', 0, 5.5, 0, -1, 2500, (p) => p[2] < 4 && Math.abs(p[1]) < 0.2],
    ];

let fails = 0;
for (const [name, x, z, dx, dz, ms, ok] of checks) {
  const end = await walk(x, z, dx, dz, ms);
  const pass = ok(end);
  if (!pass) fails++;
  console.log(`  ${pass ? 'OK  ' : 'FAIL'} ${name}\n         ended at ${JSON.stringify(end)}`);
}
console.log(fails ? `${fails} movement check(s) failed` : 'all movement checks passed');
await browser.close();
if (fails) process.exitCode = 1;
