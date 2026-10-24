// Browser test of the walking controls with real key presses (src/player/PlayerController.ts,
// bindings in src/content/controls.ts). On Kethra: W/A/S/D move without turning, the arrow keys look
// without moving, Space jumps about 1 m and lands, a root tunnel's roof stops a jump, a jump can't
// carry the player into the parked skiff, and walking a root tunnel keeps the camera clear of its
// arches. In the Wren: a wall fixture above head height stops a jump. On Vessek: no jumping where
// there's no room to stand, a door doesn't shut on the player, both drop vents let the player walk
// away from where they land, and Varro and the cargo are solid.
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

/** A fresh game in the scene `kind`, settled. */
async function load(query, kind) {
  await page.goto(`${BASE}?newGame=1&skipIntro=1&tier=low&${query}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction((k) => window.__DEBUG__?.engine.getCurrentScene()?.kind === k && !window.__DEBUG__.flow.isTransitioning(), kind, { timeout: 240000, polling: 250 });
  await page.waitForTimeout(1500);
}

// unlockVessek leaves the Heart already woken, so the Wickmoth rests and the chamber is safe to stand in.
await load('unlockVessek=1&jump=kethra', 'KethraScene');

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

// Down the west root tunnel on three lines, the camera's nearest distance to anything but the floor
// (rays in 26 directions). The arches used to hang at head height: 0.5 cm.
const clearance = await page.evaluate(async () => {
  const s = window.__DEBUG__.engine.getCurrentScene();
  const p = s.player;
  const V = p.rig.position.constructor;
  const ray = new p.raycaster.constructor();
  ray.far = 0.3;
  const skip = new Set();
  for (const f of p.floorTargets) f.traverse((o) => skip.add(o));
  p.rig.traverse((o) => skip.add(o));
  const targets = [];
  s.scene.traverse((o) => {
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (o.isMesh && !o.isInstancedMesh && !skip.has(o) && o.visible && m?.visible !== false) targets.push(o);
  });
  const dirs = [];
  for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) if (x || y || z) dirs.push(new V(x, y, z).normalize());
  const cam = new V();
  let worst = 9;
  for (const lane of [0, 0.3, 0.55]) {
    p.enabled = true;
    p.teleport(new V(-9.2 + lane, 1.6, -13.8), 0);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    for (let f = 0; f < 240 && p.rig.position.z > -24.5; f++) {
      await new Promise((r) => requestAnimationFrame(r));
      p.camera.getWorldPosition(cam);
      for (const d of dirs) {
        ray.set(cam, d);
        const h = ray.intersectObjects(targets, true)[0];
        if (h) worst = Math.min(worst, h.distance);
      }
    }
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
  }
  return { worst, z: p.rig.position.z };
});
check('walking a root tunnel keeps the camera clear of its arches', clearance.worst > 0.1 && clearance.z < -24, `nearest ${clearance.worst.toFixed(3)} m, reached z ${clearance.z.toFixed(1)}`);

// The Wren: a wall fixture on the port wall at 2.38 m (above head height, so it only had a collider
// up to 2.1 m) stops a jump under it at the fixture's underside, 0.58 m up.
await load('unlockKethra=1', 'ShipInteriorScene');
await standAt(-5.2, 0.2, -4.6, Math.PI / 2);
const w = await jump(1200);
check('in the Wren, a wall fixture over the head stops a jump', w.peak > 0.3 && w.peak < 0.7, `peak ${w.peak.toFixed(2)} m`);

// Vessek.
await load('unlockVessek=1&jump=vessek', 'VessekScene');
// In Dace's duct, under its 1.25 m roof: the player is crouched and has no room to jump.
await standAt(-18, 0.2, -2.5, 0);
const d = await jump(800);
check('crouched in a duct, Space does not jump', d.peak < 0.02, `peak ${d.peak.toFixed(3)} m`);

// The junction's keypad door closes 7 s after it opens; standing in the doorway, it used to close on
// the player, and its collider held them there for good.
await page.evaluate(() => {
  const s = window.__DEBUG__.engine.getCurrentScene();
  s.openFor(s.rooms.keypadDoor, 0.5);
});
await standAt(12.435, 0.2, -30, -Math.PI / 2);
await page.waitForTimeout(1500);
check('a door does not shut on a player standing in it', await page.evaluate(() => window.__DEBUG__.engine.getCurrentScene().rooms.keypadDoor.open));
await hold('KeyW', 1200);
await page.waitForTimeout(1200);
check('...and shuts once they are through', await page.evaluate(() => !window.__DEBUG__.engine.getCurrentScene().rooms.keypadDoor.open), JSON.stringify(await state()));

/** Crawls out of a drop vent (C and W held, C let go at the mouth) and tries all four directions. */
async function dropOut(x, z, yaw, crawlMs) {
  await standAt(x, 2.55, z, yaw);
  await page.keyboard.down('KeyC');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(crawlMs);
  await page.keyboard.up('KeyC');
  await page.waitForTimeout(1700);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(500);
  const landed = await state();
  const moves = [];
  for (const k of ['KeyS', 'KeyA', 'KeyD', 'KeyW']) {
    const m = await hold(k, 700);
    moves.push(+Math.hypot(m.right, m.forward).toFixed(2));
  }
  return { landed, moves };
}
// Dace's vent drops 2.5 m into the tanker over a grow table (x -6.8 to -1.6, z -26.55 to -25.45, 1 m
// high). On the live build the player landed against the wall under the vent, or inside the table,
// and could not move.
const tanker = await dropOut(-9.6, -26, -Math.PI / 2, 1300);
const inTable = tanker.landed.y < 0.95 && tanker.landed.x > -7.15 && tanker.landed.x < -1.25 && tanker.landed.z > -26.9 && tanker.landed.z < -25.1;
check('out of Dace’s vent the player lands clear (on the table or the floor) and can walk away', !inTable && Math.min(...tanker.moves) > 0.3, `landed ${JSON.stringify([tanker.landed.x, tanker.landed.y, tanker.landed.z].map((v) => +v.toFixed(2)))}, moves ${JSON.stringify(tanker.moves)}`);
const junction = await dropOut(18, -18.6, 0, 1300);
check('out of the hall duct’s vent into the junction, the player can walk away', Math.min(...junction.moves) > 0.3, `landed ${JSON.stringify([junction.landed.x, junction.landed.y, junction.landed.z].map((v) => +v.toFixed(2)))}, moves ${JSON.stringify(junction.moves)}`);

// Varro (at -2.6, -2.3) and the crate west of the desk (x -6.55 to -5.25) are solid.
await standAt(-0.6, 0.2, -2.3, Math.PI / 2);
await hold('KeyW', 1500);
const v = await state();
check('the player can’t walk through Varro', v.x > -2.0, `stopped at x ${v.x.toFixed(2)}`);
await standAt(-4.0, 0.2, -3.2, Math.PI / 2);
await hold('KeyW', 1500);
const c = await state();
check('the player can’t walk through the crate by the desk', c.x > -4.95, `stopped at x ${c.x.toFixed(2)}`);

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
