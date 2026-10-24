// Drives the real PlayerController into every wall it can reach and reports where the player gets
// inside something. For each scene: flood-fills the floor the player can walk to (ladders included,
// doors opened, fans stopped), picks the spots near an obstacle, and from each one walks, sprints
// and jump-sprints in 8 directions, at 60 fps and at the engine's 10 fps floor (Engine clamps dt
// to 0.1). Every pose the player passes through is then checked against:
//   - the colliders: the capsule should never overlap one (a door or fall that traps the player);
//   - the hull (the Wren only): the player should never leave the room;
//   - the visible geometry, triangle by triangle: a body that passes into a mesh means the mesh has
//     no collider there, and a mesh within 0.12 m of the eye is the camera clipping into it.
// Ground cover on Kethra (kit batches, instanced or merged, not marked `collides`) is walk-through by design and is
// left out, as are the floors themselves, skinned characters and the sky dome.
//
//   npm run build && npx vite preview --port 4180 --strictPort   (in another terminal)
//   node tools/wall-sweep.mjs [baseUrl] [ship] [kethra] [vessek] [--starts N] [--json out.json]
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const BASE = args.find((a) => a.startsWith('http')) ?? 'http://localhost:4180/kethra-adventure/';
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const scenes = ['ship', 'kethra', 'vessek'].filter((s) => args.includes(s));
if (!scenes.length) scenes.push('ship', 'kethra', 'vessek');
const startsArg = opt('--starts', null);
const jsonOut = opt('--json', null);

const SCENES = {
  ship: { kind: 'ShipInteriorScene', query: 'newGame=1&skipIntro=1&unlockKethra=1', grid: 0.25, hull: { x: 6, z: 8 }, starts: 700 },
  kethra: { kind: 'KethraScene', query: 'newGame=1&skipIntro=1&unlockVessek=1&jump=kethra', grid: 0.4, hull: null, starts: 300 },
  vessek: { kind: 'VessekScene', query: 'newGame=1&skipIntro=1&unlockVessek=1&jump=vessek', grid: 0.3, hull: null, starts: 500 },
};

/** Runs in the page. Everything it needs comes off the scene's own objects. */
async function sweep(cfg) {
  const D = window.__DEBUG__;
  const s = D.engine.getCurrentScene();
  const p = s.player;
  // The sweep is the only thing that moves the player from here on.
  D.engine.stop();
  p.enabled = true;
  const V3 = p.rig.position.constructor;
  const B3 = p.colliders[0].box.constructor;
  const RC = p.raycaster.constructor;
  const R = 0.35, H = 1.8, CH = 1.1, STEP = 0.25, MAX_UP = 0.45;
  const spawn = p.rig.position.clone();
  const spawnYaw = p.yaw;
  const t0 = performance.now();

  // Every room open: doors open, fans off.
  if (s.rooms) {
    for (const d of [s.rooms.hatch, s.rooms.keypadDoor, s.rooms.grate]) {
      d.setOpen(true);
      d.update?.(10);
    }
    s.syncDoorColliders();
    // Off, a fan folds against the duct's wall on its hinge (VessekScene.update), which this loop doesn't run.
    for (const f of s.dressing?.ductFans ?? []) {
      f.collider.makeEmpty();
      f.hinge.rotation.y = Math.PI / 2;
      f.hinge.updateMatrixWorld(true);
    }
  }
  const boxes = p.colliders.map((c) => c.box).filter((b) => !b.isEmpty());
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const hitBox = (b, x, z, feet, h) => {
    if (b.max.y <= feet + STEP || b.min.y >= feet + h) return false;
    const dx = x - clamp(x, b.min.x, b.max.x);
    const dz = z - clamp(z, b.min.z, b.max.z);
    return dx * dx + dz * dz < R * R;
  };
  const blocked = (x, z, feet, h) => {
    for (const b of boxes) if (hitBox(b, x, z, feet, h)) return true;
    return false;
  };

  // ---- floor levels per column: every upward-facing surface under it, top first
  const bounds = new B3().makeEmpty();
  for (const f of p.floorTargets) {
    const b = new B3().setFromObject(f);
    if (b.isEmpty() || b.max.x - b.min.x > 100 || b.max.z - b.min.z > 100) continue;
    bounds.union(b);
  }
  const G = cfg.grid;
  const X0 = Math.floor(bounds.min.x) - 1, Z0 = Math.floor(bounds.min.z) - 1;
  const NX = Math.round((Math.ceil(bounds.max.x) + 1 - X0) / G) + 1;
  const NZ = Math.round((Math.ceil(bounds.max.z) + 1 - Z0) / G) + 1;
  const cx = (i) => X0 + i * G, cz = (j) => Z0 + j * G;
  const top = bounds.max.y + 5;
  const ray = new RC();
  ray.far = top - bounds.min.y + 30;
  const down = new V3(0, -1, 0), o = new V3(), n = new V3();
  const levels = new Array(NX * NZ);
  const inLadder = (L, x, z) => x > L.min.x && x < L.max.x && z > L.min.z && z < L.max.z;
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      const x = cx(i), z = cz(j);
      ray.set(o.set(x, top, z), down);
      const ys = [];
      for (const h of ray.intersectObjects(p.floorTargets, true)) {
        if (!h.face) continue;
        n.copy(h.face.normal).transformDirection(h.object.matrixWorld);
        if (n.y < 0.3) continue;
        if (ys.length && Math.abs(ys[ys.length - 1] - h.point.y) < 0.05) continue;
        ys.push(h.point.y);
      }
      for (const L of p.ladders) if (inLadder(L, x, z) && !ys.some((y) => Math.abs(y - L.max.y) < 0.05)) ys.push(L.max.y);
      ys.sort((a, b) => b - a);
      levels[j * NX + i] = ys;
    }
  }
  // What the controller stands on at a column from feet height y: its ray starts 2 m up, reaches 10.
  const floorFrom = (c, y) => {
    for (const lv of levels[c]) if (lv <= y + 2 + 1e-4) return lv >= y + 2 - 10 ? lv : null;
    return null;
  };
  const levelIndex = (c, y) => levels[c].findIndex((lv) => Math.abs(lv - y) < 0.03);

  // ---- walkable nodes reachable from the spawn
  const key = (c, l) => c * 16 + l;
  const seen = new Set();
  const queue = [];
  const si = Math.round((spawn.x - X0) / G), sj = Math.round((spawn.z - Z0) / G);
  const sc = sj * NX + si;
  const sy = floorFrom(sc, spawn.y);
  if (sy !== null) {
    seen.add(key(sc, levelIndex(sc, sy)));
    queue.push([si, sj, sy]);
  }
  const open = (x, z, y) => !blocked(x, z, y, CH);
  const step = (i, j, y, ni, nj) => {
    if (ni < 0 || nj < 0 || ni >= NX || nj >= NZ) return null;
    const c = nj * NX + ni;
    const x = cx(ni), z = cz(nj);
    if (blocked(x, z, y, CH)) return null;
    const f = floorFrom(c, y);
    if (f === null || f - y > MAX_UP || !open(x, z, f)) return null;
    return f;
  };
  for (let q = 0; q < queue.length; q++) {
    const [i, j, y] = queue[q];
    const next = [];
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const f = step(i, j, y, i + di, j + dj);
      if (f !== null) next.push([i + di, j + dj, f]);
    }
    // A ladder joins its foot to its top.
    for (const L of p.ladders) {
      if (!inLadder(L, cx(i), cz(j))) continue;
      if (Math.abs(y - L.min.y) < 0.1) next.push([i, j, L.max.y]);
      if (Math.abs(y - L.max.y) < 0.1) {
        const f = levels[j * NX + i].find((lv) => Math.abs(lv - L.min.y) < 0.1);
        if (f !== undefined) next.push([i, j, f]);
      }
    }
    for (const [ni, nj, f] of next) {
      const c = nj * NX + ni;
      const k = key(c, levelIndex(c, f));
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push([ni, nj, f]);
    }
  }
  const reachable = queue;

  // ---- starts: reachable spots with something in the way within half a metre
  const near = Math.max(1, Math.round(0.5 / G));
  const walls = reachable.filter(([i, j, y]) => {
    for (let dj = -near; dj <= near; dj++) {
      for (let di = -near; di <= near; di++) {
        if (!di && !dj) continue;
        if (step(i, j, y, i + di, j + dj) === null) return true;
      }
    }
    return false;
  });
  const every = Math.max(1, walls.length / cfg.maxStarts);
  const starts = [];
  for (let k = 0; k < walls.length; k += every) starts.push(walls[Math.floor(k)]);

  // ---- trials
  const keyEvt = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code }));
  const poses = new Map();
  const inside = new Map();
  const outOfHull = [];
  const notWalkable = new Map();
  const reachKeys = seen;
  let frames = 0;
  let respawns = 0;
  let fell = false;
  const onFellOut = p.onFellOut;
  p.onFellOut = () => {
    fell = true;
    respawns++;
  };
  // Climbing skips collision on purpose (the shaft keeps the player a radius off its walls), and a
  // pose 1 cm or less into a box is the shaft's clamp meeting a wall exactly.
  const depthInto = (b, x, z) => {
    const dx = x - clamp(x, b.min.x, b.max.x);
    const dz = z - clamp(z, b.min.z, b.max.z);
    if (dx || dz) return R - Math.hypot(dx, dz);
    return R + Math.min(x - b.min.x, b.max.x - x, z - b.min.z, b.max.z - z);
  };
  const onLadder = (q) => p.ladders.some((L) => inLadder(L, q.x, q.z) && q.y >= L.min.y - 0.05 && q.y <= L.max.y + 0.05);
  let quiet = false;
  const record = (trialName) => {
    const q = p.rig.position;
    if (quiet || onLadder(q)) return;
    const crouch = p.crouching;
    const k = `${Math.round(q.x * 10)},${Math.round(q.y * 10)},${Math.round(q.z * 10)},${crouch ? 1 : 0}`;
    if (!poses.has(k)) poses.set(k, { x: q.x, y: q.y, z: q.z, eye: p.camera.position.y, crouch, air: !p.onGround, trial: trialName });
    const h = crouch ? CH : H;
    for (let b = 0; b < boxes.length; b++) {
      const box = boxes[b];
      if (box.max.y <= q.y + STEP || box.min.y >= q.y + h || depthInto(box, q.x, q.z) <= 0.01) continue;
      // Head only: the standing capsule overlaps but a crouched one wouldn't (the controller crouches
      // on the next frame).
      const head = !hitBox(box, q.x, q.z, q.y, CH);
      const k = `${b}${head ? 'h' : ''}`;
      const prev = inside.get(k);
      if (!prev) inside.set(k, { b, count: 1, at: [q.x, q.y, q.z].map((v) => +v.toFixed(2)), trial: trialName, head });
      else prev.count++;
    }
    if (cfg.hull && (Math.abs(q.x) > cfg.hull.x || Math.abs(q.z) > cfg.hull.z) && outOfHull.length < 20) outOfHull.push({ at: [q.x, q.y, q.z].map((v) => +v.toFixed(2)), trial: trialName });
  };
  // A reachable node within a cell, at about the same height (slopes and grid rounding), counts.
  const walkable = (x, y, z) => {
    const i = Math.round((x - X0) / G), j = Math.round((z - Z0) / G);
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= NX || jj >= NZ) continue;
        const c = jj * NX + ii;
        const lv = levels[c];
        for (let l = 0; l < lv.length; l++) if (Math.abs(lv[l] - y) < 0.3 && reachKeys.has(key(c, l))) return true;
      }
    }
    return false;
  };
  const landed = (trialName) => {
    const q = p.rig.position;
    if (quiet || fell || !p.onGround || onLadder(q) || walkable(q.x, q.y, q.z)) return;
    const k = `${Math.round(q.x)},${Math.round(q.y * 2) / 2},${Math.round(q.z)}`;
    const prev = notWalkable.get(k);
    if (!prev) notWalkable.set(k, { count: 1, at: [q.x, q.y, q.z].map((v) => +v.toFixed(2)), trial: trialName });
    else prev.count++;
  };
  const trial = (x, y, z, yaw, dt, count, jump, sprint, name) => {
    p.enabled = true;
    p.teleport(new V3(x, y + 0.01, z), yaw);
    p.onGround = true;
    // Somewhere only a crouch fits, the player crouch-walked in, so the view is already down.
    const crouchOnly = blocked(x, z, y, H);
    p.crouching = crouchOnly;
    p.crouchAmount = crouchOnly ? 1 : 0;
    p.jumpBufferedFor = 0;
    p.sinceGrounded = 0;
    p.update(1 / 60);
    keyEvt('KeyW', true);
    if (sprint) keyEvt('ShiftLeft', true);
    fell = false;
    for (let f = 0; f < count; f++) {
      // Space held: the controller's own jump code fires at every chance it gets.
      if (jump) p.jumpBufferedFor = 0.12 + dt;
      p.update(dt);
      frames++;
      record(name);
      landed(name);
      if (fell) break;
    }
    keyEvt('KeyW', false);
    if (sprint) keyEvt('ShiftLeft', false);
  };
  const variants = [
    ['jump-sprint 60fps', 1 / 60, 75, true, true],
    ['jump-sprint 10fps', 0.1, 14, true, true],
    ['sprint 10fps', 0.1, 10, false, true],
    ['walk 60fps', 1 / 60, 40, false, false],
  ];
  for (const [i, j, y] of starts) {
    for (let d = 0; d < 8; d++) {
      const yaw = (d * Math.PI) / 4;
      for (const [vn, dt, count, jump, sprint] of variants) trial(cx(i), y, cz(j), yaw, dt, count, jump, sprint, `${vn} from (${cx(i).toFixed(2)}, ${y.toFixed(2)}, ${cz(j).toFixed(2)}) yaw ${d * 45}`);
    }
  }
  // ---- from every landing walking can't reach: is there a way back (walking, jumping, or falling
  // to the respawn)? Straight lines only, so a spot reported here still wants a look by hand.
  const stuck = [];
  quiet = true;
  for (const nw of notWalkable.values()) {
    const [x, y, z] = nw.at;
    let out = false;
    for (let d = 0; d < 16 && !out; d++) {
      for (const [dt, count, jump, sprint] of [[1 / 60, 150, false, false], [1 / 60, 150, true, true]]) {
        trial(x, y, z, (d * Math.PI) / 8, dt, count, jump, sprint, 'escape');
        const q = p.rig.position;
        if (fell || (p.onGround && walkable(q.x, q.y, q.z))) {
          out = true;
          break;
        }
      }
    }
    nw.escapes = out;
    if (!out) stuck.push(nw);
  }
  quiet = false;
  p.onFellOut = onFellOut;
  const tTrials = performance.now();

  // ---- visible geometry, binned in 0.5 m cells
  const region = new B3().makeEmpty();
  for (const [i, j, y] of reachable) region.expandByPoint(o.set(cx(i), y, cz(j)));
  region.min.x -= 1.5; region.min.z -= 1.5; region.max.x += 1.5; region.max.z += 1.5;
  region.max.y += 3.2;
  const skip = new Set();
  for (const f of p.floorTargets) f.traverse((x) => skip.add(x));
  p.rig.traverse((x) => skip.add(x));
  const shown = (obj) => {
    for (let q = obj; q; q = q.parent) if (!q.visible) return false;
    return true;
  };
  const owners = [];
  let tri = new Float32Array(9 * 65536);
  let triBox = new Float32Array(6 * 65536);
  let triOwner = new Int32Array(65536);
  let nTri = 0;
  const CELL = 0.5;
  const cells = new Map();
  const ckey = (ix, iy, iz) => (ix + 2048) * 16777216 + (iz + 2048) * 4096 + (iy + 2048);
  const mat4 = s.scene.matrixWorld.constructor;
  const m = new mat4(), mi = new mat4();
  const v = new V3();
  const wb = new B3();
  let skippedSkinned = 0;
  s.scene.updateMatrixWorld(true);
  s.scene.traverse((obj) => {
    if (!obj.isMesh || skip.has(obj) || !shown(obj)) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    if (mats.every((mt) => !mt || mt.visible === false)) return;
    if (obj.isSkinnedMesh) {
      skippedSkinned++;
      return;
    }
    if ((obj.isInstancedMesh || obj.userData.kit) && cfg.name === 'kethra' && obj.userData.collides !== true) return;
    // The sky dome rides on the camera to stay at infinity (galaxy/spaceSky.ts).
    if (obj.parent?.name === 'space-sky') return;
    const g = obj.geometry;
    const pos = g.attributes.position;
    if (!pos) return;
    if (!g.boundingBox) g.computeBoundingBox();
    const idx = g.index;
    const triCount = idx ? idx.count / 3 : pos.count / 3;
    const instances = obj.isInstancedMesh ? obj.count : 1;
    for (let inst = 0; inst < instances; inst++) {
      if (obj.isInstancedMesh) {
        obj.getMatrixAt(inst, mi);
        m.multiplyMatrices(obj.matrixWorld, mi);
      } else m.copy(obj.matrixWorld);
      wb.copy(g.boundingBox).applyMatrix4(m);
      if (!wb.intersectsBox(region)) continue;
      const owner = owners.length;
      const mt = mats[0];
      owners.push({
        name: obj.name || obj.parent?.name || '(unnamed)',
        material: mt?.name || mt?.type,
        type: mt?.type,
        transparent: !!mt?.transparent,
        instanced: !!obj.isInstancedMesh,
        box: [wb.min.x, wb.min.y, wb.min.z, wb.max.x, wb.max.y, wb.max.z].map((x) => +x.toFixed(2)),
      });
      const world = new Float32Array(pos.count * 3);
      for (let k = 0; k < pos.count; k++) {
        v.fromBufferAttribute(pos, k).applyMatrix4(m);
        world[k * 3] = v.x;
        world[k * 3 + 1] = v.y;
        world[k * 3 + 2] = v.z;
      }
      for (let t = 0; t < triCount; t++) {
        const a = idx ? idx.getX(t * 3) : t * 3, b = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, c = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
        if (nTri * 9 + 9 > tri.length) {
          const bigger = new Float32Array(tri.length * 2);
          bigger.set(tri);
          tri = bigger;
          const biggerB = new Float32Array(triBox.length * 2);
          biggerB.set(triBox);
          triBox = biggerB;
          const biggerO = new Int32Array(triOwner.length * 2);
          biggerO.set(triOwner);
          triOwner = biggerO;
        }
        const base = nTri * 9;
        for (const [slot, vi] of [[0, a], [3, b], [6, c]]) {
          tri[base + slot] = world[vi * 3];
          tri[base + slot + 1] = world[vi * 3 + 1];
          tri[base + slot + 2] = world[vi * 3 + 2];
        }
        const minX = Math.min(tri[base], tri[base + 3], tri[base + 6]), maxX = Math.max(tri[base], tri[base + 3], tri[base + 6]);
        const minY = Math.min(tri[base + 1], tri[base + 4], tri[base + 7]), maxY = Math.max(tri[base + 1], tri[base + 4], tri[base + 7]);
        const minZ = Math.min(tri[base + 2], tri[base + 5], tri[base + 8]), maxZ = Math.max(tri[base + 2], tri[base + 5], tri[base + 8]);
        if (maxX < region.min.x || minX > region.max.x || maxZ < region.min.z || minZ > region.max.z || maxY < region.min.y || minY > region.max.y) continue;
        // A triangle the size of a room (a slab, a sky dome) would land in thousands of cells: test it
        // only if it is plausibly in reach, and clamp its cells to the region.
        const ix0 = Math.floor(Math.max(minX, region.min.x) / CELL), ix1 = Math.floor(Math.min(maxX, region.max.x) / CELL);
        const iy0 = Math.floor(Math.max(minY, region.min.y) / CELL), iy1 = Math.floor(Math.min(maxY, region.max.y) / CELL);
        const iz0 = Math.floor(Math.max(minZ, region.min.z) / CELL), iz1 = Math.floor(Math.min(maxZ, region.max.z) / CELL);
        if ((ix1 - ix0 + 1) * (iy1 - iy0 + 1) * (iz1 - iz0 + 1) > 4000) continue;
        triOwner[nTri] = owner;
        triBox.set([minX, minY, minZ, maxX, maxY, maxZ], nTri * 6);
        for (let ix = ix0; ix <= ix1; ix++) for (let iy = iy0; iy <= iy1; iy++) for (let iz = iz0; iz <= iz1; iz++) {
          const k = ckey(ix, iy, iz);
          let list = cells.get(k);
          if (!list) cells.set(k, (list = []));
          list.push(nTri);
        }
        nTri++;
      }
    }
  });

  // ---- capsule (and eye) against the triangles
  const stamp = new Int32Array(nTri);
  let stampId = 0;
  const poly = new Float32Array(30), poly2 = new Float32Array(30);
  // Clips triangle t to y0 <= y <= y1; returns the vertex count, the result in `poly` (x, y, z triples).
  const clip = (t, y0, y1) => {
    let cnt = 3;
    for (let k = 0; k < 9; k++) poly[k] = tri[t * 9 + k];
    for (const [plane, keepAbove] of [[y0, true], [y1, false]]) {
      let out = 0;
      for (let k = 0; k < cnt; k++) {
        const a = k * 3, b = ((k + 1) % cnt) * 3;
        const ya = poly[a + 1], yb = poly[b + 1];
        const ina = keepAbove ? ya >= plane : ya <= plane;
        const inb = keepAbove ? yb >= plane : yb <= plane;
        if (ina) {
          poly2[out * 3] = poly[a]; poly2[out * 3 + 1] = ya; poly2[out * 3 + 2] = poly[a + 2]; out++;
        }
        if (ina !== inb) {
          const f = (plane - ya) / (yb - ya);
          poly2[out * 3] = poly[a] + (poly[b] - poly[a]) * f; poly2[out * 3 + 1] = plane; poly2[out * 3 + 2] = poly[a + 2] + (poly[b + 2] - poly[a + 2]) * f; out++;
        }
      }
      cnt = out;
      for (let k = 0; k < cnt * 3; k++) poly[k] = poly2[k];
      if (!cnt) return 0;
    }
    return cnt;
  };
  // Horizontal distance from (x, z) to the clipped polygon's footprint (0 if over it).
  const dist2D = (cnt, x, z) => {
    let best = Infinity, pos = 0, neg = 0;
    for (let k = 0; k < cnt; k++) {
      const ax = poly[k * 3], az = poly[k * 3 + 2];
      const bx = poly[((k + 1) % cnt) * 3], bz = poly[((k + 1) % cnt) * 3 + 2];
      const ex = bx - ax, ez = bz - az;
      const len2 = ex * ex + ez * ez;
      const u = len2 > 1e-12 ? clamp(((x - ax) * ex + (z - az) * ez) / len2, 0, 1) : 0;
      const dx = ax + ex * u - x, dz = az + ez * u - z;
      best = Math.min(best, Math.hypot(dx, dz));
      const cr = ex * (z - az) - ez * (x - ax);
      if (cr > 1e-9) pos++;
      else if (cr < -1e-9) neg++;
    }
    if (cnt >= 3 && (pos === 0 || neg === 0) && pos + neg >= 3) return 0;
    return best;
  };
  // Closest distance from point (px, py, pz) to triangle t.
  const pointTri = (t, px, py, pz) => {
    const b = t * 9;
    const ax = tri[b], ay = tri[b + 1], az = tri[b + 2];
    const abx = tri[b + 3] - ax, aby = tri[b + 4] - ay, abz = tri[b + 5] - az;
    const acx = tri[b + 6] - ax, acy = tri[b + 7] - ay, acz = tri[b + 8] - az;
    const apx = px - ax, apy = py - ay, apz = pz - az;
    const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
    const at = (u, w) => Math.hypot(ax + abx * u + acx * w - px, ay + aby * u + acy * w - py, az + abz * u + acz * w - pz);
    if (d1 <= 0 && d2 <= 0) return at(0, 0);
    const bpx = px - tri[b + 3], bpy = py - tri[b + 4], bpz = pz - tri[b + 5];
    const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
    if (d3 >= 0 && d4 <= d3) return at(1, 0);
    const vc = d1 * d4 - d3 * d2;
    if (vc <= 0 && d1 >= 0 && d3 <= 0) return at(d1 / (d1 - d3), 0);
    const cpx = px - tri[b + 6], cpy = py - tri[b + 7], cpz = pz - tri[b + 8];
    const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
    if (d6 >= 0 && d5 <= d6) return at(0, 1);
    const vb = d5 * d2 - d1 * d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0) return at(0, d2 / (d2 - d6));
    const va = d3 * d6 - d5 * d4;
    if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
      const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
      return at(1 - w, w);
    }
    const den = 1 / (va + vb + vc);
    return at(vb * den, vc * den);
  };
  const BODY_R = 0.3, EYE_R = 0.12;
  const hits = new Map();
  for (const ps of poses.values()) {
    const h = ps.crouch ? CH : H;
    const eyeY = ps.y + ps.eye;
    const y0 = ps.y + 0.3, y1 = ps.y + h;
    stampId++;
    const yTop = Math.max(y1, eyeY + EYE_R);
    const ix0 = Math.floor((ps.x - BODY_R) / CELL), ix1 = Math.floor((ps.x + BODY_R) / CELL);
    const iy0 = Math.floor(y0 / CELL), iy1 = Math.floor(yTop / CELL);
    const iz0 = Math.floor((ps.z - BODY_R) / CELL), iz1 = Math.floor((ps.z + BODY_R) / CELL);
    for (let ix = ix0; ix <= ix1; ix++) for (let iy = iy0; iy <= iy1; iy++) for (let iz = iz0; iz <= iz1; iz++) {
      const list = cells.get(ckey(ix, iy, iz));
      if (!list) continue;
      for (const t of list) {
        if (stamp[t] === stampId) continue;
        stamp[t] = stampId;
        const tb = t * 6;
        if (triBox[tb] > ps.x + BODY_R || triBox[tb + 3] < ps.x - BODY_R || triBox[tb + 2] > ps.z + BODY_R || triBox[tb + 5] < ps.z - BODY_R || triBox[tb + 1] > yTop || triBox[tb + 4] < y0) continue;
        const eye = pointTri(t, ps.x, eyeY, ps.z);
        const cnt = clip(t, y0, y1);
        const body = cnt ? dist2D(cnt, ps.x, ps.z) : Infinity;
        if (body >= BODY_R && eye >= EYE_R) continue;
        const ow = triOwner[t];
        let hit = hits.get(ow);
        if (!hit) hits.set(ow, (hit = { poses: new Set(), body: Infinity, eye: Infinity, at: null, eyeAt: null, air: false, trial: null, samples: new Map() }));
        hit.poses.add(ps);
        // A few spots per mesh, a metre apart, to find where on a big merged mesh the hits are.
        const cellKey = `${Math.round(ps.x)},${Math.round(ps.z)}`;
        if (hit.samples.size < 8 && !hit.samples.has(cellKey) && (body < BODY_R * 0.5 || eye < EYE_R)) hit.samples.set(cellKey, { at: [ps.x, ps.y, ps.z].map((x) => +x.toFixed(2)), body: +Math.min(body, 9).toFixed(2), eye: +Math.min(eye, 9).toFixed(2), air: ps.air });
        if (body < hit.body) {
          hit.body = body;
          hit.at = [ps.x, ps.y, ps.z].map((x) => +x.toFixed(2));
          hit.air = ps.air;
          hit.trial = ps.trial;
        }
        if (eye < hit.eye) {
          hit.eye = eye;
          hit.eyeAt = [ps.x, ps.y, ps.z].map((x) => +x.toFixed(2));
        }
      }
    }
  }
  const geometry = [...hits.entries()]
    .map(([ow, hit]) => ({ ...owners[ow], poses: hit.poses.size, body: +hit.body.toFixed(3), eye: +hit.eye.toFixed(3), at: hit.at, eyeAt: hit.eye < EYE_R ? hit.eyeAt : null, air: hit.air, trial: hit.trial, samples: [...hit.samples.values()] }))
    .sort((a, b) => b.poses - a.poses);

  // Put things back.
  p.teleport(spawn, spawnYaw);
  if (s.rooms) s.syncDoorColliders();
  D.engine.start();

  return {
    scene: s.kind,
    colliders: boxes.length,
    floorBounds: [bounds.min.x, bounds.min.y, bounds.min.z, bounds.max.x, bounds.max.y, bounds.max.z].map((x) => +x.toFixed(1)),
    reachable: reachable.length,
    wallSpots: walls.length,
    starts: starts.length,
    trials: starts.length * 8 * variants.length,
    frames,
    poses: poses.size,
    triangles: nTri,
    skippedSkinned,
    seconds: { trials: +((tTrials - t0) / 1000).toFixed(1), total: +((performance.now() - t0) / 1000).toFixed(1) },
    inside: [...inside.values()].map((x) => ({ box: [boxes[x.b].min.x, boxes[x.b].min.y, boxes[x.b].min.z, boxes[x.b].max.x, boxes[x.b].max.y, boxes[x.b].max.z].map((v) => +v.toFixed(2)), ...x })),
    outOfHull,
    respawns,
    notWalkable: [...notWalkable.values()].sort((a, b) => b.count - a.count),
    stuck,
    geometry,
  };
}

const browser = await chromium.launch({
  args: ['--use-angle=d3d11', '--enable-gpu', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
const all = {};
let problems = 0;
for (const name of scenes) {
  const cfg = SCENES[name];
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}?${cfg.query}&tier=low&nobatch=1&seed=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction((k) => {
    const s = window.__DEBUG__?.engine.getCurrentScene();
    if (s?.kind === 'CanopyScene' && s.state?.().phase === 'fly') window.__DEBUG__.miniGame()?.win();
    return s?.kind === k && !!s.player && !window.__DEBUG__.flow.isTransitioning();
  }, cfg.kind, { timeout: 300000, polling: 250 });
  await page.waitForTimeout(1500);
  const out = await page.evaluate(sweep, { ...cfg, name, maxStarts: startsArg ? Number(startsArg) : cfg.starts });
  all[name] = out;
  console.log(`\n== ${out.scene}: ${out.colliders} colliders, ${out.reachable} walkable spots (${out.wallSpots} by an obstacle), ${out.trials} trials, ${out.frames} frames, ${out.poses} poses, ${out.triangles} triangles; ${out.seconds.trials} s + ${(out.seconds.total - out.seconds.trials).toFixed(1)} s`);
  console.log(`   inside a collider: ${out.inside.length ? '' : 'never'}`);
  for (const x of out.inside.slice(0, 12)) console.log(`     ${x.head ? 'head in' : 'body in'} box ${JSON.stringify(x.box)} x${x.count}, first at ${JSON.stringify(x.at)} (${x.trial})`);
  if (out.inside.length) problems++;
  if (cfg.hull) {
    console.log(`   outside the hull: ${out.outOfHull.length ? '' : 'never'}`);
    for (const x of out.outOfHull.slice(0, 5)) console.log(`     at ${JSON.stringify(x.at)} (${x.trial})`);
    if (out.outOfHull.length) problems++;
  }
  console.log(`   fell out and respawned: ${out.respawns} times`);
  console.log(`   landed somewhere walking can't reach: ${out.notWalkable.length ? `${out.notWalkable.length} spots, ${out.stuck.length} with no way back found` : 'never'}`);
  const shown = [...out.stuck.slice(0, 12), ...out.notWalkable.filter((x) => x.escapes).slice(0, 6)];
  for (const x of shown) console.log(`     ${x.escapes ? 'way back' : 'STUCK   '} x${x.count} at ${JSON.stringify(x.at)} (${x.trial})`);
  if (out.stuck.length) problems++;
  const bodies = out.geometry.filter((g) => g.body < 0.3);
  const eyes = out.geometry.filter((g) => g.eye < 0.12);
  console.log(`   visible geometry inside the body (0.3 m): ${bodies.length} meshes; within 0.12 m of the eye: ${eyes.length}`);
  for (const g of out.geometry.slice(0, 40)) {
    console.log(`     ${String(g.poses).padStart(5)} poses  body ${g.body < 0.3 ? g.body.toFixed(2) : '  - '}  eye ${g.eye < 0.12 ? g.eye.toFixed(2) : '  - '}  ${g.name} [${g.material}${g.transparent ? ', transparent' : ''}${g.instanced ? ', instanced' : ''}] box ${JSON.stringify(g.box)} at ${JSON.stringify(g.at)}${g.air ? ' (airborne)' : ''}`);
  }
  if (errors.length) console.log(`   page errors: ${errors.slice(0, 3).join(' | ')}`);
  await page.close();
}
await browser.close();
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(all, null, 1));
process.exit(problems ? 1 : 0);
