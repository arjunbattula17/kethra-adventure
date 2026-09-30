// Reproduces the trip to Vessek on a fresh profile and reports how it ends: arrival, a crash (page or
// browser), or a stall, with the last milestones, heap and GPU-resource counts seen before it.
//
//   node tools/repro-vessek.mjs [baseUrl] [--cold-gpu] [--via-kethra]
import { chromium } from 'playwright';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pageProbe, CHROME_ARGS } from './lib/probe.mjs';

const args = process.argv.slice(2);
const [BASE = 'http://localhost:4190/kethra-adventure/'] = args.filter((a) => !a.startsWith('--'));
const dir = mkdtempSync(join(tmpdir(), 'kethra-repro-'));
const context = await chromium.launchPersistentContext(dir, { channel: 'chrome', headless: false, viewport: { width: 1366, height: 768 }, args: CHROME_ARGS });
const page = await context.newPage();
const log = (m) => console.log(`${new Date().toISOString().slice(11, 19)}  ${m}`);
let crashed = false;
page.on('crash', () => {
  crashed = true;
  log('!! PAGE CRASHED');
});
context.on('close', () => log('!! context closed'));
page.on('pageerror', (e) => log(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') log(`console.${m.type()}: ${m.text().slice(0, 300)}`);
});
await page.addInitScript(pageProbe, [args.includes('--cold-gpu') ? Math.floor(Math.random() * 1e6) : 0]);
const snapshot = () =>
  page.evaluate(() => {
    const d = window.__DEBUG__;
    const m = d?.engine.renderer.info.memory;
    return {
      scene: d?.engine.getCurrentScene()?.kind,
      state: d?.flow.state + (d?.flow.isTransitioning() ? '*' : ''),
      heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(0) : null,
      textures: m?.textures,
      geometries: m?.geometries,
      programs: d?.engine.renderer.info.programs?.length,
      last: window.__prof.events.slice(-4).map(([n, t]) => `${Math.round(t)} ${n}`).join(' | '),
    };
  });
const watch = setInterval(async () => {
  if (crashed) return;
  const s = await snapshot().catch(() => null);
  if (s) log(`${s.state} ${s.scene} heap ${s.heapMB} MB tex ${s.textures} geo ${s.geometries} progs ${s.programs} | ${s.last}`);
}, 3000);

const query = args.includes('--via-kethra') ? '?newGame=1&unlockKethra=1&skipIntro=1' : '?newGame=1&unlockVessek=1&skipIntro=1';
await page.goto(`${BASE}${query}`);
await page.waitForFunction(() => window.__DEBUG__?.flow.state === 'wren' && !window.__DEBUG__.flow.isTransitioning(), null, { timeout: 300000, polling: 250 });
if (args.includes('--via-kethra')) {
  await page.evaluate(() => window.__DEBUG__.gameState.setFlag('canopy_flown'));
  await page.evaluate(() => window.__DEBUG__.bus.emit('galaxy:travel_to', 'kethra'));
  await page.waitForSelector('.first-light-hint', { timeout: 120000 });
  await page.keyboard.down('Space');
  await page.waitForFunction(() => window.__DEBUG__.engine.getCurrentScene()?.power?.stage === 'full', null, { timeout: 60000, polling: 100 });
  await page.keyboard.up('Space');
  await page.waitForFunction(() => window.__DEBUG__.engine.getCurrentScene()?.kind === 'KethraScene' && !window.__DEBUG__.flow.isTransitioning(), null, { timeout: 300000, polling: 250 });
  log('on Kethra; departing');
  await page.evaluate(() => window.__DEBUG__.engine.getCurrentScene().onDepart?.());
  await page.waitForFunction(() => window.__DEBUG__.engine.getCurrentScene()?.kind === 'ShipInteriorScene' && !window.__DEBUG__.flow.isTransitioning(), null, { timeout: 300000, polling: 250 });
  await page.evaluate(() => {
    const g = window.__DEBUG__.gameState;
    if (!g.data.planetsUnlocked.includes('vessek')) g.data.planetsUnlocked.push('vessek');
  });
} else {
  await page.evaluate(() => window.__DEBUG__.gameState.setFlag('first_light'));
}
log('travel to Vessek');
await page.evaluate(() => window.__DEBUG__.bus.emit('galaxy:travel_to', 'vessek'));
const arrived = await page
  .waitForFunction(() => window.__DEBUG__.engine.getCurrentScene()?.kind === 'VessekScene' && !window.__DEBUG__.flow.isTransitioning(), null, { timeout: 400000, polling: 250 })
  .then(() => true, (e) => (log(`wait ended: ${e.message.split('\n')[0]}`), false));
log(arrived ? 'ARRIVED at Vessek' : crashed ? 'CRASHED before arriving' : 'did not arrive');
if (arrived) log(JSON.stringify(await snapshot()));
clearInterval(watch);
await context.close().catch(() => {});
rmSync(dir, { recursive: true, force: true });
