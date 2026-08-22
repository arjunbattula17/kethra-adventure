import { chromium } from 'playwright';

const url = process.argv[2] || 'http://localhost:5180';
const outPath = process.argv[3] || 'screenshot.png';
const waitMs = Number(process.argv[4] || 1500);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push('CONSOLE ERROR: ' + msg.text());
});
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(waitMs);
await page.screenshot({ path: outPath });
await browser.close();
if (errors.length) {
  console.log('ERRORS:\n' + errors.join('\n'));
} else {
  console.log('No console errors. Screenshot saved to ' + outPath);
}
