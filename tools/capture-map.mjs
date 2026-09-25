// Screenshots the galaxy map's two views (solar chart, Kethra surface chart) for UI review.
//
//   npx vite preview   (in another terminal)
//   node tools/capture-map.mjs [baseUrl] [outDir] [--size=1920x1080]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [BASE = 'http://localhost:4173/kethra-adventure/', OUT = 'renders/map'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const [w, h] = (process.argv.find((a) => a.startsWith('--size='))?.split('=')[1] ?? '1920x1080').split('x').map(Number);
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
const page = await browser.newPage({ viewport: { width: w, height: h } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${BASE}?skipIntro=1&newGame=1&unlockKethra=1&tier=low`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__DEBUG__?.engine.getCurrentScene()?.kind === 'ShipInteriorScene', undefined, { timeout: 240000, polling: 500 });
await page.waitForTimeout(1500);
await page.evaluate(() => window.__DEBUG__.bus.emit('ui:open_galaxy_map'));
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/solar-${w}x${h}.png` });
// Hover Kethra for the hover state.
const kethra = await page.evaluate(() => {
  const m = window.__DEBUG__.mapController;
  const t = m.hitTargets.find((x) => x.id === 'kethra');
  const r = m.canvas.getBoundingClientRect();
  return t ? { x: r.left + t.x / devicePixelRatio, y: r.top + t.y / devicePixelRatio } : null;
});
if (kethra) {
  await page.mouse.move(kethra.x, kethra.y);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/solar-hover-${w}x${h}.png` });
}
await page.evaluate(() => window.__DEBUG__.mapController.openPlanet('kethra'));
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/kethra-${w}x${h}.png` });
console.log('captured', OUT, errors.length ? errors : 'no errors');
await browser.close();
