import * as THREE from 'three';

const MAP_SLOTS = [
  'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'lightMap',
] as const;

/**
 * Frees the GPU resources a scene instance owns exclusively, on teardown.
 *
 * Two populations, both measured leaking before this existed:
 *
 * Procedural canvas textures — the interior and Kethra build ~130 CanvasTextures per
 * construction (wall grime, console screens, decals, the starfield-window star layers...), and
 * scene dispose() only freed geometry: every ship<->planet round trip leaked the whole canvas
 * set (276 -> 432 -> 567 live textures across two returns, ~170MB estimated per leak). Only
 * canvas-backed textures are touched, deliberately: file-backed kit textures are shared with
 * the persistent piece caches and with clones three refcounts per Source — canvases are the
 * per-build population. A module-cached canvas texture that survives teardown stays correct
 * either way: three re-uploads a disposed texture from its retained image on next use.
 *
 * Shadow maps — every shadow-casting light allocates a render target on first render
 * (Kethra's moon runs 2048x2048, ~16MB) that nothing ever freed, leaking one set per scene
 * visit. LightShadow.dispose() releases it; three lazily re-allocates if the same light ever
 * renders again.
 */
export function disposeSceneTextures(scene: THREE.Scene): void {
  scene.traverse((obj) => {
    const light = obj as THREE.Light & { shadow?: THREE.LightShadow };
    if (light.isLight && light.shadow) light.shadow.dispose();
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

/**
 * Halves oversized procedural canvas textures in place, for the low quality tier — the same
 * budget the texture cache applies to the kits' file textures (2048 -> 1024), extended to the
 * generated population, which is the interior's remaining ~170MB. Redrawing the canvas at half
 * size before first upload quarters the GPU footprint; the original canvas is dropped for GC.
 * Call after a scene finishes building, before it first renders.
 */
export function downscaleCanvasTextures(scene: THREE.Scene, maxSize: number): void {
  const shrunk = new Map<HTMLCanvasElement, HTMLCanvasElement>();
  scene.traverse((obj) => {
    const material = (obj as THREE.Mesh).material;
    const materials = Array.isArray(material) ? material : material ? [material] : [];
    for (const mat of materials) {
      for (const slot of MAP_SLOTS) {
        const tex = (mat as unknown as Record<string, THREE.Texture | undefined>)[slot];
        const image = tex?.image;
        if (!tex || typeof HTMLCanvasElement === 'undefined' || !(image instanceof HTMLCanvasElement)) continue;
        if (image.width <= maxSize && image.height <= maxSize) continue;
        // Canvases are shared across textures (a map and its emissiveMap, repeated decals) —
        // shrink each source canvas once and point every user at the same replacement.
        let small = shrunk.get(image);
        if (!small) {
          const scale = maxSize / Math.max(image.width, image.height);
          small = document.createElement('canvas');
          small.width = Math.max(1, Math.round(image.width * scale));
          small.height = Math.max(1, Math.round(image.height * scale));
          small.getContext('2d')!.drawImage(image, 0, 0, small.width, small.height);
          shrunk.set(image, small);
        }
        tex.image = small;
        tex.needsUpdate = true;
      }
    }
  });
}
