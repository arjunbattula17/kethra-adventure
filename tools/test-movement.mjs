import { chromium } from 'playwright';

const url = process.argv[2] || 'http://localhost:5180';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(1000);

const before = await page.evaluate(() => window.__DEBUG__.flow.shipScene.player.rig.position.toArray());
console.log('Before:', before);

await page.keyboard.down('KeyW');
await page.waitForTimeout(3000);
await page.keyboard.up('KeyW');
await page.waitForTimeout(200);

const after = await page.evaluate(() => window.__DEBUG__.flow.shipScene.player.rig.position.toArray());
console.log('After moving forward 1.5s:', after);

await page.screenshot({ path: process.argv[3] || 'movement.png' });

const promptState = await page.evaluate(() => document.getElementById('interact-prompt')?.classList.contains('visible'));
console.log('Interact prompt visible near console:', promptState);

await page.keyboard.down('KeyE');
await page.waitForTimeout(100);
await page.keyboard.up('KeyE');
await page.waitForTimeout(300);

const toastPresent = await page.evaluate(() => !!document.querySelector('.toast'));
console.log('Toast appeared after E press:', toastPresent);

await browser.close();
