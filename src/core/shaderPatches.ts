import * as THREE from 'three';

const DIRECT_CALL = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';

/**
 * Skips the lighting maths for point and spot lights that cannot reach the pixel being shaded.
 *
 * three.js evaluates every point and spot light at every lit pixel. Beyond a light's `distance` its
 * attenuation is exactly zero, but the full physically based lighting term (RE_Direct) still runs and
 * adds zero. The rooms here use many short-range lights (the Wren keeps 16 lights, each reaching
 * 4 to 9.5 units, in a 12 by 16 room), so most of that work is wasted, and on integrated graphics the
 * ship's frame time is set by exactly this per-pixel cost (docs/PERF_LOG.md, 2026-09-27). The guard
 * below only skips a term whose contribution is zero, so the image is unchanged.
 *
 * `directLight.visible` is three.js's own "this light reaches here" flag, set by getPointLightInfo
 * and getSpotLightInfo. Directional lights are left alone: they reach everything. Must run before
 * the first shader is compiled; if a three.js upgrade changes the chunk, the patch does nothing.
 */
export function applyShaderPatches(): void {
  const chunk = THREE.ShaderChunk.lights_fragment_begin;
  const pointStart = chunk.indexOf('#if ( NUM_POINT_LIGHTS > 0 )');
  const dirStart = chunk.indexOf('#if ( NUM_DIR_LIGHTS > 0 )');
  if (pointStart < 0 || dirStart < pointStart || chunk.includes(`if ( directLight.visible ) ${DIRECT_CALL}`)) return;
  const pointAndSpot = chunk.slice(pointStart, dirStart);
  if (!pointAndSpot.includes(DIRECT_CALL)) return;
  THREE.ShaderChunk.lights_fragment_begin =
    chunk.slice(0, pointStart) + pointAndSpot.split(DIRECT_CALL).join(`if ( directLight.visible ) ${DIRECT_CALL}`) + chunk.slice(dirStart);
}
