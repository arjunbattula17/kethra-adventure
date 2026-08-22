import { chromium } from 'playwright';

const baseUrl = process.argv[2] || 'http://localhost:5180';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(baseUrl + '?skipIntro=1', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__DEBUG__?.gameState, { timeout: 10000 });
await page.waitForTimeout(1000);

const ys = [];
const readY = async () => {
  const y = await page.evaluate(() => window.__DEBUG__.engine.getCurrentScene().player.rig.position.y);
  ys.push(Number(y.toFixed(3)));
};

await readY();
await page.keyboard.down('Space');
for (let i = 0; i < 10; i++) {
  await page.waitForTimeout(40);
  await readY();
}
await page.keyboard.up('Space');
for (let i = 0; i < 10; i++) {
  await page.waitForTimeout(40);
  await readY();
}
console.log('Y trajectory:', ys.join(', '));
console.log('Peak Y:', Math.max(...ys), '| Start Y:', ys[0]);
await browser.close();
