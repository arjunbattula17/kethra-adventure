import { chromium } from 'playwright';

const url = process.argv[2] || 'http://localhost:5180';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (msg) => console.log('[console]', msg.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(url, { waitUntil: 'load' });

await page.waitForSelector('#power-puzzle-panel', { timeout: 20000 });
await page.waitForTimeout(1500);
const hint = await page.$eval('#power-puzzle-panel .subtitle', (el) => el.textContent).catch(() => null);
console.log('HINT:', hint);
const nodeTexts = await page.$$eval('.power-node', (els) => els.map((e) => e.textContent));
console.log('NODES:', nodeTexts);

await page.click('.power-node:has-text("Shields")').catch((e) => console.log('click shields failed', e.message));
await page.waitForTimeout(500);

const heading1 = await page.$eval('#power-puzzle-panel h2', (el) => el.textContent).catch(() => 'GONE');
console.log('Heading after click:', heading1);

await page.waitForTimeout(2500);
const heading2 = await page.$eval('#power-puzzle-panel h2', (el) => el.textContent).catch(() => 'GONE');
console.log('Heading after 2.5s more:', heading2);

await browser.close();
