// Loading failures: a file that fails once is retried and the game carries on; a file that never loads
// ends somewhere the player can act, never on a black screen or an endless loading bar. At start-up
// that is the "Something didn't load" screen with a reload; during a trip it is back aboard the Wren,
// in control, with a message, and the trip can be flown again (DECISIONS D-34). Also checks the start
// page: nothing starts until a button is pressed.
//
//   npx vite preview --port 4190 --strictPort   (in another terminal)
//   node tools/test-load-failure.mjs [baseUrl]
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:4190/kethra-adventure/';
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu'] });
let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed++;
};

/** A page whose requests for `file` fail `times` times (Infinity: always). */
async function pageFailing(file, times) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  let aborted = 0;
  await page.route(`**/${file}`, (route) => {
    if (aborted < times) {
      aborted++;
      return route.abort('connectionfailed');
    }
    return route.continue();
  });
  return { page, aborted: () => aborted };
}
const failureShown = (page) => page.evaluate(() => {
  const el = document.querySelector('.loading-indicator.visible');
  return !!el && /didn’t load/.test(el.textContent ?? '') && !!el.querySelector('button');
});
const sceneKind = (page) => page.evaluate(() => window.__DEBUG__?.engine.getCurrentScene()?.kind ?? null);
/** Where the player is and whether they can act: the same reading as stress_tests/s09-failures.mjs. */
const inControl = (page) => page.evaluate(() => {
  const s = window.__DEBUG__.engine.getCurrentScene();
  return {
    kind: s?.kind ?? null,
    state: window.__DEBUG__.flow.state,
    busy: window.__DEBUG__.flow.isTransitioning(),
    enabled: s?.player?.enabled ?? null,
    letterbox: !!document.querySelector('.letterbox-bar.visible'),
    failureScreen: !!document.querySelector('.loading-indicator.visible'),
    toasts: [...document.querySelectorAll('.toast')].map((t) => t.textContent),
  };
});
/** Flies the trip to Kethra from the Wren, skipping the cruise, as a later trip (no First light, no MG2). */
async function flyToKethra(page) {
  await page.evaluate(() => window.__DEBUG__.bus.emit('galaxy:travel_to', 'kethra'));
  await page.waitForFunction(() => window.__DEBUG__.engine.getCurrentScene()?.kind === 'CruiseScene', null, { timeout: 120000, polling: 250 });
  await page.waitForSelector('.hold-skip', { timeout: 30000 });
  await page.keyboard.down('Space');
  await page.waitForTimeout(1100);
  await page.keyboard.up('Space');
}

// 1. The start page stays put: no engine work starts the game on its own.
{
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await page.goto(BASE);
  await page.waitForSelector('.title-btn', { timeout: 60000 });
  await page.waitForTimeout(15000);
  const state = await page.evaluate(() => ({ title: !!document.querySelector('.title-screen'), flow: window.__DEBUG__?.flow.state ?? 'no engine yet', scene: window.__DEBUG__?.engine.getCurrentScene()?.kind ?? null }));
  // The title's own 3D backdrop (TitleScene) may be the engine's scene; nothing of the game may be.
  check('title waits 15 s without starting anything', state.title && state.flow === 'boot' && (state.scene === null || state.scene === 'TitleScene'), JSON.stringify(state));
  const buttons = await page.$$eval('.title-btn', (bs) => bs.map((b) => b.textContent.trim()));
  check('title offers New game, Controls and Settings', ['New game', 'Controls', 'Settings'].every((b) => buttons.includes(b)), buttons.join(', '));
  await page.close();
}

// 2. A ship kit file that fails once: retried, and the Wren builds.
{
  const { page, aborted } = await pageFailing('Door_Frame_Square.gltf', 1);
  await page.goto(`${BASE}?newGame=1&skipIntro=1`);
  const ok = await page.waitForFunction(() => window.__DEBUG__?.flow.state === 'wren' && !window.__DEBUG__.flow.isTransitioning(), null, { timeout: 300000, polling: 250 }).then(() => true, () => false);
  check('a file that fails once is retried and the Wren loads', ok && aborted() === 1 && (await sceneKind(page)) === 'ShipInteriorScene', `aborted ${aborted()}`);
  await page.close();
}

// 3. A ship kit file that never loads: the failure screen, not a black screen.
{
  const { page } = await pageFailing('Door_Frame_Square.gltf', Infinity);
  await page.goto(`${BASE}?newGame=1&skipIntro=1`);
  const ok = await page.waitForFunction(() => {
    const el = document.querySelector('.loading-indicator.visible');
    return !!el && /didn’t load/.test(el.textContent ?? '');
  }, null, { timeout: 120000, polling: 250 }).then(() => true, () => false);
  check('a file that never loads ends on the failure screen with a reload', ok && (await failureShown(page)));
  await page.close();
}

// 4. A Kethra file that never loads, during the trip: the cruise does not hold its last shot forever and
//    the screen does not go black. The trip ends back aboard a fresh Wren with the player in control and
//    the reason said, and once the file loads again the same trip arrives. (Until 2026-10-14 this check
//    expected the failure screen; the team chose this recovery instead, which our stress scenario
//    stress_tests/s09-failures.mjs also holds the game to. DECISIONS D-34.)
{
  let blocking = true;
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  let aborted = 0;
  await page.route('**/CommonTree_1.gltf', (route) => {
    if (!blocking) return route.continue();
    aborted++;
    return route.abort('connectionfailed');
  });
  await page.goto(`${BASE}?newGame=1&unlockKethra=1&skipIntro=1`);
  await page.waitForFunction(() => window.__DEBUG__?.flow.state === 'wren' && !window.__DEBUG__.flow.isTransitioning(), null, { timeout: 300000, polling: 250 });
  // A later trip: no First light, and no canopy descent, so the cruise prepares Kethra itself.
  await page.evaluate(() => {
    window.__DEBUG__.gameState.setFlag('first_light');
    window.__DEBUG__.gameState.setFlag('canopy_flown');
  });
  await flyToKethra(page);
  const back = await page.waitForFunction(() => {
    const d = window.__DEBUG__;
    return d.engine.getCurrentScene()?.kind === 'ShipInteriorScene' && d.flow.state === 'wren' && !d.flow.isTransitioning();
  }, null, { timeout: 180000, polling: 250 }).then(() => true, () => false);
  // The fade back in and the toast take a moment after the scene is current.
  await page.waitForTimeout(1500);
  const s = await inControl(page);
  check(
    'a level file that never loads ends the trip back aboard the Wren, in control, with the reason said',
    back && aborted > 0 && s.enabled === true && !s.letterbox && !s.failureScreen && s.toasts.some((t) => /Navigation data unavailable/.test(t)),
    `${JSON.stringify(s)}, aborted ${aborted}`,
  );
  // The connection comes back: the same trip arrives.
  blocking = false;
  if (back) {
    await flyToKethra(page);
    const arrived = await page.waitForFunction(() => window.__DEBUG__.engine.getCurrentScene()?.kind === 'KethraScene' && !window.__DEBUG__.flow.isTransitioning(), null, { timeout: 240000, polling: 250 }).then(() => true, () => false);
    const after = await inControl(page);
    check('once the file loads again, the same trip arrives at Kethra', arrived && after.enabled === true && !after.failureScreen, JSON.stringify(after));
  } else {
    check('once the file loads again, the same trip arrives at Kethra', false, 'not reached: the first trip did not come back');
  }
  await page.close();
}

await browser.close();
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
