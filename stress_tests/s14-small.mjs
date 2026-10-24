// The smaller input and presentation faults: captions after a cruise skip (BUG-045), O and Esc
// auto-repeat (BUG-060), a key from the title replayed on the first frame (BUG-058), and the skip's
// key swallower outliving an alt-tab (BUG-025).
import { launch, openPage, check, clean, failures, settled, until, press } from './lib.mjs';

const browser = await launch();
const ONLY = process.argv[2];

// BUG-045: skip the cruise as soon as the hint is up; the skipped beats' captions must not play.
if (!ONLY || ONLY === 'cruise') {
  const { page, context, errors } = await openPage(browser, '?newGame=1&skipIntro=1&unlockVessek=1&tier=low&seed=7');
  await settled(page, 'ShipInteriorScene');
  await page.evaluate(() => { window.__DEBUG__.flow.tutorial?.skip?.(); window.__DEBUG__.gameState.setFlag('first_light'); });
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.__DEBUG__.bus.emit('galaxy:travel_to', 'vessek'));
  await until(page, () => window.__DEBUG__.engine.getCurrentScene()?.kind === 'CruiseScene', 90000);
  await page.waitForSelector('.hold-skip', { timeout: 30000 });
  await press(page, 'Space', 1100);
  await page.evaluate(() => {
    window.__CAPTIONS__ = [];
    const el = document.querySelector('.cinematic-caption');
    new MutationObserver(() => { if (el.classList.contains('visible')) window.__CAPTIONS__.push(el.textContent); }).observe(el, { attributes: true, childList: true, subtree: true });
  });
  await page.waitForTimeout(6000);
  const captions = await page.evaluate(() => window.__CAPTIONS__);
  check('BUG-045: after a cruise skip, the skipped captions do not play over the title', captions.length === 0, captions.join(' | '));
  await clean(page, errors, 'cruise skip');
  await context.close();
}

// BUG-060: O and Esc auto-repeat.
if (!ONLY || ONLY === 'repeat') {
  const { page, context, errors } = await openPage(browser, '?newGame=1&skipIntro=1&tier=low&seed=7');
  await settled(page, 'ShipInteriorScene');
  await page.evaluate(() => window.__DEBUG__.flow.tutorial?.skip?.());
  await page.waitForTimeout(1200);
  const active = () => page.evaluate(() => (document.querySelector('.panel-overlay')?.classList.contains('visible') ? document.querySelector('.panel-overlay .panel')?.id || 'open' : null));
  await press(page, 'KeyO');
  await page.waitForTimeout(500);
  const opened = await active();
  await page.evaluate(() => { for (let i = 0; i < 5; i++) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyO', key: 'o', repeat: true, bubbles: true })); });
  await page.waitForTimeout(500);
  check('BUG-060: holding O leaves Settings open (one toggle per press)', opened !== null && (await active()) !== null, `after press ${opened}, after repeats ${await active()}`);
  await press(page, 'Escape');
  await page.waitForTimeout(600);
  await page.evaluate(() => { for (let i = 0; i < 5; i++) document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', repeat: true, bubbles: true })); });
  await page.waitForTimeout(600);
  check('BUG-060: an Esc held past closing a panel does not open the pause menu', (await active()) === null, `${await active()}`);
  await clean(page, errors, 'key repeat');
  await context.close();
}

// BUG-058: Space on the title's Continue must not make the player jump on arrival.
if (!ONLY || ONLY === 'replay') {
  const save = JSON.stringify({ flags: ['tutorial_battle_complete', 'galaxy_revealed'], planetsUnlocked: ['kethra'] });
  const init = {
    fn: (v) => {
      if (!sessionStorage.getItem('__seeded')) { localStorage.setItem('kethra_save_v1', v); sessionStorage.setItem('__seeded', '1'); }
      window.__MAXVY__ = 0;
      const tick = () => { const p = window.__DEBUG__?.engine.getCurrentScene()?.player; if (p) window.__MAXVY__ = Math.max(window.__MAXVY__, p.velocityY); requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    },
    arg: save,
  };
  const { page, context, errors } = await openPage(browser, '?tier=low&seed=7', { init });
  // The menu can't be reached until it is revealed with the title's backdrop (DECISIONS D-37).
  await page.waitForSelector('.title-screen.revealed', { timeout: 60000 });
  await page.locator('.title-btn', { hasText: /continue/i }).first().focus();
  await press(page, 'Space', 60);
  await settled(page, 'ShipInteriorScene');
  await page.waitForTimeout(1500);
  const vy = await page.evaluate(() => window.__MAXVY__);
  check('BUG-058: Space pressed on the title\'s Continue does not make the player jump on arrival', vy <= 0.01, `max vertical speed ${vy.toFixed(2)}`);
  await clean(page, errors, 'title key replay');
  await context.close();
}

// BUG-025: hold Space until the intro skips, alt-tab away, and come back: Space must work again.
if (!ONLY || ONLY === 'swallow') {
  const { page, context, errors } = await openPage(browser, '?newGame=1&tier=low&seed=7');
  await page.waitForSelector('.hold-skip', { timeout: 240000 });
  await page.keyboard.down('Space');
  await until(page, () => window.__DEBUG__.engine.getCurrentScene()?.kind !== 'IntroScene' || !document.querySelector('.hold-skip'), 20000);
  await page.evaluate(() => { window.dispatchEvent(new Event('blur')); window.__SEEN__ = 0; window.addEventListener('keydown', (e) => { if (e.code === 'Space') window.__SEEN__++; }); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true })); });
  const seen = await page.evaluate(() => window.__SEEN__);
  check('BUG-025: after an alt-tab mid-hold, the next Space press reaches the game', seen === 1, `game saw ${seen}`);
  await page.keyboard.up('Space');
  await clean(page, errors, 'skip swallower');
  await context.close();
}

await browser.close();
console.log(failures() ? `\n${failures()} failed` : '\nall passed');
process.exit(failures() ? 1 : 0);
