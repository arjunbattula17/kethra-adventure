// Browser test of the Canopy minigame (MG2) with real input: WASD steers, Shift brakes, the mouse
// aims the lamp, a scrape costs a hull pip and three trigger a climb back, and the descent is flown
// to touchdown by steering at each layer's gap (src/planets/kethra/canopy).
//
//   npm run build && npx vite preview --port 4180 --strictPort   (in another terminal)
//   node tools/test-mg2-flow.mjs [baseUrl]
import { chromium } from 'playwright';
import * as layout from '../src/planets/kethra/canopy/layout.ts';

const BASE = process.argv[2] ?? 'http://localhost:4180/kethra-adventure/';
let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
  if (!ok) failed++;
}
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
const until = (page, fn, ms) => page.waitForFunction(fn, null, { timeout: ms, polling: 100 }).then(() => true, () => false);

/** Starts a new game and travels to Kethra, skipping the cruise, until the canopy scene is flying. */
async function reachCanopy(page, attrs = {}) {
  await page.goto(`${BASE}?newGame=1&skipIntro=1&unlockKethra=1&tier=low&seed=7`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__DEBUG__?.engine.getCurrentScene()?.kind === 'ShipInteriorScene' && !window.__DEBUG__.flow.isTransitioning(), null, { timeout: 240000, polling: 250 });
  await page.evaluate((attrs) => {
    window.__DEBUG__.flow.tutorial?.skip?.();
    window.__DEBUG__.gameState.setFlag('first_light');
    Object.assign(window.__DEBUG__.gameState.data.attributes, attrs);
    window.__DEBUG__.bus.emit('galaxy:travel_to', 'kethra');
  }, attrs);
  await page.waitForFunction(() => window.__DEBUG__.engine.getCurrentScene()?.kind === 'CruiseScene', null, { timeout: 60000, polling: 100 });
  await page.waitForSelector('.hold-skip', { timeout: 30000 });
  await page.keyboard.down('Space');
  await page.waitForTimeout(1100);
  await page.keyboard.up('Space');
  await page.waitForFunction(() => window.__DEBUG__.engine.getCurrentScene()?.kind === 'CanopyScene' && window.__DEBUG__.engine.getCurrentScene().state().phase === 'fly', null, { timeout: 180000, polling: 100 });
}

const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const state = () => page.evaluate(() => window.__DEBUG__.engine.getCurrentScene().state());
const put = (x, y, z) => page.evaluate(([x, y, z]) => { const s = window.__DEBUG__.engine.getCurrentScene(); s.pos.set(x, y, z); s.vel.set(0, 0, 0); }, [x, y, z]);

await reachCanopy(page);
check('after the cruise, the skiff is above the canopy and flying', (await state()).pos.y > 160);
check('the plate shows layer 1 of 5 and a full hull', /layer 1 of 5/.test(await page.textContent('.canopy-panel')) && (await page.$$('.canopy-pip.on')).length === 3);

// WASD strafe; Shift brakes.
let s0 = await state();
await page.keyboard.down('KeyD');
await page.waitForTimeout(700);
await page.keyboard.up('KeyD');
check('D strafes the skiff across (+z)', (await state()).pos.z > s0.pos.z + 0.5);
s0 = await state();
await page.waitForTimeout(1000);
const free = s0.pos.y - (await state()).pos.y;
await page.keyboard.down('ShiftLeft');
s0 = await state();
await page.waitForTimeout(1000);
const braked = s0.pos.y - (await state()).pos.y;
await page.keyboard.up('ShiftLeft');
check('Shift brakes the descent', braked < free * 0.6, `${braked.toFixed(2)} m braked vs ${free.toFixed(2)} m free, per second`);

// Aim the lamp ahead and down.
await page.mouse.move(900, 560);
await page.waitForTimeout(1200);
const lit = (await state()).lit;
check('the lamp wakes pods it touches', lit > 0, `${lit} lit`);

// A real scrape: drop onto a bough away from the gap.
const boughs = layout.buildBoughs();
const L2 = layout.LAYERS[1];
const target = boughs.find((b) => b.layer === 1 && !b.sway && Math.hypot(b.a.x - L2.gap.x, b.a.z - L2.gap.z) > L2.gap.r + 2);
await put(target.a.x, target.a.y + 2.2, target.a.z);
check('dropping onto a bough scrapes: a pip drops', await until(page, () => window.__DEBUG__.engine.getCurrentScene().state().pips === 2, 8000));
check('the scrape shows on the plate', (await page.$$('.canopy-pip.on')).length === 2);
// Force two more scrapes to reach three.
for (let i = 0; i < 2; i++) {
  await page.evaluate(() => window.__DEBUG__.miniGame()?.fail());
  await page.waitForTimeout(1000);
}
check('three scrapes climb back', await until(page, () => window.__DEBUG__.engine.getCurrentScene().state().phase === 'climb', 3000));
check('the climb ends above a gap with the hull restored', await until(page, () => { const s = window.__DEBUG__.engine.getCurrentScene().state(); return s.phase === 'fly' && s.pips === 3; }, 8000));

// Fly the whole descent by steering at the next layer's gap.
await put(layout.START.x, layout.START.y, layout.START.z);
await page.evaluate(() => { const s = window.__DEBUG__.engine.getCurrentScene(); s.passed = -1; s.pips = 3; });
const held = new Set();
const setKey = async (key, on) => {
  if (on && !held.has(key)) {
    await page.keyboard.down(key);
    held.add(key);
  }
  if (!on && held.has(key)) {
    await page.keyboard.up(key);
    held.delete(key);
  }
};
let scrapes = 0;
let lastPips = 3;
const flightStart = Date.now();
for (;;) {
  const st = await state();
  if (st.phase === 'landed' || Date.now() - flightStart > 400000) break;
  if (st.pips < lastPips) scrapes++;
  lastPips = st.pips;
  const next = layout.LAYERS.find((l) => l.y < st.pos.y - 1) ?? { y: 0, gap: { x: 0, z: 0 } };
  const dx = next.gap.x - st.pos.x;
  const dz = next.gap.z - st.pos.z;
  await setKey('KeyW', dx > 0.6);
  await setKey('KeyS', dx < -0.6);
  await setKey('KeyD', dz > 0.6);
  await setKey('KeyA', dz < -0.6);
  // Hold off above a gap that isn't centred yet.
  await setKey('ShiftLeft', Math.hypot(dx, dz) > 2 && st.pos.y - next.y < 9 && st.pos.y > next.y);
  await page.waitForTimeout(60);
}
for (const k of [...held]) await page.keyboard.up(k);
const end = await state();
check('the descent can be flown to touchdown by steering through the gaps', end.phase === 'landed', `${end.phase} at y ${end.pos.y.toFixed(1)}, ${((Date.now() - flightStart) / 1000).toFixed(0)} s, ${scrapes} scrapes`);

check('then Kethra, with the skiff as the way back', await until(page, () => window.__DEBUG__.engine.getCurrentScene()?.kind === 'KethraScene' && !window.__DEBUG__.flow.isTransitioning(), 240000));
check('the skiff is parked on the terrace', await page.evaluate(() => !!window.__DEBUG__.engine.getCurrentScene().scene.getObjectByName('skiff')));
const after = await page.evaluate(() => ({ flown: window.__DEBUG__.gameState.hasFlag('canopy_flown'), traversal: window.__DEBUG__.gameState.data.attributes.traversal }));
check('MG2 is recorded and awards +1 traversal', after.flown && after.traversal === 2, JSON.stringify(after));

// A later arrival lands straight on the terrace: no second descent.
await page.evaluate(() => window.__DEBUG__.engine.getCurrentScene().onDepart?.());
await page.waitForFunction(() => window.__DEBUG__.engine.getCurrentScene()?.kind === 'ShipInteriorScene' && !window.__DEBUG__.flow.isTransitioning(), null, { timeout: 120000, polling: 250 });
await page.evaluate(() => window.__DEBUG__.bus.emit('galaxy:travel_to', 'kethra'));
await page.waitForFunction(() => window.__DEBUG__.engine.getCurrentScene()?.kind === 'CruiseScene', null, { timeout: 60000, polling: 100 });
await page.waitForSelector('.hold-skip', { timeout: 30000 });
await page.keyboard.down('Space');
await page.waitForTimeout(1100);
await page.keyboard.up('Space');
let sawCanopy = false;
const watch = setInterval(async () => {
  sawCanopy ||= await page.evaluate(() => window.__DEBUG__.engine.getCurrentScene()?.kind === 'CanopyScene').catch(() => false);
}, 150);
await page.waitForFunction(() => window.__DEBUG__.engine.getCurrentScene()?.kind === 'KethraScene' && !window.__DEBUG__.flow.isTransitioning(), null, { timeout: 240000, polling: 250 });
clearInterval(watch);
check('a later arrival skips the descent', !sawCanopy);
check('no page or console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

const page2 = await browser.newPage({ viewport: { width: 1366, height: 768 } });
await reachCanopy(page2, { engineering: 2 });
const wide = await page2.evaluate(() => window.__DEBUG__.engine.getCurrentScene().state().lampAngle);
check('engineering 2 widens the lamp', wide >= 0.44, `${wide.toFixed(2)} rad against 0.32 at engineering 1`);

await browser.close();
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
