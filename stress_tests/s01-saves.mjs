// Persistence abuse: corrupt, odd-shaped and old saves; storage that throws on every access; a full
// quota. The game must boot, play and open every panel without an uncaught error.
import { launch, openPage, check, clean, failures, settled, until, press } from './lib.mjs';

const KEY = 'kethra_save_v1';
const browser = await launch();
const seed = (raw) => ({ fn: ([k, v]) => { if (!sessionStorage.getItem('__seeded')) { localStorage.setItem(k, v); sessionStorage.setItem('__seeded', '1'); } }, arg: [KEY, raw] });

async function openEveryPanel(page, errors) {
  for (const evt of ['ui:open_journal', 'ui:open_galaxy_map', 'ui:open_repair']) {
    await page.evaluate((e) => window.__DEBUG__.bus.emit(e), evt).catch((e) => errors.push(`${evt} threw: ${e.message.split('\n')[0]}`));
    await page.waitForTimeout(700);
    await press(page, 'Escape');
    await page.waitForTimeout(250);
    await press(page, 'Escape');
    await page.waitForTimeout(250);
  }
  await press(page, 'Tab');
  await page.waitForTimeout(600);
  await press(page, 'Escape');
  await page.waitForTimeout(300);
}
const titleButtons = (page) => page.$$eval('.title-btn', (b) => b.map((x) => x.textContent));

// A. Not JSON at all.
{
  const { page, context, errors } = await openPage(browser, '?seed=3', { init: seed('{{not json') });
  await page.waitForSelector('.title-btn', { timeout: 60000 });
  const buttons = await titleButtons(page);
  check('garbage save: no Continue offered', !buttons.some((b) => /continue/i.test(b)), buttons.join(', '));
  await clean(page, errors, 'garbage save at the title');
  await context.close();
}

// B. Valid JSON of the wrong kind at the top level.
for (const raw of ['null', '[]', '42', '"hello"']) {
  const { page, context, errors } = await openPage(browser, '?seed=3', { init: seed(raw) });
  await page.waitForSelector('.title-btn', { timeout: 60000 });
  const cont = page.locator('.title-btn', { hasText: /continue/i });
  if (await cont.count()) {
    await cont.first().click();
    await until(page, () => !!window.__DEBUG__?.engine.getCurrentScene(), 120000);
    await page.waitForTimeout(4000);
  }
  await clean(page, errors, `top-level ${raw} save`);
  await context.close();
}

// C. The right shape with wrong contents everywhere: element types, negative and huge numbers, an
// unknown scene, a course that isn't numbers.
{
  const weird = JSON.stringify({
    scene: 'nowhere', objective: 42, xp: -1, level: 1e308, unspentPoints: 'lots',
    flags: [1, null, {}, 'galaxy_revealed', 'logs_available', 'damage_assessed', 'tutorial_battle_complete'],
    inventory: [null, 5, 'resonant_crystal', { id: 'x' }],
    journalLogs: [null, 3, {}, { id: 7, title: null, body: 12 }],
    planetsUnlocked: ['kethra', 7, null],
    attributes: { perception: -5, engineering: '9', insight: 1e9 },
    shipSystems: { navigation: 'broken', scanner: null, comms: { repaired: 'yes' } },
    course: { days: 'x', cells: -3 },
    clues: 'none', clueConnections: [null, [1, 2]],
  });
  const { page, context, errors } = await openPage(browser, '?seed=3', { init: seed(weird) });
  await page.waitForSelector('.title-btn', { timeout: 60000 });
  await page.locator('.title-btn', { hasText: /continue/i }).first().click();
  const reached = await until(page, () => !!window.__DEBUG__?.engine.getCurrentScene() && !window.__DEBUG__.flow.isTransitioning(), 180000);
  check('weird save: Continue reaches a scene', reached, await page.evaluate(() => window.__DEBUG__?.engine.getCurrentScene()?.kind ?? 'none'));
  await page.waitForTimeout(3000);
  if (reached) await openEveryPanel(page, errors);
  await clean(page, errors, 'weird-contents save, every panel opened');
  await context.close();
}

// D. Storage blocked outright (private modes, managed Chromebooks): every access throws.
{
  const block = { fn: () => { Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('blocked', 'SecurityError'); } }); }, arg: null };
  const { page, context, errors } = await openPage(browser, '?seed=3', { init: block });
  await page.waitForSelector('.title-btn', { timeout: 60000 });
  await page.locator('.title-btn', { hasText: /new game/i }).first().click();
  await page.waitForSelector('.hold-skip', { timeout: 180000 });
  await press(page, 'Space', 1100);
  await settled(page, 'ShipInteriorScene');
  await page.evaluate(() => window.__DEBUG__.gameState.setFlag('stress_probe'));
  await page.waitForTimeout(1500);
  const expected = (e) => /could not write save/.test(e);
  await clean(page, errors.filter((e) => !expected(e)), 'storage blocked: title, new game, intro skip, a save');
  await context.close();
}

// E. Storage readable but full: every write throws QuotaExceededError.
{
  const full = { fn: () => { Storage.prototype.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); }; }, arg: null };
  const { page, context, errors } = await openPage(browser, '?newGame=1&skipIntro=1&seed=3', { init: full });
  await settled(page, 'ShipInteriorScene');
  await page.evaluate(() => window.__DEBUG__.gameState.setFlag('stress_probe'));
  await page.waitForTimeout(1500);
  const toast = await page.evaluate(() => document.querySelector('.toast, #toast')?.textContent ?? '');
  check('full storage: the player is told the save failed', /save/i.test(toast), toast || '(no toast)');
  await clean(page, errors.filter((e) => !/could not write save/.test(e)), 'full storage');
  await context.close();
}

// F. A save whose xp is far past its level's threshold (BUG-035): the next xp gain must not hang.
{
  const huge = JSON.stringify({ flags: ['tutorial_battle_complete', 'galaxy_revealed'], planetsUnlocked: ['kethra'], xp: 1e20, level: 1 });
  const { page, context, errors } = await openPage(browser, '?seed=3', { init: seed(huge) });
  await page.waitForSelector('.title-btn', { timeout: 60000 });
  await page.locator('.title-btn', { hasText: /continue/i }).first().click();
  await settled(page, 'ShipInteriorScene');
  const done = await Promise.race([
    page.evaluate(() => { window.__DEBUG__.gameState.addAttributeXp('insight', 1); return true; }),
    new Promise((r) => setTimeout(() => r(false), 10000)),
  ]);
  check('BUG-035: a save with an absurd xp does not hang the next level-up', done === true);
  if (done) await clean(page, errors, 'absurd xp');
  await context.close();
}

await browser.close();
console.log(failures() ? `\n${failures()} failed` : '\nall passed');
process.exit(failures() ? 1 : 0);
