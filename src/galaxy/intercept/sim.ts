/**
 * The Intercept mini-game's model, with no rendering in it: the Kessic system
 * in plot units (1 unit = 1 Mkm, the sun at the origin, the ecliptic is y = 0), the transfer to
 * Kethra, and the numbers the chart shows. Self-contained on purpose, so
 * tools/test-intercept-sim.mjs can load it straight into Node and prove the game has exactly one
 * answer.
 *
 * The navigation is d = v·t made visible: the Wren cruises at SPEED, one tick per day. Kethra moves
 * along an inclined orbit while the Wren flies, so the only place to meet it is the point Kethra
 * reaches on the same day the Wren does.
 */

export interface Vec {
  x: number;
  y: number;
  z: number;
}

/** Cruise speed, Mkm per day (the same figure the galaxy map uses, src/content/tuning.ts NAV). */
export const SPEED = 8;
/** A reserve cell buys this many days of drive. */
export const DAYS_PER_CELL = 2;
/** How close counts as meeting Kethra. */
export const CAPTURE = 3;
/** The Wren's position when the minigame starts. */
export const WREN_START: Vec = { x: 12, y: 0, z: 0 };

export const v = (x: number, y: number, z: number): Vec => ({ x, y, z });
export const add = (a: Vec, b: Vec): Vec => v(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a: Vec, b: Vec): Vec => v(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (a: Vec, k: number): Vec => v(a.x * k, a.y * k, a.z * k);
export const len = (a: Vec): number => Math.hypot(a.x, a.y, a.z);
export const dist = (a: Vec, b: Vec): number => len(sub(a, b));
export const norm = (a: Vec): Vec => scale(a, 1 / (len(a) || 1));
export const lerp = (a: Vec, b: Vec, k: number): Vec => add(a, scale(sub(b, a), k));

/** A unit direction from azimuth (around y, from +x toward +z) and elevation (above the ecliptic). */
export function direction(azimuth: number, elevation: number): Vec {
  const c = Math.cos(elevation);
  return v(c * Math.cos(azimuth), Math.sin(elevation), c * Math.sin(azimuth));
}

/** A circular orbit about the sun, tilted `inclination` about the line of nodes at angle `node`. */
export interface Orbit {
  radius: number;
  inclination: number;
  node: number;
  /** Angle along the orbit (from the ascending node) on day 0. */
  phase: number;
  /** Radians per day. */
  rate: number;
}

export function orbitAt(o: Orbit, day: number): Vec {
  const u = o.phase + o.rate * day;
  // In the orbit's own plane, then tilted about the node line.
  const px = o.radius * Math.cos(u);
  const pz = o.radius * Math.sin(u);
  const ci = Math.cos(o.inclination);
  const si = Math.sin(o.inclination);
  const lx = px;
  const ly = pz * si;
  const lz = pz * ci;
  const cn = Math.cos(o.node);
  const sn = Math.sin(o.node);
  return v(lx * cn - lz * sn, ly, lx * sn + lz * cn);
}

/** Kethra: the first orbit past the belt, inclined, so the course climbs as it goes. */
export const KETHRA: Orbit = { radius: 60, inclination: (14 * Math.PI) / 180, node: 0.812, phase: -0.282, rate: 0.072 };

/** A belt clump. The belt is scenery now: the transfer passes over the dust the first scan found. */
export interface Clump {
  c: Vec;
  r: number;
}

export const BELT_RADIUS = 42.5;
export function beltWall(): Clump[] {
  const out: Clump[] = [];
  const n = 60;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push({ c: v(BELT_RADIUS * Math.cos(a), 0, BELT_RADIUS * Math.sin(a)), r: 4.5 });
  }
  return out;
}

/** ORION's buoy, one cell out of the Wren's own debris. */
export const BUOY: Vec = add(WREN_START, scale(direction((20 * Math.PI) / 180, 0), 16));

/** ORION's housekeeping hop out of the drift to the buoy: one cell, two days, before the transfer. */
export const HOP_DAYS = DAYS_PER_CELL;
export const HOP_CELLS = 1;

/** Where the Wren is `day` days into the hop. */
export function hopAt(day: number): Vec {
  return lerp(WREN_START, BUOY, Math.min(1, Math.max(0, day / HOP_DAYS)));
}

/** The transfer starts at the buoy when the hop ends. Days on the chart count from here. */
export const TRANSFER_START = BUOY;

/** Kethra `day` days into the transfer (day 0 is where it is when the choice is made). */
export function kethraAt(day: number): Vec {
  return orbitAt(KETHRA, HOP_DAYS + day);
}

/** The meeting days the chart offers: 0 (Kethra now) through this. */
export const MAX_MEET_DAY = 10;
/** How far apart the two arrival times may be and still count as meeting. */
export const MATCH_TOLERANCE = 0.4;

/** One candidate meeting point: where Kethra is on `day`, and how long the Wren takes to get there. */
export interface Meeting {
  day: number;
  at: Vec;
  /** From the buoy, in Mkm. */
  distance: number;
  /** distance / SPEED: the Wren's flight time to this point. */
  wrenDays: number;
}

export function meeting(day: number): Meeting {
  const at = kethraAt(day);
  const distance = dist(at, TRANSFER_START);
  return { day, at, distance, wrenDays: distance / SPEED };
}

/** Every point the chart offers, day 0 through MAX_MEET_DAY. */
export function meetings(): Meeting[] {
  return Array.from({ length: MAX_MEET_DAY + 1 }, (_, day) => meeting(day));
}

/** Whether the Wren and Kethra reach this point on the same day. */
export function matches(m: Meeting): boolean {
  return Math.abs(m.wrenDays - m.day) < MATCH_TOLERANCE;
}

/**
 * For a burn from `from` on `fromDay` (days since the hop began), the direction that meets Kethra
 * and the day it does: the first day d where Kethra is exactly SPEED·(d − fromDay) away. The chart's
 * matching tick is within a few hundredths of a day of this; the committed course uses it exactly.
 */
export function leadTo(from: Vec, fromDay: number): { dir: Vec; day: number } {
  let lo = fromDay;
  let hi = fromDay + 40;
  const f = (d: number) => dist(orbitAt(KETHRA, d), from) - SPEED * (d - fromDay);
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid;
    else hi = mid;
  }
  const day = (lo + hi) / 2;
  return { dir: norm(sub(orbitAt(KETHRA, day), from)), day };
}

/** The intercept: the transfer's exact direction and flight time, in transfer days. */
export function intercept(): { dir: Vec; days: number; at: Vec } {
  const lead = leadTo(TRANSFER_START, HOP_DAYS);
  const days = lead.day - HOP_DAYS;
  return { dir: lead.dir, days, at: add(TRANSFER_START, scale(lead.dir, SPEED * days)) };
}

/** Where the Wren is `day` transfer-days along a straight course from the buoy. */
export function transferAt(dir: Vec, day: number): Vec {
  return add(TRANSFER_START, scale(dir, SPEED * day));
}

/** Cells the whole plot spends: the hop, plus the transfer rounded up to whole cells. */
export function cellsFor(transferDays: number): number {
  return HOP_CELLS + Math.ceil(transferDays / DAYS_PER_CELL - 1e-6);
}

/**
 * Flies a straight course from the buoy toward `toward` for `days`, in small steps: 'arrive' at the
 * first moment within CAPTURE of Kethra, otherwise the closest approach, as a miss.
 */
export function fly(toward: Vec, days: number): { kind: 'arrive' | 'miss'; day: number; distance: number } {
  const dir = norm(sub(toward, TRANSFER_START));
  let best = { day: 0, distance: Infinity };
  for (let day = 0; day <= days + 1e-9; day += 1 / 96) {
    const d = dist(transferAt(dir, day), kethraAt(day));
    if (d < CAPTURE) return { kind: 'arrive', day, distance: d };
    if (d < best.distance) best = { day, distance: d };
  }
  return { kind: 'miss', ...best };
}
