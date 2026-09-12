import { chromium } from 'playwright';
const baseUrl = process.argv[2] || 'http://localhost:5180';
const outPath = process.argv[3] || 'reveal_hero.png';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(baseUrl + '?skipIntro=1&tier=high', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__DEBUG__?.gameState, { timeout: 10000 });
await page.waitForTimeout(400);
await page.evaluate(() => window.__DEBUG__.flow['transitionToGalaxyReveal']?.());
// transitionToGalaxyReveal() is async (fade-to-black, then scene init -- which now does real
// GLTF loading for the kitbashed ship hull -- then fade-from-black), so by the time the evaluate()
// promise above resolves, the cinematic's own internal clock has already been running for however
// long that load took. A fixed wait from here landed reliably back when ship construction was
// synchronous; now it can drift past the ~8.2s sensor-ping beat under slow/cold-start conditions,
// screenshotting the wrong keyframe entirely. Wait for the ship to exist (init() done), then a
// short fixed settle from THAT point instead, so the shot is always the intended early close-up.
await page.waitForFunction(
  () => {
    const s = window.__DEBUG__.engine.getCurrentScene();
    return !!s?.ship;
  },
  undefined,
  { timeout: 30000 },
);
await page.waitForTimeout(1500);
await page.screenshot({ path: outPath });
await browser.close();
console.log('saved', outPath);
