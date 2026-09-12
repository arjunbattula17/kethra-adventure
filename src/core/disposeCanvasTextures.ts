import * as THREE from 'three';

const MAP_SLOTS = [
  'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'lightMap',
] as const;

/**
 * Frees the GPU copies of a scene's procedural canvas textures on teardown.
 *
 * The interior and Kethra build ~130 CanvasTextures per construction (wall grime, console
 * screens, decals, the starfield-window star layers...), and scene dispose() only freed
 * geometry — so every ship<->planet round trip leaked the whole canvas set on the GPU:
 * measured 276 -> 432 -> 567 live textures across two returns to the ship (~170MB estimated
 * per leak at the interior's canvas sizes). Long sessions on shared-VRAM machines bled out.
 *
 * Only canvas-backed textures are touched, deliberately: file-backed kit textures are shared
 * with the persistent piece caches (src/ship/interior/kit.ts, src/planets/kethra/kit.ts) and
 * with clones three already refcounts per Source — canvases are the per-build population.
 * A module-cached canvas texture that survives teardown (e.g. a shared sprite) stays correct
 * either way: three re-uploads a disposed texture from its retained image on next use.
 */
export function disposeCanvasTextures(scene: THREE.Scene): void {
  scene.traverse((obj) => {
    const material = (obj as THREE.Mesh).material;
    const materials = Array.isArray(material) ? material : material ? [material] : [];
    for (const mat of materials) {
      for (const slot of MAP_SLOTS) {
        const tex = (mat as unknown as Record<string, THREE.Texture | undefined>)[slot];
        if (tex && typeof HTMLCanvasElement !== 'undefined' && tex.image instanceof HTMLCanvasElement) {
          tex.dispose();
        }
      }
    }
  });
}
