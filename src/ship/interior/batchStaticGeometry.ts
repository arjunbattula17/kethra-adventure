import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { InteriorCtx } from './ctx';
import { RAYCAST_ONLY_LAYER } from '../../player/InteractionSystem';

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
 * Three more sources of draws are folded in (docs/PERF_LOG.md, 2026-09-27; facing the navigation
 * console a frame drew 651 objects, and on Intel UHD graphics each draw call costs ~0.03 ms of its
 * own, which is most of why that view ran at half the frame rate of the rest of the room):
 * - InstancedMeshes. props.ts's autoInstance and the builders' bolt/slat/rivet helpers make one per
 *   (geometry, material) pair, so a single steel material could sit in dozens of instanced draws,
 *   each drawn every frame (they skip frustum culling). Their instances are baked in here with every
 *   other mesh of the same material.
 * - Interaction targets (ctx.mergeWithin, see protectSubtree). Their meshes merge among themselves
 *   into batches that stay inside the target, and the originals stay too, on RAYCAST_ONLY_LAYER:
 *   never drawn, but still what the crosshair's raycast hits.
 * - Separate but identical plain materials (see shareIdenticalMaterials).
 *
 * Call once, after every buildXxx(ctx) has finished adding its geometry and before the scene is
 * handed to the player/collision setup. Anything that must keep its own identity — the floor's
 * raycast-target slab, stand-alone aim proxies, and the couple of props that animate their own
 * position/rotation per frame rather than just a material property — registers itself in
 * ctx.noMerge and is left untouched.
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

/**
 * A key that is equal for two materials only if every property either holds is equal, or null if
 * the material is not a plain one this pass may share. Plain means: opaque, not glowing, no texture
 * of any kind, and no shader hooks. Everything the room animates at runtime is excluded by that
 * alone (emissive intensity, opacity and texture offsets are the only material properties it
 * animates); the LED and status-light lists are excluded by name in shareIdenticalMaterials too.
 */
function plainSignature(mat: THREE.Material): string | null {
  if (mat.transparent) return null;
  const emissive = (mat as THREE.MeshStandardMaterial).emissive;
  if (emissive && emissive.getHex() !== 0 && (mat as THREE.MeshStandardMaterial).emissiveIntensity !== 0) return null;
  const own = mat as unknown as Record<string, unknown>;
  const parts: string[] = [mat.type];
  for (const key of Object.keys(own).sort()) {
    if (key === 'uuid' || key === 'version' || key === '_listeners') continue;
    const v = own[key];
    if (v === null || v === undefined || typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') {
      parts.push(`${key}=${v}`);
    } else if (typeof v === 'function' || (v as THREE.Texture).isTexture) {
      return null; // an instance-level shader hook, or a texture
    } else if ((v as THREE.Color).isColor) {
      const c = v as THREE.Color;
      parts.push(`${key}=${c.r},${c.g},${c.b}`);
    } else if ((v as THREE.Vector2).isVector2) {
      const p = v as THREE.Vector2;
      parts.push(`${key}=${p.x},${p.y}`);
    } else if ((v as THREE.Euler).isEuler) {
      const e = v as THREE.Euler;
      parts.push(`${key}=${e.x},${e.y},${e.z},${e.order}`);
    } else if (Array.isArray(v)) {
      if (v.length) return null;
      parts.push(`${key}=[]`);
    } else {
      try {
        parts.push(`${key}=${JSON.stringify(v)}`);
      } catch {
        return null;
      }
    }
  }
  return parts.join('|');
}

/**
 * Points meshes that use separate but identical plain materials at one of them, so they batch as
 * one. The builders create many of these one call at a time (a fresh MeshStandardMaterial of the
 * same grey for each bracket, say), and 34 draws in the console view alone were such duplicates.
 * Nothing has been compiled or drawn yet, so the dropped copies need no disposal.
 */
function shareIdenticalMaterials(ctx: InteriorCtx, meshes: THREE.Mesh[]): number {
  const animated = new Set<THREE.Material>([...ctx.floorLedMats, ...ctx.statusLights.map((s) => s.material)]);
  const first = new Map<string, THREE.Material>();
  let shared = 0;
  for (const mesh of meshes) {
    const mat = mesh.material as THREE.Material;
    if (animated.has(mat)) continue;
    const key = plainSignature(mat);
    if (key === null) continue;
    const canonical = first.get(key);
    if (!canonical) first.set(key, mat);
    else if (canonical !== mat) {
      mesh.material = canonical;
      shared++;
    }
  }
  return shared;
}

const _instance = new THREE.Matrix4();
const _local = new THREE.Matrix4();

/**
 * The matrices that place each copy of `mesh` in `container`'s space: one for a mesh, one per
 * instance for an InstancedMesh. Null if any is mirrored (negative determinant): baking a mirror
 * into vertex data reverses the triangles' winding, which three.js only corrects per object, so a
 * mirrored piece would render inside out. None do today; they would simply stay unmerged.
 */
function placements(mesh: THREE.Mesh, inverseContainer: THREE.Matrix4): THREE.Matrix4[] | null {
  const out: THREE.Matrix4[] = [];
  const inst = mesh as THREE.InstancedMesh;
  const count = inst.isInstancedMesh ? inst.count : 1;
  for (let i = 0; i < count; i++) {
    _local.multiplyMatrices(inverseContainer, mesh.matrixWorld);
    if (inst.isInstancedMesh) {
      inst.getMatrixAt(i, _instance);
      _local.multiply(_instance);
    }
    if (_local.determinant() < 0) return null;
    out.push(_local.clone());
  }
  return out;
}

export function batchStaticGeometry(ctx: InteriorCtx): void {
  // `?nobatch=1` leaves every source mesh as its own scene node, which is what tools/interior-audit
  // .mjs needs: a merged batch's bounding box is the union of every mesh sharing that material, so
  // per-object overlap/containment checks are meaningless against the batched scene.
  if (new URLSearchParams(location.search).has('nobatch')) return;

  ctx.scene.updateMatrixWorld(true);

  // Each mesh merges into its nearest interaction target, or into the room itself.
  const containerOf = (o: THREE.Object3D): THREE.Object3D => {
    for (let p = o.parent; p; p = p.parent) if (ctx.mergeWithin.has(p)) return p;
    return ctx.scene;
  };

  const allMeshes: THREE.Mesh[] = [];
  const candidates: THREE.Mesh[] = [];
  ctx.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    allMeshes.push(m);
    if (ctx.noMerge.has(m) || Array.isArray(m.material) || !m.parent) return;
    // Per-instance colours and morph targets have no place in a merged, single-colour batch.
    if ((m as THREE.InstancedMesh).instanceColor || Object.keys(m.geometry.morphAttributes).length > 0) return;
    candidates.push(m);
  });
  const sharedMaterials = shareIdenticalMaterials(ctx, candidates);

  // Multiple original meshes can already share one geometry object (a hoisted `const someGeo = new
  // THREE.PlaneGeometry(...)` reused across many `new THREE.Mesh(someGeo, ...)` calls). Track total
  // usage so a geometry is only disposed once nothing in the scene references it anymore.
  const geomUseCount = new Map<string, number>();
  for (const m of allMeshes) geomUseCount.set(m.geometry.uuid, (geomUseCount.get(m.geometry.uuid) ?? 0) + 1);

  const byContainer = new Map<THREE.Object3D, Map<string, THREE.Mesh[]>>();
  for (const m of candidates) {
    const container = containerOf(m);
    let groups = byContainer.get(container);
    if (!groups) byContainer.set(container, (groups = new Map()));
    const key = `${(m.material as THREE.Material).uuid}|${m.castShadow}|${m.receiveShadow}|${m.renderOrder}`;
    const list = groups.get(key);
    if (list) list.push(m);
    else groups.set(key, [m]);
  }

  let batches = 0;
  let before = 0;
  for (const [container, groups] of byContainer) {
    const inverse = container.matrixWorld.clone().invert();
    const aimTarget = container !== ctx.scene;
    for (const group of groups.values()) {
      // Every instance of every member, in the container's space; mirrored members stay as they are.
      const members: THREE.Mesh[] = [];
      const baked: THREE.BufferGeometry[] = [];
      for (const m of group) {
        const mats = placements(m, inverse);
        if (!mats) continue;
        members.push(m);
        // A plain BufferGeometry copy, not geometry.clone(): cloning a CylinderGeometry, TorusGeometry
        // or any other parametric geometry first generates a default one of that kind and then copies
        // over it, which was 0.44 s of this pass on an Intel UHD laptop (docs/PERF_LOG.md, 2026-09-28).
        for (const matrix of mats) baked.push(new THREE.BufferGeometry().copy(m.geometry).applyMatrix4(matrix));
      }
      if (members.length < 2) {
        for (const g of baked) g.dispose();
        continue;
      }

      const normalized = normalizeForMerge(baked);
      const result = mergeGeometries(normalized, false);
      for (const g of baked) g.dispose(); // the temporary baked clones, not the originals
      for (const g of normalized) if (!baked.includes(g)) g.dispose(); // toNonIndexed() copies
      if (!result) continue; // still incompatible — leave these meshes as-is

      const first = members[0];
      const combined = new THREE.Mesh(result, first.material);
      combined.castShadow = first.castShadow;
      combined.receiveShadow = first.receiveShadow;
      combined.renderOrder = first.renderOrder;
      container.add(combined);
      before += members.length;
      batches++;

      if (aimTarget) {
        // Drawn by the batch, aimed at through the originals: the batch never answers a raycast,
        // and the originals move to the layer only the interaction raycaster looks at.
        combined.raycast = () => {};
        for (const m of members) m.layers.set(RAYCAST_ONLY_LAYER);
        continue;
      }
      for (const m of members) {
        m.parent?.remove(m);
        const remaining = (geomUseCount.get(m.geometry.uuid) ?? 1) - 1;
        geomUseCount.set(m.geometry.uuid, remaining);
        if (remaining <= 0) m.geometry.dispose();
        if ((m as THREE.InstancedMesh).isInstancedMesh) (m as THREE.InstancedMesh).dispose();
      }
    }
  }

  console.log(`[batchStaticGeometry] ${allMeshes.length} meshes, ${sharedMaterials} duplicate materials shared, ${before} merged into ${batches} batches`);
}
