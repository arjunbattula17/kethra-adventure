// The seams between the two branches' work (2026-10-25 review), each attacked where it was found broken:
// A. MG1's win, while the Wren builds behind it: no "Click to look around" over the chart, and the
//    prompt back once the player is aboard and free.
// B. A hold-to-skip's key: its release was swallowed, so the next Space press didn't jump.
// C. Chapters on the title with a saved journey: a held Enter armed and then confirmed a chapter,
//    replacing the save.
// D. A chapter's own snapshot: an arrival after the level is finished must not replace it.
// E. Kethra: the merged glow motes make no collider; a step off the last stepping stone onto the
//    landmark's loam resets before the feet sink into it.
// F. The quality tier changed by hand mid-Wren, both ways, and the performance readout (` key).
// G. A first trip whose files never arrive: back in control aboard, with the console guide lit again.
//   node stress_tests/s15-seams.mjs [A|B|C|D|E|F|G]
import { launch, openPage, check, clean, failures, settled, until, press, teleport } from './lib.mjs';

const browser = await launch();
const ONLY = process.argv[2];
const waitKind = (page, k, ms) => until(page, (k) => window.__DEBUG__?.engine.getCurrentScene()?.kind === k, ms, k);

if (!ONLY || ONLY === 'A') {
  const { page, context, errors } = await openPage(browser, '?newGame=1&skipTutorial=1&tier=low&seed=7');
  await until(page, () => window.__DEBUG__?.engine.getCurrentScene()?.kind === 'GalaxyRevealScene', 240000);
  await page.waitForSelector('.hold-skip', { timeout: 180000 });
  await press(page, 'Space', 1100);
  await until(page, () => !!window.__DEBUG__.engine.getCurrentScene().intercept, 60000);
  await page.evaluate(() => {
    window.__lookOverChart = 0;
    const tick = () => {
      const kind = window.__DEBUG__.engine.getCurrentScene()?.kind;
      if (kind === 'GalaxyRevealScene' && document.querySelector('.look-prompt.visible')) window.__lookOverChart++;
      if (kind !== 'ShipInteriorScene') requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    window.__DEBUG__.miniGame()?.win();
  });
  const aboard = await waitKind(page, 'ShipInteriorScene', 120000);
  check('A: no look prompt over the chart through MG1\'s win', aboard && (await page.evaluate(() => window.__lookOverChart)) === 0, `${await page.evaluate(() => window.__lookOverChart)} frames with it shown`);
  const free = await until(page, () => window.__DEBUG__.engine.getCurrentScene()?.player?.enabled && !window.__DEBUG__.flow.isTransitioning(), 60000);
  check('A: aboard and free, the look prompt is back', free && (await until(page, () => !!document.querySelector('.look-prompt.visible'), 10000)));
  await clean(page, errors, 'A');
  await context.close();
}

if (!ONLY || ONLY === 'B') {
  const { page, context, errors } = await openPage(browser, '?newGame=1&tier=low&seed=7');
  await waitKind(page, 'IntroScene', 240000);
  await page.waitForSelector('.hold-skip', { timeout: 120000 });
  await press(page, 'Space', 1200);
  await settled(page, 'ShipInteriorScene');
  await until(page, () => window.__DEBUG__.engine.getCurrentScene().player.enabled, 60000);
  await page.waitForTimeout(800);
  const peak = await page.evaluate(async () => {
    const rig = window.__DEBUG__.engine.getCurrentScene().player.rig;
    const y0 = rig.position.y;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }));
    await new Promise((r) => setTimeout(r, 90));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ' }));
    let top = y0;
    const end = performance.now() + 1200;
    while (performance.now() < end) {
      await new Promise((r) => requestAnimationFrame(r));
      top = Math.max(top, rig.position.y);
    }
    return top - y0;
  });
  check('B: the first Space after a hold-to-skip jumps', peak > 0.5, `peak ${peak.toFixed(2)} m`);
  await clean(page, errors, 'B');
  await context.close();
}

if (!ONLY || ONLY === 'C') {
  const { page, context, errors } = await openPage(browser, '?newGame=1&skipIntro=1&tier=low&seed=7');
  await settled(page, 'ShipInteriorScene');
  const save = await page.evaluate(() => {
    window.__DEBUG__.gameState.setObjective('SEAM TEST SAVE');
    const json = window.__DEBUG__.gameState.toJSON();
    localStorage.setItem('kethra_save_v1', json);
    return json;
  });
  await page.goto(page.url().split('?')[0], { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.title-screen.revealed', { timeout: 90000 });
  await until(page, () => document.querySelector('.title-btn.is-selected .tb-label')?.textContent === 'Continue', 30000);
  await press(page, 'ArrowDown', 40);
  await press(page, 'ArrowDown', 40);
  const onChapters = await page.evaluate(() => document.querySelector('.title-btn.is-selected .tb-label')?.textContent);
  // A held key: the first keydown, then auto-repeats (Playwright marks a second down as a repeat).
  for (let i = 0; i < 8; i++) {
    await page.keyboard.down('Enter');
    await page.waitForTimeout(50);
  }
  await page.keyboard.up('Enter');
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => ({ url: location.search, save: localStorage.getItem('kethra_save_v1'), list: document.querySelectorAll('.panel-overlay.visible .chapter-row').length, armed: document.querySelectorAll('.chapter-row.armed').length }));
  check('C: Enter held on Chapters opens the list and nothing more', onChapters === 'Chapters' && after.list === 3 && after.armed === 0 && !after.url.includes('chapter'), JSON.stringify({ onChapters, ...after, save: undefined }));
  check('C: the saved journey is still there', after.save === save);
  await clean(page, errors, 'C');
  await context.close();
}

if (!ONLY || ONLY === 'D') {
  for (const finished of [true, false]) {
    const { page, context, errors } = await openPage(browser, '?newGame=1&skipIntro=1&unlockKethra=1&tier=low&seed=7');
    await settled(page, 'ShipInteriorScene');
    await page.evaluate((finished) => {
      const d = window.__DEBUG__;
      d.flow.tutorial?.skip?.();
      for (const f of ['first_light', 'canopy_flown']) d.gameState.setFlag(f);
      if (finished) d.gameState.setFlag('kethra_mechanism_solved');
      localStorage.setItem('kethra_chapters_v1', JSON.stringify({ kethra: 'EARLIER ARRIVAL' }));
    }, finished);
    await page.waitForTimeout(800);
    await page.evaluate(() => window.__DEBUG__.bus.emit('galaxy:travel_to', 'kethra'));
    await waitKind(page, 'CruiseScene', 90000);
    await page.evaluate(() => { window.__DEBUG__.engine.getCurrentScene().time = 41; });
    await page.waitForSelector('.hold-skip', { timeout: 30000 }).catch(() => {});
    await press(page, 'Space', 1100);
    await settled(page, 'KethraScene');
    const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('kethra_chapters_v1') ?? '{}').kethra);
    if (finished) check('D: arriving at a finished Kethra keeps the earlier chapter snapshot', kept === 'EARLIER ARRIVAL', String(kept).slice(0, 40));
    else check('D: arriving at an unfinished Kethra records the arrival', typeof kept === 'string' && kept !== 'EARLIER ARRIVAL' && kept.startsWith('{'), String(kept).slice(0, 40));
    await clean(page, errors, `D (${finished ? 'finished' : 'unfinished'})`);
    await context.close();
  }
}

if (!ONLY || ONLY === 'E') {
  const { page, context, errors } = await openPage(browser, '?newGame=1&skipIntro=1&jump=kethra&tier=low&seed=7');
  await settled(page, 'KethraScene');
  await page.waitForTimeout(2000);
  const moteBoxes = await page.evaluate(() => {
    const s = window.__DEBUG__.engine.getCurrentScene();
    const boxes = s.player.colliders.map((c) => c.box);
    let n = 0;
    s.scene.traverse((o) => {
      const hex = o.isMesh && !o.isInstancedMesh && o.material?.emissive?.getHex();
      if (hex !== 0x3fd98a && hex !== 0x4fd9c8) return;
      o.geometry.computeBoundingBox();
      const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
      n += boxes.filter((c) => c.min.distanceTo(b.min) < 0.01 && c.max.distanceTo(b.max) < 0.01).length;
    });
    return n;
  });
  check('E: the merged glow motes make no collider', moteBoxes === 0, `${moteBoxes} boxes`);
  // On the last slab (24.3, 8.0, top 0.36), facing the landmark tree at (27, 8): walk off onto the loam.
  await teleport(page, 24.3, 0.6, 8.0, -Math.PI / 2);
  await page.waitForTimeout(1000);
  const walk = await page.evaluate(async () => {
    const s = window.__DEBUG__.engine.getCurrentScene();
    const rig = s.player.rig;
    const start = rig.position.toArray();
    let low = Infinity;
    let maxX = -Infinity;
    let reset = false;
    s.player.onFellOut = ((prev) => () => { reset = true; prev?.(); })(s.player.onFellOut);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w' }));
    const end = performance.now() + 2500;
    while (performance.now() < end && !reset) {
      await new Promise((r) => requestAnimationFrame(r));
      if (!reset) { low = Math.min(low, rig.position.y); maxX = Math.max(maxX, rig.position.x); }
    }
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w' }));
    return { start, low, maxX, reset };
  });
  // The loam's top under the islet is 0.14 m or more below the water line plus 0.76 (WATER_Y -0.9).
  check('E: off the slab onto the loam, the reset comes before the feet sink into it', walk.reset && walk.maxX > 25.4 && walk.low > -0.2, JSON.stringify({ low: +walk.low.toFixed(2), maxX: +walk.maxX.toFixed(2), reset: walk.reset }));
  await clean(page, errors, 'E');
  await context.close();
}

if (!ONLY || ONLY === 'F') {
  const { page, context, errors } = await openPage(browser, '?newGame=1&skipIntro=1&tier=low&seed=7');
  await settled(page, 'ShipInteriorScene');
  await page.waitForTimeout(1500);
  const frames = () => page.evaluate(() => window.__STRESS__.frames);
  for (const tier of ['high', 'low', 'medium', 'low']) {
    await page.evaluate((t) => window.__DEBUG__.engine.setManualQualityTier(t), tier);
    const f0 = await frames();
    await page.waitForTimeout(2500);
    const state = await page.evaluate(() => ({ tier: window.__DEBUG__.engine.getQualityTier(), shadows: window.__DEBUG__.engine.renderer.shadowMap.enabled }));
    check(`F: switched to ${tier} mid-Wren, still drawing`, state.tier === tier && (await frames()) - f0 > 10, JSON.stringify(state));
  }
  const readout = () => page.evaluate(() => [...document.querySelectorAll('div')].some((d) => d.style.display === 'block' && /press ` to close/.test(d.textContent ?? '')));
  await press(page, 'Backquote', 40);
  await page.waitForTimeout(1000);
  check('F: ` opens the performance readout', await readout());
  await press(page, 'Backquote', 40);
  await page.waitForTimeout(300);
  check('F: ` again closes it', !(await readout()));
  await clean(page, errors, 'F');
  await context.close();
}

if (!ONLY || ONLY === 'G') {
  const { page, context, errors } = await openPage(browser, '?newGame=1&skipIntro=1&unlockKethra=1&tier=low&seed=7');
  await settled(page, 'ShipInteriorScene');
  await page.evaluate(() => window.__DEBUG__.flow.tutorial?.skip?.());
  await page.waitForTimeout(800);
  // The cruise's code never arrives: the first trip fails before the Wren has left.
  await page.route('**/assets/CruiseScene-*.js', (route) => route.abort());
  await page.evaluate(() => window.__DEBUG__.bus.emit('galaxy:travel_to', 'kethra'));
  const told = await until(page, () => [...document.querySelectorAll('.toast')].some((t) => /Navigation data unavailable/.test(t.textContent ?? '')), 60000);
  await page.waitForTimeout(500);
  const guide = await page.evaluate(() => { const g = window.__DEBUG__.flow.consoleGuide; return !!g && !g.disposed; });
  check('G: a first trip that never left puts the console guide back', told && guide, JSON.stringify({ told, guide }));
  // The page's own error for the blocked file is expected; anything else is not.
  await clean(page, errors.filter((e) => !/CruiseScene|Failed to fetch dynamically imported module|net::ERR_FAILED/.test(e)), 'G');
  await context.close();
}

await browser.close();
process.exit(failures() ? 1 : 0);
