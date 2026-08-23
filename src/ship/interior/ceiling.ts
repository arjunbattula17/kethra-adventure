import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildStencilPlacardTexture } from '../ShipTextures';
import type { InteriorCtx } from './ctx';
import { ROOM_W, ROOM_D, ROOM_H } from './ctx';
import {
  buildCeilingPlateTexture,
  buildCeilingPlateRoughness,
  buildCeilingPlateNormal,
  buildCorrugatedDeckTexture,
  buildCorrugatedDeckNormal,
  buildCorrugatedDeckRoughness,
  buildPaintedTrimTexture,
  buildPaintedTrimRoughness,
  buildDiffuserTexture,
  buildPipeSteelTexture,
  buildPipeRoughness,
  buildCeilingDripTexture,
  buildCeilingSootTexture,
  buildCeilingStreakTexture,
  buildGrilleTexture,
} from './ceilingTextures';

/* ------------------------------------------------------------------------------------------
 * Geometry batching
 *
 * The ceiling is roughly two thousand primitives — coffered deck bays, I-beam webs and
 * flanges, rivets, louvre slats, pipe flange bolts. Every one of them is transformed onto a
 * per-material batch and merged into a single BufferGeometry at the end, so the whole
 * overhead reads as one dense assembly for about a dozen draw calls rather than one per box.
 * ---------------------------------------------------------------------------------------- */

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_PLANE = new THREE.PlaneGeometry(1, 1);
const UNIT_CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 16, 1);
const UNIT_BOLT = new THREE.CylinderGeometry(0.62, 0.5, 1, 6, 1);
/** Torus lying in XY (normal +Z), tube radius 18% of the ring radius. */
const UNIT_RING = new THREE.TorusGeometry(0.5, 0.09, 6, 18);

const _m4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _pos = new THREE.Vector3();
const _scl = new THREE.Vector3();

type Batch = THREE.BufferGeometry[];

interface Xf {
  rx?: number;
  ry?: number;
  rz?: number;
  /** Multiplies the source geometry's UVs before transforming — controls texel density. */
  uv?: [number, number];
}

function putMatrix(batch: Batch, src: THREE.BufferGeometry, m: THREE.Matrix4, uv?: [number, number]): void {
  const g = src.clone();
  if (uv) {
    const attr = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < attr.count; i++) attr.setXY(i, attr.getX(i) * uv[0], attr.getY(i) * uv[1]);
    attr.needsUpdate = true;
  }
  g.applyMatrix4(m);
  batch.push(g);
}

function put(
  batch: Batch,
  src: THREE.BufferGeometry,
  sx: number, sy: number, sz: number,
  x: number, y: number, z: number,
  t?: Xf,
): void {
  _euler.set(t?.rx ?? 0, t?.ry ?? 0, t?.rz ?? 0);
  _quat.setFromEuler(_euler);
  _m4.compose(_pos.set(x, y, z), _quat, _scl.set(sx, sy, sz));
  putMatrix(batch, src, _m4, t?.uv);
}

function box(b: Batch, sx: number, sy: number, sz: number, x: number, y: number, z: number, t?: Xf): void {
  put(b, UNIT_BOX, sx, sy, sz, x, y, z, t);
}

/** Cylinder with its axis on +Y unless rotated. */
function cyl(b: Batch, r: number, len: number, x: number, y: number, z: number, t?: Xf): void {
  put(b, UNIT_CYL, r * 2, len, r * 2, x, y, z, t);
}

/** Downward-facing bolt head. */
function bolt(b: Batch, x: number, y: number, z: number, r = 0.021, t?: Xf): void {
  put(b, UNIT_BOLT, r * 2, 0.018, r * 2, x, y, z, t);
}

/** Ring lying in the XZ plane (i.e. threaded onto a Z-axis run) unless rotated. */
function ring(b: Batch, r: number, x: number, y: number, z: number, t?: Xf): void {
  put(b, UNIT_RING, r * 2, r * 2, r * 2, x, y, z, t);
}

/** Down-facing quad. */
function facePlane(b: Batch, w: number, d: number, x: number, y: number, z: number, uv?: [number, number]): void {
  put(b, UNIT_PLANE, w, d, 1, x, y, z, { rx: Math.PI / 2, uv });
}

function flush(
  scene: THREE.Scene,
  batch: Batch,
  material: THREE.Material,
  castShadow = false,
  bake = true,
): THREE.Mesh | null {
  if (batch.length === 0) return null;
  const merged = mergeGeometries(batch, false);
  for (const g of batch) g.dispose();
  batch.length = 0;
  if (!merged) return null;
  if (bake) bakeShading(merged);
  const mesh = new THREE.Mesh(merged, material);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

/* ---------------------------------------------------------------------------------------- */

/** Runner (longitudinal) centre lines. */
const RUNNER_X = [-3.0, 0, 3.0];
/** Transverse structural beams, 1.2 apart down the room's depth. */
const BEAM_Z = [-5.4, -4.2, -3.0, -1.8, -0.6, 0.6, 1.8, 3.0, 4.2, 5.4];
/** Deck bays between the runners: {centre, width}. */
const BAY_X: [number, number][] = [[-3.75, 1.5], [-1.5, 2.9], [1.5, 2.9], [3.75, 1.5]];
/** Deck bays between the beams. */
const BAY_Z: [number, number][] = [
  [-5.7, 0.6], [-4.8, 1.2], [-3.6, 1.2], [-2.4, 1.2], [-1.2, 1.2], [0, 1.2],
  [1.2, 1.2], [2.4, 1.2], [3.6, 1.2], [4.8, 1.2], [5.7, 0.6],
];
/** Recessed warm fixtures: two rows down the room, always in a bay centre. */
const PANEL_POS: [number, number][] = [
  [-2.1, -4.8], [2.1, -4.8],
  [-2.1, -2.4], [2.1, -2.4],
  [-2.1, 0], [2.1, 0],
  [-2.1, 2.4], [2.1, 2.4],
  [-2.1, 4.8], [2.1, 4.8],
];

const DECK_Y = 3.895;
const DECK_UNDER = 3.87;

function rand(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------------------------------
 * Baked shading
 *
 * The room's key light is a downward directional, so it never reaches a single ceiling face:
 * everything up here is lit by hemisphere + ambient alone, which arrives from every direction
 * equally and therefore renders the whole assembly with no ambient occlusion whatsoever. That
 * is why the beams read as pasted onto the deck rather than bolted into it.
 *
 * Since every batch is merged in world space, a cheap analytic pass over the merged vertices
 * can supply what the light rig cannot: contact darkening in the coffer crevices, occlusion on
 * faces buried inside the assembly, metre-scale albedo drift, and — the part the critic
 * specifically asked for — warm bounce on the plating around each practical, so the fixtures
 * visibly light their surroundings instead of blooming in isolation.
 * ---------------------------------------------------------------------------------------- */

/** Pendant lamp positions: [x, z, hasLight]. */
const PENDANTS: [number, number, boolean][] = [[0.72, 1.2, true], [-0.88, -1.2, false]];
/** Clamped strip fixtures: [x, z, length]. */
const STRIPS: [number, number, number][] = [
  [-3.0, -3.0, 2.6], [3.0, 2.4, 2.6], [-3.0, 3.6, 2.0], [3.0, -4.6, 2.0], [0, 1.2, 1.6],
];

/** Fixture positions that throw warm bounce onto nearby structure: [x, z, strength]. */
const BOUNCE: [number, number, number][] = [
  ...PANEL_POS.map(([x, z]) => [x, z, 0.5] as [number, number, number]),
  ...PENDANTS.map(([x, z]) => [x, z, 0.62] as [number, number, number]),
  ...STRIPS.map(([x, z]) => [x, z, 0.3] as [number, number, number]),
];

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function hash2(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Bilinear value noise on the XZ plane; one unit ≈ one metre of drift. */
function noise2(x: number, z: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi);
  const b = hash2(xi + 1, zi);
  const c = hash2(xi, zi + 1);
  const d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function bakeShading(geo: THREE.BufferGeometry): void {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const nrm = geo.getAttribute('normal') as THREE.BufferAttribute | undefined;
  const col = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ny = nrm ? nrm.getY(i) : -1;

    // 0 at the lowest-hanging props, 1 up against the deck inside a coffer.
    const depth = smoothstep(3.26, 3.90, y);

    // Contact occlusion where a member lands on the deck, a runner or the hull. Gated on
    // `cavity` rather than `depth` so it only bites above the beams' lower flange: the beam
    // undersides are the most-seen surfaces up here and must not be dragged toward black.
    const cavity = smoothstep(3.60, 3.90, y);
    let dz = Infinity;
    for (const bz of BEAM_Z) dz = Math.min(dz, Math.abs(z - bz));
    let dx = ROOM_W / 2 - Math.abs(x);
    for (const rx of RUNNER_X) dx = Math.min(dx, Math.abs(x - rx));
    const crevice = Math.max(1 - smoothstep(0.13, 0.70, dz), 1 - smoothstep(0.10, 0.58, dx));
    let ao = 1 - crevice * cavity * 0.48;

    // Up-facing geometry is buried in the assembly; edge-on faces see half the room.
    ao *= 1 - Math.max(0, ny) * 0.42 * depth;
    ao *= 1 - (1 - Math.abs(ny)) * 0.20 * depth;

    // Metre-scale drift, so no batch reads as one unbroken tint at distance.
    ao *= 0.90 + noise2(x * 0.62 + 11.3, z * 0.62 - 4.7) * 0.24;

    // Warm bounce from the practicals.
    let w = 0;
    for (let s = 0; s < BOUNCE.length; s++) {
      const dxs = x - BOUNCE[s][0];
      const dzs = z - BOUNCE[s][1];
      w += BOUNCE[s][2] * Math.exp(-(dxs * dxs + dzs * dzs) / 1.8);
    }
    w = Math.min(0.95, w) * (0.3 + 0.7 * depth);

    // Floor at 0.52: the reference carries material in its darkest ceiling pixels, so this
    // pass is never allowed to drive a surface to black on its own.
    const base = Math.min(1.14, Math.max(0.52, ao));
    col[i * 3] = base * (1 + w * 0.52);
    col[i * 3 + 1] = base * (1 + w * 0.34);
    col[i * 3 + 2] = base * (1 + w * 0.12);
  }

  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

/**
 * Coffered ceiling deck plus its full mechanical layer: I-beam structure, recessed warm
 * practicals, pendant lamps, pipe trunks with flanged joints, bronze flex conduit, louvred
 * vents, extractor fans, cable trays and status banks. Everything lives above y = 3.0 so the
 * player's walk from spawn to the console is untouched.
 */
export function buildCeiling(ctx: InteriorCtx): void {
  const rnd = rand(0x4d21);

  // ===== materials =====
  // Five genuinely different material responses live up here, and the roughness/metalness
  // spread between them is deliberate — it is the whole difference between "grey plastic with
  // different tints" and a ceiling made of parts:
  //   painted structure  rough 0.25–0.95 via map, metal 0.30   (semi-matte paint over plate)
  //   bare rubbed steel  rough 0.22,             metal 0.98    (chamfers, straps, handwheel)
  //   galvanised pipe    rough 0.35–0.90 via map, metal 0.88
  //   composite deck     rough 0.55–0.95 via map, metal 0.12
  //   rubber loom        rough 0.98,             metal 0.0
  const plateMap = buildCeilingPlateTexture();
  const plateRough = buildCeilingPlateRoughness();
  const plateNormal = buildCeilingPlateNormal();

  const steelMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, map: plateMap, roughnessMap: plateRough, normalMap: plateNormal,
    roughness: 1.0, metalness: 0.30,
    emissive: 0x2b333e, emissiveIntensity: 0.7,
    vertexColors: true,
  });
  steelMat.normalScale.set(0.85, 0.85);
  const deckMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, map: buildCorrugatedDeckTexture(),
    normalMap: buildCorrugatedDeckNormal(), roughnessMap: buildCorrugatedDeckRoughness(),
    roughness: 1.0, metalness: 0.12,
    emissive: 0x2c343f, emissiveIntensity: 0.75,
    vertexColors: true,
  });
  deckMat.normalScale.set(1.15, 1.15);
  // Recess interiors and shadowed insets. Still the darkest thing in the ceiling, but it now
  // carries a roughness and normal break-up so it reads as a shadowed material, not a hole.
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x39414c, roughnessMap: plateRough, normalMap: plateNormal,
    roughness: 1.0, metalness: 0.22,
    emissive: 0x1c222b, emissiveIntensity: 0.8,
    vertexColors: true,
  });
  darkMat.normalScale.set(0.6, 0.6);
  // Painted trim on the fixture bezels. Mid-grey rather than the previous near-white: these
  // are the largest light-valued surfaces overhead and they were carrying the p95 overshoot.
  const paleMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, map: buildPaintedTrimTexture(), roughnessMap: buildPaintedTrimRoughness(),
    roughness: 1.0, metalness: 0.14,
    emissive: 0x272e37, emissiveIntensity: 0.6,
    vertexColors: true,
  });
  // Bare, rubbed-bright steel: chamfer beads on beam corners, pipe straps, the handwheel.
  // The one genuinely sharp specular up here, and the read for "worn through to metal".
  const wornMat = new THREE.MeshStandardMaterial({
    color: 0x9ba4af, roughness: 0.22, metalness: 0.98,
    emissive: 0x1e242d, emissiveIntensity: 0.5,
    vertexColors: true,
  });
  const boltMat = new THREE.MeshStandardMaterial({
    color: 0x8e97a2, roughness: 0.34, metalness: 0.92,
    emissive: 0x1f252e, emissiveIntensity: 0.55,
    vertexColors: true,
  });
  const pipeMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, map: buildPipeSteelTexture(), roughnessMap: buildPipeRoughness(),
    roughness: 1.0, metalness: 0.88,
    emissive: 0x232a33, emissiveIntensity: 0.6,
    vertexColors: true,
  });
  const copperMat = new THREE.MeshStandardMaterial({
    color: 0xa8703a, roughness: 0.36, metalness: 0.95,
    emissive: 0x2a1e12, emissiveIntensity: 0.6,
    vertexColors: true,
  });
  // Rubber loom, not painted metal: fully dielectric and almost perfectly matte, so the cable
  // runs stay velvety black-blue while the steel beside them catches every highlight.
  const cableMat = new THREE.MeshStandardMaterial({
    color: 0x1d2128, roughness: 0.98, metalness: 0.0,
    emissive: 0x141920, emissiveIntensity: 0.85,
    vertexColors: true,
  });
  const grilleMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, map: buildGrilleTexture(),
    roughness: 0.92, metalness: 0.25,
    emissive: 0x181d24, emissiveIntensity: 0.8,
    vertexColors: true,
  });
  // Gauge lens: the only true glass overhead — near-mirror smooth and dielectric.
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x9fb6c2, roughness: 0.05, metalness: 0.0,
    transparent: true, opacity: 0.5,
    emissive: 0x18242a, emissiveIntensity: 0.6,
  });
  // Practicals keep a near-black albedo and route all of their brightness through the
  // emissive channel: they sit inside buildLighting()'s overhead pools, and a bright albedo
  // there stacks pool light on top of emissive and blows through the bloom threshold when
  // the player looks straight up from a couple of metres away. Intensities here are down
  // roughly a third from the last pass — these panels are the largest emissive area in frame
  // and were the reason our p95 sat 0.19 above the reference's.
  const diffuserMat = new THREE.MeshStandardMaterial({
    color: 0x171512, emissive: 0xffd9a0, emissiveMap: buildDiffuserTexture(),
    emissiveIntensity: 0.52, roughness: 0.55, metalness: 0,
  });
  const flickerMat = diffuserMat.clone();
  const tubeMat = new THREE.MeshStandardMaterial({
    color: 0x1a1712, emissive: 0xffe2b4, emissiveIntensity: 0.58, roughness: 0.45, metalness: 0,
  });
  // The pendant filaments stay genuinely hot — they are a few square centimetres each, so they
  // supply the tiny hot-pixel population the reference has without moving the p95.
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0x1a1712, emissive: 0xfff0d6, emissiveIntensity: 1.35, roughness: 0.35, metalness: 0,
  });
  const cyanMat = new THREE.MeshStandardMaterial({
    color: 0x08131a, emissive: 0x6fe0f4, emissiveIntensity: 0.72, roughness: 0.4, metalness: 0,
  });
  const placardMat = new THREE.MeshStandardMaterial({
    map: buildStencilPlacardTexture('CL-04', 'OVERHEAD'),
    roughness: 0.9, metalness: 0.08,
    emissive: 0x1e242c, emissiveIntensity: 0.55,
    vertexColors: true,
  });

  // ===== batches =====
  const steel: Batch = [];
  const deck: Batch = [];
  const dark: Batch = [];
  const pale: Batch = [];
  const worn: Batch = [];
  const glass: Batch = [];
  const bolts: Batch = [];
  const pipes: Batch = [];
  const copper: Batch = [];
  const cables: Batch = [];
  const grilles: Batch = [];
  const warm: Batch = [];
  const tubes: Batch = [];
  const lamps: Batch = [];
  const cyan: Batch = [];
  const placards: Batch = [];

  // ===== 1. structural slab =====
  box(steel, ROOM_W, 0.14, ROOM_D, 0, ROOM_H, 0, { uv: [6, 8] });

  // ===== 2. coffered deck bays =====
  // Each bay is a corrugated panel recessed between the runners and beams, with rivets at its
  // corners and — on roughly a third of them — a bolted circular access boss.
  for (const [bx, bw] of BAY_X) {
    for (const [bz, bd] of BAY_Z) {
      box(deck, bw - 0.08, 0.05, bd - 0.08, bx, DECK_Y, bz, {
        uv: [Math.max(1, bw / 1.3), Math.max(0.8, bd / 0.55)],
      });
      const ex = (bw - 0.08) / 2 - 0.09;
      const ez = (bd - 0.08) / 2 - 0.09;
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) bolt(bolts, bx + sx * ex, DECK_UNDER, bz + sz * ez, 0.017);
      }
      if (rnd() < 0.34) {
        const ox = (rnd() - 0.5) * (bw - 0.6);
        const oz = (rnd() - 0.5) * (bd - 0.5);
        cyl(steel, 0.13, 0.035, bx + ox, DECK_UNDER + 0.004, bz + oz, { uv: [0.4, 0.4] });
        cyl(dark, 0.105, 0.045, bx + ox, DECK_UNDER + 0.002, bz + oz);
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + 0.4;
          bolt(bolts, bx + ox + Math.cos(a) * 0.113, DECK_UNDER - 0.012, bz + oz + Math.sin(a) * 0.113, 0.014);
        }
      }
      // A short lengthwise stiffener rib breaks up the wider mid bays.
      if (bw > 2 && rnd() < 0.5) {
        box(steel, 0.07, 0.035, bd - 0.3, bx + (rnd() - 0.5) * (bw - 0.9), DECK_UNDER + 0.002, bz, { uv: [0.2, 1] });
      }
    }
  }

  // ===== 3. longitudinal runners =====
  for (const rx of RUNNER_X) {
    box(steel, 0.26, 0.035, ROOM_D - 0.08, rx, 3.928, 0, { uv: [0.2, 8] });
    box(steel, 0.20, 0.16, ROOM_D - 0.08, rx, 3.845, 0, { uv: [0.16, 8] });
    box(steel, 0.34, 0.05, ROOM_D - 0.08, rx, 3.762, 0, { uv: [0.28, 8] });
    box(dark, 0.24, 0.03, ROOM_D - 0.08, rx, 3.736, 0);
    // Bare-metal chamfer bead on the runner's bottom corners — paint never survives there.
    for (const s of [-1, 1]) {
      box(worn, 0.026, 0.026, ROOM_D - 0.12, rx + s * 0.163, 3.744, 0, { rz: Math.PI / 4 });
    }
    for (let z = -5.75; z <= 5.75; z += 0.45) {
      bolt(bolts, rx - 0.135, 3.735, z, 0.019);
      bolt(bolts, rx + 0.135, 3.735, z, 0.019);
    }
    // Hanger plates tying the runner up into the slab.
    for (let z = -5.2; z <= 5.2; z += 2.6) {
      box(steel, 0.30, 0.09, 0.10, rx, 3.90, z, { uv: [0.25, 0.1] });
      box(steel, 0.06, 0.16, 0.22, rx - 0.13, 3.86, z);
      box(steel, 0.06, 0.16, 0.22, rx + 0.13, 3.86, z);
    }
  }

  // ===== 4. transverse I-beams =====
  const beamW = ROOM_W - 0.2;
  for (const bz of BEAM_Z) {
    box(steel, beamW, 0.05, 0.30, 0, 3.86, bz, { uv: [6, 0.25] });          // upper flange
    box(steel, beamW, 0.27, 0.15, 0, 3.72, bz, { uv: [6, 0.28] });          // web
    box(steel, beamW, 0.04, 0.24, 0, 3.605, bz);                            // chamfer step
    box(steel, beamW, 0.055, 0.36, 0, 3.565, bz, { uv: [6, 0.3] });         // lower flange
    box(dark, beamW - 0.04, 0.02, 0.20, 0, 3.535, bz);                      // shadowed underside inset
    // Wear chamfers on the lower flange's outer corners: the edge every cable pull and trolley
    // handle knocks, rubbed back to bare steel. These are what catch a rim of hard specular
    // and stop the beams reading as extruded rectangles of one flat tint.
    for (const s of [-1, 1]) {
      box(worn, beamW - 0.06, 0.026, 0.026, 0, 3.5445, bz + s * 0.172, { rx: Math.PI / 4 });
    }
    for (let x = -4.15; x <= 4.15; x += 0.55) {
      bolt(bolts, x, 3.534, bz - 0.135, 0.019);
      bolt(bolts, x, 3.534, bz + 0.135, 0.019);
    }
    // Bolt-through bosses on the web give the beams a second detail layer at grazing angles.
    for (let x = -3.85; x <= 3.85; x += 1.1) {
      cyl(dark, 0.062, 0.17, x, 3.72, bz, { rx: Math.PI / 2 });
      cyl(steel, 0.082, 0.02, x, 3.72, bz - 0.085, { rx: Math.PI / 2, uv: [0.3, 0.3] });
      cyl(steel, 0.082, 0.02, x, 3.72, bz + 0.085, { rx: Math.PI / 2, uv: [0.3, 0.3] });
    }
    // End gussets where the beam lands on the hull.
    for (const s of [-1, 1]) {
      const gx = s * (ROOM_W / 2 - 0.24);
      box(steel, 0.34, 0.30, 0.34, gx, 3.72, bz, { uv: [0.3, 0.3] });
      box(steel, 0.42, 0.05, 0.42, gx, 3.55, bz, { uv: [0.35, 0.35] });
      box(dark, 0.24, 0.10, 0.24, gx, 3.50, bz);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) bolt(bolts, gx + sx * 0.16, 3.522, bz + sz * 0.16, 0.02);
    }
  }

  // ===== 5. recessed warm practicals =====
  // Index 5 is skipped here — it is emitted separately below onto a flickering ballast.
  PANEL_POS.forEach(([px, pz], idx) => {
    box(steel, 1.66, 0.05, 0.92, px, 3.888, pz, { uv: [1.2, 0.7] });   // mounting flange
    box(dark, 1.44, 0.13, 0.72, px, 3.90, pz);                          // recess housing
    if (idx !== 5) facePlane(idx === 7 ? tubes : warm, 1.28, 0.58, px, 3.866, pz, [1, 1]);
    // Bezel: four bevelled bars, the lowest-hanging part of the fixture.
    box(pale, 1.56, 0.085, 0.10, px, 3.845, pz - 0.36);
    box(pale, 1.56, 0.085, 0.10, px, 3.845, pz + 0.36);
    box(pale, 0.10, 0.085, 0.62, px - 0.73, 3.845, pz);
    box(pale, 0.10, 0.085, 0.62, px + 0.73, 3.845, pz);
    box(pale, 0.05, 0.055, 0.60, px, 3.856, pz);                        // centre mullion
    box(dark, 1.40, 0.02, 0.66, px, 3.878, pz);                         // reveal behind the bezel
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) bolt(bolts, px + sx * 0.73, 3.80, pz + sz * 0.36, 0.022);
      bolt(bolts, px + sx * 0.30, 3.80, pz - 0.36, 0.019);
      bolt(bolts, px + sx * 0.30, 3.80, pz + 0.36, 0.019);
    }
    // Ballast box and its conduit whip, offset to one side so the fixtures are not symmetric.
    const side = idx % 2 === 0 ? -1 : 1;
    box(steel, 0.30, 0.14, 0.20, px + side * 1.02, 3.85, pz, { uv: [0.25, 0.2] });
    box(dark, 0.24, 0.03, 0.14, px + side * 1.02, 3.775, pz);
    cyl(steel, 0.028, 0.28, px + side * 0.88, 3.86, pz, { rz: Math.PI / 2 });
    if (idx === 2 || idx === 7) {
      const l = new THREE.PointLight(0xffdcaa, 0.5, 6.0, 1.5);
      l.position.set(px, 3.52, pz);
      ctx.scene.add(l);
    }
  });

  // ===== 6. pendant lamps =====
  const buildPendant = (cx: number, cz: number, withLight: boolean) => {
    box(steel, 0.40, 0.09, 0.18, cx, 3.86, cz, { uv: [0.3, 0.15] });
    box(dark, 0.30, 0.03, 0.12, cx, 3.80, cz);
    for (const off of [-0.16, 0.16]) {
      const lx = cx + off;
      cyl(worn, 0.011, 0.52, lx, 3.60, cz);
      cyl(steel, 0.052, 0.07, lx, 3.335, cz, { uv: [0.3, 0.3] });
      cyl(lamps, 0.041, 0.27, lx, 3.19, cz);
      cyl(steel, 0.046, 0.05, lx, 3.045, cz, { uv: [0.3, 0.3] });
      // Wire cage.
      ring(cables, 0.062, lx, 3.29, cz, { rx: Math.PI / 2 });
      ring(cables, 0.062, lx, 3.09, cz, { rx: Math.PI / 2 });
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.6;
        cyl(cables, 0.008, 0.25, lx + Math.cos(a) * 0.06, 3.19, cz + Math.sin(a) * 0.06);
      }
    }
    // Slack power lead sagging between the two lamp stems.
    const lead = new THREE.CatmullRomCurve3([
      new THREE.Vector3(cx - 0.16, 3.80, cz),
      new THREE.Vector3(cx - 0.07, 3.66, cz + 0.05),
      new THREE.Vector3(cx + 0.07, 3.66, cz - 0.05),
      new THREE.Vector3(cx + 0.16, 3.80, cz),
    ]);
    putMatrix(cables, new THREE.TubeGeometry(lead, 20, 0.009, 5, false), new THREE.Matrix4());

    // Upward spill. A bare pendant throws as much light at the plating above it as at the deck
    // below, and that is precisely what the room's downward key light can never produce: the
    // lamp was blooming in isolation against structure it visibly did not touch. The shadowed
    // one puts the beams' own silhouettes onto the deck, which is the contact cue that grounds
    // the whole fixture. Short range and a tight cone keep it to the bay it belongs to.
    const spill = new THREE.SpotLight(0xffdcae, withLight ? 3.2 : 1.9, 2.3, 1.02, 0.8, 1.3);
    spill.position.set(cx, 3.30, cz);
    spill.target.position.set(cx, 4.3, cz);
    if (withLight) {
      spill.castShadow = true;
      spill.shadow.mapSize.set(512, 512);
      spill.shadow.camera.near = 0.08;
      spill.shadow.camera.far = 2.4;
      spill.shadow.bias = -0.0006;
      spill.shadow.normalBias = 0.03;
    }
    ctx.scene.add(spill);
    ctx.scene.add(spill.target);

    if (withLight) {
      const l = new THREE.PointLight(0xffe4bb, 0.55, 7, 1.5);
      l.position.set(cx, 3.05, cz);
      ctx.scene.add(l);
    }
  };
  for (const [px, pz, lit] of PENDANTS) buildPendant(px, pz, lit);

  // ===== 7. pipe trunks =====
  // Main starboard trunk: flanged segments, hanger straps, an inline valve block and a gauge.
  const mainX = 3.9;
  const mainY = 3.44;
  const mainR = 0.155;
  const joints = [-5.9, -3.95, -1.95, 0.05, 2.05, 4.05, 5.9];
  for (let i = 0; i < joints.length - 1; i++) {
    const a = joints[i] + 0.05;
    const b = joints[i + 1] - 0.05;
    cyl(pipes, mainR, b - a, mainX, mainY, (a + b) / 2, { rx: Math.PI / 2, uv: [1, (b - a) / 2] });
  }
  for (const jz of joints) {
    cyl(pipes, mainR + 0.05, 0.10, mainX, mainY, jz, { rx: Math.PI / 2, uv: [1, 0.2] });
    cyl(dark, mainR + 0.032, 0.13, mainX, mainY, jz, { rx: Math.PI / 2 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      bolt(bolts, mainX + Math.cos(a) * (mainR + 0.03), mainY + Math.sin(a) * (mainR + 0.03), jz - 0.055,
        0.017, { rx: -Math.PI / 2 });
    }
  }
  // Hanger straps are unpainted band stock, so they get the bare-steel material.
  for (let hz = -5.0; hz <= 5.0; hz += 2.0) {
    box(worn, 0.05, 0.44, 0.05, mainX - 0.19, 3.68, hz);
    box(worn, 0.05, 0.44, 0.05, mainX + 0.19, 3.68, hz);
    box(steel, 0.50, 0.05, 0.09, mainX, 3.90, hz, { uv: [0.4, 0.1] });
    ring(worn, mainR + 0.035, mainX, mainY, hz);
    bolt(bolts, mainX - 0.19, 3.455, hz, 0.02);
    bolt(bolts, mainX + 0.19, 3.455, hz, 0.02);
  }
  // Inline valve with a hand-wheel — the wheel is polished by use, the body stays painted.
  box(steel, 0.32, 0.32, 0.36, mainX, mainY, -1.0, { uv: [0.3, 0.3] });
  box(steel, 0.38, 0.05, 0.42, mainX, mainY - 0.175, -1.0, { uv: [0.35, 0.35] });
  cyl(worn, 0.05, 0.26, mainX - 0.26, mainY, -1.0, { rz: Math.PI / 2 });
  ring(worn, 0.13, mainX - 0.40, mainY, -1.0, { ry: Math.PI / 2 });
  for (const a of [0, Math.PI / 2]) {
    cyl(worn, 0.012, 0.26, mainX - 0.40, mainY, -1.0, { rx: a });
  }
  // Pressure gauge on a standpipe: painted case, glass lens, cyan dial behind it.
  cyl(steel, 0.022, 0.16, mainX, mainY + 0.20, 2.6);
  cyl(pale, 0.055, 0.035, mainX, mainY + 0.29, 2.6, { rx: Math.PI / 2 });
  cyl(cyan, 0.042, 0.038, mainX, mainY + 0.292, 2.6, { rx: Math.PI / 2 });
  cyl(glass, 0.050, 0.044, mainX, mainY + 0.292, 2.6, { rx: Math.PI / 2 });

  // Secondary small-bore line running beneath the main trunk.
  for (const [a, b] of [[-5.9, -2.1], [-1.9, 1.9], [2.1, 5.9]] as [number, number][]) {
    cyl(pipes, 0.072, b - a, 3.46, 3.27, (a + b) / 2, { rx: Math.PI / 2, uv: [1, (b - a) / 2.5] });
  }
  for (const jz of [-5.9, -2.0, 1.95, 5.9]) {
    cyl(pipes, 0.098, 0.08, 3.46, 3.27, jz, { rx: Math.PI / 2, uv: [1, 0.15] });
  }
  for (let hz = -4.6; hz <= 5.0; hz += 2.4) {
    box(worn, 0.04, 0.34, 0.04, 3.46, 3.44, hz);
    ring(worn, 0.10, 3.46, 3.27, hz);
  }

  // Port side: bronze flexible conduit feeding a grey run that elbows inboard.
  const flexZ0 = -5.6;
  const flexZ1 = -1.95;
  cyl(copper, 0.098, flexZ1 - flexZ0, -3.9, 3.52, (flexZ0 + flexZ1) / 2, { rx: Math.PI / 2 });
  for (let z = flexZ0 + 0.06; z < flexZ1 - 0.02; z += 0.105) ring(copper, 0.122, -3.9, 3.52, z);
  for (const cz of [flexZ0 + 0.02, flexZ1 - 0.02]) {
    cyl(steel, 0.135, 0.12, -3.9, 3.52, cz, { rx: Math.PI / 2, uv: [1, 0.2] });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      bolt(bolts, -3.9 + Math.cos(a) * 0.115, 3.52 + Math.sin(a) * 0.115, cz, 0.015, { rx: -Math.PI / 2 });
    }
  }
  const portCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-3.9, 3.52, -1.9),
    new THREE.Vector3(-3.9, 3.52, 0.6),
    new THREE.Vector3(-3.9, 3.52, 2.9),
    new THREE.Vector3(-3.72, 3.51, 3.9),
    new THREE.Vector3(-3.05, 3.50, 4.35),
    new THREE.Vector3(-1.6, 3.46, 4.4),
    new THREE.Vector3(-0.5, 3.44, 4.4),
  ]);
  putMatrix(pipes, new THREE.TubeGeometry(portCurve, 90, 0.108, 12, false), new THREE.Matrix4(), [7, 1]);
  for (const t of [0.12, 0.34, 0.56, 0.78, 0.95]) {
    const p = portCurve.getPointAt(t);
    const tan = portCurve.getTangentAt(t);
    _quat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
    _m4.compose(p, _quat, _scl.set(0.29, 0.09, 0.29));
    putMatrix(pipes, UNIT_CYL, _m4, [1, 0.2]);
    _m4.compose(p, _quat, _scl.set(0.32, 0.32, 0.32));
    putMatrix(steel, UNIT_RING, _m4);
  }
  for (const hz of [-0.6, 1.8, 3.0]) {
    box(worn, 0.05, 0.42, 0.05, -3.9, 3.72, hz);
    ring(worn, 0.14, -3.9, 3.52, hz);
  }

  // ===== 8. louvred vent boxes =====
  const VENTS: [number, number][] = [
    [-3.5, -3.6], [3.35, -4.8], [-3.5, 1.2], [3.35, 0],
    [-1.5, -5.7], [1.5, -5.7], [-3.5, 4.8], [3.35, 3.6],
  ];
  VENTS.forEach(([vx, vz], i) => {
    box(steel, 0.72, 0.05, 0.52, vx, 3.80, vz, { uv: [0.6, 0.4] });     // ceiling flange
    box(steel, 0.66, 0.22, 0.46, vx, 3.68, vz, { uv: [0.55, 0.35] });   // housing
    box(steel, 0.70, 0.035, 0.50, vx, 3.575, vz, { uv: [0.6, 0.4] });   // bevelled lip
    box(dark, 0.58, 0.05, 0.38, vx, 3.552, vz);                          // recess
    facePlane(grilles, 0.55, 0.35, vx, 3.534, vz, [3, 2]);
    for (let s = 0; s < 5; s++) {
      box(steel, 0.53, 0.022, 0.05, vx, 3.545, vz - 0.14 + s * 0.07, { rx: 0.38, uv: [0.4, 0.1] });
    }
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) bolt(bolts, vx + sx * 0.31, 3.556, vz + sz * 0.21, 0.02);
    }
    cyl(steel, 0.11, 0.26, vx, 3.87, vz, { uv: [0.4, 0.3] });            // duct stub into the deck
    ring(steel, 0.125, vx, 3.755, vz, { rx: Math.PI / 2 });
    if (i % 2 === 0) {
      put(placards, UNIT_PLANE, 0.26, 0.11, 1, vx, 3.70, vz + 0.235);
    }
  });

  // ===== 9. extractor fan units =====
  const FANS: [number, number][] = [[2.4, -3.6], [-2.4, 1.2], [0.9, 4.8]];
  const bladeParts: Batch = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    box(bladeParts, 0.15, 0.012, 0.05, Math.cos(a) * 0.09, 0, Math.sin(a) * 0.09, { ry: -a, rx: 0.4 });
  }
  box(bladeParts, 0.05, 0.05, 0.05, 0, 0, 0);
  const bladeGeo = mergeGeometries(bladeParts, false);
  for (const g of bladeParts) g.dispose();
  const bladeMat = new THREE.MeshStandardMaterial({
    color: 0x808892, roughness: 0.3, metalness: 0.95, emissive: 0x1e242c, emissiveIntensity: 0.6,
  });
  const fanBlades: THREE.Mesh[] = [];

  for (const [fx, fz] of FANS) {
    box(steel, 1.02, 0.05, 0.60, fx, 3.83, fz, { uv: [0.8, 0.5] });
    box(steel, 0.94, 0.24, 0.54, fx, 3.70, fz, { uv: [0.75, 0.45] });
    box(steel, 1.00, 0.04, 0.58, fx, 3.565, fz, { uv: [0.8, 0.5] });
    for (const off of [-0.23, 0.23]) {
      const cxp = fx + off;
      cyl(dark, 0.21, 0.14, cxp, 3.63, fz);
      ring(steel, 0.215, cxp, 3.556, fz, { rx: Math.PI / 2 });
      ring(steel, 0.135, cxp, 3.556, fz, { rx: Math.PI / 2 });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        box(grilles, 0.42, 0.012, 0.022, cxp, 3.556, fz, { ry: a });
      }
      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      blade.position.set(cxp, 3.60, fz);
      blade.castShadow = false;
      blade.receiveShadow = true;
      ctx.scene.add(blade);
      fanBlades.push(blade);
    }
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) bolt(bolts, fx + sx * 0.45, 3.545, fz + sz * 0.25, 0.021);
    }
    box(dark, 0.26, 0.12, 0.16, fx, 3.72, fz + 0.34);
    cyl(steel, 0.035, 0.30, fx + 0.34, 3.86, fz, { rz: Math.PI / 2 });
  }

  // ===== 10. cable trays and drops =====
  const cableRun = (cx: number, span: [number, number], alongZ: boolean, baseY: number, period: number): void => {
    const pts: THREE.Vector3[] = [];
    const steps = 28;
    for (let i = 0; i <= steps; i++) {
      const t = span[0] + (span[1] - span[0]) * (i / steps);
      const sag = Math.abs(Math.sin((Math.PI * (t + 6)) / period)) * 0.06;
      pts.push(alongZ ? new THREE.Vector3(cx, baseY - sag, t) : new THREE.Vector3(t, baseY - sag, cx));
    }
    for (const off of [-0.028, 0, 0.028]) {
      const shifted = new THREE.CatmullRomCurve3(
        pts.map((p) => (alongZ ? new THREE.Vector3(p.x + off, p.y + Math.abs(off) * 0.4, p.z)
          : new THREE.Vector3(p.x, p.y + Math.abs(off) * 0.4, p.z + off))),
      );
      putMatrix(cables, new THREE.TubeGeometry(shifted, 70, 0.016, 6, false), new THREE.Matrix4());
    }
  };
  cableRun(2.85, [-5.85, 5.85], true, 3.62, 1.2);
  cableRun(-2.85, [-5.85, 5.85], true, 3.62, 1.2);
  cableRun(-1.2, [-4.2, 4.2], false, 3.55, 1.5);
  // Clips holding each run up under the beams.
  for (const cx of [2.85, -2.85]) {
    for (const bz of BEAM_Z) {
      box(steel, 0.13, 0.055, 0.09, cx, 3.66, bz, { uv: [0.1, 0.1] });
      box(dark, 0.10, 0.03, 0.06, cx, 3.632, bz);
    }
  }
  for (let x = -3.6; x <= 3.6; x += 1.2) {
    box(steel, 0.09, 0.055, 0.13, x, 3.572, -1.2, { uv: [0.1, 0.1] });
  }

  // ===== 11. junction boxes and small greeble =====
  const JBOX: [number, number][] = [
    [-0.85, -4.8], [0.85, -3.6], [-2.1, -1.2], [3.35, -1.2],
    [-3.5, -0.6], [1.9, 1.2], [-1.9, 3.6], [2.6, 5.7], [-2.6, -5.7],
  ];
  JBOX.forEach(([jx, jz], i) => {
    box(steel, 0.30, 0.20, 0.22, jx, 3.77, jz, { uv: [0.25, 0.2] });
    box(steel, 0.34, 0.035, 0.26, jx, 3.885, jz, { uv: [0.3, 0.25] });
    box(dark, 0.24, 0.03, 0.16, jx, 3.668, jz);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) bolt(bolts, jx + sx * 0.14, 3.672, jz + sz * 0.10, 0.016);
    cyl(steel, 0.03, 0.30, jx + 0.22, 3.79, jz, { rz: Math.PI / 2, uv: [0.3, 0.3] });
    cyl(steel, 0.042, 0.05, jx + 0.16, 3.79, jz, { rz: Math.PI / 2, uv: [0.3, 0.3] });
    cyl(cyan, 0.016, 0.02, jx - 0.09, 3.664, jz, { uv: [0.3, 0.3] });
    if (i % 3 === 0) put(placards, UNIT_PLANE, 0.24, 0.10, 1, jx, 3.78, jz + 0.112);
  });

  // Sprinkler / fire-suppression heads scattered through the bays.
  for (const [sx, sz] of [[-1.6, -2.4], [1.6, -0.6], [-1.2, 4.8], [2.9, 2.4], [-3.9, -0.6]] as [number, number][]) {
    cyl(steel, 0.026, 0.13, sx, 3.81, sz, { uv: [0.3, 0.3] });
    cyl(pale, 0.055, 0.03, sx, 3.742, sz, { uv: [0.3, 0.3] });
    cyl(dark, 0.02, 0.05, sx, 3.715, sz);
  }

  // ===== 12. warm strip fixtures =====
  for (const [sx, sz, len] of STRIPS) {
    box(steel, 0.17, 0.07, len, sx, 3.79, sz, { uv: [0.15, len / 2] });
    box(pale, 0.135, 0.02, len - 0.12, sx, 3.757, sz);
    box(tubes, 0.085, 0.035, len - 0.22, sx, 3.742, sz);
    for (const s of [-1, 1]) {
      box(steel, 0.19, 0.09, 0.07, sx, 3.785, sz + s * (len / 2 - 0.02), { uv: [0.15, 0.1] });
      bolt(bolts, sx, 3.74, sz + s * (len / 2 - 0.02), 0.017);
    }
  }

  // ===== 13. cool LED strips along the runners =====
  for (const rx of [-3.0, 3.0]) {
    for (const sz of [-4.5, -1.2, 2.0, 5.0]) {
      box(dark, 0.06, 0.04, 2.0, rx + (rx > 0 ? -0.17 : 0.17), 3.775, sz);
      box(cyan, 0.03, 0.016, 1.9, rx + (rx > 0 ? -0.185 : 0.185), 3.775, sz);
    }
  }

  // ===== 14. red status banks (driven by the shared blink loop) =====
  const ledDotGeo = new THREE.SphereGeometry(0.026, 8, 6);
  for (const [lx, lz] of [[-3.2, 1.8], [3.0, -2.0], [0.35, 5.1], [1.55, -0.6]] as [number, number][]) {
    box(steel, 0.56, 0.10, 0.22, lx, 3.80, lz, { uv: [0.45, 0.2] });
    box(dark, 0.46, 0.04, 0.14, lx, 3.735, lz);
    box(steel, 0.60, 0.03, 0.26, lx, 3.86, lz, { uv: [0.5, 0.25] });
    for (const sx of [-1, 1]) bolt(bolts, lx + sx * 0.26, 3.748, lz, 0.017);
    const bankMat = new THREE.MeshStandardMaterial({
      color: 0x2a0806, emissive: 0xff3a2a, emissiveIntensity: 0.2, roughness: 0.4,
    });
    for (let i = 0; i < 4; i++) {
      const dot = new THREE.Mesh(ledDotGeo, bankMat);
      dot.position.set(lx - 0.17 + i * 0.113, 3.715, lz);
      ctx.scene.add(dot);
      ctx.statusLights.push({ mesh: dot, material: bankMat, phase: rnd() * Math.PI * 2, onIntensity: 1.5 });
    }
  }

  // ===== 15. localised staining on the plating =====
  // Multiply decals on an opaque white-based texture. The previous pass drew these on a
  // cleared canvas: canvas 2D premultiplies, so every transparent texel reached the shader as
  // rgb = 0 and MultiplyBlending stamped a hard black square over the whole quad. That was a
  // meaningful share of the dead pure-black the value audit measured.
  const decalGeo = new THREE.PlaneGeometry(1, 1);
  const decalMat = (map: THREE.Texture) => new THREE.MeshBasicMaterial({
    map, transparent: true, blending: THREE.MultiplyBlending, premultipliedAlpha: true, depthWrite: false,
  });
  const addDecal = (mat: THREE.Material, w: number, d: number, x: number, z: number, spin: number) => {
    const decal = new THREE.Mesh(decalGeo, mat);
    decal.scale.set(w, d, 1);
    decal.position.set(x, DECK_UNDER - 0.006, z);
    decal.rotation.set(Math.PI / 2, 0, spin);
    decal.renderOrder = 1;
    ctx.scene.add(decal);
  };

  // Corrosion blooms where a flanged joint weeps.
  const dripMat = decalMat(buildCeilingDripTexture());
  for (const [dx, dz, s] of [
    [3.62, -3.95, 1.0], [3.72, 0.05, 0.8], [-3.6, -1.95, 1.1],
    [-3.45, 3.2, 0.9], [2.2, -5.0, 0.7], [-1.5, 2.1, 0.8], [3.5, 4.05, 0.85],
  ] as [number, number, number][]) {
    addDecal(dripMat, s, s, dx, dz, rnd() * Math.PI * 2);
  }

  // Condensate and grime streaking on the plating each pipe run passes under, oriented along
  // the run so the wear reads as caused by the thing above it.
  const streakMat = decalMat(buildCeilingStreakTexture());
  for (const [sx, sz, w, d] of [
    [3.68, -4.4, 0.6, 2.1], [3.72, -1.1, 0.55, 1.9], [3.66, 2.3, 0.6, 2.2], [3.70, 5.0, 0.5, 1.6],
    [-3.68, -4.0, 0.55, 2.0], [-3.72, 0.4, 0.5, 1.8], [-3.60, 3.4, 0.55, 1.7],
    [3.28, -2.6, 0.42, 1.5], [3.30, 3.2, 0.42, 1.5],
  ] as [number, number, number, number][]) {
    addDecal(streakMat, w, d, sx, sz, sz > 0 ? 0 : Math.PI);
  }

  // Soot and heat scorch on the plating directly above every open lamp. The critic's note was
  // that the central fixture blooms without touching anything — this is the static half of the
  // answer, with the upward spill light above being the dynamic half.
  const sootMat = decalMat(buildCeilingSootTexture());
  for (const [px, pz] of PENDANTS) addDecal(sootMat, 1.7, 1.7, px, pz, rnd() * Math.PI * 2);
  for (const [sx, sz, len] of STRIPS) addDecal(sootMat, 0.95, len * 0.85, sx, sz, 0);

  // ===== flush every batch =====
  flush(ctx.scene, steel, steelMat, true);
  flush(ctx.scene, deck, deckMat);
  flush(ctx.scene, dark, darkMat);
  flush(ctx.scene, pale, paleMat);
  flush(ctx.scene, worn, wornMat, true);
  flush(ctx.scene, glass, glassMat, false, false);
  flush(ctx.scene, bolts, boltMat);
  flush(ctx.scene, pipes, pipeMat, true);
  flush(ctx.scene, copper, copperMat, true);
  flush(ctx.scene, cables, cableMat);
  flush(ctx.scene, grilles, grilleMat);
  flush(ctx.scene, warm, diffuserMat, false, false);
  flush(ctx.scene, tubes, tubeMat, false, false);
  flush(ctx.scene, lamps, lampMat, false, false);
  flush(ctx.scene, cyan, cyanMat, false, false);
  flush(ctx.scene, placards, placardMat);

  // The one fixture wired to flickerMat sits on its own draw call so it can misbehave
  // independently — a dying ballast is the cheapest way to stop ten identical panels
  // reading as a repeated asset.
  const flickerPanel: Batch = [];
  facePlane(flickerPanel, 1.28, 0.58, PANEL_POS[5][0], 3.866, PANEL_POS[5][1], [1, 1]);
  flush(ctx.scene, flickerPanel, flickerMat, false, false);

  // ===== animation =====
  ctx.animated.push((elapsed, dt) => {
    for (let i = 0; i < fanBlades.length; i++) {
      fanBlades[i].rotation.y += dt * (i % 2 === 0 ? 3.4 : 2.7);
    }
    const n = Math.sin(elapsed * 17.3) * Math.sin(elapsed * 5.1) * Math.sin(elapsed * 2.3);
    flickerMat.emissiveIntensity = n > 0.55 ? 0.09 : 0.49 + n * 0.07;
  });
}
