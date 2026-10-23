// The title screen, end to end: the menu and its four buttons, the 3D backdrop behind it (without a
// save the ship over a turning Kethra; with one the astronaut by ringed Isilthe, turning, rocks
// drifting, the camera leaning toward the pointer), keyboard and mouse selection, Controls and Settings (and focus coming
// back), a quality change made from the title, New game into the intro, Continue into the Wren, an
// unreadable save, reduced motion, and the menu held back until it can come in with the backdrop.
//
//   npx vite preview --port 4190 --strictPort   (in another terminal)
//   node tools/test-title.mjs [baseUrl]
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:4190/kethra-adventure/';
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed++;
};

async function open({ save, reducedMotion = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, reducedMotion: reducedMotion ? 'reduce' : 'no-preference' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  if (save !== undefined) await page.addInitScript((s) => localStorage.setItem('kethra_save_v1', s), save);
  await page.goto(BASE);
  await page.waitForSelector('.title-screen.revealed', { timeout: 60000 });
  return { page, context, errors };
}
const labels = (page) => page.$$eval('.title-btn', (bs) => bs.map((b) => ({ label: b.querySelector('.tb-label').textContent, disabled: b.disabled, selected: b.classList.contains('is-selected'), focused: document.activeElement === b })));
const selectedLabel = async (page) => (await labels(page)).find((b) => b.selected)?.label ?? null;
const backdropLive = (page) => page.waitForFunction(() => document.querySelector('.title-screen.backdrop-live') && window.__DEBUG__?.engine.getCurrentScene()?.kind === 'TitleScene', null, { timeout: 90000 }).then(() => true, () => false);

// A save as the game writes it, made in a throwaway page.
async function makeSave() {
  const page = await browser.newPage();
  await page.goto(`${BASE}?newGame=1&skipIntro=1`);
  await page.waitForFunction(() => window.__DEBUG__?.gameState, null, { timeout: 120000 });
  const json = await page.evaluate(() => window.__DEBUG__.gameState.toJSON());
  await page.close();
  return json;
}

// 1. No save: the menu, the backdrop, selection, Controls, Settings, quality, New game.
{
  const { page, context, errors } = await open();
  const b = await labels(page);
  check('four buttons in order', b.map((x) => x.label).join('|') === 'Continue|New game|Controls|Settings', b.map((x) => x.label).join('|'));
  check('Continue is shown disabled without a save, with the reason', b[0].disabled && /No saved journey/.test(await page.textContent('.title-btn')));
  check('New game starts selected and focused', b[1].selected && b[1].focused);
  check('the kicker reads A deep-space survey', (await page.textContent('.ts-kicker')).trim() === 'A deep-space survey');
  check('the tagline is shown', /went dark past the edge of the charts\.\s*Wake it up\./.test(await page.textContent('.ts-tagline')));
  check('the corner labels are shown, hidden from screen readers', /Exploration/.test(await page.textContent('.ts-hud')) && (await page.getAttribute('.ts-hud', 'aria-hidden')) === 'true');
  check('the title has an accessible name', (await page.getByRole('heading', { level: 1 }).textContent()).trim() === 'Kethra');
  check('the 3D backdrop comes up behind the menu', await backdropLive(page));
  check('the game has not started (flow still at boot)', (await page.evaluate(() => window.__DEBUG__.flow.state)) === 'boot');
  check('without a save the backdrop is the ship over Kethra', await page.evaluate(() => ['title-ship', 'title-moon', 'title-asteroids', 'title-hero-surface'].every((n) => window.__DEBUG__.engine.getCurrentScene().scene.getObjectByName(n))));
  const spin = await page.evaluate(async () => {
    const surface = window.__DEBUG__.engine.getCurrentScene().scene.getObjectByName('title-hero-surface');
    const a = surface.rotation.y;
    await new Promise((r) => setTimeout(r, 1000));
    return surface.rotation.y - a;
  });
  check('Kethra turns on its own', Math.abs(spin) > 0.004 && Math.abs(spin) < 0.02, `${spin.toFixed(4)} rad in 1 s`);
  const loops = await page.evaluate(() => document.getAnimations().filter((a) => a.effect?.target?.closest?.('.title-screen') && a.effect.getComputedTiming().iterations === Infinity).length);
  check('nothing on the menu loops', loops === 0, `${loops} looping`);

  await page.keyboard.press('ArrowDown');
  check('ArrowDown selects Controls', (await selectedLabel(page)) === 'Controls');
  check('a light runs along the selected button', await page.evaluate(() => document.getAnimations().some((a) => a.animationName === 'tb-sweep')));
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  check('the selection wraps past Settings and skips disabled Continue', (await selectedLabel(page)) === 'New game');
  await page.keyboard.press('End');
  check('End selects Settings', (await selectedLabel(page)) === 'Settings');
  await page.hover('.title-btn:nth-child(3)');
  check('hovering a button selects and focuses it', (await labels(page))[2].selected && (await labels(page))[2].focused);
  await page.hover('.title-btn:nth-child(1)');
  check('hovering disabled Continue does not select it', !(await labels(page))[0].selected);

  await page.click('.title-btn:nth-child(3)');
  await page.waitForSelector('.panel-overlay.visible .title-panel', { timeout: 5000 }).catch(() => {});
  const rows = await page.$$eval('.panel-overlay.visible .controls-list dt', (d) => d.length).catch(() => 0);
  check('Controls opens the controls list', rows > 10, `${rows} actions`);
  check('the engine pauses while a panel is open', await page.evaluate(() => window.__DEBUG__.engine.paused === true));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check('Esc closes Controls and focus returns to it', (await page.evaluate(() => document.activeElement?.querySelector?.('.tb-label')?.textContent)) === 'Controls');

  await page.click('.title-btn:nth-child(4)');
  await page.waitForSelector('#settings-panel', { timeout: 5000 }).catch(() => {});
  check('Settings opens the settings panel', !!(await page.$('#settings-panel')));
  check('the panel takes the title palette', (await page.evaluate(() => getComputedStyle(document.querySelector('.panel-overlay')).getPropertyValue('--accent').trim())) === '#35bfff');
  await page.click('#settings-panel .segmented button:has-text("Performance")');
  check('a quality picked on the title reaches the engine', (await page.evaluate(() => window.__DEBUG__.engine.getQualityTier())) === 'low');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);
  check('Esc closes Settings and focus returns to it', (await page.evaluate(() => document.activeElement?.querySelector?.('.tb-label')?.textContent)) === 'Settings');
  check('the backdrop draws again after the panel closes', await page.evaluate(() => window.__DEBUG__.engine.paused === false));

  // Every panel closes on a click outside it, and only outside it.
  await page.click('.title-btn:nth-child(4)');
  await page.waitForSelector('#settings-panel', { timeout: 5000 }).catch(() => {});
  const box = await page.$eval('#settings-panel', (p) => p.getBoundingClientRect().toJSON());
  await page.mouse.click(box.x + box.width / 2, box.y + 12);
  await page.waitForTimeout(400);
  check('a click inside Settings leaves it open', !!(await page.$('.panel-overlay.visible #settings-panel')));
  await page.mouse.click(8, 8);
  await page.waitForTimeout(700);
  check('a click outside Settings closes it', !(await page.$('.panel-overlay.visible')) && (await page.evaluate(() => window.__DEBUG__.engine.paused === false)));
  await page.click('.title-btn:nth-child(3)');
  await page.waitForSelector('.panel-overlay.visible .title-panel', { timeout: 5000 }).catch(() => {});
  await page.mouse.click(1350, 760);
  await page.waitForTimeout(700);
  check('a click outside Controls closes it, and focus returns to it', !(await page.$('.panel-overlay.visible')) && (await page.evaluate(() => document.activeElement?.querySelector?.('.tb-label')?.textContent)) === 'Controls');

  await page.getByRole('button', { name: 'New game' }).click();
  await page.waitForFunction(() => !document.querySelector('.title-screen'), null, { timeout: 5000 }).catch(() => {});
  check('New game removes the title', !(await page.$('.title-screen')));
  const intro = await page.waitForFunction(() => performance.getEntriesByName('intro:uncovered').length > 0, null, { timeout: 120000 }).then(() => true, () => false);
  check('New game plays the intro', intro && (await page.evaluate(() => window.__DEBUG__.engine.getCurrentScene()?.kind)) === 'IntroScene');
  check('no errors on the page', errors.length === 0, errors.slice(0, 3).join(' | '));
  await context.close();
}

// 2. A saved journey: Continue first, into the Wren.
{
  const save = await makeSave();
  const { page, context, errors } = await open({ save });
  const b = await labels(page);
  check('with a save, Continue is enabled, selected and focused', !b[0].disabled && b[0].selected && b[0].focused);
  await backdropLive(page);
  check('with a save the backdrop is the astronaut by Isilthe: planet, rings and rocks', await page.evaluate(() => ['title-astronaut', 'title-planet-surface', 'title-rings', 'title-ring-rubble', 'title-formations', 'title-asteroids', 'title-embers'].every((n) => window.__DEBUG__.engine.getCurrentScene().scene.getObjectByName(n))));
  const moving = await page.evaluate(async () => {
    const s = window.__DEBUG__.engine.getCurrentScene();
    const surface = s.scene.getObjectByName('title-planet-surface');
    const bones = s.scene.getObjectByName('title-astronaut').material.uniforms.uBones.value;
    const a = surface.rotation.y;
    const rocks = s.rocks.report();
    const torso = bones[1].elements.slice();
    await new Promise((r) => setTimeout(r, 1000));
    const after = s.rocks.report();
    return {
      spin: surface.rotation.y - a,
      rocks: after.filter((r, i) => Math.hypot(r.x - rocks[i].x, r.y - rocks[i].y) > 0.001).length,
      breath: bones[1].elements.some((v, i) => Math.abs(v - torso[i]) > 1e-5),
    };
  });
  check('Isilthe turns on its own', Math.abs(moving.spin) > 0.008 && Math.abs(moving.spin) < 0.03, `${moving.spin.toFixed(4)} rad in 1 s`);
  check('the drifting rocks move', moving.rocks >= 8, `${moving.rocks} of 12 moved in 1 s`);
  check('the astronaut breathes', moving.breath);
  const lean = await page.evaluate(async () => {
    const cam = window.__DEBUG__.engine.getCurrentScene().camera;
    const before = cam.position.x;
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: window.innerWidth - 1, clientY: window.innerHeight / 2 }));
    await new Promise((r) => setTimeout(r, 1500));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 }));
    return cam.position.x - before;
  });
  check('the camera leans toward the pointer', lean > 0.02, `${lean.toFixed(3)} units`);
  await page.keyboard.press('Enter');
  const ship = await page.waitForFunction(() => window.__DEBUG__?.flow.state === 'wren' && !window.__DEBUG__.flow.isTransitioning(), null, { timeout: 180000, polling: 250 }).then(() => true, () => false);
  check('Enter on Continue resumes aboard the Wren', ship && (await page.evaluate(() => window.__DEBUG__.engine.getCurrentScene()?.kind)) === 'ShipInteriorScene');
  check('no errors on the page', errors.length === 0, errors.slice(0, 3).join(' | '));
  await context.close();
}

// 3. An unreadable save: Continue stays off and says why.
{
  const { page, context } = await open({ save: '{not json' });
  const b = await labels(page);
  check('an unreadable save leaves Continue disabled, with the reason', b[0].disabled && /could not be read/.test(await page.textContent('.title-btn')));
  await context.close();
}

// 4. Reduced motion; and the menu, held back until it comes in with the backdrop.
{
  const { page, context, errors } = await open({ reducedMotion: true });
  check('reduced motion: the backdrop still comes up', await backdropLive(page));
  const still = await page.evaluate(async () => {
    const cam = window.__DEBUG__.engine.getCurrentScene().camera;
    const a = cam.position.clone();
    await new Promise((r) => setTimeout(r, 800));
    return a.length() < 1e-6 && cam.position.length() < 1e-6;
  });
  check('reduced motion: the camera holds still', still);
  await context.close();
  // Before the backdrop: only the dark sky, nothing on the menu visible or reachable.
  const context2 = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page2 = await context2.newPage();
  const errors2 = [];
  page2.on('pageerror', (e) => errors2.push(String(e)));
  page2.on('console', (m) => m.type() === 'error' && errors2.push(m.text()));
  await page2.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page2.waitForSelector('.title-btn', { state: 'attached', timeout: 60000 });
  const early = await page2.evaluate(() => ({ live: !!document.querySelector('.title-screen.backdrop-live'), shown: Number(getComputedStyle(document.querySelector('.ts-column')).opacity) > 0.01, inert: document.querySelector('.title-screen').inert }));
  check('before the backdrop, the menu is held back and out of reach', !early.live && !early.shown && early.inert, JSON.stringify(early));
  await page2.keyboard.press('ArrowDown');
  // Both arrive in the same frame.
  const together = await page2.waitForFunction(() => {
    const el = document.querySelector('.title-screen');
    return el.classList.contains('backdrop-live') ? el.classList.contains('revealed') : null;
  }, null, { timeout: 60000, polling: 'raf' }).then((h) => h.jsonValue(), () => false);
  const at = await page2.evaluate(() => Math.round(performance.now()));
  check('the menu and the backdrop come in together', together, `at ${at} ms`);
  check('a key pressed before then changed nothing; New game is selected and focused', (await selectedLabel(page2)) === 'New game' && (await labels(page2))[1].focused);
  check('no errors on the page', errors.length === 0 && errors2.length === 0, [...errors, ...errors2].slice(0, 3).join(' | '));
  await context2.close();
}

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall title checks passed');
process.exit(failed ? 1 : 0);
