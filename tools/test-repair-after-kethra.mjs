import { chromium } from 'playwright';

const baseUrl = process.argv[2] || 'http://localhost:5180';
const url = baseUrl + '?skipIntro=1&unlockKethra=1';
const outDir = process.argv[3] || '.';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__DEBUG__?.gameState, { timeout: 10000 });

await page.evaluate(() => {
  const { gameState } = window.__DEBUG__;
  gameState.setFlag('kethra_mechanism_solved');
  gameState.addResource('resonant_crystal', 3);
});
await page.evaluate(() => window.__DEBUG__.bus.emit('ui:open_repair'));
await page.waitForTimeout(400);
const navRow = await page.evaluate(() => {
  const rows = Array.from(document.querySelectorAll('.repair-row'));
  const nav = rows.find((r) => r.textContent.includes('Navigation'));
  return nav ? nav.textContent : null;
});
console.log('Navigation repair row:', navRow);
const btn = await page.$$('.repair-row button:not([disabled])');
console.log('Repairable buttons:', btn.length);
if (btn.length) {
  await btn[0].click();
  await page.waitForTimeout(300);
}
await page.screenshot({ path: `${outDir}/repair_after_kethra.png` });
await browser.close();
