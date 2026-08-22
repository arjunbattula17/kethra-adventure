import { chromium } from 'playwright';

const baseUrl = process.argv[2] || 'http://localhost:5180';
const url = baseUrl + (baseUrl.includes('?') ? '&' : '?') + 'skipIntro=1&unlockKethra=1';
const outDir = process.argv[3] || '.';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('console', (msg) => { if (msg.type() === 'error') errors.push('CONSOLE ' + msg.text()); });
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__DEBUG__?.gameState, { timeout: 10000 });
await page.waitForTimeout(500);

await page.evaluate(() => window.__DEBUG__.bus.emit('galaxy:travel_to', 'kethra'));
await page.waitForTimeout(3000);
await page.screenshot({ path: `${outDir}/kethra_landing.png` });

// Walk toward the NPCs / west terrace to look around.
await page.keyboard.down('KeyW');
await page.waitForTimeout(2500);
await page.keyboard.up('KeyW');
await page.waitForTimeout(300);
await page.screenshot({ path: `${outDir}/kethra_walk1.png` });

console.log('Errors so far:', errors.length ? errors.join('\\n') : 'none');
await browser.close();
