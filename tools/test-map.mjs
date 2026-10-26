import { chromium } from 'playwright';

const baseUrl = process.argv[2] || 'http://localhost:5180';
const outDir = process.argv[3] || '.';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('console', (msg) => { if (msg.type() === 'error') errors.push('CONSOLE ' + msg.text()); });
await page.goto(baseUrl + '?newGame=1&skipIntro=1&unlockKethra=1', { waitUntil: 'load' });
await page.waitForFunction(() => window.__DEBUG__?.engine.getCurrentScene()?.kind === 'ShipInteriorScene' && !window.__DEBUG__.flow.isTransitioning(), null, { timeout: 120000 });
await page.waitForTimeout(500);

// Open solar system map.
await page.evaluate(() => window.__DEBUG__.bus.emit('ui:open_galaxy_map'));
await page.waitForTimeout(600);
await page.screenshot({ path: `${outDir}/solar_map.png` });
console.log('Solar map panel visible:', await page.evaluate(() => !!document.querySelector('.panel-overlay.visible')));

// Click directly on Kethra by hit-testing the controller's own recorded targets (ground truth,
// avoids re-deriving the canvas math independently and getting a slightly-off click point).
const clickInfo = await page.evaluate(() => {
  const canvas = document.querySelector('.map-canvas');
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio;
  // Kethra is the first (and only unlocked) hit target on the solar view.
  const target = window.__DEBUG__.mapController['hitTargets'][0];
  return { left: rect.left + target.x / dpr, top: rect.top + target.y / dpr };
});
console.log('Kethra click point (page coords):', clickInfo.left, clickInfo.top);

const hitTargetsDebug = await page.evaluate(() => window.__DEBUG__.mapController['hitTargets'].length);
console.log('hitTargets count at click time:', hitTargetsDebug);

// A click selects the world (its dossier in the sidebar); the dossier's Surface chart button opens it.
await page.mouse.click(clickInfo.left, clickInfo.top);
await page.waitForTimeout(300);
console.log('Selected world:', await page.evaluate(() => document.querySelector('.map-dossier-name')?.textContent ?? null));
await page.getByRole('button', { name: 'Surface chart' }).click();
await page.waitForTimeout(700);
await page.screenshot({ path: `${outDir}/planet_map.png` });
const title = await page.evaluate(() => document.querySelector('.map-title')?.textContent);
console.log('Panel title after click:', title);

// Test ESC returns to solar map.
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
const titleAfterEsc = await page.evaluate(() => document.querySelector('.map-title')?.textContent);
console.log('Title after ESC (should be solar chart):', titleAfterEsc);

// Test ESC again fully closes.
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
console.log('Panel visible after 2nd ESC (should be false):', await page.evaluate(() => !!document.querySelector('.panel-overlay.visible')));

console.log('Errors:', errors.length ? errors.join('\\n') : 'none');
await browser.close();
