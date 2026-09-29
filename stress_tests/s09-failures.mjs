// Download failures mid-game (a dropped connection, a stale deploy): the reveal's chunk failing
// (BUG-009), and a level's assets failing after the departure has begun, then a retry once the
// connection is back (BUG-008). The player must always end up in control, and retries must work.
import { launch, openPage, check, clean, failures, settled, until, press } from './lib.mjs';

const browser = await launch();
const ONLY = process.argv[2];
const inControl = (page) => page.evaluate(() => {
  const s = window.__DEBUG__.engine.getCurrentScene();
  return { kind: s?.kind ?? null, state: window.__DEBUG__.flow.state, busy: window.__DEBUG__.flow.isTransitioning(), enabled: s?.player?.enabled ?? null, letterbox: !!document.querySelector('.letterbox-bar.visible') };
});

// BUG-009: the reveal's code fails to download.
if (!ONLY || ONLY === 'reveal') {
  const { page, context, errors } = await openPage(browser, '', { init: null });
  let hits = 0;
  await page.route(/GalaxyRevealScene-.*\.js/, (r) => { hits++; return r.abort(); });
  await page.goto(page.url().replace(/\?.*$/, '') + '?newGame=1&skipTutorial=1&tier=low&seed=7', { waitUntil: 'domcontentloaded' });
  await until(page, () => !!window.__DEBUG__?.engine.getCurrentScene() && !window.__DEBUG__.flow.isTransitioning(), 120000);
  await page.waitForTimeout(6000);
  const s = await inControl(page);
  const revealed = await page.evaluate(() => window.__DEBUG__.gameState.hasFlag('galaxy_revealed'));
  check('BUG-009: when the reveal cannot load, the player still ends up on the Wren in control, navigation online', hits > 0 && s.state === 'wren' && !s.busy && s.enabled === true && !s.letterbox && revealed, `${JSON.stringify(s)}, revealed ${revealed}, blocked ${hits}`);
  await clean(page, errors.filter((e) => !/Failed to fetch|ERR_FAILED|dynamically imported module/i.test(e)), 'reveal chunk failure');
  await context.close();
}

// BUG-008: a Vessek trip whose level assets fail after the departure; then the connection returns.
if (!ONLY || ONLY === 'trip') {
  const { page, context, errors } = await openPage(browser, '?newGame=1&skipIntro=1&unlockVessek=1&tier=low&seed=7');
  await settled(page, 'ShipInteriorScene');
  await page.evaluate(() => { window.__DEBUG__.flow.tutorial?.skip?.(); window.__DEBUG__.gameState.setFlag('first_light'); });
  await page.waitForTimeout(1000);
  let hits = 0;
  const block = (r) => { hits++; return r.abort(); };
  await page.route(/\/models\/(?!quaternius\/)/, block);
  await page.evaluate(() => window.__DEBUG__.bus.emit('galaxy:travel_to', 'vessek'));
  await until(page, () => window.__DEBUG__.engine.getCurrentScene()?.kind === 'CruiseScene', 90000);
  await page.waitForSelector('.hold-skip', { timeout: 30000 }).catch(() => {});
  await press(page, 'Space', 1100);
  await page.waitForTimeout(25000);
  const s = await inControl(page);
  check('BUG-008: when the level cannot load after departure, the player is back on the Wren in control', hits > 0 && s.kind === 'ShipInteriorScene' && !s.busy && s.enabled === true && !s.letterbox, `${JSON.stringify(s)}, blocked ${hits} requests`);
  // The connection comes back: a second attempt must work.
  await page.unroute(/\/models\/(?!quaternius\/)/, block);
  if (s.kind === 'ShipInteriorScene' && !s.busy) {
    await page.evaluate(() => window.__DEBUG__.bus.emit('galaxy:travel_to', 'vessek'));
    await until(page, () => window.__DEBUG__.engine.getCurrentScene()?.kind === 'CruiseScene', 90000);
    await page.waitForSelector('.hold-skip', { timeout: 30000 }).catch(() => {});
    await press(page, 'Space', 1100);
    const ok = await until(page, () => window.__DEBUG__.engine.getCurrentScene()?.kind === 'VessekScene' && !window.__DEBUG__.flow.isTransitioning(), 180000);
    check('BUG-008: once the connection is back, the same trip succeeds', ok, JSON.stringify(await inControl(page)));
  }
  await clean(page, errors.filter((e) => !/Failed to fetch|ERR_FAILED|net::|did not complete|failed to load/i.test(e)), 'trip with failing assets');
  await context.close();
}

await browser.close();
console.log(failures() ? `\n${failures()} failed` : '\nall passed');
process.exit(failures() ? 1 : 0);
