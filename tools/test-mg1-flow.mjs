// MG1 Intercept, played through with real input (docs/DESIGN.md §4, slot 1): aim with Shift and
// the arrows, set cells with [ and ], switch burns with 1 and 2, run with Space, rewind with R.
// The target headings come from the same model the game runs (src/galaxy/intercept/sim.ts).
//
//   npm run build && npx vite preview --port 4180 --strictPort   (in another terminal)
//   node tools/test-mg1-flow.mjs [baseUrl]
import { chromium } from 'playwright';
import * as sim from '../src/galaxy/intercept/sim.ts';

const BASE = process.argv[2] ?? 'http://localhost:4180/kethra-adventure/';
const DEG = Math.PI / 180;
let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
  if (!ok) failed++;
}

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});

async function openPlot(page, before) {
  await page.goto(`${BASE}?newGame=1&skipTutorial=1&tier=low&seed=7`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__DEBUG__?.engine.getCurrentScene()?.kind === 'GalaxyRevealScene', null, { timeout: 240000, polling: 200 });
  if (before) await page.evaluate(before);
  await page.waitForSelector('.hold-skip', { timeout: 180000 });
  await page.keyboard.down('Space');
  await page.waitForTimeout(1100);
  await page.keyboard.up('Space');
  await page.waitForFunction(() => window.__DEBUG__.engine.getCurrentScene().intercept?.state().phase === 'plot', null, { timeout: 60000, polling: 100 });
}

const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const state = () => page.evaluate(() => window.__DEBUG__.engine.getCurrentScene().intercept.state());
const until = (fn, ms) => page.waitForFunction(fn, null, { timeout: ms, polling: 100 }).then(() => true, () => false);
const phaseIs = (ph, ms = 20000) => until(new Function(`return window.__DEBUG__.engine.getCurrentScene().intercept?.state().phase === '${ph}'`), ms);
const legIs = (leg, ms = 30000) => until(new Function(`const s = window.__DEBUG__.engine.getCurrentScene().intercept?.state(); return s && s.leg === ${leg} && s.phase === 'plot';`), ms);
const note = () => page.evaluate(() => [...document.querySelectorAll('.intercept-label.note')].map((n) => n.textContent).join(' | '));

async function shiftPress(key, n) {
  await page.keyboard.down('Shift');
  for (let i = 0; i < n; i++) await page.keyboard.press(key);
  await page.keyboard.up('Shift');
}
/** Turns burn `index` to (az, el) one degree at a time, the way a player would. */
async function aimTo(index, az, el) {
  const p = (await state()).plans[index];
  const dAz = Math.round((((az - p.azimuth) / DEG + 540) % 360) - 180);
  const dEl = Math.round((el - p.elevation) / DEG);
  await shiftPress(dAz > 0 ? 'ArrowRight' : 'ArrowLeft', Math.abs(dAz));
  await shiftPress(dEl > 0 ? 'ArrowUp' : 'ArrowDown', Math.abs(dEl));
}

await openPlot(page, () => {
  const a = window.__DEBUG__.gameState.data.attributes;
  window.__mg1Before = { insight: a.insight, engineering: a.engineering };
});
const legs = sim.legs(1);

// Leg 1, "Clear the drift. Aim at ORION's buoy."
const toBuoy = sim.anglesOf(sim.sub(sim.BUOY, legs[0].start));
await aimTo(0, toBuoy.azimuth, 0);
await page.keyboard.press('Space');
check('leg 1: aimed at the buoy, the plot arrives and leg 2 begins', await legIs(2), JSON.stringify((await state()).outcome?.kind));
check('leg 2 starts from the buoy', sim.dist((await state()).start, sim.BUOY) < 1e-6);

// Leg 2, "Aiming at where Kethra is misses. The sim stops and labels it."
await page.keyboard.press('Space');
check('leg 2: the first aim (Kethra now) misses', (await phaseIs('result')) && (await state()).outcome?.kind === 'miss');
const miss = await note();
check('the miss is labelled with the day and the distance', /Kethra was here on day \d+ · \d+ Mkm off/.test(miss), miss);
await page.keyboard.press('KeyR');
check('R rewinds', await phaseIs('plot', 3000));
const lead = sim.anglesOf(sim.leadTo(legs[1].start, legs[1].startDay).dir);
await aimTo(0, lead.azimuth, lead.elevation);
// The plate's keys are buttons too: this run is started with the mouse.
await page.click('.intercept-panel [data-act="run"]');
check('leg 2: leading Kethra meets it (run from the plate, by mouse)', await until(() => window.__DEBUG__.engine.getCurrentScene().intercept.state().outcome?.kind === 'arrive', 15000));
// "The straight route crosses a dense clump": the belt resolves under the line just flown.
check('the belt resolves and marks where that line hits it', await until(() => [...document.querySelectorAll('.intercept-label.note')].some((n) => /Belt contact · day \d+/.test(n.textContent)), 8000));

// Leg 3, "pitch the burn over it, and pay the extra day out of the cell budget".
check('leg 3 begins with two burns', (await legIs(3)) && (await state()).plans.length === 2);
await page.keyboard.press('Space');
check("leg 3: leg 2's straight route, as it stands, hits the belt", (await phaseIs('result')) && (await state()).outcome?.kind === 'contact');
await page.keyboard.press('KeyR');
await phaseIs('plot', 3000);
let s = await state();
await aimTo(0, s.plans[0].azimuth, sim.HOP_ELEVATION);
s = await state();
const top = sim.add(legs[2].start, sim.scale(sim.direction(s.plans[0].azimuth, s.plans[0].elevation), sim.SPEED * sim.DAYS_PER_CELL));
const lead3 = sim.anglesOf(sim.leadTo(top, legs[2].startDay + sim.DAYS_PER_CELL).dir);
await page.keyboard.press('Digit2');
await aimTo(1, lead3.azimuth, lead3.elevation);
await page.click('.intercept-panel [data-act="more"]');
s = await state();
check('] spends the last cell of the budget', s.plans.reduce((n, p) => n + p.cells, 0) === s.budget, JSON.stringify(s.plans.map((p) => p.cells)));
await page.keyboard.press('BracketRight');
check('] past the budget is refused', (await state()).plans.reduce((n, p) => n + p.cells, 0) === s.budget);
await page.keyboard.press('Space');
check('leg 3: over the belt, then the lead, arrives', await until(() => window.__DEBUG__.engine.getCurrentScene().intercept.state().phase === 'won', 15000));
// "The day count and the cell count count up in tabular figures."
await page.waitForTimeout(1500);
const figures = await page.evaluate(() => [...document.querySelectorAll('.intercept-win .num')].map((n) => n.textContent));
check('the win counts up the days and cells', figures.length === 2 && figures.every((f) => Number(f) > 0), JSON.stringify(figures));

// "The course appears on the desk screen"; MG1 awards insight and engineering.
check('the Wren again, leaning over the chart', await until(() => window.__DEBUG__.engine.getCurrentScene()?.kind === 'ShipInteriorScene' && window.__DEBUG__.engine.getCurrentScene().player.pitch < -0.38, 60000));
check('control returns once the player stands', await until(() => window.__DEBUG__.engine.getCurrentScene().player.enabled === true, 30000));
const after = await page.evaluate(() => ({ course: window.__DEBUG__.gameState.data.course, a: window.__DEBUG__.gameState.data.attributes, before: window.__mg1Before }));
check('the plotted course is saved, figures and all', after.course?.points.length >= 9 && after.course.days > 0 && after.course.cells === 4, JSON.stringify({ days: after.course?.days, cells: after.course?.cells }));
check('MG1 awards +1 insight and +1 engineering', after.a.insight === after.before.insight + 1 && after.a.engineering === after.before.engineering + 1, JSON.stringify({ before: after.before, now: { insight: after.a.insight, engineering: after.a.engineering } }));
check('no page or console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

// Stats: "engineering 2: one spare cell".
const page2 = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const state2 = () => page2.evaluate(() => window.__DEBUG__.engine.getCurrentScene().intercept.state());
await openPlot(page2, () => { window.__DEBUG__.gameState.data.attributes.engineering = 2; });
check('engineering 2 gives a budget of five cells', (await state2()).budget === 5);

await browser.close();
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
