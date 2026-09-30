// Loading failures: a file that fails once is retried and the game carries on; a file that never loads
// ends on the "Something didn't load" screen with a reload, never on a black screen or an endless
// loading bar. Also checks the start page: nothing starts until a button is pressed.
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

// 1. The start page stays put: no engine work starts the game on its own.
{
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await page.goto(BASE);
  await page.waitForSelector('.title-btn', { timeout: 60000 });
  await page.waitForTimeout(15000);
  const state = await page.evaluate(() => ({ title: !!document.querySelector('.title-screen'), flow: window.__DEBUG__?.flow.state ?? 'no engine yet', scene: window.__DEBUG__?.engine.getCurrentScene()?.kind ?? null }));
  check('title waits 15 s without starting anything', state.title && state.flow === 'boot' && state.scene === null, JSON.stringify(state));
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

// 4. A Kethra file that never loads, during the trip: the cruise ends on the failure screen instead of
//    holding its last shot forever.
{
  const { page } = await pageFailing('CommonTree_1.gltf', Infinity);
  await page.goto(`${BASE}?newGame=1&unlockKethra=1&skipIntro=1`);
  await page.waitForFunction(() => window.__DEBUG__?.flow.state === 'wren' && !window.__DEBUG__.flow.isTransitioning(), null, { timeout: 300000, polling: 250 });
  // A later trip: no First light, and no canopy descent, so the cruise prepares Kethra itself.
  await page.evaluate(() => {
    window.__DEBUG__.gameState.setFlag('first_light');
    window.__DEBUG__.gameState.setFlag('canopy_flown');
  });
  await page.evaluate(() => window.__DEBUG__.bus.emit('galaxy:travel_to', 'kethra'));
  await page.waitForFunction(() => window.__DEBUG__.engine.getCurrentScene()?.kind === 'CruiseScene', null, { timeout: 120000, polling: 250 });
  await page.waitForSelector('.hold-skip', { timeout: 30000 });
  await page.keyboard.down('Space');
  await page.waitForTimeout(1100);
  await page.keyboard.up('Space');
  const ok = await page.waitForFunction(() => {
    const el = document.querySelector('.loading-indicator.visible');
    return !!el && /didn’t load/.test(el.textContent ?? '');
  }, null, { timeout: 180000, polling: 250 }).then(() => true, () => false);
  check('a level file that never loads ends the trip on the failure screen', ok);
  await page.close();
}

await browser.close();
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
