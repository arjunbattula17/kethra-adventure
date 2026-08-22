import { chromium } from 'playwright';

const baseUrl = process.argv[2] || 'http://localhost:5180';
const outDir = process.argv[3] || '.';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(baseUrl + '?skipIntro=1', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__DEBUG__?.gameState, { timeout: 10000 });
await page.waitForTimeout(1500);

// View 1: default spawn (facing console).
await page.screenshot({ path: `${outDir}/ship_console_view.png` });

// View 2: teleport near console, close up.
await page.evaluate(() => {
  const scene = window.__DEBUG__.engine.getCurrentScene();
  const V = scene.player.rig.position.constructor;
  scene.player.teleport(new V(0, 1.7, -2), 0);
});
await page.waitForTimeout(600);
await page.screenshot({ path: `${outDir}/ship_console_closeup.png` });

// View 3: turn around toward the airlock (yaw = PI).
await page.evaluate(() => {
  const scene = window.__DEBUG__.engine.getCurrentScene();
  const V = scene.player.rig.position.constructor;
  scene.player.teleport(new V(0, 1.7, 2), Math.PI);
});
await page.waitForTimeout(600);
await page.screenshot({ path: `${outDir}/ship_airlock_view.png` });

console.log('done');
await browser.close();
