import type * as THREE from 'three';

/**
 * What the scenes on hand use: the current one and any being prepared. A cache only frees what isn't
 * in here.
 */
export interface InUse {
  geometries: ReadonlySet<THREE.BufferGeometry>;
  /** Texture images (ImageBitmap, canvas, image), by identity. */
  images: ReadonlySet<unknown>;
}

type Releaser = (inUse: InUse) => void;
const releasers: Releaser[] = [];

/**
 * Registers a cache that keeps a level's assets for a later visit (decoded maps, kit templates), to
 * be emptied when the hub comes back on screen (Engine.releaseLevelCaches). A later visit loads them
 * again from the browser's HTTP cache while it prepares. Kept for the session, Kethra's and Vessek's
 * caches held ~150-250 MB of a 4 GB laptop's memory aboard the Wren for nothing.
 */
export function registerLevelCache(release: Releaser): void {
  releasers.push(release);
}

export function releaseLevelCaches(inUse: InUse): void {
  for (const release of releasers) {
    try {
      release(inUse);
    } catch (err) {
      console.warn('[levelCaches] a cache failed to release', err);
    }
  }
}

/** Frees an image's decoded pixels now rather than at the next garbage collection. */
export function closeImage(image: unknown): void {
  if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) image.close();
}
