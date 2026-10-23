import * as THREE from 'three';
import { mulberry32 } from '../../core/rng';

/**
 * Sparks on the right of the picture, after the reference: tiny warm motes (ice and grit catching the
 * light) drifting slowly up and to the left through the rocks, each flaring now and then. One Points
 * draw, moved entirely on the GPU: every mote has its own drift, wraps inside a box, fades at the box's
 * faces, and twinkles at its own rate.
 */

const VERTEX = /* glsl */ `
  attribute vec4 aSeed;
  uniform float uTime;
  uniform vec3 uBoxMin;
  uniform vec3 uBoxSize;
  uniform float uPixelRatio;
  varying float vAlpha;
  varying float vWarm;
  void main() {
    vec3 drift = vec3(-0.06 - 0.1 * aSeed.x, 0.05 + 0.08 * aSeed.y, 0.02 * (aSeed.z - 0.5));
    // A slow curl on top, so no two drift in quite straight lines.
    vec3 curl = vec3(sin(uTime * 0.21 + aSeed.w * 30.0), cos(uTime * 0.17 + aSeed.z * 20.0), 0.0) * 0.12;
    vec3 p = mod(position + drift * uTime + curl - uBoxMin, uBoxSize) + uBoxMin;
    vec3 e = min(p - uBoxMin, uBoxMin + uBoxSize - p) / uBoxSize;
    float edge = smoothstep(0.0, 0.15, min(min(e.x, e.y), e.z));
    // Each mote flares for a moment every 5-12 s, and glows faintly between.
    float period = 5.0 + 7.0 * aSeed.y;
    float c = fract(uTime / period + aSeed.w);
    // Squared by hand: pow() of a negative base is NaN on Direct3D.
    float fd = (c - 0.5) / 0.05;
    float flare = exp(-fd * fd);
    vec4 mv = viewMatrix * vec4(p, 1.0);
    float dist = -mv.z;
    vAlpha = edge * (0.18 + 0.82 * flare) * (0.5 + 0.5 * aSeed.x);
    vWarm = aSeed.z;
    gl_PointSize = clamp((26.0 + 30.0 * aSeed.x) / dist, 1.0, 5.0) * uPixelRatio;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uIntensity;
  varying float vAlpha;
  varying float vWarm;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float k = exp(-r * r * 5.0) * smoothstep(1.0, 0.6, r);
    vec3 col = mix(vec3(1.0, 0.55, 0.2), vec3(1.0, 0.78, 0.45), vWarm);
    gl_FragColor = vec4(col * k * vAlpha * uIntensity * 2.2, 1.0);
  }
`;

export interface Embers {
  points: THREE.Points;
  update(elapsed: number): void;
  setIntensity(k: number): void;
  dispose(): void;
}

export function buildEmbers(o: { count: number; boxMin: THREE.Vector3; boxSize: THREE.Vector3; seed: number }): Embers {
  const rand = mulberry32(o.seed);
  const pos = new Float32Array(o.count * 3);
  const seed = new Float32Array(o.count * 4);
  for (let i = 0; i < o.count; i++) {
    pos.set([o.boxMin.x + rand() * o.boxSize.x, o.boxMin.y + rand() * o.boxSize.y, o.boxMin.z + rand() * o.boxSize.z], i * 3);
    seed.set([rand(), rand(), rand(), rand()], i * 4);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const time = { value: 0 };
  const intensity = { value: 0 };
  const pixelRatio = { value: 1 };
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: { uTime: time, uBoxMin: { value: o.boxMin }, uBoxSize: { value: o.boxSize }, uPixelRatio: pixelRatio, uIntensity: intensity },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, material);
  points.name = 'title-embers';
  points.frustumCulled = false;
  points.renderOrder = 11;
  points.onBeforeRender = (r) => {
    pixelRatio.value = r.getPixelRatio();
  };
  return {
    points,
    update(elapsed) {
      time.value = elapsed;
    },
    setIntensity(k) {
      intensity.value = k;
    },
    dispose() {
      geo.dispose();
      material.dispose();
    },
  };
}
