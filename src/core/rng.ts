/**
 * Seeded pseudo-randomness for procedural generation.
 *
 * Anything that feeds the rendered frame — canvas texture generation, scatter placement, animation
 * phases, flicker — needs to be reproducible, or the scene is a different sample on every page load
 * and no visual change can be verified by comparing frames. Before this, two captures of an
 * unchanged build differed by ~8/255, which is well above the difference a real asset regression
 * would produce, so a render diff could not tell the two apart.
 *
 * mulberry32 is the generator src/planets/kethra/kit.ts and the already-seeded interior texture
 * modules use, kept here so there is one copy rather than one per file.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Folds a builder's label or variant argument into its seed, so two calls that are meant to look
 * different still do — a seed fixed per function alone would make every variant of a texture an
 * identical copy.
 */
export function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
