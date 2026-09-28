// Level 3 (Vessek Anchorage, docs/DESIGN.md §6) and the ending, end to end through player-facing
// controls: the map's Set Course button, E to interact, number keys in dialogue, the ring bus's
// levers and lockout boxes, crawling and climbing the hall duct, and the repair station. Long moves
// between sites teleport; the duct is walked. Every step asserts.
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
const kind = () => page.evaluate(() => window.__DEBUG__?.engine.getCurrentScene()?.kind);
const waitScene = (k) => page.waitForFunction((k) => window.__DEBUG__?.engine.getCurrentScene()?.kind === k, k, { timeout: 240000, polling: 500 });
const state = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__DEBUG__.gameState.data)));
const flag = async (f) => (await state()).flags.includes(f);
async function teleport(x, y, z, yaw = 0) {
  await page.evaluate(({ x, y, z, yaw }) => {
    const s = window.__DEBUG__?.engine.getCurrentScene();
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
// The trip: First light's throttle, then the cruise, held to skip. The skip lands on the docking
// arrival (DESIGN.md §5, the Vessek variant): the title "Vessek Anchorage" over the Wren coming to
// rest at the Lantern Bay's collar, before the cut to the level.
await page.waitForSelector('.first-light-hint', { timeout: 60000 });
await page.keyboard.down('Space');
await page.waitForFunction(() => window.__DEBUG__.engine.getCurrentScene()?.power?.stage === 'full', null, { timeout: 30000, polling: 100 });
await page.keyboard.up('Space');
await page.waitForSelector('.hold-skip', { timeout: 60000 });
await page.keyboard.down('Space');
await page.waitForTimeout(1100);
await page.keyboard.up('Space');
const title = await page.waitForFunction(() => document.querySelector('.cruise-title.visible')?.getAttribute('aria-label'), null, { timeout: 5000, polling: 100 }).then((h) => h.jsonValue(), () => null);
check('the cruise arrives under the title "Vessek Anchorage"', title === 'Vessek Anchorage', String(title));
const docked = await page.waitForFunction(() => {
  const s = window.__DEBUG__.engine.getCurrentScene();
  return s?.kind !== 'CruiseScene' ? 'cut' : s.shipPos.distanceTo(s.berth) < 0.01 ? 'docked' : null;
}, null, { timeout: 15000, polling: 100 }).then((h) => h.jsonValue(), () => 'timeout');
check('and the Wren comes to rest at her berth before the cut', docked === 'docked', docked);
await page.waitForFunction(() => window.__DEBUG__.engine.getCurrentScene()?.kind === 'VessekScene' && !window.__DEBUG__.flow.isTransitioning(), null, { timeout: 240000, polling: 250 });
await page.waitForTimeout(2500);
check('Set Course lands at the Anchorage', (await kind()) === 'VessekScene');
check('arrival card names level 3', (await page.textContent('.chapter-card').catch(() => ''))?.includes('Level 3'));

// 2. Varro, and the deal: it sends you to the aft junction (docs/DESIGN.md §6, Shō).
await teleport(-2.6, 0.2, 0.2, 0);
await press('KeyE');
check('Varro talks', (await speaker()) === 'Harbormaster Ilse Varro');
await press('Digit2'); // What do you want for conduit alloy?
const lockedOptions = await page.$$eval('.dialogue-option.locked', (b) => b.length);
check('stat-gated offers appear locked at level-1 stats', lockedOptions >= 2, `${lockedOptions} locked`);
await press('Digit1'); // The core is my only way home
await press('Digit1'); // How?
check('she names the aft junction', (await page.textContent('#dialogue-text'))?.includes('aft junction'));
await press('Digit1'); // I'll get it back on the bus
check('the deal is struck, and no pulse yet', (await flag('vessek_varro_met')) && !(await flag('vessek_pulse')));
check('the objective sends you to Dace for the ducts', (await page.textContent('#objective-text'))?.includes('Dace'));

// 3. Ki: Dace's lamp board. "Light the school's lamps by switching something else off."
await teleport(-15.4, 0.2, 6.5, Math.PI / 2);
await press('KeyE');
check('Dace talks, in the school hold', (await speaker()) === 'Dace');
await press('Digit1'); // Full?
await press('Digit1'); // Let me look at your board
const busState = () => page.evaluate(() => { const s = window.__DEBUG__.engine.getCurrentScene(); return { load: s.bus.load(), trips: s.bus.trips, on: [...s.bus.on], phase: s.bus.phase, frost: s.bus.frost.remaining, locked: [...s.bus.locked] }; });
check('the ring runs at five of six units', (await busState()).load === 5);
await teleport(-13.9, 0.2, 3.2, -Math.PI / 2);
await press('KeyE'); // the school lamps, with nothing switched off
let b = await busState();
check('the school lamps overload it: a trip, everything but the regulator drops', b.trips === 1 && b.load === 1, JSON.stringify(b));
await press('KeyE');
b = await busState();
check('on a quiet bus they light, and the school is lit', b.on.includes('school') && (await flag('vessek_school_lit')), JSON.stringify(b));
check('the trip took the duct fans off: the ducts are open', !b.on.includes('fans'));

// 4. Shō, through the hall duct: crawl, climb the ladder, and drop into the junction.
const pos = () => page.evaluate(() => { const p = window.__DEBUG__.engine.getCurrentScene().player.rig.position; return { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2) }; });
const face = (yaw) => page.evaluate((yaw) => { window.__DEBUG__.engine.getCurrentScene().player.yaw = yaw; }, yaw);
async function walk(ms) {
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(ms);
  await page.keyboard.up('KeyW');
}
await teleport(2, 0.2, -10.6, 0);
await walk(1200);
check('standing, the duct’s mouth stops you', (await pos()).z > -11.6, JSON.stringify(await pos()));
await page.keyboard.down('KeyC');
await walk(2600);
await page.keyboard.up('KeyC');
await page.waitForTimeout(300);
check('crouched you crawl in, and under the duct’s roof you stay crouched', (await pos()).z < -13 && (await page.evaluate(() => window.__DEBUG__.engine.getCurrentScene().player.crouching)));
await face(-Math.PI / 2);
await walk(5600);
check('along the duct to the ladder', Math.abs((await pos()).x - 10) < 0.8, JSON.stringify(await pos()));
await walk(2500);
check('W climbs the ladder to the upper run', (await pos()).y > 2.4, JSON.stringify(await pos()));
await face(0);
await walk(3000);
await face(-Math.PI / 2);
await walk(5600);
await face(0);
await walk(3000);
await page.waitForTimeout(800);
const inJunction = await pos();
check('and out of its mouth, down into the aft junction', inJunction.y < 0.3 && inJunction.x > 12.4 && inJunction.z < -20.4, JSON.stringify(inJunction));
await teleport(21, 0.2, -34.2, 0);
await press('KeyE');
check('the junction goes back on the bus', await flag('vessek_junction_reset'));
// Out through the junction's door (it opens from inside) and back through the tanker.
await teleport(13.6, 0.2, -30, Math.PI / 2);
await press('KeyE');
await walk(2600);
check('the junction door opens from inside, into the tanker', (await pos()).x < 7.5, JSON.stringify(await pos()));
await teleport(-2, 0.2, -18, Math.PI);
await walk(2600);
check('the tanker hatch is open before the pulse', (await pos()).z > -11, JSON.stringify(await pos()));

// 5. Ten: tell Varro, and the rehearsal pulse.
await teleport(-2.6, 0.2, 0.2, 0);
await press('KeyE');
check('Varro hears the junction is back', (await page.textContent('#dialogue-text'))?.includes('junction'));
await press('Digit1');
await page.waitForTimeout(7500);
check('the rehearsal pulse fired', await flag('vessek_pulse'));
check('the objective points at the lockouts', (await page.textContent('#objective-text'))?.includes('lock out'));
check('the frost meter is showing', await page.isVisible('.hud-meter.visible'));
await teleport(-2, 0.2, -10.4, 0);
await walk(1800);
check('the pulse sealed the tanker hatch from the hall side', (await pos()).z > -16.3, JSON.stringify(await pos()));

// 6. Ketsu. Load the bus with the auto-resets still live: they come back and trip it.
await teleport(22.2, 0.2, -27.5, -Math.PI / 2);
await press('KeyE'); // pumps
await teleport(22.2, 0.2, -29, -Math.PI / 2);
await press('KeyE'); // heaters
b = await busState();
check('the pumps and heaters come up: five units', b.on.includes('heaters') && b.load === 5, JSON.stringify(b));
const frostBefore = b.frost;
await page.waitForFunction(() => window.__DEBUG__.engine.getCurrentScene().bus.trips > 1, null, { timeout: 40000, polling: 100 }).catch(() => {});
b = await busState();
check('the hall lamps switch themselves back on and trip it', b.trips === 2 && !b.on.includes('heaters'), JSON.stringify(b));
check('the trip costs the bay warmth', b.frost < frostBefore - 9, `${frostBefore.toFixed(1)} -> ${b.frost.toFixed(1)}`);
// The lockouts, in the ducts.
await page.keyboard.down('KeyC');
await teleport(-18, 2.55, -24.6, 0);
await press('KeyE');
await teleport(10, 2.55, -16, Math.PI);
await press('KeyE');
await page.keyboard.up('KeyC');
b = await busState();
check('both auto-resets locked out, in their ducts', b.locked.includes('dock') && b.locked.includes('lamps') && (await flag('vessek_lockout_dock')) && (await flag('vessek_lockout_lamps')), JSON.stringify(b));
await page.evaluate(() => { const s = window.__DEBUG__.engine.getCurrentScene(); for (const id of ['dock', 'lamps']) s.bus.throwLever(id, false); });
await teleport(22.2, 0.2, -29, -Math.PI / 2);
await press('KeyE'); // heaters, without the pumps
check('the heaters refuse without the pumps', !(await busState()).on.includes('heaters'));
await teleport(22.2, 0.2, -27.5, -Math.PI / 2);
await press('KeyE'); // pumps
await teleport(22.2, 0.2, -29, -Math.PI / 2);
await press('KeyE'); // heaters
await teleport(-6.2, 0.2, -20, Math.PI / 2);
await press('KeyE'); // scrubbers
await page.waitForTimeout(1500);
check('pumps, heaters and scrubbers in six units: the bay is saved', await flag('vessek_power_restored'));
check('frost meter hidden', !(await page.isVisible('.hud-meter.visible')));
await page.waitForTimeout(4500);

// 7. The ledger, then Varro's reversal and the alloy.
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

// 8. Home, comms, the ending.
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
// The ending skips to the credits on a held key (src/ui/HoldToSkip.ts).
await page.waitForSelector('.hold-skip', { timeout: 180000 });
await page.keyboard.down('Space');
await page.waitForTimeout(1100);
await page.keyboard.up('Space');
await page.waitForSelector('.credits-roll.visible', { timeout: 15000 });
const credits = await page.textContent('.credits-roll');
// The only CC BY asset left is the planet maps (docs/ASSET_LICENSE_LOG.md): its attribution must roll.
check('credits name the team slot and the CC BY planet maps', credits.includes('team #') && credits.includes('CC BY 4.0') && /solar system scope/i.test(credits));
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
