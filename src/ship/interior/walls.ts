import type { InteriorCtx } from './ctx';
import { ROOM_W, ROOM_D } from './ctx';
import { placeKitPiece, preloadKit, KIT_TILE } from './kit';

const HALF_W = ROOM_W / 2; // 6
const HALF_D = ROOM_D / 2; // 8

// Body + cap pair shared by every straight bay, kept consistent per the kit's own catalogue so
// seams between adjacent bays don't clash. WallAstra only ships square corner *bodies*, and of the
// cap families only TopCables ships a matching square corner *cap* (TopAstra/TopSimple/TopPlastic/
// TopWindow only have round corner caps) — so the four room corners deliberately borrow TopCables'
// cap while every straight run keeps TopAstra.
const WALL_BODY = 'WallAstra_Straight';
const WALL_TOP = 'TopAstra_Straight';
const CORNER_BODY = 'WallAstra_Corner_Square_Inner';
const CORNER_TOP = 'TopCables_Corner_Square_Inner';

/** Yaw that turns a piece authored facing local +Z so that face points along world (nx, nz). */
function inwardYaw(nx: number, nz: number): number {
  return Math.atan2(nx, nz);
}

interface Placement {
  name: string;
  pos: [number, number, number];
  yaw: number;
}

/**
 * The four hull walls, assembled bay-by-bay from real kit geometry. The 12x16 footprint is a 3x4
 * grid of 4-unit floor tiles (see floor.ts); every wall bay and every corner piece sits centred
 * over exactly one of those tiles, so the shell and the deck share one grid with no fractional
 * seams. The airlock wall's single straight bay (0, 0, HALF_D) is deliberately left unfilled here
 * — buildAirlock() owns that opening and fills it with a door frame instead of a wall bay.
 */
export async function buildWalls(ctx: InteriorCtx): Promise<void> {
  await preloadKit([WALL_BODY, WALL_TOP, CORNER_BODY, CORNER_TOP, 'Column_Astra']);

  const jobs: Placement[] = [];

  // ----- side walls (the long runs, x = +-HALF_W): two straight bays each, corners left for the
  // corner pass below -----
  //
  // WallAstra_Straight/TopAstra_Straight are NOT authored front-facing like every other prop in
  // this codebase (see props.ts: "Props are authored facing their own +Z") — their local +Z runs
  // the piece's 4-unit length (matches KIT_TILE, confirmed against the raw glTF bounds) and their
  // local +X is the thin ~1.2-unit wall thickness, offset off-centre toward -X. inwardYaw() spins
  // local +Z to face a target direction, which is the wrong axis for this piece: at yaw=+-PI/2 the
  // 4-unit length axis swings onto world X instead of running along the wall (world Z), so each
  // bay renders as a short, thick slab jutting into the room instead of a flush wall segment — the
  // self-intersecting "leaning" panels on wallLeft.png/wallRight.png. The fix is yaw 0/PI (leaves
  // local Z on world Z) plus the same tile-centred x used for the corner pass below, so the thin
  // side lands flush on the true boundary instead of centred on it.
  for (const s of [-1, 1] as const) {
    const x = s * (HALF_W - KIT_TILE / 2);
    const yaw = s > 0 ? Math.PI : 0;
    for (const z of [-KIT_TILE / 2, KIT_TILE / 2]) {
      jobs.push({ name: WALL_BODY, pos: [x, 0, z], yaw });
      jobs.push({ name: WALL_TOP, pos: [x, 0, z], yaw });
    }
  }

  // ----- console (-Z) end wall: one straight bay. The starfield viewport bay is dressed onto the
  // front face of this wall by buildStarfieldWindow(). -----
  {
    const yaw = inwardYaw(0, 1);
    jobs.push({ name: WALL_BODY, pos: [0, 0, -HALF_D], yaw });
    jobs.push({ name: WALL_TOP, pos: [0, 0, -HALF_D], yaw });
  }

  // ----- four corners: each sits centred on the corner floor tile, 4/4 units in from the true
  // room corner along both axes, oriented along the diagonal that bisects the two walls it joins.
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      const x = sx * (HALF_W - KIT_TILE / 2);
      const z = sz * (HALF_D - KIT_TILE / 2);
      const yaw = inwardYaw(-sx, -sz);
      jobs.push({ name: CORNER_BODY, pos: [x, 0, z], yaw });
      jobs.push({ name: CORNER_TOP, pos: [x, 0, z], yaw });
    }
  }

  // ----- structural rhythm along the long (side) walls, echoing the kit's own preview shots -----
  for (const s of [-1, 1] as const) {
    for (const z of [-KIT_TILE / 2, KIT_TILE / 2]) {
      jobs.push({ name: 'Column_Astra', pos: [s * (HALF_W - 0.55), 0, z], yaw: inwardYaw(-s, 0) });
    }
  }

  await Promise.all(jobs.map((j) => placeKitPiece(ctx.scene, j.name, j.pos, j.yaw)));
}
