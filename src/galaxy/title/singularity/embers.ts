import * as THREE from 'three';
import { mulberry32 } from '../../../core/rng';

/**
 * Matter for the hole to feed on: a flattened cloud of hot sparks around it, dark until the birth.
 * They do not move by themselves; the gravity well (gravityWell.ts, patched into this shader like the
 * rest of the scene) winds them into spiral streams and swallows them from the inside out, and the
 * lens pass bends them around the shadow. Hotter (whiter) nearer the hole.
 */

const VERTEX = /* glsl */ `
  attribute float aSeed;
  uniform float uPixelRatio;
  uniform float uTime;
  uniform vec3 uCentre;
  varying float vHeat;
  varying float vSeed;
  void main() {
    vec3 world = position;
    float r = length(position - uCentre);
    vHeat = clamp(1.0 - r / 60.0, 0.0, 1.0);
    vSeed = aSeed;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
    // Size by distance; a little twinkle so streams shimmer rather than slide.
    float tw = 0.75 + 0.25 * sin(uTime * (6.0 + aSeed * 9.0) + aSeed * 40.0);
    gl_PointSize = clamp((26.0 + 30.0 * aSeed) / max(gl_Position.w, 0.5), 1.0, 9.0) * uPixelRatio * tw;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float uGlow;
  varying float vHeat;
  varying float vSeed;
  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float d = dot(c, c);
    if (d > 1.0) discard;
    float core = exp(-d * 5.0);
    vec3 cool = vec3(1.0, 0.36, 0.08);
    vec3 hot = vec3(1.0, 0.86, 0.62);
    vec3 col = mix(cool, hot, vHeat) * (0.6 + 1.6 * vHeat) * (0.5 + vSeed);
    gl_FragColor = vec4(col * core * uGlow, 1.0);
  }
`;

export interface Embers {
  points: THREE.Points;
  set(glow: number, time: number): void;
  dispose(): void;
}

export function buildEmbers(centre: THREE.Vector3, axis: THREE.Vector3, count: number): Embers {
  const rand = mulberry32(0xb1ac4);
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  // A basis in the disk plane.
  const u = new THREE.Vector3().crossVectors(axis, new THREE.Vector3(0, 0, 1)).normalize();
  if (u.lengthSq() < 0.5) u.set(1, 0, 0);
  const w = new THREE.Vector3().crossVectors(axis, u).normalize();
  const p = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    // Log-spread radius 5-70, two loose arms, flattened toward the plane.
    const r = 5 * Math.pow(14, rand());
    const arm = rand() < 0.5 ? 0 : Math.PI;
    const a = arm + Math.log(r) * 2.2 + (rand() - 0.5) * 1.6;
    const h = (rand() - 0.5) * r * 0.32;
    p.copy(centre).addScaledVector(u, Math.cos(a) * r).addScaledVector(w, Math.sin(a) * r).addScaledVector(axis, h);
    pos.set([p.x, p.y, p.z], i * 3);
    seed[i] = rand();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const glow = { value: 0 };
  const time = { value: 0 };
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: { uGlow: glow, uTime: time, uCentre: { value: centre.clone() }, uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.name = 'singularity-embers';
  points.frustumCulled = false;
  // Drawn after the ship and the rocks, over them where they cross.
  points.renderOrder = 6;
  points.visible = false;
  return {
    points,
    set(g, t) {
      glow.value = g;
      time.value = t;
      points.visible = g > 0.001;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
