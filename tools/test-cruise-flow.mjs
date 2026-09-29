// First light and the cruise from the Wren to Kethra, with real input: the first trip holds the
// throttle through four ignitions, cuts to the cruise with no loading screen, holds to skip to the
// arrival, and reaches the level. A second trip takes the short departure.
//
//   npm run build && npx vite preview --port 4180 --strictPort   (in another terminal)
//   node tools/test-cruise-flow.mjs [baseUrl]
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:4180/kethra-adventure/';
let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
  if (!ok) failed++;
}

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const until = (fn, ms, arg) => page.waitForFunction(fn, arg, { timeout: ms, polling: 100 }).then(() => true, () => false);
const kind = () => page.evaluate(() => window.__DEBUG__.engine.getCurrentScene()?.kind);
const holdSpace = async (ms) => { await page.keyboard.down('Space'); await page.waitForTimeout(ms); await page.keyboard.up('Space'); };

await page.goto(`${BASE}?newGame=1&skipIntro=1&unlockKethra=1&tier=low&seed=7`, { waitUntil: 'domcontentloaded' });
await until(() => window.__DEBUG__?.engine.getCurrentScene()?.kind === 'ShipInteriorScene' && !window.__DEBUG__.flow.isTransitioning(), 240000);
await page.evaluate(() => window.__DEBUG__.flow.tutorial?.skip?.());
await page.waitForTimeout(800);
check('before the first trip, First light has not happened', !(await page.evaluate(() => window.__DEBUG__.gameState.hasFlag('first_light'))));

// Set Course on the galaxy map, sent as its event.
await page.evaluate(() => window.__DEBUG__.bus.emit('galaxy:travel_to', 'kethra'));
check('the throttle is offered with a held-input hint', await until(() => !!document.querySelector('.first-light-hint'), 30000));
check('the cabin has fallen to emergency power', (await page.evaluate(() => window.__DEBUG__.engine.getCurrentScene().power.stage)) === 'emergency');
await holdSpace(500);
await page.waitForTimeout(1500);
check('letting go midway fails nothing: still at the helm, still offered', (await kind()) === 'ShipInteriorScene' && !!(await page.$('.first-light-hint')));
await page.keyboard.down('Space');
check('holding through four ignitions brings the Wren to full power', await until(() => window.__DEBUG__.engine.getCurrentScene().power?.stage === 'full', 15000));
await page.keyboard.up('Space');
let spinner = false;
const watch = setInterval(async () => { spinner ||= await page.evaluate(() => !!document.querySelector('.loading-indicator.visible')).catch(() => false); }, 100);
check('the cut lands in the cruise', await until(() => window.__DEBUG__.engine.getCurrentScene()?.kind === 'CruiseScene', 30000));
clearInterval(watch);
check('no loading screen at the cut', !spinner);
check('First light is recorded', await page.evaluate(() => window.__DEBUG__.gameState.hasFlag('first_light')));
check('the day counter shows during the transit', await until(() => /^Day \d+$/.test(document.querySelector('.cruise-days.visible')?.textContent ?? ''), 40000));
await page.waitForSelector('.hold-skip', { timeout: 10000 });
await holdSpace(1100);
check('holding to skip lands on the arrival title', await until(() => document.querySelector('.cruise-title.visible')?.getAttribute('aria-label') === 'Kethra', 5000));
// The canopy descent itself is flown by tools/test-mg2-flow.mjs.
check('the first arrival hands the skiff to the player: MG2 begins', await until(() => window.__DEBUG__.engine.getCurrentScene()?.kind === 'CanopyScene' && window.__DEBUG__.engine.getCurrentScene().state().phase === 'fly', 120000));
await page.evaluate(() => window.__DEBUG__.miniGame()?.win());
check('and then on Kethra', await until(() => window.__DEBUG__.engine.getCurrentScene()?.kind === 'KethraScene' && !window.__DEBUG__.flow.isTransitioning(), 240000));

// A later trip: the short departure (no throttle), then the cruise again.
await page.evaluate(() => window.__DEBUG__.engine.getCurrentScene().onDepart?.());
await until(() => window.__DEBUG__.engine.getCurrentScene()?.kind === 'ShipInteriorScene' && !window.__DEBUG__.flow.isTransitioning(), 120000);
check('back aboard after the first departure, the Wren is at full power', (await page.evaluate(() => window.__DEBUG__.engine.getCurrentScene().power.stage)) === 'full');
await page.evaluate(() => window.__DEBUG__.bus.emit('galaxy:travel_to', 'kethra'));
let offered = false;
const watch2 = setInterval(async () => { offered ||= await page.evaluate(() => !!document.querySelector('.first-light-hint')).catch(() => false); }, 100);
check('a later departure goes straight to the cruise', await until(() => window.__DEBUG__.engine.getCurrentScene()?.kind === 'CruiseScene', 30000));
clearInterval(watch2);
check('without the throttle hold', !offered);

check('no page or console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
