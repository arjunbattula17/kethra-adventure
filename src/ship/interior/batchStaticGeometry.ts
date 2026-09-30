import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { InteriorCtx } from './ctx';
import { atlasCanvasMaterials, mergeTints } from './materialMerge';
import type { Pacer } from '../../core/prepare';

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

const MAP_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'lightMap', 'envMap'] as const;

/**
 * Everything about a material that changes how it draws. Two materials with the same signature are
 * interchangeable, so their meshes can share one and merge. Custom shaders never match anything.
 */
function materialSignature(mat: THREE.Material): string | null {
  if (mat.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) return null;
  if (mat.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey) return null;
  const m = mat as THREE.MeshStandardMaterial & THREE.MeshPhysicalMaterial;
  const parts: unknown[] = [
    mat.type, mat.transparent, mat.opacity, mat.side, mat.blending, mat.depthWrite, mat.depthTest, mat.alphaTest,
    mat.vertexColors, mat.toneMapped, mat.polygonOffset, mat.polygonOffsetFactor, mat.polygonOffsetUnits,
    mat.premultipliedAlpha, mat.visible, mat.colorWrite, mat.forceSinglePass,
    m.color?.getHex(), m.emissive?.getHex(), m.emissiveIntensity, m.roughness, m.metalness, m.flatShading,
    m.envMapIntensity, m.normalScale?.x, m.normalScale?.y, m.aoMapIntensity, m.clearcoat, m.clearcoatRoughness, m.fog,
  ];
  for (const slot of MAP_SLOTS) parts.push((m as unknown as Record<string, THREE.Texture | null>)[slot]?.uuid ?? '-');
  return JSON.stringify(parts);
}

/**
 * Points meshes with identical materials at one shared material object, since batching only merges
 * meshes that share the object. Skips ctx.animatedMaterials. Also sets forceSinglePass on
 * double-sided transparent materials; for thin glows and decals one pass looks the same as two.
 */
/** The context fields batching needs; InteriorCtx satisfies it, and so can any scene's own object. */
export type BatchCtx = Pick<InteriorCtx, 'scene' | 'noMerge' | 'animatedMaterials'>;

function shareIdenticalMaterials(ctx: BatchCtx, meshes: THREE.Mesh[]): number {
  const canonical = new Map<string, THREE.Material>();
  let replaced = 0;
  for (const mesh of meshes) {
    if (Array.isArray(mesh.material)) continue;
    const mat = mesh.material;
    if (mat.transparent && mat.side === THREE.DoubleSide) mat.forceSinglePass = true;
    if (ctx.animatedMaterials.has(mat)) continue;
    const sig = materialSignature(mat);
    if (sig === null) continue;
    const first = canonical.get(sig);
    if (!first) canonical.set(sig, mat);
    else if (first !== mat) {
      mesh.material = first;
      replaced++;
    }
  }
  return replaced;
}

/** One geometry per instance, with the instance's transform baked in (for folding into a batch). */
function expandInstances(mesh: THREE.InstancedMesh): THREE.BufferGeometry[] {
  mesh.updateWorldMatrix(true, false);
  const out: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4();
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, m);
    m.premultiply(mesh.matrixWorld);
    const g = mesh.geometry.clone();
    g.applyMatrix4(m);
    out.push(g);
  }
  return out;
}

/**
 * With a pacer, the merge yields between batches, for a scene built while another is moving on screen
 * (the Anchorage, during the docking cruise): the Wren's merge is 230-300 ms in one piece on an Intel
 * UHD laptop.
 */
export async function batchStaticGeometry(ctx: BatchCtx, pacer?: Pacer): Promise<void> {
  // `?nobatch=1` leaves every source mesh as its own scene node, which is what tools/interior-audit
  // .mjs needs: a merged batch's bounding box is the union of every mesh sharing that material, so
  // per-object overlap/containment checks are meaningless against the batched scene.
  if (new URLSearchParams(location.search).has('nobatch')) return;

  const allMeshes: THREE.Mesh[] = [];
  const instanced: THREE.InstancedMesh[] = [];
  ctx.scene.traverse((o) => {
    // An InstancedMesh's .geometry is only the base shape; its placements live in instanceMatrix.
    // It is folded into a batch below (instances expanded) only when that saves a draw call, and
    // never when its instances carry their own colours.
    if ((o as THREE.InstancedMesh).isInstancedMesh) {
      const im = o as THREE.InstancedMesh;
      if (!ctx.noMerge.has(im) && !im.instanceColor && !Array.isArray(im.material)) instanced.push(im);
      return;
    }
    if ((o as THREE.Mesh).isMesh) allMeshes.push(o as THREE.Mesh);
  });
  const shared = shareIdenticalMaterials(ctx, [...allMeshes, ...instanced]);
  await pacer?.tick();
  const atlased = atlasCanvasMaterials(allMeshes, ctx.animatedMaterials, ctx.noMerge);
  await pacer?.tick();
  const tinted = mergeTints(allMeshes, ctx.animatedMaterials, ctx.noMerge);
  await pacer?.tick();

  // Multiple original meshes can already share one geometry object (a hoisted `const someGeo = new
  // THREE.PlaneGeometry(...)` reused across many `new THREE.Mesh(someGeo, ...)` calls). Track total
  // usage so a geometry is only disposed once nothing in the scene references it anymore.
  const geomUseCount = new Map<string, number>();
  for (const m of allMeshes) {
    if (Array.isArray(m.material)) continue; // multi-material (face-array) meshes: skip, see below
    geomUseCount.set(m.geometry.uuid, (geomUseCount.get(m.geometry.uuid) ?? 0) + 1);
  }

  const groups = new Map<string, THREE.Mesh[]>();
  const keyOf = (m: THREE.Mesh) => `${(m.material as THREE.Material).uuid}|${m.castShadow}|${m.receiveShadow}|${m.renderOrder}`;
  for (const m of allMeshes) {
    if (ctx.noMerge.has(m)) continue;
    if (Array.isArray(m.material)) continue; // per-face materials need grouped merge ranges; not worth the complexity here
    if (!m.parent) continue;
    const key = keyOf(m);
    const list = groups.get(key);
    if (list) list.push(m);
    else groups.set(key, [m]);
  }
  // An instanced mesh joins a group only if that yields two or more members; on its own it is
  // already one draw call, and expanding it would only cost memory.
  const instancedByKey = new Map<string, THREE.InstancedMesh[]>();
  for (const im of instanced) {
    const key = keyOf(im);
    const list = instancedByKey.get(key);
    if (list) list.push(im);
    else instancedByKey.set(key, [im]);
  }
  for (const [key, ims] of instancedByKey) {
    if ((groups.get(key)?.length ?? 0) + ims.length < 2) continue;
    const list = groups.get(key) ?? [];
    list.push(...ims);
    groups.set(key, list);
  }

  let merged = 0;
  let removed = 0;
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    await pacer?.tick();

    const baked: THREE.BufferGeometry[] = [];
    for (const m of group) {
      if ((m as THREE.InstancedMesh).isInstancedMesh) {
        baked.push(...expandInstances(m as THREE.InstancedMesh));
        continue;
      }
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

  console.log(`[batchStaticGeometry] ${allMeshes.length} meshes + ${instanced.length} instanced; ${shared} materials shared, ${atlased} atlased, ${tinted} tint-merged; merged ${removed} into ${merged} batches`);
}
