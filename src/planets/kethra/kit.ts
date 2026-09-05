import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Quaternius "Stylized Nature MegaKit" (CC0) — see public/models/CREDITS.md. Unlike the ship's
// sci-fi kit, these pieces are organic and don't sit on any grid; every placement below is sized
// from real accessor bounds inspected per-species (trees run ~7-9 units tall for the Common/Pine
// families, ~15-19 for TwistedTree, which is a hero/landmark tree, not a fill tree).
const KIT_BASE = `${import.meta.env.BASE_URL}models/quaternius-nature/glTF`;
const TEXTURES_BASE = `${import.meta.env.BASE_URL}models/quaternius-nature/Textures`;

// Every glTF here references its textures as bare filenames, meant to sit beside the .gltf, but
// the pack ships one shared Textures/ folder instead (same layout quirk as the ship's sci-fi kit
// in src/ship/interior/kit.ts) — redirect any bare PNG request GLTFLoader makes for a file under
// glTF/ over to the shared folder. The .bin buffer sits beside its .gltf as normal and is untouched.
//
// The pack's source PNGs are lossless exports of photographic bark/rock maps with no alpha in
// use — 2-5MB apiece for no visual gain over a quality-85 JPEG. These ten were re-encoded to
// .jpg (see public/models/CREDITS.md), so their bare-filename request also gets redirected to
// the .jpg sibling instead of the (now deleted) .png.
const JPG_REENCODED = new Set([
  'Bark_DeadTree.png', 'Bark_DeadTree_Normal.png',
  'Bark_NormalTree.png', 'Bark_NormalTree_Normal.png',
  'Bark_TwistedTree.png', 'Bark_TwistedTree_Normal.png',
  'Mushrooms.png', 'PathRocks_Diffuse.png', 'Rocks_Desert_Diffuse.png', 'Rocks_Diffuse.png',
]);
const manager = new THREE.LoadingManager();
manager.setURLModifier((url) => {
  if (url.startsWith(KIT_BASE) && url.toLowerCase().endsWith('.png')) {
    let filename = url.slice(url.lastIndexOf('/') + 1);
    if (JPG_REENCODED.has(filename)) filename = filename.slice(0, -4) + '.jpg';
    return `${TEXTURES_BASE}/${filename}`;
  }
  return url;
});

const loader = new GLTFLoader(manager);

export interface KitPrimitive {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
}

const templateCache = new Map<string, Promise<KitPrimitive[]>>();

// Every piece in this kit is a single node with 1-2 mesh primitives (trunk + canopy for trees,
// one primitive for rocks/grass/etc.) and no node-level transform, so raw accessor-space geometry
// is already in real-world local units — no baking needed before reuse across instances.
function loadTemplate(name: string): Promise<KitPrimitive[]> {
  let pending = templateCache.get(name);
  if (!pending) {
    const url = `${KIT_BASE}/${name}.gltf`;
    pending = loader.loadAsync(url).then((gltf) => {
      const prims: KitPrimitive[] = [];
      gltf.scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry.computeBoundingBox();
          prims.push({ geometry: mesh.geometry, material: mesh.material as THREE.MeshStandardMaterial });
        }
      });
      return prims;
    });
    templateCache.set(name, pending);
  }
  return pending;
}

export interface KitInstanceSpec {
  position: THREE.Vector3;
  yaw?: number;
  scale?: number;
}

const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const tmpAxis = new THREE.Vector3(0, 1, 0);

/**
 * Builds one THREE.InstancedMesh per primitive of `name` (trunk + canopy for a tree, one mesh
 * for a rock/grass/etc.), each holding every instance in `instances`. This is the only piece
 * placement path — even a "one-off" placement is just an InstancedMesh of length 1 — so nothing
 * in the scene ever falls back to a per-instance THREE.Mesh loop for a repeated kit piece.
 * Materials are cloned per call (not shared with the cached template) so a caller is free to
 * retint what it gets back — e.g. Kethra's canopy dim/bright toggle recolors the returned leaf
 * material directly.
 */
export async function buildInstancedKit(
  scene: THREE.Scene,
  name: string,
  instances: KitInstanceSpec[],
): Promise<THREE.InstancedMesh[]> {
  const prims = await loadTemplate(name);
  const meshes: THREE.InstancedMesh[] = [];
  for (const prim of prims) {
    const material = prim.material.clone();
    const inst = new THREE.InstancedMesh(prim.geometry, material, instances.length);
    inst.castShadow = true;
    inst.receiveShadow = true;
    // InstancedMesh's default bounding sphere comes from the base (untransformed) geometry alone
    // and doesn't grow to cover scattered instance positions until computeBoundingSphere() is
    // called post-population — skipping frustum culling here is cheaper than getting that wrong
    // and popping trees at the edge of view.
    inst.frustumCulled = false;
    instances.forEach((spec, i) => {
      const s = spec.scale ?? 1;
      tmpQuat.setFromAxisAngle(tmpAxis, spec.yaw ?? 0);
      tmpScale.set(s, s, s);
      tmpMatrix.compose(spec.position, tmpQuat, tmpScale);
      inst.setMatrixAt(i, tmpMatrix);
    });
    inst.instanceMatrix.needsUpdate = true;
    scene.add(inst);
    meshes.push(inst);
  }
  return meshes;
}

/**
 * World-space Box3 for one instance of a kit piece's first (trunk/base) primitive — used to build
 * accurate player colliders from real geometry instead of guessed radii, since this kit's organic
 * shapes (especially the sprawling TwistedTree trunks) don't fit a uniform hand-picked box.
 */
export async function kitInstanceBox(name: string, position: THREE.Vector3, yaw = 0, scale = 1): Promise<THREE.Box3> {
  const prims = await loadTemplate(name);
  const box = prims[0].geometry.boundingBox!.clone();
  tmpQuat.setFromAxisAngle(tmpAxis, yaw);
  tmpScale.set(scale, scale, scale);
  tmpMatrix.compose(position, tmpQuat, tmpScale);
  box.applyMatrix4(tmpMatrix);
  return box;
}

/** Accumulates instance placements per kit piece name so repeated species used across many
 * separate call sites (e.g. the same rock scattered across several clutter zones) still end up
 * as one InstancedMesh per piece instead of one per call site. */
export class KitBatcher {
  private buckets = new Map<string, KitInstanceSpec[]>();

  add(name: string, spec: KitInstanceSpec): void {
    let bucket = this.buckets.get(name);
    if (!bucket) {
      bucket = [];
      this.buckets.set(name, bucket);
    }
    bucket.push(spec);
  }

  async flush(scene: THREE.Scene): Promise<Map<string, THREE.InstancedMesh[]>> {
    const results = new Map<string, THREE.InstancedMesh[]>();
    await Promise.all(
      Array.from(this.buckets.entries()).map(async ([name, specs]) => {
        results.set(name, await buildInstancedKit(scene, name, specs));
      }),
    );
    return results;
  }
}

export function jitter(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
