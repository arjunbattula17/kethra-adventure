import { chromium } from 'playwright';

const baseUrl = process.argv[2] || 'http://localhost:5180';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (msg) => console.log('[console]', msg.type(), msg.text()));
await page.exposeFunction('logPLError', (msg) => console.log('[PL ERROR]', msg));
await page.goto(baseUrl + '?skipIntro=1', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__DEBUG__?.gameState, { timeout: 10000 });
await page.waitForTimeout(1000);

const before = await page.evaluate(() => {
  const scene = window.__DEBUG__.engine.getCurrentScene();
  return { yaw: scene.player.yaw, pitch: scene.player.pitch, pointerLocked: window.__DEBUG__.InputManager?.pointerLocked };
});
console.log('before:', JSON.stringify(before));

await page.evaluate(() => {
  document.addEventListener('pointerlockerror', () => {
    window.__PL_ERROR__ = (window.__PL_ERROR__ || 0) + 1;
  });
});

// Click canvas to request pointer lock, like a real player would.
await page.mouse.click(640, 360);
await page.waitForTimeout(300);
console.log('pointerlockerror fired:', await page.evaluate(() => window.__PL_ERROR__ || 0));

const directCallResult = await page.evaluate(async () => {
  const canvas = document.querySelector('#app canvas');
  try {
    const r = canvas.requestPointerLock();
    if (r && r.then) {
      await r;
      return 'promise resolved';
    }
    return 'no promise returned (older API)';
  } catch (e) {
    return 'threw: ' + e.message;
  }
});
console.log('direct requestPointerLock() result:', directCallResult);
await page.waitForTimeout(300);
console.log('pointerLockElement after direct call:', await page.evaluate(() => document.pointerLockElement?.tagName ?? null));

const lockState = await page.evaluate(() => document.pointerLockElement ? document.pointerLockElement.tagName : null);
console.log('pointerLockElement after click:', lockState);

// Simulate mouse movement (Playwright's mouse.move dispatches real mousemove events with movementX/Y
// only if pointer is actually locked in the browser; CDP mouse.move sets absolute position which may
// not generate movementX/Y the way a locked pointer does - test to see what actually happens).
await page.mouse.move(640, 360);
await page.mouse.move(800, 300, { steps: 10 });
await page.waitForTimeout(300);

const after = await page.evaluate(() => {
  const scene = window.__DEBUG__.engine.getCurrentScene();
  return { yaw: scene.player.yaw, pitch: scene.player.pitch };
});
console.log('after mouse move:', JSON.stringify(after));

await browser.close();
