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
/**
 * Makes a group of geometries mergeable. mergeGeometries requires every input to agree on two
 * things, and refuses the whole group otherwise — which it did 13 times on this scene, silently
 * leaving those groups as individual draw calls and partly defeating the point of batching.
 *
 * The first is the index attribute: it has to be present on all of them or none. Meshes sharing a
 * material here come from a mix of sources — chamferBox and the various Extrude/Lathe helpers
 * produce non-indexed geometry, while BoxGeometry and friends are indexed — so a group holding both
 * was rejected. Dropping the index off the indexed ones is the cheap direction: the reverse would
 * mean deduplicating vertices, and the merged result is drawn as one non-indexed buffer either way.
 *
 * The second is the attribute set. A geometry carrying a `uv` its neighbours lack fails the same
 * way, so anything not present on every member is dropped — a merged batch could not have used it
 * consistently regardless.
 */
function normalizeForMerge(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry[] {
  let out = geometries;

  const indexed = geometries.filter((g) => g.index !== null).length;
  if (indexed > 0 && indexed < geometries.length) {
    out = out.map((g) => (g.index !== null ? g.toNonIndexed() : g));
  }

  let common: string[] = Object.keys(out[0].attributes);
  for (const g of out) common = common.filter((name) => name in g.attributes);
  for (const g of out) {
    for (const name of Object.keys(g.attributes)) {
      if (!common.includes(name)) g.deleteAttribute(name);
    }
  }
  return out;
}

export function batchStaticGeometry(ctx: InteriorCtx): void {
  // `?nobatch=1` leaves every source mesh as its own scene node, which is what tools/interior-audit
  // .mjs needs: a merged batch's bounding box is the union of every mesh sharing that material, so
  // per-object overlap/containment checks are meaningless against the batched scene.
  if (new URLSearchParams(location.search).has('nobatch')) return;

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

    const normalized = normalizeForMerge(baked);
    const result = mergeGeometries(normalized, false);
    for (const g of baked) g.dispose(); // the temporary baked clones, not the originals
    for (const g of normalized) if (!baked.includes(g)) g.dispose(); // toNonIndexed() copies
    if (!result) continue; // still incompatible — leave these meshes as-is

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
