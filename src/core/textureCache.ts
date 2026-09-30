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

// Ceiling on kit texture dimensions, set by Engine from the quality tier before any scene loads.
// The kits ship 2048x2048 maps (~21MB each on the GPU); on the low tier — old integrated GPUs
// with 2-4GB of *shared* memory — halving them to 1024 cuts the two kits' texture memory by ~75%
// (interior ~344MB -> ~100MB estimated) and halves decode+upload work during scene loads, for a
// softness cost that at this game's wall/prop viewing distances sits below the resolution the low
// tier renders at anyway. The cache key includes the active ceiling, so a later manual switch to
// a higher tier reloads fresh full-size copies instead of serving the downscaled ones.
let maxTextureSize = Infinity;
export function setKitTextureMaxSize(px: number): void {
  maxTextureSize = px;
}

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

/**
 * Width and height from a PNG or JPEG header, without decoding. Null for anything else (the caller
 * then decodes at full size and resizes after, the slow way).
 */
async function imageSize(blob: Blob): Promise<{ width: number; height: number } | null> {
  const bytes = new Uint8Array(await blob.slice(0, 65536).arrayBuffer());
  const view = new DataView(bytes.buffer);
  // PNG: signature, then the IHDR chunk, whose data starts with width and height.
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  // JPEG: walk the marker segments to the first start-of-frame, which holds the dimensions.
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let at = 2;
    while (at + 9 < bytes.length) {
      if (bytes[at] !== 0xff) return null;
      const marker = bytes[at + 1];
      if (marker === 0xff) {
        at++;
        continue;
      }
      const length = view.getUint16(at + 2);
      const startOfFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (startOfFrame) return { height: view.getUint16(at + 5), width: view.getUint16(at + 7) };
      at += 2 + length;
    }
  }
  return null;
}

/**
 * Fetches and decodes one image as an ImageBitmap, shrunk to the tier's ceiling (maxTextureSize)
 * in the same call where it is oversized. The browser decodes an ImageBitmap from a Blob off the
 * main thread, resize included. Resizing an already-decoded 2048x2048 bitmap afterwards (the old
 * route) ran on the main thread: 0.5 s of the Wren's first build on an Intel UHD laptop
 * (docs/PERF_LOG.md, 2026-09-28). Same options as three.js's ImageBitmapLoader.
 */
async function decodeBitmap(manager: THREE.LoadingManager, url: string): Promise<ImageBitmap> {
  manager.itemStart(url);
  try {
    const response = await fetch(url, { credentials: 'same-origin' });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    const blob = await response.blob();
    const options: ImageBitmapOptions = { premultiplyAlpha: 'none', colorSpaceConversion: 'none' };
    let bitmap: ImageBitmap;
    const size = Number.isFinite(maxTextureSize) ? await imageSize(blob) : null;
    if (size && (size.width > maxTextureSize || size.height > maxTextureSize)) {
      const scale = maxTextureSize / Math.max(size.width, size.height);
      bitmap = await createImageBitmap(blob, {
        ...options,
        resizeWidth: Math.round(size.width * scale),
        resizeHeight: Math.round(size.height * scale),
        resizeQuality: 'high',
      });
    } else {
      bitmap = await createImageBitmap(blob, options);
      // A format whose header this can't read: shrink after decoding, as before.
      if (bitmap.width > maxTextureSize || bitmap.height > maxTextureSize) {
        const scale = maxTextureSize / Math.max(bitmap.width, bitmap.height);
        const small = await createImageBitmap(bitmap, {
          resizeWidth: Math.round(bitmap.width * scale),
          resizeHeight: Math.round(bitmap.height * scale),
          resizeQuality: 'high',
        });
        bitmap.close();
        bitmap = small;
      }
    }
    manager.itemEnd(url);
    return bitmap;
  } catch (err) {
    manager.itemError(url);
    manager.itemEnd(url);
    throw err;
  }
}

function loadTextureOnce(manager: THREE.LoadingManager, resolved: string): Promise<THREE.Texture> {
  if (!decodesOffThread()) return new THREE.TextureLoader(manager).loadAsync(resolved);
  // Downscaling oversized kit maps at decode time on constrained tiers (see maxTextureSize above)
  // happens only on this ImageBitmap path: the TextureLoader fallback serves the rare old
  // Safari/Firefox engines, which aren't the shared-VRAM low-end this targets.
  return decodeBitmap(manager, resolved).then((bitmap) => {
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
    // The size ceiling joins the key so a tier change mid-session refetches at the new size rather
    // than serving copies decoded under the old one.
    const resolved = this.manager.resolveURL(url);
    const cacheKey = `${maxTextureSize}|${resolved}`;
    let pending = inFlight.get(cacheKey);
    if (!pending) {
      pending = loadTextureOnce(this.manager, resolved);
      inFlight.set(cacheKey, pending);
    }
    pending
      .then((base) => {
        const texture = base.clone();
        texture.needsUpdate = true;
        onLoad(texture);
      })
      .catch((err) => {
        // Drop the rejected entry so a later attempt can retry rather than replaying the failure.
        inFlight.delete(cacheKey);
        onError?.(err);
      });
  }
}

/** Routes this manager's image requests through the shared cache. */
export function cacheTexturesFor(manager: THREE.LoadingManager): void {
  manager.addHandler(/\.(png|jpe?g|webp)$/i, new SharedTextureLoader(manager));
}
