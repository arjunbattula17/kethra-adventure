import * as THREE from 'three';
import type { PlanetDefinition } from './planetData';

// Shader structure (altitude-banded terrain color, a domain-noise cloud shell, and a power-falloff
// atmosphere rim) is adapted from two real, working references rather than invented from scratch:
//  - github.com/jsulpis/realtime-planet-shader (shadertoy.com/view/Ds3XRl "Procedural Blue Planet")
//    — analytic sphere shading (no raymarch) with fbm-driven terrain bands and a fake, distance-
//    function atmosphere. Its own noise() samples a precomputed 3D texture asset this project
//    doesn't have, so the hash/value-noise fbm below is a standard substitute for that one piece.
//  - github.com/THRASTRO/thrastro-shaders GroundShader.js — real Kr/Km Rayleigh+Mie scattering with
//    a day/night terminator. Its 16-sample-per-vertex scattering integral is too much for four
//    planets on screen at once (this scene's own performance mandate), so the atmosphere here keeps
//    the terminator/day-side-brighter idea but swaps the integral for a cheap Fresnel power curve —
//    the "simplest fallback" the brief calls out explicitly.
//
// PLANETS' orbitRadius values (60-165) put every planet small on screen for nearly this whole
// cinematic (see GalaxyRevealScene.playReveal's camera keyframes), so octave counts stay low (3-4)
// rather than chasing detail that won't survive downsampling to a few dozen pixels.

const NOISE_GLSL = /* glsl */ `
float hash13(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float valueNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i + vec3(0.0, 0.0, 0.0));
  float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
    mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
    f.z
  );
}

// Two fixed-iteration variants rather than a single fbm(p, octaves) with a runtime break: GLSL ES
// 1.00 (what WebGL compiles non-#version-tagged shaders as) wants loop bounds statically analyzable,
// and a uniform/argument-driven break is exactly the pattern some driver compilers reject.
float fbm4(vec3 p) {
  float total = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  float norm = 0.0;
  for (int i = 0; i < 4; i++) {
    total += valueNoise(p * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.15;
  }
  return total / norm;
}

float fbm2(vec3 p) {
  float total = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  float norm = 0.0;
  for (int i = 0; i < 2; i++) {
    total += valueNoise(p * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.15;
  }
  return total / norm;
}
`;

const VERTEX = /* glsl */ `
varying vec3 vNormalW;
varying vec3 vPosW;

void main() {
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vPosW = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const SURFACE_FRAGMENT = /* glsl */ `
precision highp float;
varying vec3 vNormalW;
varying vec3 vPosW;

uniform vec3 uSunDir;
uniform vec3 uBaseColor;
uniform float uSeed;

${NOISE_GLSL}

void main() {
  vec3 n = normalize(vNormalW);
  vec3 p = n * 2.4 + vec3(uSeed);
  float terrain = fbm4(p);

  vec3 deep = uBaseColor * 0.32;
  vec3 mid = uBaseColor;
  vec3 high = mix(uBaseColor, vec3(1.0), 0.5);

  vec3 surface = mix(deep, mid, smoothstep(0.28, 0.5, terrain));
  surface = mix(surface, high, smoothstep(0.64, 0.8, terrain));

  float polar = smoothstep(0.6, 0.88, abs(n.y));
  surface = mix(surface, vec3(0.9, 0.94, 1.0), polar * 0.55);

  float ndl = dot(n, uSunDir);
  float dayMix = smoothstep(-0.18, 0.16, ndl);
  float diffuse = clamp(ndl, 0.0, 1.0);

  // Faint city-light speckle, only where the terrain band is already lit-plausible and only on
  // the night side — a cheap stand-in for GroundShader's nightMap term.
  float lights = smoothstep(0.97, 0.995, fbm2(p * 5.0 + 19.0)) * (1.0 - dayMix);
  vec3 night = surface * 0.045 + vec3(1.0, 0.82, 0.5) * lights * 1.4;
  vec3 lit = surface * (0.12 + diffuse * 1.05);

  vec3 color = mix(night, lit, dayMix);

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const CLOUD_FRAGMENT = /* glsl */ `
precision highp float;
varying vec3 vNormalW;
varying vec3 vPosW;

uniform float uTime;
uniform vec3 uSunDir;
uniform float uSeed;

${NOISE_GLSL}

void main() {
  vec3 n = normalize(vNormalW);
  vec3 p = n * 3.1 + vec3(uSeed * 1.7);
  p += vec3(uTime * 0.015, 0.0, uTime * 0.01);
  float density = smoothstep(0.55, 0.82, fbm4(p));

  float ndl = clamp(dot(n, uSunDir) * 0.6 + 0.5, 0.0, 1.0);
  vec3 color = vec3(1.0) * (0.3 + ndl * 0.7);

  gl_FragColor = vec4(color, density * 0.75);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const ATMOSPHERE_FRAGMENT = /* glsl */ `
precision highp float;
varying vec3 vNormalW;
varying vec3 vPosW;

uniform vec3 uSunDir;
uniform vec3 uAtmoColor;
uniform vec3 uCameraPos;

void main() {
  vec3 n = normalize(vNormalW);
  vec3 viewDir = normalize(uCameraPos - vPosW);
  float rim = 1.0 - clamp(dot(n, viewDir), 0.0, 1.0);
  float limb = pow(rim, 3.2);

  float sunFacing = clamp(dot(n, uSunDir) * 0.5 + 0.5, 0.0, 1.0);
  float sunBoost = pow(sunFacing, 1.6);

  float glow = limb * (0.35 + sunBoost * 0.85);
  gl_FragColor = vec4(uAtmoColor * glow, glow);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** Deterministic per-planet offset so the shared noise field doesn't tile identically across
 * every planet in PLANETS. */
function seedFor(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 1000) / 10;
}

/** Radial banded ring texture with per-band noise, standing in for the Saturn-like ring detail
 * called out in the brief — baked once on a canvas rather than shaded per-pixel, since a ring is
 * flat and view-independent enough that a texture reads the same as a shader would. Painted onto a
 * square canvas centered on itself so it lines up with RingGeometry's own box-mapped UVs, the same
 * trick buildRingTexture() in GalaxyRevealScene.ts already relies on for the sensor-ping sprite. */
function buildPlanetRingTexture(colorHex: number): THREE.Texture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;
  const outer = size * 0.5;
  const inner = size * 0.3;

  const base = new THREE.Color(colorHex).lerp(new THREE.Color(0xe8e6de), 0.6);
  let seed = colorHex;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed >>> 8) / 0x7fffff;
  };

  const bands = 90;
  for (let i = 0; i < bands; i++) {
    const t0 = i / bands;
    const t1 = (i + 1) / bands;
    const r0 = inner + (outer - inner) * t0;
    const r1 = inner + (outer - inner) * t1;
    const density = 0.15 + rand() * 0.65;
    const tint = base.clone().multiplyScalar(0.75 + rand() * 0.4);
    ctx.strokeStyle = `rgba(${Math.round(tint.r * 255)}, ${Math.round(tint.g * 255)}, ${Math.round(tint.b * 255)}, ${density})`;
    ctx.lineWidth = Math.max(1, r1 - r0);
    ctx.beginPath();
    ctx.arc(cx, cy, (r0 + r1) / 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Soft inner/outer taper so the ring doesn't cut off with a hard edge.
  const fade = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
  fade.addColorStop(0, 'rgba(0,0,0,1)');
  fade.addColorStop(0.06, 'rgba(0,0,0,0)');
  fade.addColorStop(0.94, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'source-over';

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export interface PlanetInstance {
  group: THREE.Group;
  update(elapsed: number, dt: number): void;
}

export function buildPlanetInstance(
  def: PlanetDefinition,
  position: THREE.Vector3,
  sunPosition: THREE.Vector3,
  camera: THREE.Camera,
): PlanetInstance {
  const group = new THREE.Group();
  group.position.copy(position);

  const seed = seedFor(def.id);
  const baseColor = new THREE.Color(def.color);
  // The sun and every planet's orbit position are both static for the whole cinematic (only
  // rotation animates), so the sun direction per planet is constant — computed once here rather
  // than re-derived every frame.
  const sunDir = sunPosition.clone().sub(position).normalize();

  const surfaceUniforms = {
    uSunDir: { value: sunDir },
    uBaseColor: { value: baseColor },
    uSeed: { value: seed },
  };
  const surfaceMat = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: SURFACE_FRAGMENT,
    uniforms: surfaceUniforms,
  });
  const surface = new THREE.Mesh(new THREE.SphereGeometry(def.radius, 32, 24), surfaceMat);
  group.add(surface);

  const cloudUniforms = {
    uTime: { value: 0 },
    uSunDir: { value: sunDir },
    uSeed: { value: seed },
  };
  const cloudMat = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: CLOUD_FRAGMENT,
    uniforms: cloudUniforms,
    transparent: true,
    depthWrite: false,
  });
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(def.radius * 1.015, 24, 18), cloudMat);
  group.add(clouds);

  const atmoColor = baseColor.clone().lerp(new THREE.Color(0xbfd9ff), 0.55);
  const atmoUniforms = {
    uSunDir: { value: sunDir },
    uAtmoColor: { value: atmoColor },
    uCameraPos: { value: camera.position.clone() },
  };
  const atmoMat = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: ATMOSPHERE_FRAGMENT,
    uniforms: atmoUniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
  });
  const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(def.radius * 1.18, 24, 18), atmoMat);
  group.add(atmosphere);

  if (def.hasRing) {
    const ringMat = new THREE.MeshBasicMaterial({
      map: buildPlanetRingTexture(def.color),
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(def.radius * 1.5, def.radius * 2.3, 64), ringMat);
    ring.rotation.x = Math.PI / 2.4;
    group.add(ring);
  }

  return {
    group,
    update(elapsed, dt) {
      cloudUniforms.uTime.value = elapsed;
      clouds.rotation.y += dt * 0.018;
      atmoUniforms.uCameraPos.value.copy(camera.position);
    },
  };
}
