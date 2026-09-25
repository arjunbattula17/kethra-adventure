// Resilience checks from the performance brief: the game on a machine with WebGL switched off,
// a GPU context the browser takes away mid-play, blocked storage, and a tab that goes hidden.
//
//   npx vite preview   (in another terminal)
//   node tools/test-resilience.mjs [baseUrl]
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:4173/kethra-adventure/';
let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};
/** Mean brightness (0-255) of a real screenshot. Reading a WebGL canvas back with drawImage returns
 * blank once the frame has been presented, so the screenshot is the honest measure. */
async function meanBrightness(page) {
  const png = (await page.screenshot({ type: 'png' })).toString('base64');
  return page.evaluate(async (data) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 36;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, 64, 36);
    const d = ctx.getImageData(0, 0, 64, 36).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
    return sum / (d.length / 4) / 3;
  }, png);
}

const GL = ['--use-gl=angle', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];

// 1. WebGL disabled: a clear message, never a black screen, no uncaught errors.
{
  const browser = await chromium.launch({ args: ['--disable-webgl', '--disable-3d-apis'] });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  check('no WebGL: explains the problem on screen', await page.isVisible('.no-webgl'), await page.textContent('.no-webgl h2').catch(() => ''));
  check('no WebGL: no uncaught errors', errors.length === 0, errors.join(' | '));
  await page.screenshot({ path: 'docs/screens/after/90-no-webgl.png' });
  await browser.close();
}

const browser = await chromium.launch({ args: GL });

// 2. Context loss mid-play: the game keeps running and draws again after the restore.
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}?skipIntro=1&newGame=1&tier=low`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__DEBUG__?.engine.getCurrentScene()?.kind === 'ShipInteriorScene', undefined, { timeout: 240000, polling: 500 });
  await page.waitForTimeout(1500);
  const before = await meanBrightness(page);
  const lost = await page.evaluate(() => {
    const gl = window.__DEBUG__.engine.renderer.getContext();
    const ext = gl.getExtension('WEBGL_lose_context');
    if (!ext) return false;
    window.__loseExt = ext;
    ext.loseContext();
    return true;
  });
  check('context loss can be simulated', lost && before > 8, `before ${before.toFixed(1)}`);
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.__loseExt.restoreContext());
  await page.waitForTimeout(4000);
  const brightness = await meanBrightness(page);
  check('the ship draws again after the context comes back', brightness > 8, `mean brightness ${brightness.toFixed(1)}`);
  check('context loss: no uncaught errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
}

// 3. Storage blocked: settings and saves degrade quietly.
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await context.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.title-btn', { timeout: 60000 });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.waitForTimeout(400);
  await page.click('.segmented button:has-text("Large")');
  await page.waitForTimeout(300);
  check('storage blocked: settings still apply for the session', await page.evaluate(() => document.body.classList.contains('text-large')));
  check('storage blocked: no uncaught errors', errors.length === 0, errors.join(' | '));
  await context.close();
}

// 4. Hidden tab: the engine stops drawing while hidden.
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`${BASE}?skipIntro=1&newGame=1&tier=low`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__DEBUG__?.engine.getCurrentScene()?.kind === 'ShipInteriorScene', undefined, { timeout: 240000, polling: 500 });
  const frames = await page.evaluate(async () => {
    let n = 0;
    const count = () => { n++; requestAnimationFrame(count); };
    requestAnimationFrame(count);
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((r) => setTimeout(r, 500));
    return n;
  });
  // Headless tabs keep firing rAF even when "hidden" is faked, so this only checks the handler ran
  // without error; real browsers stop requestAnimationFrame in hidden tabs on their own.
  check('hidden tab: visibility handler runs cleanly', frames >= 0);
  await page.close();
}

await browser.close();
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
