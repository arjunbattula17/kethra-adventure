import * as THREE from 'three';

/**
 * Player colliders for the grove.
 *
 * The scene shipped seven boxes — the six named trees plus the mechanism core — so every boulder,
 * pillar, shrine, valve, console and NPC was walk-through. The ship interior can derive its
 * colliders from geometry alone, but this scene can't: buildClutter scatters hundreds of grass,
 * flower and pebble instances precisely because they are *not* obstacles, and colliding with them
 * would turn the grove into a maze. So kit placements opt in explicitly and only the hand-built
 * structures go through geometric rules.
 */

// Which kit batches are solid is decided where they are placed, not here: buildFoliage marks each
// species' trunk primitive (not its canopy, so you walk under a tree rather than into it) and the
// two boulder passes mark their Rock_Medium batches. Everything else in the kit — pebbles, path
// stones, bushes, ferns, grass, clover, flowers, mushrooms — is ground cover and is walked through,
// which is what lets buildClutter scatter it as densely as it does.

// Kethra's floors are terraced, from y = -0.05 up to the secret ledge at 2.78, so unlike the ship
// there is no single floor plane to measure "low enough to step over" or "high enough to walk
// under" against. PlayerController makes both of those tests against the player's actual feet, so
// nothing here filters on absolute height — only on what can never be an obstacle at any height.
const MIN_FOOTPRINT = 0.4;
const MIN_THICKNESS = 0.012;
// An axis-aligned box is a poor stand-in for anything this wide in both horizontal axes; in this
// scene that means the terrace slabs and the ground plane, which the player walks on.
const MAX_SHELL_FOOTPRINT = 4;

function isSolid(mesh: THREE.Mesh): boolean {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return materials.some((m) => m && !m.transparent && (m as THREE.Material).type !== 'MeshBasicMaterial');
}

function acceptsStructure(box: THREE.Box3): boolean {
  const sx = box.max.x - box.min.x;
  const sy = box.max.y - box.min.y;
  const sz = box.max.z - box.min.z;
  if (Math.min(sx, sy, sz) < MIN_THICKNESS) return false;
  if (Math.max(sx, sz) < MIN_FOOTPRINT) return false;
  if (sx > MAX_SHELL_FOOTPRINT && sz > MAX_SHELL_FOOTPRINT) return false;
  return true;
}

export interface KethraColliderOptions {
  /** Surfaces the player stands on — never obstacles. */
  floorMeshes: THREE.Object3D[];
  /** Objects whose transform changes per frame, so a baked box would go stale. */
  animated: THREE.Object3D[];
}

export function buildKethraColliders(scene: THREE.Scene, opts: KethraColliderOptions): THREE.Box3[] {
  const skip = new Set<THREE.Object3D>();
  for (const root of [...opts.floorMeshes, ...opts.animated]) root.traverse((o) => skip.add(o));

  const boxes: THREE.Box3[] = [];
  const box = new THREE.Box3();
  const matrix = new THREE.Matrix4();
  scene.updateMatrixWorld(true);

  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible || skip.has(mesh)) return;
    const geometry = mesh.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const local = geometry.boundingBox;
    if (!local) return;

    const instanced = mesh as THREE.InstancedMesh;
    if (instanced.isInstancedMesh) {
      // Every kit placement in this scene is an InstancedMesh, even a one-off (see kit.ts).
      if (mesh.userData.collides !== true) return;
      for (let i = 0; i < instanced.count; i++) {
        box.copy(local);
        instanced.getMatrixAt(i, matrix);
        boxes.push(box.applyMatrix4(matrix.premultiply(mesh.matrixWorld)).clone());
      }
      return;
    }

    if (!isSolid(mesh)) return;
    box.copy(local).applyMatrix4(mesh.matrixWorld);
    if (acceptsStructure(box)) boxes.push(box.clone());
  });

  return boxes;
}
