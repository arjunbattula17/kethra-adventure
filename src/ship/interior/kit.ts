import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Quaternius "Modular Sci-Fi MegaKit" (CC0) — see public/models/CREDITS.md. Every piece sits on a
// 4-unit horizontal grid; a full wall bay is WallBottom(0..3) + WallTop(3..5) stacked, giving a
// 5-unit wall height. Column_Simple/Round and Door_Frame_* also span the full 0..5 bay height.
export const KIT_TILE = 4;
export const KIT_WALL_H = 5;
export const KIT_WALL_SPLIT_Y = 3;

const CATEGORY_DIR: Record<string, string> = {
  Alien: 'Aliens',
  Column: 'Columns',
  Decal: 'Decals',
  Door: 'Platforms',
  Platform: 'Platforms',
  Prop: 'Props',
  BottomMetal: 'Walls',
  BottomSimple: 'Walls',
  ShortWall: 'Walls',
  TopAstra: 'Walls',
  TopCables: 'Walls',
  TopPlastic: 'Walls',
  TopSimple: 'Walls',
  TopWindow: 'Walls',
  WallAstra: 'Walls',
  WallBand: 'Walls',
  WallWindow: 'Walls',
};

function categoryFor(name: string): string {
  for (const prefix of Object.keys(CATEGORY_DIR)) {
    if (name.startsWith(prefix)) return CATEGORY_DIR[prefix];
  }
  throw new Error(`kit.ts: no category mapping for piece "${name}" — add one to CATEGORY_DIR`);
}

const KIT_BASE = `${import.meta.env.BASE_URL}models/quaternius/glTF`;
const TEXTURES_BASE = `${import.meta.env.BASE_URL}models/quaternius/Textures`;

// Every glTF in this kit references its textures as bare filenames ("T_Trim_01_BaseColor.png"),
// meant to sit next to the .gltf itself — but the source pack ships one shared Textures/ folder
// at the kit root instead, reused across all six category folders. Rather than duplicate ~24
// textures into every category directory, redirect any bare-filename PNG request GLTFLoader
// makes (relative to glTF/<Category>/) over to the shared folder. The .bin geometry buffer sits
// beside its .gltf as normal and is untouched by this rewrite.
//
// The pack's source PNGs are lossless 2048x2048 exports — 27MB for the 21 files, and the three ORM
// maps alone are 9.9MB — which the ship interior, the first scene of the game, pulls in on every
// first load. These were re-encoded to JPEG by tools/recompress-textures.mjs, which picks a quality
// per file against a measured mean-error budget and refuses any file JPEG would make bigger:
// 27MB -> 6.5MB across 16 files, checked by diffing rendered frames of the room before and after.
// The five left out are small, high-contrast masks and decal sheets that compress worse as JPEG than
// as PNG. Their bare-filename request is redirected to the .jpg sibling, the same way the nature
// kit's set works in src/planets/kethra/kit.ts.
const JPG_REENCODED = new Set([
  'T_PaddedWall_BaseColor.png', 'T_PaddedWall_Normal.png',
  'T_PaddedWall_ORM.png', 'T_Trim_01_BaseColor.png',
  'T_Trim_01_BaseColor_Red.png', 'T_Trim_01_Normal.png',
  'T_Trim_01_ORM.png', 'T_Trim_02_BaseColor.png',
  'T_Trim_02_BaseColor_Blue.png', 'T_Trim_02_BaseColor_Red.png',
  'T_Trim_02_Normal.png', 'T_Trim_02_ORM.png',
  'T_Trim_03_BaseColor.png', 'T_Trim_03_Cables.png',
  'T_Trim_03_Normal.png', 'T_Trim_03_ORM.png',
]);

const manager = new THREE.LoadingManager();
manager.setURLModifier((url) => {
  if (url.startsWith(KIT_BASE) && url.toLowerCase().endsWith('.png')) {
    let filename = url.slice(url.lastIndexOf('/') + 1);
    if (JPG_REENCODED.has(filename)) filename = `${filename.slice(0, -4)}.jpg`;
    return `${TEXTURES_BASE}/${filename}`;
  }
  return url;
});

const loader = new GLTFLoader(manager);
const cache = new Map<string, Promise<THREE.Object3D>>();

/**
 * Loads a kit piece by name (e.g. "WallAstra_Straight", "Platform_Simple", "Prop_Crate3") and
 * returns a fresh clone ready to add to the scene. The underlying glTF is fetched once and
 * cached; every call clones the result so instances don't share transforms, but materials and
 * geometry buffers are shared (cheap — this kit reuses a handful of trim materials across
 * hundreds of meshes).
 */
export async function kitPiece(name: string): Promise<THREE.Object3D> {
  let pending = cache.get(name);
  if (!pending) {
    const dir = categoryFor(name);
    const url = `${KIT_BASE}/${dir}/${name}.gltf`;
    pending = loader.loadAsync(url).then((gltf) => {
      const root = gltf.scene;
      root.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if ((mesh as THREE.Mesh).isMesh) {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
      });
      return root;
    });
    cache.set(name, pending);
  }
  const template = await pending;
  return template.clone(true);
}

/** Loads and places a kit piece in one call. Rotation is yaw only, in radians. */
export async function placeKitPiece(
  scene: THREE.Scene,
  name: string,
  position: THREE.Vector3 | [number, number, number],
  yaw = 0,
  scale = 1,
): Promise<THREE.Object3D> {
  const obj = await kitPiece(name);
  if (Array.isArray(position)) obj.position.set(...position);
  else obj.position.copy(position);
  obj.rotation.y = yaw;
  if (scale !== 1) obj.scale.setScalar(scale);
  scene.add(obj);
  return obj;
}

/** Preloads a batch of pieces in parallel — call up front for pieces a module will reuse a lot. */
export async function preloadKit(names: string[]): Promise<void> {
  await Promise.all(names.map((n) => kitPiece(n)));
}
