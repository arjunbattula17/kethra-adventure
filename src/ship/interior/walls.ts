import * as THREE from 'three';
import type { InteriorCtx } from './ctx';
import { ROOM_W, ROOM_D, addGrimeOverlay } from './ctx';
import { placeKitPiece, preloadKit, KIT_TILE } from './kit';

const HALF_W = ROOM_W / 2; // 6
const HALF_D = ROOM_D / 2; // 8

// The kit's own material set is where the round's measured crushed-blacks/blown-highlights miss
// actually lives, not the lighting. Checked against the raw glTF + PNGs in
// public/models/quaternius: MI_Trim_01/MI_Trim_02 (the bolts/rails on every wall bay and the
// column's upper band) bake in ~99.7% metalness (T_Trim_01_ORM.png / T_Trim_02_ORM.png, blue
// channel mean 0.997) with no environment map in this scene, so anywhere only ambient/fill light
// reaches them — most of the enlarged room, per this round's brief — they render pure black:
// metals have no diffuse term, so zero specular light in equals zero light out. MI_Trim_03 (the
// dominant flat panel face, ~two-thirds of every wall/column surface by triangle count) is fully
// dielectric already, but its baked albedo runs bright (T_Trim_03_BaseColor.png mean 0.66), which
// is what blows out under direct light. MI_Trim_03_Cables_Blue (the corner-cap trim) ships with an
// empty pbrMetallicRoughness block — no texture at all, so it falls back to glTF's default white/
// full-metal/full-rough and swings between the same two failure modes. None of this is exposure;
// it is the "give distinct materials genuinely distinct roughness/metalness" gap called out for
// every piece, so it gets fixed once per unique material rather than left for lighting to hide.
const groundedMaterials = new Set<THREE.Material>();
const SHADOW_FLOOR = new THREE.Color('#262b31');

function groundKitMaterial(mat: THREE.Material): void {
  if (groundedMaterials.has(mat)) return;
  groundedMaterials.add(mat);
  if (!(mat instanceof THREE.MeshStandardMaterial)) return;
  // Every case gets the same small emissive floor — never quite zero, matching the reference's
  // shadows still carrying material detail instead of crushing to true black.
  mat.emissive.copy(SHADOW_FLOOR);
  mat.emissiveIntensity = 0.1;
  switch (mat.name) {
    case 'MI_Trim_01':
    case 'MI_Trim_02':
      // Bolts and rails: keep them metallic (this is the "bare steel" role) but pull them back
      // from mirror-metal so ambient fill still reaches them and their specular peak stops
      // clipping. glTF's roughnessFactor here was the default 1 (identity), so a straight
      // multiply is a no-op — replace it outright.
      mat.metalness = 0.6;
      mat.roughness = 1.6;
      break;
    case 'MI_Trim_03':
      // The dominant painted-panel face: tint its bright baked albedo down toward the brief's
      // painted-panel range and rough it up so it stops reading as glossy plastic.
      mat.color.multiplyScalar(0.72);
      mat.roughness = 2.2;
      break;
    case 'MI_Trim_03_Dark':
      // Same ORM curve as MI_Trim_03 (already fully dielectric, already dark), just roughened to
      // match — this is the recessed/seam variant where grime collects.
      mat.roughness = 1.6;
      break;
    case 'MI_Trim_03_Cables_Blue':
      // No baseColor/ORM texture on this one at all, so the JS-side scalars are the only PBR
      // response it has.
      mat.color.set('#454f59');
      mat.metalness = 0.4;
      mat.roughness = 0.55;
      break;
    default:
      break;
  }
}

function groundKitPiece(obj: THREE.Object3D): THREE.Object3D {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      groundKitMaterial(mat);
    }
  });
  return obj;
}

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
  const columns: Placement[] = [];
  for (const s of [-1, 1] as const) {
    for (const z of [-KIT_TILE / 2, KIT_TILE / 2]) {
      columns.push({ name: 'Column_Astra', pos: [s * (HALF_W - 0.55), 0, z], yaw: inwardYaw(-s, 0) });
    }
  }
  jobs.push(...columns);

  await Promise.all(jobs.map((j) => placeKitPiece(ctx.scene, j.name, j.pos, j.yaw).then(groundKitPiece)));

  // Corrosion pooling at each column's deck joint — the one wear cue this pass can place with
  // confidence, since these are transforms this module already owns rather than an offset guessed
  // against the kit's imported wall-face geometry.
  for (const c of columns) {
    addGrimeOverlay(
      ctx,
      1.0,
      0.9,
      new THREE.Vector3(c.pos[0], 0.45, c.pos[2]),
      new THREE.Euler(0, c.yaw, 0),
      0.3,
    );
  }
}
