/**
 * The canopy descent's layout and collision, with no rendering: five layers of boughs above
 * Kethra's landing clearing, each open only through one gap, and the capsule test the skiff flies
 * against. Self-contained so tools/test-canopy-layout.mjs can load it into Node.
 *
 * Units are metres; y is up; the clearing is at y = 0 with the landing pad at the origin.
 */

export interface Vec {
  x: number;
  y: number;
  z: number;
}

const v = (x: number, y: number, z: number): Vec => ({ x, y, z });

/** A bough: a capsule from `a` to `b`. Swaying boughs turn about `a` (their root) around the
 * vertical. */
export interface Bough {
  a: Vec;
  b: Vec;
  r: number;
  layer: number;
  sway?: { amp: number; period: number; phase: number };
}

export type LayerKind = 'lantern' | 'pods' | 'sway' | 'moth' | 'drop';

export interface Layer {
  index: number;
  kind: LayerKind;
  y: number;
  gap: { x: number; z: number; r: number };
}

/** Top to bottom: a wide gap under a lantern, pods, swaying boughs, the Wickmoth, the drop. */
export const LAYERS: Layer[] = [
  { index: 0, kind: 'lantern', y: 150, gap: { x: 0, z: 0, r: 9 } },
  { index: 1, kind: 'pods', y: 118, gap: { x: 7, z: -5, r: 5.5 } },
  { index: 2, kind: 'sway', y: 88, gap: { x: -6, z: -3, r: 5.5 } },
  { index: 3, kind: 'moth', y: 58, gap: { x: 4, z: 6, r: 4.8 } },
  { index: 4, kind: 'drop', y: 28, gap: { x: 0, z: 0, r: 3.6 } },
];

export const START: Vec = v(0, 172, 0);
export const SKIFF_RADIUS = 0.9;
/** Touchdown: low enough over the pad, inside the clearing. */
export const LANDING = { y: 1.2, r: 3.2 };

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The boughs of every layer: radial limbs growing out from just beyond each gap's edge, and
 * crossing limbs further out, so each layer is a floor with one way through. On the sway layer the
 * limbs nearest the gap swing across it and back: the way is open only some of the time.
 */
export function buildBoughs(seed = 0xca40): Bough[] {
  const rand = mulberry32(seed);
  const out: Bough[] = [];
  for (const layer of LAYERS) {
    const { x: gx, z: gz, r: gr } = layer.gap;
    const spokes = 18;
    for (let i = 0; i < spokes; i++) {
      const ang = (i / spokes) * Math.PI * 2 + rand() * 0.15;
      const r = 0.8 + rand() * 0.6;
      const start = gr + r + 0.25 + rand() * 0.8;
      const len = 16 + rand() * 18;
      const dy = (rand() - 0.5) * 2.4;
      out.push({
        a: v(gx + Math.cos(ang) * start, layer.y + dy, gz + Math.sin(ang) * start),
        b: v(gx + Math.cos(ang) * (start + len), layer.y + dy + (rand() - 0.3) * 3, gz + Math.sin(ang) * (start + len)),
        r,
        layer: layer.index,
      });
    }
    // A ring of short limbs hugging the gap, so the gap is the only way through near it.
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2 + rand() * 0.3;
      const dist = gr + 3.2 + rand() * 1.5;
      const cx = gx + Math.cos(ang) * dist;
      const cz = gz + Math.sin(ang) * dist;
      const t = ang + Math.PI / 2;
      const half = 2.6 + rand() * 1.4;
      const y = layer.y + (rand() - 0.5) * 1.6;
      out.push({ a: v(cx - Math.cos(t) * half, y, cz - Math.sin(t) * half), b: v(cx + Math.cos(t) * half, y, cz + Math.sin(t) * half), r: 0.7 + rand() * 0.4, layer: layer.index });
    }
    // Crossing limbs further out: the floor between the spokes.
    for (let i = 0; i < 22; i++) {
      const ang = rand() * Math.PI * 2;
      const dist = gr + 6 + rand() * 20;
      const cx = gx + Math.cos(ang) * dist;
      const cz = gz + Math.sin(ang) * dist;
      const t = ang + Math.PI / 2 + (rand() - 0.5) * 0.6;
      const half = 6 + rand() * 7;
      const y = layer.y + (rand() - 0.5) * 3;
      out.push({ a: v(cx - Math.cos(t) * half, y, cz - Math.sin(t) * half), b: v(cx + Math.cos(t) * half, y + (rand() - 0.5) * 2, cz + Math.sin(t) * half), r: 0.7 + rand() * 0.8, layer: layer.index });
    }
    // The sway layer: two long limbs rooted out to the side swing through the gap and back, out of
    // step, so the way opens and closes.
    if (layer.kind === 'sway') {
      for (let i = 0; i < 2; i++) {
        const ang = i * Math.PI + 0.5;
        const root = v(gx + Math.cos(ang) * 15, layer.y + 2.2 + i * 0.8, gz + Math.sin(ang) * 15);
        const tip = v(gx - Math.cos(ang) * 3, root.y, gz - Math.sin(ang) * 3);
        out.push({ a: root, b: tip, r: 0.9, layer: layer.index, sway: { amp: 0.55, period: 4.6 + i * 1.3, phase: i * 1.9 } });
      }
    }
  }
  return out;
}

/**
 * Where a bough is at `time`: a swaying one turns about its root (`a`) around the vertical, so its
 * tip sweeps across the gap and back.
 */
export function boughAt(b: Bough, time: number): { a: Vec; b: Vec } {
  if (!b.sway) return { a: b.a, b: b.b };
  const ang = Math.sin((time / b.sway.period) * Math.PI * 2 + b.sway.phase) * b.sway.amp;
  const dx = b.b.x - b.a.x;
  const dz = b.b.z - b.a.z;
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return { a: b.a, b: v(b.a.x + dx * c - dz * s, b.b.y, b.a.z + dx * s + dz * c) };
}

function closestOnSegment(p: Vec, a: Vec, b: Vec): Vec {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const len2 = abx * abx + aby * aby + abz * abz || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / len2));
  return v(a.x + abx * t, a.y + aby * t, a.z + abz * t);
}

export interface Contact {
  bough: Bough;
  /** On the bough's surface, where the sparks go. */
  point: Vec;
  /** Out of the bough, toward the skiff. */
  normal: Vec;
  depth: number;
}

/** The deepest contact between a sphere at `p` and the boughs at `time`, if any. */
export function collide(p: Vec, radius: number, boughs: Bough[], time: number): Contact | null {
  let best: Contact | null = null;
  for (const b of boughs) {
    if (Math.abs(p.y - b.a.y) > 12 && Math.abs(p.y - b.b.y) > 12) continue;
    const seg = boughAt(b, time);
    const q = closestOnSegment(p, seg.a, seg.b);
    const dx = p.x - q.x;
    const dy = p.y - q.y;
    const dz = p.z - q.z;
    const d = Math.hypot(dx, dy, dz);
    const depth = b.r + radius - d;
    if (depth > 0 && (!best || depth > best.depth)) {
      const n = d > 1e-6 ? v(dx / d, dy / d, dz / d) : v(0, 1, 0);
      best = { bough: b, point: v(q.x + n.x * b.r, q.y + n.y * b.r, q.z + n.z * b.r), normal: n, depth };
    }
  }
  return best;
}

/** Pod positions, hanging under the limbs every few metres, with each pod's layer and bough index. */
export function podsFor(boughs: Bough[], seed = 0x90d5): { at: Vec; layer: number; bough: number }[] {
  const rand = mulberry32(seed);
  const out: { at: Vec; layer: number; bough: number }[] = [];
  boughs.forEach((b, i) => {
    const len = Math.hypot(b.b.x - b.a.x, b.b.y - b.a.y, b.b.z - b.a.z);
    for (let d = 2 + rand() * 3; d < len - 1; d += 4 + rand() * 4) {
      const t = d / len;
      out.push({ at: v(b.a.x + (b.b.x - b.a.x) * t, b.a.y + (b.b.y - b.a.y) * t - b.r - 0.45, b.a.z + (b.b.z - b.a.z) * t), layer: b.layer, bough: i });
    }
  });
  return out;
}

/** The layer the skiff is above or passing through at height y (the next one down to clear). */
export function layerBelow(y: number): Layer | null {
  for (const l of LAYERS) if (y > l.y - 3) return l;
  return null;
}

/** Where a climb back returns the skiff: above the gap of the last layer it had lit or passed. */
export function checkpointFor(layerIndex: number): Vec {
  if (layerIndex < 0) return START;
  const l = LAYERS[layerIndex];
  return v(l.gap.x, l.y + 12, l.gap.z);
}
