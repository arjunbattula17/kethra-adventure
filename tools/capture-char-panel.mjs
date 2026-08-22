import { chromium } from 'playwright';

const url = process.argv[2] || 'http://localhost:5180?skipIntro=1';
const outPath = process.argv[3] || 'char.png';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__DEBUG__?.gameState, { timeout: 10000 });
await page.waitForTimeout(800);
await page.keyboard.press('Tab');
await page.waitForTimeout(400);
await page.screenshot({ path: outPath });
await browser.close();
