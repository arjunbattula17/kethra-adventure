import * as THREE from 'three';

/**
 * Paints a deterministic procedural texture (or a set of them) once per key, and hands every caller
 * its own clone. A clone shares the painted canvas's Source, so three.js uploads it to the GPU once,
 * while repeat, offset and wrap stay per-caller.
 *
 * Measured by tools/texture-audit.mjs: the ship interior was painting 61 pixel-identical canvases,
 * one per placement of the same wall plate, grime overlay or hazard stripe, and uploading each one
 * separately (43.6MB of duplicate GPU memory, plus the time to paint them during the build).
 *
 * Only for builders whose pixels depend on nothing but their key. Animated canvases (screens that
 * repaint) must not come through here: every clone would show the same frame.
 */
const painted = new Map<string, object>();

function cloneTexture<T extends THREE.Texture>(tex: T): T {
  const copy = tex.clone() as T;
  // A CanvasTexture clone starts at version 1 (its constructor flags an upload); a plain Texture
  // clone would start at 0, which three treats as "nothing to upload yet".
  if (copy.version === 0) copy.needsUpdate = true;
  return copy;
}

export function memoTexture<T extends THREE.Texture>(key: string, paint: () => T): T {
  let tex = painted.get(key) as T | undefined;
  if (!tex) {
    tex = paint();
    painted.set(key, tex);
  }
  return cloneTexture(tex);
}

/** The same, for a builder that returns several maps painted together (albedo, normal, ORM). */
export function memoTextureSet<T extends object>(key: string, paint: () => T): T {
  let set = painted.get(key) as T | undefined;
  if (!set) {
    set = paint();
    painted.set(key, set);
  }
  const copy = {} as Record<string, unknown>;
  for (const [name, value] of Object.entries(set)) {
    copy[name] = (value as THREE.Texture)?.isTexture ? cloneTexture(value as THREE.Texture) : value;
  }
  return copy as T;
}

/** Drops the painted canvases so a torn-down scene doesn't keep them alive in memory. */
export function clearMemoTextures(): void {
  painted.clear();
}
