// Flood-fills the ship interior's walkable floor from the spawn point using the player's own
// collider set and capsule test, then reports whether every interaction target is still reachable.
// Catches the two ways adding collision goes wrong: sealing the player in, and walling off an
// objective.
// Usage: node tools/collision-check.mjs
import { chromium } from 'playwright';

const baseUrl = process.env.BASE_URL || 'http://localhost:5180/kethra-adventure/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
await page.goto(baseUrl + '?skipIntro=1&newGame=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForFunction(() => !!window.__DEBUG__?.gameState, undefined, { timeout: 90000 });
await page.waitForFunction(() => {
  const s = window.__DEBUG__.engine.getCurrentScene?.();
  return !!(s && s.player && s.constructor.name === 'ShipInteriorScene');
}, undefined, { timeout: 90000 });
await page.waitForTimeout(3500);

const out = await page.evaluate(() => {
  const sc = window.__DEBUG__.engine.getCurrentScene();
  const boxes = sc.player.colliders.map((c) => c.box);
  const R = 0.35, H = 1.8, STEP = 0.25, FEET = 0;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const blocked = (x, z) => {
    for (const b of boxes) {
      if (b.max.y <= FEET + STEP || b.min.y >= FEET + H) continue;
      const dx = x - clamp(x, b.min.x, b.max.x);
      const dz = z - clamp(z, b.min.z, b.max.z);
      if (dx * dx + dz * dz < R * R) return true;
    }
    return false;
  };

  const STEP_G = 0.15, X0 = -6, Z0 = -8, NX = Math.round(12 / STEP_G) + 1, NZ = Math.round(16 / STEP_G) + 1;
  const idx = (i, j) => j * NX + i;
  const open = new Uint8Array(NX * NZ);
  let openCount = 0;
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      if (!blocked(X0 + i * STEP_G, Z0 + j * STEP_G)) { open[idx(i, j)] = 1; openCount++; }
    }
  }

  const si = Math.round((0 - X0) / STEP_G), sj = Math.round((4 - Z0) / STEP_G);
  const spawnBlocked = !open[idx(si, sj)];
  const seen = new Uint8Array(NX * NZ);
  const queue = [];
  if (!spawnBlocked) { seen[idx(si, sj)] = 1; queue.push([si, sj]); }
  let head = 0, reach = queue.length;
  while (head < queue.length) {
    const [i, j] = queue[head++];
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= NX || nj >= NZ) continue;
      const k = idx(ni, nj);
      if (seen[k] || !open[k]) continue;
      seen[k] = 1; reach++; queue.push([ni, nj]);
    }
  }

  // Reachability of every registered interaction target: nearest standing spot to its bounds.
  const V = sc.player.rig.position.constructor;
  const B3 = boxes[0].constructor;
  const targets = sc.interaction.interactables.map((it) => {
    const b = new B3().setFromObject(it.object);
    let best = Infinity, at = null;
    for (let j = 0; j < NZ; j++) {
      for (let i = 0; i < NX; i++) {
        if (!seen[idx(i, j)]) continue;
        const x = X0 + i * STEP_G, z = Z0 + j * STEP_G;
        // Eye-height point against the target's box, matching the interaction raycast's origin.
        const dx = x - clamp(x, b.min.x, b.max.x);
        const dy = 1.7 - clamp(1.7, b.min.y, b.max.y);
        const dz = z - clamp(z, b.min.z, b.max.z);
        const d = Math.hypot(dx, dy, dz);
        if (d < best) { best = d; at = [+x.toFixed(2), +z.toFixed(2)]; }
      }
    }
    return {
      label: typeof it.label === 'function' ? it.label() : it.label,
      range: it.range,
      nearest: +best.toFixed(2),
      standAt: at,
      ok: best <= it.range,
    };
  });

  // ASCII plan of the deck, so a phantom obstacle hanging over open floor is visible at a glance
  // rather than hiding inside a cell count.
  const map = [];
  for (let j = NZ - 1; j >= 0; j--) {
    let row = (Z0 + j * STEP_G).toFixed(1).padStart(6) + ' ';
    for (let i = 0; i < NX; i++) row += seen[idx(i, j)] ? '.' : (open[idx(i, j)] ? '?' : '#');
    map.push(row);
  }
  return { colliders: boxes.length, gridCells: NX * NZ, openCount, reach, spawnBlocked, targets, map };
});

console.log(`colliders=${out.colliders}  grid=${out.gridCells}  open=${out.openCount}  reachable-from-spawn=${out.reach}`);
console.log(`spawn blocked: ${out.spawnBlocked ? 'YES  <-- FAIL' : 'no'}`);
if (out.openCount !== out.reach) console.log(`WARNING: ${out.openCount - out.reach} open cells are cut off from spawn`);
for (const t of out.targets) {
  console.log(`  ${t.ok ? 'OK  ' : 'FAIL'} "${t.label}"  nearest standing spot ${t.nearest}m (range ${t.range}) at ${JSON.stringify(t.standAt)}`);
}
if (process.argv.includes('--map')) {
  console.log('');
  console.log('  reachable "."   blocked "#"   open but cut off from spawn "?"   (rows +Z at top, cols -X left)');
  for (const row of out.map) console.log(row);
}
await browser.close();
