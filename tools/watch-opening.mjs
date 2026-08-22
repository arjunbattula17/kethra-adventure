import { chromium } from 'playwright';
import fs from 'node:fs';

const url = process.argv[2] || 'http://localhost:5180';
const outDir = process.argv[3] || '.';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});
await page.goto(url, { waitUntil: 'load' });

fs.mkdirSync(outDir, { recursive: true });

// Opening captions ~ 0-9s, battle puzzle starts ~9s.
const checkpoints = [
  { t: 3000, name: '01_intro_caption1' },
  { t: 5200, name: '02_intro_caption2' },
  { t: 7600, name: '03_intro_caption3' },
  { t: 10500, name: '04_battle_telegraph' },
];

let elapsed = 0;
for (const cp of checkpoints) {
  const delta = cp.t - elapsed;
  if (delta > 0) await page.waitForTimeout(delta);
  elapsed = cp.t;
  await page.screenshot({ path: `${outDir}/${cp.name}.png` });
  console.log('captured', cp.name);
}

if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
else console.log('No console errors through opening sequence.');

await browser.close();
