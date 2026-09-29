import * as THREE from 'three';

/**
 * The wake: a front that spreads from the Heart as a growing radius, shared by every patched
 * material. Each glows in a band as the front passes and keeps a residual emissive behind it, which
 * is the whole awake look. Height counts as extra distance, so ground lights before tree crowns.
 */
const shared = {
  uWakeOrigin: { value: new THREE.Vector3() },
  uWakeRadius: { value: -100 },
  uWakeFront: { value: new THREE.Color(0x7be0a0) },
};

export const wake = {
  origin: shared.uWakeOrigin.value,
  get radius(): number {
    return shared.uWakeRadius.value;
  },
  set radius(r: number) {
    shared.uWakeRadius.value = r;
  },
  /** Resets the front so nothing is lit. */
  reset(): void {
    shared.uWakeRadius.value = -100;
  },
  /** Moves the front past everything, leaving only the residual glow. */
  done(): void {
    shared.uWakeRadius.value = 1e5;
  },
};

/**
 * Adds the wake to a material. `residual` is the emissive radiance it keeps once the front has
 * passed; `front` scales the travelling band. Chains any patch already on the material.
 */
export function addWake(mat: THREE.MeshStandardMaterial, residual: THREE.Color, front = 1): void {
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey;
  const uWakeResidual = { value: residual };
  const uWakeGain = { value: front };
  mat.onBeforeCompile = (shader, renderer) => {
    prev.call(mat, shader, renderer);
    Object.assign(shader.uniforms, shared, { uWakeResidual, uWakeGain });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWakeWorld;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 wakeWorld = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wakeWorld = instanceMatrix * wakeWorld;
        #endif
        vWakeWorld = (modelMatrix * wakeWorld).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWakeWorld;
        uniform vec3 uWakeOrigin;
        uniform float uWakeRadius;
        uniform vec3 uWakeFront;
        uniform vec3 uWakeResidual;
        uniform float uWakeGain;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float wakeD = length(vWakeWorld.xz - uWakeOrigin.xz) + max(0.0, vWakeWorld.y - uWakeOrigin.y) * 1.4;
        float wakeBehind = 1.0 - smoothstep(uWakeRadius - 1.5, uWakeRadius, wakeD);
        float wakeBand = exp(-pow((wakeD - uWakeRadius) / 2.4, 2.0)) * step(0.0, uWakeRadius) * step(uWakeRadius, 9999.0);
        totalEmissiveRadiance += uWakeResidual * wakeBehind + uWakeFront * wakeBand * uWakeGain;`,
      );
  };
  mat.customProgramCacheKey = () => `${prevKey.call(mat)}|wake`;
  mat.needsUpdate = true;
}
