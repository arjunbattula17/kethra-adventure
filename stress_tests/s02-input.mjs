// Input abuse: double clicks and key spam at the title, pause spam, a key held across alt-tab,
// resize spam, every movement key at once, and interact mashing. Checks the game stays consistent.
import { launch, openPage, check, clean, failures, settled, until, press } from './lib.mjs';

const browser = await launch();
const panelOpen = (page) => page.evaluate(() => document.querySelector('.panel-overlay')?.classList.contains('visible') ?? false);
const paused = (page) => page.evaluate(() => window.__DEBUG__.engine.paused ?? window.__DEBUG__.engine.isPaused?.());
const pos = (page) => page.evaluate(() => { const p = window.__DEBUG__.engine.getCurrentScene().player.rig.position; return { x: p.x, y: p.y, z: p.z }; });
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// A. The title with no save: double-click New game, then Enter and Space spam through the fade.
{
  const { page, context, errors } = await openPage(browser, '?seed=5');
  await page.waitForSelector('.title-btn', { timeout: 60000 });
  const btn = page.locator('.title-btn', { hasText: /new game/i }).first();
  await btn.dblclick();
  for (let i = 0; i < 10; i++) { await press(page, 'Enter', 20); await press(page, 'Space', 20); }
  await until(page, () => window.__DEBUG__?.engine.getCurrentScene()?.kind === 'IntroScene', 120000);
  await page.waitForTimeout(3000);
  const intro = await page.evaluate(() => ({ kind: window.__DEBUG__.engine.getCurrentScene()?.kind, titles: document.querySelectorAll('.title-screen, .title-root').length, skips: document.querySelectorAll('.hold-skip').length }));
  check('double-clicked New game starts one intro', intro.kind === 'IntroScene' && intro.skips <= 1, JSON.stringify(intro));
  await clean(page, errors, 'title double-click and key spam');
  await context.close();
}

// The rest on the Wren, past the tutorial.
const lockSpy = { fn: () => { const orig = HTMLCanvasElement.prototype.requestPointerLock; window.__locks = 0; HTMLCanvasElement.prototype.requestPointerLock = function (...a) { window.__locks++; return orig?.apply(this, a); }; }, arg: null };

// First person still captures the mouse on a click (BUG-014 limits that to cursor-driven scenes).
{
  const { page, context, errors } = await openPage(browser, '?newGame=1&skipIntro=1&seed=5', { init: lockSpy });
  await settled(page, 'ShipInteriorScene');
  await page.evaluate(() => window.__DEBUG__.flow.tutorial?.skip?.());
  await page.waitForTimeout(1500);
  await page.mouse.click(640, 360);
  await page.waitForTimeout(400);
  check('on the Wren a click on the view captures the mouse', (await page.evaluate(() => window.__locks)) > 0);
  await clean(page, errors, 'mouse capture on the Wren');
  await context.close();
}

const { page, context, errors } = await openPage(browser, '?newGame=1&skipIntro=1&seed=5');
await settled(page, 'ShipInteriorScene');
await page.evaluate(() => window.__DEBUG__.flow.tutorial?.skip?.());
await page.waitForTimeout(1500);

// B. Pause spam: 25 Escapes, some mid-open. Paused must match the menu, and play must resume.
for (let i = 0; i < 25; i++) await press(page, 'Escape', 15 + (i % 4) * 20);
await page.waitForTimeout(800);
let open = await panelOpen(page);
check('after Escape spam the engine is paused exactly when a menu is up', (await paused(page)) === open, `menu ${open}, paused ${await paused(page)}`);
if (open) { await press(page, 'Escape'); await page.waitForTimeout(600); }
const p0 = await pos(page);
await page.keyboard.down('KeyW'); await page.waitForTimeout(900); await page.keyboard.up('KeyW');
check('after the pause spam the player can walk', dist(p0, await pos(page)) > 0.5, `moved ${dist(p0, await pos(page)).toFixed(2)} m`);

// C. Hold W, alt-tab away (the window blurs and the pause menu opens), let go while away, come back.
await page.keyboard.down('KeyW');
await page.waitForTimeout(300);
await page.evaluate(() => window.dispatchEvent(new Event('blur')));
await page.keyboard.up('KeyW');
await page.waitForTimeout(500);
open = await panelOpen(page);
check('alt-tab mid-play opens the pause menu', open);
if (open) { await press(page, 'Escape'); await page.waitForTimeout(500); }
const p1 = await pos(page);
await page.waitForTimeout(1200);
check('a key released while away is not stuck down', dist(p1, await pos(page)) < 0.05, `drifted ${dist(p1, await pos(page)).toFixed(2)} m`);

// D. Resize spam, including a 1x1 window, while walking.
await page.keyboard.down('KeyD');
for (const [w, h] of [[320, 240], [2560, 1080], [1, 1], [800, 1200], [1366, 768], [3840, 2160], [1280, 720]]) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(250);
}
await page.keyboard.up('KeyD');
const cam = await page.evaluate(() => { const c = window.__DEBUG__.engine.getCurrentScene().camera; return { aspect: c.aspect, fov: c.fov }; });
check('after resize spam the camera aspect is finite and right', Number.isFinite(cam.aspect) && Math.abs(cam.aspect - 1280 / 720) < 0.01, JSON.stringify(cam));

// E. Every movement key at once, then interact and right-click mashing all over the room.
for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'KeyC', 'Space']) await page.keyboard.down(k);
await page.waitForTimeout(2000);
for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'KeyC', 'Space']) await page.keyboard.up(k);
for (let i = 0; i < 40; i++) {
  await press(page, 'KeyE', 10);
  if (i % 5 === 0) await page.mouse.click(640, 360, { button: 'right' });
  if (i % 7 === 0) { await press(page, 'Escape', 10); }
}
await page.waitForTimeout(1000);
for (let i = 0; i < 3 && (await panelOpen(page)); i++) { await press(page, 'Escape'); await page.waitForTimeout(400); }
check('after the mashing no menu is stuck open', !(await panelOpen(page)));
const p2 = await pos(page);
await page.keyboard.down('KeyS'); await page.waitForTimeout(700); await page.keyboard.up('KeyS');
check('and the player still walks', dist(p2, await pos(page)) > 0.3, `moved ${dist(p2, await pos(page)).toFixed(2)} m`);
await clean(page, errors, 'pause spam, alt-tab, resize, mashing on the Wren');
await context.close();

await browser.close();
console.log(failures() ? `\n${failures()} failed` : '\nall passed');
process.exit(failures() ? 1 : 0);
