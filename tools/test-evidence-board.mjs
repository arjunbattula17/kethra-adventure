import { chromium } from 'playwright';

const baseUrl = process.argv[2] || 'http://localhost:5180';
const outDir = process.argv[3] || '.';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('console', (msg) => { if (msg.type() === 'error') errors.push('CONSOLE ' + msg.text()); });
await page.goto(baseUrl + '?skipIntro=1&unlockKethra=1', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__DEBUG__?.gameState, { timeout: 10000 });

await page.evaluate(() => {
  const { gameState } = window.__DEBUG__;
  gameState.addClue({ id: 'kethra_clue_kindling_vanishing', title: 'The Kindling Vanished', summary: 'Every light called home at once.', source: 'test' });
  gameState.addClue({ id: 'kethra_clue_ship_echo', title: 'It Happened to My Ship Too', summary: 'The same pattern.', source: 'test' });
});
await page.evaluate(() => window.__DEBUG__.bus.emit('ui:open_journal'));
await page.waitForTimeout(300);
await page.click('button:has-text("Evidence Board")');
await page.waitForTimeout(300);
await page.screenshot({ path: `${outDir}/evidence_board.png` });

const count = await page.$$eval('.clue-node', (els) => els.length);
console.log('clue nodes found:', count);
if (count >= 2) {
  await page.evaluate(() => document.querySelectorAll('.clue-node')[0].click());
  await page.waitForTimeout(200);
  await page.evaluate(() => document.querySelectorAll('.clue-node')[1].click());
  await page.waitForTimeout(300);
}
const connectionsText = await page.$eval('#evidence-connections', (el) => el.textContent).catch(() => null);
console.log('connections text:', connectionsText);
console.log('errors:', errors.length ? errors.join('\\n') : 'none');
await browser.close();
