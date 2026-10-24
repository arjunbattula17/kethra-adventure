import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { loadColour } from '../../core/TextureLibrary';
import { loadProp } from './props';
import { tintByLuminance } from './grove';
import { addWake } from './wake';
import type { ShoreShape } from './water';

/**
 * Kethra's set dressing: a ruined colonnade standing in the pool, loam banks under the tree belts,
 * moss on the terraces, resonant crystal grown in the Heart's basin, a landmark tree and understory
 * out in the water, mist over it, and a few moths at rest by the glyph lights. The colonnade, the
 * crystal, the moths and the stepping stones are built here in code; the two trees and the two
 * ground maps are sourced (public/models/CREDITS.md, "kethra/") and reworked into the grove's look.
 * Only the stepping stones are walked on.
 */

const WAKE_GREEN = new THREE.Color(0x3fd9a8);

/** Its own generator, so nothing here shifts the grove's seeded scatter (kit.ts). */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

// --- Colonnade ---------------------------------------------------------------------------------

/** The column's square plinth ends here; it is sunk so only the round base shows. */
const PLINTH_TOP = 0.62;
/** Above this the column is plain fluted shaft, which can be stretched without distorting the base. */
const SHAFT_FROM = 1.25;

/**
 * Columns as [x, z, shaft stretch, yaw, lean]. They stand in the water, out of reach: a tall pair
 * frames the chamber gate, and the row breaks down in height as it runs out along the plaza's edge,
 * with two stumps by the landing so the ruin is in view from the arrival point. The low tier
 * builds the first six.
 */
const COLUMNS: [number, number, number, number, number][] = [
  [-6.4, -7.6, 3.1, 0.4, 0.0],
  [6.4, -7.6, 2.7, 2.2, 0.012],
  [-10.4, -8.6, 2.0, 1.3, -0.02],
  [10.5, -8.5, 1.0, 4.0, 0.03],
  [-13.9, -11.4, 1.0, 5.1, 0.05],
  [13.7, -11.8, 1.6, 0.9, -0.03],
  [-8.3, 19.4, 1.0, 2.9, 0.07],
  [8.6, 15.2, 1.3, 3.6, -0.04],
];

/** A resting place for a moth: a point and outward normal in `parent`'s frame, the wingspan, and a turn. */
export interface MothPerch {
  parent: THREE.Object3D;
  position: THREE.Vector3;
  normal: THREE.Vector3;
  span: number;
  turn: number;
}

const STONE = new THREE.Color(0x66736e);
const MOTH = new THREE.Color(0xcfe8dc);
const UP = new THREE.Vector3(0, 1, 0);

/** Segments round a column: two to a flute. */
const COLUMN_SEGMENTS = 32;
const COLUMN_HEIGHT = 3.2;
/** Half the plinth's side. */
const PLINTH_HALF = 0.92;
/** The column above its plinth as [height, radius]: two mouldings, then the shaft, tapering. */
const COLUMN_PROFILE: [number, number][] = [
  [PLINTH_TOP, 0.88],
  [0.72, 0.92],
  [0.84, 0.82],
  [0.92, 0.73],
  [1.02, 0.79],
  [1.13, 0.71],
  [SHAFT_FROM, 0.6],
  [1.6, 0.592],
  [1.95, 0.584],
  [2.3, 0.576],
  [2.65, 0.568],
  [2.95, 0.561],
  [COLUMN_HEIGHT, 0.555],
];

/** Where the shaft is broken off, by angle round it: one long slant with a shoulder, no teeth. */
function columnBreak(a: number): number {
  return COLUMN_HEIGHT - 0.6 * (0.5 + 0.5 * Math.sin(a + 1.1)) - 0.1 * Math.sin(2 * a + 0.4) - 0.1;
}

/**
 * A ruined column: a square plinth, a moulded base, a shallow-fluted shaft worn out of true and a
 * top broken off on a slant. Flat-shaded with its colour per vertex (mottled, darker in the flutes
 * and toward the water, moss up from the foot and up one side) and no other attribute, so it merges
 * with the stones and the moths. The same height, plinth and shaft foot as the scanned column it
 * replaced (DECISIONS D-30).
 */
function columnGeometry(): THREE.BufferGeometry {
  const N = COLUMN_SEGMENTS;
  const position: number[] = [];
  const color: number[] = [];
  const index: number[] = [];
  // Moss pulls toward green; the stone's own colour is the material's.
  const push = (x: number, y: number, z: number, shade: number, moss: number) => {
    position.push(x, y, z);
    color.push(shade * (1 - 0.3 * moss), shade * (1 + 0.02 * moss), shade * (1 - 0.34 * moss));
  };
  COLUMN_PROFILE.forEach(([h, r]) => {
    const shaft = h >= SHAFT_FROM;
    for (let j = 0; j < N; j++) {
      const a = (j / N) * Math.PI * 2;
      // Rings above the break lie on it.
      const y = Math.min(h, columnBreak(a));
      const groove = shaft && j % 2 === 1;
      const worn = 1 + 0.03 * Math.sin(3.1 * y + 2 * a + 0.7) + 0.018 * Math.sin(7.3 * y - 3 * a);
      const radius = r * worn * (groove ? 0.955 : 1);
      const up = THREE.MathUtils.clamp((y - PLINTH_TOP) / 1.5, 0, 1);
      const moss = Math.min(1, (1 - up) * (0.65 + 0.35 * Math.sin(a + 0.5)) + 0.45 * Math.max(0, Math.sin(a - 2.2)) * THREE.MathUtils.clamp(1 - (y - 1.2) / 1.7, 0, 1));
      const mottle = 0.1 * Math.sin(2 * a + 1.9 * y) + 0.06 * Math.sin(5 * a - 3.3 * y + 1);
      const shade = (groove ? 0.86 : 1) * (0.66 + 0.16 * up + mottle);
      push(Math.cos(a) * radius, y, Math.sin(a) * radius, shade, moss);
    }
  });
  for (let ring = 0; ring < COLUMN_PROFILE.length - 1; ring++) {
    for (let j = 0; j < N; j++) {
      const a = ring * N + j;
      const b = ring * N + ((j + 1) % N);
      index.push(a, a + N, b, b, a + N, b + N);
    }
  }
  // The break: a fan to a centre a little under the slant, so the broken face is dished.
  const topRing = (COLUMN_PROFILE.length - 1) * N;
  const centre = position.length / 3;
  push(0, COLUMN_HEIGHT - 0.52, 0, 0.5, 0);
  for (let j = 0; j < N; j++) index.push(topRing + j, centre, topRing + ((j + 1) % N));
  // The plinth: four sides and its top, under the round base.
  const p0 = position.length / 3;
  for (const y of [0, PLINTH_TOP]) {
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) push(sx * PLINTH_HALF, y, sz * PLINTH_HALF, 0.78, y > 0 ? 0.6 : 0.9);
  }
  for (let k = 0; k < 4; k++) {
    const a = p0 + k;
    const b = p0 + ((k + 1) % 4);
    index.push(a, a + 4, b, b, a + 4, b + 4);
  }
  index.push(p0 + 4, p0 + 7, p0 + 5, p0 + 5, p0 + 7, p0 + 6);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
  g.setIndex(index);
  return g;
}

/** The right forewing's and hindwing's outlines as [x, z], front edge first: half a unit wingspan. */
const FOREWING: [number, number][] = [[0.06, 0.2], [0.22, 0.27], [0.4, 0.25], [0.5, 0.15], [0.47, 0.03], [0.36, -0.06], [0.2, -0.07], [0.05, -0.03]];
const HINDWING: [number, number][] = [[0.05, -0.02], [0.2, -0.06], [0.31, -0.13], [0.32, -0.24], [0.24, -0.33], [0.12, -0.34], [0.04, -0.24]];

/**
 * A moth at rest with its wings open: unit wingspan along x, head toward +z, lying on y = 0. Pale
 * wings with a darker band and a spotted margin. Its colour goes in per vertex as a multiple of the
 * stone's, which is the merged material's own.
 */
function mothGeometry(): THREE.BufferGeometry {
  const tint = [MOTH.r / STONE.r, MOTH.g / STONE.g, MOTH.b / STONE.b];
  const position: number[] = [];
  const color: number[] = [];
  const index: number[] = [];
  const v = (x: number, y: number, z: number, shade: number): number => {
    position.push(x, y, z);
    color.push(tint[0] * shade, tint[1] * shade, tint[2] * shade);
    return position.length / 3 - 1;
  };
  // The body: a narrow diamond, a little proud of the wings.
  const nose = v(0, 0.03, 0.17, 0.5);
  const tail = v(0, 0.012, -0.2, 0.42);
  const left = v(-0.04, 0.045, 0, 0.55);
  const right = v(0.04, 0.045, 0, 0.55);
  index.push(nose, right, left, left, right, tail);
  for (const side of [-1, 1]) {
    // Each wing fans out from its root in two rings: the band halfway, then the margin, lifting
    // toward the tip. The hindwing is tucked behind the forewing and lies flatter.
    for (const [outline, rootZ, lift] of [[FOREWING, 0.07, 0.1], [HINDWING, -0.08, 0.04]] as const) {
      const root = v(side * 0.03, 0.02, rootZ, 0.68);
      const band: number[] = [];
      const margin: number[] = [];
      outline.forEach(([x, z], i) => {
        const far = Math.hypot(x, z - rootZ) / 0.5;
        band.push(v(side * (0.03 + (x - 0.03) * 0.55), 0.016 + lift * far * far * 0.3, rootZ + (z - rootZ) * 0.55, i % 2 ? 0.56 : 0.44));
        margin.push(v(side * x, 0.012 + lift * far * far, z, i % 2 ? 0.36 : 0.62));
      });
      for (let i = 0; i < outline.length - 1; i++) {
        index.push(root, band[i], band[i + 1], band[i], margin[i], band[i + 1], band[i + 1], margin[i], margin[i + 1]);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
  g.setIndex(index);
  return g;
}

/** A stone standing in the pool, as [x, z, top y, radius of its top, sides]. */
export type Stone = [number, number, number, number, number];

/**
 * The way out to the landmark tree: three stones stepping down from the east terrace's north edge
 * (z = 2.2, top 0.98) to a slab in the crook between the tree's two low boughs. They pass north of
 * the boulder on the terrace's corner, whose collision box reaches z = 4.26.
 *
 * Every gap takes the same jump: about 1.2 m of water between tops 1.5 m across. A walking jump
 * carries 2.1 m (src/content/tuning.ts), so taking off anywhere in the last 0.8 m of one stone
 * lands on the next. A first gap short enough to stride was tried and was a trap: the same jump
 * from its edge overshot the stone. A sprinting jump (3.7 m) clears a stone altogether.
 */
export const STEPPING_STONES: Stone[] = [
  [16.9, 4.2, 0.82, 0.75, 8],
  [19.26, 5.41, 0.66, 0.75, 7],
  [21.62, 6.62, 0.5, 0.75, 8],
  [24.3, 8.0, 0.36, 1.2, 8],
];

/** How far a stone's foot spreads past its top. */
const STONE_FLARE = 1.3;

/**
 * A stone's solid, from its flat top down past the waterline: what is drawn and what is stood on.
 * A chamfer runs round under the top, the sides flare toward the foot, and each corner sits in or
 * out by up to 9%, the same at every height, so no two stones are the same polygon.
 */
export function stoneGeometry([x, z, top, radius, sides]: Stone, waterY: number): THREE.BufferGeometry {
  const bottom = waterY - 0.6;
  const height = top - bottom;
  const g = new THREE.CylinderGeometry(radius, radius * STONE_FLARE, height, sides, 2);
  const pos = g.getAttribute('position');
  const midRadius = (radius * (1 + STONE_FLARE)) / 2;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const pz = pos.getZ(i);
    if (Math.hypot(px, pz) < 1e-4) continue;
    const corner = (Math.round((Math.atan2(pz, px) / (Math.PI * 2)) * sides) + sides) % sides;
    const hash = Math.sin((corner + 1) * 12.9898 + x * 78.233 + z * 37.719) * 43758.5453;
    const uneven = 0.91 + 0.18 * (hash - Math.floor(hash));
    // The cylinder's middle ring becomes the chamfer's lower edge, just under the top.
    const shoulder = Math.abs(pos.getY(i)) < 1e-4;
    const k = (shoulder ? (radius * 1.12) / midRadius : 1) * uneven;
    pos.setXYZ(i, px * k, shoulder ? height / 2 - 0.14 : pos.getY(i), pz * k);
  }
  g.rotateY((x * 1.7 + z) % Math.PI);
  g.translate(x, (top + bottom) / 2, z);
  return g;
}

/**
 * Every column, each with its own height, turn and lean, and the moths at rest on `perches`: small
 * pale moths drawn to the glyph lights, still as the stone. Columns, moths and `stones` are all
 * flat-shaded with their colour per vertex, so they merge into one mesh, one material and one draw
 * call.
 */
export function buildRuins(waterY: number, perches: MothPerch[], count = COLUMNS.length, stones: Stone[] = []): { mesh: THREE.Mesh; shores: ShoreShape[]; colliders: THREE.Box3[] } {
  const columns = COLUMNS.slice(0, count);
  const column = columnGeometry();
  const parts: THREE.BufferGeometry[] = [];
  // Out of reach on foot, but not of a jump off the terrace edges: each column is solid.
  const colliders: THREE.Box3[] = [];
  for (const [x, z, stretch, yaw, lean] of columns) {
    const g = column.clone();
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y > SHAFT_FROM) pos.setY(i, SHAFT_FROM + (y - SHAFT_FROM) * stretch);
    }
    g.applyMatrix4(_m.compose(_p.set(x, waterY - PLINTH_TOP, z), _q.setFromEuler(_e.set(lean, yaw, lean * 0.6, 'YXZ')), _s.set(1, 1, 1)));
    g.computeBoundingBox();
    colliders.push(g.boundingBox!.clone());
    parts.push(g);
  }
  column.dispose();
  if (perches.length) {
    const moth = mothGeometry();
    const turn = new THREE.Quaternion();
    for (const perch of perches) {
      perch.parent.updateWorldMatrix(true, false);
      _q.setFromUnitVectors(UP, perch.normal).multiply(turn.setFromAxisAngle(UP, perch.turn));
      const g = moth.clone();
      g.applyMatrix4(_m.compose(perch.position, _q, _s.setScalar(perch.span)).premultiply(perch.parent.matrixWorld));
      parts.push(g);
    }
    moth.dispose();
  }
  for (const stone of stones) {
    const g = stoneGeometry(stone, waterY);
    g.deleteAttribute('normal');
    g.deleteAttribute('uv');
    // A trodden top with a little moss in it, a paler chamfer, and dark where the water has been.
    const pos = g.getAttribute('position');
    const col = new Float32Array(pos.count * 3);
    const top = stone[2];
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      // Worn darker where feet land, mossier toward the rim.
      if (y > top - 0.01) col.set(Math.hypot(pos.getX(i) - stone[0], pos.getZ(i) - stone[1]) < 0.01 ? [0.72, 0.8, 0.74] : [0.94, 1.1, 0.9], i * 3);
      else if (y > top - 0.2) col.set([1.08, 1.1, 1.06], i * 3);
      else col.fill(0.45 + 0.4 * THREE.MathUtils.smoothstep(y, waterY, waterY + 0.4), i * 3, i * 3 + 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(g);
  }
  const merged = mergeGeometries(parts, false)!;
  for (const g of parts) g.dispose();

  // The chamber's cut stone (hush/chamber.ts): flat-shaded and untextured, with the mottling and
  // moss the art bible asks worn stone to carry in its vertex colours. Double-sided for the moths,
  // whose wings are single sheets.
  const mat = new THREE.MeshStandardMaterial({ color: STONE, roughness: 0.88, flatShading: true, vertexColors: true, side: THREE.DoubleSide });
  addWake(mat, WAKE_GREEN.clone().multiplyScalar(0.02), 0.6);
  const mesh = new THREE.Mesh(merged, mat);
  mesh.name = 'ruins';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return { mesh, shores: [...columns.map(([x, z]) => ({ x, z, hx: 1.1 })), ...stones.map(([x, z, , radius]) => ({ x, z, hx: radius * STONE_FLARE + 0.2 }))], colliders };
}

// --- Loam banks --------------------------------------------------------------------------------

/**
 * Low loam mounds under the trees that used to stand straight out of open water, so the belts read
 * as banks and the pool gets a shoreline. `spots` are the trees' positions.
 */
export function buildBanks(spots: { x: number; z: number }[], waterY: number): { mesh: THREE.Mesh; shores: ShoreShape[] } {
  const rand = seeded(0x51a7c3e9);
  const dome = new THREE.SphereGeometry(1, 9, 3, 0, Math.PI * 2, 0, Math.PI / 2);
  const parts: THREE.BufferGeometry[] = [];
  const shores: ShoreShape[] = [];
  for (const { x, z } of spots) {
    const r = 2.5 + rand() * 1.5;
    const g = dome.clone();
    g.applyMatrix4(_m.compose(_p.set(x, waterY - 0.14, z), _q.setFromEuler(_e.set(0, rand() * Math.PI * 2, 0)), _s.set(r, 0.5 + rand() * 0.4, r * (0.75 + rand() * 0.35))));
    parts.push(g);
    shores.push({ x, z, hx: r * 0.85 });
  }
  dome.dispose();
  const merged = mergeGeometries(parts, false)!;
  for (const g of parts) g.dispose();
  // One texture scale across every mound, so overlapping ones read as a single bank.
  const pos = merged.getAttribute('position') as THREE.BufferAttribute;
  const uv = merged.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 3.4, pos.getZ(i) / 3.4);

  const mat = new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true, map: loadColour('forest_ground') });
  tintByLuminance(mat, 0x7a8478, 4.5);
  addWake(mat, WAKE_GREEN.clone().multiplyScalar(0.012), 0.5);
  const mesh = new THREE.Mesh(merged, mat);
  mesh.name = 'banks';
  mesh.receiveShadow = true;
  return { mesh, shores };
}

// --- Moss --------------------------------------------------------------------------------------

/** A terrace's walking surface as [centre x, centre z, half width, half depth, top y]. */
type Cap = [number, number, number, number, number];
const PLAZA: Cap = [0, 2, 7.7, 7.7, 0.38];
const LANDING: Cap = [0, 16, 4.7, 4.7, 0.38];
const WEST: Cap = [-16, -2, 4.7, 4.2, 0.98];
const EAST: Cap = [16, -2, 4.7, 4.2, 0.98];

/**
 * Moss patches as [terrace, x, z, radius]: creeping in from the corners and quiet edges, clear of
 * the ramps' feet and the trodden middle of each terrace.
 */
const MOSS: [Cap, number, number, number][] = [
  [PLAZA, -6.3, -4.4, 2.3],
  [PLAZA, 6.2, -4.6, 2.0],
  [PLAZA, -6.7, 3.7, 1.5],
  [PLAZA, 6.8, 3.9, 1.5],
  [PLAZA, 0.4, 8.7, 2.1],
  [LANDING, -3.5, 12.5, 1.8],
  [LANDING, 3.9, 13.0, 1.4],
  [LANDING, -3.6, 19.8, 1.6],
  [WEST, -19.3, 1.3, 2.0],
  [WEST, -12.5, -5.3, 1.7],
  [WEST, -14.3, 1.5, 1.3],
  [EAST, 19.4, 1.1, 2.1],
  [EAST, 12.7, -5.1, 1.7],
  [EAST, 18.7, -5.3, 1.5],
  [EAST, 14.4, 1.6, 1.2],
];

/**
 * Moss on the terrace tops: flat patches that fade out at a ragged edge, so stone shows through at
 * the margins instead of meeting a cut line. A patch stops at its terrace's edge.
 */
export function buildMoss(): THREE.Mesh {
  const rand = seeded(0x2f6e11b5);
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const RIM = 12;
  for (const [[cx, cz, hx, hz, top], x, z, radius] of MOSS) {
    const y = top + 0.012;
    const clampX = (v: number) => THREE.MathUtils.clamp(v, cx - hx + 0.03, cx + hx - 0.03);
    const clampZ = (v: number) => THREE.MathUtils.clamp(v, cz - hz + 0.03, cz + hz - 0.03);
    // [x, z, shade, alpha]: a solid inner ring and a clear outer one.
    type Corner = [number, number, number, number];
    const inner: Corner[] = [];
    const outer: Corner[] = [];
    const turn = rand() * Math.PI * 2;
    for (let i = 0; i < RIM; i++) {
      const a = turn + (i / RIM) * Math.PI * 2;
      const r = radius * (0.7 + rand() * 0.5);
      const shade = 0.7 + rand() * 0.3;
      inner.push([clampX(x + Math.cos(a) * r * 0.55), clampZ(z + Math.sin(a) * r * 0.55), shade, 1]);
      outer.push([clampX(x + Math.cos(a) * r), clampZ(z + Math.sin(a) * r), shade, 0]);
    }
    const centre: Corner = [clampX(x), clampZ(z), 1, 1];
    const tri = (...corners: Corner[]) => {
      for (const [px, pz, shade, alpha] of corners) {
        positions.push(px, y, pz);
        uvs.push(px / 2.6, pz / 2.6);
        colors.push(shade, shade, shade, alpha);
      }
    };
    for (let i = 0; i < RIM; i++) {
      const j = (i + 1) % RIM;
      // Wound so the face normal points up.
      tri(centre, inner[j], inner[i]);
      tri(inner[i], inner[j], outer[j]);
      tri(inner[i], outer[j], outer[i]);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geo.computeVertexNormals();

  // Polygon offset as well as the lift: at a glancing angle 12 mm is not enough depth to separate.
  const mat = new THREE.MeshStandardMaterial({
    roughness: 1,
    map: loadColour('grass_ground'),
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  tintByLuminance(mat, 0x4f8f78, 2.0);
  addWake(mat, WAKE_GREEN.clone().multiplyScalar(0.02), 0.8);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'moss';
  mesh.receiveShadow = true;
  return mesh;
}

// --- Resonant crystal in the Heart's basin -----------------------------------------------------

/**
 * Clusters as [angle, radius, height, lean] in the Heart's own frame, between its vanes and tight
 * to the plinth. None stands taller than the plinth, so the basin hides no more than it did.
 */
const CRYSTALS: [number, number, number, number][] = [
  [0.1, 1.14, 0.84, 0.2],
  [Math.PI * 2 / 3 - 0.15, 1.1, 0.66, 0.26],
  [Math.PI * 4 / 3 + 0.2, 1.2, 0.74, 0.22],
  [Math.PI * 2 / 3 + 0.75, 1.32, 0.4, 0.34],
];

/**
 * The cluster's shards as [x, z, radius, height, lean, direction leaned in]: one tall in the middle,
 * four long ones leaning out round it, three shorter ones lower, and four chips lying at the root.
 */
const SHARDS: [number, number, number, number, number, number][] = [
  [0, 0, 0.09, 1.0, 0.06, 0.4],
  [0.07, 0.03, 0.076, 0.84, 0.38, 0.3],
  [-0.05, 0.07, 0.07, 0.74, 0.46, 2.1],
  [-0.04, -0.07, 0.074, 0.8, 0.42, 4.0],
  [0.06, -0.06, 0.062, 0.64, 0.6, 5.4],
  [0.1, 0.09, 0.056, 0.5, 0.82, 1.2],
  [-0.11, 0.0, 0.058, 0.54, 0.78, 3.1],
  [0.02, -0.12, 0.054, 0.46, 0.88, 4.7],
  [0.15, -0.02, 0.044, 0.3, 1.12, 6.0],
  [-0.08, 0.13, 0.042, 0.27, 1.18, 2.5],
  [-0.12, -0.1, 0.044, 0.29, 1.1, 3.7],
  [0.07, 0.15, 0.04, 0.24, 1.2, 1.6],
];

/** How light each of a shard's six faces is, so the facets read under any light. */
const FACETS = [1, 0.66, 0.84, 0.58, 0.92, 0.72];

/**
 * A cluster of six-sided shards on one root, a unit tall: each a prism widening a little toward a
 * short point, leaning out from the middle. Every face has its own corners, so each carries one
 * shade: dark at the root, pale at the point. The same height and footprint as the modelled cluster
 * it replaced (D-30).
 */
function crystalGeometry(): THREE.BufferGeometry {
  const position: number[] = [];
  const color: number[] = [];
  const at = new THREE.Vector3();
  SHARDS.forEach(([x, z, radius, height, lean, toward], shard) => {
    // About the axis square to the lean, so the point tips toward (cos, sin) of `toward`.
    _q.setFromAxisAngle(_p.set(Math.sin(toward), 0, -Math.cos(toward)), lean);
    const put = (k: number, ly: number, r: number, shade: number) => {
      const a = ((k % 6) / 6) * Math.PI * 2 + shard;
      at.set(Math.cos(a) * r, ly, Math.sin(a) * r).applyQuaternion(_q);
      position.push(at.x + x, at.y, at.z + z);
      color.push(shade, shade, shade);
    };
    const shoulder = height * 0.86;
    for (let k = 0; k < 6; k++) {
      const face = FACETS[(k + shard) % 6];
      // The side, root to shoulder, then the point above it.
      put(k, 0, radius * 0.8, face * 0.4);
      put(k, shoulder, radius, face);
      put(k + 1, 0, radius * 0.8, face * 0.4);
      put(k + 1, 0, radius * 0.8, face * 0.4);
      put(k, shoulder, radius, face);
      put(k + 1, shoulder, radius, face);
      put(k, shoulder, radius, face * 1.15);
      put(k, height, 0, 1.35);
      put(k + 1, shoulder, radius, face * 1.15);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
  return g;
}

/**
 * Resonant crystal ("Kindling-grown; holds a colour and gives it back", LORE.md) grown up through
 * the Heart's water. Dark and cold while the Heart sleeps; the wake leaves it lit.
 */
export function addHeartCrystals(heartRoot: THREE.Group, count = CRYSTALS.length): void {
  // The Heart's own azure; the facets' shading is in the geometry.
  const material = new THREE.MeshStandardMaterial({ color: 0x8fd6ee, roughness: 0.28, metalness: 0, flatShading: true, vertexColors: true, emissive: 0x2a8fa0, emissiveIntensity: 0.06 });
  addWake(material, new THREE.Color(0x5fb4d0).multiplyScalar(0.3), 1.2);
  const mesh = new THREE.InstancedMesh(crystalGeometry(), material, count);
  CRYSTALS.slice(0, count).forEach(([a, r, height, lean], i) => {
    // Leaning outward from the plinth, each turned differently about its own axis.
    _q.setFromEuler(_e.set(lean * Math.cos(a), a * 2.3, -lean * Math.sin(a), 'XZY'));
    mesh.setMatrixAt(i, _m.compose(_p.set(Math.sin(a) * r, 0.05, Math.cos(a) * r), _q, _s.setScalar(height)));
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.name = 'heart-crystals';
  mesh.castShadow = true;
  heartRoot.add(mesh);
}

// --- Trees -------------------------------------------------------------------------------------

/** A tree's place as [x, z, scale, yaw]. */
type TreeSpot = [number, number, number, number];

/**
 * The landmark: one broad jacaranda on its own islet east of the plaza, where the view across the
 * water used to be empty. Its crown stops short of the east terrace, so nothing hangs over a path.
 */
export const LANDMARK_TREE: TreeSpot[] = [[27, 8, 0.7, 2.4]];

/**
 * Small understory trees in the open water between the terraces and the tree belts, so there is a
 * middle distance. The low tier plants none: they are its most expensive dressing.
 */
export const UNDERSTORY_TREES: TreeSpot[] = [
  [-25.5, 3.5, 1.3, 0.7],
  [26.5, -10, 1.15, 3.9],
  [-10.5, 25.5, 1.4, 5.2],
  [21, 15.5, 1.0, 1.8],
  [-19, -15, 1.25, 2.9],
  [10, 26.5, 1.1, 0.2],
  [19.5, -15.5, 1.45, 4.6],
  [-26.5, -8.5, 0.95, 1.1],
];

/** Where the new trees stand, for the banks under them; the landmark gets a wider islet. */
export function treeBankSpots(understory: TreeSpot[]): { x: number; z: number }[] {
  const [[x, z]] = LANDMARK_TREE;
  return [{ x, z }, { x: x - 2.2, z: z + 2.4 }, { x: x + 2.6, z: z - 1.6 }, ...understory.map(([tx, tz]) => ({ x: tx, z: tz }))];
}

const BARK = 0x7a4a38;
/** Each leaf card is one quad: two triangles. */
const LEAF_CARD_INDICES = 6;

/**
 * A rebuilt tree model as instanced meshes: bark, then leaves last, the order its file is written
 * in. `leafShare` draws only that fraction of the leaf cards; they are stored shuffled, so any
 * leading share is an evenly thinned crown rather than one side of the tree.
 */
export async function buildTrees(
  name: 'jacaranda' | 'tree_small',
  spots: TreeSpot[],
  waterY: number,
  leafShare: number,
): Promise<{ bark: THREE.InstancedMesh[]; leaves: THREE.InstancedMesh }> {
  const prims = await loadProp(name);
  const meshes = prims.map(({ geometry, material }) => {
    const mesh = new THREE.InstancedMesh(geometry, material, spots.length);
    spots.forEach(([x, z, scale, yaw], i) => {
      mesh.setMatrixAt(i, _m.compose(_p.set(x, waterY + 0.1, z), _q.setFromEuler(_e.set(0, yaw, 0)), _s.setScalar(scale)));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // Same reason as the kit's trees (kit.ts): the bounding sphere is the template's, not the scatter's.
    mesh.frustumCulled = false;
    return mesh;
  });
  const leaves = meshes[meshes.length - 1];
  const bark = meshes.slice(0, -1);
  const cards = leaves.geometry.index!.count / LEAF_CARD_INDICES;
  leaves.geometry.setDrawRange(0, Math.floor(cards * leafShare) * LEAF_CARD_INDICES);
  // Photographed bark, brought to the kit trunks' painted red-brown by its brightness alone.
  for (const mesh of bark) tintByLuminance(mesh.material as THREE.MeshStandardMaterial, BARK, 2.4);
  return { bark, leaves };
}

// --- Mist --------------------------------------------------------------------------------------

function noiseTexture(): THREE.CanvasTexture {
  const size = 256;
  const rand = seeded(0x7c3d2a19);
  // Two octaves of value noise on a wrapping lattice, so the texture tiles.
  const lattice = (cells: number) => {
    const v = Float32Array.from({ length: cells * cells }, () => rand());
    return (x: number, y: number) => {
      const fx = (x / size) * cells;
      const fy = (y / size) * cells;
      const x0 = Math.floor(fx) % cells;
      const y0 = Math.floor(fy) % cells;
      const x1 = (x0 + 1) % cells;
      const y1 = (y0 + 1) % cells;
      const tx = fx - Math.floor(fx);
      const ty = fy - Math.floor(fy);
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      return THREE.MathUtils.lerp(THREE.MathUtils.lerp(v[y0 * cells + x0], v[y0 * cells + x1], sx), THREE.MathUtils.lerp(v[y1 * cells + x0], v[y1 * cells + x1], sx), sy);
    };
  };
  const coarse = lattice(6);
  const fine = lattice(17);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = (coarse(x, y) * 0.68 + fine(x, y) * 0.32) * 255;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

export interface Mist {
  mesh: THREE.Mesh;
  update(time: number): void;
  dispose(): void;
}

/**
 * Mist lying on the pool: a thin drifting sheet just above the water. three.js has no
 * volumetric fog and a ray-marched one is far beyond the target laptops, so depth comes from the
 * scene's exponential fog plus this sheet, which thins out near the eye and into the distance.
 */
export function buildMist(waterY: number): Mist {
  const noise = noiseTexture();
  const sheet = new THREE.CircleGeometry(92, 20);
  sheet.rotateX(-Math.PI / 2);
  const time = { value: 0 };
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uNoise: { value: noise },
      uTime: time,
      uColor: { value: new THREE.Color(0x35585a) },
      uOpacity: { value: 0.5 },
    },
    transparent: true,
    depthWrite: false,
    vertexShader: `varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `uniform sampler2D uNoise; uniform float uTime; uniform vec3 uColor; uniform float uOpacity;
      varying vec3 vWorld;
      void main() {
        vec2 p = vWorld.xz;
        float a = texture2D(uNoise, p * 0.019 + uTime * vec2(0.0040, 0.0026)).r;
        float b = texture2D(uNoise, p * 0.053 - uTime * vec2(0.0062, -0.0031)).r;
        float wisp = smoothstep(0.38, 0.82, a * 0.66 + b * 0.34);
        float d = distance(vWorld, cameraPosition);
        float reach = smoothstep(5.0, 17.0, d) * (1.0 - smoothstep(50.0, 90.0, d));
        gl_FragColor = vec4(uColor, wisp * reach * uOpacity);
      }`,
  });
  const mesh = new THREE.Mesh(sheet, mat);
  mesh.name = 'mist';
  mesh.position.y = waterY + 0.4;
  // After the water, before the haze walls (5) behind the far terraces.
  mesh.renderOrder = 4;
  return {
    mesh,
    update(t) {
      time.value = t;
    },
    dispose() {
      noise.dispose();
    },
  };
}
