import * as THREE from 'three';
import type { InteriorCtx } from './ctx';

/**
 * Derives player colliders from the interior's own geometry.
 *
 * The room used to ship six hand-written boxes — four walls, the console housing and the repair
 * station — so every crate, locker, barrel, rack, workbench, column and door leaf was walk-through.
 * Hand-maintaining a box per prop across nine modules that each place dozens of them is not
 * realistic, so the boxes are read back off the meshes the builders actually created.
 *
 * Must run *before* batchStaticGeometry(): merging collapses many meshes into one geometry per
 * material, at which point a single "collider" would span every prop sharing that material.
 */

// Mirrors PlayerController: shorter than STEP_OVER is walked over, higher than HEAD_ROOM is walked
// under. STEP_OVER sits slightly above the controller's own threshold so a prop can never end up
// with a collider the controller then decides to ignore.
const STEP_OVER = 0.3;
const HEAD_ROOM = 2.1;

// An axis-aligned box is only a fair stand-in for a mesh that roughly fills it. Two shapes here
// badly break that: the kit's square inner corner pieces are L-shaped and 4.77 m on a side, so
// their box covers the open floor inside the L, and the deck and ceiling slabs span the whole room.
// Anything wide in *both* horizontal axes is that kind of shell and is left to the hand-authored
// room colliders. Pieces long in one axis only — wall bays, the door frame, the console — are still
// well described by their box and are kept.
const MAX_SHELL_FOOTPRINT = 1.5;

// Below this, a mesh is fastener/indicator scale: bolt heads, LED lenses, cable clips, trim ribs.
// They are all attached to something bigger that does get a collider, so giving them their own only
// costs per-frame work.
const MIN_FOOTPRINT = 0.12;

// Decal planes are flat, alpha-blended and deliberately co-planar with what they sit on.
const MIN_THICKNESS = 0.012;

function isSolid(mesh: THREE.Mesh): boolean {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return materials.some((m) => m && !m.transparent && (m as THREE.Material).type !== 'MeshBasicMaterial');
}

function accepts(box: THREE.Box3): boolean {
  const sx = box.max.x - box.min.x;
  const sy = box.max.y - box.min.y;
  const sz = box.max.z - box.min.z;
  if (Math.min(sx, sy, sz) < MIN_THICKNESS) return false;
  if (Math.max(sx, sz) < MIN_FOOTPRINT) return false;
  if (sx > MAX_SHELL_FOOTPRINT && sz > MAX_SHELL_FOOTPRINT) return false;
  if (box.max.y <= STEP_OVER) return false;
  if (box.min.y >= HEAD_ROOM) return false;
  return true;
}

export function buildInteriorColliders(ctx: InteriorCtx): THREE.Box3[] {
  // The deck raycast targets are the surface the player stands on; a collider on one would wall the
  // player in where they stand. The height rules already exclude them, but the failure mode is bad
  // enough to be worth an explicit exclusion rather than an implicit one.
  const floor = new Set<THREE.Object3D>();
  for (const target of ctx.floorMeshes) target.traverse((o) => floor.add(o));

  const boxes: THREE.Box3[] = [];
  const box = new THREE.Box3();
  const matrix = new THREE.Matrix4();
  ctx.scene.updateMatrixWorld(true);

  ctx.scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible || floor.has(mesh) || !isSolid(mesh)) return;
    const geometry = mesh.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const local = geometry.boundingBox;
    if (!local) return;

    // An InstancedMesh's geometry sits at the origin and every real placement lives in
    // instanceMatrix, so its own bounding box describes nothing. props.ts collapses most repeated
    // props into instanced batches, so without this the crates, drums and lockers that make up
    // most of the room's furniture would contribute no colliders at all.
    const instanced = mesh as THREE.InstancedMesh;
    const count = instanced.isInstancedMesh ? instanced.count : 1;
    for (let i = 0; i < count; i++) {
      box.copy(local);
      if (instanced.isInstancedMesh) {
        instanced.getMatrixAt(i, matrix);
        box.applyMatrix4(matrix.premultiply(mesh.matrixWorld));
      } else {
        box.applyMatrix4(mesh.matrixWorld);
      }
      if (accepts(box)) boxes.push(box.clone());
    }
  });

  return boxes;
}
