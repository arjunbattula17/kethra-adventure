import * as THREE from 'three';
import { mulberry32 } from '../../core/rng';
import { ORBIT_VERTEX, rockGeometry, rockMaterial } from './asteroids';
import type { RockLight } from './asteroids';

/**
 * Isilthe up close, backlit: the ringed ocean moon at the edge of the system (LORE.md), seen from the
 * belt with its sun behind it. Almost the whole disc is night; what reads is a thin amber crescent on
 * the side toward the sun, a bright rim of forward-scattered light all round the limb, the teal
 * ringshine its own rings throw on the hemisphere facing us, and the rings themselves, which glow when
 * lit from behind the way fine dust does.
 *
 * Four draws:
 * - The surface: Isilthe's own map (public/textures/planets) under the baked detail sheet, turning
 *   about the rings' axis, a high haze layer drifting over it at its own rate, the rings' shadow cast
 *   on it, the crescent, the ringshine.
 * - The atmosphere: a shell drawn additively with an analytic estimate per pixel (two layers: a thin
 *   bright one that makes the hairline limb, and a deep cyan haze off it), no ray marching.
 * - The rings: one annulus from 1.32 to 4.4 radii in the equatorial plane. Their radial structure (a
 *   faint inner ring, a dense one, a gap, a medium one with its own gap, a thin bright ringlet, a dusty
 *   outer zone that blazes cyan when backlit, a faint halo) is one 2048-texel profile made here on the
 *   CPU; streaks along the orbit come from the detail sheet. Each radius turns at its own Kepler rate
 *   (inner faster), so the structure shears and drifts instead of turning as one rigid disc. The
 *   planet's shadow falls across them, and the planet hides the far side by depth.
 * - Rubble: rocks of a few to ten pixels orbiting in the ring plane at their own rates, one instanced
 *   draw placed on the GPU; the far ones pass behind the disc, the near ones across it.
 */

const SURFACE_VERTEX = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec2 vUv;
  void main() {
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPosW = world.xyz;
    vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

/** Ring density at a radius (in planet radii), from the profile: shared by the surface (ring shadow) and the rings. */
const RING_LOOKUP = /* glsl */ `
  uniform sampler2D uProfile;
  uniform vec2 uRingSpan;
  vec4 ringAt(float r) {
    float x = (r - uRingSpan.x) / (uRingSpan.y - uRingSpan.x);
    if (x <= 0.0 || x >= 1.0) return vec4(0.0);
    return texture2D(uProfile, vec2(x, 0.5));
  }
`;

const SURFACE_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform sampler2D uDay;
  uniform sampler2D uDetail;
  uniform vec3 uCenter;
  uniform float uR;
  uniform vec3 uSunDir;
  uniform vec3 uRingNormal;
  uniform vec3 uShineDir;
  uniform float uHazeShift;
  uniform float uFade;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec2 vUv;
  ${RING_LOOKUP}

  void main() {
    vec3 n = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vPosW);
    vec2 uv = vUv;
    // Explicit gradients with the longitude seam folded out (see heroPlanet.ts).
    vec2 gx = dFdx(uv);
    vec2 gy = dFdy(uv);
    gx.x -= floor(gx.x + 0.5);
    gy.x -= floor(gy.x + 0.5);

    // Isilthe's bands, read through a warp from the detail so they turn into eddies up close.
    vec2 s1 = vec2(10.0, 5.0);
    vec4 d1 = textureGrad(uDetail, uv * s1, gx * s1, gy * s1);
    vec2 s2 = vec2(34.0, 17.0);
    vec4 d2 = textureGrad(uDetail, uv * s2 + vec2(0.37, 0.11), gx * s2, gy * s2);
    vec2 warp = (d1.gb - 0.5) * vec2(0.012, 0.02) + (d2.rg - 0.5) * 0.004;
    vec3 map = textureGrad(uDay, uv + warp, gx, gy).rgb;
    float lum = dot(map, vec3(0.3, 0.55, 0.15));
    vec3 albedo = mix(vec3(0.05, 0.12, 0.17), vec3(0.2, 0.42, 0.5), smoothstep(0.12, 0.42, lum));
    albedo *= 0.75 + 0.5 * d1.r;

    // High haze, drifting at its own rate over the bands: streaks of pale cloud.
    vec2 hz = vec2(uv.x + uHazeShift, uv.y);
    vec2 s3 = vec2(7.0, 7.0);
    vec4 h1 = textureGrad(uDetail, hz * s3 + vec2(0.61, 0.23), gx * s3, gy * s3);
    float haze = smoothstep(0.55, 0.85, h1.b * 0.8 + d2.a * 0.3);
    albedo = mix(albedo, vec3(0.5, 0.62, 0.66), haze * 0.55);

    // The sun, from behind: a soft terminator and an amber crescent along it.
    float ndl = dot(n, uSunDir);
    float lit = smoothstep(-0.06, 0.35, ndl);
    vec3 sunTint = mix(vec3(1.0, 0.46, 0.18), vec3(1.0, 0.86, 0.7), smoothstep(0.0, 0.45, ndl));
    // The rings' shadow: where the ray toward the sun crosses the ring plane.
    float shadow = 1.0;
    float toward = dot(uSunDir, uRingNormal);
    float t = -dot(vPosW - uCenter, uRingNormal) / toward;
    if (t > 0.0) {
      float rr = length(vPosW + uSunDir * t - uCenter) / uR;
      shadow = mix(0.45, 1.0, exp(-ringAt(rr).r * 1.6));
    }
    vec3 col = albedo * sunTint * lit * max(ndl * 0.8 + 0.2, 0.0) * 4.0 * shadow;

    // Ringshine: the glowing rings light the hemisphere that faces their bright side (ours) teal.
    float shine = pow(max(dot(n, uShineDir), 0.0), 1.1) * (0.35 + 0.65 * max(dot(n, V), 0.0));
    col += albedo * vec3(0.3, 0.75, 0.85) * shine * 0.3;
    // Sunlight scattered through the air over the disc on the sun's side: an amber haze deepening to
    // the limb (the sun is behind, so it comes through the atmosphere toward us).
    vec3 sunPerp = normalize(uSunDir - V * dot(uSunDir, V));
    float side = smoothstep(-0.3, 0.9, dot(n, sunPerp));
    float limb = 1.0 - clamp(dot(n, V), 0.0, 1.0);
    col += vec3(1.0, 0.5, 0.2) * side * (0.025 + 0.14 * pow(limb, 3.0)) * (0.7 + 0.6 * haze);
    // Night: just enough for the disc to keep its shape against space.
    col += albedo * vec3(0.02, 0.035, 0.05) * (1.0 - lit);

    gl_FragColor = vec4(col * uFade, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const SHELL_VERTEX = /* glsl */ `
  varying vec3 vPosW;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPosW = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

/**
 * Two layers, each the column of air along the view ray (Chapman's grazing approximation off the limb,
 * plane-parallel over the disc) times a phase function: a thin, dense one (scale height uH.x) that
 * makes the hairline rim, white with a rose cast, and a deep thin haze (uH.y) that spreads it into a
 * cyan halo. The sun is behind: both are forward scattering, brightest on the side toward it.
 */
const ATMO_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform vec3 uCenter;
  uniform float uR;
  uniform vec2 uH;
  uniform vec3 uSunDir;
  uniform float uIntensity;
  uniform float uFade;
  varying vec3 vPosW;
  void main() {
    vec3 ro = cameraPosition;
    vec3 rd = normalize(vPosW - ro);
    vec3 oc = ro - uCenter;
    float tca = -dot(oc, rd);
    float d2 = dot(oc, oc) - tca * tca;
    float b = sqrt(max(d2, 0.0));
    bool hit = b < uR && tca > 0.0;
    vec3 p;
    vec2 column;
    vec2 limb = sqrt(6.2832 * uR / uH);
    if (hit) {
      p = ro + rd * (tca - sqrt(uR * uR - d2));
      float mu = max(dot(normalize(p - uCenter), -rd), 0.0);
      column = min(vec2(1.0 / max(mu, 0.02)), limb * 0.5);
    } else {
      p = ro + rd * max(tca, 0.0);
      column = exp(-(b - uR) / uH) * limb;
    }
    vec3 np = normalize(p - uCenter);
    float sunAlt = dot(np, uSunDir);
    // The limb is the terminator from here: lit along all of it, most on the sun's side.
    float lit = smoothstep(-0.55, 0.25, sunAlt);
    float cosT = dot(rd, uSunDir);
    float g = 0.7;
    float phase = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * cosT, 1.5);
    vec3 rim = (1.0 - exp(-column.x * 0.02)) * vec3(1.0, 0.8, 0.82) * (0.45 + 0.25 * phase);
    vec3 halo = (1.0 - exp(-column.y * 0.012)) * vec3(0.32, 0.68, 1.0) * (0.3 + 0.2 * phase);
    vec3 col = (rim + halo) * lit;
    // Over the disc it is a light veil only: the night side stays night.
    if (hit) col *= 0.22;
    gl_FragColor = vec4(col * uIntensity * uFade, 1.0);
  }
`;

const RING_VERTEX = /* glsl */ `
  attribute vec2 aPlane;
  varying vec3 vPosW;
  varying vec2 vPlane;
  void main() {
    vPlane = aPlane;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPosW = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const RING_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform sampler2D uDetail;
  uniform vec3 uCenter;
  uniform float uR;
  uniform vec3 uSunDir;
  uniform float uTime;
  uniform float uKepler;
  uniform float uFade;
  uniform float uSwell;
  uniform float uPulse;
  varying vec3 vPosW;
  varying vec2 vPlane;
  ${RING_LOOKUP}
  const float TAU = 6.2831853;

  void main() {
    float r = length(vPlane) / uR;
    vec4 prof = ringAt(r);
    if (prof.r + prof.b < 0.002) discard;
    // Each radius turns at its own rate (Kepler: inner rings faster), so streaks shear as they go.
    float turn = uTime * uKepler * pow(r / 2.0, -1.5);
    float a = (atan(vPlane.y, vPlane.x) - turn) / TAU;
    // Streaks: the detail sheet stretched far along the orbit (4 repeats round, ~22 across the span).
    vec4 s = texture2D(uDetail, vec2(a * 4.0, r * 5.5));
    vec4 f = texture2D(uDetail, vec2(a * 16.0 + 0.3, r * 31.0));
    float streak = 0.62 + 0.55 * s.b + 0.3 * (f.a - 0.5);
    // Spokes: slow, faint radial brightenings across the dense ring, drifting at their own rate.
    float spoke = texture2D(uDetail, vec2(a * 3.0 - uTime * 0.0021, r * 0.6 + 0.2)).r;

    float ice = prof.r * mix(0.85, 1.15, s.a);
    float dust = prof.b * streak;
    vec3 rd = normalize(vPosW - cameraPosition);
    float cosT = dot(rd, uSunDir);
    // Forward scattering: fine dust blazes when the sun is behind it; ice much less so.
    float g = 0.72;
    float hg = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * cosT, 1.5);

    // The planet's shadow: does the ray from here toward the sun pass within a radius of the centre?
    vec3 oc = uCenter - vPosW;
    float along = dot(oc, uSunDir);
    float miss = length(oc - uSunDir * along) / uR;
    float lit = along > 0.0 ? mix(0.2, 1.0, smoothstep(0.96, 1.06, miss)) : 1.0;

    float iceAlpha = 1.0 - exp(-ice * 2.6);
    vec3 iceCol = mix(vec3(0.3, 0.58, 0.88), vec3(0.7, 0.9, 1.0), prof.g) * iceAlpha * (0.17 + 0.03 * hg) * (0.85 + 0.3 * spoke) * streak;
    vec3 dustCol = vec3(0.2, 0.68, 1.0) * dust * (0.2 + 0.14 * hg);
    vec3 col = (iceCol + dustCol) * lit * uSwell;
    // The Choir's signal (TitleScene): a faint bright front running out through the rings in ~3.5 s.
    if (uPulse >= 0.0) {
      float front = uRingSpan.x + uPulse * 0.9;
      // Squared by hand: pow() of a negative base is NaN on Direct3D.
      float wd = (r - front) / 0.05;
      float wave = exp(-wd * wd) * smoothstep(0.0, 0.25, uPulse) * (1.0 - smoothstep(1.5, 3.5, uPulse));
      col += vec3(0.45, 0.88, 1.0) * wave * (0.04 + 0.5 * (iceAlpha + dust));
    }
    // Premultiplied: the dense rings hide part of what lies behind them; the dust only adds light.
    gl_FragColor = vec4(col * uFade, iceAlpha * 0.45 * uFade);
  }
`;

/**
 * The rings' radial structure from 1.32 to 4.4 planet radii, 2048 texels: R ice density (0..1), G
 * whiteness, B dust density (the forward-scattering part), each made of named rings with ringlets on
 * top. Built once here, ~2 ms.
 */
function ringProfile(span: [number, number], seed: number): THREE.DataTexture {
  const N = 2048;
  const data = new Uint8Array(N * 4);
  const rand = mulberry32(seed);
  // Ringlets: a few dozen sinusoids of random period and phase, summed.
  const waves = Array.from({ length: 40 }, () => ({ k: 20 + rand() * 260, p: rand() * Math.PI * 2, a: 0.3 + rand() * 0.7 }));
  const ripple = (r: number) => {
    let s = 0;
    for (const w of waves) s += w.a * Math.sin(r * w.k + w.p);
    return s / 12;
  };
  const band = (r: number, a: number, b: number, edge: number) => {
    const s = (x: number) => Math.min(1, Math.max(0, x));
    return s((r - a) / edge) * s((b - r) / edge);
  };
  const bump = (r: number, at: number, width: number) => Math.exp(-(((r - at) / width) ** 2));
  for (let i = 0; i < N; i++) {
    const r = span[0] + ((span[1] - span[0]) * (i + 0.5)) / N;
    const fine = ripple(r);
    // C ring: faint and grey. B ring: dense, ringlets all through. Cassini gap. A ring, its own gap. F ringlet.
    let ice = 0.2 * band(r, 1.32, 1.53, 0.02) * (0.8 + fine);
    ice += (0.72 + 0.18 * Math.sin(r * 9.0)) * band(r, 1.53, 2.0, 0.015) * (0.85 + fine * 0.9);
    ice += 0.5 * band(r, 2.09, 2.56, 0.012) * (0.9 + fine * 0.6) * (1 - 0.92 * bump(r, 2.44, 0.007));
    ice += 0.85 * bump(r, 2.63, 0.006);
    ice = Math.min(1, Math.max(0, ice));
    // Dust: a little through the main rings, a broad bright zone outside them, a faint halo beyond.
    let dust = 0.1 * band(r, 1.4, 2.6, 0.05);
    dust += 0.9 * band(r, 2.68, 3.35, 0.09) * (0.75 + fine * 1.4) + 0.5 * bump(r, 2.92, 0.08);
    dust += 0.32 * band(r, 3.35, 4.4, 0.6) * (0.8 + fine);
    dust = Math.min(1, Math.max(0, dust));
    const white = Math.min(1, Math.max(0, 0.5 + 0.5 * band(r, 1.6, 1.95, 0.08) + fine * 0.8 - 0.2 * band(r, 2.09, 2.56, 0.02)));
    data.set([ice * 255, white * 255, dust * 255, 255], i * 4);
  }
  const tex = new THREE.DataTexture(data, N, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  tex.name = 'title-ring-profile';
  return tex;
}

/** The rings' inner and outer edge, in planet radii. */
const RING_SPAN: [number, number] = [1.32, 4.4];

export interface RingworldOptions {
  center: THREE.Vector3;
  radius: number;
  /** The rings' axis (and the spin's). */
  ringNormal: THREE.Vector3;
  /** Toward the sun, which is behind the planet. */
  sunDir: THREE.Vector3;
  day: THREE.Texture;
  detail: THREE.Texture;
  segments: number;
  /** Turn rate (rad/s; TitleScene's 0.015 is a turn in seven minutes), the haze's extra drift (map widths per second), and the rings' rate at 2 radii (rad/s; Kepler elsewhere). */
  spin: number;
  hazeDrift: number;
  ringRate: number;
  /** Atmosphere strength. */
  glow: number;
  /** Rubble in the ring plane: how many, their sizes (units), and its light. */
  rubble: { count: number; size: [number, number]; light: RockLight; seed: number };
}

export interface Ringworld {
  group: THREE.Group;
  /** The surface (turns), for tests. */
  surface: THREE.Mesh;
  update(elapsed: number): void;
  /** Sends a pulse out through the rings, starting now (the elapsed time of the last update). */
  pulse(): void;
  setFade(k: number): void;
  dispose(): void;
}

export function buildRingworld(o: RingworldOptions): Ringworld {
  const R = o.radius;
  const group = new THREE.Group();
  group.name = 'title-ringworld';
  group.position.copy(o.center);
  // Local +Y is the rings' axis.
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), o.ringNormal);
  const fade = { value: 0 };
  const time = { value: 0 };
  const profile = ringProfile(RING_SPAN, 0x15117e);
  const lookup = { uProfile: { value: profile }, uRingSpan: { value: new THREE.Vector2(...RING_SPAN) } };
  // The side of the rings we look at: the hemisphere facing it takes their light.
  const toCamera = o.center.clone().negate().normalize();
  const shineDir = o.ringNormal.clone().multiplyScalar(Math.sign(o.ringNormal.dot(toCamera)) || 1);

  const hazeShift = { value: 0 };
  const surface = new THREE.Mesh(
    new THREE.SphereGeometry(R, o.segments, o.segments / 2),
    new THREE.ShaderMaterial({
      vertexShader: SURFACE_VERTEX,
      fragmentShader: SURFACE_FRAGMENT,
      uniforms: {
        uDay: { value: o.day },
        uDetail: { value: o.detail },
        uCenter: { value: o.center },
        uR: { value: R },
        uSunDir: { value: o.sunDir },
        uRingNormal: { value: o.ringNormal },
        uShineDir: { value: shineDir },
        uHazeShift: hazeShift,
        uFade: fade,
        ...lookup,
      },
    }),
  );
  surface.name = 'title-planet-surface';
  // The storm the map carries is turned into view first.
  surface.rotation.y = 2.4;
  const spinStart = surface.rotation.y;
  group.add(surface);

  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(R * 1.16, o.segments, o.segments / 2),
    new THREE.ShaderMaterial({
      vertexShader: SHELL_VERTEX,
      fragmentShader: ATMO_FRAGMENT,
      uniforms: { uCenter: { value: o.center }, uR: { value: R }, uH: { value: new THREE.Vector2(R * 0.0045, R * 0.03) }, uSunDir: { value: o.sunDir }, uIntensity: { value: o.glow }, uFade: fade },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  atmo.name = 'title-planet-atmosphere';
  atmo.renderOrder = 1;
  group.add(atmo);

  const swell = { value: 1 };
  const pulseAge = { value: -1 };
  let pulseAt = -Infinity;
  let now = 0;
  const ringGeo = new THREE.RingGeometry(R * RING_SPAN[0], R * RING_SPAN[1], 384, 8);
  // RingGeometry lies in local XY; the rings belong in the plane normal to local +Y.
  ringGeo.rotateX(-Math.PI / 2);
  // The shader reads each vertex's place in the ring plane (x, z) as aPlane.
  const p = ringGeo.getAttribute('position') as THREE.BufferAttribute;
  const plane = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) plane.set([p.getX(i), p.getZ(i)], i * 2);
  ringGeo.setAttribute('aPlane', new THREE.BufferAttribute(plane, 2));
  const rings = new THREE.Mesh(
    ringGeo,
    new THREE.ShaderMaterial({
      vertexShader: RING_VERTEX,
      fragmentShader: RING_FRAGMENT,
      uniforms: {
        uDetail: { value: o.detail },
        uCenter: { value: o.center },
        uR: { value: R },
        uSunDir: { value: o.sunDir },
        uTime: time,
        uKepler: { value: o.ringRate },
        uSwell: swell,
        uPulse: pulseAge,
        uFade: fade,
        ...lookup,
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    }),
  );
  rings.name = 'title-rings';
  rings.renderOrder = 2;
  group.add(rings);

  // Rubble in the ring plane, each on its own orbit at its own Kepler rate.
  const rand = mulberry32(o.rubble.seed);
  const n = o.rubble.count;
  const base = rockGeometry(2, 4021, 'chunky');
  const rubbleGeo = new THREE.InstancedBufferGeometry();
  rubbleGeo.index = base.index;
  for (const name of ['position', 'normal', 'aCavity']) rubbleGeo.setAttribute(name, base.getAttribute(name));
  rubbleGeo.instanceCount = n;
  const orbit = new Float32Array(n * 4);
  const spin = new Float32Array(n * 4);
  const size = new Float32Array(n);
  const seed = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    // Most in the main rings, a few out in the dusty zone.
    const r = (rand() < 0.75 ? 1.45 + rand() * 1.2 : 2.7 + rand() * 0.9) * R;
    const rate = o.ringRate * Math.pow(r / R / 2, -1.5);
    orbit.set([r, rand() * Math.PI * 2, rate, (rand() - 0.5) * 0.03 * R], k * 4);
    const axis = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
    spin.set([axis.x, axis.y, axis.z, (0.05 + rand() * 0.25) * (rand() < 0.5 ? -1 : 1)], k * 4);
    // Mostly small; one in eight a moonlet.
    size[k] = o.rubble.size[0] + (o.rubble.size[1] - o.rubble.size[0]) * (rand() < 0.125 ? 0.7 + rand() * 0.3 : Math.pow(rand(), 2) * 0.5);
    seed[k] = rand();
  }
  rubbleGeo.setAttribute('aOrbit', new THREE.InstancedBufferAttribute(orbit, 4));
  rubbleGeo.setAttribute('aSpin', new THREE.InstancedBufferAttribute(spin, 4));
  rubbleGeo.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 1));
  rubbleGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));
  const basis = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(group.quaternion));
  const rubbleMat = rockMaterial(ORBIT_VERTEX, o.rubble.light, { uTime: time, uOrbitCenter: { value: o.center }, uOrbitBasis: { value: basis } }, fade);
  const rubble = new THREE.Mesh(rubbleGeo, rubbleMat);
  rubble.name = 'title-ring-rubble';
  rubble.frustumCulled = false;
  // Rubble is placed in world space by its shader; keep it out of the group's transform.
  const rubbleRoot = new THREE.Group();
  rubbleRoot.add(rubble);

  const root = new THREE.Group();
  root.add(group, rubbleRoot);

  return {
    group: root,
    surface,
    update(elapsed) {
      now = elapsed;
      time.value = elapsed;
      pulseAge.value = elapsed - pulseAt < 3.6 ? elapsed - pulseAt : -1;
      surface.rotation.y = spinStart + ((elapsed * o.spin) % (Math.PI * 2));
      hazeShift.value = (elapsed * o.hazeDrift) % 1;
      // A slow swell of the rings' light, two incommensurate periods so it never visibly repeats.
      swell.value = 1 + 0.045 * Math.sin(elapsed * 0.13) + 0.03 * Math.sin(elapsed * 0.047 + 1.7);
    },
    pulse() {
      pulseAt = now;
    },
    setFade(k) {
      fade.value = k;
    },
    dispose() {
      profile.dispose();
      for (const m of [surface, atmo, rings]) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
      base.dispose();
      rubbleGeo.dispose();
      rubbleMat.dispose();
    },
  };
}
