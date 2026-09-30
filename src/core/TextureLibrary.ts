import * as THREE from 'three';
import { decodeImageFile, imagesArriveFlipped, textureMaxSize } from './textureCache';

interface CachedMap {
  texture: THREE.Texture;
  arrived: boolean;
  ready: Promise<void>;
}

const cache = new Map<string, CachedMap>();
const loads: Promise<void>[] = [];

/**
 * Resolves once every map requested so far has arrived (or failed). Scenes await it at the end of
 * init(), so these images are decoded and uploaded in the engine's warm-up frame behind the loading
 * cover, not in whichever frame of play they happened to arrive in.
 */
export function pbrTexturesReady(): Promise<void> {
  return Promise.all(loads).then(() => undefined);
}

/**
 * One map, fetched once per URL and size ceiling. Its image is decoded off the page's thread and shrunk
 * to the quality tier's ceiling, as the kits' maps are (textureCache.ts). Loaded as an <img>, the
 * ship_wall set stayed 2048x2048 on Performance (64 MB on the GPU, kept for the session once Vessek
 * had used it) and was decoded on the page's thread during its first upload.
 */
function load(url: string, srgb: boolean): CachedMap {
  const key = `${textureMaxSize()}|${url}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const texture = new THREE.Texture();
  texture.name = url.split('/').slice(-2).join('/');
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  texture.flipY = !imagesArriveFlipped();
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  const entry: CachedMap = { texture, arrived: false, ready: Promise.resolve() };
  entry.ready = decodeImageFile(url).then(
    (image) => {
      texture.image = image;
      texture.needsUpdate = true;
      entry.arrived = true;
    },
    // A map that fails to load leaves its material untextured rather than stopping the build.
    () => {},
  );
  loads.push(entry.ready);
  cache.set(key, entry);
  return entry;
}

export interface PbrMaps {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
}

const BASE = `${import.meta.env.BASE_URL}textures`;

export type PbrTextureName =
  | 'metal_plate'
  | 'metal_plate_02'
  | 'lichen_rock'
  | 'bark_willow'
  | 'ship_wall'
  | 'ship_floor'
  | 'ship_console'
  | 'ship_trim';

/**
 * A copy of a cached map with its own repeat. Copies share the image (and one upload), and each is
 * flagged for upload once the image is there: flagged before, a copy uploads nothing and stays black.
 */
function copyOf(entry: CachedMap, repeat: [number, number]): THREE.Texture {
  const tex = entry.texture.clone();
  tex.repeat.set(repeat[0], repeat[1]);
  if (entry.arrived) tex.needsUpdate = true;
  else void entry.ready.then(() => (tex.needsUpdate = true));
  return tex;
}

export function loadPbr(name: PbrTextureName, repeat: [number, number] = [1, 1]): PbrMaps {
  const dir = `${BASE}/${name}`;
  // A copy per call: .repeat is per-texture, and sharing the cached one would make the last caller's
  // tiling win for every mesh using the same image.
  return {
    map: copyOf(load(`${dir}/diff.jpg`, true), repeat),
    normalMap: copyOf(load(`${dir}/nor_gl.jpg`, false), repeat),
    roughnessMap: copyOf(load(`${dir}/rough.jpg`, false), repeat),
  };
}

export function applyPbr(material: THREE.MeshStandardMaterial, name: PbrTextureName, repeat: [number, number] = [1, 1]): void {
  const maps = loadPbr(name, repeat);
  material.map = maps.map;
  material.normalMap = maps.normalMap;
  material.roughnessMap = maps.roughnessMap;
  material.needsUpdate = true;
}
