// Frame-rate independence (the brief's motion rule: "looks the same at 30 fps and at 144 Hz"), where
// it can break: the integrators. Springs and exponential damping (src/motion/spring.ts) are stepped at
// 30, 60 and 144 Hz to the same moment and must agree; tweens and timers sample elapsed time, so they
// agree by construction. Then the player's jump, stepped through the real PlayerController at each rate
// in the browser: the same apex (tuning.ts's 1 m) and the same time in the air (the 2.1 m walking jump).
//
//   npm run build && npx vite preview --port 4180 --strictPort   (in another terminal)
//   node tools/test-frame-rates.mjs [baseUrl]
import { chromium } from 'playwright';
import { stepSpring, damp } from '../src/motion/spring.ts';
import { CHROME_ARGS } from './lib/probe.mjs';

const BASE = process.argv[2] ?? 'http://localhost:4180/kethra-adventure/';
const RATES = [30, 60, 144];
let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed++;
};

/** Runs `step(dt)` at `hz` for exactly `seconds` (the last step is the remainder). */
function run(hz, seconds, step) {
  const dt = 1 / hz;
  let t = 0;
  while (seconds - t > 1e-9) {
    const d = Math.min(dt, seconds - t);
    step(d);
    t += d;
  }
}

for (const cfg of [{ omega: 14, zeta: 0.55 }, { omega: 20, zeta: 1 }, { omega: 9, zeta: 1.4 }]) {
  for (const at of [0.25, 0.9]) {
    const xs = RATES.map((hz) => {
      const s = { x: 0, v: 0 };
      run(hz, at, (d) => stepSpring(s, 1, cfg, d));
      return s.x;
    });
    const spread = Math.max(...xs) - Math.min(...xs);
    check(`spring ω${cfg.omega} ζ${cfg.zeta} at ${at} s agrees at ${RATES.join('/')} Hz`, spread < 1e-6, xs.map((x) => x.toFixed(5)).join(' / '));
  }
}
{
  const xs = RATES.map((hz) => {
    let x = 0;
    run(hz, 0.5, (d) => (x = damp(x, 1, 6, d)));
    return x;
  });
  check('damp agrees at every rate', Math.max(...xs) - Math.min(...xs) < 1e-9, xs.map((x) => x.toFixed(6)).join(' / '));
}

const browser = await chromium.launch({ channel: 'chrome', args: CHROME_ARGS });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
await page.goto(`${BASE}?newGame=1&skipIntro=1&unlockKethra=1&jump=kethra&debug=1&tier=low`);
await page.waitForFunction(() => window.__DEBUG__?.engine.getCurrentScene()?.kind === 'KethraScene' && !window.__DEBUG__.flow.isTransitioning(), null, { timeout: 240000, polling: 250 });
await page.waitForTimeout(1500);
const jumps = await page.evaluate((rates) => {
  const d = window.__DEBUG__;
  // The scene stops updating the player (zero game dt); each jump is stepped by hand.
  d.motion.frozen = true;
  const p = d.engine.getCurrentScene().player;
  const V3 = p.rig.position.constructor;
  return rates.map((hz) => {
    const dt = 1 / hz;
    p.teleport(new V3(0, 0.4, 4), 0);
    for (let i = 0; i < 30; i++) p.update(dt);
    const y0 = p.rig.position.y;
    p.velocityY = 6;
    p.onGround = false;
    p.jumping = true;
    p.jumpFromY = y0;
    let peak = 0;
    let frames = 0;
    do {
      p.update(dt);
      frames++;
      peak = Math.max(peak, p.rig.position.y - y0);
    } while (!p.onGround && frames < 400);
    return { hz, peak, air: frames * dt };
  });
}, RATES);
await page.evaluate(() => { window.__DEBUG__.motion.frozen = false; });
await browser.close();
for (const j of jumps) check(`at ${j.hz} Hz the jump peaks at 1 m`, Math.abs(j.peak - 1) < 0.02, `${j.peak.toFixed(3)} m, ${j.air.toFixed(3)} s in the air`);
const peaks = jumps.map((j) => j.peak);
const airs = jumps.map((j) => j.air);
check('the apex agrees across rates to 2 cm', Math.max(...peaks) - Math.min(...peaks) < 0.02, peaks.map((x) => x.toFixed(3)).join(' / '));
check('the time in the air agrees to a 30 Hz frame', Math.max(...airs) - Math.min(...airs) <= 1 / 30 + 1e-6, airs.map((x) => x.toFixed(3)).join(' / '));
console.log(failed ? `\n${failed} check(s) failed` : '\nall frame-rate checks passed');
process.exit(failed ? 1 : 0);
