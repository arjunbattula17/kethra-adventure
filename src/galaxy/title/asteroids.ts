import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../../core/rng';

/**
 * A few rocks of the belt Kethra orbits just outside (LORE.md, "The world"): big dark ones close to the
 * camera, a lit one low on the right, and debris scattered out toward the planet, for depth and parallax.
 *
 * Shapes: an icosphere pushed out by noise, cut by ridges, and pocked with craters (a bowl and a
 * raised rim each). Each vertex also records how far it sits below the rock's broad shape, which the
 * shader uses as cavity shading: craters and cracks go dark the way they would under a single sun.
 *
 * Surface: the game's own Poly Haven lichen_rock maps (public/textures/lichen_rock, also Kethra's
 * terrace stone), mapped three ways in each rock's own space so the detail turns with it, colour taken
 * to grey (no lichen in vacuum) and the normal map giving the grain.
 *
 * Light: the same sun as the planet, a bright rim where the seen sun is behind an edge, Kethra's green
 * bounce from below, and a faint cool fill from the bright sky in front of them.
 *
 * Every rock is merged into one mesh and turned on the GPU (each vertex carries its rock's centre, spin
 * axis and rate), so the field is one draw with no per-frame JavaScript.
 */

export interface RockSpec {
  /** World position of the rock's centre. */
  at: THREE.Vector3;
  radius: number;
  /** Icosahedron subdivision: 5 for the big foreground rocks, 2 for distant debris. */
  detail: number;
}

const VERTEX = /* glsl */ `
  attribute vec3 aCenter;
  attribute vec4 aSpin;
  attribute float aSeed;
  attribute float aCavity;
  uniform float uTime;
  varying vec3 vPosW;
  varying vec3 vLocal;
  varying vec3 vLocalN;
  varying vec4 vSpin;
  varying float vSeed;
  varying float vCavity;
  vec3 spin(vec3 v, vec3 k, float a) {
    float c = cos(a);
    float s = sin(a);
    return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
  }
  void main() {
    float a = aSpin.w * uTime + aSeed * 6.2832;
    vec3 drift = vec3(sin(uTime * 0.041 + aSeed * 9.0), cos(uTime * 0.033 + aSeed * 5.0), sin(uTime * 0.027 + aSeed * 3.0)) * (0.04 + 0.06 * aSeed) * length(aCenter) * 0.02;
    vec3 world = aCenter + spin(position, aSpin.xyz, a) + drift;
    vPosW = world;
    vLocal = position;
    vLocalN = normal;
    vSpin = vec4(aSpin.xyz, a);
    vSeed = aSeed;
    vCavity = aCavity;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  precision highp float;
  uniform sampler2D uRock;
  uniform sampler2D uRockNormal;
  uniform vec3 uSunDir;
  uniform vec3 uRimDir;
  uniform vec3 uSunColor;
  uniform vec3 uBounceDir;
  uniform vec3 uBounceColor;
  uniform float uFade;
  varying vec3 vPosW;
  varying vec3 vLocal;
  varying vec3 vLocalN;
  varying vec4 vSpin;
  varying float vSeed;
  varying float vCavity;
  vec3 spin(vec3 v, vec3 k, float a) {
    float c = cos(a);
    float s = sin(a);
    return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
  }
  void main() {
    vec3 ln = normalize(vLocalN);
    vec3 w = pow(abs(ln), vec3(4.0));
    w /= w.x + w.y + w.z;
    vec3 p = vLocal * 0.42 + vSeed * 7.0;
    // Colour: three projections, taken to grey and given a per-rock tint.
    float lumX = dot(texture2D(uRock, p.zy).rgb, vec3(0.3, 0.59, 0.11));
    float lumY = dot(texture2D(uRock, p.xz).rgb, vec3(0.3, 0.59, 0.11));
    float lumZ = dot(texture2D(uRock, p.xy).rgb, vec3(0.3, 0.59, 0.11));
    float lum = lumX * w.x + lumY * w.y + lumZ * w.z;
    vec3 tint = mix(vec3(0.95, 0.92, 0.88), vec3(0.86, 0.9, 0.98), vSeed);
    vec3 albedo = tint * (0.045 + lum * 0.3);
    // Grain: the normal map in each projection (whiteout-style blend), in the rock's space, then turned.
    vec2 nx = texture2D(uRockNormal, p.zy).xy * 2.0 - 1.0;
    vec2 ny = texture2D(uRockNormal, p.xz).xy * 2.0 - 1.0;
    vec2 nz = texture2D(uRockNormal, p.xy).xy * 2.0 - 1.0;
    vec3 bent = normalize(ln + (vec3(0.0, nx.y, nx.x) * w.x + vec3(ny.x, 0.0, ny.y) * w.y + vec3(nz.x, nz.y, 0.0) * w.z) * 0.9);
    vec3 n = normalize(spin(bent, vSpin.xyz, vSpin.w));
    vec3 V = normalize(cameraPosition - vPosW);

    float cavity = 1.0 - vCavity * 0.75;
    float ndl = dot(n, uSunDir);
    float key = max(ndl * 0.9 + 0.1, 0.0) * cavity;
    // The seen sun is behind most rocks: their edges toward it catch a hard, warm rim.
    float facing = max(dot(n, V), 0.0);
    float rim = pow(1.0 - facing, 2.4) * max(dot(n, uRimDir) + 0.35, 0.0);
    float bounce = max(dot(n, uBounceDir), 0.0) * cavity;
    // With the sun behind them their faces would be black; the glow of the sky and the limb in front
    // of them gives a faint cool fill, enough for the stone to read.
    vec3 fill = vec3(0.16, 0.2, 0.26) * (0.25 + 0.75 * facing);
    vec3 col = albedo * (uSunColor * key + uBounceColor * bounce + fill);
    col += vec3(1.0, 0.9, 0.78) * rim * (0.4 + 0.9 * lum) * cavity * 1.5;
    gl_FragColor = vec4(col * uFade, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Small 3D value noise for shaping rocks on the CPU (once, at build). */
function makeNoise(seed: number) {
  const rand = mulberry32(seed);
  const perm = new Uint8Array(512);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const value = new Float32Array(256).map(() => rand());
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const fade = (t: number) => t * t * (3 - 2 * t);
  const at = (x: number, y: number, z: number) => value[perm[(perm[(perm[x & 255] + y) & 255] + z) & 255]];
  const noise = (x: number, y: number, z: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const u = fade(x - xi);
    const v = fade(y - yi);
    const w = fade(z - zi);
    return lerp(
      lerp(lerp(at(xi, yi, zi), at(xi + 1, yi, zi), u), lerp(at(xi, yi + 1, zi), at(xi + 1, yi + 1, zi), u), v),
      lerp(lerp(at(xi, yi, zi + 1), at(xi + 1, yi, zi + 1), u), lerp(at(xi, yi + 1, zi + 1), at(xi + 1, yi + 1, zi + 1), u), v),
      w,
    );
  };
  return (x: number, y: number, z: number, octaves: number) => {
    let s = 0;
    let a = 0.5;
    let f = 1;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      s += a * noise(x * f, y * f, z * f);
      norm += a;
      a *= 0.5;
      f *= 2.1;
    }
    return s / norm;
  };
}

/**
 * One rock of unit-ish radius, with its cavity attribute: an icosphere pushed out by broad noise,
 * ridged noise for cracks and edges, and craters (a bowl and a raised rim).
 */
function rockGeometry(detail: number, seed: number): THREE.BufferGeometry {
  const fbm = makeNoise(seed);
  const rand = mulberry32(seed * 7 + 1);
  let geo: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail);
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  geo = mergeVertices(geo);
  const stretch = new THREE.Vector3(1.15, 0.55 + rand() * 0.3, 0.7 + rand() * 0.25);
  const craters = Array.from({ length: 5 + Math.floor(rand() * 4) }, () => ({
    dir: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(),
    size: 0.16 + rand() * 0.32,
    depth: 0.05 + rand() * 0.08,
  }));
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const cavity = new Float32Array(pos.count);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const broad = 0.62 + 0.7 * fbm(v.x * 1.3 + 5, v.y * 1.3, v.z * 1.3, 4);
    const ridge = 1 - Math.abs(fbm(v.x * 3.2 + 17, v.y * 3.2, v.z * 3.2, 4) * 2 - 1);
    let r = broad + 0.1 * fbm(v.x * 4 + 11, v.y * 4, v.z * 4, 3) + 0.07 * ridge * ridge - 0.035;
    for (const c of craters) {
      const d = v.distanceTo(c.dir) / c.size;
      if (d < 1) r -= c.depth * (1 - d * d);
      else if (d < 1.45) r += c.depth * 0.35 * (1 - Math.abs(d - 1.2) / 0.25) * (d < 1.2 ? (d - 1) / 0.2 : 1);
    }
    cavity[i] = Math.min(1, Math.max(0, (broad - r) * 5));
    v.multiplyScalar(r).multiply(stretch);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.setAttribute('aCavity', new THREE.BufferAttribute(cavity, 1));
  geo.computeVertexNormals();
  return geo;
}

let rockMaps: { map: THREE.Texture; normal: THREE.Texture; ready: Promise<void> } | null = null;

/** The lichen_rock maps, loaded once; call early (TitleScene.preloadTitle) so the build doesn't wait. */
export function rockTextures(): { map: THREE.Texture; normal: THREE.Texture; ready: Promise<void> } {
  if (rockMaps) return rockMaps;
  const loader = new THREE.TextureLoader();
  const base = `${import.meta.env.BASE_URL}textures/lichen_rock/`;
  const load = (file: string, srgb: boolean) => {
    let settle!: () => void;
    const ready = new Promise<void>((resolve) => (settle = resolve));
    const t = loader.load(base + file, () => settle(), undefined, () => settle());
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return { t, ready };
  };
  const map = load('diff.jpg', true);
  const normal = load('nor_gl.jpg', false);
  rockMaps = { map: map.t, normal: normal.t, ready: Promise.all([map.ready, normal.ready]).then(() => undefined) };
  return rockMaps;
}

export interface AsteroidField {
  mesh: THREE.Mesh;
  update(elapsed: number): void;
  setFade(k: number): void;
  dispose(): void;
}

export interface AsteroidOptions {
  /** Toward the light that shades everything. */
  sunDir: THREE.Vector3;
  /** Toward the sun as seen: the rims. */
  rimDir: THREE.Vector3;
  /** Toward the planet's lit face: its bounce. */
  bounceDir: THREE.Vector3;
  seed?: number;
  /** Awaited between big rocks: each takes tens of milliseconds to shape. */
  pace?: () => Promise<void>;
}

export async function buildAsteroids(specs: RockSpec[], o: AsteroidOptions): Promise<AsteroidField> {
  const rand = mulberry32(o.seed ?? 0xa57e);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    const rock = rockGeometry(spec.detail, 101 + i * 37).toNonIndexed();
    rock.scale(spec.radius, spec.radius, spec.radius);
    const n = rock.getAttribute('position').count;
    const centre = new Float32Array(n * 3);
    const spinAttr = new Float32Array(n * 4);
    const seedAttr = new Float32Array(n);
    const axis = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
    // Big rocks turn slowly; small ones a little faster, as they would.
    const rate = (0.012 + rand() * 0.03) / Math.sqrt(Math.max(spec.radius, 0.3));
    const seed = rand();
    for (let k = 0; k < n; k++) {
      centre.set([spec.at.x, spec.at.y, spec.at.z], k * 3);
      spinAttr.set([axis.x, axis.y, axis.z, rate], k * 4);
      seedAttr[k] = seed;
    }
    rock.setAttribute('aCenter', new THREE.BufferAttribute(centre, 3));
    rock.setAttribute('aSpin', new THREE.BufferAttribute(spinAttr, 4));
    rock.setAttribute('aSeed', new THREE.BufferAttribute(seedAttr, 1));
    parts.push(rock);
    if (spec.detail >= 4) await o.pace?.();
  }
  const geo = mergeGeometries(parts, false)!;
  for (const g of parts) g.dispose();
  const maps = rockTextures();
  const uniforms = {
    uRock: { value: maps.map },
    uRockNormal: { value: maps.normal },
    uSunDir: { value: o.sunDir },
    uRimDir: { value: o.rimDir },
    uSunColor: { value: new THREE.Color(1.0, 0.95, 0.88).multiplyScalar(1.7) },
    uBounceDir: { value: o.bounceDir },
    uBounceColor: { value: new THREE.Color(0x3f8a5a).multiplyScalar(0.4) },
    uTime: { value: 0 },
    uFade: { value: 0 },
  };
  const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader: FRAGMENT, uniforms }));
  mesh.name = 'title-asteroids';
  // The vertices are placed in the shader, so the mesh's own bounds mean nothing.
  mesh.frustumCulled = false;
  await maps.ready;
  return {
    mesh,
    update(elapsed) {
      uniforms.uTime.value = elapsed;
    },
    setFade(k) {
      uniforms.uFade.value = k;
    },
    dispose() {
      geo.dispose();
      mesh.material.dispose();
    },
  };
}
