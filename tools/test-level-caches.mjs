// Returning to a level after the Wren emptied the level caches (core/levelCaches.ts) must look the
// same as the first visit: Kethra, back aboard, Kethra again; then Vessek (which shares the nature
// kit), back aboard, Vessek again. Screenshots from one fixed view each visit, compared, plus any
// WebGL or console errors.
//
//   node tools/test-level-caches.mjs [baseUrl] [--tier=low]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const BASE = args.find((a) => !a.startsWith('--')) ?? 'http://127.0.0.1:4193/kethra-adventure/';
const TIER = args.find((a) => a.startsWith('--tier='))?.split('=')[1] ?? 'low';
const OUT = 'docs/perf/level-caches-test';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error' || /WebGL|GL_INVALID|closed|no image data/i.test(t)) problems.push(`${m.type()}: ${t.slice(0, 200)}`);
});
const settled = (kind) => page.waitForFunction((k) => window.__DEBUG__?.engine.getCurrentScene()?.kind === k && !window.__DEBUG__.flow.isTransitioning() && !document.querySelector('.loading-indicator.visible'), kind, { timeout: 300000, polling: 250 });
const VIEWS = { kethra: [0, 0.4, 9.5, 0, -0.05], vessek: [2, 0, 9.4, 0, 0] };
async function shoot(name, level) {
  await page.waitForTimeout(5000);
  await page.evaluate(([x, y, z, yaw, pitch]) => {
    const s = window.__DEBUG__.engine.getCurrentScene();
    s.player.teleport(new s.player.rig.position.constructor(x, y, z), yaw);
    s.player.pitch = pitch;
    document.getElementById('ui-root').style.visibility = 'hidden';
  }, VIEWS[level]);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  await page.evaluate(() => (document.getElementById('ui-root').style.visibility = ''));
}
const visit = async (level, kind, name) => {
  await page.evaluate((l) => window.__DEBUG__.flow.debugGo(l), level);
  await settled(kind);
  await shoot(name, level);
  await page.evaluate(() => window.__DEBUG__.engine.getCurrentScene().onDepart?.());
  await settled('ShipInteriorScene');
  await page.waitForTimeout(1500);
};

await page.goto(`${BASE}?newGame=1&skipIntro=1&unlockVessek=1&tier=${TIER}&seed=7`, { waitUntil: 'domcontentloaded' });
await settled('ShipInteriorScene');
await visit('kethra', 'KethraScene', 'kethra-1');
await visit('kethra', 'KethraScene', 'kethra-2');
await visit('vessek', 'VessekScene', 'vessek-1');
await visit('vessek', 'VessekScene', 'vessek-2');
const released = await page.evaluate(() => performance.getEntriesByName('engine:releaseLevelCaches').length);
await browser.close();
console.log(`level-cache releases: ${released}`);
console.log(problems.length ? `problems:\n  ${[...new Set(problems)].slice(0, 15).join('\n  ')}` : 'no WebGL or console errors');
