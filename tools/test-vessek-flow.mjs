// Level 3 (Vessek Anchorage) and the ending, end to end through player-facing controls: the map's
// Set Course button, E to interact, number keys in dialogue, clicks in the breaker panel and the
// repair station. Movement between sites uses teleport (walking is covered by movement-check).
// Every step asserts.
//
//   npx vite preview   (in another terminal)
//   node tools/test-vessek-flow.mjs [baseUrl]
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:4173/kethra-adventure/';
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};
const kind = () => page.evaluate(() => window.__DEBUG__.engine.getCurrentScene()?.kind);
const waitScene = (k) => page.waitForFunction((k) => window.__DEBUG__.engine.getCurrentScene()?.kind === k, k, { timeout: 240000, polling: 500 });
const state = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__DEBUG__.gameState.data)));
const flag = async (f) => (await state()).flags.includes(f);
async function teleport(x, y, z, yaw = 0) {
  await page.evaluate(({ x, y, z, yaw }) => {
    const s = window.__DEBUG__.engine.getCurrentScene();
    s.player.teleport(new s.player.rig.position.constructor(x, y, z), yaw);
  }, { x, y, z, yaw });
  await page.waitForTimeout(500);
}
async function press(code, hold = 120) {
  await page.keyboard.down(code);
  await page.waitForTimeout(hold);
  await page.keyboard.up(code);
  await page.waitForTimeout(450);
}
const speaker = () => page.textContent('#dialogue-speaker').catch(() => null);

await page.goto(`${BASE}?skipIntro=1&unlockVessek=1&newGame=1&tier=low`, { waitUntil: 'domcontentloaded' });
await waitScene('ShipInteriorScene');
await page.waitForTimeout(1000);

// 1. Travel through the map to the ring.
await page.evaluate(() => window.__DEBUG__.bus.emit('ui:open_galaxy_map'));
await page.waitForSelector('.map-btn.primary', { timeout: 10000 });
const vessekHit = await page.evaluate(() => {
  const m = window.__DEBUG__.mapController;
  const t = m.hitTargets.find((x) => x.id === 'vessek');
  const r = m.canvas.getBoundingClientRect();
  return t ? { x: r.left + t.x / devicePixelRatio, y: r.top + t.y / devicePixelRatio } : null;
});
check('Vessek is on the chart', !!vessekHit);
if (vessekHit) await page.mouse.click(vessekHit.x, vessekHit.y);
await page.waitForTimeout(500);
check('dossier shows Vessek Anchorage', (await page.textContent('.map-dossier-name'))?.includes('Vessek'));
await page.click('.map-btn.primary');
await waitScene('VessekScene');
await page.waitForTimeout(2500);
check('Set Course lands at the Anchorage', (await kind()) === 'VessekScene');
check('arrival card names level 3', (await page.textContent('.chapter-card').catch(() => ''))?.includes('Level 3'));

// 2. Dace at the collar.
await teleport(-4.2, 0.2, 5.2, 1.57);
await press('KeyE');
check('Dace talks', (await speaker()) === 'Dace');
await press('Escape');

// 3. Varro, and the pulse.
await teleport(-2.6, 0.2, 0.2, 0);
await press('KeyE');
check('Varro talks', (await speaker()) === 'Harbormaster Ilse Varro');
await press('Digit2'); // What do you want for conduit alloy?
const lockedOptions = await page.$$eval('.dialogue-option.locked', (b) => b.length);
check('stat-gated offers appear locked at level-1 stats', lockedOptions >= 2, `${lockedOptions} locked`);
await press('Digit1'); // The core is my only way home
await press('Digit1'); // …
await page.waitForTimeout(7500);
check('the rehearsal pulse fired', await flag('vessek_pulse'));
check('objective points at the breakers', (await page.textContent('#objective-text'))?.includes('breaker'));
check('frost meter is showing', await page.isVisible('.hud-meter.visible'));

// 4. The breakers: an overload trip, a frost-out retry, then the solution.
await teleport(4.6, 0.2, -8.8, 0);
await press('KeyE');
check('breaker panel opens', await page.isVisible('#breaker-panel'));
const clickBreaker = (name) => page.click(`#breaker-panel button[aria-label$="${name}"]`);
await clickBreaker('Circulation pumps');
await page.waitForTimeout(200);
await clickBreaker('Hydroponics heaters');
await page.waitForTimeout(200);
check('asking for more than 6 units trips the bus', (await page.textContent('.breaker-msg'))?.includes('Overload'));
await page.evaluate(() => { window.__DEBUG__.engine.getCurrentScene().frost.remaining = 0.2; });
await page.waitForTimeout(800);
check('frost-out gives an immediate retry', (await page.textContent('.breaker-msg'))?.includes('one more try'));
check('frost clock refilled', (await page.evaluate(() => window.__DEBUG__.engine.getCurrentScene().frost.remaining)) > 100);
await clickBreaker('Dock lights');
await clickBreaker('Lantern Bay hall lamps');
await clickBreaker('Hydroponics heaters');
check('heaters refuse to run without the pumps', (await page.textContent('.breaker-msg'))?.includes('pumps'));
await clickBreaker('Circulation pumps');
await clickBreaker('Hydroponics heaters');
await clickBreaker('Air scrubbers');
await page.waitForTimeout(1800);
check('power restored', await flag('vessek_power_restored'));
check('frost meter hidden', !(await page.isVisible('.hud-meter.visible')));
await page.waitForTimeout(4500);

// 5. The ledger, then Varro's reversal and the alloy.
await teleport(-4.2, 0.2, 1.4, 1.57);
await press('KeyE');
check('the ledger opens as a readable document', (await page.textContent('.doc-panel h2').catch(() => ''))?.includes('Ledger'));
await press('Escape');
check('ledger read', await flag('vessek_ledger_read'));
await teleport(-2.6, 0.2, 0.2, 0);
await press('KeyE');
check('Varro raises the eleven days', (await page.textContent('#dialogue-text'))?.includes('eleven days'));
await press('Digit1');
await press('Digit1');
const s5 = await state();
check('alloy handed over', s5.flags.includes('vessek_alloy_given') && s5.shipSystems.communications.haveAmount === 2);
await page.waitForTimeout(600);
check('level 3 complete card', (await page.textContent('.chapter-card').catch(() => ''))?.includes('Level 3 complete'));

// 6. Home, comms, the ending.
await teleport(2, 0.2, 10.4, Math.PI);
await press('KeyE');
await waitScene('ShipInteriorScene');
await page.waitForTimeout(1500);
check('back aboard the Wren', (await kind()) === 'ShipInteriorScene');
check('objective says repair comms', (await page.textContent('#objective-text'))?.includes('comms'));
await page.evaluate(() => window.__DEBUG__.bus.emit('ui:open_repair'));
await page.waitForTimeout(500);
await page.click('.repair-row:has-text("Long-Range Comms") button');
await page.waitForTimeout(1500);
check('comms repair offers the transmission', (await page.textContent('.panel h2').catch(() => ''))?.includes('Send the ledger home'));
await page.click('button:has-text("Transmit")');
await waitScene('EndingScene');
check('the ending plays', (await kind()) === 'EndingScene');
await page.waitForTimeout(6000);
await page.keyboard.press('Space');
await page.waitForSelector('.credits-roll.visible', { timeout: 15000 });
const credits = await page.textContent('.credits-roll');
check('credits name the team slot and CC BY assets', credits.includes('team #') && credits.includes('CC BY 3.0') && credits.includes('CC BY 4.0'));
await page.screenshot({ path: 'renders/test-vessek-credits.png' });
// Focus lands on "Keep exploring": Enter is the keyboard-only path.
check('credits focus the first action', await page.evaluate(() => document.activeElement?.textContent === 'Keep exploring'));
await page.keyboard.press('Enter');
await waitScene('ShipInteriorScene');
check('keep exploring returns to the Wren', (await kind()) === 'ShipInteriorScene' && (await flag('ending_seen')));

check('no console errors', errors.length === 0, [...new Set(errors)].slice(0, 5).join(' | '));
await browser.close();
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
