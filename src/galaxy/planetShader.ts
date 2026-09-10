import * as THREE from 'three';
import type { PlanetDefinition } from './planetData';

// Each planet is ONE lit sphere plus (optionally) one ring, not the stack of surface mesh + cloud
// shell + atmosphere shell this used to be. That stack had three specific problems, all visible in
// renders/space-audit:
//  - the atmosphere shell sat at radius * 1.18, so its rim was an 18%-thick milky donut with a hard
//    outer edge rather than a limb. Doing the rim in this shader as a fresnel term on the planet's
//    own surface makes it exactly as thin as it should be, and it can never separate from the body.
//  - the surface used emissiveMap = albedo to fake a light floor (the scene's sun PointLight decays
//    to nothing across the 60-165 unit orbit radii), which lit the night side as brightly as the
//    day side and erased the terminator entirely. Here the day/night mix is computed from uSunDir
//    directly, so distance to the sun light is irrelevant and the terminator is guaranteed.
//  - the cloud shell layered procedural noise on top of source albedo that already had its own
//    baked clouds, so cloudy worlds read as double-clouded. Clouds are now sampled from the real
//    shared cloud sheet, in this shader, and only on worlds that have weather.
//
// Textures come from tools/prep-planet-textures.mjs, which re-maps real Solar System Scope
// equirects into each world's own palette (see that file, and public/textures/CREDITS.md).

const VERTEX = /* glsl */ `
varying vec3 vNormalW;
varying vec3 vPosW;
varying vec2 vUv;

void main() {
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vPosW = worldPos.xyz;
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const SURFACE_FRAGMENT = /* glsl */ `
precision highp float;

varying vec3 vNormalW;
varying vec3 vPosW;
varying vec2 vUv;

uniform sampler2D uDayMap;
uniform sampler2D uNightMap;
uniform sampler2D uCloudMap;
uniform vec3 uSunDir;
uniform vec3 uCameraPos;
uniform vec3 uAtmoColor;
uniform float uCloudAmount;
uniform float uCloudOffset;
uniform float uAtmoStrength;

void main() {
  vec3 n = normalize(vNormalW);
  float ndl = dot(n, uSunDir);

  // Terminator. A planet's day/night boundary is soft over a band a few degrees wide, so this
  // smoothsteps across ndl rather than clamping it -- a hard cut reads as a rendering error, and a
  // fully linear ramp washes the whole sphere out.
  float day = smoothstep(-0.12, 0.28, ndl);

  vec3 dayColor = texture2D(uDayMap, vUv).rgb;
  vec3 nightColor = texture2D(uNightMap, vUv).rgb;

  // Clouds drift on their own longitude offset so they don't sit locked to the terrain below.
  float cloud = texture2D(uCloudMap, vec2(vUv.x + uCloudOffset, vUv.y)).r * uCloudAmount;
  dayColor = mix(dayColor, vec3(1.0), cloud * 0.85);

  // Lambert falloff across the lit side on top of the day/night mix, so the sub-solar point is
  // brighter than the limb and the sphere reads as a sphere instead of a flat disc.
  float lambert = 0.25 + 0.75 * max(ndl, 0.0);
  vec3 color = dayColor * lambert * day;

  // Night side keeps the world's own glow (Kethra's canopy, Orrun's buried machinery, Isilthe's
  // signal) plus a trace of skylight, and clouds occlude it the way overcast hides city light.
  color += nightColor * (1.0 - day) * (1.0 - cloud * 0.7);
  color += dayColor * 0.02 * (1.0 - day);

  // Atmosphere limb: a fresnel rim on the planet's own surface. Brighter where the rim faces the
  // sun, which is what produces the crescent of light along the day-side edge.
  vec3 viewDir = normalize(uCameraPos - vPosW);
  float rim = 1.0 - clamp(dot(n, viewDir), 0.0, 1.0);
  float limb = pow(rim, 4.0) * uAtmoStrength;
  color += uAtmoColor * limb * (0.25 + 0.75 * day);

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export interface PlanetInstance {
  group: THREE.Group;
  update(elapsed: number, dt: number): void;
}

const textureLoader = new THREE.TextureLoader();
const textureCache = new Map<string, THREE.Texture>();

function planetTexture(file: string, srgb: boolean): THREE.Texture {
  const url = `${import.meta.env.BASE_URL}textures/planets/${file}`;
  let texture = textureCache.get(url);
  if (!texture) {
    texture = textureLoader.load(url);
    texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    // Equirect maps wrap in longitude and clamp at the poles; letting V repeat mirrors the pole
    // rows across the seam.
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.anisotropy = 8;
    textureCache.set(url, texture);
  }
  return texture;
}

/**
 * Ring geometry with radial UVs: u runs 0->1 from the inner edge to the outer edge, v is constant.
 * THREE.RingGeometry's own UVs are box-mapped across the ring's bounding square, which samples a
 * 2048x125 radial strip as if it were a picture of the ring rather than a cross-section of it.
 */
function buildRingGeometry(inner: number, outer: number, segments: number): THREE.RingGeometry {
  const geo = new THREE.RingGeometry(inner, outer, segments, 1);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    uv.setXY(i, (v.length() - inner) / (outer - inner), 0.5);
  }
  uv.needsUpdate = true;
  return geo;
}

/** Worlds with weather. Vessek is a gas giant whose bands are its own weather, and Orrun's
 * dust storms are already baked into its surface map, so neither takes the shared cloud sheet. */
const CLOUDY: Record<string, number> = { kethra: 0.55, isilthe: 0.35 };

export function buildPlanetInstance(
  def: PlanetDefinition,
  position: THREE.Vector3,
  sunPosition: THREE.Vector3,
  camera: THREE.Camera,
): PlanetInstance {
  const group = new THREE.Group();
  group.position.copy(position);

  // The sun and every planet's orbit position are both static for the whole cinematic (only
  // rotation animates), so the sun direction per planet is constant -- computed once here rather
  // than re-derived every frame.
  const sunDir = sunPosition.clone().sub(position).normalize();
  const atmoColor = new THREE.Color(def.color).lerp(new THREE.Color(0xbfd9ff), 0.5);
  const cloudAmount = CLOUDY[def.id] ?? 0;

  const uniforms = {
    uDayMap: { value: planetTexture(`${def.id}_day.jpg`, true) },
    uNightMap: { value: planetTexture(`${def.id}_night.jpg`, true) },
    uCloudMap: { value: planetTexture('clouds.jpg', false) },
    uSunDir: { value: sunDir },
    uCameraPos: { value: camera.position.clone() },
    uAtmoColor: { value: atmoColor },
    uCloudAmount: { value: cloudAmount },
    uCloudOffset: { value: 0 },
    uAtmoStrength: { value: cloudAmount > 0 ? 1.5 : 0.9 },
  };

  const surface = new THREE.Mesh(
    new THREE.SphereGeometry(def.radius, 48, 32),
    new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader: SURFACE_FRAGMENT, uniforms }),
  );
  group.add(surface);

  let ring: THREE.Mesh | null = null;
  if (def.hasRing) {
    ring = new THREE.Mesh(
      buildRingGeometry(def.radius * 1.4, def.radius * 2.3, 96),
      new THREE.MeshBasicMaterial({
        map: planetTexture(`${def.id}_ring.png`, true),
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    // Tilted off the orbital plane like a real ring system, and off the planet's own spin axis, so
    // it reads as a structure the world is wearing rather than a decal drawn around it.
    ring.rotation.x = Math.PI / 2 - 0.34;
    ring.rotation.y = 0.2;
    group.add(ring);
  }

  return {
    group,
    update(elapsed) {
      uniforms.uCameraPos.value.copy(camera.position);
      // Clouds shear slowly against the surface underneath; the surface's own spin is applied by
      // the caller to the whole group.
      uniforms.uCloudOffset.value = elapsed * 0.004;
    },
  };
}
