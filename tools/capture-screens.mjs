// Screenshots every screen and distinct UI state, for the style audit's before/after comparison.
// Same walk each time, so docs/screens/before/NN-name.png and docs/screens/after/NN-name.png pair up.
//
//   npx vite preview   (in another terminal)
//   node tools/capture-screens.mjs <before|after> [baseUrl] [--size=1366x768]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const SET = args[0] || 'after';
const BASE = args[1] || 'http://localhost:4173/kethra-adventure/';
const [W, H] = (process.argv.find((a) => a.startsWith('--size='))?.split('=')[1] ?? '1366x768').split('x').map(Number);
const OUT = `docs/screens/${SET}`;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
const errors = [];
let n = 0;
async function newPage() {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return page;
}
async function shot(page, name) {
  n++;
  const file = `${OUT}/${String(n).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: file });
  console.log('  ', file);
}
const waitScene = (page, kind) =>
  page.waitForFunction((k) => window.__DEBUG__?.engine.getCurrentScene()?.kind === k, kind, { timeout: 240000, polling: 500 });
async function teleport(page, x, y, z, yaw = 0) {
  await page.evaluate(({ x, y, z, yaw }) => {
    const s = window.__DEBUG__.engine.getCurrentScene();
    s.player.teleport(new s.player.rig.position.constructor(x, y, z), yaw);
  }, { x, y, z, yaw });
  await page.waitForTimeout(500);
}
async function pressE(page) {
  await page.keyboard.down('KeyE');
  await page.waitForTimeout(120);
  await page.keyboard.up('KeyE');
  await page.waitForTimeout(700);
}
const has = (page, sel) => page.$(sel).then((e) => !!e);

// 1. Title and its sub-screens.
{
  const page = await newPage();
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.title-btn', { timeout: 60000 });
  await page.waitForTimeout(1500);
  await shot(page, 'title');
  for (const [label, name] of [['Controls', 'controls'], ['Credits', 'credits'], ['Settings', 'settings']]) {
    const btn = page.getByRole('button', { name: label, exact: true });
    if (await btn.count()) {
      await btn.first().click();
      await page.waitForTimeout(700);
      await shot(page, name);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
  }
  // New game: loading, then the intro.
  await page.getByRole('button', { name: 'New game' }).click();
  await page.waitForTimeout(1200);
  await shot(page, 'loading');
  await waitScene(page, 'IntroScene');
  await page.waitForFunction(() => !document.querySelector('.loading-indicator.visible'), undefined, { timeout: 240000, polling: 500 });
  await page.waitForTimeout(9000);
  await shot(page, 'intro-mid');
  await page.waitForTimeout(8000);
  await shot(page, 'intro-text');
  await page.close();
}

// 2. The tutorial on the ship.
{
  const page = await newPage();
  await page.goto(`${BASE}?newGame=1&tier=low`, { waitUntil: 'domcontentloaded' });
  await waitScene(page, 'IntroScene');
  await page.waitForFunction(() => !document.querySelector('.loading-indicator.visible'), undefined, { timeout: 240000, polling: 500 });
  await page.waitForTimeout(1500);
  await page.keyboard.press('Space');
  await waitScene(page, 'ShipInteriorScene');
  await page.waitForTimeout(3500);
  await shot(page, 'tutorial-first-step');
  await page.close();
}

// 3. Mid-play on the ship: HUD, panels, map, the reveal and the course plot.
{
  const page = await newPage();
  await page.goto(`${BASE}?skipIntro=1&unlockKethra=1&newGame=1&tier=low`, { waitUntil: 'domcontentloaded' });
  await waitScene(page, 'ShipInteriorScene');
  await page.waitForTimeout(2500);
  await shot(page, 'ship-hud');
  await teleport(page, 0, 1.7, -3.2, 0);
  await page.waitForTimeout(600);
  await shot(page, 'ship-interact-prompt');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(700);
  await shot(page, 'character-sheet');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  for (const [evt, name] of [['ui:open_journal', 'journal'], ['ui:open_repair', 'repair'], ['ui:open_galaxy_map', 'map-solar']]) {
    await page.evaluate((e) => window.__DEBUG__.bus.emit(e), evt);
    await page.waitForTimeout(1200);
    await shot(page, name);
    if (name !== 'map-solar') {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    }
  }
  await page.evaluate(() => window.__DEBUG__.mapController.openPlanet('kethra'));
  await page.waitForTimeout(1200);
  await shot(page, 'map-kethra');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.keyboard.press('KeyO');
  await page.waitForTimeout(700);
  await shot(page, 'settings-in-game');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.close();
}
{
  const page = await newPage();
  await page.goto(`${BASE}?skipIntro=1&newGame=1&tier=low`, { waitUntil: 'domcontentloaded' });
  await waitScene(page, 'ShipInteriorScene');
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__DEBUG__.flow.transitionToGalaxyReveal());
  await page.waitForTimeout(700);
  await shot(page, 'transition-fade');
  await page.waitForFunction(() => window.__DEBUG__.engine.getCurrentScene()?.ship, undefined, { timeout: 240000, polling: 500 });
  await page.waitForTimeout(9000);
  await shot(page, 'galaxy-reveal');
  // Drive to the end of the reveal, then the course plot opens over the console.
  await page.waitForFunction(() => document.querySelector('.reveal-continue, .galaxy-continue, [data-reveal-continue]') || window.__DEBUG__.engine.getCurrentScene()?.kind === 'ShipInteriorScene', undefined, { timeout: 120000, polling: 500 }).catch(() => {});
  await page.evaluate(() => window.__DEBUG__.flow.finishReveal());
  await waitScene(page, 'ShipInteriorScene');
  await page.waitForTimeout(4000);
  await shot(page, 'course-plot');
  await page.close();
}

// 4. Kethra: arrival, dialogue, the Heart puzzle.
{
  const page = await newPage();
  await page.goto(`${BASE}?skipIntro=1&unlockKethra=1&newGame=1&tier=low`, { waitUntil: 'domcontentloaded' });
  await waitScene(page, 'ShipInteriorScene');
  await page.evaluate(() => window.__DEBUG__.flow.travelToPlanet('kethra'));
  await waitScene(page, 'KethraScene');
  await page.waitForTimeout(3500);
  await shot(page, 'kethra-arrival');
  await teleport(page, -3, 2, 4.5);
  await pressE(page);
  if (await has(page, '#dialogue-panel')) await shot(page, 'dialogue');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  // Dim the grove, then open the Heart.
  await teleport(page, 0, 3.3, -10.5);
  await pressE(page);
  await page.waitForTimeout(600);
  await teleport(page, 0, 3.3, -15.2);
  await pressE(page);
  await page.waitForTimeout(800);
  await shot(page, 'kethra-heart-puzzle');
  await page.close();
}

// 5. Vessek Anchorage: arrival card, dialogue, the pulse, the breaker panel, a document, the ending.
{
  const page = await newPage();
  await page.goto(`${BASE}?skipIntro=1&unlockVessek=1&newGame=1&tier=low`, { waitUntil: 'domcontentloaded' });
  await waitScene(page, 'ShipInteriorScene');
  const hasVessek = await page.evaluate(() => window.__DEBUG__.levels?.includes?.('vessek'));
  if (hasVessek) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    await shot(page, 'pause-menu');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    await page.evaluate(() => window.__DEBUG__.flow.travelToPlanet('vessek'));
    await waitScene(page, 'VessekScene');
    await page.waitForTimeout(1200);
    await shot(page, 'vessek-arrival-card');
    await page.waitForTimeout(5000);
    await teleport(page, -2.6, 0.2, 0.2, 0);
    await pressE(page);
    await page.keyboard.press('Digit2');
    await page.waitForTimeout(600);
    await shot(page, 'vessek-dialogue-stat-gates');
    await page.keyboard.press('Digit1');
    await page.waitForTimeout(500);
    await page.keyboard.press('Digit1');
    await page.waitForTimeout(1300);
    await shot(page, 'vessek-pulse');
    await page.waitForTimeout(6000);
    await shot(page, 'vessek-blackout-hud');
    await teleport(page, 4.6, 0.2, -8.8, 0);
    await pressE(page);
    await page.waitForTimeout(500);
    await page.click('#breaker-panel button[aria-label$="Circulation pumps"]');
    await page.click('#breaker-panel button[aria-label$="Hydroponics heaters"]');
    await page.waitForTimeout(300);
    await shot(page, 'vessek-breakers-overload');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    await teleport(page, -4.2, 0.2, 1.4, 1.57);
    await pressE(page);
    await shot(page, 'document-reader');
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.__DEBUG__.flow.playEnding());
    await waitScene(page, 'EndingScene');
    await page.waitForTimeout(9000);
    await shot(page, 'ending');
    await page.keyboard.press('Space');
    await page.waitForTimeout(1500);
    await shot(page, 'credits');
  }
  await page.close();
}

console.log(errors.length ? `console errors:\n  ${[...new Set(errors)].join('\n  ')}` : 'no console errors');
await browser.close();
