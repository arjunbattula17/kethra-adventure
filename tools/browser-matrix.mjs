// The browser matrix: the same boot-and-travel run in Chromium, Edge, Firefox and WebKit (the
// engine Safari uses). Title -> New game -> intro -> ship -> Kethra -> ship -> Vessek, recording
// console errors and what each engine reports as its GPU. Results go to docs/perf/browser-matrix.json.
//
//   npx vite preview   (in another terminal)
//   node tools/browser-matrix.mjs [baseUrl]
import { chromium, firefox, webkit } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:4173/kethra-adventure/';
const ENGINES = [
  ['chromium', () => chromium.launch({ args: ['--use-gl=angle', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] })],
  ['edge', () => chromium.launch({ channel: 'msedge', args: ['--use-gl=angle', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] })],
  ['firefox', () => firefox.launch({ firefoxUserPrefs: { 'webgl.force-enabled': true } })],
  ['webkit', () => webkit.launch()],
];
const only = process.argv[3];
const results = [];
async function brightness(page) {
  const png = (await page.screenshot()).toString('base64');
  return page.evaluate(async (d) => {
    const i = new Image(); i.src = 'data:image/png;base64,' + d; await i.decode();
    const c = document.createElement('canvas'); c.width = 32; c.height = 18;
    const x = c.getContext('2d'); x.drawImage(i, 0, 0, 32, 18);
    const p = x.getImageData(0, 0, 32, 18).data; let s = 0;
    for (let k = 0; k < p.length; k += 4) s += p[k] + p[k + 1] + p[k + 2];
    return +(s / (p.length / 4) / 3).toFixed(1);
  }, png);
}
for (const [name, launch] of ENGINES) {
  if (only && name !== only) continue;
  const row = { browser: name, steps: {}, errors: [] };
  let browser;
  try {
    browser = await launch();
    row.version = browser.version();
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    page.on('pageerror', (e) => row.errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') row.errors.push(m.text()); });
    const t0 = Date.now();
    const scene = (k) => page.waitForFunction((k) => window.__DEBUG__?.engine.getCurrentScene()?.kind === k, k, { timeout: 900000, polling: 500 });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    const noWebgl = await page.waitForSelector('.title-btn, .no-webgl', { timeout: 120000 }).then((el) => el.evaluate((e) => e.classList.contains('no-webgl')));
    row.steps.title = Date.now() - t0;
    if (noWebgl) {
      row.steps.result = 'no WebGL 2: showed the explanation screen';
    } else {
      row.gpu = await page.evaluate(() => {
        const gl = document.createElement('canvas').getContext('webgl2');
        const ext = gl?.getExtension('WEBGL_debug_renderer_info');
        return gl ? String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : null;
      });
      await page.getByRole('button', { name: 'New game' }).click();
      await scene('IntroScene');
      await page.waitForFunction(() => !document.querySelector('.loading-indicator.visible'), undefined, { timeout: 900000, polling: 500 });
      row.steps.intro = Date.now() - t0;
      await page.waitForTimeout(2000);
      await page.keyboard.press('Space');
      await scene('ShipInteriorScene');
      // Finish the opening the way a returning player's skip does, so the tutorial's cards and
      // cold-open captions aren't left over the levels this run visits.
      await page.waitForTimeout(3000);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1500);
      row.steps.ship = Date.now() - t0;
      await page.evaluate(() => {
        const g = window.__DEBUG__.gameState;
        for (const f of ['tutorial_battle_complete', 'galaxy_revealed', 'logs_available', 'damage_assessed', 'kethra_mechanism_solved']) g.setFlag(f);
        for (const p of ['kethra', 'vessek']) if (!g.data.planetsUnlocked.includes(p)) g.data.planetsUnlocked.push(p);
      });
      for (const [level, kind] of [['kethra', 'KethraScene'], ['vessek', 'VessekScene']]) {
        await page.evaluate((l) => window.__DEBUG__.flow.travelToPlanet(l), level);
        await scene(kind);
        await page.waitForTimeout(2500);
        row.steps[level] = Date.now() - t0;
        mkdirSync('docs/perf/browsers', { recursive: true });
        await page.screenshot({ path: `docs/perf/browsers/${name}-${level}.png` });
        // A level that draws nothing but the UI would still "reach" the scene; the brightness of the
        // frame is what shows the 3D view actually rendered.
        row[`${level}Brightness`] = await brightness(page);
        if (row[`${level}Brightness`] < 20) row.errors.push(`${level}: 3D view looks black (brightness ${row[`${level}Brightness`]})`);
        await page.evaluate(() => window.__DEBUG__?.engine.getCurrentScene().onDepart?.());
        await scene('ShipInteriorScene');
      }
      row.steps.result = 'reached every level';
    }
  } catch (e) {
    row.steps.result = `stopped: ${e.message.split('\n')[0]}`;
  }
  await browser?.close().catch(() => {});
  row.errors = [...new Set(row.errors)].slice(0, 8);
  results.push(row);
  console.log(`${name.padEnd(9)} ${row.version ?? ''}  ${row.steps.result}  errors: ${row.errors.length}  kethra ${row.kethraBrightness ?? '-'} vessek ${row.vessekBrightness ?? '-'}  gpu: ${row.gpu ?? '-'}`);
  if (row.errors.length) console.log('   ' + row.errors.join('\n   '));
}
mkdirSync('docs/perf', { recursive: true });
writeFileSync('docs/perf/browser-matrix.json', JSON.stringify(results, null, 2));
