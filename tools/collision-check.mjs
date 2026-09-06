// Flood-fills a scene's walkable floor from the player's spawn using the player's own collider set
// and capsule test, then reports whether every interaction target is still reachable. Catches the
// two ways adding collision goes wrong: sealing the player in, and walling off an objective.
//
// Usage: node tools/collision-check.mjs [ship|kethra] [--map]
import { chromium } from 'playwright';

const scene = process.argv.includes('kethra') ? 'kethra' : 'ship';
// --baseline N restricts the test to the first N colliders, i.e. the hand-authored set a scene had
// before geometry-derived ones were appended, so a failure can be attributed to this change or to
// the level as it already stood.
const baselineArg = process.argv.indexOf('--baseline');
const baseline = baselineArg >= 0 ? Number(process.argv[baselineArg + 1]) : null;
const baseUrl = process.env.BASE_URL || 'http://localhost:5180/kethra-adventure/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
await page.goto(`${baseUrl}?skipIntro=1&newGame=1&unlockKethra=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForFunction(() => !!window.__DEBUG__?.gameState, undefined, { timeout: 90000 });
const wantClass = scene === 'kethra' ? 'KethraScene' : 'ShipInteriorScene';
if (scene === 'kethra') {
  await page.waitForFunction(() => !!window.__DEBUG__.engine.getCurrentScene?.(), undefined, { timeout: 90000 });
  await page.evaluate(() => window.__DEBUG__.bus.emit('galaxy:travel_to', 'kethra'));
}
await page.waitForFunction((cls) => {
  const s = window.__DEBUG__.engine.getCurrentScene?.();
  return !!(s && s.player && s.constructor.name === cls);
}, wantClass, { timeout: 90000 });
await page.waitForTimeout(4000);

const out = await page.evaluate((baseline) => {
  const sc = window.__DEBUG__.engine.getCurrentScene();
  let boxes = sc.player.colliders.map((c) => c.box);
  if (baseline !== null) boxes = boxes.slice(0, baseline);
  const R = 0.35, H = 1.8, STEP_OVER = 0.25, MAX_STEP_UP = 0.45;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const blocked = (x, z, feet) => {
    for (const b of boxes) {
      if (b.max.y <= feet + STEP_OVER || b.min.y >= feet + H) continue;
      const dx = x - clamp(x, b.min.x, b.max.x);
      const dz = z - clamp(z, b.min.z, b.max.z);
      if (dx * dx + dz * dz < R * R) return true;
    }
    return false;
  };

  // Grid bounds from the real walkable surfaces. A catch-plane far below the play space (Kethra's
  // 600x600 safety net at y=-20) is excluded so the grid covers the terraces, not the whole sky.
  const B3 = boxes[0].constructor;
  const bounds = new B3();
  bounds.makeEmpty();
  for (const f of sc.player.floorTargets) {
    const b = new B3().setFromObject(f);
    if (b.max.x - b.min.x > 100 || b.max.z - b.min.z > 100) continue;
    bounds.union(b);
  }
  const X0 = Math.floor(bounds.min.x) - 1, X1 = Math.ceil(bounds.max.x) + 1;
  const Z0 = Math.floor(bounds.min.z) - 1, Z1 = Math.ceil(bounds.max.z) + 1;
  const G = 0.25;
  const NX = Math.round((X1 - X0) / G) + 1, NZ = Math.round((Z1 - Z0) / G) + 1;
  const idx = (i, j) => j * NX + i;

  // Per-cell floor height, sampled with the player's own downward raycast so ramps and terraces
  // read exactly as they do in play. The rig is parked high first because sampleFloorHeight casts
  // from rig.y + 2 with a 10-unit reach.
  const spawn = sc.player.rig.position.clone();
  sc.player.rig.position.y = 4;
  const floorY = new Float32Array(NX * NZ).fill(NaN);
  const open = new Uint8Array(NX * NZ);
  let openCount = 0;
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      const x = X0 + i * G, z = Z0 + j * G;
      const y = sc.player.sampleFloorHeight(x, z);
      if (y === null || y < -10) continue; // off the play space / over the catch plane
      floorY[idx(i, j)] = y;
      if (!blocked(x, z, y)) { open[idx(i, j)] = 1; openCount++; }
    }
  }
  sc.player.rig.position.copy(spawn);

  const si = Math.round((spawn.x - X0) / G), sj = Math.round((spawn.z - Z0) / G);
  const spawnBlocked = !open[idx(si, sj)];
  const seen = new Uint8Array(NX * NZ);
  const queue = [];
  if (!spawnBlocked) { seen[idx(si, sj)] = 1; queue.push([si, sj]); }
  let head = 0, reach = queue.length, bigSteps = 0;
  while (head < queue.length) {
    const [i, j] = queue[head++];
    const y0 = floorY[idx(i, j)];
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= NX || nj >= NZ) continue;
      const k = idx(ni, nj);
      if (seen[k] || !open[k]) continue;
      // No step-up limit, because PlayerController has none for a grounded player: it zeroes
      // velocityY every grounded frame, which makes its `|stepDiff| <= MAX_STEP_UP + 1 ||
      // velocityY <= 0` test always true, and `rig.y <= floorY + 0.05` always true for a rise — so
      // it snaps the player up an arbitrarily tall ledge as long as there is floor to snap to.
      // Gating at MAX_STEP_UP here would model a stricter player than the game and could report a
      // route sealed that is actually open. Steps over MAX_STEP_UP are counted instead, since they
      // are climbs the level was probably not designed to allow.
      if (floorY[k] - y0 > MAX_STEP_UP) bigSteps++;
      seen[k] = 1; reach++; queue.push([ni, nj]);
    }
  }

  // Both distances InteractionSystem actually uses, because it tries one then the other:
  //   aim  - the crosshair raycast path. It compares the ray's hit distance on the object's real
  //          geometry against range, so eye-to-nearest-point-of-bounds is an optimistic proxy for
  //          it (optimistic because it ignores occlusion and assumes the player aims perfectly).
  //   prox - the fallback. It compares the camera to the object's WORLD ORIGIN, not to its
  //          geometry, so for an object whose group origin sits away from its meshes the two
  //          numbers diverge wildly. Reporting only one of these is how an earlier version of this
  //          tool certified the Kethra valve as reachable while the real proximity zone sat 8.6 m
  //          away at the plaza origin.
  const targets = sc.interaction.interactables.map((it) => {
    const b = new B3().setFromObject(it.object);
    const origin = it.object.getWorldPosition(new (sc.player.rig.position.constructor)());
    let aim = Infinity, prox = Infinity, at = null;
    for (let j = 0; j < NZ; j++) {
      for (let i = 0; i < NX; i++) {
        if (!seen[idx(i, j)]) continue;
        const x = X0 + i * G, z = Z0 + j * G, eye = floorY[idx(i, j)] + 1.7;
        const dx = x - clamp(x, b.min.x, b.max.x);
        const dy = eye - clamp(eye, b.min.y, b.max.y);
        const dz = z - clamp(z, b.min.z, b.max.z);
        const a = Math.hypot(dx, dy, dz);
        if (a < aim) { aim = a; at = [+x.toFixed(2), +z.toFixed(2)]; }
        prox = Math.min(prox, Math.hypot(x - origin.x, eye - origin.y, z - origin.z));
      }
    }
    // The origin drifting far outside the object's own bounds means the proximity fallback fires
    // somewhere the object is not — a phantom prompt.
    const originOutside = Math.hypot(
      origin.x - clamp(origin.x, b.min.x, b.max.x),
      origin.y - clamp(origin.y, b.min.y, b.max.y),
      origin.z - clamp(origin.z, b.min.z, b.max.z),
    );
    return {
      label: typeof it.label === 'function' ? it.label() : it.label,
      range: it.range,
      aim: +aim.toFixed(2),
      prox: +prox.toFixed(2),
      standAt: at,
      originOutside: +originOutside.toFixed(2),
      ok: aim <= it.range || prox <= it.range,
    };
  });

  const map = [];
  for (let j = NZ - 1; j >= 0; j--) {
    let row = (Z0 + j * G).toFixed(1).padStart(6) + ' ';
    for (let i = 0; i < NX; i++) {
      const k = idx(i, j);
      row += seen[k] ? '.' : open[k] ? '?' : Number.isNaN(floorY[k]) ? ' ' : '#';
    }
    map.push(row);
  }

  return { scene: sc.constructor.name, colliders: boxes.length, gridCells: NX * NZ, openCount, reach, bigSteps, spawnBlocked, targets, map };
}, baseline);

console.log(`${out.scene}: colliders=${out.colliders}  grid=${out.gridCells}  onFloor+clear=${out.openCount}  reachable-from-spawn=${out.reach}`);
console.log(`spawn blocked: ${out.spawnBlocked ? 'YES  <-- FAIL' : 'no'}`);
if (out.openCount !== out.reach) console.log(`NOTE: ${out.openCount - out.reach} clear cells are not reachable from spawn (separate terrace / too tall a step)`);
if (out.bigSteps) console.log(`NOTE: ${out.bigSteps} cell transitions need a step over MAX_STEP_UP; the player can make them but the level probably did not intend it`);
for (const t of out.targets) {
  const via = t.aim <= t.range ? 'aim' : t.prox <= t.range ? 'proximity only' : '-';
  console.log(`  ${t.ok ? 'OK  ' : 'FAIL'} "${t.label}"  aim ${t.aim}m / prox ${t.prox}m (range ${t.range}, via ${via}) from ${JSON.stringify(t.standAt)}`);
  if (t.originOutside > 0.5) console.log(`       WARNING: object origin sits ${t.originOutside}m outside its own bounds — the proximity fallback fires where the object is not`);
}
if (process.argv.includes('--map')) {
  console.log('');
  console.log('  reachable "."   blocked "#"   clear but unreachable "?"   off the floor " "');
  for (const row of out.map) console.log(row);
}
await browser.close();
