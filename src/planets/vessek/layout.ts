/**
 * Vessek Anchorage's floor plan, with no rendering: four rooms joined by short tubes, and ducts in
 * the gaps between them. The same numbers build the rooms, the player's collision and the route
 * checks in tools/test-vessek-layout.mjs.
 *
 * Coordinates: y up, floors at y = 0. Rooms sit on the ship kit's 4 m grid: a room spanning grid
 * lines x0..x1 has its inner wall faces 0.435 inside them. The docking collar is on the hall's
 * south wall.
 */

export interface Vec {
  x: number;
  y: number;
  z: number;
}
const v = (x: number, y: number, z: number): Vec => ({ x, y, z });

export type RoomId = 'hall' | 'school' | 'tanker' | 'junction';

export interface Room {
  id: RoomId;
  /** Grid lines (multiples of 4). */
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  ceiling: number;
}

/** A wall face sits this far inside its grid line (the kit's wall pieces). */
export const FACE = 0.435;

export const ROOMS: Record<RoomId, Room> = {
  // The Lantern Bay: Varro's desk and ledger, the bus gauge.
  hall: { id: 'hall', x0: -8, x1: 8, z0: -12, z1: 12, ceiling: 5 },
  // The school hold, west: Dace's lamp board, the chalkboard, the drawings.
  school: { id: 'school', x0: -24, x1: -12, z0: 0, z1: 12, ceiling: 5 },
  // The hydroponics tanker, north: grow tables and the scrubbers.
  tanker: { id: 'tanker', x0: -8, x1: 8, z0: -36, z1: -16, ceiling: 5 },
  // The aft junction, north-east: pumps, heaters and the regulator. Sealed; reached by ducts.
  junction: { id: 'junction', x0: 12, x1: 24, z0: -36, z1: -20, ceiling: 5 },
};

/** Inner faces of a room. */
export function faces(r: Room): { x0: number; x1: number; z0: number; z1: number } {
  return { x0: r.x0 + FACE, x1: r.x1 - FACE, z0: r.z0 + FACE, z1: r.z1 - FACE };
}

/**
 * A wall bay of a room (a 4 m kit piece): which wall, and the bay's centre along it. Doors and
 * vents replace a bay's wall piece; corner bays can't take either.
 */
export interface Bay {
  room: RoomId;
  wall: 'north' | 'south' | 'east' | 'west';
  at: number;
}

/** Short tubes between hulls: a corridor 2.4 m wide from one room's door bay to the other's. */
export interface Tube {
  id: 'hall-school' | 'hall-tanker' | 'tanker-junction';
  a: Bay;
  b: Bay;
  /** What closes it: the tanker hatch seals in the pulse (crank from inside); the junction keypad. */
  seal: 'none' | 'pulse' | 'keypad';
}

export const TUBES: Tube[] = [
  { id: 'hall-school', a: { room: 'hall', wall: 'west', at: 6 }, b: { room: 'school', wall: 'east', at: 6 }, seal: 'none' },
  { id: 'hall-tanker', a: { room: 'hall', wall: 'north', at: -2 }, b: { room: 'tanker', wall: 'south', at: -2 }, seal: 'pulse' },
  { id: 'tanker-junction', a: { room: 'tanker', wall: 'east', at: -30 }, b: { room: 'junction', wall: 'west', at: -30 }, seal: 'keypad' },
];
export const TUBE_WIDTH = 2.4;
export const TUBE_HEIGHT = 3;

// --- Ducts ------------------------------------------------------------------------------------

/** Inside a duct: wide enough for the player's body, too low to stand (1.8), high enough crouched. */
export const DUCT_WIDTH = 1.3;
export const DUCT_HEIGHT = 1.25;
export const DUCT_WALL = 0.12;
/** The upper runs' floor: a ladder climbs to it, and a vent drops from it. Two ducts' height up. */
export const UPPER = 2.5;

/** A straight run of duct along x or z, from one end's centre (on the floor) to the other's. */
export interface Run {
  from: Vec;
  to: Vec;
}

export interface Duct {
  id: 'dace' | 'hall' | 'short';
  runs: Run[];
  /**
   * Ladder shafts where a lower run ends and an upper run starts, at the same (x, z). The rungs are
   * on the shaft's wall in the upper run's direction, so you climb facing the way you go on.
   */
  ladders: { x: number; z: number }[];
  /** Where it opens into rooms: `drop` vents let you fall out and never climb back in. */
  mouths: { bay: Bay; y: number; drop: boolean }[];
  /** A squeeze through a bent grate; needs traversal 2. */
  squeeze?: boolean;
}

export const DUCTS: Duct[] = [
  // Dace's duct: from the school's north wall, up a ladder, along the gap west of the hall, and in
  // high through the tanker's west wall. The dock lights' lockout box is at its far bend.
  {
    id: 'dace',
    runs: [
      { from: v(-18, 0, 0.435), to: v(-18, 0, -4) },
      { from: v(-18, UPPER, -4), to: v(-18, UPPER, -26) },
      { from: v(-18, UPPER, -26), to: v(-7.565, UPPER, -26) },
    ],
    ladders: [{ x: -18, z: -4 }],
    mouths: [
      { bay: { room: 'school', wall: 'north', at: -18 }, y: 0, drop: false },
      { bay: { room: 'tanker', wall: 'west', at: -26 }, y: UPPER, drop: true },
    ],
  },
  // The hall duct: low through the hall's north wall into the gap, east, up a ladder, and in high
  // through the junction's south wall. The hall lamps' lockout box is at the ladder's top.
  {
    id: 'hall',
    runs: [
      { from: v(2, 0, -11.565), to: v(2, 0, -14) },
      { from: v(2, 0, -14), to: v(10, 0, -14) },
      { from: v(10, UPPER, -14), to: v(10, UPPER, -18) },
      { from: v(10, UPPER, -18), to: v(18, UPPER, -18) },
      { from: v(18, UPPER, -18), to: v(18, UPPER, -20.435) },
    ],
    ladders: [{ x: 10, z: -14 }],
    mouths: [
      { bay: { room: 'hall', wall: 'north', at: 2 }, y: 0, drop: false },
      { bay: { room: 'junction', wall: 'south', at: 18 }, y: UPPER, drop: true },
    ],
  },
  // The short duct, tanker to junction at floor level, through a bent grate.
  {
    id: 'short',
    runs: [{ from: v(7.565, 0, -26), to: v(12.435, 0, -26) }],
    ladders: [],
    mouths: [
      { bay: { room: 'tanker', wall: 'east', at: -26 }, y: 0, drop: false },
      { bay: { room: 'junction', wall: 'west', at: -26 }, y: 0, drop: false },
    ],
    squeeze: true,
  },
];

// --- The bus in the world ---------------------------------------------------------------------

export type LeverId = 'lamps' | 'dock' | 'fans' | 'school' | 'regulator' | 'pumps' | 'heaters' | 'scrubbers';

/** Where each circuit's lever stands: at the foot of its wall, facing (yaw) into the room. */
export const LEVERS: Record<LeverId, { at: Vec; room: RoomId; yaw: number }> = {
  // In the hall, beside the bus gauge on the north wall.
  lamps: { at: v(5.2, 0, -11.2), room: 'hall', yaw: 0 },
  dock: { at: v(6.4, 0, -11.2), room: 'hall', yaw: 0 },
  school: { at: v(-12.9, 0, 3.2), room: 'school', yaw: -Math.PI / 2 },
  fans: { at: v(-12.9, 0, 4.4), room: 'school', yaw: -Math.PI / 2 },
  regulator: { at: v(23.1, 0, -24), room: 'junction', yaw: -Math.PI / 2 },
  pumps: { at: v(23.1, 0, -27.5), room: 'junction', yaw: -Math.PI / 2 },
  heaters: { at: v(23.1, 0, -29), room: 'junction', yaw: -Math.PI / 2 },
  scrubbers: { at: v(-7.1, 0, -20), room: 'tanker', yaw: Math.PI / 2 },
};

/** The auto-reset lockout boxes, in the ducts: the dock's at Dace's far bend, the lamps' at the hall duct's ladder top. */
export const LOCKOUTS: { id: 'dock' | 'lamps'; at: Vec; duct: Duct['id'] }[] = [
  { id: 'dock', at: v(-18, UPPER, -25.5), duct: 'dace' },
  { id: 'lamps', at: v(10, UPPER, -15), duct: 'hall' },
];

/** The big analogue gauge on the hall's north wall. */
export const GAUGE: Vec = v(5.8, 2.6, -11.45);
/** The tanker hatch's manual crank, on the tanker side of its tube. */
export const CRANK: Vec = v(-3.4, 0, -16.9);
/** The junction keypad, on the tube's wall beside the door, on the tanker side. */
export const KEYPAD: Vec = v(11.7, 1.4, -31.1);

export const SPAWN: Vec = v(2, 0.2, 9.4);
export const PEOPLE = {
  varro: v(-2.6, 0, -2.3),
  dace: v(-17, 0, 6.5),
};

// --- The ducts' shell: floors, roofs and walls from the outline of their runs --------------------

export interface Box {
  min: Vec;
  max: Vec;
  kind: 'wall' | 'floor' | 'roof' | 'shaft';
}

const RES = 0.05;
const near = (a: number, b: number) => Math.abs(a - b) < 1e-3;

/**
 * Whether a point on the floor plan is on some room's inner face (a duct's mouth is open there),
 * within `tol`. The outline's edges sit on the raster, and the faces' 0.435 offsets never land on
 * it, so an edge across a mouth is up to a cell off its face: tested with tol = RES.
 */
function onRoomFace(x: number, z: number, tol = 1e-3): boolean {
  return Object.values(ROOMS).some((r) => {
    const f = faces(r);
    const inX = x >= f.x0 - tol && x <= f.x1 + tol;
    const inZ = z >= f.z0 - tol && z <= f.z1 + tol;
    const at = (a: number, b: number) => Math.abs(a - b) <= tol;
    return ((at(z, f.z0) || at(z, f.z1)) && inX) || ((at(x, f.x0) || at(x, f.x1)) && inZ);
  });
}

interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** A run's footprint: DUCT_WIDTH across, and half that past each end that isn't a mouth. */
function runRect(r: Run): Rect {
  const h = DUCT_WIDTH / 2;
  const ext = (p: Vec) => (onRoomFace(p.x, p.z) ? 0 : h);
  const alongX = Math.abs(r.to.x - r.from.x) > Math.abs(r.to.z - r.from.z);
  const [lo, hi] = alongX ? (r.from.x < r.to.x ? [r.from, r.to] : [r.to, r.from]) : r.from.z < r.to.z ? [r.from, r.to] : [r.to, r.from];
  return alongX
    ? { x0: lo.x - ext(lo), x1: hi.x + ext(hi), z0: r.from.z - h, z1: r.from.z + h }
    : { x0: r.from.x - h, x1: r.from.x + h, z0: lo.z - ext(lo), z1: hi.z + ext(hi) };
}

/** Merges a boolean raster into non-overlapping rectangles (greedy: widest run, then as deep as it stays). */
function rectsOf(grid: Uint8Array, nx: number, nz: number, ox: number, oz: number): Rect[] {
  const used = new Uint8Array(grid.length);
  const out: Rect[] = [];
  for (let k = 0; k < nz; k++) {
    for (let i = 0; i < nx; i++) {
      if (!grid[k * nx + i] || used[k * nx + i]) continue;
      let w = 1;
      while (i + w < nx && grid[k * nx + i + w] && !used[k * nx + i + w]) w++;
      let d = 1;
      grow: while (k + d < nz) {
        for (let a = 0; a < w; a++) if (!grid[(k + d) * nx + i + a] || used[(k + d) * nx + i + a]) break grow;
        d++;
      }
      for (let b = 0; b < d; b++) for (let a = 0; a < w; a++) used[(k + b) * nx + i + a] = 1;
      out.push({ x0: ox + i * RES, x1: ox + (i + w) * RES, z0: oz + k * RES, z1: oz + (k + d) * RES });
    }
  }
  return out;
}

/**
 * Every duct's shell as boxes. Per level (the floor and the upper runs), the runs' footprints are
 * rasterised; walls go round the outline, except across a mouth into a room; floors and roofs fill
 * it, open over each ladder shaft (the lower roof and the upper floor). The shafts are walled
 * between the levels. Rasterising, rather than boxing each run, keeps a run's inner wall from
 * blocking the next run at corners and tees.
 */
export function ductShell(): Box[] {
  const out: Box[] = [];
  const t = DUCT_WALL;
  const h = DUCT_WIDTH / 2;
  const shafts: Rect[] = DUCTS.flatMap((d) => d.ladders.map((l) => ({ x0: l.x - h, x1: l.x + h, z0: l.z - h, z1: l.z + h })));
  for (const y of [0, UPPER]) {
    const rects = DUCTS.flatMap((d) => d.runs.filter((r) => near(r.from.y, y)).map(runRect));
    if (!rects.length) continue;
    const ox = Math.floor(Math.min(...rects.map((r) => r.x0)) / RES) * RES - RES;
    const oz = Math.floor(Math.min(...rects.map((r) => r.z0)) / RES) * RES - RES;
    const nx = Math.ceil((Math.max(...rects.map((r) => r.x1)) - ox) / RES) + 2;
    const nz = Math.ceil((Math.max(...rects.map((r) => r.z1)) - oz) / RES) + 2;
    const inside = new Uint8Array(nx * nz);
    const inShaft = new Uint8Array(nx * nz);
    for (let k = 0; k < nz; k++) {
      for (let i = 0; i < nx; i++) {
        const x = ox + (i + 0.5) * RES;
        const z = oz + (k + 0.5) * RES;
        const hit = (r: Rect) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
        if (rects.some(hit)) inside[k * nx + i] = 1;
        if (shafts.some(hit)) inShaft[k * nx + i] = 1;
      }
    }
    // Walls: one along each edge between an inside cell and an outside one, merged into runs.
    const cell = (i: number, k: number) => i >= 0 && k >= 0 && i < nx && k < nz && inside[k * nx + i] === 1;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      // Edges facing +x or -x run along z; edges facing +z or -z run along x.
      const alongZ = dx !== 0;
      const outer = alongZ ? nx : nz;
      const inner = alongZ ? nz : nx;
      for (let a = 0; a < outer; a++) {
        let start = -1;
        for (let b = 0; b <= inner; b++) {
          const i = alongZ ? a : b;
          const k = alongZ ? b : a;
          let edge = b < inner && cell(i, k) && !cell(i + dx, k + dz);
          if (edge) {
            // The edge's line on the floor plan: left open where it lies across a room's face.
            const ex = alongZ ? ox + (i + (dx > 0 ? 1 : 0)) * RES : ox + (i + 0.5) * RES;
            const ez = alongZ ? oz + (k + 0.5) * RES : oz + (k + (dz > 0 ? 1 : 0)) * RES;
            if (onRoomFace(ex, ez, RES)) edge = false;
          }
          if (edge && start < 0) start = b;
          if (!edge && start >= 0) {
            const lineAt = alongZ ? ox + (a + (dx > 0 ? 1 : 0)) * RES : oz + (a + (dz > 0 ? 1 : 0)) * RES;
            const s0 = (alongZ ? oz : ox) + start * RES;
            const s1 = (alongZ ? oz : ox) + b * RES;
            const w0 = dx + dz > 0 ? lineAt : lineAt - t;
            const w1 = dx + dz > 0 ? lineAt + t : lineAt;
            out.push(alongZ
              ? { min: v(w0, y, s0), max: v(w1, y + DUCT_HEIGHT, s1), kind: 'wall' }
              : { min: v(s0, y, w0), max: v(s1, y + DUCT_HEIGHT, w1), kind: 'wall' });
            start = -1;
          }
        }
      }
    }
    // Floors and roofs, open over the shafts where the levels join.
    const floorGrid = new Uint8Array(nx * nz);
    const roofGrid = new Uint8Array(nx * nz);
    for (let n = 0; n < nx * nz; n++) {
      floorGrid[n] = inside[n] && !(y > 0 && inShaft[n]) ? 1 : 0;
      roofGrid[n] = inside[n] && !(y === 0 && inShaft[n]) ? 1 : 0;
    }
    for (const r of rectsOf(floorGrid, nx, nz, ox, oz)) out.push({ min: v(r.x0, y - t, r.z0), max: v(r.x1, y, r.z1), kind: 'floor' });
    for (const r of rectsOf(roofGrid, nx, nz, ox, oz)) out.push({ min: v(r.x0, y + DUCT_HEIGHT, r.z0), max: v(r.x1, y + DUCT_HEIGHT + t, r.z1), kind: 'roof' });
  }
  // The shafts' walls between the lower roof and the upper floor.
  for (const s of shafts) {
    const y0 = DUCT_HEIGHT;
    const y1 = UPPER;
    out.push({ min: v(s.x0 - t, y0, s.z0 - t), max: v(s.x1 + t, y1, s.z0), kind: 'shaft' });
    out.push({ min: v(s.x0 - t, y0, s.z1), max: v(s.x1 + t, y1, s.z1 + t), kind: 'shaft' });
    out.push({ min: v(s.x0 - t, y0, s.z0), max: v(s.x0, y1, s.z1), kind: 'shaft' });
    out.push({ min: v(s.x1, y0, s.z0), max: v(s.x1 + t, y1, s.z1), kind: 'shaft' });
  }
  return out;
}

/** Where a bay's opening is, on the room's inner face. */
export function bayPoint(bay: Bay): Vec {
  const f = faces(ROOMS[bay.room]);
  if (bay.wall === 'north') return v(bay.at, 0, f.z0);
  if (bay.wall === 'south') return v(bay.at, 0, f.z1);
  if (bay.wall === 'west') return v(f.x0, 0, bay.at);
  return v(f.x1, 0, bay.at);
}

/** Whether a bay is a corner piece (the two at each end of a wall), which can't take an opening. */
export function isCornerBay(bay: Bay): boolean {
  const r = ROOMS[bay.room];
  const [lo, hi] = bay.wall === 'north' || bay.wall === 'south' ? [r.x0, r.x1] : [r.z0, r.z1];
  const centres: number[] = [];
  for (let c = lo + 2; c < hi; c += 4) centres.push(c);
  if (!centres.includes(bay.at)) return true;
  return bay.at === centres[0] || bay.at === centres[centres.length - 1];
}
