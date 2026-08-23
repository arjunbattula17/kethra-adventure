import * as THREE from 'three';

const loader = new THREE.TextureLoader();
const cache = new Map<string, THREE.Texture>();

function load(url: string, srgb: boolean): THREE.Texture {
  const cached = cache.get(url);
  if (cached) return cached;
  const tex = loader.load(url);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(url, tex);
  return tex;
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

// .clone() copies a reference to the same underlying <img>, not the pixel data itself. If that
// image hasn't finished loading yet, flagging the clone needsUpdate immediately uploads nothing
// (silently — the clone never gets its own load-completion callback the way the original
// THREE.TextureLoader-returned texture does), leaving the material permanently untextured/black
// even once the image finishes loading moments later. Only flag immediately once real pixel
// data exists; otherwise wait for the shared image's own load event.
function markUpdateWhenReady(tex: THREE.Texture): void {
  const img = tex.image as HTMLImageElement | undefined;
  if (img && img.complete && img.naturalWidth > 0) {
    tex.needsUpdate = true;
  } else if (img) {
    img.addEventListener('load', () => { tex.needsUpdate = true; }, { once: true });
  }
}

export function loadPbr(name: PbrTextureName, repeat: [number, number] = [1, 1]): PbrMaps {
  const dir = `${BASE}/${name}`;
  // Clone per call: textures are cached by URL, but .repeat is per-instance state that
  // callers set independently — sharing the cached instance would make the last caller's
  // tiling silently win for every other mesh using this same source texture.
  const map = load(`${dir}/diff.jpg`, true).clone();
  const normalMap = load(`${dir}/nor_gl.jpg`, false).clone();
  const roughnessMap = load(`${dir}/rough.jpg`, false).clone();
  for (const tex of [map, normalMap, roughnessMap]) {
    tex.repeat.set(repeat[0], repeat[1]);
    markUpdateWhenReady(tex);
  }
  return { map, normalMap, roughnessMap };
}

export function applyPbr(material: THREE.MeshStandardMaterial, name: PbrTextureName, repeat: [number, number] = [1, 1]): void {
  const maps = loadPbr(name, repeat);
  material.map = maps.map;
  material.normalMap = maps.normalMap;
  material.roughnessMap = maps.roughnessMap;
  material.needsUpdate = true;
}
