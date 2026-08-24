import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { InteriorCtx } from './ctx';

/**
 * Collapses draw calls for the room's static geometry. Six rounds of "increase prop density" left
 * the scene at ~1800 individual meshes across ~400 materials for one room — every bolt, cable and
 * LED is its own THREE.Mesh, so the renderer pays a full draw call (and driver-side state change)
 * per prop regardless of how small it is. Meshes that already share the exact same material object
 * (the common pattern here: `const mat = new THREE.MeshStandardMaterial(...)` hoisted once, reused
 * across a loop of rivets/cables/etc.) are bit-for-bit safe to merge into one BufferGeometry per
 * material: merging bakes each mesh's world transform into its own vertex data first, so the merged
 * result is visually identical, just one draw call instead of many.
 *
 * Call once, after every buildXxx(ctx) has finished adding its geometry and before the scene is
 * handed to the player/collision setup. Anything that must keep its own identity — the three
 * console interaction targets, the floor's raycast-target slab, and the couple of props that
 * animate their own position/rotation per frame rather than just a material property — registers
 * itself in ctx.noMerge and is left untouched.
 */
export function batchStaticGeometry(ctx: InteriorCtx): void {
  const allMeshes: THREE.Mesh[] = [];
  ctx.scene.traverse((o) => {
    // THREE.InstancedMesh.isMesh is also true (it extends Mesh), but its .geometry is only the
    // single base shape — per-instance placements live in a separate instanceMatrix buffer this
    // pass never reads. Merging one would silently drop every instance but one. InstancedMesh is
    // already a single draw call regardless of instance count, so it needs no batching anyway.
    if ((o as THREE.InstancedMesh).isInstancedMesh) return;
    if ((o as THREE.Mesh).isMesh) allMeshes.push(o as THREE.Mesh);
  });

  // Multiple original meshes can already share one geometry object (a hoisted `const someGeo = new
  // THREE.PlaneGeometry(...)` reused across many `new THREE.Mesh(someGeo, ...)` calls). Track total
  // usage so a geometry is only disposed once nothing in the scene references it anymore.
  const geomUseCount = new Map<string, number>();
  for (const m of allMeshes) {
    if (Array.isArray(m.material)) continue; // multi-material (face-array) meshes: skip, see below
    geomUseCount.set(m.geometry.uuid, (geomUseCount.get(m.geometry.uuid) ?? 0) + 1);
  }

  const groups = new Map<string, THREE.Mesh[]>();
  for (const m of allMeshes) {
    if (ctx.noMerge.has(m)) continue;
    if (Array.isArray(m.material)) continue; // per-face materials need grouped merge ranges; not worth the complexity here
    if (!m.parent) continue;
    const key = `${m.material.uuid}|${m.castShadow}|${m.receiveShadow}|${m.renderOrder}`;
    const list = groups.get(key);
    if (list) list.push(m);
    else groups.set(key, [m]);
  }

  let merged = 0;
  let removed = 0;
  for (const group of groups.values()) {
    if (group.length < 2) continue;

    const baked: THREE.BufferGeometry[] = [];
    for (const m of group) {
      m.updateWorldMatrix(true, false);
      const g = m.geometry.clone();
      g.applyMatrix4(m.matrixWorld);
      baked.push(g);
    }

    const result = mergeGeometries(baked, false);
    for (const g of baked) g.dispose(); // the temporary baked clones, not the originals
    if (!result) continue; // incompatible attribute sets across the group — leave these meshes as-is

    const first = group[0];
    const combined = new THREE.Mesh(result, first.material);
    combined.castShadow = first.castShadow;
    combined.receiveShadow = first.receiveShadow;
    combined.renderOrder = first.renderOrder;
    ctx.scene.add(combined);

    for (const m of group) {
      m.parent?.remove(m);
      const remaining = (geomUseCount.get(m.geometry.uuid) ?? 1) - 1;
      geomUseCount.set(m.geometry.uuid, remaining);
      if (remaining <= 0) m.geometry.dispose();
      removed++;
    }
    merged++;
  }

  console.log(`[batchStaticGeometry] ${allMeshes.length} meshes -> merged ${removed} into ${merged} batches`);
}
