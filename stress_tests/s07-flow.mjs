// The game's flow, attacked where the audits pointed: saving mid-MG1 (BUG-006), save and quit with
// storage blocked (BUG-015), mouse capture in MG1 (BUG-014), the crosshair after a departure
// (BUG-020), the hull left behind by each cruise (BUG-021), the map re-opened during departure
// (BUG-023), a double-click in dialogue (BUG-026), a throwing timer (BUG-029), and the journal
// backfill on an old save (BUG-031).
import { launch, openPage, check, clean, failures, settled, until, press, teleport } from './lib.mjs';

const browser = await launch();
const D = (page, fn, arg) => page.evaluate(fn, arg);

const intoMG1 = async (page) => {
  await page.waitForSelector('.hold-skip', { timeout: 240000 });
  await press(page, 'Space', 1100);
  await until(page, () => window.__DEBUG__.engine.getCurrentScene()?.intercept?.state().phase === 'plot', 120000);
  await page.waitForTimeout(1500);
};
const ONLY = process.argv[2];

// BUG-014: into MG1 through the reveal, then click the canvas.
{
  const { page, context, errors } = await openPage(browser, '?newGame=1&skipTutorial=1&tier=low&seed=7', {
    init: { fn: () => { const orig = HTMLCanvasElement.prototype.requestPointerLock; window.__locks = 0; HTMLCanvasElement.prototype.requestPointerLock = function (...a) { window.__locks++; return orig?.apply(this, a); }; }, arg: null },
  });
  await intoMG1(page);
  await page.mouse.click(640, 360);
  await page.waitForTimeout(400);
  const locks = await D(page, () => window.__locks);
  check('BUG-014: clicking the canvas in MG1 does not ask to capture the mouse', locks === 0, `requestPointerLock x${locks}`);
  await clean(page, errors, 'MG1 canvas click');
  await context.close();
}

// BUG-006: save and quit mid-plot, then Continue.
{
  const { page, context, errors } = await openPage(browser, '?newGame=1&skipTutorial=1&tier=low&seed=7');
  await intoMG1(page);
  await press(page, 'Escape');
  await page.waitForTimeout(700);
  const quit = page.locator('button', { hasText: /save and quit/i });
  check('the pause menu offers save and quit in MG1', (await quit.count()) > 0);
  if (await quit.count()) {
    await quit.first().click();
    await page.waitForSelector('.title-btn', { timeout: 60000 });
    await page.locator('.title-btn', { hasText: /continue/i }).first().click();
    await until(page, () => !!window.__DEBUG__?.engine.getCurrentScene() && !window.__DEBUG__.flow.isTransitioning(), 180000);
    await page.waitForTimeout(2000);
    const s = await D(page, () => { const g = window.__DEBUG__.gameState; return { kind: window.__DEBUG__.engine.getCurrentScene()?.kind, battle: g.hasFlag('tutorial_battle_complete'), revealed: g.hasFlag('galaxy_revealed'), planets: [...g.data.planetsUnlocked] }; });
    check('BUG-006: a save made mid-MG1 continues at the reveal, not on a Wren that can never reach Kethra', s.kind === 'GalaxyRevealScene' || (s.revealed && s.planets.includes('kethra')), JSON.stringify(s));
  }
  await clean(page, errors, 'MG1 save and quit');
  await context.close();
}
if (ONLY === 'mg1') { await browser.close(); process.exit(failures() ? 1 : 0); }

// BUG-015: save and quit with storage blocked.
{
  const block = { fn: () => { Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('blocked', 'SecurityError'); } }); }, arg: null };
  const { page, context, errors } = await openPage(browser, '?newGame=1&skipIntro=1&tier=low&seed=7', { init: block });
  await settled(page, 'ShipInteriorScene');
  await page.evaluate(() => window.__DEBUG__.flow.tutorial?.skip?.());
  await page.waitForTimeout(1200);
  await press(page, 'Escape');
  await page.waitForTimeout(700);
  const url0 = page.url();
  let navigated = false;
  page.on('framenavigated', () => { navigated = true; });
  await page.locator('button', { hasText: /save and quit/i }).first().click();
  await page.waitForTimeout(2500);
  check('BUG-015: with storage blocked, save and quit does not silently drop the game', !navigated, `navigated ${navigated} from ${url0}`);
  const second = page.locator('button', { hasText: /quit without saving/i });
  if (!navigated && (await second.count())) {
    await second.first().click();
    await page.waitForTimeout(2500);
    check('BUG-015: and a second press, now "Quit without saving", does quit', navigated);
  }
  await clean(page, errors.filter((e) => !/could not write save/.test(e)), 'save and quit, storage blocked');
  await context.close();
}

// BUG-031: an old save without the journal's starter entries.
{
  const old = JSON.stringify({ flags: ['tutorial_battle_complete', 'galaxy_revealed'], planetsUnlocked: ['kethra'] });
  const seed = { fn: (v) => { if (!sessionStorage.getItem('__seeded')) { localStorage.setItem('kethra_save_v1', v); sessionStorage.setItem('__seeded', '1'); } }, arg: old };
  const { page, context, errors } = await openPage(browser, '?tier=low&seed=7', { init: seed });
  await page.waitForSelector('.title-btn', { timeout: 60000 });
  await page.locator('.title-btn', { hasText: /continue/i }).first().click();
  await settled(page, 'ShipInteriorScene');
  const n = await D(page, () => window.__DEBUG__.gameState.data.journalLogs.length);
  check('BUG-031: an old save gets the journal\'s starter entries', n > 0, `${n} journal entries`);
  await clean(page, errors, 'old save');
  await context.close();
}

// BUG-023, BUG-020, BUG-021: departures from the Wren (MG2 and the cruise flags set, so the trip
// goes cruise -> Kethra directly).
{
  const { page, context, errors } = await openPage(browser, '?newGame=1&skipIntro=1&unlockKethra=1&tier=low&seed=7');
  await settled(page, 'ShipInteriorScene');
  await page.evaluate(() => { window.__DEBUG__.flow.tutorial?.skip?.(); for (const f of ['first_light', 'canopy_flown']) window.__DEBUG__.gameState.setFlag(f); });
  await page.waitForTimeout(1500);
  const geo = () => D(page, () => window.__DEBUG__.engine.renderer.info.memory.geometries);
  // Set course, and straight away re-open the map (as E at the console would).
  await page.evaluate(() => { window.__DEBUG__.bus.emit('galaxy:travel_to', 'kethra'); window.__DEBUG__.bus.emit('ui:open_galaxy_map'); });
  await page.waitForTimeout(1200);
  await press(page, 'Escape');
  await page.waitForTimeout(600);
  const midCine = await D(page, () => ({ enabled: window.__DEBUG__.engine.getCurrentScene().player?.enabled, letterbox: !!document.querySelector('.letterbox-bar.visible'), kind: window.__DEBUG__.engine.getCurrentScene().kind }));
  check('BUG-023: closing a map re-opened during departure does not hand control back mid-cinematic', !(midCine.enabled && midCine.letterbox), JSON.stringify(midCine));
  const trip = async () => {
    await until(page, () => window.__DEBUG__.engine.getCurrentScene()?.kind === 'CruiseScene', 90000);
    await page.waitForSelector('.hold-skip', { timeout: 30000 }).catch(() => {});
    await press(page, 'Space', 1100);
    await settled(page, 'KethraScene', 240000);
    await page.waitForTimeout(2500);
  };
  await trip();
  check('BUG-020: the crosshair is back after the first departure', !(await D(page, () => document.getElementById('crosshair')?.classList.contains('hidden'))));
  const home = async () => { await page.evaluate(() => window.__DEBUG__.engine.getCurrentScene().onDepart?.()); await settled(page, 'ShipInteriorScene'); await page.waitForTimeout(2500); };
  await home();
  const g1 = await geo();
  await page.evaluate(() => window.__DEBUG__.bus.emit('galaxy:travel_to', 'kethra'));
  await trip();
  await home();
  const g2 = await geo();
  check('BUG-003/021: a second Wren -> cruise -> Kethra -> Wren trip frees what it built', g2 - g1 <= 2, `geometries on the Wren ${g1} -> ${g2}`);
  await clean(page, errors, 'departures');
  await context.close();
}

// BUG-026: double-click the first dialogue option; BUG-029: a throwing timer.
{
  const { page, context, errors } = await openPage(browser, '?newGame=1&skipIntro=1&unlockKethra=1&jump=kethra&tier=low&seed=7');
  await settled(page, 'KethraScene');
  await page.waitForTimeout(3000);
  await teleport(page, -3, 0.38, 4.6, 0);
  await page.waitForTimeout(500);
  await press(page, 'KeyE');
  await page.waitForSelector('.dialogue-option', { timeout: 10000 });
  const line0 = await page.textContent('#dialogue-text');
  await page.locator('.dialogue-option').first().click();
  await page.waitForTimeout(700);
  const line1 = await page.textContent('#dialogue-text');
  await press(page, 'Escape');
  await page.waitForTimeout(600);
  await press(page, 'KeyE');
  await page.waitForSelector('.dialogue-option', { timeout: 10000 });
  await page.locator('.dialogue-option').first().dblclick();
  await page.waitForTimeout(700);
  const lineDbl = await page.textContent('#dialogue-text');
  check('BUG-026: a double-click on an option advances one line, like a single click', lineDbl === line1, `single: "${line1?.slice(0, 50)}" / double: "${lineDbl?.slice(0, 50)}" (start "${line0?.slice(0, 30)}")`);
  await press(page, 'Escape');
  await page.waitForTimeout(500);
  const t0 = await D(page, () => window.__DEBUG__.motion.gameTime);
  await page.evaluate(() => window.__DEBUG__.motion.ui.after(0.05, () => { throw new Error('stress: a throwing timer'); }));
  await page.waitForTimeout(1500);
  const t1 = await D(page, () => window.__DEBUG__.motion.gameTime);
  check('BUG-029: one throwing timer does not stop the game clock', t1 - t0 > 1, `game time advanced ${(t1 - t0).toFixed(2)} s in 1.5 s`);
  await clean(page, errors.filter((e) => !/stress: a throwing timer/.test(e)), 'dialogue and timers');
  await context.close();
}

await browser.close();
console.log(failures() ? `\n${failures()} failed` : '\nall passed');
process.exit(failures() ? 1 : 0);
