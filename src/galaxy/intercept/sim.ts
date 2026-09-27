/**
 * MG1 Intercept's model (docs/DESIGN.md §4, slot 1), with no rendering in it: the Kessic system
 * in plot units (1 unit = 1 Mkm, the sun at the origin, the ecliptic is y = 0), the three legs,
 * and the simulation that runs a plotted course. Self-contained on purpose, so
 * tools/test-intercept-sim.mjs can load it straight into Node and prove every leg is solvable.
 *
 * The navigation is d = v·t made visible: the Wren cruises at SPEED along each burn's line, one
 * tick per day, and a reserve cell buys DAYS_PER_CELL days of drive. Kethra moves along an
 * inclined orbit, so the answer is where Kethra *will be* on the day the Wren arrives.
 */

export interface Vec {
  x: number;
  y: number;
  z: number;
}

/** Cruise speed, Mkm per day (the same figure the galaxy map uses, src/content/tuning.ts NAV). */
export const SPEED = 8;
export const DAYS_PER_CELL = 2;
/** How close counts as meeting the buoy or Kethra. */
export const CAPTURE = 3;
/** The Wren's parking orbit after the white sky, and where it sits on it. */
export const WREN_START: Vec = { x: 12, y: 0, z: 0 };

export const v = (x: number, y: number, z: number): Vec => ({ x, y, z });
export const add = (a: Vec, b: Vec): Vec => v(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a: Vec, b: Vec): Vec => v(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (a: Vec, k: number): Vec => v(a.x * k, a.y * k, a.z * k);
export const len = (a: Vec): number => Math.hypot(a.x, a.y, a.z);
export const dist = (a: Vec, b: Vec): number => len(sub(a, b));
export const norm = (a: Vec): Vec => scale(a, 1 / (len(a) || 1));

/** A unit direction from azimuth (around y, from +x toward +z) and elevation (above the ecliptic). */
export function direction(azimuth: number, elevation: number): Vec {
  const c = Math.cos(elevation);
  return v(c * Math.cos(azimuth), Math.sin(elevation), c * Math.sin(azimuth));
}

export function anglesOf(dir: Vec): { azimuth: number; elevation: number } {
  const d = norm(dir);
  return { azimuth: Math.atan2(d.z, d.x), elevation: Math.asin(Math.max(-1, Math.min(1, d.y))) };
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

/** Kethra: the first orbit past the belt, inclined enough that height is part of every answer. */
export const KETHRA: Orbit = { radius: 60, inclination: (14 * Math.PI) / 180, node: 0.812, phase: -0.282, rate: 0.072 };

/** A belt clump: the sim tests the Wren's path against these spheres. */
export interface Clump {
  c: Vec;
  r: number;
}

/**
 * The belt, as the sim sees it: a ring of overlapping clumps, a thin wall standing across the whole
 * plane between the inner system and Kethra. It reads as a wall only side-on. Over it and under it
 * are open, which is why leg 3 has no answer in the plane.
 */
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

export interface Burn {
  dir: Vec;
  cells: number;
}

export type Target = { kind: 'buoy'; at: Vec } | { kind: 'kethra' };

export interface Leg {
  id: 1 | 2 | 3;
  start: Vec;
  startDay: number;
  target: Target;
  burns: number;
  /** Cells available across the leg's burns (engineering 2 adds one). */
  budget: number;
  belt: boolean;
}

export const BUOY: Vec = add(WREN_START, scale(direction((20 * Math.PI) / 180, 0), 16));

export function legs(engineering: number): Leg[] {
  const budget = 4 + (engineering >= 2 ? 1 : 0);
  return [
    { id: 1, start: WREN_START, startDay: 0, target: { kind: 'buoy', at: BUOY }, burns: 1, budget, belt: false },
    { id: 2, start: BUOY, startDay: 2, target: { kind: 'kethra' }, burns: 1, budget, belt: false },
    { id: 3, start: BUOY, startDay: 2, target: { kind: 'kethra' }, burns: 2, budget, belt: true },
  ];
}

export function targetAt(target: Target, day: number): Vec {
  return target.kind === 'buoy' ? target.at : orbitAt(KETHRA, day);
}

export type Outcome =
  | { kind: 'arrive'; day: number; at: Vec }
  | { kind: 'contact'; day: number; at: Vec; clump: Clump }
  | { kind: 'miss'; day: number; at: Vec; targetAt: Vec; distance: number };

/** Where the Wren is on `day` along a plotted course, and whether the burns have run out by then. */
export function wrenAt(leg: Leg, burns: Burn[], day: number): { at: Vec; done: boolean } {
  let p = leg.start;
  let t = leg.startDay;
  for (const b of burns) {
    const span = b.cells * DAYS_PER_CELL;
    if (day <= t + span) return { at: add(p, scale(b.dir, SPEED * (day - t))), done: false };
    p = add(p, scale(b.dir, SPEED * span));
    t += span;
  }
  return { at: p, done: true };
}

export function endDay(leg: Leg, burns: Burn[]): number {
  return leg.startDay + burns.reduce((s, b) => s + b.cells * DAYS_PER_CELL, 0);
}

/**
 * Runs the course in small steps: the first clump touched, the first moment within CAPTURE of the
 * target, or (when the burns run out) the closest approach, reported as a miss.
 */
export function simulate(leg: Leg, burns: Burn[], clumps: Clump[]): Outcome {
  const end = endDay(leg, burns);
  const step = 1 / 96;
  let best = { day: leg.startDay, distance: Infinity, at: leg.start, targetAt: targetAt(leg.target, leg.startDay) };
  for (let day = leg.startDay; day <= end + 1e-9; day += step) {
    const { at } = wrenAt(leg, burns, day);
    if (leg.belt) {
      for (const clump of clumps) if (dist(at, clump.c) < clump.r) return { kind: 'contact', day, at, clump };
    }
    const tp = targetAt(leg.target, day);
    const d = dist(at, tp);
    if (d < CAPTURE) return { kind: 'arrive', day, at };
    if (d < best.distance) best = { day, distance: d, at, targetAt: tp };
  }
  return { kind: 'miss', day: best.day, at: best.at, targetAt: best.targetAt, distance: best.distance };
}

/**
 * For a burn from `from` on `fromDay`, the direction that meets Kethra and the day it does: the
 * first day d where Kethra is exactly SPEED·(d − fromDay) away. Used for the reference solutions
 * (the debug harness's win, the tests) and for ORION's hints; the player never sees it.
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

/** The fewest cells for the last burn that still arrive, keeping the earlier burns as they are. */
function fewestCells(leg: Leg, burns: Burn[]): Burn[] {
  const last = burns[burns.length - 1];
  const spent = burns.slice(0, -1).reduce((n, b) => n + b.cells, 0);
  for (let cells = 1; cells <= leg.budget - spent; cells++) {
    const plan = [...burns.slice(0, -1), { dir: last.dir, cells }];
    if (simulate(leg, plan, beltWall()).kind === 'arrive') return plan;
  }
  return burns;
}

/** A reference course for each leg. */
export function solution(leg: Leg): Burn[] {
  if (leg.target.kind === 'buoy') return fewestCells(leg, [{ dir: norm(sub(leg.target.at, leg.start)), cells: 1 }]);
  if (leg.burns === 1) return fewestCells(leg, [{ dir: leadTo(leg.start, leg.startDay).dir, cells: leg.budget }]);
  // Over the wall: a one-cell hop up and toward Kethra, then the lead from the top of the hop.
  const toward = anglesOf(sub(orbitAt(KETHRA, leg.startDay + 7), leg.start));
  const hop: Burn = { dir: direction(toward.azimuth, HOP_ELEVATION), cells: 1 };
  const top = add(leg.start, scale(hop.dir, SPEED * DAYS_PER_CELL));
  return fewestCells(leg, [hop, { dir: leadTo(top, leg.startDay + DAYS_PER_CELL).dir, cells: leg.budget - 1 }]);
}

/** The reference hop's climb over the wall, in radians. */
export const HOP_ELEVATION = (40 * Math.PI) / 180;
