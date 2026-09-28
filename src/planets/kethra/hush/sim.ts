/**
 * MG3 Hush's chamber and rules (docs/DESIGN.md §4, slot 3), with no rendering in it: the Cistern
 * Heart's chamber as oriented blocks (the wall ring, root tunnels, the basin rim, root mounds), the
 * moth's perches, its gaze, and the moth itself as a state machine. Line of sight is a segment
 * against the same blocks the scene renders and the player collides with, so cover is real.
 * Self-contained, so tools/test-hush-sim.mjs can load it into Node.
 *
 * Kethra's coordinates: y up, the plaza to the north at +z. The chamber's door opens north onto
 * the approach ramp; the Heart is at its centre; the call-stone stands against the basin rim on the
 * far (south) side. The moth watches from a low arch on the far wall, then from high on the gate
 * arch over the door.
 */

export interface Vec {
  x: number;
  y: number;
  z: number;
}

/**
 * A block of cover: a box of half-extents hx (radial for ring pieces) by hz, standing from y0 to
 * y1, turned by `yaw` about +y the way three.js turns an object (rotation.y), so the scene can
 * render it with the same numbers.
 */
export interface Block {
  x: number;
  z: number;
  hx: number;
  hz: number;
  y0: number;
  y1: number;
  yaw: number;
  kind: 'wall' | 'tunnel' | 'roof' | 'rim' | 'mound' | 'basin' | 'core' | 'vane' | 'stone';
}

const v = (x: number, y: number, z: number): Vec => ({ x, y, z });

export const FLOOR_Y = 1.48;
export const CENTER = { x: 0, z: -21.8 };
export const HEART: Vec = v(CENTER.x, FLOOR_Y, CENTER.z);
/** The floor's radius; the wall ring stands just outside it. The door is at CENTER.z + RADIUS. */
export const RADIUS = 12.5;
export const WALL_HEIGHT = 8;
/** Half the door's width, in radians of the ring: 3.3 m, the approach ramp's width. */
export const DOOR_HALF_ANGLE = 0.27;
export const RIM_RADIUS = 5.4;
export const RIM_HEIGHT = 1.5;
/** Rotates the Heart so its three vanes stand north, south-east and south-west, clear of the stone. */
export const HEART_YAW = Math.PI / 3;
/** The call-stone, against the outside of the rim on the far side of the basin. */
export const STONE: Vec = v(0, FLOOR_Y, CENTER.z - RIM_RADIUS - 0.95);
/** Where the singer stands: south of the stone, facing north over it and the rim to the Heart. */
export const SINGER: Vec = v(0, FLOOR_Y, STONE.z - 1.25);
/** A breath lights the stone's face before it runs through the floor to the Heart. */
export const BREATH_AT: Vec = v(STONE.x, FLOOR_Y + 1.3, STONE.z);
export const TUNNEL_X = 9.2;
export const TUNNEL_Z = [-15, -23.8] as const;
/** The tunnels' roof: above the player's head (1.8), so it is walked under, not crouched through. */
export const ROOF = [FLOOR_Y + 1.95, FLOOR_Y + 2.4] as const;
/** Under a crouched eye (1.1) and over a crouched lantern (0.65): low cover you can see over. */
export const MOUND_HEIGHT = 0.82;

/** The ring's angle (x = cos, z = sin, about CENTER) of the door: north, toward the plaza. */
const DOOR_ANGLE = Math.PI / 2;
const angleGap = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

/** A piece of a ring at angle `a`: hx across the ring, hz along it. */
function ringPiece(r: number, a: number, halfLen: number, halfThick: number, y0: number, y1: number, kind: Block['kind']): Block {
  return { x: CENTER.x + Math.cos(a) * r, z: CENTER.z + Math.sin(a) * r, hx: halfThick, hz: halfLen, y0, y1, yaw: -a, kind };
}

/** Every blocker in the chamber: what the player collides with and what the moth cannot see through. */
export function chamberBlocks(): Block[] {
  const out: Block[] = [];
  // The wall ring: root-bound Kindling masonry, open at the door.
  const wallSegs = 36;
  for (let i = 0; i < wallSegs; i++) {
    const a = ((i + 0.5) / wallSegs) * Math.PI * 2;
    if (angleGap(a, DOOR_ANGLE) < DOOR_HALF_ANGLE) continue;
    out.push(ringPiece(RADIUS + 0.7, a, (Math.PI * (RADIUS + 0.7)) / wallSegs + 0.05, 0.7, FLOOR_Y, FLOOR_Y + WALL_HEIGHT, 'wall'));
  }
  // The root tunnels, west and east, hugging the ring: roofed, so nothing above sees in.
  for (const side of [-1, 1]) {
    const x = side * TUNNEL_X;
    const zc = (TUNNEL_Z[0] + TUNNEL_Z[1]) / 2;
    const hz = (TUNNEL_Z[0] - TUNNEL_Z[1]) / 2;
    out.push({ x, z: zc, hx: 1.35, hz, y0: ROOF[0], y1: ROOF[1], yaw: 0, kind: 'roof' });
    // Inner wall (toward the Heart) and outer wall, which runs out to meet the ring.
    out.push({ x: x - side * 1.15, z: zc, hx: 0.18, hz, y0: FLOOR_Y, y1: ROOF[0], yaw: 0, kind: 'tunnel' });
    out.push({ x: x + side * 2.0, z: zc, hx: 0.85, hz, y0: FLOOR_Y, y1: ROOF[1], yaw: 0, kind: 'tunnel' });
  }
  // The basin rim: a Kindling ring about the Heart, open north (toward the door), east and west.
  const rimSegs = 20;
  for (let i = 0; i < rimSegs; i++) {
    if (i === 0 || i === 5 || i === 10) continue;
    const a = (i / rimSegs) * Math.PI * 2;
    out.push(ringPiece(RIM_RADIUS, a, (Math.PI * RIM_RADIUS) / rimSegs, 0.35, FLOOR_Y, FLOOR_Y + RIM_HEIGHT, 'rim'));
  }
  // The Heart: the basin's lip, the hanging core, and the three vanes.
  out.push({ x: HEART.x, z: HEART.z, hx: 2.3, hz: 2.3, y0: FLOOR_Y, y1: FLOOR_Y + 0.55, yaw: 0, kind: 'basin' });
  out.push({ x: HEART.x, z: HEART.z, hx: 0.66, hz: 0.66, y0: FLOOR_Y + 1.1, y1: FLOOR_Y + 2.55, yaw: 0, kind: 'core' });
  for (const vane of VANES) out.push({ x: vane.x, z: vane.z, hx: 0.34, hz: 0.14, y0: FLOOR_Y, y1: FLOOR_Y + 3.1, yaw: vane.yaw, kind: 'vane' });
  // The call-stone.
  out.push({ x: STONE.x, z: STONE.z, hx: 0.55, hz: 0.4, y0: FLOOR_Y, y1: FLOOR_Y + 1.1, yaw: 0, kind: 'stone' });
  // Low root mounds: cover from the arch, not from the ledge.
  for (const [x, z, yaw] of MOUNDS) out.push({ x, z, hx: 1.15, hz: 0.6, y0: FLOOR_Y, y1: FLOOR_Y + MOUND_HEIGHT, yaw, kind: 'mound' });
  return out;
}

/** The Heart's vanes, where buildCisternHeart puts them, turned by HEART_YAW: south-east, south-west, north. */
export const VANES = [0, 1, 2].map((i) => {
  const a = Math.PI + (i - 1) * ((Math.PI * 2) / 3);
  const lx = Math.sin(a) * 2.75;
  const lz = Math.cos(a) * 2.75;
  const c = Math.cos(HEART_YAW);
  const s = Math.sin(HEART_YAW);
  return { x: HEART.x + lx * c + lz * s, z: HEART.z - lx * s + lz * c, yaw: a + Math.PI + HEART_YAW };
});

/** [x, z, yaw]: two on the open floor, three across the south, where the ledge looks down on them. */
export const MOUNDS: [number, number, number][] = [
  [3.4, -14.4, 0.3],
  [-4.2, -15.0, -0.4],
  [6.6, -26.9, 0.9],
  [-6.4, -27.2, -0.8],
  [3.6, -30.2, 0.2],
];

/**
 * Lantern posts: `at` is where a gust sets you down, and reaching it lights the post; `lamp` is
 * where the post itself stands, beside it. The last one you reached is where you go back to.
 */
export const POSTS: { id: 'door' | 'west' | 'east' | 'stone'; at: Vec; lamp: Vec }[] = [
  { id: 'door', at: v(0, FLOOR_Y, CENTER.z + RADIUS - 1.8), lamp: v(1.3, FLOOR_Y, CENTER.z + RADIUS - 1.5) },
  { id: 'west', at: v(-TUNNEL_X, FLOOR_Y, TUNNEL_Z[0] - 0.9), lamp: v(-TUNNEL_X - 0.85, FLOOR_Y, TUNNEL_Z[0] - 0.4) },
  { id: 'east', at: v(TUNNEL_X, FLOOR_Y, TUNNEL_Z[0] - 0.9), lamp: v(TUNNEL_X + 0.85, FLOOR_Y, TUNNEL_Z[0] - 0.4) },
  { id: 'stone', at: v(-1.1, FLOOR_Y, SINGER.z), lamp: v(-2.4, FLOOR_Y, SINGER.z - 0.6) },
];
/** A post counts as reached within this distance of its `at`. */
export const POST_REACH = 1.6;
/** The gate arch's opening: its pillars stand either side of the door. */
export const GATE = { halfWidth: Math.sin(DOOR_HALF_ANGLE) * (RADIUS + 0.7), z: CENTER.z + Math.cos(DOOR_HALF_ANGLE) * (RADIUS + 0.7) };

/** Glowcaps flare when you brush them. The first sits on the path in, for the lesson. */
export const GLOWCAPS: Vec[] = [v(1.6, FLOOR_Y, -13.4), v(5.6, FLOOR_Y, -15.9), v(-6.4, FLOOR_Y, -16.6), v(-1.6, FLOOR_Y, -14.6), v(-8.6, FLOOR_Y, -25.4), v(8.4, FLOOR_Y, -25.2)];
export const BRUSH_RADIUS = 0.75;

/**
 * Where the moth watches from. `yaw` is its resting facing in the sim's own convention (0 = +x,
 * π/2 = +z), `sweep` the half-arc its gaze swings through, once per `period` seconds.
 */
export interface Perch {
  id: 'arch' | 'ledge' | 'rim' | 'vane' | 'heart';
  at: Vec;
  yaw: number;
  pitch: number;
  sweep: number;
  period: number;
  range: number;
  halfAngle: number;
}

export const PERCHES: Record<Perch['id'], Perch> = {
  // Beats 1 and 2: low on the far wall, across the chamber from the door, sweeping the open floor.
  // Off the chamber's axis, so the Heart's vanes and core do not stand in its line to the door.
  arch: { id: 'arch', at: v(-5.2, FLOOR_Y + 5.4, -31.9), yaw: 1.32, pitch: -0.16, sweep: 0.62, period: 9, range: 24, halfAngle: 0.3 },
  // Beat 3: high on the gate arch over the door, looking south. From up there it sees over low
  // cover; the rim still hides you if you keep against it, and nothing sees under a tunnel roof.
  ledge: { id: 'ledge', at: v(0, FLOOR_Y + 14, CENTER.z + RADIUS - 1.1), yaw: -Math.PI / 2, pitch: -0.7, sweep: 0.62, period: 10, range: 26, halfAngle: 0.4 },
  // The Rite's second and third perches, a step closer to the stone each breath.
  vane: { id: 'vane', at: v(VANES[1].x, FLOOR_Y + 3.3, VANES[1].z), yaw: -1.2, pitch: -0.3, sweep: 1.0, period: 8, range: 12, halfAngle: 0.34 },
  rim: { id: 'rim', at: v(2.7, FLOOR_Y + RIM_HEIGHT + 0.4, CENTER.z - 4.68), yaw: -2.2, pitch: -0.15, sweep: 1.1, period: 7, range: 10, halfAngle: 0.34 },
  // The win: it settles on the Heart with its wings open.
  heart: { id: 'heart', at: v(HEART.x, FLOOR_Y + 2.9, HEART.z), yaw: -Math.PI / 2, pitch: -0.3, sweep: 0, period: 10, range: 0, halfAngle: 0 },
};
/** Where the moth sits for each breath of the Rite: on the gate arch, then closer, then closer. */
export const RITE_PERCHES: Perch['id'][] = ['ledge', 'vane', 'rim'];

export interface Gaze {
  origin: Vec;
  dir: Vec;
  range: number;
  halfAngle: number;
}

/** The gaze's resting direction at `time` on a perch: its facing sweeps the arc and back. */
export function sweepAt(perch: Perch, time: number): { yaw: number; pitch: number } {
  return { yaw: perch.yaw + Math.sin((time / perch.period) * Math.PI * 2) * perch.sweep, pitch: perch.pitch };
}

export function gazeFrom(perch: Perch, time: number): Gaze {
  const { yaw, pitch } = sweepAt(perch, time);
  return { origin: perch.at, dir: dirOf(yaw, pitch), range: perch.range, halfAngle: perch.halfAngle };
}

export function dirOf(yaw: number, pitch: number): Vec {
  const cp = Math.cos(pitch);
  return v(Math.cos(yaw) * cp, Math.sin(pitch), Math.sin(yaw) * cp);
}

/** Where segment a→b first enters a block, as a fraction of the way (Infinity if it misses). */
export function segmentBlockT(a: Vec, b: Vec, k: Block): number {
  const c = Math.cos(k.yaw);
  const s = Math.sin(k.yaw);
  const ax = (a.x - k.x) * c - (a.z - k.z) * s;
  const az = (a.x - k.x) * s + (a.z - k.z) * c;
  const bx = (b.x - k.x) * c - (b.z - k.z) * s;
  const bz = (b.x - k.x) * s + (b.z - k.z) * c;
  let t0 = 0;
  let t1 = 1;
  const slabs: [number, number, number, number][] = [
    [ax, bx, -k.hx, k.hx],
    [a.y, b.y, k.y0, k.y1],
    [az, bz, -k.hz, k.hz],
  ];
  for (const [p, q, lo, hi] of slabs) {
    const d = q - p;
    if (Math.abs(d) < 1e-9) {
      if (p < lo || p > hi) return Infinity;
      continue;
    }
    let near = (lo - p) / d;
    let far = (hi - p) / d;
    if (near > far) [near, far] = [far, near];
    t0 = Math.max(t0, near);
    t1 = Math.min(t1, far);
    if (t0 > t1) return Infinity;
  }
  return t0;
}

export function segmentHitsBlock(a: Vec, b: Vec, k: Block): boolean {
  return segmentBlockT(a, b, k) <= 1;
}

export function lineOfSight(a: Vec, b: Vec, blocks: Block[]): boolean {
  return !blocks.some((k) => segmentHitsBlock(a, b, k));
}

/** Whether a point on the floor plan lies inside a block's footprint (for placement checks). */
export function insideFootprint(p: { x: number; z: number }, k: Block, margin = 0): boolean {
  const c = Math.cos(k.yaw);
  const s = Math.sin(k.yaw);
  const lx = (p.x - k.x) * c - (p.z - k.z) * s;
  const lz = (p.x - k.x) * s + (p.z - k.z) * c;
  return Math.abs(lx) < k.hx + margin && Math.abs(lz) < k.hz + margin;
}

/**
 * Axis-aligned boxes for the player's collision, from a block. A turned block's own bounding box
 * would be far fatter than the block (a rim piece at 45° doubles), so long blocks are cut into
 * short pieces along their length first and each piece is boxed.
 */
export function blockToBoxes(k: Block): { min: Vec; max: Vec }[] {
  const long = Math.max(k.hx, k.hz);
  const short = Math.min(k.hx, k.hz);
  const n = Math.max(1, Math.ceil(long / Math.max(short, 0.3)));
  const alongX = k.hx >= k.hz;
  const c = Math.cos(k.yaw);
  const s = Math.sin(k.yaw);
  const out: { min: Vec; max: Vec }[] = [];
  for (let i = 0; i < n; i++) {
    const from = -long + (i / n) * 2 * long;
    const to = -long + ((i + 1) / n) * 2 * long;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const u of [from, to]) {
      for (const w of [-short, short]) {
        const lx = alongX ? u : w;
        const lz = alongX ? w : u;
        const x = k.x + lx * c + lz * s;
        const z = k.z - lx * s + lz * c;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
      }
    }
    out.push({ min: v(minX, k.y0, minZ), max: v(maxX, k.y1, maxZ) });
  }
  return out;
}

/** How loud a light is to the moth: an open lantern 1, a hooded one faint, a flare or a breath bright. */
export const LIGHT = { open: 1, hooded: 0.12, flare: 1.4, breath: 1.6 } as const;

/**
 * Does the gaze find a light of `strength` at `p`? Inside the cone, in range, bright enough for
 * the distance (a hooded lantern only gives you away within a metre), with nothing between.
 */
export function sees(g: Gaze, p: Vec, strength: number, blocks: Block[]): boolean {
  const dx = p.x - g.origin.x;
  const dy = p.y - g.origin.y;
  const dz = p.z - g.origin.z;
  const d = Math.hypot(dx, dy, dz);
  if (d > g.range || d < 1e-6) return false;
  if ((dx * g.dir.x + dy * g.dir.y + dz * g.dir.z) / d < Math.cos(g.halfAngle)) return false;
  if (strength / (1 + d / 5) < 0.1) return false;
  return lineOfSight(g.origin, p, blocks);
}

/** Where the lantern hangs for a player whose feet are at `feet`, crouched or standing. */
export function lanternAt(feet: Vec, crouching: boolean): Vec {
  return v(feet.x, feet.y + (crouching ? 0.65 : 1.25), feet.z);
}

// --- The moth ---------------------------------------------------------------------------------

export type MothMode = 'perched' | 'relocate' | 'notice' | 'glide' | 'fan' | 'search' | 'settle';

export interface Sense {
  /** The player's lantern and how bright it is (LIGHT.open or LIGHT.hooded). */
  lantern: Vec;
  strength: number;
  feet: Vec;
  /** Glowcap flares and Rite breaths this frame. A breath in the gaze startles it outright. */
  flares: { at: Vec; strength: number; breath?: boolean }[];
}

/** Alert gained per second per unit of light in the gaze; an open lantern fills it in about 0.9 s. */
export const ALERT_RATE = 1.15;
export const ALERT_DECAY = 0.6;
/** Its wing-beat of anticipation between deciding and lifting off. */
export const NOTICE_TIME = 0.55;
export const GLIDE_SPEED = 5.2;
export const RELOCATE_SPEED = 4.2;
/** It reaches you if you are this close (horizontally) when it arrives. */
export const REACH = 2.0;
export const FAN_TIME = 1.0;
export const SEARCH_TIME = 1.8;
/** How long a flare holds its attention, and how fast its gaze can turn. */
export const ATTENTION_TIME = 2.4;
export const TURN_RATE = 2.2;
const HOVER = 1.5;

const angleTo = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const step = (from: number, to: number, max: number) => from + Math.max(-max, Math.min(max, angleTo(from, to)));
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const flat = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * The Wickmoth. It watches from a perch with a sweeping gaze. Light in its gaze fills its alert;
 * full, it beats its wings once (notice) and glides at the light. If you are still there when it
 * arrives it fans its wings: a gust (the game carries you back to your last post). If you hooded
 * and moved, it searches, then goes home. A flare anywhere it can see turns its gaze for a moment.
 */
export class Moth {
  mode: MothMode = 'perched';
  perch: Perch;
  pos: Vec;
  yaw: number;
  pitch: number;
  alert = 0;
  /** Sweep time on the current perch. */
  clock = 0;
  target: Vec | null = null;
  modeTime = 0;
  attention: { at: Vec; left: number } | null = null;
  private from: Vec;
  private travel = 0;
  private blocks: Block[];

  constructor(perch: Perch, blocks: Block[]) {
    this.blocks = blocks;
    this.perch = perch;
    this.pos = { ...perch.at };
    this.from = { ...perch.at };
    const r = sweepAt(perch, 0);
    this.yaw = r.yaw;
    this.pitch = r.pitch;
  }

  gaze(): Gaze {
    return { origin: this.pos, dir: dirOf(this.yaw, this.pitch), range: this.perch.range, halfAngle: this.perch.halfAngle };
  }

  /** Sends it to a new perch (a readable flight). Ignored mid-chase: it goes home when done. */
  moveTo(perch: Perch): void {
    if (perch === this.perch && (this.mode === 'perched' || this.mode === 'relocate')) return;
    this.perch = perch;
    if (this.mode === 'perched' || this.mode === 'relocate') this.fly('relocate');
  }

  /** The win: it glides to the Heart and settles there. */
  settle(): void {
    this.perch = PERCHES.heart;
    this.fly('settle');
  }

  /** Startled where it sits: it fans its wings at once (the game sends the gust). */
  fan(): void {
    this.alert = 1;
    this.setMode('fan');
  }

  /** Back to its perch and calm, at once (a restart). */
  reset(perch: Perch): void {
    this.perch = perch;
    this.pos = { ...perch.at };
    this.mode = 'perched';
    this.alert = 0;
    this.attention = null;
    this.target = null;
    this.clock = 0;
  }

  private fly(mode: 'relocate' | 'settle'): void {
    this.mode = mode;
    this.modeTime = 0;
    this.from = { ...this.pos };
    this.travel = Math.max(0.6, dist(this.pos, this.perch.at) / RELOCATE_SPEED);
    this.alert = 0;
    this.attention = null;
  }

  private setMode(mode: MothMode): void {
    this.mode = mode;
    this.modeTime = 0;
  }

  private look(at: Vec, dt: number): void {
    const dx = at.x - this.pos.x;
    const dy = at.y - this.pos.y;
    const dz = at.z - this.pos.z;
    this.yaw = step(this.yaw, Math.atan2(dz, dx), TURN_RATE * dt);
    this.pitch = step(this.pitch, Math.atan2(dy, Math.hypot(dx, dz)), TURN_RATE * dt);
  }

  /** Advances the moth; returns 'gust' on the frame it fans its wings at you. */
  update(dt: number, s: Sense): 'gust' | null {
    this.modeTime += dt;
    if (this.attention) {
      this.attention.left -= dt;
      if (this.attention.left <= 0) this.attention = null;
    }
    const g = this.gaze();
    const lanternSeen = sees(g, s.lantern, s.strength, this.blocks);

    switch (this.mode) {
      case 'perched': {
        this.clock += dt;
        for (const f of s.flares) {
          if (f.breath && sees(g, f.at, f.strength, this.blocks)) {
            // Breathing in its gaze: it comes for the singer, no hesitation.
            this.alert = 1;
            this.target = { ...s.lantern };
            this.setMode('glide');
            return null;
          }
          if (!f.breath && dist(this.pos, f.at) <= this.perch.range && lineOfSight(this.pos, f.at, this.blocks)) {
            this.attention = { at: { ...f.at }, left: ATTENTION_TIME };
          }
        }
        if (this.attention) this.look(this.attention.at, dt);
        else {
          const r = sweepAt(this.perch, this.clock);
          this.yaw = step(this.yaw, r.yaw, TURN_RATE * dt);
          this.pitch = step(this.pitch, r.pitch, TURN_RATE * dt);
        }
        this.alert = lanternSeen ? Math.min(1, this.alert + dt * ALERT_RATE * s.strength) : Math.max(0, this.alert - dt * ALERT_DECAY);
        if (this.alert >= 1) {
          this.target = { ...s.lantern };
          this.setMode('notice');
        }
        return null;
      }
      case 'notice': {
        if (lanternSeen) this.target = { ...s.lantern };
        if (this.target) this.look(this.target, dt);
        if (this.modeTime >= NOTICE_TIME) this.setMode('glide');
        return null;
      }
      case 'glide': {
        if (!this.target) return null;
        if (lanternSeen && s.strength >= LIGHT.open) this.target = { ...s.lantern };
        const hover = { x: this.target.x, y: this.target.y + HOVER, z: this.target.z };
        const d = dist(this.pos, hover);
        const stepLen = GLIDE_SPEED * dt;
        this.look(this.target, dt);
        if (d <= stepLen) {
          this.pos = hover;
          if (flat(this.pos, s.feet) < REACH) {
            this.setMode('fan');
            return 'gust';
          }
          this.setMode('search');
          return null;
        }
        this.pos = { x: this.pos.x + ((hover.x - this.pos.x) / d) * stepLen, y: this.pos.y + ((hover.y - this.pos.y) / d) * stepLen, z: this.pos.z + ((hover.z - this.pos.z) / d) * stepLen };
        return null;
      }
      case 'search': {
        this.yaw += dt * 1.3;
        this.pitch = step(this.pitch, -0.5, TURN_RATE * dt);
        if (lanternSeen && s.strength >= LIGHT.open) {
          this.target = { ...s.lantern };
          this.setMode('glide');
        } else if (this.modeTime >= SEARCH_TIME) this.fly('relocate');
        return null;
      }
      case 'fan': {
        if (this.modeTime >= FAN_TIME) this.fly('relocate');
        return null;
      }
      case 'relocate':
      case 'settle': {
        const t = Math.min(1, this.modeTime / this.travel);
        const e = t * t * (3 - 2 * t);
        const lift = Math.sin(t * Math.PI) * Math.min(2.5, this.travel * 0.8);
        this.pos = {
          x: this.from.x + (this.perch.at.x - this.from.x) * e,
          y: this.from.y + (this.perch.at.y - this.from.y) * e + lift,
          z: this.from.z + (this.perch.at.z - this.from.z) * e,
        };
        const r = sweepAt(this.perch, 0);
        this.yaw = step(this.yaw, r.yaw, TURN_RATE * dt);
        this.pitch = step(this.pitch, r.pitch, TURN_RATE * dt);
        if (t >= 1 && this.mode === 'relocate') {
          this.mode = 'perched';
          this.modeTime = 0;
          this.clock = 0;
        }
        return null;
      }
    }
  }
}
