// Captures the galaxy reveal cinematic at several beats, at a chosen deviceScaleFactor.
// Usage: node capture-reveal-beats.mjs [baseUrl] [outDir] [dsf]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const baseUrl = process.argv[2] || 'http://localhost:5180/kethra-adventure/';
const outDir = process.argv[3] || '.';
const dsf = Number(process.argv[4] || '1');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  args: [
    '--use-gl=angle',
    '--enable-unsafe-swiftshader',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: dsf });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(baseUrl + '?skipIntro=1&tier=high', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__DEBUG__?.gameState, undefined, { timeout: 30000 });
// __DEBUG__ is exposed before flow.start()'s own boot setScene resolves (which can run tens of
// seconds under software rendering). Transitioning while that call is still in flight lets the
// boot scene land AFTER the reveal and silently clobber it — wait for boot to actually finish.
await page.waitForFunction(() => !!window.__DEBUG__.engine.getCurrentScene(), undefined, { timeout: 120000 });
await page.waitForTimeout(500);
await page.evaluate(() => window.__DEBUG__.flow['transitionToGalaxyReveal']?.());
await page.waitForFunction(
  () => !!window.__DEBUG__.engine.getCurrentScene()?.ship,
  undefined,
  { timeout: 60000 },
);
const info = await page.evaluate(() => ({
  tier: window.__DEBUG__.engine.getQualityTier(),
  dpr: window.devicePixelRatio,
  pixelRatio: window.__DEBUG__.engine.renderer.getPixelRatio(),
}));
console.log('info', JSON.stringify(info));

// Poll the scene's own reveal clock so beats land on cinematic time, not wall clock.
const beats = [
  { name: 'beat1-closeup', at: 1.6 },
  { name: 'beat2-pullback', at: 6.0 },
  { name: 'beat3-wide', at: 11.5 },
  { name: 'beat4-hold', at: 14.5 },
];
for (const b of beats) {
  await page.waitForFunction(
    (at) => (window.__DEBUG__.engine.getCurrentScene()?.revealElapsed ?? 0) >= at,
    b.at,
    { timeout: 120000, polling: 100 },
  );
  await page.screenshot({ path: join(outDir, `${b.name}-dsf${dsf}.png`) });
  console.log('saved', b.name);
}
await browser.close();
