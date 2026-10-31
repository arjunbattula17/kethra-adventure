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
// H. New game's black hole (8a461ce, 2026-10-29) where it meets the rest of the game (2026-10-31 review):
//    O mid-event, the reload into the dark with a save and the usual way without the event, frames
//    stopping (the stall watchdog) and the sound with them, a hidden tab, nothing loading after it, and
//    flashing (WCAG 2.3.1).
//   node stress_tests/s15-seams.mjs [A|B|C|D|E|F|G|H]
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

if (!ONLY || ONLY === 'H') {
  // The event ends at TIMELINE.end (src/galaxy/title/singularity/timeline.ts) and only then goes black,
  // unless its frames stop in a visible tab (TitleScreen.collapse's watchdog: "a lost GPU").
  const END = 6.75;
  const SAVE = {
    fn: (raw) => { if (!sessionStorage.getItem('__seeded')) { localStorage.setItem('kethra_save_v1', raw); sessionStorage.setItem('__seeded', '1'); } },
    arg: JSON.stringify({ scene: 'wren', flags: ['tutorial_battle_complete', 'galaxy_revealed', 'logs_available', 'damage_assessed'], planetsUnlocked: ['kethra'], xp: 0, level: 1 }),
  };
  // The ship over Kethra up, arrived, and the lens linked (PRELINK_AFTER_MS).
  const shipTitle = async (page) => { await page.waitForSelector('.title-screen.backdrop-live', { timeout: 120000 }); await page.waitForTimeout(8000); };
  const holeAt = (page, t) => until(page, (t) => (window.__DEBUG__?.engine.getCurrentScene()?.singularity?.t ?? 0) > t, 30000, t);
  // The hole's clock when the screen goes black, polled on a timer so a paused engine can't hide it.
  const watchVoid = (page) => page.evaluate(() => {
    const s = window.__DEBUG__.engine.getCurrentScene()?.singularity;
    window.__voidAt = null;
    const id = setInterval(() => { if (document.body.classList.contains('from-void')) { window.__voidAt = s?.t ?? -1; clearInterval(id); } }, 20);
  });
  const voidAt = async (page) => ((await until(page, () => window.__voidAt !== null, 30000)) ? page.evaluate(() => window.__voidAt) : null);
  const inIntro = (page) => until(page, () => window.__DEBUG__.flow.state === 'intro' && !document.body.classList.contains('from-void'), 120000);

  // H1. O mid-event: the panel paused the engine, the watchdog took the pause for a lost GPU and went
  // black over the open panel, and the game loaded paused behind it.
  {
    const { page, context, errors } = await openPage(browser, '?tier=low&seed=7');
    await shipTitle(page);
    await page.getByRole('button', { name: 'New game' }).click();
    await holeAt(page, 1.6);
    await watchVoid(page);
    await press(page, 'KeyO', 60);
    const at = await voidAt(page);
    check("H1: O during the black hole doesn't cut it short", at !== null && at >= END, `black at t=${at}`);
    const arrived = await inIntro(page);
    await page.waitForTimeout(1500);
    const s = await page.evaluate(() => ({ panel: !!document.querySelector('.panel-overlay.visible'), paused: window.__DEBUG__.engine.paused }));
    check('H1: and the intro arrives running, with no panel left open', arrived && !s.panel && !s.paused, JSON.stringify({ arrived, ...s }));
    await clean(page, errors, 'H1');
    await context.close();
  }

  // H2. A save: the event ends in a reload, the dark carries across it, and the intro fades up out of it.
  {
    const { page, context, errors } = await openPage(browser, '?tier=low&seed=7', { init: SAVE });
    await shipTitle(page);
    await page.getByRole('button', { name: 'New game' }).click();
    await page.waitForURL(/newGame=1/, { timeout: 60000, waitUntil: 'domcontentloaded' });
    const dark = await until(page, () => document.body.classList.contains('from-void') && !!document.getElementById('void-style'), 15000);
    const arrived = await inIntro(page);
    const after = await page.evaluate(() => ({ voidStyle: !!document.getElementById('void-style'), kind: window.__DEBUG__.engine.getCurrentScene()?.kind }));
    check('H2: with a save, the black hole reloads into the dark and the intro fades up out of it', dark && arrived && !after.voidStyle && after.kind === 'IntroScene', JSON.stringify({ dark, arrived, ...after }));
    await clean(page, errors, 'H2');
    await context.close();
  }

  // H3. A save, and a New game with no black hole (Isilthe's backdrop "leaves the old way", as does a
  // click before the ship's backdrop is up): the reload is the usual one, not the dark with its bar held back.
  {
    const { page, context, errors } = await openPage(browser, '?title=isilthe&tier=low&seed=7', { init: SAVE });
    await page.waitForSelector('.title-btn', { timeout: 60000 });
    await page.waitForTimeout(4000);
    await page.getByRole('button', { name: 'New game' }).click();
    await page.waitForURL(/newGame=1/, { timeout: 60000, waitUntil: 'domcontentloaded' });
    const seen = await page.evaluate(() => new Promise((resolve) => {
      const r = { voidStyle: false, fromVoid: false };
      const id = setInterval(() => { r.voidStyle ||= !!document.getElementById('void-style'); r.fromVoid ||= document.body.classList.contains('from-void'); }, 20);
      setTimeout(() => { clearInterval(id); resolve(r); }, 3000);
    }));
    check('H3: a New game without the black hole reloads the usual way, not into the dark', !seen.voidStyle && !seen.fromVoid, JSON.stringify(seen));
    check('H3: and reaches the intro', await inIntro(page));
    await clean(page, errors, 'H3');
    await context.close();
  }

  // H4. Frames stop mid-event in a visible tab: the watchdog starts the game, and the black hole's sound
  // must stop with the picture (it cut only at the horizon, so it droned on over the loading).
  {
    const { page, context, errors } = await openPage(browser, '?tier=low&seed=7');
    await shipTitle(page);
    await page.mouse.click(1150, 360); // the sky: a gesture, so sound is on
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'New game' }).click();
    await holeAt(page, 2.2);
    await page.evaluate(() => {
      const o = window.__DEBUG__.audio.effectsOutput();
      const an = o.ctx.createAnalyser();
      an.fftSize = 4096;
      o.bus.connect(an);
      window.__rms = () => { const d = new Float32Array(an.fftSize); an.getFloatTimeDomainData(d); let s = 0; for (const x of d) s += x * x; return Math.sqrt(s / d.length); };
      window.__ctxState = () => o.ctx.state;
    });
    await page.waitForTimeout(300);
    const before = await page.evaluate(() => ({ state: window.__ctxState(), rms: window.__rms() }));
    await watchVoid(page);
    await page.evaluate(() => window.__DEBUG__.engine.setPaused(true));
    const at = await voidAt(page);
    await page.waitForTimeout(1500);
    let after = 0;
    for (let i = 0; i < 5; i++) { after = Math.max(after, await page.evaluate(() => window.__rms())); await page.waitForTimeout(80); }
    check('H4: frames stopping mid-event still end it on black', at !== null && at < END, `black at t=${at}`);
    check('H4: and its sound stops with it', before.state === 'running' && before.rms > 0.01 && after < 0.25 * before.rms, JSON.stringify({ ...before, after: +after.toFixed(4) }));
    await page.evaluate(() => window.__DEBUG__.engine.setPaused(false));
    check('H4: frames back, the intro arrives', await inIntro(page));
    await clean(page, errors, 'H4');
    await context.close();
  }

  // H5. The tab hidden mid-event (no frames, as rAF stops) and brought back, its first frame arriving after
  // an overdue watchdog check (held 1.5 s here, well inside the watchdog's 4 s): the event must wait, not end.
  {
    const { page, context, errors } = await openPage(browser, '?tier=low&seed=7');
    await shipTitle(page);
    await page.evaluate(() => {
      window.__hidden = false;
      Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get: () => window.__hidden });
      Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get: () => (window.__hidden ? 'hidden' : 'visible') });
    });
    await page.getByRole('button', { name: 'New game' }).click();
    await holeAt(page, 2.0);
    await watchVoid(page);
    await page.evaluate(() => { window.__hidden = true; document.dispatchEvent(new Event('visibilitychange')); window.__DEBUG__.engine.setPaused(true); });
    await page.waitForTimeout(6000);
    await page.evaluate(() => { window.__hidden = false; document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.__DEBUG__.engine.setPaused(false));
    const at = await voidAt(page);
    check("H5: a tab hidden mid-event and brought back doesn't cut it short", at !== null && at >= END, `black at t=${at}`);
    check('H5: and the intro arrives', await inIntro(page));
    await clean(page, errors, 'H5');
    await context.close();
  }

  // H6. Nothing loads after the black hole (the intro's code, then the Wren's fallback): the failure
  // screen inside the dark must be readable at once, never a black screen (test-load-failure's rule).
  {
    const { page, context, errors } = await openPage(browser, '?tier=low&seed=7', { block: ['**/assets/IntroScene-*.js', '**/Door_Frame_Square.gltf'] });
    await shipTitle(page);
    await page.getByRole('button', { name: 'New game' }).click();
    const shown = await until(page, () => /didn’t load/.test(document.querySelector('.loading-indicator.visible')?.textContent ?? ''), 180000);
    await page.waitForTimeout(600);
    const s = await page.evaluate(() => {
      const el = document.querySelector('.loading-indicator');
      const reload = el.querySelector('button');
      return { title: +getComputedStyle(el.querySelector('.loading-title')).opacity, reload: reload ? +getComputedStyle(reload.parentElement).opacity : 0, focused: document.activeElement === reload };
    });
    check('H6: nothing loading after the black hole ends on a readable failure screen with its reload', shown && s.title > 0.9 && s.reload > 0.9 && s.focused, JSON.stringify({ shown, ...s }));
    // The blocked files' own errors are expected; anything else is not.
    await clean(page, errors.filter((e) => !/net::ERR_CONNECTION_FAILED|\[flow\] intro → wren failed/.test(e)), 'H6');
    await context.close();
  }

  // H7. Flashing, by WCAG 2.3.1's general-flash rule (at most three flashes in any second): swallowed
  // embers and dust stacked on the hole's centre, and the lens spread that one texel over its Einstein ring
  // on the frames the stack landed on a pixel, so the bloom flashed the whole screen 11-17 times a second.
  // Every drawn frame is read in the task that draws it (Engine.drawObserver) at 64 x 36; the mean of each
  // region the size of the rule's area (a third of the screen each way, sliding by half) may swing by 0.1
  // or more in relative luminance, the darker side under 0.8, at most six times inside any second.
  {
    const { page, context, errors } = await openPage(browser, '?tier=low&seed=7');
    await shipTitle(page);
    await page.evaluate(() => {
      const engine = window.__DEBUG__.engine;
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 36;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      const rec = (window.__frames = []);
      engine.drawObserver = () => {
        if (!engine.getCurrentScene()?.singularity?.active) return;
        ctx.drawImage(engine.renderer.domElement, 0, 0, 64, 36);
        const d = ctx.getImageData(0, 0, 64, 36).data;
        const L = new Float32Array(64 * 36);
        for (let i = 0; i < L.length; i++) L[i] = 0.2126 * lin(d[i * 4]) + 0.7152 * lin(d[i * 4 + 1]) + 0.0722 * lin(d[i * 4 + 2]);
        rec.push({ now: performance.now(), L: Array.from(L) });
      };
    });
    await page.getByRole('button', { name: 'New game' }).click();
    await until(page, () => document.body.classList.contains('from-void'), 60000);
    const frames = await page.evaluate(() => { window.__DEBUG__.engine.drawObserver = null; return window.__frames; });
    let worst = 0;
    for (let y = 0; y + 12 <= 36; y += 6) {
      for (let x = 0; x + 21 <= 64; x += 10) {
        let ref = null, dir = 0;
        const swings = [];
        for (const f of frames) {
          let m = 0;
          for (let j = y; j < y + 12; j++) for (let i = x; i < x + 21; i++) m += f.L[j * 64 + i];
          m /= 21 * 12;
          if (ref === null) ref = m;
          else if ((dir === 1 && m > ref) || (dir === -1 && m < ref)) ref = m;
          else if (Math.abs(m - ref) >= 0.1) {
            if (Math.min(m, ref) < 0.8) swings.push(f.now);
            dir = m > ref ? 1 : -1;
            ref = m;
          }
          worst = Math.max(worst, swings.filter((s) => f.now - s < 1000).length);
        }
      }
    }
    check('H7: the black hole flashes at most three times in any second (WCAG 2.3.1)', frames.length > 60 && worst <= 6, `${frames.length} frames read; most swings of a region in one second: ${worst}`);
    await clean(page, errors, 'H7');
    await context.close();
  }
}

await browser.close();
process.exit(failures() ? 1 : 0);
