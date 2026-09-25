// Smoke test: boots every playable scene and fails on any page error or console error.
// Fast enough to run before every commit; the full playthrough check is tools/test-tutorial-flow.mjs.
//
//   npm run build && npx vite preview   (in another terminal)
//   npm run smoke            (or: node tools/smoke.mjs [baseUrl])
//
// Scenes: the opening cinematic, the ship interior, the galaxy reveal, Kethra. Plus one boot with
// browser storage blocked (some private modes and managed school Chromebooks), which used to leave
// a black screen: the game must boot and play without saving.
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:4173/kethra-adventure/';

const CASES = [
  { name: 'intro', query: '?newGame=1&tier=low', kind: 'IntroScene' },
  { name: 'ship', query: '?skipIntro=1&newGame=1&tier=low', kind: 'ShipInteriorScene' },
  { name: 'reveal', query: '?skipIntro=1&newGame=1&tier=low', kind: 'GalaxyRevealScene', go: (p) => p.evaluate(() => window.__DEBUG__.flow.transitionToGalaxyReveal()) },
  { name: 'kethra', query: '?skipIntro=1&unlockKethra=1&newGame=1&tier=low', kind: 'KethraScene', go: (p) => p.evaluate(() => window.__DEBUG__.flow.travelToPlanet('kethra')) },
  { name: 'storage-blocked', query: '?newGame=1&tier=low', kind: 'IntroScene', blockStorage: true },
];

const browser = await chromium.launch({
  // GL + anti-throttling flags: see docs/learnings.md (headless rAF throttling).
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
let failed = 0;
for (const c of CASES) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  if (c.blockStorage) {
    await context.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } });
    });
  }
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const t0 = Date.now();
  let ok = true;
  try {
    await page.goto(BASE + c.query, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => !!window.__DEBUG__?.engine.getCurrentScene(), undefined, { timeout: 180000, polling: 250 });
    if (c.go) {
      await page.waitForFunction(() => window.__DEBUG__.engine.getCurrentScene()?.kind === 'ShipInteriorScene', undefined, { timeout: 180000, polling: 250 });
      await c.go(page);
    }
    await page.waitForFunction(
      (kind) => { const s = window.__DEBUG__.engine.getCurrentScene(); return s?.kind === kind || (kind === 'GalaxyRevealScene' && !!s?.ship && !s.player); },
      c.kind,
      { timeout: 180000, polling: 250 },
    );
    await page.waitForTimeout(2000);
  } catch (e) {
    ok = false;
    errors.push(`did not reach ${c.kind}: ${e.message.split('\n')[0]}`);
  }
  if (errors.length) ok = false;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name.padEnd(16)} ${((Date.now() - t0) / 1000).toFixed(1)}s${errors.length ? '\n      ' + [...new Set(errors)].slice(0, 5).join('\n      ') : ''}`);
  await context.close();
}
await browser.close();
console.log(failed ? `\n${failed} of ${CASES.length} failed` : `\nall ${CASES.length} passed`);
process.exit(failed ? 1 : 0);
