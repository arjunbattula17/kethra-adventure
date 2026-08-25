import * as THREE from 'three';
import { kitPiece } from '../ship/interior/kit';

// Kitbashed from the same Quaternius Modular Sci-Fi MegaKit already wired up for the ship
// interior (src/ship/interior/kit.ts) — no separate ship-exterior asset pack reads as a match for
// this project's gritty PBR aesthetic, so the exterior hull is built out of the interior's own
// wall/column/platform/prop pieces instead. Every placement below was derived from the real local
// bounding box of each glTF (min/max of its POSITION accessors, read directly out of the .gltf
// JSON) rather than guessed against the kit's authored pivots, which vary piece to piece.

function toTuple(v: THREE.Vector3 | [number, number, number]): [number, number, number] {
  return Array.isArray(v) ? v : [v.x, v.y, v.z];
}

/** Local ship axes: +X nose, -X aft/engines, +Y up, +Z right (mirrored to -Z for the left side). */
export interface ShipHull {
  group: THREE.Group;
  /** World-facing exhaust points at the tip of each engine nacelle, in the group's local space. */
  engineLocalPositions: THREE.Vector3[];
}

/**
 * Loads `name`, applies `scale` (in the piece's own authored axes, before rotation), then
 * recenters it so its scaled bounding-box center sits at the wrapper's local origin. This decouples
 * "where do I want this piece in ship-space" from wherever the kit happened to author its pivot —
 * every piece below is placed by center position + rotation, not by hand-derived pivot offsets.
 */
async function centeredPiece(
  name: string,
  center: THREE.Vector3 | [number, number, number],
  rotation: THREE.Euler = new THREE.Euler(),
  scale: THREE.Vector3 | [number, number, number] = [1, 1, 1],
): Promise<THREE.Group> {
  const piece = await kitPiece(name);
  piece.scale.set(...toTuple(scale));
  const box = new THREE.Box3().setFromObject(piece);
  piece.position.sub(box.getCenter(new THREE.Vector3()));

  const wrapper = new THREE.Group();
  wrapper.add(piece);
  wrapper.position.set(...toTuple(center));
  wrapper.rotation.copy(rotation);
  return wrapper;
}

const HALF_PI = Math.PI / 2;

/** Small self-lit accent — engine glow, nav lights, cockpit backlight. Never a kit material, since
 * every kit glTF is loaded once and its material shared across every clone (see kit.ts); tinting a
 * shared material here would leak into every other piece that reuses it, including a future ship
 * interior visit. */
function accentMesh(
  geometry: THREE.BufferGeometry,
  color: number,
  intensity: number,
  center: THREE.Vector3 | [number, number, number],
  rotation?: THREE.Euler,
): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.4,
    metalness: 0.1,
  });
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.set(...toTuple(center));
  if (rotation) mesh.rotation.copy(rotation);
  return mesh;
}

export async function buildShipHull(): Promise<ShipHull> {
  const group = new THREE.Group();

  const engineLocalPositions = [new THREE.Vector3(-4.75, -0.18, 1.05), new THREE.Vector3(-4.75, -0.18, -1.05)];

  const pieces = await Promise.all([
    // Keel: Column_Large_Straight is authored 10 units tall along local Y — laid on its side
    // (rotate.z=-90 sends local +Y to world +X) and squashed to 7.2 it becomes the ship's
    // structural spine, running nose to aft through the hull's centerline.
    centeredPiece('Column_Large_Straight', [0.4, 0, 0], new THREE.Euler(0, 0, -HALF_PI), [1, 0.72, 1]),

    // Belly and dorsal skin: two floor tiles per side is the same "wall panel as hull plate" trick
    // the brief calls for — a Platform tile is a flat, PBR-detailed plate authored face-up, so it
    // needs a 180 flip (rotation.z=PI) to read as belly armor with its greebled face pointing down.
    // Narrowed on Z (native tiles are 4 wide) to sit *inside* the flank plates below — full width
    // tiles stuck out past the flanks and hid them from a broadside view, reading as one flat slab
    // instead of a hull with distinct top/bottom/side faces.
    centeredPiece('Platform_DarkPlates', [-1.8, -1.05, 0], new THREE.Euler(0, 0, Math.PI), [1, 1, 0.68]),
    centeredPiece('Platform_DarkPlates', [2.6, -1.05, 0], new THREE.Euler(0, 0, Math.PI), [1, 1, 0.68]),
    centeredPiece('Platform_Metal2', [-1.8, 1.05, 0], new THREE.Euler(), [1, 1, 0.68]),
    centeredPiece('Platform_Metal2', [2.6, 1.05, 0], new THREE.Euler(), [1, 1, 0.68]),

    // Flank plating: WallAstra_Straight_Flat is a thin vertical wall bay (0.1 x 3.0 x 4.0, same
    // material as every interior wall). rotation.y=+-90 swings its 4-unit length onto the ship's
    // X axis and its thin face-normal onto Z, turning a room wall into a side hull plate.
    centeredPiece('WallAstra_Straight_Flat', [-1.8, 0, 1.52], new THREE.Euler(0, HALF_PI, 0), [1, 1, 1.8]),
    centeredPiece('WallAstra_Straight_Flat', [2.2, 0, 1.52], new THREE.Euler(0, HALF_PI, 0)),
    centeredPiece('WallAstra_Straight_Flat', [-1.8, 0, -1.52], new THREE.Euler(0, -HALF_PI, 0), [1, 1, 1.8]),
    centeredPiece('WallAstra_Straight_Flat', [2.2, 0, -1.52], new THREE.Euler(0, -HALF_PI, 0)),

    // Structural rib trim: Column_MetalSupport is a thin floor-mounted brace (0.96 x 0.04 x 4) —
    // mounted proud of the flank plates it reads as a raised longeron rather than a repeat of the
    // flat plate behind it.
    centeredPiece('Column_MetalSupport', [0.4, 0.85, 1.62], new THREE.Euler(0, HALF_PI, 0), [1, 1, 1.8]),
    centeredPiece('Column_MetalSupport', [0.4, -0.85, 1.62], new THREE.Euler(0, HALF_PI, 0), [1, 1, 1.8]),
    centeredPiece('Column_MetalSupport', [0.4, 0.85, -1.62], new THREE.Euler(0, -HALF_PI, 0), [1, 1, 1.8]),
    centeredPiece('Column_MetalSupport', [0.4, -0.85, -1.62], new THREE.Euler(0, -HALF_PI, 0), [1, 1, 1.8]),

    // Edge trim: BottomMetal_Straight is a thin flat strip, run along each of the four long
    // dorsal/belly-to-flank seams so the hull reads as faceted panels meeting at a corner rather
    // than a smooth-blended slab.
    centeredPiece('BottomMetal_Straight', [0.4, 1.02, 1.58], new THREE.Euler(0, HALF_PI, 0), [1, 1, 1.8]),
    centeredPiece('BottomMetal_Straight', [0.4, -1.02, 1.58], new THREE.Euler(0, HALF_PI, 0), [1, 1, 1.8]),
    centeredPiece('BottomMetal_Straight', [0.4, 1.02, -1.58], new THREE.Euler(0, -HALF_PI, 0), [1, 1, 1.8]),
    centeredPiece('BottomMetal_Straight', [0.4, -1.02, -1.58], new THREE.Euler(0, -HALF_PI, 0), [1, 1, 1.8]),

    // Nose: Column_Round laid along X and squashed short gives a rounded prow instead of a hard
    // flat cutoff at the hull's forward end.
    centeredPiece('Column_Round', [4.55, 0, 0], new THREE.Euler(0, 0, -HALF_PI), [0.85, 0.5, 0.85]),

    // Cockpit viewport: WallWindow_Straight is the kit's own glazed wall bay, scaled down and
    // canted like a canopy just aft of the nose cap.
    centeredPiece('WallWindow_Straight', [3.05, 0.5, 0], new THREE.Euler(0, HALF_PI, -0.32), [0.85, 0.42, 0.5]),

    // Engine nacelles: Column_Round pods flanking the aft end of the spine, each capped with a
    // real fan mesh (Prop_Fan_Small + its propeller) facing aft so the exhaust reads as machinery
    // rather than a bare cylinder end.
    ...engineLocalPositions.flatMap((origin) => [
      centeredPiece(
        'Column_Round',
        [origin.x + 0.75, origin.y, origin.z],
        new THREE.Euler(0, 0, -HALF_PI),
        [0.62, 0.56, 0.62],
      ),
      centeredPiece('Prop_Fan_Small', origin, new THREE.Euler(0, 0, -HALF_PI), [0.42, 0.42, 0.42]),
      centeredPiece('Prop_Fan_Small_Propeller', origin, new THREE.Euler(0, 0, -HALF_PI), [0.42, 0.42, 0.42]),
    ]),

    // Hull greebles: vents and a small hatch break up the flank/dorsal plating so it doesn't read
    // as bare panel.
    centeredPiece('Prop_Vent_Big', [-0.6, 0.98, 1.05], new THREE.Euler(0, 0, 0), [0.7, 1, 0.7]),
    centeredPiece('Prop_Vent_Big', [-0.6, 0.98, -1.05], new THREE.Euler(0, 0, 0), [0.7, 1, 0.7]),
    centeredPiece('Prop_Vent_Wide', [1.4, -0.98, 0.9], new THREE.Euler(HALF_PI, 0, 0), [0.8, 1, 0.8]),
    centeredPiece('Prop_PipeHolder', [-3.0, 0.3, 0], new THREE.Euler(0, HALF_PI, 0), [0.55, 0.55, 0.55]),
    centeredPiece('Prop_Clamp', [-2.2, 0, 1.55], new THREE.Euler(0, HALF_PI, 0)),
  ]);

  for (const piece of pieces) group.add(piece);

  // Warm engine glow, matching EngineTrail's own ember tint (0xffb870) so the emitter and the
  // particles it feeds read as the same light source.
  for (const origin of engineLocalPositions) {
    group.add(
      accentMesh(
        new THREE.CylinderGeometry(0.24, 0.24, 0.06, 14),
        0xffb870,
        2.2,
        [origin.x - 0.05, origin.y, origin.z],
        new THREE.Euler(0, 0, HALF_PI),
      ),
    );
  }

  // Nav lights: cool port/starboard convention (red/cyan) matching the interior's own LED palette.
  group.add(accentMesh(new THREE.SphereGeometry(0.05, 8, 8), 0xe0552f, 1.6, [1.0, 0.15, 1.58]));
  group.add(accentMesh(new THREE.SphereGeometry(0.05, 8, 8), 0x4fd8f0, 1.6, [1.0, 0.15, -1.58]));

  // Cockpit backlight, seen through the viewport rather than as its own visible shape.
  group.add(
    accentMesh(
      new THREE.PlaneGeometry(0.5, 0.3),
      0xbfe3ff,
      0.9,
      [2.9, 0.5, 0],
      new THREE.Euler(0, HALF_PI, 0),
    ),
  );

  return { group, engineLocalPositions };
}
