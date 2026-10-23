// The title as a player sees it, in installed Chrome on this machine's GPU: screenshots of the live
// title scene at chosen sizes and moments, with or without the menu, plus any console errors.
//
//   npx vite --host 127.0.0.1 --port 4231 --strictPort     (in another terminal)
//   node tools/capture-title.mjs <label> [baseUrl] [--sizes=1920x1080,1366x768] [--at=4,12] [--bare] [--menu]
//
// --at: seconds after the backdrop's first frame to shoot (several for a motion check).
// --bare: the menu hidden (the backdrop alone); --menu: with it (the default shoots both).
// Writes renders/title/<label>/<size>-<at>s[-bare].png.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { CHROME_ARGS } from './lib/probe.mjs';

const args = process.argv.slice(2);
const opt = (name, d) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? d;
const [LABEL = 'title', BASE = 'http://127.0.0.1:4231/kethra-adventure/'] = args.filter((a) => !a.startsWith('--'));
const sizes = opt('sizes', '1920x1080').split(',').map((s) => s.split('x').map(Number));
const moments = opt('at', '4').split(',').map(Number);
const bareOnly = args.includes('--bare');
const menuOnly = args.includes('--menu');
const clip = opt('clip', '') ? opt('clip', '').split(',').map(Number) : null;
const OUT = `renders/title/${LABEL}`;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: !args.includes('--headed'), args: CHROME_ARGS });
const errors = [];
for (const [w, h] of sizes) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && !/texture format and sampler/.test(m.text()) && errors.push(`${m.type()}: ${m.text()}`));
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('.title-screen.backdrop-live', { timeout: 120000 });
  const t0 = Date.now();
  for (const at of moments) {
    const wait = at * 1000 - (Date.now() - t0);
    if (wait > 0) await page.waitForTimeout(wait);
    const shots = bareOnly ? [true] : menuOnly ? [false] : [false, true];
    for (const bare of shots) {
      await page.evaluate((bare) => (document.querySelector('.title-screen').style.visibility = bare ? 'hidden' : ''), bare);
      await page.screenshot({ path: `${OUT}/${w}x${h}-${at}s${bare ? '-bare' : ''}.png` });
      if (clip && bare) await page.screenshot({ path: `${OUT}/${w}x${h}-${at}s-clip.png`, clip: { x: clip[0] * w, y: clip[1] * h, width: clip[2] * w, height: clip[3] * h } });
    }
    await page.evaluate(() => (document.querySelector('.title-screen').style.visibility = ''));
  }
  await page.close();
}
await browser.close();
console.log(errors.length ? errors.join('\n') : 'no errors');
console.log(`wrote ${OUT}`);
