// Screenshots of the whole journey on the real GPU, title to ending, for the art pass and the
// brief's verification matrix: the title, the intro, the Wren, the reveal and MG1, First light, the
// cruise, MG2's descent, Kethra and the Hush with its wake, the docking at Vessek, the Anchorage, the
// ending, and the in-game panels. Timed beats are shot with the game clock frozen through the debug
// harness, so a beat is the same frame on a fast or a slow run.
//
//   npm run build && npx vite preview --port 4180 --strictPort   (in another terminal)
//   node tools/capture-journey.mjs <outDir> [baseUrl] [--sizes=1920x1080,1280x720] [--tiers=low,high]
//                                  [--only=title,cruise] [--format=jpg|png]
//
// Files: <outDir>/<tier>-<w>x<h>/<section>-<shot>.<ext>
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { CHROME_ARGS } from './lib/probe.mjs';

const args = process.argv.slice(2);
const opt = (name, d) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? d;
const [OUT = 'renders/journey', BASE = 'http://localhost:4180/kethra-adventure/'] = args.filter((a) => !a.startsWith('--'));
const SIZES = opt('sizes', '1920x1080').split(',').map((s) => s.split('x').map(Number));
const TIERS = opt('tiers', 'low,high').split(',');
const ONLY = opt('only', '').split(',').filter(Boolean);
const FORMAT = opt('format', 'jpg');

const browser = await chromium.launch({ channel: 'chrome', args: CHROME_ARGS });
const errors = [];
let shots = 0;

/** One section on a fresh page: `run` gets helpers bound to that page. */
async function section(name, query, kind, w, h, tier, dir, run) {
  if (ONLY.length && !ONLY.includes(name)) return;
  const context = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(`${name}: ${m.text().slice(0, 200)}`));
  const sep = query.includes('?') ? '&' : '?';
  await page.goto(`${BASE}${query}${sep}debug=1&seed=7&tier=${tier}`, { waitUntil: 'domcontentloaded' });
  if (kind) await page.waitForFunction((k) => window.__DEBUG__?.engine.getCurrentScene()?.kind === k && !window.__DEBUG__.flow.isTransitioning(), kind, { timeout: 240000, polling: 250 });
  await page.addStyleTag({ content: '.debug-overlay, .debug-menu { display: none !important; }' });
  const frames = (n = 2) => page.evaluate((n) => new Promise((r) => { const f = (k) => (k ? requestAnimationFrame(() => f(k - 1)) : r()); f(n); }), n);
  const h_ = {
    page,
    async shot(label) {
      await frames();
      const file = `${dir}/${name}-${label}.${FORMAT}`;
      await page.screenshot({ path: file, ...(FORMAT === 'jpg' ? { type: 'jpeg', quality: 90 } : {}) });
      shots++;
      console.log('  ', file);
    },
    /** Waits for the scene's clock to reach `t` seconds, freezes the game, shoots, and unfreezes. */
    async beat(label, t, clock = 'sceneTime') {
      await page.waitForFunction(({ t, clock }) => {
        const d = window.__DEBUG__;
        const s = d.engine.getCurrentScene();
        const now = clock === 'sceneTime' ? d.motion.gameTime - window.__beatStart : s[clock];
        if (now < t) return false;
        d.motion.frozen = true;
        return true;
      }, { t, clock }, { timeout: 180000, polling: 'raf' });
      await h_.shot(label);
      await page.evaluate(() => { window.__DEBUG__.motion.frozen = false; });
    },
    startClock: () => page.evaluate(() => { window.__beatStart = window.__DEBUG__.motion.gameTime; }),
    async view(label, x, y, z, yaw, pitch = 0, crouch = false) {
      await page.evaluate(({ x, y, z, yaw, pitch }) => {
        const p = window.__DEBUG__.engine.getCurrentScene().player;
        p.teleport(new p.rig.position.constructor(x, y, z), yaw);
        p.pitch = pitch;
      }, { x, y, z, yaw, pitch });
      if (crouch) await page.keyboard.down('KeyC');
      await page.waitForTimeout(900);
      await h_.shot(label);
      if (crouch) await page.keyboard.up('KeyC');
    },
    until: (fn, ms = 180000, arg) => page.waitForFunction(fn, arg, { timeout: ms, polling: 100 }),
  };
  try {
    await run(h_);
  } catch (e) {
    errors.push(`${name}: ${e.message.split('\n')[0]}`);
    console.log(`   ${name} stopped: ${e.message.split('\n')[0]}`);
  }
  await context.close();
}

/** Leaves the Wren for `planet` as the flow does from the helm (the debug event), First light offered or not. */
async function depart(h, planet) {
  await h.page.evaluate((p) => {
    window.__DEBUG__.flow.tutorial?.skip?.();
    window.__DEBUG__.bus.emit('galaxy:travel_to', p);
  }, planet);
}

/** Puts the cruise at `t` seconds, lets it run 0.6 s into the frame, and shoots it frozen. */
/**
 * The cruise's captions and its title run on the scene's own timeline clock, which jumping the
 * scene's time doesn't move: a shot at the title's time showed no title. Holding to skip is how a
 * player reaches it early, so the title shot goes that way and waits `after` seconds.
 */
async function cruiseTitle(h, label, after) {
  await h.page.evaluate(() => window.__DEBUG__.engine.getCurrentScene().skipToArrival());
  await h.page.waitForTimeout(after * 1000);
  await h.page.evaluate(() => { window.__DEBUG__.motion.frozen = true; });
  await h.shot(label);
  await h.page.evaluate(() => { window.__DEBUG__.motion.frozen = false; });
}

async function cruiseAt(h, label, t) {
  await h.page.evaluate((t) => { window.__DEBUG__.engine.getCurrentScene().time = t - 0.6; }, t);
  await h.page.waitForTimeout(600);
  await h.page.evaluate(() => { window.__DEBUG__.motion.frozen = true; });
  await h.shot(label);
  await h.page.evaluate(() => { window.__DEBUG__.motion.frozen = false; });
}

for (const tier of TIERS) {
  for (const [w, h] of SIZES) {
    const dir = `${OUT}/${tier}-${w}x${h}`;
    mkdirSync(dir, { recursive: true });
    console.log(`${tier} ${w}x${h}`);

    await section('title', '', null, w, h, tier, dir, async (s) => {
      await s.page.waitForSelector('.title-screen.backdrop-live', { timeout: 120000 });
      // The ship dashes in two seconds after the backdrop arrives, then holds.
      await s.page.waitForTimeout(4000);
      await s.shot('menu');
    });

    await section('intro', '?newGame=1', 'IntroScene', w, h, tier, dir, async (s) => {
      for (const t of [2, 7, 14, 19]) await s.beat(`${t}s`, t, 'elapsed');
    });

    await section('wren', '?newGame=1&skipIntro=1', 'ShipInteriorScene', w, h, tier, dir, async (s) => {
      await s.page.waitForTimeout(3000);
      await s.shot('spawn');
      await s.view('console', 0, 0, -2, 0, -0.1);
      await s.view('airlock', 0, 0, 2, Math.PI, 0);
      await s.view('repair', 2.2, 0, 1.6, -Math.PI / 2, -0.15);
      await s.view('window-bay', -1.5, 0, -3.2, 0.5, 0.05);
      await s.page.keyboard.press('Tab');
      await s.page.waitForTimeout(900);
      await s.shot('panel-character');
      await s.page.keyboard.press('Escape');
      await s.page.waitForTimeout(700);
      await s.page.keyboard.press('KeyO');
      await s.page.waitForTimeout(900);
      await s.shot('panel-settings');
      await s.page.keyboard.press('Escape');
      await s.page.waitForTimeout(700);
      await s.page.keyboard.press('Escape');
      await s.page.waitForTimeout(900);
      await s.shot('panel-pause');
    });

    await section('reveal', '?newGame=1&skipTutorial=1', 'GalaxyRevealScene', w, h, tier, dir, async (s) => {
      await s.startClock();
      for (const t of [1.5, 5.8, 8.2]) await s.beat(`${t}s`, t);
      await s.until(() => !!window.__DEBUG__.miniGame());
      await s.page.waitForTimeout(2500);
      await s.shot('mg1-charter');
      await s.page.evaluate(() => window.__DEBUG__.miniGame().win());
      await s.page.waitForTimeout(1200);
      await s.shot('mg1-win');
      await s.page.waitForTimeout(2500);
      await s.shot('mg1-after');
    });

    await section('kethra-trip', '?newGame=1&skipIntro=1&unlockKethra=1', 'ShipInteriorScene', w, h, tier, dir, async (s) => {
      await depart(s, 'kethra');
      await s.page.waitForSelector('.first-light-hint', { timeout: 60000 });
      await s.page.waitForTimeout(1500);
      await s.shot('firstlight-offer');
      await s.page.keyboard.down('Space');
      await s.page.waitForTimeout(1700);
      await s.shot('firstlight-ignition');
      await s.until(() => window.__DEBUG__.engine.getCurrentScene()?.power?.stage === 'full', 30000);
      await s.page.keyboard.up('Space');
      await s.until(() => window.__DEBUG__.engine.getCurrentScene()?.kind === 'CruiseScene', 60000);
      for (const [label, t] of [['stern', 2], ['departure', 6.5], ['acceleration', 13], ['transit', 22], ['reveal', 32], ['entry', 40]]) await cruiseAt(s, `cruise-${label}`, t);
      await cruiseTitle(s, 'cruise-title', 1.5);
      await s.until(() => { const c = window.__DEBUG__.engine.getCurrentScene(); return c?.kind === 'CanopyScene' && c.state().phase === 'fly'; }, 180000);
      await s.page.waitForTimeout(1500);
      await s.shot('canopy-start');
      await s.page.evaluate(() => window.__DEBUG__.miniGame().win());
      await s.page.waitForTimeout(1500);
      await s.shot('canopy-touchdown');
      await s.page.waitForTimeout(3000);
      await s.shot('canopy-establishing');
      await s.until(() => window.__DEBUG__.engine.getCurrentScene()?.kind === 'KethraScene' && !window.__DEBUG__.flow.isTransitioning(), 240000);
      await s.page.waitForTimeout(2500);
      await s.shot('kethra-arrival');
    });

    await section('kethra', '?newGame=1&skipIntro=1&unlockKethra=1&jump=kethra', 'KethraScene', w, h, tier, dir, async (s) => {
      await s.page.waitForTimeout(2500);
      await s.view('landing', 0, 0.4, 18, 0, 0);
      await s.view('plaza-wide', -6, 0.4, 12, -0.45, -0.02);
      await s.view('aiveth', 0, 0.4, 9.5, 0, -0.05);
      await s.view('east-terrace', 14, 1, 1, -1.1, 0);
      await s.view('west-terrace', -14, 1, 1, 1.0, 0);
      await s.view('gate', 0, 1.5, -5.5, 0, 0.12);
      // Inside the door the Hush begins; the moth watches from the far arch.
      await s.view('hush-door', 0, 1.6, -11.4, 0, 0.05);
      await s.page.waitForTimeout(2500);
      await s.shot('hush-lesson');
      await s.view('hush-tunnel', 9.2, 1.6, -16, 0, 0);
      await s.view('hush-rite', 0, 1.6, -29.4, Math.PI, 0.08);
      await s.page.evaluate(() => window.__DEBUG__.miniGame().win());
      await s.page.waitForTimeout(1500);
      await s.shot('wake-1');
      await s.page.waitForTimeout(3500);
      await s.shot('wake-2');
      await s.page.waitForTimeout(4000);
      await s.shot('wake-3');
    });

    await section('vessek-trip', '?newGame=1&skipIntro=1&unlockVessek=1', 'ShipInteriorScene', w, h, tier, dir, async (s) => {
      await s.page.evaluate(() => window.__DEBUG__.gameState.setFlag('first_light'));
      await depart(s, 'vessek');
      await s.until(() => window.__DEBUG__.engine.getCurrentScene()?.kind === 'CruiseScene', 60000);
      for (const [label, t] of [['transit', 22], ['reveal', 32], ['entry', 40]]) await cruiseAt(s, `cruise-${label}`, t);
      await cruiseTitle(s, 'cruise-docked', 2.5);
    });

    await section('vessek', '?newGame=1&skipIntro=1&unlockVessek=1&jump=vessek', 'VessekScene', w, h, tier, dir, async (s) => {
      await s.page.waitForTimeout(2500);
      await s.shot('arrival');
      await s.view('concourse', 0, 0, 5, 0.2, -0.05);
      await s.view('varro', -1.6, 0, 0.8, 0.5, -0.08);
      await s.view('gauge', 5, 0, -8.6, 0, 0.1);
      await s.view('school', -13.2, 0, 6, 1.57, 0);
      await s.view('duct', 2, 0, -12.1, 0, -0.05, true);
      await s.view('tanker', -1, 0, -18, 0, 0.05);
      await s.view('junction', 14, 0, -24, -2.3, 0);
      await s.view('windows', 3, 0, 1, -1.57, 0.02);
    });

    await section('ending', '?newGame=1&skipIntro=1&unlockVessek=1&jump=ending', 'EndingScene', w, h, tier, dir, async (s) => {
      await s.startClock();
      for (const t of [3, 10, 20, 32]) await s.beat(`${t}s`, t);
    });
  }
}

await browser.close();
const unique = [...new Set(errors)];
console.log(`${shots} shots, ${unique.length} distinct errors or warnings`);
for (const e of unique.slice(0, 12)) console.log('  ', e);
process.exit(unique.length ? 1 : 0);
