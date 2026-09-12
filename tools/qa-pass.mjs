import { chromium } from 'playwright';

const baseUrl = process.argv[2] || 'http://localhost:5180';
const outDir = process.argv[3] || '.';
// Software GL and no background throttling: the opening is frame-driven now, so a throttled
// render loop would make the first check time out for reasons that have nothing to do with it.
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('console', (msg) => { if (msg.type() === 'error') errors.push('CONSOLE ' + msg.text()); });

console.log('=== Fresh boot, real timing, no dev params ===');
await page.goto(baseUrl + '?newGame=1', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__DEBUG__?.gameState, { timeout: 30000 });
// The opening is the tutorial now: cold-open captions, then the first instruction card. The galaxy
// reveal must not start at all until the player boots the console themselves.
// Real timing includes the full intro cinematic (~32s) plus the interior build and its warm-up
// frame, all magnified under software rendering — hence the long ceiling.
await page.waitForSelector('.tut-card.visible', { timeout: 300000 }).catch(() => null);
const openingCard = await page.$eval('.tut-card.visible .tut-title', (el) => el.textContent).catch(() => null);
console.log('Opening step shown:', openingCard ?? 'NONE — tutorial did not start');
console.log('First game did NOT auto-start:', !(await page.evaluate(() => !!window.__DEBUG__.engine.getCurrentScene()?.ship)));
await page.screenshot({ path: `${outDir}/qa_natural_opening.png` });

console.log('=== Edge case: rapid Escape spam with nothing open ===');
for (let i = 0; i < 10; i++) await page.keyboard.press('Escape');
console.log('No crash after Escape spam. Errors so far:', errors.length);

console.log('=== Edge case: E with nothing nearby ===');
await page.keyboard.down('KeyE');
await page.waitForTimeout(50);
await page.keyboard.up('KeyE');
console.log('No crash after empty E-press.');

console.log('=== Edge case: window resize mid-scene ===');
await page.setViewportSize({ width: 800, height: 600 });
await page.waitForTimeout(200);
await page.setViewportSize({ width: 1280, height: 720 });
await page.waitForTimeout(200);
console.log('Resize handled without crash.');

console.log('=== Edge case: TAB character panel while nothing else open ===');
await page.keyboard.press('Tab');
await page.waitForTimeout(300);
const charPanelOpen = await page.evaluate(() => !!document.querySelector('.panel-overlay.visible'));
console.log('Character panel opened via TAB:', charPanelOpen);
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

console.log('=== Edge case: try locked galaxy destination ===');
await page.evaluate(() => window.__DEBUG__.bus.emit('galaxy:travel_to', 'orrun'));
await page.waitForTimeout(300);
const stillSameScene = await page.evaluate(() => !!window.__DEBUG__.engine.getCurrentScene());
console.log('Scene still valid after locked-planet travel attempt:', stillSameScene);

console.log('=== Edge case: open journal before logs_available ===');
await page.evaluate(() => window.__DEBUG__.bus.emit('ui:open_journal'));
await page.waitForTimeout(300);
const journalOpenedEarly = await page.evaluate(() => !!document.querySelector('#journal-panel'));
console.log('Journal opens even if not flagged (bus event has no gate, expected true; gate is only on the 3D interactable):', journalOpenedEarly);
await page.keyboard.press('Escape');

console.log('Total errors across QA pass:', errors.length);
if (errors.length) console.log(errors.join('\\n'));
await browser.close();
