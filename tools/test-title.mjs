// The title screen, end to end: the menu and its four buttons, the 3D backdrop behind it, keyboard and
// mouse selection, Controls and Settings (and focus coming back), a quality change made from the
// title, New game into the intro, Continue into the Wren, an unreadable save, reduced motion, a key
// during the opening, and a click that comes before the backdrop is ready.
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
  await page.waitForSelector('.title-btn', { timeout: 60000 });
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
  check('the kicker reads Deep-space exploration', (await page.textContent('.ts-kicker')).trim() === 'Deep-space exploration');
  check('no tagline or frame labels', !(await page.$('.ts-tagline, .ts-hud, .ts-chrome')));
  check('the title has an accessible name', (await page.getByRole('heading', { level: 1 }).textContent()).trim() === 'Kethra');
  check('the 3D backdrop comes up behind the menu', await backdropLive(page));
  check('the game has not started (flow still at boot)', (await page.evaluate(() => window.__DEBUG__.flow.state)) === 'boot');
  check('the ornamental loops start once the backdrop has settled', await page.waitForFunction(() => document.querySelector('.title-screen.ts-live'), null, { timeout: 15000 }).then(() => true, () => false));

  await page.keyboard.press('ArrowDown');
  check('ArrowDown selects Controls', (await selectedLabel(page)) === 'Controls');
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

// 4. Reduced motion, and a key during the opening.
{
  const { page, context, errors } = await open({ reducedMotion: true });
  check('reduced motion: the backdrop still comes up', await backdropLive(page));
  check('reduced motion: no comet runs', (await page.$eval('.ts-comet', (e) => getComputedStyle(e).animationName)) === 'none');
  await context.close();
  const second = await open();
  await second.page.keyboard.press('Space');
  check('a key during the opening finishes it', await second.page.evaluate(() => document.querySelector('.title-screen').classList.contains('ts-skip')));
  check('no errors on the page', errors.length === 0 && second.errors.length === 0, [...errors, ...second.errors].slice(0, 3).join(' | '));
  await second.context.close();
}

// 5. A click before the backdrop is ready: the game starts anyway, and the backdrop is dropped.
{
  const { page, context, errors } = await open();
  await page.getByRole('button', { name: 'New game' }).click();
  const intro = await page.waitForFunction(() => performance.getEntriesByName('intro:uncovered').length > 0, null, { timeout: 120000 }).then(() => true, () => false);
  await page.waitForTimeout(3000);
  check('an early New game still plays the intro', intro && (await page.evaluate(() => window.__DEBUG__.engine.getCurrentScene()?.kind)) === 'IntroScene');
  check('no errors on the page', errors.length === 0, errors.slice(0, 3).join(' | '));
  await context.close();
}

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall title checks passed');
process.exit(failed ? 1 : 0);
