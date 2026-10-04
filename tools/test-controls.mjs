// Browser test of the walking controls with real key presses, on Kethra (src/player/PlayerController.ts,
// bindings in src/content/controls.ts): W/A/S/D move without turning, the arrow keys look without
// moving, Space jumps about 1 m and lands, a root tunnel's roof stops a jump, and a jump can't carry
// the player into the parked skiff.
//
//   npm run build && npx vite preview --port 4180 --strictPort   (in another terminal)
//   node tools/test-controls.mjs [baseUrl]
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:4180/kethra-adventure/';
let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
  if (!ok) failed++;
}
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

// unlockVessek leaves the Heart already woken, so the Wickmoth rests and the chamber is safe to stand in.
await page.goto(`${BASE}?newGame=1&skipIntro=1&unlockVessek=1&jump=kethra&tier=low`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__DEBUG__?.engine.getCurrentScene()?.kind === 'KethraScene' && !window.__DEBUG__.flow.isTransitioning(), null, { timeout: 240000, polling: 250 });
await page.waitForTimeout(1500);

const DEG = 180 / Math.PI;
const state = () => page.evaluate(() => {
  const p = window.__DEBUG__.engine.getCurrentScene().player;
  return { x: p.rig.position.x, y: p.rig.position.y, z: p.rig.position.z, yaw: p.yaw, pitch: p.pitch, onGround: p.onGround };
});
/** Puts the player at (x, y, z) facing `yaw`, and waits for them to settle on the floor. */
async function standAt(x, y, z, yaw = 0) {
  await page.evaluate(([x, y, z, yaw]) => {
    const p = window.__DEBUG__.engine.getCurrentScene().player;
    p.enabled = true;
    p.teleport(new p.rig.position.constructor(x, y, z), yaw);
  }, [x, y, z, yaw]);
  await page.waitForTimeout(800);
}
/** Holds `code` for `ms`; returns the move in the player's own frame (right, forward) and the turn. */
async function hold(code, ms = 800) {
  const a = await state();
  await page.keyboard.down(code);
  await page.waitForTimeout(ms);
  await page.keyboard.up(code);
  await page.waitForTimeout(150);
  const b = await state();
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  return {
    right: Math.cos(a.yaw) * dx - Math.sin(a.yaw) * dz,
    forward: -Math.sin(a.yaw) * dx - Math.cos(a.yaw) * dz,
    turn: (b.yaw - a.yaw) * DEG,
    tilt: (b.pitch - a.pitch) * DEG,
  };
}
/** Taps Space and records the feet height every frame for `ms`. */
async function jump(ms = 1500, alsoHold = null) {
  await page.evaluate((ms) => {
    const s = window.__DEBUG__.engine.getCurrentScene();
    const p = s.player;
    const out = { y0: p.rig.position.y, ys: [], landings: 0 };
    const prev = p.onLand;
    p.onLand = (k) => {
      out.landings++;
      prev?.(k);
    };
    const t0 = performance.now();
    const tick = () => {
      out.ys.push(p.rig.position.y - out.y0);
      if (performance.now() - t0 < ms) requestAnimationFrame(tick);
      else p.onLand = prev;
    };
    requestAnimationFrame(tick);
    window.__jump = out;
  }, ms);
  if (alsoHold) await page.keyboard.down(alsoHold);
  await page.keyboard.press('Space');
  await page.waitForTimeout(ms + 200);
  if (alsoHold) await page.keyboard.up(alsoHold);
  return page.evaluate(() => {
    const j = window.__jump;
    return { peak: Math.max(...j.ys), end: j.ys[j.ys.length - 1], landings: j.landings, frames: j.ys.length };
  });
}

// Open ground in the middle of the grove plaza, facing north.
await standAt(0, 1, 0, 0);
for (const [code, dir] of [['KeyD', 1], ['KeyA', -1]]) {
  const m = await hold(code);
  check(`${code.slice(3)} moves ${dir > 0 ? 'right' : 'left'} without turning`, m.right * dir > 1.5 && Math.abs(m.forward) < 0.1 && Math.abs(m.turn) < 1, `${m.right.toFixed(2)} m sideways, ${m.turn.toFixed(1)}° turn`);
}
for (const [code, dir] of [['KeyW', 1], ['KeyS', -1]]) {
  const m = await hold(code);
  check(`${code.slice(3)} moves ${dir > 0 ? 'forward' : 'back'}`, m.forward * dir > 1.5 && Math.abs(m.right) < 0.1, `${m.forward.toFixed(2)} m`);
}
for (const [code, sign, field] of [['ArrowLeft', 1, 'turn'], ['ArrowRight', -1, 'turn'], ['ArrowUp', 1, 'tilt'], ['ArrowDown', -1, 'tilt']]) {
  await standAt(0, 1, 0, 0);
  const m = await hold(code, 500);
  const moved = Math.hypot(m.right, m.forward);
  check(`${code} looks ${field === 'turn' ? (sign > 0 ? 'left' : 'right') : sign > 0 ? 'up' : 'down'} without moving`, m[field] * sign > 30 && moved < 0.05, `${m[field].toFixed(1)}°, moved ${moved.toFixed(2)} m`);
}

await standAt(0, 1, 0, 0);
const j = await jump();
check('Space jumps about 1 m', j.peak > 0.7 && j.peak < 1.15, `peak ${j.peak.toFixed(2)} m over ${j.frames} frames`);
check('the jump lands back on the floor, with the landing dip', Math.abs(j.end) < 0.02 && j.landings === 1, `ends ${j.end.toFixed(3)} m from the take-off, ${j.landings} landing`);

// Under the west root tunnel in the Heart's chamber (hush/sim.ts: x -9.2, z -15 to -23.8, roof 1.95 m
// above the floor), the head stops at the roof.
await standAt(-9.2, 1.6, -19.4, 0);
const t = await jump(1000);
check('a root tunnel roof stops the jump at the head', t.peak > 0.02 && t.peak < 0.25, `peak ${t.peak.toFixed(2)} m`);

// The skiff on the landing terrace is a 1.2 m-tall box from x 1.5 to 4.5; run and jump at it from the
// west. The jump clears the box's top, so only colliders blocking from the take-off height keep the
// player out of it.
await standAt(0.4, 1, 19.6, -Math.PI / 2);
await jump(1500, 'KeyW');
const after = await state();
check('a jump does not carry the player into the skiff', after.x < 1.5 - 0.3, `stopped at x ${after.x.toFixed(2)} (the skiff starts at 1.5)`);

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
