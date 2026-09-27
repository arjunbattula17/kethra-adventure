// Regression test: ending a conversation with Esc must run the same close callback as picking its
// last option. It didn't: Esc on Varro's closing line skipped the callback that starts the
// Anchorage pulse, and level 3 could never continue (docs/AUDIT.md, Part A, gameplay 6).
//
//   npm run build && npx vite preview   (in another terminal)
//   node tools/test-dialogue-esc.mjs [baseUrl]
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:4173/kethra-adventure/';
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};
const waitScene = (k) => page.waitForFunction((k) => window.__DEBUG__?.engine.getCurrentScene()?.kind === k, k, { timeout: 240000, polling: 500 });
const hasFlag = (f) => page.evaluate((f) => window.__DEBUG__.gameState.data.flags.includes(f), f);
async function teleport(x, y, z, yaw = 0) {
  await page.evaluate(({ x, y, z, yaw }) => {
    const s = window.__DEBUG__.engine.getCurrentScene();
    s.player.teleport(new s.player.rig.position.constructor(x, y, z), yaw);
  }, { x, y, z, yaw });
  await page.waitForTimeout(500);
}
async function press(code) {
  await page.keyboard.down(code);
  await page.waitForTimeout(120);
  await page.keyboard.up(code);
  await page.waitForTimeout(450);
}

await page.goto(`${BASE}?skipIntro=1&unlockVessek=1&newGame=1&tier=low`, { waitUntil: 'domcontentloaded' });
await waitScene('ShipInteriorScene');
await page.evaluate(() => window.__DEBUG__.bus.emit('galaxy:travel_to', 'vessek'));
await waitScene('VessekScene');
await page.waitForTimeout(3000);

await teleport(-2.6, 0.2, 0.2, 0);
await press('KeyE');
await press('Digit2'); // What do you want for conduit alloy?
await press('Digit1'); // The core is my only way home
check('Varro reached the closing line', await hasFlag('vessek_varro_met'));
await press('Escape'); // dismiss the last line with Esc instead of its option
check('the dialogue closed', !(await page.$('#dialogue-panel')));
const pulsed = await page.waitForFunction(() => window.__DEBUG__.gameState.data.flags.includes('vessek_pulse'), null, { timeout: 12000 }).then(() => true, () => false);
check('Esc on the closing line still starts the pulse', pulsed);
check('no page or console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall passed');
process.exit(failed ? 1 : 0);
