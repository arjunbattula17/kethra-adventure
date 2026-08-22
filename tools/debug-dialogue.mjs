import { chromium } from 'playwright';

const baseUrl = process.argv[2] || 'http://localhost:5180';
const url = baseUrl + '?skipIntro=1&unlockKethra=1';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__DEBUG__?.gameState, { timeout: 10000 });
await page.waitForTimeout(500);
await page.evaluate(() => window.__DEBUG__.bus.emit('galaxy:travel_to', 'kethra'));
await page.waitForTimeout(2500);

async function teleport(x, y, z) {
  await page.evaluate(({ x, y, z }) => {
    const scene = window.__DEBUG__.engine.getCurrentScene();
    const V = scene.player.rig.position.constructor;
    scene.player.teleport(new V(x, y, z), 0);
  }, { x, y, z });
  await page.waitForTimeout(150);
}

await teleport(3, 2, 5.5);
await page.keyboard.down('KeyE');
await page.waitForTimeout(120);
await page.keyboard.up('KeyE');
await page.waitForTimeout(400);

console.log('panel visible after E:', await page.evaluate(() => !!document.querySelector('.panel-overlay.visible')));
console.log('speaker:', await page.$eval('#dialogue-speaker', (el) => el.textContent).catch(() => 'NONE'));

await page.keyboard.press('Escape');
await page.waitForTimeout(400);
console.log('panel visible after Escape:', await page.evaluate(() => !!document.querySelector('.panel-overlay.visible')));
console.log('PanelManager.isOpen:', await page.evaluate(() => document.getElementById('ui-root')?.querySelector('.panel-overlay')?.classList.contains('visible')));

await teleport(-3, 2, 4.5);
console.log('player pos after teleport:', await page.evaluate(() => window.__DEBUG__.engine.getCurrentScene().player.rig.position.toArray()));

await page.keyboard.down('KeyE');
await page.waitForTimeout(120);
await page.keyboard.up('KeyE');
await page.waitForTimeout(400);
console.log('panel visible after 2nd E:', await page.evaluate(() => !!document.querySelector('.panel-overlay.visible')));
console.log('speaker 2nd:', await page.$eval('#dialogue-speaker', (el) => el.textContent).catch(() => 'NONE'));

await browser.close();
