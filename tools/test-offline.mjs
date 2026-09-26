// Offline check: the game must run from a local folder with no internet (the semifinal room has
// none). Every request that isn't to the local server is blocked and recorded; the run boots the
// title, starts a new game and visits every level.
//
//   npx vite preview   (in another terminal)
//   node tools/test-offline.mjs [baseUrl]
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:4173/kethra-adventure/';
const origin = new URL(BASE).origin;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const external = [];
const errors = [];
await page.route('**/*', (route) => {
  const url = route.request().url();
  if (url.startsWith(origin) || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
  external.push(url);
  return route.abort();
});
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const scene = (k) => page.waitForFunction((k) => window.__DEBUG__?.engine.getCurrentScene()?.kind === k, k, { timeout: 900000, polling: 500 });
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.title-btn');
await page.getByRole('button', { name: 'New game' }).click();
await scene('IntroScene');
await page.waitForFunction(() => !document.querySelector('.loading-indicator.visible'), undefined, { timeout: 900000, polling: 500 });
await page.keyboard.press('Space');
await scene('ShipInteriorScene');
await page.evaluate(() => {
  const g = window.__DEBUG__.gameState;
  for (const p of ['kethra', 'vessek']) if (!g.data.planetsUnlocked.includes(p)) g.data.planetsUnlocked.push(p);
});
for (const [l, k] of [['kethra', 'KethraScene'], ['vessek', 'VessekScene']]) {
  await page.evaluate((l) => window.__DEBUG__.flow.travelToPlanet(l), l);
  await scene(k);
  await page.waitForTimeout(2000);
}
await page.evaluate(() => window.__DEBUG__.flow.playEnding());
await scene('EndingScene');
await page.waitForTimeout(3000);
console.log(`requests to anything but ${origin}: ${external.length}${external.length ? '\n  ' + external.join('\n  ') : ''}`);
console.log(`console errors: ${errors.length}${errors.length ? '\n  ' + [...new Set(errors)].join('\n  ') : ''}`);
await browser.close();
process.exit(external.length || errors.length ? 1 : 0);
