// New game's black hole (src/galaxy/title/singularity), in installed Chrome on this machine's GPU.
//
//   npx vite --host 127.0.0.1 --port 4241 --strictPort     (in another terminal)
//   node tools/capture-newgame.mjs <label> [baseUrl] [--beats=0.5,1.2,2,3] [--size=1920x1080] [--tier=low] [--save]
//
// --beats: stills at those seconds of the event, its clock frozen for each shot (the scene's update is
//   handed a fixed step, then none), so every frame is the one the clock says. Without --beats it runs in
//   real time from the click through to the intro on screen, and reports the frame times of the event,
//   the black wait and any console errors, with stills of the last title frame and of the intro.
// --save: first plays into the Wren so a save exists; New game then reloads clean through the dark.
// --reduced: the browser asks for reduced motion (the event's gentle form).
// --gesture: click empty sky 3 s before New game (sound already on).
// --nolens (diagnosis): run without the lens pass.
// Writes renders/newgame/<label>/.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { CHROME_ARGS } from './lib/probe.mjs';

const args = process.argv.slice(2);
const opt = (name, d) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? d;
const [LABEL = 'run', BASE = 'http://127.0.0.1:4241/kethra-adventure/'] = args.filter((a) => !a.startsWith('--'));
const [W, H] = opt('size', '1920x1080').split('x').map(Number);
const tier = opt('tier', '');
const beats = opt('beats', '') ? opt('beats', '').split(',').map(Number) : null;
const OUT = `renders/newgame/${LABEL}`;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: !args.includes('--headed'), args: [...CHROME_ARGS, '--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ viewport: { width: W, height: H }, reducedMotion: args.includes('--reduced') ? 'reduce' : 'no-preference' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && !/texture format and sampler|GPU stall due to ReadPixels/.test(m.text()) && errors.push(`${m.type()}: ${m.text()}`));
const q = tier ? `?tier=${tier}` : '';

if (args.includes('--save')) {
  await page.goto(`${BASE}?newGame=1&skipIntro=1&unlockKethra=1${tier ? `&tier=${tier}` : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__DEBUG__?.flow?.state === 'wren', null, { timeout: 180000 });
  await page.waitForTimeout(1500);
  const saved = await page.evaluate(() => Object.keys(localStorage).filter((k) => /save/i.test(k)));
  console.log('save keys:', saved.join(', ') || 'none');
}

await page.goto(BASE + q, { waitUntil: 'load' });
await page.waitForSelector('.title-screen.backdrop-live', { timeout: 120000 });
// Let the ship arrive and settle.
await page.waitForTimeout(9000);

const newGame = page.locator('.title-btn').nth(1);

if (beats) {
  await page.evaluate(() => {
    const scene = window.__DEBUG__.engine.getCurrentScene();
    const update = scene.update.bind(scene);
    window.__fixed = null;
    scene.update = (dt, e) => update(window.__fixed ?? dt, e);
    window.__hole = scene.singularity;
  });
  await page.screenshot({ path: `${OUT}/beat-before.png` });
  await page.evaluate(() => (window.__fixed = 0));
  await newGame.click();
  for (const at of beats) {
    await page.evaluate(async (target) => {
      const h = window.__hole;
      window.__fixed = 1 / 60;
      while (h.t < target) await new Promise((r) => requestAnimationFrame(r));
      window.__fixed = 0;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }, at);
    await page.screenshot({ path: `${OUT}/beat-${at.toFixed(2)}.png` });
    process.stdout.write(`${at} `);
  }
  console.log();
} else {
  await page.evaluate(() => {
    const p = (window.__ng = { frames: [], marks: {} });
    let last = performance.now();
    const tick = (now) => {
      p.frames.push([now, now - last]);
      last = now;
      if (!p.marks.intro && window.__DEBUG__?.flow?.state === 'intro' && !document.body.classList.contains('from-void')) p.marks.intro = now;
      if (!p.marks.void && document.body.classList.contains('from-void')) p.marks.void = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    document.addEventListener('click', () => (p.marks.click ??= performance.now()), true);
  });
  // --gesture: a click on empty sky first (sound unlocks), as a player who looked around before choosing.
  if (args.includes('--gesture')) await page.mouse.click(W * 0.9, H * 0.5);
  await page.evaluate(() => (window.__ng.idle = window.__ng.frames.length));
  await page.waitForTimeout(3000);
  await page.evaluate(() => (window.__ng.idleEnd = window.__ng.frames.length));
  await page.evaluate(() => (window.__ng.marks.click = undefined));
  await newGame.click();
  if (args.includes('--nolens')) await page.evaluate(() => (window.__DEBUG__.engine.getCurrentScene().singularity.lens.enabled = false));
  const saveRun = args.includes('--save');
  if (saveRun) {
    // A loaded save: the event ends in a reload into the dark.
    await page.waitForURL(/newGame=1|kethra-adventure\/$/, { timeout: 30000 }).catch(() => {});
    await page.waitForFunction(() => window.__DEBUG__?.flow?.state === 'intro' && !document.body.classList.contains('from-void'), null, { timeout: 120000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/intro.png` });
    console.log('reload path reached the intro');
  } else {
    await page.waitForFunction(() => window.__ng.marks.intro, null, { timeout: 120000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/intro.png` });
    const r = await page.evaluate(() => window.__ng);
    const ev = r.frames.filter(([t]) => t > r.marks.click && t < r.marks.void);
    const dark = r.frames.filter(([t]) => t >= r.marks.void && t < r.marks.intro);
    const stat = (list) => {
      const ms = list.map((f) => f[1]).sort((a, b) => a - b);
      const pick = (k) => ms[Math.min(ms.length - 1, Math.floor(k * ms.length))]?.toFixed(1);
      return `${ms.length} frames, median ${pick(0.5)} ms, p95 ${pick(0.95)} ms, max ${ms[ms.length - 1]?.toFixed(0)} ms, >50 ms: ${ms.filter((x) => x > 50).length}, >100 ms: ${ms.filter((x) => x > 100).length}`;
    };
    const idle = r.frames.slice(r.idle, r.idleEnd);
    const summary = [
      `title before the click: ${stat(idle)}`,
      `click -> black ${((r.marks.void - r.marks.click) / 1000).toFixed(2)} s; black -> intro ${((r.marks.intro - r.marks.void) / 1000).toFixed(2)} s`,
      `event: ${stat(ev)}`,
      `dark: ${stat(dark)}`,
      `slow event frames at (s after click): ${ev.filter((f) => f[1] > 50).map((f) => `${((f[0] - r.marks.click) / 1000).toFixed(2)}:${f[1].toFixed(0)}`).join(' ')}`,
    ].join('\n');
    console.log(summary);
    writeFileSync(`${OUT}/summary.txt`, summary + '\n');
  }
}
await browser.close();
console.log(errors.length ? errors.join('\n') : 'no errors');
console.log(`wrote ${OUT}`);
