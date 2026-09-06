import { chromium } from 'playwright';

const baseUrl = process.argv[2] || 'http://localhost:5180';
const outDir = process.argv[3] || '.';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});

console.log('goto...');
await page.goto(baseUrl + '?skipIntro=1&unlockKethra=1', { waitUntil: 'domcontentloaded', timeout: 20000 });
console.log('goto done, waiting for gameState...');
await page.waitForFunction(() => !!window.__DEBUG__?.gameState, undefined, { timeout: 45000 });
console.log('gameState ready, traveling to kethra...');
await page.waitForTimeout(1500);

await page.evaluate(() => window.__DEBUG__.flow['travelToPlanet']?.('kethra'));
await page.waitForFunction(
  () => (window.__DEBUG__.engine.getCurrentScene?.()?.kind ?? window.__DEBUG__.engine.getCurrentScene?.()?.constructor.name) === 'KethraScene',
  undefined,
  { timeout: 60000 },
);
console.log('KethraScene active, settling...');
await page.waitForTimeout(3000);
console.log('starting shots...');

async function shot(name, pos, yaw) {
  await page.evaluate(
    ({ pos, yaw }) => {
      const scene = window.__DEBUG__.engine.getCurrentScene();
      scene.player.enabled = true;
      const V = scene.player.rig.position.constructor;
      scene.player.teleport(new V(pos[0], pos[1], pos[2]), yaw);
    },
    { pos, yaw },
  );
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${outDir}/${name}.png` });
}

// Elevated, pulled-back establishing shot: decouples the camera from the rig (rig only supplies
// XZ + yaw so floor-relative logic stays sane) so the framing clears close-range clutter/rocks
// instead of standing eye-level inside whatever kit piece randomly landed nearby.
async function wideShot(name, rigXZ, yaw, camY, pitch, fov = 62) {
  await page.evaluate(
    ({ rigXZ, yaw, camY, pitch, fov }) => {
      const scene = window.__DEBUG__.engine.getCurrentScene();
      scene.player.enabled = false;
      scene.player.rig.position.set(rigXZ[0], 0, rigXZ[1]);
      scene.player.rig.rotation.set(0, yaw, 0);
      scene.camera.position.set(0, camY, 0);
      scene.camera.rotation.set(pitch, 0, 0);
      scene.camera.fov = fov;
      scene.camera.updateProjectionMatrix();
    },
    { rigXZ, yaw, camY, pitch, fov },
  );
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${outDir}/${name}.png` });
}

await shot('01_landing_spawn', [0, 2, 18], 0);
await wideShot('02_plaza_overview', [0, 12], 3.2, 6.5, -0.55);
await wideShot('03_west_terrace_trees', [-16, 4], 2.6, 6, -0.4);
await wideShot('04_east_terrace_trees', [16, 4], -2.6, 6, -0.4);
await wideShot('05_grove_creature', [0, -4], Math.PI, 6, -0.4);
await shot('06_mechanism_chamber', [0, 1.9, -15.5], Math.PI);
await wideShot('07_secret_ledge_view', [-16, -3], 2.3, 7, -0.45);
await shot('08_shrine_valve_closeup', [-1, 1.2, 6.5], 2.6);

console.log('ERRORS:', JSON.stringify(errors));
console.log('done');
await browser.close();
