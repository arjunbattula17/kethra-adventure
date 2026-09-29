// Vessek Anchorage, attacked where the audit pointed: the junction door closing on the player, the
// duct drop into the tanker, interactions through walls and doors, E during the pulse cutscene.
import { launch, openPage, check, clean, failures, settled, teleport, press } from './lib.mjs';

const browser = await launch();
const ONLY = process.argv[2];
const URL = '?newGame=1&skipIntro=1&unlockVessek=1&jump=vessek&tier=low&seed=17';
const pos = (page) => page.evaluate(() => { const p = window.__DEBUG__.engine.getCurrentScene().player.rig.position; return { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2) }; });
const aim = (page, yaw, pitch) => page.evaluate(([y, p]) => { const pl = window.__DEBUG__.engine.getCurrentScene().player; pl.yaw = y; pl.pitch = p; }, [yaw, pitch]);
const prompt = (page) => page.evaluate(() => { const el = document.getElementById('interact-prompt'); return el?.classList.contains('visible') ? el.textContent : null; });
const flag = (page, f) => page.evaluate((f) => window.__DEBUG__.gameState.hasFlag(f), f);
/** Can the player move at all: tries each direction for 0.6 s, returns the largest displacement. */
async function freedom(page) {
  let best = 0;
  for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) {
    const a = await pos(page);
    await press(page, k, 600);
    const b = await pos(page);
    best = Math.max(best, Math.hypot(b.x - a.x, b.z - a.z));
  }
  return best;
}
async function fresh() {
  const o = await openPage(browser, URL);
  await settled(o.page, 'VessekScene');
  await o.page.waitForTimeout(5000);
  return o;
}

// VES-1: stand in the junction doorway after opening it from inside; the door closes on its own.
if (!ONLY || ONLY === 'ves1') {
  const { page, context, errors } = await fresh();
  await teleport(page, 13.6, 0.2, -30, Math.PI / 2);
  await page.waitForTimeout(300);
  await press(page, 'KeyE');
  await page.waitForTimeout(900);
  await teleport(page, 12.435, 0.2, -29.4, 0);
  await page.waitForTimeout(8000);
  const free = await freedom(page);
  const p = await prompt(page);
  check('BUG-007 (VES-1): the junction door does not shut on a player in its doorway', free > 0.2, `moved ${free.toFixed(2)} m, prompt ${p}`);
  await clean(page, errors, 'VES-1 junction door');
  await context.close();
}

// VES-2: walk out of Dace's upper duct over the drop into the tanker.
if (!ONLY || ONLY === 'ves2') {
  const { page, context, errors } = await fresh();
  await page.keyboard.down('KeyC');
  await teleport(page, -9, 2.55, -26, -Math.PI / 2);
  await page.waitForTimeout(300);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(2500);
  await page.keyboard.up('KeyW');
  await page.keyboard.up('KeyC');
  await page.waitForTimeout(800);
  const landed = await pos(page);
  const free = await freedom(page);
  check('VES-2: after the duct drop into the tanker the player can walk away', free > 0.3, `landed ${JSON.stringify(landed)}, moved ${free.toFixed(2)} m`);
  await clean(page, errors, 'VES-2 duct drop');
  await context.close();
}

// VES-5: the junction's inside button from the tanker side of the closed door.
if (!ONLY || ONLY === 'ves5') {
  const { page, context, errors } = await fresh();
  await teleport(page, 11.9, 0.2, -30.7, -0.61);
  await aim(page, -0.61, -0.27);
  await page.waitForTimeout(600);
  const p = await prompt(page);
  await press(page, 'KeyE');
  await page.waitForTimeout(800);
  const open = await page.evaluate(() => window.__DEBUG__.engine.getCurrentScene().rooms.keypadDoor.open);
  check('VES-5: the junction door\'s inside button does not work from the tanker side', !open, `prompt "${p}", door open ${open}`);
  await clean(page, errors, 'VES-5 inside button');
  await context.close();
}

// The pulse: E during its cutscene (UI-7/VES-18), then the sealed hatch from the hall side (VES-4).
if (!ONLY || ONLY === 'pulse') {
  const { page, context, errors } = await fresh();
  await page.evaluate(() => { for (const f of ['vessek_varro_met', 'vessek_school_lit', 'vessek_junction_reset']) window.__DEBUG__.gameState.setFlag(f); });
  await teleport(page, -2.6, 0.2, 0.2, 0);
  await page.waitForTimeout(400);
  await press(page, 'KeyE');
  await page.waitForTimeout(600);
  await press(page, 'Digit1');
  await page.waitForTimeout(1500);
  const cut = await page.evaluate(() => window.__DEBUG__.engine.getCurrentScene().player.enabled);
  const p0 = await prompt(page);
  await press(page, 'KeyE');
  await page.waitForTimeout(700);
  const dialogue = await page.evaluate(() => document.getElementById('dialogue-panel')?.isConnected && getComputedStyle(document.getElementById('dialogue-panel')).display !== 'none');
  check('UI-7: during the pulse cutscene E opens nothing and no prompt shows', cut === false && !dialogue && !p0, `player enabled ${cut}, prompt "${p0}", dialogue ${dialogue}`);
  for (let i = 0; i < 3 && dialogue; i++) { await press(page, 'Escape'); await page.waitForTimeout(400); }
  await page.waitForTimeout(8000);
  check('the pulse fired', await flag(page, 'vessek_pulse'));
  await teleport(page, -2.75, 0.2, -15.9, 0);
  await aim(page, 0, 0);
  await page.waitForTimeout(600);
  const p = await prompt(page);
  await press(page, 'KeyE');
  await page.waitForTimeout(800);
  check('VES-4: the sealed hatch cannot be cranked from the hall side', !(await flag(page, 'vessek_hatch_open')), `prompt "${p}"`);
  await clean(page, errors, 'the pulse, UI-7 and VES-4');
  await context.close();
}

await browser.close();
console.log(failures() ? `\n${failures()} failed` : '\nall passed');
process.exit(failures() ? 1 : 0);
