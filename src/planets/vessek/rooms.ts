import * as THREE from 'three';
import { placeKitPiece, preloadKit } from '../../ship/interior/kit';
import { groundKitPiece } from '../../ship/interior/walls';
import { applyPbr } from '../../core/TextureLibrary';
import * as L from './layout';

/**
 * Vessek's school hold, tanker and junction rooms, the tubes and ducts between them, and the three
 * doors (tanker hatch, keypad door, bent duct grate), built from layout.ts. VessekScene builds the
 * hall itself; hallOpenings() adds its door frames, vent and colliders.
 */

export interface Door {
  object: THREE.Object3D;
  /** In the player's colliders while shut (emptied while open); `closedBox` is its shut extent. */
  collider: THREE.Box3;
  closedBox: THREE.Box3;
  open: boolean;
  setOpen(open: boolean): void;
  update(dt: number): void;
}

export interface Rooms {
  /** Floor targets for the player's raycast. */
  floors: THREE.Object3D[];
  colliders: THREE.Box3[];
  ladders: THREE.Box3[];
  hatch: Door;
  keypadDoor: Door;
  grate: Door;
  /** Kept out of batching: floors, doors, anything that moves or is interacted with. */
  noMerge: Set<THREE.Object3D>;
}

const WALL_THICK = 1.2;
const DOOR_HALF = 1.1;
const DOOR_TALL = 3;

const box3 = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) =>
  new THREE.Box3(new THREE.Vector3(Math.min(x0, x1), y0, Math.min(z0, z1)), new THREE.Vector3(Math.max(x0, x1), y1, Math.max(z0, z1)));

/** A box whose UVs are in `tile`-metre units, so a panel texture keeps its scale on any size. */
function panelBox(w: number, h: number, d: number, tile = 2): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) uv.setXY(f * 4 + i, (uv.getX(f * 4 + i) * dims[f][0]) / tile, (uv.getY(f * 4 + i) * dims[f][1]) / tile);
  return g;
}

/** Whether a bay has a tube door or a duct's mouth in it (so no wall piece). */
export function isOpenBay(bay: L.Bay): boolean {
  return openingAt(bay) !== null;
}

/** The opening in a bay (a tube door or a duct mouth), or null. */
function openingAt(bay: L.Bay): { kind: 'door' } | { kind: 'vent'; y: number } | null {
  const same = (b: L.Bay) => b.room === bay.room && b.wall === bay.wall && b.at === bay.at;
  if (L.TUBES.some((t) => same(t.a) || same(t.b))) return { kind: 'door' };
  for (const d of L.DUCTS) for (const m of d.mouths) if (same(m.bay)) return { kind: 'vent', y: m.y };
  return null;
}

/** Kit straight-wall position and yaw for a bay; matches the hall's table in walls.ts. */
function bayPlacement(room: L.Room, wall: L.Bay['wall'], at: number): { pos: [number, number, number]; yaw: number } {
  if (wall === 'west') return { pos: [room.x0 + 2, 0, at], yaw: 0 };
  if (wall === 'east') return { pos: [room.x1 - 2, 0, at], yaw: Math.PI };
  if (wall === 'north') return { pos: [at, 0, room.z0 + 2], yaw: -Math.PI / 2 };
  return { pos: [at, 0, room.z1 - 2], yaw: Math.PI / 2 };
}

export async function buildRooms(scene: THREE.Scene, mats: { wall: THREE.MeshStandardMaterial; ceiling: THREE.Material }): Promise<Rooms> {
  const pieces = ['Platform_Simple', 'Platform_DarkPlates', 'Platform_Metal', 'WallAstra_Straight', 'TopAstra_Straight', 'WallAstra_Corner_Square_Inner', 'TopCables_Corner_Square_Inner', 'Door_Frame_Square'];
  await preloadKit(pieces);
  const jobs: Promise<THREE.Object3D>[] = [];
  const place = (name: string, pos: [number, number, number], yaw = 0) => jobs.push(placeKitPiece(scene, name, pos, yaw).then(groundKitPiece));

  const floors: THREE.Object3D[] = [];
  const colliders: THREE.Box3[] = [];
  const noMerge = new Set<THREE.Object3D>();
  const hidden = new THREE.MeshBasicMaterial({ visible: false });
  const floorSlab = (x0: number, z0: number, x1: number, z1: number, y = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.2, z1 - z0), hidden);
    m.position.set((x0 + x1) / 2, y - 0.1, (z0 + z1) / 2);
    scene.add(m);
    floors.push(m);
    noMerge.add(m);
  };

  const cornerYaw: Record<string, number> = { '-1,-1': 0, '-1,1': Math.PI / 2, '1,-1': -Math.PI / 2, '1,1': Math.PI };
  for (const room of [L.ROOMS.school, L.ROOMS.tanker, L.ROOMS.junction]) {
    floorSlab(room.x0, room.z0, room.x1, room.z1);
    // Deck plating per 4 m cell; the tanker's centre aisle uses the dark plates.
    for (let x = room.x0 + 2; x < room.x1; x += 4) {
      for (let z = room.z0 + 2; z < room.z1; z += 4) {
        place(room.id === 'tanker' && Math.abs(x) < 3 ? 'Platform_DarkPlates' : room.id === 'junction' ? 'Platform_Metal' : 'Platform_Simple', [x, 0.001, z]);
      }
    }
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(room.x1 - room.x0, room.z1 - room.z0), mats.ceiling);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set((room.x0 + room.x1) / 2, room.ceiling, (room.z0 + room.z1) / 2);
    scene.add(ceil);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const pos: [number, number, number] = [sx < 0 ? room.x0 + 4 : room.x1 - 4, 0, sz < 0 ? room.z0 + 4 : room.z1 - 4];
        place('WallAstra_Corner_Square_Inner', pos, cornerYaw[`${sx},${sz}`]);
        place('TopCables_Corner_Square_Inner', pos, cornerYaw[`${sx},${sz}`]);
      }
    }
    for (const wall of ['north', 'south', 'east', 'west'] as const) roomWall(scene, room, wall, mats.wall, colliders, place, true);
  }

  // Tube corridors between hulls, with a strip light along the roof.
  const tubeMat = mats.wall;
  const stripMat = new THREE.MeshStandardMaterial({ color: 0x1a1d20, emissive: 0xe8e2d0, emissiveIntensity: 0.9 });
  for (const t of L.TUBES) {
    const a = L.bayPoint(t.a);
    const b = L.bayPoint(t.b);
    const alongX = Math.abs(b.x - a.x) > Math.abs(b.z - a.z);
    const len = alongX ? Math.abs(b.x - a.x) : Math.abs(b.z - a.z);
    const cx = (a.x + b.x) / 2;
    const cz = (a.z + b.z) / 2;
    const w = L.TUBE_WIDTH;
    const add = (geo: THREE.BufferGeometry, x: number, y: number, z: number, mat: THREE.Material = tubeMat) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.receiveShadow = true;
      scene.add(m);
      return m;
    };
    const across = alongX ? [len, 0.12, w] : [w, 0.12, len];
    add(panelBox(across[0], across[1], across[2]), cx, -0.06, cz);
    add(panelBox(across[0], across[1], across[2]), cx, L.TUBE_HEIGHT + 0.06, cz);
    const strip = alongX ? new THREE.BoxGeometry(len - 0.4, 0.04, 0.12) : new THREE.BoxGeometry(0.12, 0.04, len - 0.4);
    add(strip, cx, L.TUBE_HEIGHT - 0.02, cz, stripMat);
    for (const side of [-1, 1]) {
      const g = alongX ? panelBox(len, L.TUBE_HEIGHT, 0.12) : panelBox(0.12, L.TUBE_HEIGHT, len);
      add(g, cx + (alongX ? 0 : side * (w / 2 + 0.06)), L.TUBE_HEIGHT / 2, cz + (alongX ? side * (w / 2 + 0.06) : 0));
      colliders.push(alongX
        ? box3(Math.min(a.x, b.x), 0, cz + side * (w / 2), Math.max(a.x, b.x), L.TUBE_HEIGHT, cz + side * (w / 2 + 0.4))
        : box3(cx + side * (w / 2), 0, Math.min(a.z, b.z), cx + side * (w / 2 + 0.4), L.TUBE_HEIGHT, Math.max(a.z, b.z)));
    }
    floorSlab(alongX ? Math.min(a.x, b.x) - 0.5 : cx - w / 2, alongX ? cz - w / 2 : Math.min(a.z, b.z) - 0.5, alongX ? Math.max(a.x, b.x) + 0.5 : cx + w / 2, alongX ? cz + w / 2 : Math.max(a.z, b.z) + 0.5);
  }

  // The ducts: steel walls and roofs, grated floors, rungs up each shaft.
  const ductMat = new THREE.MeshStandardMaterial({ color: 0x3a4046, roughness: 0.55, metalness: 0.6 });
  applyPbr(ductMat, 'metal_plate', [1, 1]);
  const grateMat = new THREE.MeshStandardMaterial({ color: 0x2c3136, roughness: 0.5, metalness: 0.7 });
  applyPbr(grateMat, 'metal_plate_02', [1, 1]);
  for (const k of L.ductShell()) {
    const size = new THREE.Vector3(k.max.x - k.min.x, k.max.y - k.min.y, k.max.z - k.min.z);
    const m = new THREE.Mesh(panelBox(size.x, size.y, size.z, 1.3), k.kind === 'floor' ? grateMat : ductMat);
    m.position.set((k.min.x + k.max.x) / 2, (k.min.y + k.max.y) / 2, (k.min.z + k.max.z) / 2);
    m.castShadow = k.kind !== 'floor';
    m.receiveShadow = true;
    scene.add(m);
    if (k.kind === 'floor') {
      floors.push(m);
      noMerge.add(m);
    } else colliders.push(new THREE.Box3(new THREE.Vector3(k.min.x, k.min.y, k.min.z), new THREE.Vector3(k.max.x, k.max.y, k.max.z)));
  }
  const ladders: THREE.Box3[] = [];
  const rungMat = new THREE.MeshStandardMaterial({ color: 0xb08a3a, roughness: 0.45, metalness: 0.8 });
  for (const d of L.DUCTS) {
    for (const l of d.ladders) {
      const h = L.DUCT_WIDTH / 2;
      ladders.push(box3(l.x - h, 0, l.z - h, l.x + h, L.UPPER, l.z + h));
      const up = d.runs.find((r) => r.from.y === L.UPPER && Math.abs(r.from.x - l.x) < 1e-6 && Math.abs(r.from.z - l.z) < 1e-6)!;
      const dx = Math.sign(up.to.x - up.from.x);
      const dz = Math.sign(up.to.z - up.from.z);
      for (let y = 0.35; y < L.UPPER; y += 0.3) {
        const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.7, 6), rungMat);
        rung.rotation.set(dz !== 0 ? 0 : Math.PI / 2, 0, dz !== 0 ? Math.PI / 2 : 0);
        rung.position.set(l.x + dx * (h - 0.08), y, l.z + dz * (h - 0.08));
        scene.add(rung);
      }
    }
  }

  // The tanker hatch: a sliding leaf in the hall-tanker tube, at the tanker end.
  const tube = (id: L.Tube['id']) => L.TUBES.find((t) => t.id === id)!;
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x4a5058, roughness: 0.5, metalness: 0.7 });
  applyPbr(leafMat, 'metal_plate', [1, 1.5]);
  const hatch = slidingDoor(scene, L.bayPoint(tube('hall-tanker').b), 'z', leafMat, noMerge);
  const keypadDoor = slidingDoor(scene, L.bayPoint(tube('tanker-junction').b), 'x', leafMat, noMerge);
  // The short duct's bent grate, just inside its tanker mouth.
  const short = L.DUCTS.find((x) => x.id === 'short')!;
  const gp = short.runs[0].from;
  const grateObj = new THREE.Group();
  const bars = new THREE.MeshStandardMaterial({ color: 0x5a6068, roughness: 0.6, metalness: 0.7 });
  for (let i = 0; i < 6; i++) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, L.DUCT_HEIGHT, 5), bars);
    bar.position.set(0, L.DUCT_HEIGHT / 2, -L.DUCT_WIDTH / 2 + 0.15 + i * 0.2);
    bar.rotation.z = i === 2 || i === 3 ? 0.35 : 0;
    grateObj.add(bar);
  }
  grateObj.position.set(gp.x + 0.6, 0, gp.z);
  scene.add(grateObj);
  noMerge.add(grateObj);
  grateObj.traverse((o) => noMerge.add(o));
  const grateCollider = box3(gp.x + 0.45, 0, gp.z - L.DUCT_WIDTH / 2, gp.x + 0.75, L.DUCT_HEIGHT, gp.z + L.DUCT_WIDTH / 2);
  const grate: Door = {
    object: grateObj,
    collider: grateCollider,
    closedBox: grateCollider.clone(),
    open: false,
    setOpen(open) {
      this.open = open;
      // One-way: the two middle bars fold aside and are not restored on close.
      grateObj.children.forEach((b, i) => {
        if (open && i >= 2 && i <= 3) b.rotation.z = 1.3 * (i === 2 ? -1 : 1);
      });
    },
    update() {},
  };

  await Promise.all(jobs);
  return { floors, colliders, ladders, hatch, keypadDoor, grate, noMerge };
}

/**
 * One wall of a room: its kit bays (unless `kitWalls` is off: the hall places its own), a door frame
 * in each tube's bay, a vent panel in each duct's, and the wall's collider cut for every opening.
 */
function roomWall(scene: THREE.Scene, room: L.Room, wall: L.Bay['wall'], mat: THREE.MeshStandardMaterial, colliders: THREE.Box3[], place: (name: string, pos: [number, number, number], yaw?: number) => void, kitWalls: boolean): void {
  const f = L.faces(room);
  const alongX = wall === 'north' || wall === 'south';
  const [lo, hi] = alongX ? [room.x0, room.x1] : [room.z0, room.z1];
  const faceLine = wall === 'west' ? f.x0 : wall === 'east' ? f.x1 : wall === 'north' ? f.z0 : f.z1;
  const out = wall === 'west' || wall === 'north' ? -1 : 1;
  const cuts: { a: number; b: number; y0: number; y1: number }[] = [];
  for (let c = lo + 6; c <= hi - 6; c += 4) {
    const open = openingAt({ room: room.id, wall, at: c });
    if (!open) {
      if (kitWalls) {
        const p = bayPlacement(room, wall, c);
        place('WallAstra_Straight', p.pos, p.yaw);
        place('TopAstra_Straight', p.pos, p.yaw);
      }
      continue;
    }
    if (open.kind === 'door') {
      place('Door_Frame_Square', alongX ? [c, 0, faceLine] : [faceLine, 0, c], alongX ? 0 : Math.PI / 2);
      cuts.push({ a: c - DOOR_HALF, b: c + DOOR_HALF, y0: 0, y1: DOOR_TALL });
    } else {
      ventPanel(scene, mat, room, wall, c, faceLine, out, open.y);
      const hw = L.DUCT_WIDTH / 2;
      cuts.push({ a: c - hw, b: c + hw, y0: open.y, y1: open.y + L.DUCT_HEIGHT });
    }
  }
  wallCollider(colliders, alongX, faceLine, out, lo, hi, cuts);
}

/**
 * The hall's openings (the tube to the school, the tanker's tube, the hall duct): door frames and a
 * vent panel, and all four walls' colliders, cut for them. VessekScene places the hall's own walls.
 */
export async function hallOpenings(scene: THREE.Scene, mat: THREE.MeshStandardMaterial): Promise<THREE.Box3[]> {
  const jobs: Promise<THREE.Object3D>[] = [];
  const place = (name: string, pos: [number, number, number], yaw = 0) => jobs.push(placeKitPiece(scene, name, pos, yaw).then(groundKitPiece));
  const colliders: THREE.Box3[] = [];
  for (const wall of ['north', 'south', 'east', 'west'] as const) roomWall(scene, L.ROOMS.hall, wall, mat, colliders, place, false);
  await Promise.all(jobs);
  return colliders;
}

/** A room wall's collider: a slab behind the face, cut where the bays open. */
function wallCollider(out: THREE.Box3[], alongX: boolean, face: number, dir: number, lo: number, hi: number, cuts: { a: number; b: number; y0: number; y1: number }[]): void {
  const t0 = face;
  const t1 = face + dir * WALL_THICK;
  const H = 5;
  const push = (a: number, b: number, y0: number, y1: number) => {
    if (b - a < 1e-3 || y1 - y0 < 1e-3) return;
    out.push(alongX ? box3(a, y0, t0, b, y1, t1) : box3(t0, y0, a, t1, y1, b));
  };
  const sorted = [...cuts].sort((p, q) => p.a - q.a);
  let at = lo - 1;
  for (const c of sorted) {
    push(at, c.a, 0, H);
    push(c.a, c.b, 0, c.y0);
    push(c.a, c.b, c.y1, H);
    at = c.b;
  }
  push(at, hi + 1, 0, H);
}

/** Wall panels around a duct opening in a bay, plus a frame around the hole. */
function ventPanel(scene: THREE.Scene, mat: THREE.MeshStandardMaterial, room: L.Room, wall: L.Bay['wall'], at: number, face: number, dir: number, y: number): void {
  const alongX = wall === 'north' || wall === 'south';
  const hw = L.DUCT_WIDTH / 2 + L.DUCT_WALL;
  const top = y + L.DUCT_HEIGHT + L.DUCT_WALL;
  const bottom = Math.max(0, y - L.DUCT_WALL);
  const mid = face + (dir * WALL_THICK) / 2;
  const add = (a: number, b: number, y0: number, y1: number) => {
    if (b - a < 1e-3 || y1 - y0 < 1e-3) return;
    const g = alongX ? panelBox(b - a, y1 - y0, WALL_THICK) : panelBox(WALL_THICK, y1 - y0, b - a);
    const m = new THREE.Mesh(g, mat);
    m.position.set(alongX ? (a + b) / 2 : mid, (y0 + y1) / 2, alongX ? mid : (a + b) / 2);
    m.receiveShadow = true;
    m.castShadow = true;
    scene.add(m);
  };
  add(at - 2, at - hw, 0, room.ceiling);
  add(at + hw, at + 2, 0, room.ceiling);
  add(at - hw, at + hw, 0, bottom);
  add(at - hw, at + hw, top, room.ceiling);
  // Light frame around the opening so a duct is visible from across the room.
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xd8d2c0, roughness: 0.7 });
  const inner = face - dir * 0.02;
  for (const [a, b, y0, y1] of [[at - hw, at + hw, top - 0.06, top], [at - hw, at + hw, bottom, bottom + 0.06], [at - hw, at - hw + 0.06, bottom, top], [at + hw - 0.06, at + hw, bottom, top]] as const) {
    const g = alongX ? new THREE.BoxGeometry(b - a, y1 - y0, 0.04) : new THREE.BoxGeometry(0.04, y1 - y0, b - a);
    const m = new THREE.Mesh(g, frameMat);
    m.position.set(alongX ? (a + b) / 2 : inner, (y0 + y1) / 2, alongX ? inner : (a + b) / 2);
    scene.add(m);
  }
}

/** A sliding leaf across a tube's mouth: closed it fills the doorway, open it slides into the wall. */
function slidingDoor(scene: THREE.Scene, at: L.Vec, axis: 'x' | 'z', mat: THREE.Material, noMerge: Set<THREE.Object3D>): Door {
  const leaf = new THREE.Mesh(axis === 'z' ? panelBox(DOOR_HALF * 2, DOOR_TALL, 0.12, 1.5) : panelBox(0.12, DOOR_TALL, DOOR_HALF * 2, 1.5), mat);
  leaf.position.set(at.x, DOOR_TALL / 2, at.z);
  leaf.castShadow = true;
  scene.add(leaf);
  noMerge.add(leaf);
  const closedAt = leaf.position.clone();
  const collider = axis === 'z'
    ? box3(at.x - DOOR_HALF, 0, at.z - 0.15, at.x + DOOR_HALF, DOOR_TALL, at.z + 0.15)
    : box3(at.x - 0.15, 0, at.z - DOOR_HALF, at.x + 0.15, DOOR_TALL, at.z + DOOR_HALF);
  let slide = 1;
  return {
    object: leaf,
    collider,
    closedBox: collider.clone(),
    open: true,
    setOpen(open) {
      this.open = open;
    },
    update(dt) {
      slide += Math.sign((this.open ? 1 : 0) - slide) * Math.min(Math.abs((this.open ? 1 : 0) - slide), dt * 1.6);
      const off = slide * (DOOR_HALF * 2 - 0.1);
      leaf.position.copy(closedAt);
      if (axis === 'z') leaf.position.x += off;
      else leaf.position.z += off;
    },
  };
}
