import { chromium } from 'playwright';

const url = process.argv[2] || 'http://localhost:5180';
const outDir = process.argv[3] || '.';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('console', (msg) => { if (msg.type() === 'error') errors.push('CONSOLE ' + msg.text()); });
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__DEBUG__?.gameState, { timeout: 10000 });

await page.evaluate(() => {
  const { gameState, bus } = window.__DEBUG__;
  gameState.setFlag('logs_available');
  gameState.setFlag('damage_assessed');
  gameState.setFlag('galaxy_revealed');
  gameState.data.planetsUnlocked.push('kethra');
  gameState.addResource('resonant_crystal', 5);
  gameState.addResource('conduit_alloy', 5);
});

async function testPanel(name, openEvent, expectSelector) {
  await page.evaluate((evt) => window.__DEBUG__.bus.emit(evt), openEvent);
  await page.waitForTimeout(400);
  const present = await page.$(expectSelector);
  await page.screenshot({ path: `${outDir}/ui_${name}.png` });
  console.log(name, ':', present ? 'OK' : 'MISSING ' + expectSelector);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

await testPanel('journal', 'ui:open_journal', '#journal-panel');
await testPanel('repair', 'ui:open_repair', '#repair-panel');
await testPanel('galaxymap', 'ui:open_galaxy_map', '.map-canvas');

// Try repairing a system now that resources were granted.
await page.evaluate(() => window.__DEBUG__.bus.emit('ui:open_repair'));
await page.waitForTimeout(300);
const repairButtons = await page.$$('.repair-row button:not([disabled])');
console.log('Repairable systems available:', repairButtons.length);
if (repairButtons.length > 0) {
  await repairButtons[0].click();
  await page.waitForTimeout(300);
  const doneCount = await page.$$eval('.status.done', (els) => els.length);
  console.log('Systems marked done after repair click:', doneCount);
}
await page.screenshot({ path: `${outDir}/ui_repair_after.png` });

console.log('Errors:', errors.length ? errors.join('\\n') : 'none');
await browser.close();
