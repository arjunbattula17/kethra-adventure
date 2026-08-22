import { chromium } from 'playwright';

const baseUrl = process.argv[2] || 'http://localhost:5180';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('console', (msg) => { if (msg.type() === 'error') errors.push('CONSOLE ' + msg.text()); });

await page.goto(baseUrl + '?skipIntro=1&unlockKethra=1', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__DEBUG__?.gameState, { timeout: 10000 });
await page.waitForTimeout(300);

await page.evaluate(() => {
  const { gameState } = window.__DEBUG__;
  gameState.setFlag('kethra_mechanism_solved');
  gameState.addResource('resonant_crystal', 3);
  gameState.addAttributeXp('archaeology', 5);
  gameState.setObjective('TEST OBJECTIVE MARKER');
});
await page.evaluate(() => window.__DEBUG__.gameState && localStorage.setItem('kethra_save_v1', window.__DEBUG__.gameState.toJSON()));

const savedRaw = await page.evaluate(() => localStorage.getItem('kethra_save_v1'));
console.log('Save written, length:', savedRaw?.length);
const savedParsed = JSON.parse(savedRaw);
console.log('Saved objective:', savedParsed.objective, '| archaeology:', savedParsed.attributes.archaeology);

// Fresh page load should pick up the save automatically (no newGame param).
await page.goto(baseUrl, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__DEBUG__?.gameState, { timeout: 10000 });
await page.waitForTimeout(500);

const restored = await page.evaluate(() => ({
  objective: window.__DEBUG__.gameState.data.objective,
  archaeology: window.__DEBUG__.gameState.data.attributes.archaeology,
  solved: window.__DEBUG__.gameState.hasFlag('kethra_mechanism_solved'),
}));
console.log('Restored after reload:', JSON.stringify(restored));

// Clean up so we don't leave a save behind for future test runs.
await page.evaluate(() => localStorage.removeItem('kethra_save_v1'));

console.log('Errors:', errors.length ? errors.join('\\n') : 'none');
await browser.close();
