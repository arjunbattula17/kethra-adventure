import * as THREE from 'three';
import { mulberry32 } from '../../core/rng';
import { bakeInto } from './bake';

/**
 * The ship on the title: a long armoured survey cruiser seen from above and behind, banked toward
 * the camera, cruising over Kethra on four blue engines.
 *
 * Built in code like the rest of the backdrop. The hull is a lofted keel section with a dorsal spine,
 * a bridge and stepped nose plates, flanked by two engine nacelles fused along its after half (two
 * engines each), with booms running aft above the nacelles and under the keel. Every part is a loft of
 * chamfered sections, so edges catch light the way plating does. One merged mesh, flat-shaded.
 *
 * Surface: a panel sheet baked once on the GPU (plates split at random, grooves between them, vents,
 * raised blocks, bolt rows and the odd strip of lit ports), box-projected in the hull's own space, its
 * height read as bump through screen derivatives (no tangents). Shading: a key from the sunrise's side,
 * raised so the deck takes a warm sheen; the sun's hard rim from behind; a cool fill from our side so the
 * flank toward us reads; Kethra's bounce from below; the engines' blue on the stern; and reflections of
 * an analytic sky (space, the sun, the planet and its limb), so the metal has something to show.
 *
 * Engines: each bell's throat glows, a camera-facing glow sits in its mouth, and a plume runs aft as a
 * ribbon turned toward the camera about its own axis, with streaks flowing out of the nozzle. Plumes and
 * glows are one additive draw.
 *
 * Ship axes: +X nose, -X stern (engines), +Y dorsal, +Z starboard. The hull is ~11 units long, a
 * little under half as wide and a quarter as tall.
 */

/** Material classes, carried per vertex (aMat.x). */
const PLATE = 0;
const FRAME = 1;
const METAL = 2;
const LAMP = 3;
const BELL = 4;
const THROAT = 5;

/** From the nose tip to the mouths of the engine bells, in ship units: the length the composition places. */
export const SHIP_NOSE_X = 5.6;
export const SHIP_STERN_X = -5.4;

/** Plume length at full thrust, in nozzle radii. */
const PLUME_LENGTH = 30;
/** The plume's length as thrust runs out, as a fraction of PLUME_LENGTH (its brightness goes to zero). */
const PLUME_SHORT = 0.3;
/** The bells' own glow (throats, the blue on the stern) with the engines off: hot metal, no exhaust. */
const ENGINE_IDLE = 0.3;

type YZ = [number, number];
interface Section {
  x: number;
  pts: YZ[];
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Collects flat-shaded triangles with their material class, tint and texture seed. */
class HullBuilder {
  readonly pos: number[] = [];
  readonly mat: number[] = [];
  private kind = PLATE;
  private tint = 1;
  private seed = 0;
  private xf: THREE.Matrix4 | null = null;
  private e1 = new THREE.Vector3();
  private e2 = new THREE.Vector3();
  private n = new THREE.Vector3();
  private c = new THREE.Vector3();

  private rand: () => number;

  constructor(rand: () => number) {
    this.rand = rand;
  }

  /** Sets the material class for the parts that follow; each call picks a new texture offset. */
  use(kind: number, tint = 1): this {
    this.kind = kind;
    this.tint = tint;
    this.seed = this.rand();
    return this;
  }

  /** Places what follows (built along X) with this transform; null for none. */
  place(m: THREE.Matrix4 | null): this {
    this.xf = m;
    return this;
  }

  /** One triangle, wound so its normal faces away from `inside` (or toward it, with `inward`). */
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, inside: THREE.Vector3, inward = false, tint = this.tint): void {
    this.e1.subVectors(b, a);
    this.e2.subVectors(c, a);
    this.n.crossVectors(this.e1, this.e2);
    if (this.n.lengthSq() < 1e-10) return;
    this.c.copy(a).add(b).add(c).divideScalar(3).sub(inside);
    let p = [a, b, c];
    if (this.n.dot(this.c) < 0 !== inward) p = [a, c, b];
    for (const q of p) {
      const w = this.xf ? q.clone().applyMatrix4(this.xf) : q;
      this.pos.push(w.x, w.y, w.z);
      this.mat.push(this.kind, tint, this.seed);
    }
  }

  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, inside: THREE.Vector3, inward = false): void {
    this.tri(a, b, c, inside, inward);
    this.tri(a, c, d, inside, inward);
  }

  /** Joins cross-sections (same point count, in order around) along X, capping both ends. */
  loft(sections: Section[], caps: [boolean, boolean] = [true, true]): void {
    const centre = (s: Section) => {
      let y = 0;
      let z = 0;
      for (const [py, pz] of s.pts) {
        y += py;
        z += pz;
      }
      return v(s.x, y / s.pts.length, z / s.pts.length);
    };
    const n = sections[0].pts.length;
    for (let i = 0; i < sections.length - 1; i++) {
      const A = sections[i];
      const B = sections[i + 1];
      const inside = centre(A).add(centre(B)).multiplyScalar(0.5);
      for (let j = 0; j < n; j++) {
        const k = (j + 1) % n;
        this.quad(v(A.x, A.pts[j][0], A.pts[j][1]), v(A.x, A.pts[k][0], A.pts[k][1]), v(B.x, B.pts[k][0], B.pts[k][1]), v(B.x, B.pts[j][0], B.pts[j][1]), inside);
      }
    }
    // Caps face away from the loft's middle, which lies off both end planes.
    const middle = sections.reduce((m, s) => m.add(centre(s)), new THREE.Vector3()).divideScalar(sections.length);
    const cap = (s: Section) => {
      const c = centre(s);
      for (let j = 0; j < n; j++) {
        const k = (j + 1) % n;
        this.tri(c, v(s.x, s.pts[j][0], s.pts[j][1]), v(s.x, s.pts[k][0], s.pts[k][1]), middle);
      }
    };
    if (caps[0]) cap(sections[0]);
    if (caps[1]) cap(sections[sections.length - 1]);
  }
}

/** A chamfered rectangle in (y, z) about (cy, cz): half extents hy, hz, corner cut c. */
function rect(cy: number, cz: number, hy: number, hz: number, c: number): YZ[] {
  const k = Math.max(0.0001, Math.min(c, hy * 0.45, hz * 0.45));
  return [
    [cy + hy, cz + hz - k],
    [cy + hy, cz - hz + k],
    [cy + hy - k, cz - hz],
    [cy - hy + k, cz - hz],
    [cy - hy, cz - hz + k],
    [cy - hy, cz + hz - k],
    [cy - hy + k, cz + hz],
    [cy + hy - k, cz + hz],
  ];
}

/**
 * A hull cross-section about z = cz: a flat deck (half width `deck`), sloped shoulders down to upright
 * sides (half width `w`), chines and a narrower flat keel (half width `keel`).
 */
function section(x: number, top: number, bottom: number, w: number, deck: number, keel: number, shoulder = 0.18, chine = 0.2, cz = 0): Section {
  return {
    x,
    pts: [
      [top, cz + deck],
      [top, cz - deck],
      [top - shoulder, cz - w],
      [bottom + chine, cz - w],
      [bottom, cz - keel],
      [bottom, cz + keel],
      [bottom + chine, cz + w],
      [top - shoulder, cz + w],
    ],
  };
}

/** A rectangle with rounded corners in (y, z) about z = cz: 12 points, three a corner. */
function rounded(x: number, top: number, bottom: number, w: number, rad: number, cz = 0): Section {
  const pts: YZ[] = [];
  const corners: [number, number, number][] = [
    [top - rad, cz + w - rad, 0],
    [top - rad, cz - w + rad, 90],
    [bottom + rad, cz - w + rad, 180],
    [bottom + rad, cz + w - rad, 270],
  ];
  for (const [cy, cc, a0] of corners) {
    for (let i = 0; i < 3; i++) {
      const a = ((a0 + i * 45) * Math.PI) / 180;
      pts.push([cy + Math.sin(a) * rad, cc + Math.cos(a) * rad]);
    }
  }
  return { x, pts };
}

/** A circle of `seg` points in (y, z). */
function circle(cy: number, cz: number, r: number, seg: number): YZ[] {
  const pts: YZ[] = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    pts.push([cy + Math.sin(a) * r, cz + Math.cos(a) * r]);
  }
  return pts;
}

/**
 * A slab along X, chamfered on every edge: y from y0 to y1, half width w0 at x0 tapering to w1 at x1,
 * centred on z = cz. With `lean`, the top at x1 drops by that much (a wedge).
 */
function slab(b: HullBuilder, x0: number, x1: number, y0: number, y1: number, w0: number, w1: number, cz = 0, c = 0.06, lean = 0): void {
  const e = Math.min(c, (x1 - x0) * 0.25, (y1 - y0) * 0.3);
  const at = (t: number, inset: number) => {
    const w = w0 + (w1 - w0) * t;
    const top = y1 - lean * t;
    const h = (top - y0) / 2;
    return rect(y0 + h, cz, h - inset, w - inset, c);
  };
  const span = x1 - x0;
  b.loft([
    { x: x0, pts: at(0, e) },
    { x: x0 + e, pts: at(e / span, 0) },
    { x: x1 - e, pts: at(1 - e / span, 0) },
    { x: x1, pts: at(1, e) },
  ]);
}

/** A tube along X about (cy, cz): radius r0 at x0 to r1 at x1, capped. */
function tube(b: HullBuilder, x0: number, x1: number, cy: number, cz: number, r0: number, r1: number, seg: number, c = 0.03): void {
  const e = Math.min(c, Math.abs(x1 - x0) * 0.25);
  const s = Math.sign(x1 - x0);
  b.loft([
    { x: x0, pts: circle(cy, cz, r0 - e, seg) },
    { x: x0 + e * s, pts: circle(cy, cz, r0, seg) },
    { x: x1 - e * s, pts: circle(cy, cz, r1, seg) },
    { x: x1, pts: circle(cy, cz, r1 - e, seg) },
  ]);
}

/**
 * An engine: a long can with two ribs standing out of the stern, and a flared bell, dark at the lip
 * and glowing blue toward the throat, where a white-hot core sits in a blue ring. `mouth` is the x of
 * the bell's lip.
 */
function engine(b: HullBuilder, mouth: number, cy: number, cz: number, r: number): void {
  const seg = 24;
  const throatX = mouth + r * 0.9;
  b.use(METAL, 0.85);
  tube(b, throatX + r * 3.6, throatX + r * 0.25, cy, cz, r * 1.08, r * 1.12, seg);
  b.use(FRAME);
  for (const at of [2.4, 1.2]) tube(b, throatX + r * at, throatX + r * (at - 0.32), cy, cz, r * 1.22, r * 1.22, seg, 0.02);
  // The bell's outside, and its lip.
  b.use(METAL, 0.7);
  b.loft(
    [
      { x: throatX + r * 0.3, pts: circle(cy, cz, r * 1.1, seg) },
      { x: mouth + r * 0.35, pts: circle(cy, cz, r * 1.12, seg) },
      { x: mouth, pts: circle(cy, cz, r * 1.2, seg) },
    ],
    [false, false],
  );
  // Inside: from the lip in to the throat, normals toward the axis, glowing more the deeper it goes.
  const inner: [number, number, number][] = [
    [mouth, r * 1.13, 0.06],
    [mouth + r * 0.4, r * 0.98, 0.3],
    [throatX - r * 0.1, r * 0.8, 0.85],
  ];
  for (let i = 0; i < inner.length - 1; i++) {
    const [xa, ra, ga] = inner[i];
    const [xb, rb, gb] = inner[i + 1];
    const A = circle(cy, cz, ra, seg);
    const B = circle(cy, cz, rb, seg);
    b.use(BELL);
    for (let j = 0; j < seg; j++) {
      const k = (j + 1) % seg;
      const axisPoint = v((xa + xb) / 2, cy, cz);
      const a0 = v(xa, A[j][0], A[j][1]);
      const a1 = v(xa, A[k][0], A[k][1]);
      const b1 = v(xb, B[k][0], B[k][1]);
      const b0 = v(xb, B[j][0], B[j][1]);
      b.tri(a0, a1, b1, axisPoint, true, ga);
      b.tri(a0, b1, b0, axisPoint, true, (ga + gb) / 2);
    }
  }
  // The lip ring joins outside to inside.
  const lipOut = circle(cy, cz, r * 1.2, seg);
  const lipIn = circle(cy, cz, r * 1.13, seg);
  b.use(METAL, 0.9);
  for (let j = 0; j < seg; j++) {
    const k = (j + 1) % seg;
    b.quad(v(mouth, lipOut[j][0], lipOut[j][1]), v(mouth, lipOut[k][0], lipOut[k][1]), v(mouth, lipIn[k][0], lipIn[k][1]), v(mouth, lipIn[j][0], lipIn[j][1]), v(mouth + 1, cy, cz));
  }
  // The throat: a blue ring round a white-hot core.
  const tx = throatX - r * 0.1;
  const away = v(tx + 1, cy, cz);
  const ring = circle(cy, cz, r * 0.8, seg);
  const core = circle(cy, cz, r * 0.42, seg);
  b.use(BELL);
  for (let j = 0; j < seg; j++) {
    const k = (j + 1) % seg;
    b.tri(v(tx, ring[j][0], ring[j][1]), v(tx, ring[k][0], ring[k][1]), v(tx, core[k][0], core[k][1]), away, false, 1.0);
    b.tri(v(tx, ring[j][0], ring[j][1]), v(tx, core[k][0], core[k][1]), v(tx, core[j][0], core[j][1]), away, false, 1.0);
  }
  b.use(THROAT);
  const centre = v(tx, cy, cz);
  for (let j = 0; j < seg; j++) {
    const k = (j + 1) % seg;
    b.tri(centre, v(tx, core[j][0], core[j][1]), v(tx, core[k][0], core[k][1]), away);
  }
}

/** The engines' mouths (ship space) and radii: two per nacelle. */
interface EngineSpec {
  at: THREE.Vector3;
  r: number;
}

function buildHull(rand: () => number): { geometry: THREE.BufferGeometry; engines: EngineSpec[] } {
  const b = new HullBuilder(rand);
  const engines: EngineSpec[] = [];

  // --- The main hull: a deep keel section, tallest amidships, narrowing to a chisel nose.
  b.use(PLATE);
  b.loft([
    section(-3.7, 0.62, -0.62, 1.0, 0.66, 0.56),
    section(-1.0, 0.72, -0.7, 1.12, 0.76, 0.62, 0.2, 0.22),
    section(1.3, 0.72, -0.68, 1.06, 0.72, 0.58, 0.2, 0.22),
    section(3.3, 0.6, -0.56, 0.8, 0.5, 0.42),
    section(4.7, 0.36, -0.32, 0.44, 0.24, 0.2, 0.12, 0.12),
    section(SHIP_NOSE_X, 0.12, -0.08, 0.14, 0.07, 0.05, 0.04, 0.04),
  ]);

  // --- Dorsal: the spine, deck plates, the bridge and the stepped plates down to the nose.
  b.use(FRAME);
  slab(b, -3.1, 2.2, 0.66, 1.0, 0.4, 0.34, 0, 0.08);
  b.use(PLATE, 1.08);
  for (const s of [1, -1]) slab(b, -3.3, 2.6, 0.66, 0.8, 0.2, 0.18, s * 0.56, 0.04);
  b.use(PLATE, 1.14);
  slab(b, 0.35, 1.8, 0.96, 1.24, 0.5, 0.38, 0, 0.1, 0.08);
  b.use(FRAME);
  slab(b, 0.6, 1.5, 1.22, 1.3, 0.34, 0.26, 0, 0.03);
  b.use(METAL);
  slab(b, 0.9, 0.96, 1.28, 1.56, 0.025, 0.025, 0, 0.01);
  b.use(PLATE, 0.96);
  slab(b, 1.9, 3.8, 0.62, 0.78, 0.64, 0.4, 0, 0.05, 0.08);
  slab(b, 3.5, 4.95, 0.46, 0.6, 0.4, 0.18, 0, 0.04, 0.14);
  b.use(PLATE, 1.05);
  slab(b, -3.85, -1.6, 0.56, 0.86, 0.86, 0.84, 0, 0.07);

  // Layered plates along the deck edges and down the bow's shoulders.
  for (const s of [1, -1]) {
    b.use(PLATE, 1.12);
    slab(b, -1.4, 0.3, 0.6, 0.74, 0.16, 0.16, s * 0.94, 0.03);
    slab(b, 0.4, 2.1, 0.6, 0.74, 0.16, 0.15, s * 0.94, 0.03);
    b.use(PLATE, 0.9);
    slab(b, 2.0, 3.3, 0.38, 0.6, 0.08, 0.06, s * 0.88, 0.03, 0.06);
    slab(b, 3.4, 4.6, 0.2, 0.44, 0.07, 0.05, s * 0.6, 0.03, 0.08);
  }

  // --- Bridge windows, and ports along the bow.
  b.use(LAMP, 0.4);
  slab(b, 1.74, 1.82, 1.06, 1.12, 0.32, 0.3, 0, 0.005);
  for (const s of [1, -1]) {
    for (let i = 0; i < 4; i++) slab(b, 2.85 + i * 0.24, 2.99 + i * 0.24, 0.2, 0.27, 0.02, 0.02, s * (0.88 - i * 0.065), 0.005);
  }

  // --- Flank armour forward of the nacelles: two rows of plates with gaps, and a pipe run.
  for (const s of [1, -1]) {
    b.use(PLATE, 1.04);
    for (const [x0, x1, z0, z1] of [[1.55, 2.45, 1.07, 0.98], [2.55, 3.35, 0.96, 0.83]]) {
      const mid = (x0 + x1) / 2;
      const zm = s * ((z0 + z1) / 2 + 0.04);
      const len = Math.hypot(x1 - x0, z0 - z1);
      const m = new THREE.Matrix4().makeRotationY(s * Math.atan2(z0 - z1, x1 - x0));
      m.setPosition(mid, 0, zm);
      b.place(m);
      slab(b, -len / 2, len / 2, -0.34, 0.34, 0.05, 0.05, 0, 0.02);
      slab(b, -len / 2 + 0.06, len / 2 - 0.06, -0.58, -0.42, 0.04, 0.04, -0.01 * s, 0.015);
    }
    b.place(null);
    b.use(METAL, 0.9);
    slab(b, 1.4, 2.9, 0.42, 0.48, 0.035, 0.035, s * 1.06, 0.01);
  }

  // --- The nacelles: deep housings fused along the after half, two engines each.
  for (const s of [1, -1]) {
    const nz = s * 1.62;
    const ny = -0.1;
    b.use(PLATE, 0.98);
    b.loft([
      rounded(-4.2, ny + 0.56, ny - 0.6, 0.76, 0.3, nz),
      rounded(-1.2, ny + 0.62, ny - 0.64, 0.8, 0.32, nz),
      rounded(0.4, ny + 0.5, ny - 0.54, 0.64, 0.26, nz - s * 0.14),
      rounded(1.6, ny + 0.18, ny - 0.28, 0.28, 0.1, nz - s * 0.46),
    ]);
    // Armour on the outer flank, light bars above the plates, radiator fins under them.
    const outer = nz + s * 0.8;
    b.use(PLATE, 1.06);
    for (const [x0, x1] of [[-4.0, -3.0], [-2.9, -1.9], [-1.8, -0.7], [-0.6, 0.4]]) slab(b, x0, x1, ny - 0.24, ny + 0.32, 0.045, 0.045, outer, 0.02);
    b.use(PLATE, 0.92);
    for (const [x0, x1] of [[-4.0, -3.3], [-3.2, -2.2], [-2.1, -1.2], [-1.1, 0.2]]) slab(b, x0, x1, ny - 0.48, ny - 0.3, 0.035, 0.035, outer - s * 0.05, 0.015);
    b.use(PLATE, 1.1);
    for (const [x0, x1] of [[-4.0, -2.8], [-2.7, -1.0], [-0.9, 0.5]]) slab(b, x0, x1, ny + 0.56, ny + 0.66, 0.22, 0.2, nz + s * 0.26, 0.02);
    b.use(LAMP, 0.15);
    slab(b, -2.6, -2.1, ny + 0.42, ny + 0.46, 0.02, 0.02, outer + s * 0.02, 0.004);
    slab(b, -1.3, -0.95, ny + 0.42, ny + 0.46, 0.02, 0.02, outer + s * 0.02, 0.004);
    b.use(FRAME);
    for (let i = 0; i < 6; i++) slab(b, -3.9 + i * 0.45, -3.72 + i * 0.45, ny - 0.5, ny - 0.3, 0.12, 0.12, outer - s * 0.06, 0.01);
    // Engines.
    for (const dz of [0.38, -0.38]) {
      const at = v(SHIP_STERN_X, ny - 0.04, nz + dz);
      engine(b, at.x, at.y, at.z, 0.35);
      engines.push({ at, r: 0.35 });
    }
    // The stern face the two engines stand out of.
    b.use(FRAME);
    slab(b, -4.35, -3.95, ny - 0.58, ny + 0.5, 0.78, 0.78, nz, 0.06);
    // The boom above the nacelle, running past the engines, with a lamp at its tip.
    b.use(FRAME, 1.06);
    slab(b, -5.75, -1.2, ny + 0.5, ny + 0.78, 0.16, 0.18, nz, 0.04);
    b.use(PLATE, 1.1);
    slab(b, -5.3, -2.4, ny + 0.78, ny + 0.84, 0.12, 0.14, nz, 0.02);
    b.use(LAMP, 0.6);
    slab(b, -5.8, -5.74, ny + 0.6, ny + 0.68, 0.05, 0.05, nz, 0.005);
  }

  // --- Keel boom running aft under the hull, its end tapered, a lamp at the tip; the bow's ventral pod.
  b.use(FRAME, 1.04);
  slab(b, -6.0, -1.0, -1.12, -0.62, 0.22, 0.3, 0, 0.06, -0.14);
  b.use(LAMP, 0.7);
  slab(b, -6.05, -5.99, -0.98, -0.86, 0.06, 0.06, 0, 0.005);
  b.use(PLATE, 1.02);
  slab(b, 0.4, 3.4, -1.1, -0.64, 0.54, 0.42, 0, 0.08, -0.08);
  b.use(FRAME);
  slab(b, 0.9, 2.8, -1.2, -1.08, 0.34, 0.3, 0, 0.03);

  // --- Greebles: small blocks on the deck and the nacelle tops, seeded. Each is rooted below the
  // surface it stands on (y) and stands up to its height above it.
  const greeble = (x0: number, x1: number, zc: number, zr: number, y: number, count: number, avoid = 0) => {
    for (let i = 0; i < count; i++) {
      const x = x0 + rand() * (x1 - x0);
      let z = zc + (rand() * 2 - 1) * zr;
      if (Math.abs(z - zc) < avoid) z = zc + Math.sign(z - zc || 1) * avoid;
      const len = 0.12 + rand() * 0.42;
      const w = 0.05 + rand() * 0.12;
      const h = 0.04 + rand() * 0.1;
      b.use(rand() < 0.6 ? FRAME : METAL, 0.85 + rand() * 0.3);
      slab(b, x, x + len, y - 0.08, y + h, w, w, z, Math.min(w, h) * 0.3);
    }
  };
  greeble(-3.2, 2.2, 0, 0.72, 0.72, 30, 0.42);
  greeble(2.0, 3.2, 0, 0.45, 0.7, 6);
  for (const s of [1, -1]) greeble(-4.0, 0.2, s * 1.62, 0.42, 0.5, 14);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  geometry.setAttribute('aMat', new THREE.Float32BufferAttribute(b.mat, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return { geometry, engines };
}

// ---------------------------------------------------------------------------------------------
// The panel sheet

const PANEL_FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  // Loop bound from a uniform (5) so Direct3D keeps a loop rather than unrolling it (see bake.ts).
  uniform int uLoop;
  float h21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  void main() {
    // 4 x 4 cells a tile, each split at random into plates (a k-d split, so it tiles).
    vec2 p = vUv * 4.0;
    vec2 cell = floor(p);
    vec2 lo = cell;
    vec2 hi = cell + 1.0;
    float id = h21(mod(cell, 4.0) + 0.37);
    for (int i = 0; i < uLoop; i++) {
      vec2 size = hi - lo;
      float fi = float(i);
      float r = h21(vec2(id * 61.7 + 0.3, fi * 1.37 + 0.7));
      if (i > 1 && r < 0.2) break;
      bool cutX = size.x > size.y * 1.6 ? true : (size.y > size.x * 1.6 ? false : r > 0.5);
      float t = 0.28 + 0.44 * h21(vec2(id * 13.1 + 2.1, fi * 3.3 + 1.1));
      if (cutX) {
        float m = mix(lo.x, hi.x, t);
        if (p.x < m) { hi.x = m; id = h21(vec2(id * 7.3, 1.0 + fi)); } else { lo.x = m; id = h21(vec2(id * 7.3, 5.0 + fi)); }
      } else {
        float m = mix(lo.y, hi.y, t);
        if (p.y < m) { hi.y = m; id = h21(vec2(id * 7.3, 9.0 + fi)); } else { lo.y = m; id = h21(vec2(id * 7.3, 13.0 + fi)); }
      }
    }
    vec2 size = hi - lo;
    vec2 q = (p - lo) / size;
    vec2 dEdge = min(p - lo, hi - p);
    float edge = min(dEdge.x, dEdge.y);
    // One cell is 128 texels: the grooves are about two texels wide.
    float groove = smoothstep(0.006, 0.018, edge);
    float type = h21(vec2(id * 3.1, 7.7));
    float plateH = 0.45 + 0.22 * h21(vec2(id * 5.7, 2.2));
    float height = plateH;
    float albedo = 0.8 + 0.2 * h21(vec2(id * 9.1, 4.4));
    float rough = 0.3 + 0.42 * h21(vec2(id * 2.9, 8.8));
    float lamp = 0.0;
    bool longX = size.x > size.y;
    float acrossQ = longX ? q.y : q.x;
    float alongQ = longX ? q.x : q.y;
    float alongLen = longX ? size.x : size.y;
    float acrossLen = longX ? size.y : size.x;
    float rim = min(min(dEdge.x, dEdge.y) / 0.06, 1.0);
    if (type < 0.15) {
      // Vents: slats across the panel, inside a recessed frame.
      float inset = step(0.05, edge);
      float slat = smoothstep(0.35, 0.5, abs(fract(alongQ * alongLen * 20.0) - 0.5) * 2.0);
      height = mix(plateH, 0.2 + 0.3 * slat, inset);
      albedo *= mix(1.0, 0.5, inset);
      rough = mix(rough, 0.6, inset);
    } else if (type < 0.3) {
      // A raised block on the plate.
      float inner = smoothstep(0.035, 0.05, edge);
      height = plateH + 0.26 * inner;
      albedo *= 1.0 + 0.12 * inner;
    } else if (type < 0.4 && acrossLen < 0.34) {
      // A strip of lit ports along a narrow plate, some dark.
      float slot = floor(alongQ * alongLen * 10.0);
      float ports = step(0.3, fract(alongQ * alongLen * 10.0)) * step(abs(acrossQ - 0.5) * acrossLen, 0.03);
      lamp = ports * step(0.45, h21(vec2(id * 4.4, slot)));
      height = plateH - 0.1 * ports;
      albedo *= 0.7;
    } else {
      // A plain plate with a bolt row inside each long edge.
      float edgeDist = min(acrossQ, 1.0 - acrossQ) * acrossLen;
      float bolts = step(abs(edgeDist - 0.03), 0.008) * step(0.55, fract(alongQ * alongLen * 26.0));
      height += 0.12 * bolts;
      albedo *= 1.0 - 0.1 * bolts;
    }
    // Panel edges sit a little proud of the plate, then drop into the groove.
    height += 0.05 * (1.0 - rim) * groove;
    // Soot and wear running along the hull.
    float lane = floor(vUv.x * 128.0);
    float wear = h21(vec2(lane, 3.3)) * smoothstep(0.3, 1.0, h21(vec2(lane, floor(vUv.y * 8.0))));
    albedo *= 1.0 - 0.22 * wear;
    height *= groove;
    albedo *= mix(0.3, 1.0, groove);
    rough = mix(0.85, rough, groove);
    gl_FragColor = vec4(height, albedo, rough, lamp);
  }
`;

/** The hull's panel sheet: R height, G albedo, B roughness, A lit ports. 512², tiling, with mipmaps. */
async function bakePanels(renderer: THREE.WebGLRenderer, pace?: () => Promise<void>): Promise<THREE.WebGLRenderTarget> {
  const target = new THREE.WebGLRenderTarget(512, 512, {
    type: THREE.UnsignedByteType,
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.RepeatWrapping,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: true,
    depthBuffer: false,
    anisotropy: 4,
  });
  target.texture.name = 'title-ship-panels';
  await bakeInto(renderer, target, PANEL_FRAGMENT, { uLoop: { value: 5 } }, { strips: 2, pace });
  return target;
}

// ---------------------------------------------------------------------------------------------
// Shaders

const HULL_VERTEX = /* glsl */ `
  attribute vec3 aMat;
  varying vec3 vPosW;
  varying vec3 vNormalW;
  varying vec3 vLocal;
  varying vec3 vLocalN;
  varying vec3 vMat;
  void main() {
    vLocal = position;
    vLocalN = normal;
    vMat = aMat;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPosW = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const HULL_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform sampler2D uPanel;
  uniform vec3 uKeyDir;
  uniform vec3 uKeyColor;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uBounceDir;
  uniform vec3 uBounceColor;
  uniform vec3 uPlanetCenter;
  uniform float uPlanetRadius;
  uniform vec3 uPlanetLight;
  uniform vec3 uEngineA;
  uniform vec3 uEngineB;
  uniform vec3 uEngineColor;
  uniform vec3 uLampColor;
  uniform vec3 uFillDir;
  uniform vec3 uFillColor;
  uniform float uPower;
  uniform float uBump;
  uniform float uFade;
  varying vec3 vPosW;
  varying vec3 vNormalW;
  varying vec3 vLocal;
  varying vec3 vLocalN;
  varying vec3 vMat;

  const float PI = 3.14159265;

  // What the metal reflects: space, Kethra below with its lit side and limb haze, the sun.
  vec3 environment(vec3 p, vec3 r, float rough) {
    vec3 oc = p - uPlanetCenter;
    float b = dot(oc, r);
    float c = dot(oc, oc) - uPlanetRadius * uPlanetRadius;
    float disc = b * b - c;
    vec3 col = vec3(0.003, 0.005, 0.011);
    if (disc > 0.0 && b < 0.0) {
      vec3 hn = normalize(oc + r * (-b - sqrt(disc)));
      float lit = smoothstep(-0.2, 0.45, dot(hn, uPlanetLight));
      col = mix(vec3(0.004, 0.012, 0.018), vec3(0.07, 0.16, 0.14), lit);
      float graze = 1.0 - max(dot(hn, -r), 0.0);
      col += vec3(0.07, 0.15, 0.3) * pow(graze, 5.0) * (0.25 + lit);
    } else {
      // Off the limb: the atmosphere's glow, by how close the ray passes.
      float closest = b < 0.0 ? sqrt(max(dot(oc, oc) - b * b, 0.0)) : length(oc);
      float h = (closest - uPlanetRadius) / (uPlanetRadius * 0.035);
      col += vec3(0.08, 0.2, 0.42) * exp(-max(h, 0.0)) * 0.9;
    }
    float s = max(dot(r, uSunDir), 0.0);
    float sharp = mix(320.0, 10.0, rough);
    col += uSunColor * pow(s, sharp) * (sharp * 0.008 + 0.1);
    return col;
  }

  void main() {
    float kind = vMat.x;
    float tint = vMat.y;
    float seed = vMat.z;
    vec3 ln = normalize(vLocalN);

    if (kind > 2.5) {
      // Lamps, the insides of the bells, the throats: light, not lit.
      vec3 e;
      if (kind < 3.5) e = uLampColor * (1.2 + 2.5 * tint);
      else if (kind < 4.5) e = uEngineColor * tint * tint * 2.3;
      else e = mix(uEngineColor, vec3(1.0), 0.55) * 2.5;
      gl_FragColor = vec4(e * (kind > 3.5 ? uPower : 1.0) * uFade, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      return;
    }

    // The panel sheet, box-projected in ship space by the face's own axis, at two scales.
    vec3 an = abs(ln);
    vec2 uv = an.x > max(an.y, an.z) ? vLocal.zy : (an.y > an.z ? vLocal.xz : vLocal.xy);
    uv = uv * 0.32 + vec2(seed * 7.31, seed * 3.17);
    vec4 s = texture2D(uPanel, uv);
    vec4 s2 = texture2D(uPanel, uv * 0.45 + vec2(0.37, 0.61));
    // The bump reads a mip down, so plating stays crisp without sparkling where the sheet is minified.
    float height = texture2D(uPanel, uv, 1.0).r * 0.7 + s2.r * 0.3;

    // Bump from the sheet's height, through screen derivatives (no tangents).
    vec3 nG = normalize(vNormalW);
    vec3 dpx = dFdx(vPosW);
    vec3 dpy = dFdy(vPosW);
    vec3 r1 = cross(dpy, nG);
    vec3 r2 = cross(nG, dpx);
    float det = dot(dpx, r1);
    vec3 grad = sign(det) * (dFdx(height) * r1 + dFdy(height) * r2);
    vec3 n = normalize(abs(det) * nG - grad * uBump);

    float isFrame = step(0.5, kind) * (1.0 - step(1.5, kind));
    float isMetal = step(1.5, kind);
    float isPlate = 1.0 - isFrame - isMetal;
    vec3 base = vec3(0.075, 0.079, 0.087) * isPlate + vec3(0.045, 0.047, 0.052) * isFrame + vec3(0.13, 0.135, 0.145) * isMetal;
    // Plates differ: some lighter, some sooted, so the hull reads as built from parts.
    float plateShade = 0.55 + 0.75 * s.g * s.g * (0.75 + 0.25 * s2.g);
    base *= tint * plateShade;
    float metal = 0.5 * isPlate + 0.65 * isFrame + 0.85 * isMetal;
    float rough = clamp(0.36 + 0.36 * s.b + 0.08 * isFrame - 0.08 * isMetal, 0.3, 0.92);
    // Grooves and the undersides are in shade.
    float ao = mix(0.4, 1.0, smoothstep(0.06, 0.34, height)) * mix(0.5, 1.0, smoothstep(-0.95, 0.15, ln.y));

    vec3 V = normalize(cameraPosition - vPosW);
    float NdV = max(dot(n, V), 1e-3);
    vec3 F0 = mix(vec3(0.04), base * 2.6 + 0.06, metal);
    vec3 diffuse = base * (1.0 - metal);

    // Key light: high on the left.
    float NdL = max(dot(n, uKeyDir), 0.0);
    vec3 H = normalize(uKeyDir + V);
    float NdH = max(dot(n, H), 0.0);
    float a = rough * rough;
    float a2 = a * a;
    float dd = NdH * NdH * (a2 - 1.0) + 1.0;
    float D = a2 / (PI * dd * dd);
    float k = (rough + 1.0) * (rough + 1.0) * 0.125;
    float G = (NdL / (NdL * (1.0 - k) + k)) * (NdV / (NdV * (1.0 - k) + k));
    vec3 F = F0 + (1.0 - F0) * pow(1.0 - max(dot(H, V), 0.0), 5.0);
    vec3 spec = D * G * F / max(4.0 * NdL * NdV, 1e-3);
    vec3 col = (diffuse + spec) * uKeyColor * NdL * mix(0.55, 1.0, ao);

    // Reflections of the sky, Kethra and the sun.
    vec3 R = reflect(-V, n);
    vec3 Fe = F0 + (max(vec3(1.0 - rough), F0) - F0) * pow(1.0 - NdV, 5.0);
    col += environment(vPosW, R, rough) * Fe * ao;

    // Kethra's bounce from below, a little cool fill, and the sun's rim from behind.
    float bounce = max(dot(n, uBounceDir) * 0.8 + 0.2, 0.0);
    col += (diffuse + F0 * 0.25) * uBounceColor * bounce * ao;
    // A cool fill from our side, the way a cinematographer would light it: enough for the plating on
    // the flank toward us to read, and a soft sheen on its metal.
    float NdF = max(dot(n, uFillDir), 0.0);
    vec3 Hf = normalize(uFillDir + V);
    col += (diffuse + F0 * pow(max(dot(n, Hf), 0.0), 24.0) * 1.4) * uFillColor * NdF * ao;
    float rim = pow(1.0 - NdV, 3.0) * max(dot(n, uSunDir) + 0.25, 0.0);
    col += uSunColor * rim * (0.05 + 0.3 * metal) * ao;

    // The engines light the stern blue.
    vec3 eA = uEngineA - vLocal;
    vec3 eB = uEngineB - vLocal;
    float dA = dot(eA, eA);
    float dB = dot(eB, eB);
    float glow = max(dot(ln, eA * inversesqrt(dA)), 0.0) / (1.0 + dA * 0.9) + max(dot(ln, eB * inversesqrt(dB)), 0.0) / (1.0 + dB * 0.9);
    col += uEngineColor * glow * uPower * (diffuse * 2.0 + F0 * 0.5);

    // Lit ports from the panel sheet, on about half the plates.
    col += uLampColor * s.a * isPlate * step(0.5, fract(seed * 13.7)) * 1.6;

    gl_FragColor = vec4(col * uFade, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const PLUME_VERTEX = /* glsl */ `
  attribute vec3 aNozzle;
  attribute vec4 aShape;
  uniform float uLength;
  varying vec2 vShape;
  varying float vKind;
  varying float vSeed;
  void main() {
    vec3 p0 = (modelMatrix * vec4(aNozzle, 1.0)).xyz;
    vec3 axisL = mat3(modelMatrix) * vec3(-1.0, 0.0, 0.0);
    float scale = length(axisL);
    vec3 axis = axisL / scale;
    vShape = aShape.xy;
    vKind = aShape.w;
    vSeed = aNozzle.z * 3.7 + aNozzle.y * 1.3;
    float r = aShape.z * scale;
    if (aShape.w < 0.5) {
      // The plume: a ribbon along the engine's axis, turned about it to face the camera.
      float along = aShape.x;
      vec3 toCam = normalize(cameraPosition - p0);
      vec3 side = normalize(cross(axis, toCam));
      float width = r * mix(1.0, 1.9, along);
      vec3 world = p0 + axis * along * uLength * r + side * aShape.y * width;
      gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
    } else {
      // The glow in the bell's mouth: a quad facing the camera.
      vec4 mv = viewMatrix * vec4(p0 + axis * r * 0.1, 1.0);
      mv.xy += aShape.xy * r * 2.6;
      gl_Position = projectionMatrix * mv;
    }
  }
`;

const PLUME_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uPower;
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uFade;
  varying vec2 vShape;
  varying float vKind;
  varying float vSeed;
  float h11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
  }
  float n11(float x) {
    float i = floor(x);
    float f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(h11(i), h11(i + 1.0), f);
  }
  void main() {
    vec3 col;
    if (vKind < 0.5) {
      float along = vShape.x;
      float across = vShape.y;
      float core = exp(-across * across * 26.0);
      float sheath = exp(-across * across * 5.0) * smoothstep(1.0, 0.7, abs(across));
      float fall = pow(1.0 - along, 2.2) * smoothstep(0.0, 0.02, along);
      // Streaks flowing out of the nozzle.
      float flow = along * 16.0 - uTime * 7.0 + vSeed;
      float streak = 0.72 + 0.28 * n11(flow + across * 2.5) + 0.14 * n11(along * 41.0 - uTime * 17.0 + across * 6.0 + vSeed);
      float hot = exp(-along * 14.0) * smoothstep(0.0, 0.03, along);
      col = uColor * (sheath * 0.42 + core * 1.05) * fall * streak + vec3(0.4, 0.74, 1.0) * core * hot * 0.5;
    } else {
      float r = length(vShape);
      float k = exp(-r * r * 26.0) * 0.55 + exp(-r * 5.0) * 0.22;
      k *= smoothstep(1.0, 0.6, r);
      col = mix(uColor, vec3(0.7, 0.9, 1.0), exp(-r * r * 200.0)) * k;
    }
    gl_FragColor = vec4(col * uPower * uFade, 1.0);
  }
`;

function buildPlumes(engines: EngineSpec[]): THREE.BufferGeometry {
  const nozzle: number[] = [];
  const shape: number[] = [];
  const index: number[] = [];
  let base = 0;
  const STEPS = 10;
  for (const e of engines) {
    // Plume ribbon: STEPS segments along, two vertices across.
    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS;
      for (const side of [-1, 1]) {
        nozzle.push(e.at.x, e.at.y, e.at.z);
        shape.push(t, side, e.r, 0);
      }
    }
    for (let i = 0; i < STEPS; i++) {
      const a = base + i * 2;
      index.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
    base += (STEPS + 1) * 2;
    // Glow quad.
    for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      nozzle.push(e.at.x, e.at.y, e.at.z);
      shape.push(x, y, e.r, 1);
    }
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
    base += 4;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(new Array(nozzle.length).fill(0), 3));
  geo.setAttribute('aNozzle', new THREE.Float32BufferAttribute(nozzle, 3));
  geo.setAttribute('aShape', new THREE.Float32BufferAttribute(shape, 4));
  geo.setIndex(index);
  return geo;
}

// ---------------------------------------------------------------------------------------------

export interface TitleShip {
  /** Placed and flown by TitleScene; its child carries the ship's own small station-keeping drift. */
  group: THREE.Group;
  /** `thrust` 0..1: the plumes' strength and length; at 0 the plumes are out and the bells only glow. */
  update(elapsed: number, thrust: number): void;
  setFade(k: number): void;
  dispose(): void;
}

export interface TitleShipOptions {
  /** Toward the key light: the sunrise's side, raised, so the deck is lit. */
  keyDir: THREE.Vector3;
  /** Toward the sun as seen (behind the ship): its rims and its glint in the metal. */
  sunDir: THREE.Vector3;
  /** Toward Kethra's lit face below: its bounce. */
  bounceDir: THREE.Vector3;
  /** A cool fill from the camera's side, so the flank toward us reads. */
  fillDir: THREE.Vector3;
  planetCenter: THREE.Vector3;
  planetRadius: number;
  /** The light that shades Kethra, so its reflection shows the lit side. */
  planetLight: THREE.Vector3;
  pace?: () => Promise<void>;
}

export async function buildTitleShip(renderer: THREE.WebGLRenderer, o: TitleShipOptions): Promise<TitleShip> {
  const panels = await bakePanels(renderer, o.pace);
  const rand = mulberry32(0x5b1f7);
  const { geometry, engines } = buildHull(rand);

  const engineColor = new THREE.Color(0.1, 0.38, 1.0);
  const power = { value: 1 };
  const plumePower = { value: 1 };
  const plumeLength = { value: PLUME_LENGTH };
  const fade = { value: 0 };
  const starboard = engines.filter((e) => e.at.z > 0);
  const port = engines.filter((e) => e.at.z < 0);
  const middle = (list: EngineSpec[]) => list.reduce((s, e) => s.add(e.at), new THREE.Vector3()).divideScalar(list.length).add(new THREE.Vector3(-0.6, 0, 0));
  const hull = new THREE.Mesh(
    geometry,
    new THREE.ShaderMaterial({
      vertexShader: HULL_VERTEX,
      fragmentShader: HULL_FRAGMENT,
      uniforms: {
        uPanel: { value: panels.texture },
        uKeyDir: { value: o.keyDir },
        uKeyColor: { value: new THREE.Color(1.0, 0.9, 0.78).multiplyScalar(3.4) },
        uFillDir: { value: o.fillDir },
        uFillColor: { value: new THREE.Color(0.32, 0.45, 0.62) },
        uSunDir: { value: o.sunDir },
        uSunColor: { value: new THREE.Color(1.0, 0.86, 0.7).multiplyScalar(2.2) },
        uBounceDir: { value: o.bounceDir },
        uBounceColor: { value: new THREE.Color(0.16, 0.34, 0.36) },
        uPlanetCenter: { value: o.planetCenter },
        uPlanetRadius: { value: o.planetRadius },
        uPlanetLight: { value: o.planetLight },
        uEngineA: { value: middle(port) },
        uEngineB: { value: middle(starboard) },
        uEngineColor: { value: engineColor },
        uLampColor: { value: new THREE.Color(0.35, 0.72, 1.0) },
        uPower: power,
        uBump: { value: 0.022 },
        uFade: fade,
      },
    }),
  );
  hull.name = 'title-ship-hull';
  // It flies in from behind the camera: keep it drawn while it is out of frame, so its first frame in
  // view is not its first draw.
  hull.frustumCulled = false;

  const time = { value: 0 };
  const plumes = new THREE.Mesh(
    buildPlumes(engines),
    new THREE.ShaderMaterial({
      vertexShader: PLUME_VERTEX,
      fragmentShader: PLUME_FRAGMENT,
      uniforms: { uLength: plumeLength, uPower: plumePower, uTime: time, uColor: { value: engineColor }, uFade: fade },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  plumes.name = 'title-ship-plumes';
  // Placed in the shader; the geometry's own positions are all zero.
  plumes.frustumCulled = false;
  plumes.renderOrder = 5;

  const drift = new THREE.Group();
  drift.add(hull, plumes);
  const group = new THREE.Group();
  group.name = 'title-ship';
  group.add(drift);

  return {
    group,
    update(elapsed, thrust) {
      // Cruising: a slow heave and the small corrections of a ship holding station, each on its own
      // period so nothing repeats in step. Held still while it is under thrust.
      const e = elapsed;
      const hold = 1 - thrust;
      drift.position.set(Math.sin(e * 0.21) * 0.1 * hold, (Math.sin(e * 0.29 + 1.1) * 0.07 + Math.sin(e * 0.11) * 0.05) * hold, Math.sin(e * 0.17 + 2.0) * 0.12 * hold);
      drift.rotation.set(Math.sin(e * 0.19 + 0.4) * 0.022 * hold, Math.sin(e * 0.13 + 1.3) * 0.012 * hold, Math.sin(e * 0.23 + 2.2) * 0.01 * hold);
      time.value = elapsed;
      const flicker = 1 + 0.035 * Math.sin(e * 11.3) + 0.025 * Math.sin(e * 17.9 + 1.0);
      power.value = (ENGINE_IDLE + (1 - ENGINE_IDLE) * thrust) * flicker;
      plumePower.value = thrust * flicker;
      plumeLength.value = PLUME_LENGTH * (PLUME_SHORT + (1 - PLUME_SHORT) * thrust);
    },
    setFade(k) {
      fade.value = k;
    },
    dispose() {
      panels.dispose();
      geometry.dispose();
      hull.material.dispose();
      plumes.geometry.dispose();
      plumes.material.dispose();
    },
  };
}
