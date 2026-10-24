import * as THREE from 'three';
import { mulberry32 } from '../../core/rng';
import { displayFontsReady } from '../../core/loadFonts';
import { bakeInto } from './bake';

/**
 * The ship on the title: a heavy survey cruiser, seen from above and behind, cruising over Kethra.
 *
 * Silhouette: one central hull running the full length into a single faceted nose, with broad armoured
 * shoulders fused along its after two thirds (their leading faces swept back, so the nose is the only
 * thing that points forward), thick swept fins off the shoulders, a dorsal fin over the stern and a deep
 * keel underneath. The stern stays as broad as the hull: three engine nests (six cells in the centre,
 * four in each shoulder) set in armoured surrounds, plus a small pair under the keel.
 *
 * Built in code like the rest of the backdrop, as one merged mesh of flat triangles. The big shapes are
 * lofts of faceted sections. Their surfaces are then plated: every face of a loft is cut into panels
 * with jittered seams, and each panel becomes a raised, chamfered plate, a stacked double plate, an open
 * bay of machinery, a vent, or nothing (the black base shows through as a recess), some with a light
 * strip sunk in one seam. The nose, deck, bridge, cheeks and stern are placed by hand on top of that.
 *
 * Surface detail finer than the plates comes from a panel sheet baked once on the GPU (fine seams,
 * hatches, vents, bolt rows, the odd lit port), box-projected in ship space and read as bump. Normals
 * come from the triangles themselves (screen derivatives), so the mesh carries no normal attribute.
 * Markings (hull numbers, an emblem, hazard bands, stencils) are a second, alpha-blended draw of quads
 * laid just over their plates, sampling a small atlas painted on a canvas.
 *
 * Shading: a key from the sunrise's side, raised; the sun's rim from behind; a cool fill from our side
 * so the flank toward us reads; Kethra's bounce from below; the engines' blue on the stern; reflections
 * of an analytic sky (space, the sun, the planet and its limb). Palette: light cool-grey armour over a
 * graphite structure, black recesses, blue-white light used sparingly.
 *
 * Engines: each cell's chamber glows deeper in, behind baffle rings and four vanes, round a white-hot
 * core; a camera-facing glow sits in its mouth and a plume runs aft as a ribbon turned toward the camera
 * about its own axis. Plumes and glows are one additive draw.
 *
 * Ship axes: +X nose, -X stern (engines), +Y dorsal, +Z starboard. About 11.5 units from nose to the
 * engine mouths, 9 across the fins, 3 from keel to the top of the dorsal fin.
 */

/** Material classes, carried per vertex (aMat.x). Below LAMP they are lit; from LAMP up they glow. */
const PLATE = 0; // graphite armour
const LIGHT = 1; // light cool-grey armour
const FRAME = 2; // the black structure under the plates: seams, recesses, bays
const METAL = 3; // bare gunmetal: machinery, rails, rims
const HEAT = 4; // engine housings
const LAMP = 5; // light strips: tint 0..1 blue-white brightness, above 1 toward white
const BELL = 6; // inside an engine chamber: tint is how far in (glow)
const THROAT = 7; // the white-hot core

/** From the nose tip to the mouths of the main engines, in ship units: the length the composition places. */
export const SHIP_NOSE_X = 6.0;
export const SHIP_STERN_X = -5.45;

/** Plume length at full thrust, in nozzle radii. */
const PLUME_LENGTH = 64;
/** The plume's length as thrust runs out, as a fraction of PLUME_LENGTH (its brightness goes to zero). */
const PLUME_SHORT = 0.3;
/** The chambers' own glow (and the blue on the stern) with the engines off: hot metal, no exhaust. */
const ENGINE_IDLE = 0.4;

type V3 = THREE.Vector3;
type Ring = V3[];
type P2 = [number, number];

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const UP = v(0, 1, 0);
const AFT = v(-1, 0, 0);

function centroid(points: V3[]): V3 {
  const c = new THREE.Vector3();
  for (const p of points) c.add(p);
  return c.divideScalar(points.length);
}

/** Linear interpolation down a table of rows [x, ...columns], sorted by x; clamped at both ends. */
function table(rows: number[][], x: number): number[] {
  if (x <= rows[0][0]) return rows[0].slice(1);
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i];
    const b = rows[i + 1];
    if (x <= b[0]) {
      const t = (x - a[0]) / (b[0] - a[0]);
      return a.slice(1).map((y, k) => y + (b[k + 1] - y) * t);
    }
  }
  return rows[rows.length - 1].slice(1);
}

// ---------------------------------------------------------------------------------------------
// Geometry

const sA = new THREE.Vector3();
const sB = new THREE.Vector3();
const sN = new THREE.Vector3();
const sW = new THREE.Vector3();
const sO = new THREE.Vector3();

/** Collects flat triangles with their material class, tint and texture seed (and, for markings, an atlas uv). */
class HullBuilder {
  readonly pos: number[] = [];
  readonly mat: number[] = [];
  readonly uv: number[] | null;
  private kind = PLATE;
  private tint = 1;
  private seed = 0;
  private xf: THREE.Matrix4 | null = null;
  private flip = false;
  private uvs: [P2, P2, P2] | null = null;
  private rand: () => number;

  constructor(rand: () => number, withUv = false) {
    this.rand = rand;
    this.uv = withUv ? [] : null;
  }

  get triangles(): number {
    return this.pos.length / 9;
  }

  /** Sets the material class for the parts that follow; each call picks a new texture offset. */
  use(kind: number, tint = 1): this {
    this.kind = kind;
    this.tint = tint;
    this.seed = this.rand();
    return this;
  }

  /** Places what follows with this transform; null for none. */
  place(m: THREE.Matrix4 | null): this {
    this.xf = m;
    this.flip = !!m && m.determinant() < 0;
    return this;
  }

  /** One triangle, wound so its front faces along `out`. */
  triN(a: V3, b: V3, c: V3, out: V3, tint = this.tint): void {
    sA.subVectors(b, a);
    sB.subVectors(c, a);
    sN.crossVectors(sA, sB);
    if (sN.lengthSq() < 1e-14) return;
    let keep = sN.dot(out) >= 0;
    if (this.flip) keep = !keep;
    const uv = this.uvs;
    this.push(a, tint, uv?.[0]);
    if (keep) {
      this.push(b, tint, uv?.[1]);
      this.push(c, tint, uv?.[2]);
    } else {
      this.push(c, tint, uv?.[2]);
      this.push(b, tint, uv?.[1]);
    }
  }

  private push(p: V3, tint: number, uv?: P2): void {
    const w = this.xf ? sW.copy(p).applyMatrix4(this.xf) : p;
    this.pos.push(w.x, w.y, w.z);
    this.mat.push(this.kind, tint, this.seed);
    if (this.uv) this.uv.push(uv ? uv[0] : 0, uv ? uv[1] : 0);
  }

  /** One triangle, its front facing away from `inside` (or toward it, with `inward`). */
  tri(a: V3, b: V3, c: V3, inside: V3, inward = false, tint = this.tint): void {
    const out = sO.copy(a).add(b).add(c).divideScalar(3).sub(inside);
    if (inward) out.negate();
    this.triN(a, b, c, out, tint);
  }

  quadN(a: V3, b: V3, c: V3, d: V3, out: V3, tint = this.tint): void {
    this.triN(a, b, c, out, tint);
    this.triN(a, c, d, out, tint);
  }

  quad(a: V3, b: V3, c: V3, d: V3, inside: V3, inward = false): void {
    this.tri(a, b, c, inside, inward);
    this.tri(a, c, d, inside, inward);
  }

  /** A quad carrying atlas uvs at its corners (markings only). */
  quadUv(a: V3, b: V3, c: V3, d: V3, out: V3, uvs: [P2, P2, P2, P2], tint = this.tint): void {
    this.uvs = [uvs[0], uvs[1], uvs[2]];
    this.triN(a, b, c, out, tint);
    this.uvs = [uvs[0], uvs[2], uvs[3]];
    this.triN(a, c, d, out, tint);
    this.uvs = null;
  }

  /** Joins rings (same point count, in order around) one to the next, capping either end. */
  loft(rings: Ring[], caps: [boolean, boolean] = [true, true], inward = false): void {
    const n = rings[0].length;
    const cs = rings.map(centroid);
    for (let i = 0; i < rings.length - 1; i++) {
      const A = rings[i];
      const B = rings[i + 1];
      const inside = cs[i].clone().add(cs[i + 1]).multiplyScalar(0.5);
      for (let j = 0; j < n; j++) {
        const k = (j + 1) % n;
        this.quad(A[j], A[k], B[k], B[j], inside, inward);
      }
    }
    const middle = cs.reduce((m, c) => m.add(c), new THREE.Vector3()).divideScalar(cs.length);
    const cap = (i: number) => {
      const r = rings[i];
      const out = cs[i].clone().sub(middle);
      for (let j = 0; j < n; j++) this.triN(cs[i], r[j], r[(j + 1) % n], out);
    };
    if (caps[0]) cap(0);
    if (caps[1]) cap(rings.length - 1);
  }
}

/** A ring at x from (y, z) points. */
const ringX = (x: number, pts: P2[]): Ring => pts.map(([y, z]) => v(x, y, z));

/** A chamfered rectangle in (y, z) about (cy, cz): half extents hy, hz, corner cut c. Edges: 0 top, 2 port, 4 bottom, 6 starboard. */
function rect(cy: number, cz: number, hy: number, hz: number, c: number): P2[] {
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

/** A beam along X through stations [x, yBottom, yTop, halfWidth, cz?], chamfered by c, capped. */
function beam(b: HullBuilder, stations: number[][], c = 0.03, caps: [boolean, boolean] = [true, true]): Ring[] {
  const rings = stations.map(([x, y0, y1, hw, cz = 0]) => ringX(x, rect((y0 + y1) / 2, cz, (y1 - y0) / 2, hw, c)));
  b.loft(rings, caps);
  return rings;
}

/** A slab along X, chamfered on every edge: y from y0 to y1, half width w0 at x0 tapering to w1 at x1, about z = cz. */
function slab(b: HullBuilder, x0: number, x1: number, y0: number, y1: number, w0: number, w1: number, cz = 0, c = 0.03): void {
  const e = Math.min(c, (x1 - x0) * 0.3, (y1 - y0) * 0.3);
  const at = (t: number, inset: number) => rect((y0 + y1) / 2, cz, (y1 - y0) / 2 - inset, w0 + (w1 - w0) * t - inset, c);
  const span = x1 - x0;
  b.loft([ringX(x0, at(0, e)), ringX(x0 + e, at(e / span, 0)), ringX(x1 - e, at(1 - e / span, 0)), ringX(x1, at(1, e))]);
}

/** An octagon in the (y, z) plane at x, flat faces up, down and to the sides; r is the apothem. */
function octX(x: number, cy: number, cz: number, r: number): Ring {
  const R = r / Math.cos(Math.PI / 8);
  const pts: Ring = [];
  for (let i = 0; i < 8; i++) {
    const a = ((i + 0.5) * Math.PI) / 4;
    pts.push(v(x, cy + Math.sin(a) * R, cz + Math.cos(a) * R));
  }
  return pts;
}

/** A tube from p0 to p1, radius r, `seg` sides, capped. */
function tube(b: HullBuilder, p0: V3, p1: V3, r: number, seg = 6): void {
  const d = p1.clone().sub(p0).normalize();
  const e1 = Math.abs(d.y) < 0.9 ? new THREE.Vector3().crossVectors(d, UP).normalize() : new THREE.Vector3().crossVectors(d, AFT).normalize();
  const e2 = new THREE.Vector3().crossVectors(d, e1);
  const ring = (p: V3) => {
    const pts: Ring = [];
    for (let i = 0; i < seg; i++) {
      const a = ((i + 0.5) / seg) * Math.PI * 2;
      pts.push(p.clone().addScaledVector(e1, Math.cos(a) * r).addScaledVector(e2, Math.sin(a) * r));
    }
    return pts;
  };
  b.loft([ring(p0), ring(p1)]);
}

/** Moves each vertex of a polygon inward by c (mitred). The polygon must run counter-clockwise. */
function insetPoly(poly: P2[], c: number): P2[] {
  const n = poly.length;
  const out: P2[] = [];
  for (let i = 0; i < n; i++) {
    const p = poly[i];
    const a = poly[(i + n - 1) % n];
    const q = poly[(i + 1) % n];
    let d1x = p[0] - a[0];
    let d1y = p[1] - a[1];
    const l1 = Math.hypot(d1x, d1y) || 1;
    d1x /= l1;
    d1y /= l1;
    let d2x = q[0] - p[0];
    let d2y = q[1] - p[1];
    const l2 = Math.hypot(d2x, d2y) || 1;
    d2x /= l2;
    d2y /= l2;
    const k = c / Math.max(0.3, 1 + (-d1y * -d2y + d1x * d2x));
    out.push([p[0] + (-d1y - d2y) * k, p[1] + (d1x + d2x) * k]);
  }
  return out;
}

const signedArea = (poly: P2[]) => poly.reduce((s, p, i) => s + p[0] * poly[(i + 1) % poly.length][1] - poly[(i + 1) % poly.length][0] * p[1], 0);

/**
 * A plate laid on a surface: `outline` in the surface's own (a, b) coordinates, its top raised h along
 * `nrm`, its rim chamfered by c, its foot sunk `depth` below the surface. Returns the top's corners.
 */
function drape(b: HullBuilder, outline: P2[], surf: (a: number, b: number) => V3, nrm: V3, h: number, c = 0.02, depth = 0.03): Ring {
  const poly = signedArea(outline) < 0 ? [...outline].reverse() : outline;
  const cc = Math.min(c, h * 0.5);
  const inner = cc > 0 ? insetPoly(poly, cc) : poly;
  const r0 = poly.map(([a, bb]) => surf(a, bb).addScaledVector(nrm, -depth));
  const r1 = poly.map(([a, bb]) => surf(a, bb).addScaledVector(nrm, h - cc));
  const r2 = inner.map(([a, bb]) => surf(a, bb).addScaledVector(nrm, h));
  const c1 = centroid(r1);
  const top = centroid(r2);
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const out = r1[i].clone().add(r1[j]).multiplyScalar(0.5).sub(c1);
    b.quadN(r0[i], r0[j], r1[j], r1[i], out);
    if (cc > 0) b.quadN(r1[i], r1[j], r2[j], r2[i], out.normalize().add(nrm));
    b.triN(top, r2[i], r2[j], nrm);
  }
  return r2;
}

/** A plane for drape: o + U a + V b. */
const planar = (o: V3, U: V3, V: V3) => (a: number, bb: number) => o.clone().addScaledVector(U, a).addScaledVector(V, bb);

/** An emissive strip: the quad a-b-c-d lifted `lift` along `out`. */
function lamp(b: HullBuilder, quad: V3[], out: V3, tint: number, lift = 0.006): void {
  const n = out.clone().normalize();
  const q = quad.map((p) => p.clone().addScaledVector(n, lift));
  b.use(LAMP, tint);
  b.quadN(q[0], q[1], q[2], q[3], n);
}

// ---------------------------------------------------------------------------------------------
// Markings

/** Cells of the markings atlas (canvas pixels: x, y, w, h). */
const ATLAS_W = 1024;
const ATLAS_H = 512;
const CELLS = {
  number: [0, 0, 256, 160],
  code: [256, 0, 384, 88],
  emblem: [656, 0, 176, 176],
  warn: [848, 0, 128, 112],
  hazard: [0, 176, 512, 48],
  nostep: [512, 176, 256, 56],
  maint: [0, 240, 448, 44],
  serial: [0, 296, 640, 40],
  vent: [512, 240, 256, 44],
  arrows: [768, 176, 224, 56],
} satisfies Record<string, number[]>;
type CellName = keyof typeof CELLS;

interface DecalSpec {
  cell: CellName;
  /** Paint brightness: low on light plates, high on dark ones. */
  paint: number;
  /** The direction the text reads, roughly; worked out from the face when left out. */
  right?: V3;
  /** How much of the plate it may fill, and where (offset of its centre, as fractions of the plate's up extent). */
  fill?: number;
  offset?: number;
  /** Stretch across, for bands. */
  stretch?: number;
}

/** Lays a marking over the top face of a plate (its four top corners), fitted inside it, reading along `right`. */
function fitDecal(d: HullBuilder, top: V3[], n: V3, kind: number, spec: DecalSpec): void {
  const [x, y, w, h] = CELLS[spec.cell];
  const c = centroid(top);
  const e1 = top[1].clone().sub(top[0]);
  const e2 = top[3].clone().sub(top[0]);
  const right = spec.right ?? (Math.abs(n.y) < 0.7 ? new THREE.Vector3().crossVectors(UP, n).normalize() : v(0, 0, 1));
  // Read along whichever side of the plate lies nearest `right`.
  const alongE1 = Math.abs(e1.dot(right)) / e1.length() >= Math.abs(e2.dot(right)) / e2.length();
  const U = (alongE1 ? e1 : e2).clone();
  const extentU = U.length();
  U.normalize();
  if (U.dot(right) < 0) U.negate();
  const extentV = (alongE1 ? e2 : e1).length();
  const V = new THREE.Vector3().crossVectors(n, U).normalize();
  const fill = spec.fill ?? 0.8;
  const aspect = (w / h) * (spec.stretch ?? 1);
  let hw = (extentU * fill) / 2;
  let hh = hw / aspect;
  if (hh * 2 > extentV * fill) {
    hh = (extentV * fill) / 2;
    hw = hh * aspect;
  }
  const o = c.clone().addScaledVector(V, (spec.offset ?? 0) * extentV).addScaledVector(n, 0.004);
  const corner = (su: number, sv: number) => o.clone().addScaledVector(U, su * hw).addScaledVector(V, sv * hh);
  const u0 = x / ATLAS_W;
  const u1 = (x + w) / ATLAS_W;
  const v0 = 1 - (y + h) / ATLAS_H;
  const v1 = 1 - y / ATLAS_H;
  d.use(kind, spec.paint);
  d.quadUv(corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1), n, [
    [u0, v0],
    [u1, v0],
    [u1, v1],
    [u0, v1],
  ]);
}

/** The markings atlas: white type and symbols (tinted per decal), muted hazard bands. */
async function paintAtlas(): Promise<THREE.CanvasTexture> {
  await displayFontsReady();
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_W;
  canvas.height = ATLAS_H;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const text = (cell: CellName, s: string, font: string, spacing = 0) => {
    const [x, y, w, h] = CELLS[cell];
    g.font = font;
    (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${spacing}px`;
    g.fillText(s, x + w / 2 + spacing / 2, y + h / 2 + 2, w - 8);
  };
  text('number', '07', '700 168px Rajdhani, "Segoe UI", sans-serif', 4);
  text('code', 'AR-07', '700 80px Rajdhani, "Segoe UI", sans-serif', 10);
  text('serial', 'ARK LTD  ·  HULL 2291-07  ·  KESSIC SURVEY', '600 30px Rajdhani, "Segoe UI", sans-serif', 4);
  text('maint', 'MAINT ACCESS 14', '700 36px Rajdhani, "Segoe UI", sans-serif', 6);
  text('vent', 'COOLANT VENT', '700 34px Rajdhani, "Segoe UI", sans-serif', 5);
  {
    const [x, y, w, h] = CELLS.nostep;
    g.lineWidth = 4;
    g.strokeRect(x + 4, y + 4, w - 8, h - 8);
    text('nostep', 'NO STEP', '700 34px Rajdhani, "Segoe UI", sans-serif', 6);
  }
  {
    // The emblem: a pair of swept wings either side of a diamond, over a chevron.
    const [x, y, w] = CELLS.emblem;
    const cx = x + w / 2;
    const cy = y + w / 2;
    const s = w / 176;
    g.beginPath();
    g.moveTo(cx, cy - 34 * s);
    g.lineTo(cx + 20 * s, cy - 6 * s);
    g.lineTo(cx, cy + 22 * s);
    g.lineTo(cx - 20 * s, cy - 6 * s);
    g.closePath();
    g.fill();
    for (const side of [-1, 1]) {
      g.beginPath();
      g.moveTo(cx + side * 26 * s, cy - 10 * s);
      g.lineTo(cx + side * 84 * s, cy - 40 * s);
      g.lineTo(cx + side * 70 * s, cy - 18 * s);
      g.lineTo(cx + side * 30 * s, cy + 6 * s);
      g.closePath();
      g.fill();
      g.beginPath();
      g.moveTo(cx + side * 30 * s, cy + 12 * s);
      g.lineTo(cx + side * 66 * s, cy - 6 * s);
      g.lineTo(cx + side * 56 * s, cy + 10 * s);
      g.lineTo(cx + side * 30 * s, cy + 24 * s);
      g.closePath();
      g.fill();
    }
    g.lineWidth = 9 * s;
    g.beginPath();
    g.moveTo(cx - 40 * s, cy + 44 * s);
    g.lineTo(cx, cy + 66 * s);
    g.lineTo(cx + 40 * s, cy + 44 * s);
    g.stroke();
  }
  {
    const [x, y, w, h] = CELLS.warn;
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(x + w / 2, y + 8);
    g.lineTo(x + w - 8, y + h - 8);
    g.lineTo(x + 8, y + h - 8);
    g.closePath();
    g.stroke();
    g.fillRect(x + w / 2 - 5, y + 40, 10, 34);
    g.fillRect(x + w / 2 - 5, y + 82, 10, 10);
  }
  {
    // Hazard band: muted amber and graphite diagonals.
    const [x, y, w, h] = CELLS.hazard;
    g.save();
    g.beginPath();
    g.rect(x, y, w, h);
    g.clip();
    g.fillStyle = '#1b1c1e';
    g.fillRect(x, y, w, h);
    g.fillStyle = '#b09662';
    for (let sx = x - h; sx < x + w + h; sx += 48) {
      g.beginPath();
      g.moveTo(sx, y + h);
      g.lineTo(sx + 24, y + h);
      g.lineTo(sx + 24 + h, y);
      g.lineTo(sx + h, y);
      g.closePath();
      g.fill();
    }
    g.restore();
  }
  {
    const [x, y, , h] = CELLS.arrows;
    g.lineWidth = 7;
    for (let i = 0; i < 4; i++) {
      const ax = x + 24 + i * 50;
      g.beginPath();
      g.moveTo(ax, y + 10);
      g.lineTo(ax + 22, y + h / 2);
      g.lineTo(ax, y + h - 10);
      g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.name = 'title-ship-markings';
  return tex;
}

// ---------------------------------------------------------------------------------------------
// Plating

type Style = 'plate' | 'double' | 'bay' | 'vent' | 'skip';

interface Paint {
  style: Style;
  kind: number;
  tint: number;
  /** Plate height above the base. */
  h: number;
  /** A light strip sunk in this seam of the panel (0, 2: the long seams; 1, 3: the short ones). */
  lamp?: number;
  lampTint?: number;
  decal?: DecalSpec;
}

interface Cell {
  /** Centre and outward normal, ship space. */
  c: V3;
  n: V3;
  /** Along the loft (0..1) and around the edge (0..1); the loft's span and edge indices. */
  t: number;
  u: number;
  span: number;
  edge: number;
  len: number;
  wid: number;
}

interface Plating {
  hull: HullBuilder;
  decals: HullBuilder;
  rand: () => number;
}

const GAP = 0.026;

/** Moves each corner of a quad inward, away from each of its edges by that edge's gap. */
function inset4(P: V3[], g: number[]): V3[] {
  return P.map((p, i) => {
    const next = P[(i + 1) % 4];
    const prev = P[(i + 3) % 4];
    return p
      .clone()
      .addScaledVector(next.clone().sub(p).normalize(), g[(i + 3) % 4])
      .addScaledVector(prev.clone().sub(p).normalize(), g[i]);
  });
}

/** A raised, chamfered plate on the quad Q (corners in order), h along n. Returns its top's corners. */
function plate4(b: HullBuilder, Q: V3[], n: V3, h: number): V3[] {
  const c = Math.min(0.016, h * 0.4);
  const base = Q.map((p) => p.clone().addScaledVector(n, -0.012));
  const mid = Q.map((p) => p.clone().addScaledVector(n, h - c));
  const top = inset4(Q, [c, c, c, c]).map((p) => p.addScaledVector(n, h));
  const cen = centroid(mid);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const out = mid[i].clone().add(mid[j]).multiplyScalar(0.5).sub(cen);
    b.quadN(base[i], base[j], mid[j], mid[i], out);
    b.quadN(mid[i], mid[j], top[j], top[i], out.normalize().add(n));
  }
  b.quadN(top[0], top[1], top[2], top[3], n);
  return top;
}

/** Machinery in an open bay: blocks, pipes and the odd indicator, all below the plates around it. */
function bay(pl: Plating, Q: V3[], n: V3, h: number): void {
  const { hull: b, rand } = pl;
  const U = Q[1].clone().sub(Q[0]);
  const L1 = U.length();
  U.divideScalar(L1);
  const W = Q[3].clone().sub(Q[0]);
  const L2 = W.length();
  W.divideScalar(L2);
  const surf = planar(Q[0], U, W);
  const count = 2 + Math.floor(rand() * 3);
  for (let k = 0; k < count; k++) {
    const a0 = rand() * 0.55 * L1;
    const a1 = Math.min(L1 * 0.96, a0 + (0.25 + rand() * 0.5) * L1);
    const b0 = rand() * 0.6 * L2;
    const b1 = Math.min(L2 * 0.95, b0 + (0.2 + rand() * 0.4) * L2);
    const hh = h * (0.35 + rand() * 0.55);
    if (rand() < 0.35) {
      const r = Math.min(0.028, (b1 - b0) * 0.4);
      const mid = (b0 + b1) / 2;
      b.use(METAL, 0.7 + rand() * 0.4);
      tube(b, surf(a0, mid).addScaledVector(n, r), surf(a1, mid).addScaledVector(n, r), r, 6);
    } else {
      b.use(rand() < 0.5 ? METAL : HEAT, 0.6 + rand() * 0.5);
      drape(b, [[a0, b0], [a1, b0], [a1, b1], [a0, b1]], surf, n, hh, hh * 0.3, 0.01);
    }
  }
  if (rand() < 0.2) {
    const a = (0.2 + rand() * 0.6) * L1;
    const bb = (0.2 + rand() * 0.6) * L2;
    b.use(LAMP, 0.5);
    drape(b, [[a, bb], [a + 0.035, bb], [a + 0.035, bb + 0.035], [a, bb + 0.035]], surf, n, h * 0.5, 0, 0.01);
  }
}

/** Slats across a panel: a vent. */
function vent(pl: Plating, Q: V3[], n: V3, h: number): void {
  const b = pl.hull;
  const e1 = Q[1].clone().sub(Q[0]);
  const e3 = Q[3].clone().sub(Q[0]);
  // Slats run across the long side.
  const longFirst = e1.length() >= e3.length();
  const along = longFirst ? e1 : e3;
  const across = longFirst ? e3 : e1;
  const L = along.length();
  const Wd = across.length();
  const U = along.clone().normalize();
  const W = across.clone().normalize();
  const surf = planar(Q[0], U, W);
  const count = Math.min(14, Math.floor(L / 0.05));
  const pitch = L / count;
  b.use(METAL, 0.55);
  for (let i = 0; i < count; i++) {
    const a = (i + 0.3) * pitch;
    drape(b, [[a, Wd * 0.06], [a + pitch * 0.45, Wd * 0.06], [a + pitch * 0.45, Wd * 0.94], [a, Wd * 0.94]], surf, n, h * 0.7, 0, 0.01);
  }
}

/** One panel of a plated surface: P is its quad (seams at its edges), n its outward normal. */
function panel(pl: Plating, P: V3[], n: V3, paint: Paint): void {
  if (paint.style === 'skip') return;
  const b = pl.hull;
  const g = [0, 1, 2, 3].map(() => (pl.rand() < 0.18 ? GAP * 2.6 : GAP));
  if (paint.lamp !== undefined) g[paint.lamp] = GAP * 2.2;
  const Q = inset4(P, g);
  if (paint.lamp !== undefined) {
    // The strip lies in this panel's half of the widened seam, short of the corners.
    const i = paint.lamp;
    const j = (i + 1) % 4;
    const a = P[i].clone().lerp(P[j], 0.06).lerp(Q[i].clone().lerp(Q[j], 0.06), 0.25);
    const bb = P[i].clone().lerp(P[j], 0.94).lerp(Q[i].clone().lerp(Q[j], 0.94), 0.25);
    const c = P[i].clone().lerp(P[j], 0.94).lerp(Q[i].clone().lerp(Q[j], 0.94), 0.75);
    const d = P[i].clone().lerp(P[j], 0.06).lerp(Q[i].clone().lerp(Q[j], 0.06), 0.75);
    lamp(b, [a, bb, c, d], n, paint.lampTint ?? 0.6, 0.004);
  }
  if (paint.style === 'bay') {
    bay(pl, Q, n, paint.h);
    return;
  }
  if (paint.style === 'vent') {
    vent(pl, Q, n, paint.h);
    return;
  }
  b.use(paint.kind, paint.tint);
  let top = plate4(b, Q, n, paint.h);
  if (paint.style === 'double') {
    // A second, smaller plate stacked on the first.
    const e1 = top[1].distanceTo(top[0]);
    const e2 = top[3].distanceTo(top[0]);
    const m1 = e1 * (0.12 + pl.rand() * 0.1);
    const m2 = e2 * (0.14 + pl.rand() * 0.1);
    const inner = inset4(top, [m2, m1, m2, m1]);
    b.use(paint.kind, paint.tint * (paint.kind === LIGHT ? 0.94 : 1.12));
    top = plate4(b, inner, n, paint.h * 0.6);
  }
  if (paint.decal) fitDecal(pl.decals, top, n, paint.kind, paint.decal);
}

interface ArmorOptions {
  /** Target panel length along the loft, and the widest a panel may be across. */
  along: number;
  across: number;
  paint(cell: Cell): Paint;
  caps?: [boolean, boolean];
  /** The base under the plates (the seams' colour). */
  base?: number;
}

/**
 * A plated loft: the rings lofted in black, then every face cut into panels with jittered seams and
 * each panel dressed as `paint` says.
 */
function armorLoft(pl: Plating, rings: Ring[], o: ArmorOptions): void {
  const { hull: b, rand } = pl;
  b.use(o.base ?? FRAME, 1);
  b.loft(rings, o.caps ?? [false, false]);
  const n = rings[0].length;
  const total = rings.length - 1;
  const cs = rings.map(centroid);
  for (let i = 0; i < total; i++) {
    const A = rings[i];
    const B = rings[i + 1];
    const inside = cs[i].clone().add(cs[i + 1]).multiplyScalar(0.5);
    for (let j = 0; j < n; j++) {
      const k = (j + 1) % n;
      const len = (A[j].distanceTo(B[j]) + A[k].distanceTo(B[k])) / 2;
      const wid = (A[j].distanceTo(A[k]) + B[j].distanceTo(B[k])) / 2;
      if (len < 0.05 || wid < 0.05) continue;
      const na = Math.max(1, Math.round(len / o.along));
      const nw = Math.max(1, Math.ceil(wid / o.across - 0.2));
      const breaks = (count: number) => {
        const out = [0];
        for (let m = 1; m < count; m++) out.push((m + (rand() - 0.5) * 0.45) / count);
        out.push(1);
        return out;
      };
      const ts = breaks(na);
      const us = breaks(nw);
      const at = (t: number, u: number) => A[j].clone().lerp(A[k], u).lerp(B[j].clone().lerp(B[k], u), t);
      for (let a = 0; a < na; a++) {
        for (let w = 0; w < nw; w++) {
          const P = [at(ts[a], us[w]), at(ts[a + 1], us[w]), at(ts[a + 1], us[w + 1]), at(ts[a], us[w + 1])];
          const c = centroid(P);
          const nrm = new THREE.Vector3().crossVectors(P[2].clone().sub(P[0]), P[3].clone().sub(P[1])).normalize();
          if (nrm.dot(c.clone().sub(inside)) < 0) nrm.negate();
          const paint = o.paint({ c, n: nrm, t: (i + (ts[a] + ts[a + 1]) / 2) / total, u: (us[w] + us[w + 1]) / 2, span: i, edge: j, len: len * (ts[a + 1] - ts[a]), wid: wid * (us[w + 1] - us[w]) });
          panel(pl, P, nrm, paint);
        }
      }
    }
  }
}

/** The usual dress of an armoured surface, by which way it faces. */
function dress(rand: () => number, cell: Cell, o: { lamps?: number; bays?: number; light?: number } = {}): Paint {
  const r = rand();
  const lampChance = o.lamps ?? 0.07;
  const lampAt = cell.len > 0.28 && rand() < lampChance ? (rand() < 0.5 ? 0 : 2) : undefined;
  const ny = cell.n.y;
  if (ny > 0.45) {
    const light = rand() < (o.light ?? 0.78);
    return {
      style: r < 0.15 ? 'double' : r < 0.15 + (o.bays ?? 0.05) ? 'bay' : 'plate',
      kind: light ? LIGHT : PLATE,
      tint: light ? (rand() < 0.12 ? 0.62 : 0.8 + rand() * 0.22) : 0.9 + rand() * 0.3,
      h: 0.045 + rand() * 0.02,
      lamp: lampAt,
    };
  }
  if (ny > -0.45) {
    const light = rand() < (o.light ?? 0.2);
    return {
      style: r < 0.16 ? 'double' : r < 0.16 + (o.bays ?? 0.09) ? 'bay' : r < 0.3 ? 'vent' : 'plate',
      kind: light ? LIGHT : PLATE,
      tint: light ? 0.72 + rand() * 0.16 : 0.85 + rand() * 0.35,
      h: 0.04 + rand() * 0.025,
      lamp: lampAt,
    };
  }
  return {
    style: r < 0.1 ? 'double' : r < 0.1 + (o.bays ?? 0.14) ? 'bay' : r < 0.32 ? 'vent' : 'plate',
    kind: PLATE,
    tint: 0.8 + rand() * 0.35,
    h: 0.04 + rand() * 0.02,
    lamp: lampAt !== undefined && rand() < 0.2 ? lampAt : undefined,
  };
}

const inside = (c: V3, x0: number, x1: number, z0: number, z1: number) => c.x > x0 && c.x < x1 && Math.abs(c.z) > z0 && Math.abs(c.z) < z1;

// ---------------------------------------------------------------------------------------------
// The engines

/** The engines' mouths (ship space) and radii, for the plumes. */
interface EngineSpec {
  at: V3;
  r: number;
}

/**
 * An engine cell: an octagonal armoured housing standing out of the stern from `back` to its lip at
 * `mouth`, and inside it a chamber glowing more the deeper it goes, two baffle rings, four vanes across
 * the throat and a white-hot core. r is the chamber's apothem at the lip.
 */
function engineCell(b: HullBuilder, mouth: number, cy: number, cz: number, r: number, back: number): EngineSpec {
  const depth = r * 1.7;
  b.use(HEAT, 0.95);
  b.loft([octX(back, cy, cz, r * 1.28), octX(mouth + 0.06, cy, cz, r * 1.28), octX(mouth, cy, cz, r * 1.2)], [false, false]);
  const lipO = octX(mouth, cy, cz, r * 1.2);
  const lipI = octX(mouth, cy, cz, r * 1.04);
  b.use(METAL, 0.85);
  for (let j = 0; j < 8; j++) b.quadN(lipO[j], lipO[(j + 1) % 8], lipI[(j + 1) % 8], lipI[j], AFT);
  // The chamber's walls, facing the axis: [depth fraction, radius fraction, glow].
  const walls = [
    [0, 1.04, 0.05],
    [0.3, 0.98, 0.22],
    [0.62, 0.9, 0.5],
    [1, 0.84, 0.95],
  ];
  b.use(BELL);
  for (let i = 0; i < walls.length - 1; i++) {
    const [ta, ra, ga] = walls[i];
    const [tb, rb, gb] = walls[i + 1];
    const A = octX(mouth + depth * ta, cy, cz, r * ra);
    const B = octX(mouth + depth * tb, cy, cz, r * rb);
    const axis = v(mouth + depth * (ta + tb) * 0.5, cy, cz);
    for (let j = 0; j < 8; j++) {
      const k = (j + 1) % 8;
      b.tri(A[j], A[k], B[k], axis, true, ga);
      b.tri(A[j], B[k], B[j], axis, true, (ga + gb) / 2);
    }
  }
  // Baffles: thin rings standing in from the wall, dark against the glow.
  b.use(METAL, 0.45);
  for (const [t, rw] of [
    [0.3, 0.98],
    [0.62, 0.9],
  ]) {
    const x = mouth + depth * t;
    const o = octX(x, cy, cz, r * rw);
    const i = octX(x, cy, cz, r * (rw - 0.13));
    for (let j = 0; j < 8; j++) b.quadN(o[j], o[(j + 1) % 8], i[(j + 1) % 8], i[j], AFT);
  }
  // The back: a blue ring round the white core.
  const bx = mouth + depth;
  const ring = octX(bx, cy, cz, r * 0.84);
  const core = octX(bx, cy, cz, r * 0.42);
  b.use(BELL);
  for (let j = 0; j < 8; j++) b.quadN(ring[j], ring[(j + 1) % 8], core[(j + 1) % 8], core[j], AFT, 1.0);
  b.use(THROAT);
  const centre = v(bx, cy, cz);
  for (let j = 0; j < 8; j++) b.triN(centre, core[j], core[(j + 1) % 8], AFT);
  return { at: v(mouth, cy, cz), r };
}

/** A small attitude thruster: a block on a surface with two tiny glowing ports facing `dir`. */
function rcs(b: HullBuilder, at: V3, dir: V3, size = 0.07): void {
  const n = dir.clone().normalize();
  const t = Math.abs(n.y) < 0.9 ? new THREE.Vector3().crossVectors(n, UP).normalize() : v(1, 0, 0);
  const s = new THREE.Vector3().crossVectors(n, t);
  b.use(HEAT, 0.9);
  const top = drape(b, [[-size, -size * 0.6], [size, -size * 0.6], [size, size * 0.6], [-size, size * 0.6]], planar(at, t, s), n, size * 0.6, size * 0.15, 0.04);
  const c = centroid(top);
  for (const side of [-1, 1]) {
    const p = c.clone().addScaledVector(t, side * size * 0.45);
    const q = (du: number, dv: number) => p.clone().addScaledVector(t, du * size * 0.26).addScaledVector(s, dv * size * 0.3);
    lamp(b, [q(-1, -1), q(1, -1), q(1, 1), q(-1, 1)], n, 0.25, 0.003);
  }
}

/** A small point-defence turret on a deck: a rimmed ring, a raked head and two barrels pointing forward. */
function turret(b: HullBuilder, at: V3, size: number): void {
  const flat = (r: number) => octX(0, 0, 0, r).map((p) => [p.y, p.z] as P2);
  b.use(METAL, 0.7);
  drape(b, flat(size), planar(at, v(1, 0, 0), v(0, 0, 1)), UP, size * 0.3, size * 0.1, 0.03);
  b.use(PLATE, 1.25);
  const y0 = at.y + size * 0.25;
  beam(b, [
    [at.x - size * 0.9, y0, y0 + size * 0.75, size * 0.7, at.z],
    [at.x + size * 0.45, y0, y0 + size * 0.75, size * 0.7, at.z],
    [at.x + size * 0.95, y0, y0 + size * 0.4, size * 0.5, at.z],
  ], size * 0.12);
  b.use(METAL, 1.0);
  for (const dz of [-0.28, 0.28]) {
    const y = y0 + size * 0.42;
    tube(b, v(at.x + size * 0.8, y, at.z + dz * size), v(at.x + size * 3.2, y, at.z + dz * size), size * 0.09, 6);
  }
  b.use(LAMP, 0.5);
  slab(b, at.x + size * 0.46, at.x + size * 0.62, y0 + size * 0.52, y0 + size * 0.62, size * 0.5, size * 0.4, at.z, 0.004);
}

// ---------------------------------------------------------------------------------------------
// The hull

/**
 * The central hull and nose: [x, top, bottom, half width, deck half width, keel half width, shoulder
 * drop, chine rise]. Deep, for the mass of a capital ship. The deck narrows and the upper sides steepen
 * toward the bow, so the nose is a roof over tall, upright cheeks and a big blunt face: a heavy wedge,
 * not a point. Aft of the stern wall (-4.9) it runs on as a skirt round the engines.
 */
const HULL = [
  [-5.45, 0.84, -0.88, 0.98, 0.52, 0.56, 0.3, 0.26],
  [-5.05, 0.88, -0.92, 1.0, 0.52, 0.58, 0.31, 0.26],
  [-3.2, 1.0, -1.0, 1.06, 0.54, 0.62, 0.34, 0.28],
  [-0.6, 1.04, -1.02, 1.08, 0.54, 0.62, 0.34, 0.28],
  [1.6, 1.06, -1.02, 1.08, 0.52, 0.62, 0.36, 0.28],
  [2.7, 1.08, -1.04, 1.08, 0.46, 0.62, 0.4, 0.3],
  [3.8, 1.04, -1.04, 1.06, 0.34, 0.6, 0.46, 0.32],
  [4.9, 0.88, -1.0, 1.0, 0.26, 0.54, 0.46, 0.34],
  [5.6, 0.68, -0.92, 0.9, 0.2, 0.46, 0.4, 0.34],
  [6.1, 0.46, -0.8, 0.78, 0.16, 0.38, 0.3, 0.3],
];
const hullAt = (x: number) => table(HULL, x);
const deckY = (x: number) => hullAt(x)[0];

/** A hull section: flat deck, sloped upper sides, upright sides, chines and a flat keel. Edges: 0 deck, 1/7 upper slopes, 2/6 sides, 3/5 chines, 4 keel. */
function hullRing(x: number): Ring {
  const [top, bot, w, deck, keel, sh, ch] = hullAt(x);
  return ringX(x, [
    [top, deck],
    [top, -deck],
    [top - sh, -w],
    [bot + ch, -w],
    [bot, -keel],
    [bot, keel],
    [bot + ch, w],
    [top - sh, w],
  ]);
}

/** The citadel, the ship's head block, standing on the midships: [x, foot (inside the hull), top, half width at the foot, on top]. */
const CITADEL = [
  [-3.9, 0.8, 1.5, 0.76, 0.48],
  [-3.5, 0.8, 1.86, 0.82, 0.54],
  [-0.3, 0.8, 1.96, 0.86, 0.58],
  [0.8, 0.8, 1.88, 0.82, 0.52],
  [1.5, 0.8, 1.36, 0.68, 0.4],
];
const citadelAt = (x: number) => table(CITADEL, x);

/** Edges: 0 top, 1/5 bevels, 2/4 sides, 3 foot (inside the hull). */
function citadelRing(x: number): Ring {
  const [base, top, w, wt] = citadelAt(x);
  return ringX(x, [
    [top, wt],
    [top, -wt],
    [top - 0.2, -w],
    [base, -w],
    [base, w],
    [top - 0.2, w],
  ]);
}

/**
 * The pods either side of the hull: [x, inner z, outer z, top, bottom]. Big rounded boxes as tall as the
 * hull, their fronts curving back from just behind the nose's root so the nose stays the one thing that
 * points forward; aft of their stern wall (-4.8) they run on as a skirt round their engines.
 */
const SHOULDER = [
  [-5.35, 0.6, 2.86, 0.92, -0.92],
  [-4.95, 0.6, 2.94, 0.98, -0.98],
  [-4.4, 0.6, 3.0, 1.0, -1.02],
  [-2.4, 0.6, 3.06, 1.02, -1.04],
  [-0.4, 0.6, 3.04, 1.02, -1.04],
  [1.2, 0.6, 2.86, 0.98, -1.0],
  [2.1, 0.6, 2.3, 0.88, -0.9],
  [2.75, 0.6, 1.24, 0.66, -0.66],
];
const shoulderAt = (x: number) => table(SHOULDER, x);

/**
 * A pod section, its outer corners rounded in two facets each. Edges: 0 top, 1/2 upper corner, 3 outer
 * side, 4/5 lower corner, 6 bottom, 7 inner (inside the hull).
 */
function shoulderRing(x: number, s: number, zInner?: number): Ring {
  const [zi0, zo, top, bot] = shoulderAt(x);
  const zi = zInner ?? zi0;
  const R = Math.min(0.44, (zo - zi0) * 0.3);
  const Rb = Math.min(0.38, (zo - zi0) * 0.26);
  const k = 1 - Math.SQRT1_2;
  return ringX(x, [
    [top, s * zi],
    [top, s * (zo - R)],
    [top - R * k, s * (zo - R * k)],
    [top - R, s * zo],
    [bot + Rb, s * zo],
    [bot + Rb * k, s * (zo - Rb * k)],
    [bot, s * (zo - Rb)],
    [bot, s * zi],
  ]);
}

/**
 * A bent armour shell over a pod's upper corner, from the top's outer edge round to the middle of the
 * outer side, standing h proud, its fore and aft edges bevelled and raked back by `rake` as they run
 * down: a row of them reads as big angled plates rather than a grid of panels.
 */
function podShell(b: HullBuilder, s: number, x0: number, x1: number, h: number, rake: number): void {
  const N = [v(0, 1, 0), v(0, 0.924, 0.383 * s), v(0, 0.707, 0.707 * s), v(0, 0.383, 0.924 * s), v(0, 0, s)];
  const f = [0, 0.15, 0.4, 0.62, 1];
  const point = (x: number, k: number) => {
    const r = shoulderRing(x, s);
    return k === 0 ? r[0].clone().lerp(r[1], 0.9) : k === 4 ? r[3].clone().lerp(r[4], 0.5) : r[k].clone();
  };
  const at = (t: number, k: number, lift: number) => point(x0 + (x1 - x0) * t - rake * f[k], k).addScaledVector(N[k], lift);
  const steps = Math.max(1, Math.ceil((x1 - x0) / 0.5));
  const bevel = 0.035 / (x1 - x0);
  const ts = Array.from({ length: steps + 1 }, (_, i) => i / steps);
  const tOut = ts.map((t, i) => (i === 0 ? bevel : i === steps ? 1 - bevel : t));
  for (let i = 0; i < steps; i++) {
    for (let k = 0; k < 4; k++) b.quadN(at(tOut[i], k, h), at(tOut[i + 1], k, h), at(tOut[i + 1], k + 1, h), at(tOut[i], k + 1, h), N[k].clone().add(N[k + 1]));
    b.quadN(at(ts[i], 0, -0.01), at(ts[i + 1], 0, -0.01), at(tOut[i + 1], 0, h), at(tOut[i], 0, h), v(0, 0.3, -s));
    b.quadN(at(ts[i], 4, -0.01), at(ts[i + 1], 4, -0.01), at(tOut[i + 1], 4, h), at(tOut[i], 4, h), v(0, -1, 0.3 * s));
  }
  for (const [t, ti, out] of [
    [1, 1 - bevel, v(1, 0, 0)],
    [0, bevel, v(-1, 0, 0)],
  ] as [number, number, V3][]) {
    for (let k = 0; k < 4; k++) b.quadN(at(t, k, -0.01), at(t, k + 1, -0.01), at(ti, k + 1, h), at(ti, k, h), out);
  }
  // A light along its lower edge.
  const lo = (t: number, u: number) => at(t, 3, h + 0.004).lerp(at(t, 4, h + 0.004), u);
  lamp(b, [lo(0.06, 0.86), lo(0.94, 0.86), lo(0.94, 0.95), lo(0.06, 0.95)], N[3].clone().add(N[4]), 0.8, 0);
}

/** The armour cowl on each pod's top, a dark channel between it and the citadel: [x, inner z, outer z, top]. */
const COWL = [
  [-4.3, 0.95, 2.5, 1.2],
  [-1.1, 0.95, 2.64, 1.24],
  [0.6, 0.95, 2.4, 1.18],
  [1.5, 0.95, 1.7, 1.06],
];
const cowlAt = (x: number) => table(COWL, x);

/** Edges: 0 top, 1 outer bevel, 2 outer side, 3 foot (inside the pod), 4 inner side, 5 inner bevel. */
function cowlRing(x: number, s: number): Ring {
  const [zi, zo, top] = cowlAt(x);
  return ringX(x, [
    [top, s * (zi + 0.1)],
    [top, s * (zo - 0.14)],
    [top - 0.12, s * zo],
    [0.92, s * (zo + 0.04)],
    [0.92, s * zi],
    [top - 0.1, s * zi],
  ]);
}

/** The arms: [z, leading x, trailing x, centre y, thickness]. Thick and boxy, swept back past the stern, rising a little. */
const WING = [
  [2.85, -1.0, -4.65, -0.02, 0.62],
  [3.85, -2.2, -5.1, 0.02, 0.54],
  [4.6, -3.2, -5.55, 0.06, 0.46],
];

/** Edges: 0 leading upper bevel, 1 top, 2 trailing upper bevel, 3 trailing lower, 4 bottom, 5 leading lower. */
function wingRing(z: number, s: number, grow = 1): Ring {
  const [lead, trail, yc, t0] = table(WING, z);
  const t = t0 * grow;
  const c = lead - trail;
  return [
    v(lead, yc + t * 0.15, s * z),
    v(lead - 0.08 * c, yc + t / 2, s * z),
    v(trail + 0.05 * c, yc + t / 2, s * z),
    v(trail, yc + t * 0.2, s * z),
    v(trail + 0.04 * c, yc - t / 2, s * z),
    v(lead - 0.1 * c, yc - t / 2, s * z),
  ];
}

/** The keel under the hull, running forward into the chin: [x, top (inside the hull), bottom, half width]. */
const KEEL = [
  [-5.2, -0.78, -1.2, 0.4],
  [-3.8, -0.84, -1.32, 0.54],
  [1.4, -0.86, -1.36, 0.56],
  [3.4, -0.86, -1.3, 0.52],
  [4.8, -0.82, -1.22, 0.46],
  [5.75, -0.68, -1.06, 0.38],
];

function keelRing(x: number): Ring {
  const [top, bot, hw] = table(KEEL, x);
  return ringX(x, [
    [top, hw],
    [top, -hw],
    [bot + 0.08, -hw],
    [bot, -hw + 0.1],
    [bot, hw - 0.1],
    [bot + 0.08, hw],
  ]);
}

const SKIP: Paint = { style: 'skip', kind: 0, tint: 0, h: 0 };

/** A ring drawn in by d all round (its y and z extents each shrink by 2d about its middle). */
function innerRing(r: Ring, d: number): Ring {
  const box = new THREE.Box3().setFromPoints(r);
  const c = box.getCenter(new THREE.Vector3());
  const h = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  const ky = (h.y - d) / h.y;
  const kz = (h.z - d) / h.z;
  return r.map((p) => v(p.x, c.y + (p.y - c.y) * ky, c.z + (p.z - c.z) * kz));
}

/**
 * The armour carried aft past a stern wall as a skirt: plated outside (from `wall` to `rim`), dark
 * inside, a rim facing aft. Returns the rim's outer and inner rings.
 */
function skirt(pl: Plating, wall: Ring, rim: Ring, d: number, paint: (cell: Cell) => Paint): [Ring, Ring] {
  const b = pl.hull;
  armorLoft(pl, [wall, rim], { along: 0.5, across: 0.6, paint });
  const inWall = innerRing(wall, d).map((p) => p.setX(p.x + 0.02));
  const inRim = innerRing(rim, d);
  // Inside, in shadow: the black recess material, its tint below 1 the occlusion (see the hull shader).
  b.use(FRAME, 0.22);
  b.loft([inWall, inRim], [false, false], true);
  b.use(METAL, 0.8);
  const n = rim.length;
  for (let j = 0; j < n; j++) b.quadN(rim[j], rim[(j + 1) % n], inRim[(j + 1) % n], inRim[j], AFT);
  return [rim, inRim];
}

/**
 * Rows of plates either side of the centreline on a top surface y(x), from x0 to x1: inner edge zIn,
 * outer edge zOut(x), seams every 0.45-0.85 units, a quarter of them with a second plate stacked on.
 */
function plateRows(pl: Plating, x0: number, x1: number, zIn: number, zOut: (x: number) => number, y: (x: number) => number, light = 0.85): void {
  const { hull: b, rand } = pl;
  const surf = (x: number, z: number) => v(x, y(x), z);
  for (const s of [1, -1]) {
    let x = x0;
    while (x < x1 - 0.2) {
      const xe = Math.min(x1, x + 0.45 + rand() * 0.4);
      const isLight = rand() < light;
      b.use(isLight ? LIGHT : PLATE, isLight ? (rand() < 0.12 ? 0.64 : 0.8 + rand() * 0.2) : 1.1);
      const zo = Math.min(zOut(x), zOut(xe)) - 0.03;
      const xm = (x + xe) / 2;
      const n = v(-(y(xm + 0.05) - y(xm - 0.05)) / 0.1, 1, 0).normalize();
      const top = drape(b, [[x, s * zIn], [xe, s * zIn], [xe, s * zo], [x, s * zo]], surf, n, 0.05, 0.016);
      if (rand() < 0.25) {
        b.use(isLight ? LIGHT : PLATE, isLight ? 0.84 : 1.2);
        plate4(b, inset4(top, [0.05, 0.08, 0.05, 0.08]), n, 0.03);
      }
      x = xe + 0.045;
    }
  }
}

/** A bar from p to q lying on a surface that faces n: w wide, standing h out of it, its ends overlapping. */
function bar(b: HullBuilder, p: V3, q: V3, n: V3, w: number, h: number): void {
  const U = q.clone().sub(p);
  const L = U.length();
  U.divideScalar(L);
  const W = new THREE.Vector3().crossVectors(n, U).normalize();
  drape(b, [[-w * 0.3, -w / 2], [L + w * 0.3, -w / 2], [L + w * 0.3, w / 2], [-w * 0.3, w / 2]], planar(p, U, W), n, h, Math.min(0.012, h * 0.3), 0.01);
}

/** Rimmed bores on a face: a metal rim, a black bore, the engines' blue glowing far down (glow 0..1). */
function bores(b: HullBuilder, at: V3[], U: V3, V: V3, n: V3, r: number, glow: number): void {
  const oct = (k: number) => octX(0, 0, 0, r * k).map((p) => [p.y, p.z] as P2);
  for (const p of at) {
    const pz = planar(p, U, V);
    b.use(METAL, 0.95);
    drape(b, oct(1), pz, n, 0.022, 0.008, 0.01);
    b.use(FRAME, 1);
    drape(b, oct(0.78), pz, n, 0.025, 0, 0.004);
    b.use(BELL, glow);
    drape(b, oct(0.45), pz, n, 0.027, 0, 0.002);
  }
}

interface Built {
  hull: THREE.BufferGeometry;
  decals: THREE.BufferGeometry;
  engines: EngineSpec[];
}

async function buildHull(rand: () => number, pace: () => Promise<void>): Promise<Built> {
  const b = new HullBuilder(rand);
  const decals = new HullBuilder(rand, true);
  const pl: Plating = { hull: b, decals, rand };
  const engines: EngineSpec[] = [];
  const sides = [1, -1];

  // --- The central hull, from its stern wall to the root of the nose, and its skirt aft of the wall.
  // Its flanks are inside the pods: only its deck (plated by hand) shows, and ahead of the pods its
  // upper slopes and chines.
  armorLoft(pl, [-4.9, -3.2, -0.6, 1.6, 2.7].map(hullRing), {
    along: 0.8,
    across: 0.6,
    caps: [true, false],
    paint: (cell) => {
      const e = cell.edge;
      if (cell.c.x < 1.6 || e === 0 || e === 2 || e === 4 || e === 6) return SKIP;
      if (e === 3 || e === 5) return { ...dress(rand, cell), style: 'plate' };
      return dress(rand, cell, { lamps: 0.08, light: 0.8 });
    },
  });
  const [rimOut, rimIn] = skirt(pl, hullRing(-4.9), hullRing(-5.45), 0.08, (cell) => (cell.edge === 0 || cell.edge === 2 || cell.edge === 6 ? SKIP : dress(rand, cell, { lamps: 0.1, light: 0.8 })));
  fitDecal(decals, [rimOut[0], rimOut[1], rimIn[1], rimIn[0]], AFT, METAL, { cell: 'hazard', paint: 1, right: v(0, 0, 1), fill: 0.86, stretch: 1.3 });

  // --- The nose: one blunt, heavy prow. A dark spine along its narrow deck between two light strips,
  // its roof in V-shaped plates stepping down to the face, its cheeks in big plates split by upright
  // light strips, its face a white ridge between two strips and two dark plates, a jaw under it.
  armorLoft(pl, [2.7, 3.8, 4.9, 5.6, 6.1].map(hullRing), {
    along: 0.75,
    across: 0.5,
    caps: [false, true],
    paint: (cell) => {
      const e = cell.edge;
      if (e === 0 || e === 1 || e === 7 || e === 2 || e === 6) return SKIP;
      return { ...dress(rand, cell, { bays: 0.06 }), style: rand() < 0.2 ? 'vent' : 'plate' };
    },
  });
  await pace();

  b.use(METAL, 0.8);
  b.loft([2.6, 3.2, 3.8, 4.35, 4.9, 5.25, 5.6, 6.02].map((x) => ringX(x, rect(deckY(x) + 0.05, 0, 0.09, Math.min(0.07, hullAt(x)[3] * 0.45), 0.016))));
  for (const s of sides) {
    // The roof: four layers a side, their seams raked back from the spine, so together they make chevrons.
    const deckEdge = (x: number) => v(x, hullAt(x)[0], s * hullAt(x)[3]);
    const sideTop = (x: number) => v(x, hullAt(x)[0] - hullAt(x)[5], s * hullAt(x)[2]);
    const roof = (x: number, u: number) => deckEdge(x).lerp(sideTop(x), u);
    const roofNormal = (x: number) => {
      const t = sideTop(x).sub(deckEdge(x));
      const n = new THREE.Vector3().crossVectors(t, v(1, 0, 0)).normalize();
      return n.y < 0 ? n.negate() : n;
    };
    const rake = 0.34;
    const layers = [
      [2.76, 3.68, 0.11, 1.0],
      [3.74, 4.56, 0.095, 0.92],
      [4.62, 5.36, 0.08, 0.98],
      [5.42, 6.12, 0.065, 0.9],
    ];
    layers.forEach(([x0, x1, h, tint], i) => {
      b.use(i === 2 ? PLATE : LIGHT, i === 2 ? 1.25 : tint);
      const top = drape(b, [[x0, 0.05], [x1, 0.05], [x1 - rake, 1.07], [x0 - rake, 1.07]], roof, roofNormal((x0 + x1) / 2 - rake / 2), h, 0.03, 0.05);
      if (i === 0 || i === 1) {
        b.use(LIGHT, 0.82);
        plate4(b, inset4(top, [0.08, 0.12, 0.12, 0.12]), roofNormal((x0 + x1) / 2), 0.04);
      }
      // A light strip along the spine side of each layer: together, two lines running to the face.
      lamp(b, [roof(x0 + 0.03, 0.012), roof(x1 - 0.03, 0.012), roof(x1 - 0.03, 0.036), roof(x0 + 0.03, 0.036)], roofNormal((x0 + x1) / 2), 0.9, 0.012);
    });
    // Light in two of the raked seams.
    for (const x of [3.71, 5.39]) {
      const n = roofNormal(x - rake / 2);
      lamp(b, [roof(x - 0.014, 0.12), roof(x + 0.014, 0.12), roof(x + 0.014 - rake * 0.76, 0.88), roof(x - 0.014 - rake * 0.76, 0.88)], n, 0.75, 0.012);
    }

    // The cheeks: four plates a side, with light strips standing in the seams between them; the hull
    // number on a dark plate.
    const sideZ = (x: number) => hullAt(x)[2];
    const yLo = (x: number) => hullAt(x)[1] + hullAt(x)[6] + 0.035;
    const yHi = (x: number) => hullAt(x)[0] - hullAt(x)[5] - 0.035;
    const surf = (x: number, y: number) => v(x, y, s * sideZ(x));
    const normalAt = (x: number) => v(-(sideZ(x + 0.05) - sideZ(x - 0.05)) / 0.1, 0, s).normalize();
    [
      [2.78, 3.6],
      [3.7, 4.45],
      [4.55, 5.2],
      [5.3, 6.02],
    ].forEach(([x0, x1], i) => {
      const n = normalAt((x0 + x1) / 2);
      const dark = i === 1 || i === 3;
      b.use(dark ? PLATE : LIGHT, dark ? 1.25 : 0.88 + i * 0.03);
      const outline: P2[] = i === 1 ? [[x0, yLo(x0)], [x1, yLo(x1)], [x1, yHi(x1)], [x0, yHi(x0)]] : [[x0, yLo(x0)], [x1, yLo(x1)], [x1, yHi(x1) - 0.16], [x1 - 0.16, yHi(x1)], [x0, yHi(x0)]];
      const top = drape(b, outline, surf, n, i === 1 ? 0.075 : 0.09, 0.024);
      if (i === 1) {
        fitDecal(decals, top, n, PLATE, { cell: 'number', paint: 0.8, right: v(s, 0, 0), fill: 0.62, offset: 0.08 });
        fitDecal(decals, top, n, PLATE, { cell: 'code', paint: 0.7, right: v(s, 0, 0), fill: 0.5, offset: -0.3 });
      }
    });
    for (const x of [3.65, 4.5, 5.25]) {
      const n = normalAt(x);
      lamp(b, [surf(x - 0.016, yLo(x) + 0.07), surf(x + 0.016, yLo(x) + 0.07), surf(x + 0.016, yHi(x) - 0.07), surf(x - 0.016, yHi(x) - 0.07)], n, 0.8, 0.01);
    }
    // The face: a dark plate each side, angled out to a V, and a light strip each side of the ridge.
    const face = (z: number, y: number) => v(6.1 + (0.75 - Math.abs(z)) * 0.12, y, z);
    b.use(PLATE, 1.3);
    const plate = drape(b, [[s * 0.16, -0.54], [s * 0.72, -0.54], [s * 0.72, 0.1], [s * 0.16, 0.2]], face, v(1, 0, s * 0.12).normalize(), 0.06, 0.02, 0.1);
    b.use(PLATE, 1.1);
    plate4(b, inset4(plate, [0.07, 0.07, 0.07, 0.07]), v(1, 0, s * 0.12).normalize(), 0.03);
    lamp(b, [v(6.1, -0.5, s * 0.1), v(6.1, -0.5, s * 0.135), v(6.1, 0.3, s * 0.135), v(6.1, 0.3, s * 0.1)], v(1, 0, 0), 0.95, 0.012);
    // Lights across the jaw, and thrusters on the chin's flanks.
    lamp(b, [v(6.06, -0.87, s * 0.16), v(6.06, -0.87, s * 0.36), v(6.06, -0.84, s * 0.36), v(6.06, -0.84, s * 0.16)], v(1, 0, 0), 0.7, 0.006);
    rcs(b, v(5.2, -1.12, s * 0.47), v(0, -0.4, s), 0.05);
  }
  // The ridge down the middle of the face, standing proud of the plates beside it.
  b.use(LIGHT, 0.95);
  drape(b, [[-0.08, -0.66], [0.08, -0.66], [0.08, 0.38], [0, 0.44], [-0.08, 0.38]], (z, y) => v(6.1, y, z), v(1, 0, 0), 0.2, 0.03, 0.05);
  // The jaw: a dark block under the face, stepped back from it, the keel's chin stepped back again.
  b.use(PLATE, 1.15);
  slab(b, 5.5, 6.06, -0.98, -0.72, 0.5, 0.44, 0, 0.04);
  await pace();

  // --- The citadel over the midships, the ship's head block: plated bevels, light flanks with the hull
  // number between lit seams, two rows of plates on top either side of a lit channel, the bridge
  // stepped up on its forward end and two blade towers beside it.
  armorLoft(pl, [-3.9, -3.5, -0.3, 0.8, 1.5].map(citadelRing), {
    along: 0.75,
    across: 0.5,
    caps: [true, true],
    paint: (cell) => {
      const e = cell.edge;
      if (e === 0 || e === 3) return SKIP;
      if (e === 1 || e === 5) return { style: rand() < 0.2 ? 'double' : 'plate', kind: LIGHT, tint: 0.86 + rand() * 0.12, h: 0.045, lamp: rand() < 0.12 ? 0 : undefined };
      if (cell.c.x > -3.45 && cell.c.x < 0.62) return SKIP;
      const p = dress(rand, cell, { light: 0.3, bays: 0.12 });
      if (p.style === 'plate' && rand() < 0.2) {
        p.lamp = rand() < 0.5 ? 1 : 3;
        p.lampTint = 0.7;
      }
      return p;
    },
  });
  for (const s of sides) {
    const cw = (x: number) => citadelAt(x)[2];
    const surf = (x: number, y: number) => v(x, y, s * cw(x));
    const normalAt = (x: number) => v(-(cw(x + 0.05) - cw(x - 0.05)) / 0.1, 0, s).normalize();
    const yHi = (x: number) => citadelAt(x)[1] - 0.23;
    [
      [-3.4, -2.2],
      [-2.1, -0.62],
      [-0.52, 0.58],
    ].forEach(([x0, x1], i) => {
      const n = normalAt((x0 + x1) / 2);
      b.use(LIGHT, i === 1 ? 0.88 : 0.8);
      const top = drape(b, [[x0, 1.04], [x1, 1.04], [x1, yHi(x1)], [x0, yHi(x0)]], surf, n, 0.06, 0.02);
      if (i === 1) fitDecal(decals, top, n, LIGHT, { cell: 'number', paint: 0.85, right: v(s, 0, 0), fill: 0.6, offset: 0.12 });
      if (i === 0) fitDecal(decals, top, n, LIGHT, { cell: 'emblem', paint: 0.8, right: v(s, 0, 0), fill: 0.5, offset: 0.12 });
    });
    for (const x of [-2.15, -0.57]) {
      const n = normalAt(x);
      lamp(b, [surf(x - 0.016, 1.12), surf(x + 0.016, 1.12), surf(x + 0.016, yHi(x) - 0.06), surf(x - 0.016, yHi(x) - 0.06)], n, 0.8, 0.008);
    }
  }
  await pace();
  plateRows(pl, -3.86, -0.5, 0.1, (x) => citadelAt(x)[3], (x) => citadelAt(x)[1]);
  for (let x = -3.4; x < -0.7; x += 0.55) {
    const y0 = citadelAt(x)[1];
    const y1 = citadelAt(x + 0.32)[1];
    lamp(b, [v(x, y0, -0.02), v(x + 0.32, y1, -0.02), v(x + 0.32, y1, 0.02), v(x, y0, 0.02)], UP, 0.65, 0.004);
  }
  // The bridge.
  b.use(PLATE, 1.25);
  const bridge = beam(b, [
    [-0.45, 1.88, 2.14, 0.46],
    [0.85, 1.82, 2.18, 0.44],
    [1.45, 1.38, 1.86, 0.28],
  ], 0.04);
  {
    const A = bridge[1];
    const B = bridge[2];
    const face = (P: Ring, Q: Ring, j: number, t0: number, t1: number, u0: number, u1: number, tint: number) => {
      const k = (j + 1) % P.length;
      const at = (t: number, u: number) => P[j].clone().lerp(P[k], u).lerp(Q[j].clone().lerp(Q[k], u), t);
      const q = [at(t0, u0), at(t1, u0), at(t1, u1), at(t0, u1)];
      const n = new THREE.Vector3().crossVectors(q[2].clone().sub(q[0]), q[3].clone().sub(q[1])).normalize();
      if (n.dot(centroid(q).sub(centroid(P).add(centroid(Q)).multiplyScalar(0.5))) < 0) n.negate();
      lamp(b, q, n, tint, 0.004);
    };
    // Windows: a band across the forward slope and along both sides.
    face(A, B, 0, 0.42, 0.68, 0.06, 0.94, 0.3);
    face(A, B, 2, 0.05, 0.75, 0.55, 0.72, 0.26);
    face(A, B, 6, 0.05, 0.75, 0.28, 0.45, 0.26);
    face(bridge[0], A, 2, 0.5, 0.95, 0.55, 0.72, 0.26);
    face(bridge[0], A, 6, 0.5, 0.95, 0.28, 0.45, 0.26);
  }
  b.use(LIGHT, 0.95);
  slab(b, -0.4, 0.66, 2.12, 2.23, 0.32, 0.27, 0, 0.03);
  b.use(METAL, 0.9);
  slab(b, -0.15, 0.4, 2.21, 2.33, 0.15, 0.13, 0, 0.03);
  b.use(METAL, 1.1);
  tube(b, v(0.15, 2.31, 0), v(0.15, 2.72, 0), 0.02, 6);
  tube(b, v(-0.05, 2.31, 0.09), v(-0.05, 2.54, 0.09), 0.012, 5);
  tube(b, v(-0.05, 2.31, -0.09), v(-0.05, 2.48, -0.09), 0.012, 5);
  b.use(LAMP, 1.6);
  slab(b, 0.12, 0.18, 2.72, 2.76, 0.03, 0.03, 0, 0.008);
  b.use(METAL, 0.85);
  drape(b, octX(0, 0, 0, 0.1).map((p) => [p.y, p.z] as P2), planar(v(0.5, 2.27, -0.2), v(0.3, 0.95, 0).normalize(), v(0, 0, 1)), v(0.95, -0.3, 0).normalize(), 0.03, 0.01, 0.02);
  for (const s of sides) {
    // A blade tower, raked back, with a dark inset, a lit leading edge and a beacon.
    const surf = (x: number, y: number) => v(x, y, s * 0.5);
    b.use(LIGHT, 0.9);
    drape(b, [[-0.05, 1.86], [-0.84, 1.86], [-1.04, 2.6], [-0.58, 2.66]], surf, v(0, 0, 1), 0.05, 0.02, 0.05);
    b.use(PLATE, 1.3);
    drape(b, [[-0.28, 2.0], [-0.74, 2.0], [-0.88, 2.44], [-0.62, 2.47]], surf, v(0, 0, 1), 0.068, 0.01, 0.068);
    for (const side of [1, -1]) {
      const at = (t: number, off: number) => v(-0.05 + (-0.58 + 0.05) * t - off, 1.86 + (2.66 - 1.86) * t, s * 0.5 + side * 0.051);
      lamp(b, [at(0.2, 0.05), at(0.9, 0.05), at(0.9, 0.085), at(0.2, 0.085)], v(0, 0, side), 0.75, 0.002);
    }
    b.use(LAMP, 1.05);
    slab(b, -0.76, -0.62, 2.62, 2.68, 0.035, 0.035, s * 0.5, 0.008);
  }

  // --- The forward deck, between the bridge and the nose, with a twin-barrelled turret.
  plateRows(pl, 1.54, 2.7, 0.05, (x) => hullAt(x)[3], deckY);
  {
    const tx = 2.05;
    const ty = deckY(tx) + 0.05;
    b.use(METAL, 0.75);
    drape(b, octX(0, 0, 0, 0.24).map((p) => [p.y, p.z] as P2), planar(v(tx, ty, 0), v(1, 0, 0), v(0, 0, 1)), UP, 0.06, 0.02, 0.02);
    b.use(PLATE, 1.2);
    beam(b, [
      [tx - 0.22, ty + 0.05, ty + 0.2, 0.18],
      [tx + 0.14, ty + 0.05, ty + 0.2, 0.18],
      [tx + 0.3, ty + 0.05, ty + 0.12, 0.12],
    ], 0.03);
    b.use(METAL, 1.0);
    for (const z of [-0.07, 0.07]) {
      tube(b, v(tx + 0.2, ty + 0.14, z), v(tx + 0.86, ty + 0.14, z), 0.024, 6);
      tube(b, v(tx + 0.78, ty + 0.14, z), v(tx + 0.88, ty + 0.14, z), 0.032, 6);
    }
  }

  // --- Over the stern, the block that carries the hull number aft, above the door, and the dorsal fin
  // rising off it from the back of the citadel.
  armorLoft(pl, [
    [-5.52, 0.8, 1.34, 0.56],
    [-5.38, 0.8, 1.42, 0.6],
    [-4.2, 0.8, 1.42, 0.6],
    [-3.92, 0.8, 1.3, 0.52],
  ].map(([x, y0, y1, hw]) => ringX(x, rect((y0 + y1) / 2, 0, (y1 - y0) / 2, hw, 0.08))), {
    along: 0.6,
    across: 0.45,
    caps: [true, true],
    paint: (cell) => {
      const e = cell.edge;
      if (e === 4) return SKIP;
      if (e === 0) return { style: rand() < 0.25 ? 'double' : 'plate', kind: LIGHT, tint: 0.9 + rand() * 0.2, h: 0.045, lamp: rand() < 0.15 ? 0 : undefined };
      return dress(rand, cell, { light: 0.25, lamps: 0.12 });
    },
  });
  {
    // Its aft face: a light plate with the number, a light strip over it.
    const surf = (z: number, y: number) => v(-5.52, y, z);
    b.use(LIGHT, 1.6);
    const top = drape(b, [[-0.48, 0.86], [0.48, 0.86], [0.48, 1.26], [-0.48, 1.26]], surf, AFT, 0.05, 0.016, 0.03);
    fitDecal(decals, top, AFT, LIGHT, { cell: 'number', paint: 0.12, right: v(0, 0, 1), fill: 0.62 });
    lamp(b, [surf(-0.44, 1.29), surf(0.44, 1.29), surf(0.44, 1.315), surf(-0.44, 1.315)], AFT, 0.9, 0.006);
  }
  {
    const fin: P2[] = [
      [-3.62, 1.72],
      [-4.08, 1.36],
      [-5.3, 1.36],
      [-5.52, 2.95],
      [-4.76, 3.02],
    ];
    const finSurf = (x: number, y: number) => v(x, y, 0);
    b.use(PLATE, 1.1);
    drape(b, fin, finSurf, v(0, 0, 1), 0.085, 0.03, 0.085);
    b.use(LIGHT, 1.1);
    drape(b, [[-4.25, 1.6], [-5.2, 1.52], [-5.36, 2.6], [-4.72, 2.64]], finSurf, v(0, 0, 1), 0.11, 0.02, 0.11);
    for (const s of sides) {
      const at = (t: number, off: number) => v(-3.62 + (-4.76 + 3.62) * t - off, 1.72 + (3.02 - 1.72) * t, s * 0.086);
      lamp(b, [at(0.08, 0.06), at(0.92, 0.06), at(0.92, 0.1), at(0.08, 0.1)], v(0, 0, s), 0.9, 0.003);
    }
    b.use(LAMP, 1.6);
    slab(b, -5.22, -5.0, 2.96, 3.02, 0.04, 0.04, 0, 0.01);
  }
  await pace();

  // --- The pods.
  for (const s of sides) {
    const podPaint = (cell: Cell): Paint => {
      const e = cell.edge;
      const c = cell.c;
      if (e === 7) return SKIP;
      // Under the cowl, the channel beside it and the radiators; where the number plate goes.
      if (e === 0 && c.x < 1.5) return SKIP;
      if (e === 3 && c.x > -2.85 && c.x < -0.8) return SKIP;
      if ((e === 1 || e === 2) && c.x > -4.4 && c.x < 0.9) return SKIP;
      if (e === 3 && c.y > -0.05 && c.x > -4.7 && c.x < 0.6) return SKIP;
      // White above, graphite below, like the hull.
      const upper = e <= 2 || (e === 3 && c.y > 0.25);
      const p = dress(rand, cell, { lamps: 0.08, light: upper ? 0.85 : 0.06, bays: 0.08 });
      if (cell.n.x > 0.35 && c.y < 0.3 && p.kind === LIGHT) {
        p.kind = PLATE;
        p.tint = 1.0 + rand() * 0.25;
      }
      if (e === 3 && p.style === 'plate' && cell.len > 0.35 && rand() < 0.08) p.decal = { cell: rand() < 0.5 ? 'maint' : 'vent', paint: 0.75, fill: 0.7 };
      if (e === 3 && p.style === 'plate' && rand() < 0.15) {
        p.lamp = rand() < 0.5 ? 1 : 3;
        p.lampTint = 0.7;
      }
      return p;
    };
    armorLoft(pl, [-4.8, -4.4, -2.4, -0.4, 1.2, 2.1, 2.75].map((x) => shoulderRing(x, s)), { along: 0.8, across: 0.6, caps: [true, true], paint: podPaint });
    // The skirt starts just outboard of the hull's own, so the two meet in a seam.
    const [sOut, sIn] = skirt(pl, shoulderRing(-4.8, s, 0.985), shoulderRing(-5.35, s, 0.985), 0.07, (cell) => (cell.edge === 7 ? SKIP : cell.edge === 0 ? { style: 'plate', kind: LIGHT, tint: 0.88, h: 0.05 } : podPaint(cell)));
    fitDecal(decals, [sOut[0], sOut[1], sIn[1], sIn[0]], AFT, METAL, { cell: 'hazard', paint: 1, right: v(0, 0, 1), fill: 0.86, stretch: 1.3 });
    await pace();
    {
      // The ship's code on the outer flank.
      const zo = (x: number) => shoulderAt(x)[1];
      const surf = (x: number, y: number) => v(x, y, s * zo(x));
      const n = v(-(zo(-1.75) - zo(-1.85)) / 0.1, 0, s).normalize();
      b.use(LIGHT, 0.82);
      const top = drape(b, [[-2.8, -0.6], [-0.85, -0.6], [-0.85, -0.1], [-2.8, -0.1]], surf, n, 0.055, 0.018);
      fitDecal(decals, top, n, LIGHT, { cell: 'code', paint: 0.85, right: v(s, 0, 0), fill: 0.5, offset: 0.1 });
      fitDecal(decals, top, n, LIGHT, { cell: 'serial', paint: 0.7, right: v(s, 0, 0), fill: 0.86, offset: -0.32 });
    }
    {
      // Big angled shells over the pod's upper corner, a light strip in one seam.
      [
        [-4.3, -2.7, 0.92],
        [-2.6, -0.95, 0.8],
        [-0.85, 0.85, 0.9],
      ].forEach(([x0, x1, tint]) => {
        b.use(LIGHT, tint);
        podShell(b, s, x0, x1, 0.075, 0.35);
      });
      const seam = (k: number, dx: number) => {
        const f = [0, 0.15, 0.4, 0.62, 1][k];
        const x = -0.9 - 0.35 * f + dx;
        const r = shoulderRing(x, s);
        return r[k].clone().addScaledVector([v(0, 1, 0), v(0, 0.924, 0.383 * s), v(0, 0.707, 0.707 * s), v(0, 0.383, 0.924 * s)][k], 0.012);
      };
      for (const k of [1, 2]) lamp(b, [seam(k, -0.016), seam(k, 0.016), seam(k + 1, 0.016), seam(k + 1, -0.016)], v(0, 0.6, 0.6 * s), 0.85, 0);
    }
    {
      // A launcher on the pod's front: an armoured block, two rows of four bores glowing blue, a light
      // bar under them.
      const nF = v(0.8, 0.05, s * 0.6).normalize();
      const U = new THREE.Vector3().crossVectors(UP, nF).normalize();
      const V = new THREE.Vector3().crossVectors(nF, U).normalize();
      const o = v(2.4, 0.0, s * 1.86);
      b.use(PLATE, 1.3);
      drape(b, [[-0.56, -0.5], [0.56, -0.5], [0.56, 0.4], [-0.56, 0.4]], planar(o, U, V), nF, 0.14, 0.04, 0.26);
      const face = planar(o.clone().addScaledVector(nF, 0.14), U, V);
      const at: V3[] = [];
      for (const a of [-0.36, -0.12, 0.12, 0.36]) for (const bb of [0.2, -0.07]) at.push(face(a, bb));
      bores(b, at, U, V, nF, 0.098, 1.0);
      lamp(b, [face(-0.46, -0.4), face(0.46, -0.4), face(0.46, -0.35), face(-0.46, -0.35)], nF, 0.9, 0.006);
    }
    // The cowl.
    armorLoft(pl, [-4.3, -1.1, 0.6, 1.5].map((x) => cowlRing(x, s)), {
      along: 0.8,
      across: 0.55,
      caps: [true, true],
      paint: (cell) => {
        const e = cell.edge;
        const c = cell.c;
        if (e === 3) return SKIP;
        if (e === 0 && (inside(c, -3.15, -1.8, 1.15, 2.1) || inside(c, -1.35, -0.4, 1.1, 2.15))) return SKIP;
        if (e === 0) return { style: rand() < 0.22 ? 'double' : 'plate', kind: LIGHT, tint: 0.86 + rand() * 0.14, h: 0.05, lamp: rand() < 0.1 ? 0 : undefined };
        return dress(rand, cell, { light: e === 4 ? 0.1 : 0.5, lamps: 0.1 });
      },
    });
    {
      const cTop = (x: number) => cowlAt(x)[2];
      const surf = (x: number, z: number) => v(x, cTop(x), s * z);
      const n = v(-(cTop(-2.3) - cTop(-2.5)) / 0.2, 1, 0).normalize();
      // The emblem plate.
      b.use(LIGHT, 0.95);
      const top = drape(b, [[-3.1, 1.2], [-1.85, 1.2], [-1.85, 2.05], [-3.1, 2.05]], surf, n, 0.05, 0.016);
      fitDecal(decals, top, n, LIGHT, { cell: 'emblem', paint: 0.8, right: v(0, 0, 1), fill: 0.82 });
      // Launch cells: a hatch with two rows of four bores.
      b.use(METAL, 0.65);
      drape(b, [[-1.3, 1.15], [-0.45, 1.15], [-0.45, 2.1], [-1.3, 2.1]], surf, n, 0.04, 0.015);
      const at: V3[] = [];
      for (const x of [-1.08, -0.67]) for (const z of [1.31, 1.52, 1.73, 1.94]) at.push(surf(x, z).addScaledVector(n, 0.04));
      bores(b, at, v(1, 0, 0), v(0, 0, s), n, 0.085, 0.85);
    }
    // Radiators behind the cowl.
    b.use(METAL, 0.8);
    for (let i = 0; i < 9; i++) {
      const x0 = -4.78 + i * 0.062;
      slab(b, x0, x0 + 0.026, 0.94, 1.16, 0.72, 0.72, s * 1.7, 0.006);
    }
    b.use(PLATE, 1.1);
    for (const z of [0.98, 2.42]) slab(b, -4.8, -4.24, 0.94, 1.19, 0.035, 0.035, s * z, 0.012);
    // A fairing under the pod, and attitude thrusters fore and aft of it.
    armorLoft(pl, [
      [-4.3, -1.08, 0.36],
      [-3.9, -1.2, 0.5],
      [-0.5, -1.2, 0.5],
      [-0.1, -1.08, 0.36],
    ].map(([x, yb, hw]) => ringX(x, rect((yb - 0.98) / 2, s * 1.85, (-0.98 - yb) / 2, hw, 0.05))), {
      along: 0.75,
      across: 0.45,
      caps: [true, true],
      paint: (cell) => (cell.edge === 0 ? SKIP : dress(rand, cell, { lamps: 0.05 })),
    });
    for (const [x0, x1] of [
      [-3.45, -2.55],
      [-1.75, -0.85],
    ]) {
      const surf = (x: number, z: number) => v(x, -1.2, s * z);
      const n = v(0, -1, 0);
      b.use(FRAME, 1);
      drape(b, [[x0, 1.55], [x1, 1.55], [x1, 2.15], [x0, 2.15]], surf, n, 0.012, 0.004, 0.01);
      b.use(BELL, 0.5);
      b.quadN(surf(x0 + 0.05, 1.6).setY(-1.215), surf(x1 - 0.05, 1.6).setY(-1.215), surf(x1 - 0.05, 2.1).setY(-1.215), surf(x0 + 0.05, 2.1).setY(-1.215), n);
      b.use(METAL, 0.7);
      for (let x = x0 + 0.08; x < x1 - 0.05; x += 0.11) slab(b, x, x + 0.03, -1.25, -1.2, 0.25, 0.25, s * 1.85, 0.004);
    }
    rcs(b, v(0.4, shoulderAt(0.4)[3] - 0.01, s * 1.6), v(0, -1, 0), 0.06);
    rcs(b, v(-4.55, shoulderAt(-4.55)[3] - 0.01, s * 2.45), v(0, -1, 0), 0.06);
    await pace();
  }

  // --- The arms, with armoured tip pods and a canted fin on each.
  for (const s of sides) {
    const side = s > 0 ? 0 : 1;
    armorLoft(pl, [2.85, 3.85, 4.6].map((z) => wingRing(z, s)), {
      along: 0.65,
      across: 0.6,
      caps: [false, false],
      paint: (cell) => {
        const e = cell.edge;
        if (e === 1) {
          const r = rand();
          const p: Paint = { style: r < 0.28 ? 'double' : r < 0.34 ? 'bay' : 'plate', kind: rand() < 0.82 ? LIGHT : PLATE, tint: rand() < 0.15 ? 0.64 : 0.8 + rand() * 0.2, h: 0.05 };
          if (cell.span === 0 && cell.u > 0.5 && cell.u < 0.85 && !wingStencil[side]) {
            wingStencil[side] = true;
            p.style = 'plate';
            p.kind = LIGHT;
            p.decal = { cell: 'nostep', paint: 0.75, right: v(0, 0, 1), fill: 0.5 };
          }
          return p;
        }
        if (e === 2) return { style: 'plate', kind: PLATE, tint: 1.05, h: 0.035, lamp: cell.span === 1 || rand() < 0.5 ? 0 : undefined, lampTint: 0.6 };
        return dress(rand, cell, { lamps: 0.04 });
      },
    });
    const grow = [1.25, 1.45, 1.45, 1.25];
    const tip = [4.5, 4.58, 5.1, 5.18].map((z, i) => {
      const r = wingRing(4.6, s, grow[i]).map((p) => p.setZ(s * z));
      r[0].x += 0.25;
      r[1].x += 0.16;
      r[3].x -= 0.2;
      return r;
    });
    armorLoft(pl, tip, {
      along: 0.6,
      across: 0.4,
      caps: [true, true],
      base: PLATE,
      paint: (cell) => (cell.span === 1 ? { ...dress(rand, cell, { lamps: 0, bays: 0 }), style: 'plate' } : SKIP),
    });
    {
      // The fin on the tip pod, canted outboard.
      const lean = 0.26;
      const V = v(0, Math.cos(lean), s * Math.sin(lean));
      const N = new THREE.Vector3().crossVectors(v(1, 0, 0), V);
      const o = v(0, 0.36, s * 4.84);
      const surf = planar(o, v(1, 0, 0), V);
      b.use(PLATE, 1.15);
      drape(b, [[-4.15, 0], [-5.45, 0], [-5.74, 0.82], [-5.22, 0.86]], surf, N, 0.035, 0.012, 0.035);
      b.use(LIGHT, 0.88);
      drape(b, [[-4.6, 0.1], [-5.36, 0.1], [-5.52, 0.62], [-5.18, 0.64]], surf, N, 0.05, 0.01, 0.05);
      for (const k of [1, -1]) {
        const at = (t: number, off: number) => surf(-4.15 + (-5.22 + 4.15) * t - off, 0.86 * t).addScaledVector(N, k * 0.036);
        lamp(b, [at(0.15, 0.04), at(0.9, 0.04), at(0.9, 0.07), at(0.15, 0.07)], N.clone().multiplyScalar(k), 0.75, 0.002);
      }
      b.use(LAMP, 1.0);
      drape(b, [[-5.48, 0.84], [-5.34, 0.85], [-5.34, 0.9], [-5.48, 0.89]], surf, N, 0.02, 0, 0.02);
    }
    lamp(b, [v(-5.3, -0.04, s * 5.185), v(-4.0, -0.04, s * 5.185), v(-4.0, -0.01, s * 5.185), v(-5.3, -0.01, s * 5.185)], v(0, 0, s), 0.6, 0.004);
    rcs(b, v(-2.96, 0.0, s * 4.84), v(1, 0, 0), 0.05);
    for (const z of [4.72, 4.96]) engines.push(engineCell(b, -5.8, 0.05, s * z, 0.05, -5.5));
  }
  await pace();

  // --- The keel, running forward into the chin, with a deeper block under its middle.
  armorLoft(pl, [-5.2, -3.8, -1.2, 1.4, 3.4, 4.8, 5.75].map(keelRing), {
    along: 0.8,
    across: 0.55,
    caps: [true, true],
    paint: (cell) => {
      const e = cell.edge;
      if (e === 0) return SKIP;
      if (e === 3 && cell.c.x > -3.15 && cell.c.x < 0.75) return SKIP;
      const p = dress(rand, cell, { lamps: 0.03 });
      if ((e === 1 || e === 5) && p.style === 'plate' && cell.len > 0.4 && rand() < 0.12) p.decal = { cell: rand() < 0.5 ? 'warn' : 'arrows', paint: 0.75, fill: 0.5 };
      return p;
    },
  });
  armorLoft(pl, [
    [-3.5, -1.42, 0.28],
    [-3.1, -1.52, 0.4],
    [0.7, -1.52, 0.4],
    [1.1, -1.42, 0.28],
  ].map(([x, yb, hw]) => ringX(x, rect((yb - 1.3) / 2, 0, (-1.3 - yb) / 2, hw, 0.05))), {
    along: 0.75,
    across: 0.45,
    caps: [true, true],
    paint: (cell) => (cell.edge === 0 || (cell.edge === 4 && cell.c.x > -2.75 && cell.c.x < -0.35) ? SKIP : dress(rand, cell, { lamps: 0.04 })),
  });
  {
    // The bay door under the keel, with hazard bands along its sides.
    const surf = (x: number, z: number) => v(x, -1.52, z);
    const n = v(0, -1, 0);
    b.use(PLATE, 1.25);
    const door = drape(b, [[-2.7, -0.32], [-0.4, -0.32], [-0.4, 0.32], [-2.7, 0.32]], surf, n, 0.03, 0.012);
    for (const z of [-0.26, 0.26]) {
      const band = [v(-2.62, 0, z - 0.03), v(-0.48, 0, z - 0.03), v(-0.48, 0, z + 0.03), v(-2.62, 0, z + 0.03)].map((p) => p.setY(door[0].y));
      fitDecal(decals, band, n, PLATE, { cell: 'hazard', paint: 1, right: v(1, 0, 0), fill: 1, stretch: 2.2 });
    }
    for (const [x, z] of [
      [-2.6, -0.22],
      [-2.6, 0.22],
      [-0.5, -0.22],
      [-0.5, 0.22],
    ]) {
      b.use(LAMP, 0.6);
      slab(b, x - 0.02, x + 0.02, door[0].y - 0.012, door[0].y + 0.003, 0.02, 0.02, z, 0.004);
    }
    // Lights along the keel's lower chines.
    const bot = (x: number) => table(KEEL, x)[1];
    for (const s of sides) {
      for (let x = -4.6; x < 4.4; x += 1.8) {
        if (x > -3.4 && x < 1.0) continue;
        const y = bot(x) + 0.04;
        const z = s * (table(KEEL, x)[2] + 0.002);
        lamp(b, [v(x, y - 0.012, z), v(x + 0.5, y - 0.012, z), v(x + 0.5, y + 0.012, z), v(x, y + 0.012, z)], v(0, 0, s), 0.45, 0.002);
      }
    }
  }
  await pace();

  // --- The stern. In the middle, set back in the hull's skirt, a big door: a plate with two raised
  // bands, the emblem, hinges and a hazard band at its foot, light down both sides and across the top
  // of the gap round it. Either side, deep in the pods' skirts, a framed cluster of eight small
  // boosters over a dark plate with the emblem. A small pair under the keel.
  {
    const door = innerRing(hullRing(-5.45), 0.13).map((p) => [p.z, p.y] as P2);
    b.use(PLATE, 0.95);
    drape(b, door, (z, y) => v(-5.28, y, z), AFT, 0.05, 0.025, 0.25);
    const on = (z: number, y: number) => v(-5.33, y, z);
    b.use(PLATE, 1.25);
    for (const y of [0.5, -0.48]) drape(b, [[-0.62, y], [0.62, y], [0.62, y + 0.05], [-0.62, y + 0.05]], on, AFT, 0.025, 0.008, 0.01);
    fitDecal(decals, [on(-0.4, -0.32), on(0.4, -0.32), on(0.4, 0.4), on(-0.4, 0.4)], AFT, PLATE, { cell: 'emblem', paint: 0.85, right: v(0, 0, 1), fill: 0.92 });
    fitDecal(decals, [on(-0.42, -0.68), on(0.42, -0.68), on(0.42, -0.6), on(-0.42, -0.6)], AFT, PLATE, { cell: 'hazard', paint: 1, right: v(0, 0, 1), fill: 1, stretch: 1.6 });
    b.use(METAL, 0.9);
    for (const z of [-0.56, 0.56]) drape(b, [[z - 0.06, -0.64], [z + 0.06, -0.64], [z + 0.06, -0.52], [z - 0.06, -0.52]], on, AFT, 0.07, 0.015, 0.01);
    for (const s of sides) {
      lamp(b, [v(-5.31, -0.5, s * 0.862), v(-5.31, -0.5, s * 0.888), v(-5.31, 0.42, s * 0.888), v(-5.31, 0.42, s * 0.862)], AFT, 0.95, 0);
      b.use(LAMP, 1.2);
      drape(b, [[s * 0.28, 0.6], [s * 0.34, 0.6], [s * 0.34, 0.64], [s * 0.28, 0.64]], on, AFT, 0.01, 0, 0.005);
    }
    lamp(b, [v(-5.31, 0.722, -0.4), v(-5.31, 0.722, 0.4), v(-5.31, 0.746, 0.4), v(-5.31, 0.746, -0.4)], AFT, 0.95, 0);
  }
  for (const s of sides) {
    const wall = innerRing(shoulderRing(-5.35, s, 0.985), 0.072).map((p) => [p.z, p.y] as P2);
    b.use(PLATE, 0.9);
    drape(b, wall, (z, y) => v(-4.95, y, z), AFT, 0.03, 0.01, 0.1);
    const on = (z: number, y: number) => v(-4.98, y, z);
    const frame: P2[] = [
      [1.38, 0.24],
      [1.52, 0.1],
      [2.32, 0.1],
      [2.46, 0.24],
      [2.46, 0.52],
      [2.32, 0.66],
      [1.52, 0.66],
      [1.38, 0.52],
    ];
    b.use(METAL, 0.9);
    frame.forEach(([z, y], i) => {
      const [z1, y1] = frame[(i + 1) % frame.length];
      bar(b, on(s * z, y), on(s * z1, y1), AFT, 0.05, 0.22);
    });
    b.use(FRAME, 1);
    drape(b, frame.map(([z, y]) => [s * z, y] as P2), on, AFT, 0.004, 0, 0.004);
    for (const cy of [0.25, 0.51]) for (const cz of [1.56, 1.8, 2.04, 2.28]) engines.push(engineCell(b, -5.17, cy, s * cz, 0.07, -4.96));
    b.use(PLATE, 1.3);
    const plate = drape(b, [[s * 1.36, -0.62], [s * 2.48, -0.62], [s * 2.48, -0.04], [s * 1.36, -0.04]], on, AFT, 0.06, 0.016, 0.01);
    fitDecal(decals, plate, AFT, PLATE, { cell: 'emblem', paint: 0.8, right: v(0, 0, 1), fill: 0.78 });
    for (const z of [1.3, 2.54]) lamp(b, [on(s * (z - 0.013), -0.55), on(s * (z + 0.013), -0.55), on(s * (z + 0.013), -0.12), on(s * (z - 0.013), -0.12)], AFT, 0.9, 0.004);
  }
  for (const cz of [-0.15, 0.15]) engineCell(b, -5.34, -1.0, cz, 0.07, -5.15);

  // --- Secondary parts: point-defence turrets on the cowls, conduits along the keel and beside the
  // citadel on brackets, collars where the arms meet the pods, a sensor dome under the chin, antennae
  // off the tip pods.
  for (const s of sides) {
    const cTop = (x: number) => cowlAt(x)[2];
    for (const [x, z] of [
      [-3.62, 1.62],
      [-0.05, 1.5],
    ]) turret(b, v(x, cTop(x) + 0.05, s * z), 0.17);
    b.use(METAL, 0.85);
    const kz = (x: number) => s * (table(KEEL, x)[2] + 0.035);
    tube(b, v(-3.7, -1.1, kz(-3.7)), v(1.3, -1.1, kz(1.3)), 0.03, 6);
    tube(b, v(-3.5, -1.2, kz(-3.5)), v(0.9, -1.2, kz(0.9)), 0.022, 6);
    const cz = (x: number) => s * (citadelAt(x)[2] + 0.035);
    tube(b, v(-3.3, 1.05, cz(-3.3)), v(0.6, 1.05, cz(0.6)), 0.026, 6);
    b.use(HEAT, 1.1);
    for (let x = -3.4; x < 1.2; x += 0.62) slab(b, x, x + 0.06, -1.24, -1.04, 0.035, 0.035, kz(x) + s * 0.005, 0.01);
    for (let x = -3.1; x < 0.5; x += 0.7) slab(b, x, x + 0.06, 1.0, 1.09, 0.035, 0.035, cz(x), 0.01);
    // The collar along each arm's root.
    b.use(PLATE, 1.2);
    beam(b, [
      [-4.5, -0.42, 0.36, 0.1, s * 3.1],
      [-1.4, -0.36, 0.3, 0.1, s * 3.07],
      [-1.05, -0.18, 0.12, 0.06, s * 3.05],
    ], 0.03);
    b.use(LIGHT, 0.85);
    for (const x of [-4.1, -3.15, -2.2]) slab(b, x, x + 0.55, -0.3, 0.26, 0.05, 0.05, s * 3.18, 0.012);
    // Antennae forward off the tip pod.
    b.use(METAL, 1.0);
    for (const dz of [0.66, 0.94]) tube(b, v(-3.0, 0.08, s * (4.18 + dz)), v(-2.4, 0.08, s * (4.18 + dz)), 0.011, 5);
  }
  {
    // The sensor dome under the chin.
    const y = table(KEEL, 4.9)[1];
    b.use(METAL, 0.9);
    drape(b, octX(0, 0, 0, 0.15).map((p) => [p.y, p.z] as P2), planar(v(4.95, y, 0), v(1, 0, 0), v(0, 0, 1)), v(0, -1, 0), 0.05, 0.02, 0.02);
    b.use(FRAME, 1);
    drape(b, octX(0, 0, 0, 0.1).map((p) => [p.y, p.z] as P2), planar(v(4.95, y - 0.05, 0), v(1, 0, 0), v(0, 0, 1)), v(0, -1, 0), 0.04, 0.02, 0.01);
    b.use(LAMP, 0.5);
    drape(b, octX(0, 0, 0, 0.035).map((p) => [p.y, p.z] as P2), planar(v(4.95, y - 0.09, 0), v(1, 0, 0), v(0, 0, 1)), v(0, -1, 0), 0.006, 0, 0.004);
  }

  const geometry = (h: HullBuilder) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(h.pos, 3));
    g.setAttribute('aMat', new THREE.Float32BufferAttribute(h.mat, 3));
    if (h.uv) g.setAttribute('aUv', new THREE.Float32BufferAttribute(h.uv, 2));
    g.computeBoundingSphere();
    return g;
  };
  return { hull: geometry(b), decals: geometry(decals), engines };
}

/** Whether each arm's root has its stencil yet (starboard, port). */
const wingStencil = [false, false];

// ---------------------------------------------------------------------------------------------
// The panel sheet: fine detail under the plates

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
    // 4 x 4 cells a tile, each split at random into small panels (a k-d split, so it tiles).
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
    // Fine seams: about a texel and a half.
    float seam = smoothstep(0.004, 0.013, edge);
    float type = h21(vec2(id * 3.1, 7.7));
    float plateH = 0.56 + 0.1 * h21(vec2(id * 5.7, 2.2));
    float height = plateH;
    float albedo = 0.9 + 0.1 * h21(vec2(id * 9.1, 4.4));
    float rough = 0.32 + 0.36 * h21(vec2(id * 2.9, 8.8));
    float lamp = 0.0;
    bool longX = size.x > size.y;
    float acrossQ = longX ? q.y : q.x;
    float alongQ = longX ? q.x : q.y;
    float alongLen = longX ? size.x : size.y;
    float acrossLen = longX ? size.y : size.x;
    float rim = min(edge / 0.05, 1.0);
    if (type < 0.1) {
      // A small vent: slats inside a recessed frame.
      float inset = step(0.045, edge);
      float slat = smoothstep(0.35, 0.5, abs(fract(alongQ * alongLen * 22.0) - 0.5) * 2.0);
      height = mix(plateH, 0.3 + 0.25 * slat, inset);
      albedo *= mix(1.0, 0.55, inset);
      rough = mix(rough, 0.6, inset);
    } else if (type < 0.2) {
      // A raised block.
      float inner = smoothstep(0.03, 0.045, edge);
      height = plateH + 0.16 * inner;
    } else if (type < 0.26 && acrossLen < 0.34) {
      // A strip of ports along a narrow panel, some lit.
      float slot = floor(alongQ * alongLen * 10.0);
      float ports = step(0.3, fract(alongQ * alongLen * 10.0)) * step(abs(acrossQ - 0.5) * acrossLen, 0.028);
      lamp = ports * step(0.5, h21(vec2(id * 4.4, slot)));
      height = plateH - 0.12 * ports;
      albedo *= 0.75;
    } else if (type < 0.4) {
      // An access hatch: an inset outline, two flush handles.
      float ring = step(0.05, edge) * (1.0 - step(0.064, edge));
      vec2 hq = abs(q - 0.5) * size;
      float handle = step(hq.x, 0.02) * step(abs(hq.y - 0.04), 0.008);
      height = plateH - 0.2 * ring - 0.08 * handle;
      albedo *= 1.0 - 0.3 * ring;
    } else {
      // A plain panel with a bolt row inside each long edge.
      float edgeDist = min(acrossQ, 1.0 - acrossQ) * acrossLen;
      float bolts = step(abs(edgeDist - 0.026), 0.007) * step(0.55, fract(alongQ * alongLen * 28.0));
      height += 0.1 * bolts;
      albedo *= 1.0 - 0.12 * bolts;
    }
    height += 0.04 * (1.0 - rim) * seam;
    // A little variation along the hull, kept faint: the ship is new.
    float lane = floor(vUv.x * 128.0);
    float wear = h21(vec2(lane, 3.3)) * smoothstep(0.5, 1.0, h21(vec2(lane, floor(vUv.y * 8.0))));
    albedo *= 1.0 - 0.07 * wear;
    height = mix(0.28, height, seam);
    albedo *= mix(0.5, 1.0, seam);
    rough = mix(0.8, rough, seam);
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
  #ifdef DECAL
  attribute vec2 aUv;
  varying vec2 vUv;
  #endif
  varying vec3 vPosW;
  varying vec3 vLocal;
  varying vec3 vMat;
  void main() {
    vLocal = position;
    vMat = aMat;
    #ifdef DECAL
    vUv = aUv;
    #endif
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPosW = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const HULL_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform sampler2D uPanel;
  #ifdef DECAL
  uniform sampler2D uMarks;
  varying vec2 vUv;
  #endif
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
  uniform vec3 uEngineC;
  uniform vec3 uEngineColor;
  uniform vec3 uLampColor;
  uniform vec3 uFillDir;
  uniform vec3 uFillColor;
  uniform float uPower;
  uniform float uBump;
  uniform float uFade;
  uniform float uDetailScale;
  varying vec3 vPosW;
  varying vec3 vLocal;
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
    col += uSunColor * pow(s, sharp) * (sharp * 0.004 + 0.05);
    return col;
  }

  float engineGlow(vec3 e, vec3 ln) {
    vec3 d = e - vLocal;
    float dd = dot(d, d);
    return max(dot(ln, d * inversesqrt(dd)), 0.0) / (1.0 + dd * 0.8);
  }

  void main() {
    float kind = vMat.x;
    float tint = vMat.y;
    float seed = vMat.z;

    if (kind > 4.5) {
      // Light strips, the chambers, the cores: light, not lit.
      vec3 e;
      if (kind < 5.5) e = mix(uLampColor, vec3(0.86, 0.93, 1.0), clamp(tint - 1.0, 0.0, 1.0)) * (0.7 + 2.6 * min(tint, 1.0) + 2.0 * max(tint - 1.0, 0.0));
      else if (kind < 6.5) e = uEngineColor * tint * tint * 2.3 * uPower;
      else e = mix(uEngineColor, vec3(1.0), 0.6) * 2.6 * uPower;
      gl_FragColor = vec4(e * uFade, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      return;
    }

    // Flat normals from the triangle itself, turned toward us (back faces are culled).
    vec3 V = normalize(cameraPosition - vPosW);
    vec3 dpx = dFdx(vPosW);
    vec3 dpy = dFdy(vPosW);
    vec3 nG = normalize(cross(dpx, dpy));
    float facing = dot(nG, V) < 0.0 ? -1.0 : 1.0;
    nG *= facing;
    vec3 ln = normalize(cross(dFdx(vLocal), dFdy(vLocal))) * facing;

    // The panel sheet, box-projected in ship space by the face's own axis, at two scales.
    vec3 an = abs(ln);
    vec2 uv = an.x > max(an.y, an.z) ? vLocal.zy : (an.y > an.z ? vLocal.xz : vLocal.xy);
    uv = uv * uDetailScale + vec2(seed * 7.31, seed * 3.17);
    vec4 s = texture2D(uPanel, uv);
    vec4 s2 = texture2D(uPanel, uv * 0.43 + vec2(0.37, 0.61));
    // The bump reads a mip down, so the seams stay crisp without sparkling where the sheet is minified.
    float height = texture2D(uPanel, uv, 1.0).r * 0.75 + s2.r * 0.25;

    // Bump from the sheet's height, through screen derivatives (no tangents).
    vec3 r1 = cross(dpy, nG);
    vec3 r2 = cross(nG, dpx);
    float det = dot(dpx, r1);
    vec3 grad = sign(det) * (dFdx(height) * r1 + dFdy(height) * r2);
    vec3 n = normalize(abs(det) * nG - grad * uBump * (kind > 0.5 && kind < 1.5 ? 0.5 : 1.0));

    float isPlate = 1.0 - step(0.5, kind);
    float isLight = step(0.5, kind) * (1.0 - step(1.5, kind));
    float isFrame = step(1.5, kind) * (1.0 - step(2.5, kind));
    float isMetal = step(2.5, kind) * (1.0 - step(3.5, kind));
    float isHeat = step(3.5, kind);
    vec3 base = vec3(0.038, 0.04, 0.046) * isPlate + vec3(0.105, 0.11, 0.12) * isLight + vec3(0.01, 0.011, 0.013) * isFrame
      + vec3(0.1, 0.104, 0.112) * isMetal + vec3(0.048, 0.048, 0.054) * isHeat;
    float metal = 0.55 * isPlate + 0.22 * isLight + 0.7 * isFrame + 0.88 * isMetal + 0.75 * isHeat;
    float rough = 0.44 * isPlate + 0.6 * isLight + 0.36 * isFrame + 0.42 * isMetal + 0.55 * isHeat;
    // Panels differ a little: the ship is built from parts, all of them new.
    float plateShade = 0.82 + 0.22 * s.g * (0.8 + 0.2 * s2.g);
    float alpha = 1.0;
    #ifdef DECAL
    vec4 mark = texture2D(uMarks, vUv);
    base = mark.rgb * tint * 0.6;
    metal = 0.05;
    rough = 0.55;
    plateShade = 1.0;
    alpha = mark.a;
    #else
    base *= tint;
    #endif
    base *= plateShade;
    rough = clamp(rough + 0.3 * (s.b - 0.5), 0.18, 0.9);
    // Seams and undersides are in shade.
    float ao = mix(0.45, 1.0, smoothstep(0.2, 0.5, height)) * mix(0.55, 1.0, smoothstep(-0.95, 0.15, ln.y));

    float NdV = max(dot(n, V), 1e-3);
    vec3 F0 = mix(vec3(0.04), base * 2.4 + 0.05, metal);
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
    vec3 col = (diffuse + spec) * uKeyColor * NdL * mix(0.6, 1.0, ao);

    // Reflections of the sky, Kethra and the sun.
    vec3 R = reflect(-V, n);
    vec3 Fe = F0 + (max(vec3(1.0 - rough), F0) - F0) * pow(1.0 - NdV, 5.0);
    col += environment(vPosW, R, rough) * Fe * ao;

    // Kethra's bounce from below.
    float bounce = max(dot(n, uBounceDir) * 0.8 + 0.2, 0.0);
    col += (diffuse + F0 * 0.25) * uBounceColor * bounce * ao;
    // A cool fill from our side, so the flank toward us reads, and a soft sheen on its metal.
    float NdF = max(dot(n, uFillDir), 0.0);
    vec3 Hf = normalize(uFillDir + V);
    col += (diffuse + F0 * pow(max(dot(n, Hf), 0.0), 24.0) * 1.4) * uFillColor * NdF * ao;
    // The sun's rim from behind, catching edges and chamfers.
    float rim = pow(1.0 - NdV, 3.0) * max(dot(n, uSunDir) + 0.25, 0.0);
    col += uSunColor * rim * (0.05 + 0.3 * metal + 0.15 * isLight) * ao;

    // The engines light the stern blue.
    float glow = engineGlow(uEngineA, ln) + engineGlow(uEngineB, ln) + engineGlow(uEngineC, ln) * 0.4;
    col += uEngineColor * glow * uPower * 0.6 * (diffuse * 2.0 + F0 * 0.5);

    // Lit ports from the panel sheet, on some of the dark plates.
    col += uLampColor * s.a * isPlate * step(0.6, fract(seed * 13.7)) * 1.4;

    // The black recess material with a tint below 1 is inside something: that much of the light reaches it.
    col *= mix(1.0, min(tint, 1.0), isFrame);

    gl_FragColor = vec4(col * uFade, alpha);
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
      float width = r * mix(1.0, 1.8, along);
      vec3 world = p0 + axis * along * uLength * r + side * aShape.y * width;
      gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
    } else {
      // The glow in the cell's mouth: a quad facing the camera.
      vec4 mv = viewMatrix * vec4(p0 + axis * r * 0.1, 1.0);
      mv.xy += aShape.xy * r * 2.2;
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
      // Clamped here, not trusted from the vertices: MSAA samples the varying past its ends, and pow() of
      // a negative is NaN, which High's bloom spread over the whole title.
      float along = clamp(vShape.x, 0.0, 1.0);
      float across = vShape.y;
      float core = exp(-across * across * 26.0);
      float sheath = exp(-across * across * 5.0) * smoothstep(1.0, 0.7, abs(across));
      float fall = pow(1.0 - along, 2.2) * smoothstep(0.0, 0.02, along);
      // Streaks flowing out of the nozzle.
      float flow = along * 16.0 - uTime * 7.0 + vSeed;
      float streak = 0.72 + 0.28 * n11(flow + across * 2.5) + 0.14 * n11(along * 41.0 - uTime * 17.0 + across * 6.0 + vSeed);
      float hot = exp(-along * 14.0) * smoothstep(0.0, 0.03, along);
      col = uColor * (sheath * 0.3 + core * 0.8) * fall * streak + vec3(0.4, 0.74, 1.0) * core * hot * 0.45;
    } else {
      float r = length(vShape);
      float k = exp(-r * r * 26.0) * 0.5 + exp(-r * 5.0) * 0.18;
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
    for (const [x, y] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
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
  /** `thrust` 0..1: the plumes' strength and length; at 0 the plumes are out and the chambers only glow. */
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
  const pace = () => o.pace?.() ?? Promise.resolve();
  const [panels, marks] = await Promise.all([bakePanels(renderer, o.pace), paintAtlas()]);
  // Uploaded now, while the menu waits, not on the ship's first frame in view.
  renderer.initTexture(marks);
  wingStencil[0] = wingStencil[1] = false;
  const built = await buildHull(mulberry32(0x5b1f7), pace);
  const { engines } = built;

  const engineColor = new THREE.Color(0.1, 0.38, 1.0);
  const power = { value: 1 };
  const plumePower = { value: 1 };
  const plumeLength = { value: PLUME_LENGTH };
  const fade = { value: 0 };
  const uniforms = {
    uPanel: { value: panels.texture },
    uMarks: { value: marks },
    uKeyDir: { value: o.keyDir },
    uKeyColor: { value: new THREE.Color(1.0, 0.9, 0.78).multiplyScalar(2.8) },
    uFillDir: { value: o.fillDir },
    uFillColor: { value: new THREE.Color(0.36, 0.5, 0.7) },
    uSunDir: { value: o.sunDir },
    uSunColor: { value: new THREE.Color(1.0, 0.86, 0.7).multiplyScalar(2.2) },
    uBounceDir: { value: o.bounceDir },
    uBounceColor: { value: new THREE.Color(0.24, 0.46, 0.5) },
    uPlanetCenter: { value: o.planetCenter },
    uPlanetRadius: { value: o.planetRadius },
    uPlanetLight: { value: o.planetLight },
    // The three nests, a little aft of their mouths.
    uEngineA: { value: v(-5.5, 0.38, -1.92) },
    uEngineB: { value: v(-5.5, 0.38, 1.92) },
    uEngineC: { value: v(-5.6, -0.95, 0) },
    uEngineColor: { value: engineColor },
    uLampColor: { value: new THREE.Color(0.3, 0.72, 1.0) },
    uPower: power,
    uBump: { value: 0.013 },
    uDetailScale: { value: 0.42 },
    uFade: fade,
  };
  const hullMaterial = new THREE.ShaderMaterial({ vertexShader: HULL_VERTEX, fragmentShader: HULL_FRAGMENT, uniforms });
  const hull = new THREE.Mesh(built.hull, hullMaterial);
  hull.name = 'title-ship-hull';
  // It flies in from behind the camera: keep it drawn while it is out of frame, so its first frame in
  // view is not its first draw.
  hull.frustumCulled = false;

  const decalMaterial = new THREE.ShaderMaterial({
    vertexShader: HULL_VERTEX,
    fragmentShader: HULL_FRAGMENT,
    uniforms,
    defines: { DECAL: 1 },
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const decals = new THREE.Mesh(built.decals, decalMaterial);
  decals.name = 'title-ship-markings';
  decals.frustumCulled = false;
  decals.renderOrder = 1;

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
  drift.add(hull, decals, plumes);
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
      marks.dispose();
      built.hull.dispose();
      built.decals.dispose();
      hullMaterial.dispose();
      decalMaterial.dispose();
      plumes.geometry.dispose();
      plumes.material.dispose();
    },
  };
}
