// Art-direction viewfinder: boots a scene at the high tier on the real GPU and takes screenshots
// from named camera positions, for checking a visual change against STYLE_BIBLE.md.
//
//   npx vite            (dev server, or pass the preview URL)
//   node tools/look.mjs <scene> <outDir> [baseUrl]
//   scene: kethra | vessek | ship
//
// Shots are [name, x, y, z, yaw, pitch]; teleport sets feet position, the camera sits at eye height.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [SCENE = 'kethra', OUT = 'renders/look', BASE = 'http://localhost:5173/kethra-adventure/'] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });

const SHOTS = {
  kethra: [
    ['arrival', 0, 0.4, 18, 0, 0],
    ['aiveth-pair', 0, 0.4, 9.5, 0, -0.05],
    ['warden-close', -2.2, 0.4, 5.6, 0.3, 0.05],
    ['fen-close', 2.2, 0.4, 6.6, -0.35, 0.05],
    ['wickmoth', 0, 1.5, -5.5, 0, 0.12],
    ['heart', 0, 1.5, -12.5, 0, 0.08],
    ['plaza-wide', -6, 0.4, 12, -0.45, -0.02],
  ],
  vessek: [
    ['arrival', 2, 0, 9.4, 0, 0],
    ['concourse', 0, 0, 5, 0.2, -0.05],
    ['varro', -1.6, 0, 0.8, 0.5, -0.08],
    ['dace', -3.2, 0, 5.6, 1.4, -0.08],
    ['breakers', 3.6, 0, -6.4, 0, 0.05],
    ['hydroponics', -2.2, 0, -4.6, 0.7, -0.15],
    ['windows', 3, 0, 1, -1.57, 0.02],
  ],
  ship: [['spawn', 0, 0, 4, 0, 0]],
};

const browser = await chromium.launch({
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const flags = SCENE === 'vessek' ? '&unlockVessek=1' : '';
await page.goto(`${BASE}?skipIntro=1&unlockKethra=1&newGame=1&tier=high${flags}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__DEBUG__?.engine.getCurrentScene()?.kind === 'ShipInteriorScene', undefined, { timeout: 240000, polling: 500 });
const kind = { kethra: 'KethraScene', vessek: 'VessekScene', ship: 'ShipInteriorScene' }[SCENE];
if (SCENE !== 'ship') {
  await page.evaluate((s) => window.__DEBUG__.flow.travelToPlanet(s), SCENE);
  await page.waitForFunction((k) => window.__DEBUG__?.engine.getCurrentScene()?.kind === k, kind, { timeout: 240000, polling: 500 });
}
await page.waitForTimeout(4000);
await page.evaluate(() => document.getElementById('ui-root')?.style.setProperty('visibility', 'hidden'));
for (const [name, x, y, z, yaw, pitch] of SHOTS[SCENE]) {
  await page.evaluate(({ x, y, z, yaw, pitch }) => {
    const s = window.__DEBUG__.engine.getCurrentScene();
    s.player.teleport(new s.player.rig.position.constructor(x, y, z), yaw);
    s.player.pitch = pitch;
  }, { x, y, z, yaw, pitch });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}
console.log('captured', OUT, errors.length ? errors : 'no errors');
await browser.close();
