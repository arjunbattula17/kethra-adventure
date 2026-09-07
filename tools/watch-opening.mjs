// Frame-by-frame look at the opening, for eyeballing the cold open and the first tutorial card.
// Captures on state changes rather than a fixed timetable: the cold open is frame-driven and the
// scene boots an order of magnitude slower under this harness's software renderer than it does on
// real hardware, so wall-clock checkpoints would land in the wrong places.
// Usage: node tools/watch-opening.mjs [baseUrl] [outDir]
import { chromium } from 'playwright';
import fs from 'node:fs';

const url = process.argv[2] || 'http://localhost:5180';
const outDir = process.argv[3] || 'renders/opening';
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});
await page.goto(url + '/?newGame=1', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__DEBUG__?.gameState, { timeout: 60000 });

const state = () =>
  page.evaluate(() => ({
    caption: document.querySelector('#cinematic-caption.visible')?.textContent ?? '',
    card: document.querySelector('.tut-card.visible .tut-title')?.textContent ?? '',
  }));

let shots = 0;
let last = { caption: '', card: '' };
const deadline = Date.now() + 180000;
while (Date.now() < deadline) {
  const now = await state();
  if (now.caption !== last.caption || now.card !== last.card) {
    last = now;
    const label = now.card || now.caption;
    if (label) {
      shots++;
      const name = `${String(shots).padStart(2, '0')}_${label.slice(0, 28).replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`;
      await page.screenshot({ path: `${outDir}/${name}.png` });
      console.log('captured', name);
    }
  }
  if (now.card) break; // the first instruction card is the end of the opening
  await page.waitForTimeout(200);
}

if (!last.card) console.log('WARNING: opening never reached a tutorial card.');
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
else console.log('No console errors through the opening sequence.');

await browser.close();
