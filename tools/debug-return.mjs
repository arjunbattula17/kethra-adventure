import { chromium } from 'playwright';

const baseUrl = process.argv[2] || 'http://localhost:5180';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(baseUrl + '?skipIntro=1&unlockKethra=1', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__DEBUG__?.gameState, { timeout: 10000 });
await page.waitForTimeout(500);
await page.evaluate(() => window.__DEBUG__.bus.emit('galaxy:travel_to', 'kethra'));
await page.waitForTimeout(3500);

await page.evaluate(() => {
  const scene = window.__DEBUG__.engine.getCurrentScene();
  const V = scene.player.rig.position.constructor;
  scene.player.teleport(new V(0, 2, 18), 0);
});
await page.waitForTimeout(800);
await page.keyboard.down('KeyE');
await page.waitForTimeout(150);
await page.keyboard.up('KeyE');
await page.waitForTimeout(3000);

const objective = await page.$eval('#objective-text', (el) => el.textContent).catch(() => null);
console.log('Objective after return:', objective);
await browser.close();
