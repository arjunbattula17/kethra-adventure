import * as THREE from 'three';

const DIRECT_CALL = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';

/** The material define that selects the quick-to-compile lighting code (see applyShaderPatches). */
export const QUICK_LIGHTS = 'QUICK_LIGHTS';

type LightType = 'POINT' | 'SPOT' | 'DIR';

/**
 * When a quick program can use a real loop over a light type: no shadow maps or spot-light maps for
 * it, which are sampler arrays and need the constant index only an unrolled loop gives.
 */
const LOOP_OK: Record<LightType, string> = {
  POINT: '!( defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0 )',
  SPOT: '!( defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0 ) && NUM_SPOT_LIGHT_MAPS == 0',
  DIR: '!( defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0 )',
};

/** The section of lights_fragment_begin for one light type, from its #if to just before the next. */
function sectionBounds(chunk: string, type: LightType): [number, number] | null {
  const head = `#if ( NUM_${type}_LIGHTS > 0 ) && defined( RE_Direct )`;
  const start = chunk.indexOf(head);
  if (start < 0) return null;
  const end = chunk.indexOf('\n#if (', start + head.length);
  return end < 0 ? null : [start, end];
}

/**
 * The loop without three.js's unroll pragmas, and without the lines that exist only for shadows and
 * spot-light maps (compiled out wherever this version is used, and indexed by the unrolled index).
 */
function realLoop(section: string): string {
  const out: string[] = [];
  let skipping = 0;
  for (const line of section.split('\n')) {
    const t = line.trim();
    if (skipping) {
      if (t.startsWith('#if')) skipping++;
      else if (t.startsWith('#endif')) skipping--;
      continue;
    }
    if (t.startsWith('#if') && /UNROLLED_LOOP_INDEX|SPOT_LIGHT_MAP_INDEX/.test(t)) {
      skipping = 1;
      continue;
    }
    if (/^#(define|undef) SPOT_LIGHT_MAP_INDEX/.test(t) || t.startsWith('#pragma unroll_loop')) continue;
    out.push(line);
  }
  return out.join('\n');
}

/**
 * Two changes to three.js's direct-lighting code, both for integrated graphics.
 *
 * Point and spot lights skip the lighting maths where they cannot reach the pixel. three.js evaluates
 * every point and spot light at every lit pixel; beyond a light's `distance` its attenuation is exactly
 * zero, but the full physically based term (RE_Direct) still runs and adds zero. `directLight.visible`
 * is three.js's own "this light reaches here" flag, so only zero terms are skipped and the image is
 * unchanged. Without it the Wren's frame took 24% longer on an Intel UHD laptop, and Kethra's 62%
 * (Performance tier).
 *
 * A material with the QUICK_LIGHTS define lights each light type in a real loop instead of one unrolled
 * copy of the lighting code per light (where the program has no shadow maps or spot-light maps for that
 * type). Direct3D's shader compiler takes far longer over the unrolled copies: on that laptop the
 * Wren's programs took 27 s to compile cold, behind a 24 s intro, and 7.7 s as quick programs
 * (docs/perf/start-fix1, start-loops). Quick programs draw 6-16% slower, so a scene only starts on them
 * and moves to the unrolled ones once those have compiled in the background (Engine.upgradeQuickLights).
 *
 * Must run before the first shader is compiled; if a three.js upgrade changes the chunk, the patch
 * leaves it alone.
 */
export function applyShaderPatches(): void {
  let chunk = THREE.ShaderChunk.lights_fragment_begin;
  if (chunk.includes(QUICK_LIGHTS)) return;
  for (const type of ['POINT', 'SPOT', 'DIR'] as const) {
    const bounds = sectionBounds(chunk, type);
    if (!bounds) return;
    let section = chunk.slice(bounds[0], bounds[1]);
    if (!section.includes(DIRECT_CALL)) return;
    // Directional lights reach everything; only point and spot lights get the reach test.
    if (type !== 'DIR') section = section.split(DIRECT_CALL).join(`if ( directLight.visible ) ${DIRECT_CALL}`);
    // The section is `#if (...)\n <body> \n#endif`: keep the outer test, choose the body inside it.
    const open = section.indexOf('\n');
    const close = section.lastIndexOf('#endif');
    if (open < 0 || close < open) return;
    const head = section.slice(0, open);
    const body = section.slice(open + 1, close);
    const patched = `${head}\n#if defined( ${QUICK_LIGHTS} ) && ${LOOP_OK[type]}\n${realLoop(body)}\n#else\n${body}\n#endif\n${section.slice(close)}`;
    chunk = chunk.slice(0, bounds[0]) + patched + chunk.slice(bounds[1]);
  }
  THREE.ShaderChunk.lights_fragment_begin = chunk;
}

/** Whether a material's shader lights with lights_fragment_begin (and so can take QUICK_LIGHTS). */
export function isLit(material: THREE.Material): boolean {
  const m = material as THREE.Material & Record<string, unknown>;
  return !!(m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshToonMaterial);
}

export function hasQuickLights(material: THREE.Material): boolean {
  return (material as THREE.MeshStandardMaterial).defines?.[QUICK_LIGHTS] !== undefined;
}

/** Switches a lit material between its quick and its unrolled lighting program. */
export function setQuickLights(material: THREE.Material, on: boolean): void {
  const m = material as THREE.MeshStandardMaterial;
  if (on === hasQuickLights(m)) return;
  const defines: Record<string, unknown> = { ...(m.defines ?? {}) };
  if (on) defines[QUICK_LIGHTS] = '';
  else delete defines[QUICK_LIGHTS];
  m.defines = defines;
  m.needsUpdate = true;
}
