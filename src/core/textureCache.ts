import * as THREE from 'three';

/**
 * Fetches each texture file once per URL, without relying on THREE.Cache.
 *
 * The global cache looks like the obvious answer — the sci-fi and nature kits both share one
 * Textures/ folder across many pieces, and without deduping, one boot fetched T_Trim_01_ORM six
 * times — but turning it on silently corrupts textures. GLTFLoader prefers ImageBitmapLoader
 * wherever createImageBitmap exists, and ImageBitmapLoader caches the *tail* of its own promise
 * chain (`Cache.add('image-bitmap:' + url, promise)` in three.core.js), which resolves to undefined
 * rather than to the bitmap. A second, concurrent request for the same file therefore takes the
 * cache path and calls back with undefined, and GLTFLoader turns that into `new Texture(undefined)`.
 * Measured with tools/texture-integrity.mjs: 34 of 469 texture slots dead in the ship interior and
 * 75 of 161 in the grove, with the renderer logging "no image data found" thousands of times a
 * second for as long as the scene stayed open. ImageLoader gets this right — it queues concurrent
 * callers against the in-flight element — so the defect only shows on the ImageBitmap path.
 *
 * Deduping here instead sidesteps it. Registered as a LoadingManager handler, which GLTFLoader
 * consults before falling back to its own loader, so it covers the textures a glTF pulls in.
 * Callers each get a clone: GLTFLoader writes per-sampler settings (flipY, wrap, filters) onto the
 * texture it is handed, and sharing one instance across pieces would let one piece's sampler
 * silently overwrite another's. A clone shares the underlying Source, so the image is still fetched
 * and decoded once.
 */
const inFlight = new Map<string, Promise<THREE.Texture>>();

/**
 * Mirrors GLTFLoader's own choice of image loader. ImageBitmapLoader decodes off the main thread;
 * TextureLoader decodes on it. Routing everything through TextureLoader instead cost 11 seconds of
 * boot and 1.6 s of extra main-thread blocking on this scene's 6 MB of JPEGs, so the fallback is
 * only for the engines GLTFLoader itself will not use ImageBitmapLoader on.
 */
function decodesOffThread(): boolean {
  if (typeof createImageBitmap === 'undefined') return false;
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const safari = /^((?!chrome|android).)*safari/i.test(ua);
  if (safari) {
    const v = ua.match(/Version\/(\d+)/);
    if (!v || Number(v[1]) < 17) return false;
  }
  const firefox = ua.indexOf('Firefox') > -1;
  if (firefox) {
    const v = ua.match(/Firefox\/(\d+)\./);
    if (!v || Number(v[1]) < 98) return false;
  }
  return true;
}

function loadTextureOnce(manager: THREE.LoadingManager, resolved: string): Promise<THREE.Texture> {
  if (!decodesOffThread()) return new THREE.TextureLoader(manager).loadAsync(resolved);
  // THREE.Cache is off, so ImageBitmapLoader never takes its own broken cache path; the dedupe is
  // the inFlight map below.
  return new THREE.ImageBitmapLoader(manager).loadAsync(resolved).then((bitmap) => {
    const texture = new THREE.Texture(bitmap as unknown as HTMLImageElement);
    texture.needsUpdate = true;
    return texture;
  });
}

class SharedTextureLoader extends THREE.Loader<THREE.Texture> {
  load(
    url: string,
    onLoad: (texture: THREE.Texture) => void,
    _onProgress?: (event: ProgressEvent) => void,
    onError?: (err: unknown) => void,
  ): void {
    // The manager's URL modifier is what redirects a glTF's bare filename to the shared folder and
    // to the .jpg sibling, so the cache has to be keyed on the resolved URL, not the requested one.
    const resolved = this.manager.resolveURL(url);
    let pending = inFlight.get(resolved);
    if (!pending) {
      pending = loadTextureOnce(this.manager, resolved);
      inFlight.set(resolved, pending);
    }
    pending
      .then((base) => {
        const texture = base.clone();
        texture.needsUpdate = true;
        onLoad(texture);
      })
      .catch((err) => {
        // Drop the rejected entry so a later attempt can retry rather than replaying the failure.
        inFlight.delete(resolved);
        onError?.(err);
      });
  }
}

/** Routes this manager's image requests through the shared cache. */
export function cacheTexturesFor(manager: THREE.LoadingManager): void {
  manager.addHandler(/\.(png|jpe?g|webp)$/i, new SharedTextureLoader(manager));
}
