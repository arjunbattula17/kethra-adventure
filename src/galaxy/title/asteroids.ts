import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../../core/rng';

/**
 * Rocks of the belt Kethra orbits just outside (LORE.md, "The world"), streaming past along the bottom
 * of the frame, with small debris drifting at every depth, for depth and parallax.
 *
 * Shapes: an icosphere pushed out by noise, cut by ridges, sheared off along a few fracture planes
 * (the flat broken faces that make a rock read as rock, not a potato), and pocked with craters (a
 * bowl and a raised rim each). Each vertex also records how far it sits below the rock's broad shape,
 * which the shader uses as cavity shading: craters and cracks go dark the way they would under a
 * single sun.
 *
 * Surface: the game's own Poly Haven lichen_rock maps (public/textures/lichen_rock, also Kethra's
 * terrace stone), mapped three ways in each rock's own space so the detail turns with it, colour taken
 * to grey (no lichen in vacuum) and the normal map giving the grain.
 *
 * Light: the same sun as the planet, a bright rim where the seen sun is behind an edge, Kethra's green
 * bounce from below, and a faint cool fill from the bright sky in front of them.
 *
 * Two fields, both drawn with the same surface shader:
 *
 * - Large rocks (buildAsteroids): a fixed pool of distinct rocks (chunky, elongated, angular), merged
 *   into one mesh and placed on the GPU from per-rock uniforms (centre, spin) that one controller here
 *   moves on the CPU. Each rock has its own distance, speed, slight sink or approach and spin; the
 *   flow trends rightward along the bottom of the frame. A rock that has left the frame is dealt a fresh
 *   pass and starts again just outside the left edge, so nothing appears in view.
 * - Small debris (buildDebris): many cheap instanced rocks, each with a drift fixed at build (a seeded
 *   random direction across the screen, nearer ones a little faster) and a spin; moved entirely on the
 *   GPU, wrapping out of view.
 */

/**
 * Shape classes: chunky, elongated and angular for the large pool; pebble (rounded, gently lumpy, only
 * a shallow facet or two) for the small debris, which at a few pixels would otherwise read as shards.
 */
export type RockShape = 'chunky' | 'elongated' | 'angular' | 'pebble';

const SPIN_GLSL = /* glsl */ `
  vec3 spin(vec3 v, vec3 k, float a) {
    float c = cos(a);
    float s = sin(a);
    return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
  }
`;

const VARYINGS = /* glsl */ `
  attribute float aCavity;
  varying vec3 vPosW;
  varying vec3 vLocal;
  varying vec3 vLocalN;
  varying vec4 vSpin;
  varying float vSeed;
  varying float vCavity;
`;

/** Large rocks: each vertex knows its rock (aRock); the rock's centre and turn come from uniforms. */
const LARGE_VERTEX = (count: number) => /* glsl */ `
  attribute float aRock;
  attribute float aSeed;
  uniform vec3 uCenter[${count}];
  uniform vec4 uSpin[${count}];
  ${VARYINGS}
  ${SPIN_GLSL}
  void main() {
    int i = int(aRock + 0.5);
    vec4 turn = uSpin[i];
    vec3 world = uCenter[i] + spin(position, turn.xyz, turn.w);
    vPosW = world;
    vLocal = position;
    vLocalN = normal;
    vSpin = turn;
    vSeed = aSeed;
    vCavity = aCavity;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

/**
 * Small debris: each instance has a screen point, a distance and a size (aSlot), a drift across the
 * screen (aDrift, in frame widths and heights per second) and a spin. Its screen point wraps inside
 * uWrap (min u, min v, span u, span v), a box wider than the view, so it leaves and re-enters unseen.
 */
const DEBRIS_VERTEX = /* glsl */ `
  attribute vec4 aSlot;
  attribute vec2 aDrift;
  attribute vec4 aSpin;
  attribute float aSeed;
  uniform float uTime;
  uniform vec2 uTan;
  uniform vec4 uWrap;
  ${VARYINGS}
  ${SPIN_GLSL}
  void main() {
    vec2 uv = uWrap.xy + mod(aSlot.xy + aDrift * uTime - uWrap.xy, uWrap.zw);
    vec3 centre = normalize(vec3((2.0 * uv.x - 1.0) * uTan.x, (1.0 - 2.0 * uv.y) * uTan.y, -1.0)) * aSlot.z;
    float a = aSpin.w * uTime + aSeed * 6.2832;
    vec3 world = centre + spin(position * aSlot.w, aSpin.xyz, a);
    vPosW = world;
    vLocal = position;
    vLocalN = normal;
    vSpin = vec4(aSpin.xyz, a);
    vSeed = aSeed;
    vCavity = aCavity;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

/** A formation that never moves: its vertices are already where they belong (formations.ts). */
export const STATIC_VERTEX = /* glsl */ `
  attribute float aSeed;
  ${VARYINGS}
  void main() {
    vPosW = position;
    vLocal = position;
    vLocalN = normal;
    vSpin = vec4(0.0, 1.0, 0.0, 0.0);
    vSeed = aSeed;
    vCavity = aCavity;
    gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Rubble in a ring plane (ringworld.ts): each instance on its own circular orbit (aOrbit: radius,
 * starting angle, angular rate, height off the plane) about uOrbitCenter, in the plane whose basis is
 * uOrbitBasis (local X and Z in the plane, Y its normal); aSize its radius.
 */
export const ORBIT_VERTEX = /* glsl */ `
  attribute vec4 aOrbit;
  attribute vec4 aSpin;
  attribute float aSize;
  attribute float aSeed;
  uniform float uTime;
  uniform vec3 uOrbitCenter;
  uniform mat3 uOrbitBasis;
  ${VARYINGS}
  ${SPIN_GLSL}
  void main() {
    float a = aOrbit.y + aOrbit.z * uTime;
    vec3 centre = uOrbitCenter + uOrbitBasis * vec3(cos(a) * aOrbit.x, aOrbit.w, sin(a) * aOrbit.x);
    float turn = aSpin.w * uTime + aSeed * 6.2832;
    vec3 world = centre + spin(position * aSize, aSpin.xyz, turn);
    vPosW = world;
    vLocal = position;
    vLocalN = normal;
    vSpin = vec4(aSpin.xyz, turn);
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
  uniform vec3 uFill;
  uniform vec3 uRimColor;
  uniform vec2 uAlbedo;
  uniform float uTexScale;
  uniform float uFade;
  varying vec3 vPosW;
  varying vec3 vLocal;
  varying vec3 vLocalN;
  varying vec4 vSpin;
  varying float vSeed;
  varying float vCavity;
  #ifdef OCCLUDERS
  // Spheres standing in for the astronaut: their occlusion and their soft shadow from the key. The
  // loop runs to a uniform (the count) so Direct3D keeps it a loop: unrolled, the driver was still
  // compiling it when the backdrop first drew, a 0.3-0.5 s frame in the dissolve.
  uniform vec4 uOcc[OCCLUDERS];
  uniform int uOccCount;
  // A sphere round all of them: rock further away than this from it is left alone (most of the screen).
  uniform vec4 uOccBound;
  float contact(vec3 p, vec3 n) {
    if (distance(p, uOccBound.xyz) > uOccBound.w) return 1.0;
    float ao = 1.0;
    float sh = 1.0;
    for (int i = 0; i < OCCLUDERS; i++) {
      if (i >= uOccCount) break;
      vec3 d = uOcc[i].xyz - p;
      float r = uOcc[i].w;
      float l = length(d);
      ao *= 1.0 - clamp(dot(n, d / l) * (r * r) / (l * l), 0.0, 1.0) * 0.85;
      float b = dot(d, uSunDir);
      if (b > 0.0) {
        float h = length(d - uSunDir * b);
        sh = min(sh, smoothstep(r * 0.55, r * 0.55 + b * 0.25 + 0.02, h));
      }
    }
    return ao * mix(0.35, 1.0, sh);
  }
  #endif
  vec3 spin(vec3 v, vec3 k, float a) {
    float c = cos(a);
    float s = sin(a);
    return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
  }
  void main() {
    vec3 ln = normalize(vLocalN);
    vec3 w = pow(abs(ln), vec3(4.0));
    w /= w.x + w.y + w.z;
    vec3 p = vLocal * uTexScale + vSeed * 7.0;
    // Colour: three projections, taken to grey and given a per-rock tint.
    float lumX = dot(texture2D(uRock, p.zy).rgb, vec3(0.3, 0.59, 0.11));
    float lumY = dot(texture2D(uRock, p.xz).rgb, vec3(0.3, 0.59, 0.11));
    float lumZ = dot(texture2D(uRock, p.xy).rgb, vec3(0.3, 0.59, 0.11));
    float lum = lumX * w.x + lumY * w.y + lumZ * w.z;
    vec3 tint = mix(vec3(0.95, 0.92, 0.88), vec3(0.86, 0.9, 0.98), vSeed);
    vec3 albedo = tint * (uAlbedo.x + lum * uAlbedo.y);
    // Grain: the normal map in each projection (whiteout-style blend), in the rock's space, then turned.
    vec2 nx = texture2D(uRockNormal, p.zy).xy * 2.0 - 1.0;
    vec2 ny = texture2D(uRockNormal, p.xz).xy * 2.0 - 1.0;
    vec2 nz = texture2D(uRockNormal, p.xy).xy * 2.0 - 1.0;
    vec3 bent = normalize(ln + (vec3(0.0, nx.y, nx.x) * w.x + vec3(ny.x, 0.0, ny.y) * w.y + vec3(nz.x, nz.y, 0.0) * w.z) * 0.9);
    vec3 n = normalize(spin(bent, vSpin.xyz, vSpin.w));
    vec3 V = normalize(cameraPosition - vPosW);

    float cavity = 1.0 - vCavity * 0.75;
    #ifdef OCCLUDERS
    cavity *= contact(vPosW, n);
    #endif
    float ndl = dot(n, uSunDir);
    float key = max(ndl * 0.9 + 0.1, 0.0) * cavity;
    // The seen sun is behind most rocks: their edges toward it catch a hard, warm rim.
    float facing = max(dot(n, V), 0.0);
    float rim = pow(1.0 - facing, 2.4) * max(dot(n, uRimDir) + 0.35, 0.0);
    float bounce = max(dot(n, uBounceDir), 0.0) * cavity;
    // With the sun behind them their faces would be black; the glow of the sky and the limb in front
    // of them gives a faint cool fill, enough for the stone to read.
    vec3 fill = uFill * (0.25 + 0.75 * facing);
    vec3 col = albedo * (uSunColor * key + uBounceColor * bounce + fill);
    col += uRimColor * rim * (0.4 + 0.9 * lum) * cavity;
    gl_FragColor = vec4(col * uFade, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Small 3D value noise for shaping rocks on the CPU (once, at build). */
export function makeNoise(seed: number) {
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
/** Extra shaping for a placed formation: fracture planes of its own (unit-sphere space, before the stretch) and its own stretch. */
export interface RockExtra {
  cuts?: { n: THREE.Vector3; d: number }[];
  stretch?: THREE.Vector3;
}

export function rockGeometry(detail: number, seed: number, shape: RockShape = 'chunky', extra: RockExtra = {}): THREE.BufferGeometry {
  const fbm = makeNoise(seed);
  const rand = mulberry32(seed * 7 + 1);
  let geo: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail);
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  geo = mergeVertices(geo);
  const pebble = shape === 'pebble';
  const stretch =
    extra.stretch ??
    (shape === 'elongated'
      ? new THREE.Vector3(1.5 + rand() * 0.25, 0.6 + rand() * 0.15, 0.65 + rand() * 0.15)
      : shape === 'angular'
        ? new THREE.Vector3(1.05, 0.75 + rand() * 0.2, 0.8 + rand() * 0.15)
        : pebble
          ? new THREE.Vector3(1.12, 0.8 + rand() * 0.15, 0.85 + rand() * 0.15)
          : new THREE.Vector3(1.15, 0.6 + rand() * 0.25, 0.72 + rand() * 0.23));
  // Angular rocks are cut harder: more planes, closer in, so broad flat faces dominate. Pebbles keep a
  // shallow facet or two.
  const cutCount = shape === 'angular' ? 5 + Math.floor(rand() * 3) : pebble ? 1 + Math.floor(rand() * 2) : 3 + Math.floor(rand() * 4);
  const cutDepth = shape === 'angular' ? 0.56 : pebble ? 0.86 : 0.62;
  // How lumpy the broad shape is, and how much ridging: pebbles are smooth.
  const lump = pebble ? 0.25 : 0.7;
  const ridging = pebble ? 0 : 0.07;
  const craters = Array.from({ length: (pebble ? 2 : 5) + Math.floor(rand() * 4) }, () => ({
    dir: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(),
    size: 0.16 + rand() * 0.32,
    depth: 0.05 + rand() * 0.08,
  }));
  // Fracture planes: each shears off whatever stands proud of it, leaving a broad flat face.
  const cuts = Array.from({ length: cutCount }, () => ({
    n: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(),
    d: cutDepth + rand() * 0.22,
  })).concat(extra.cuts ?? []);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const cavity = new Float32Array(pos.count);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const broad = 0.97 - lump * 0.5 + lump * fbm(v.x * 1.3 + 5, v.y * 1.3, v.z * 1.3, 4);
    const ridge = 1 - Math.abs(fbm(v.x * 3.2 + 17, v.y * 3.2, v.z * 3.2, 4) * 2 - 1);
    let r = broad + (pebble ? 0.04 : 0.1) * fbm(v.x * 4 + 11, v.y * 4, v.z * 4, 3) + ridging * ridge * ridge - 0.035;
    for (const c of craters) {
      const d = v.distanceTo(c.dir) / c.size;
      if (d < 1) r -= c.depth * (1 - d * d);
      else if (d < 1.45) r += c.depth * 0.35 * (1 - Math.abs(d - 1.2) / 0.25) * (d < 1.2 ? (d - 1) / 0.2 : 1);
    }
    // Cavity before the cuts: a broken face is open to the sun, not a hollow.
    cavity[i] = Math.min(1, Math.max(0, (broad - r) * 5));
    for (const c of cuts) {
      const along = v.dot(c.n);
      // The cut face keeps a little grain of its own, so it reads as broken stone, not a machined flat.
      if (along > 0.05) r = Math.min(r, (c.d + 0.025 * fbm(v.x * 6 + 3, v.y * 6, v.z * 6, 2)) / along);
    }
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

/** The light both fields are shaded by. */
export interface RockLight {
  /** Toward the light that shades everything. */
  sunDir: THREE.Vector3;
  /** Toward the sun as seen: the rims. */
  rimDir: THREE.Vector3;
  /** Toward the planet's lit face: its bounce. */
  bounceDir: THREE.Vector3;
  /**
   * The light's colour and strength, the bounce's, the fill from in front, the rim's gain over the light
   * (without it, the Kethra title's warm rim), and the stone's albedo (base, and how much the map adds).
   */
  sunColor?: THREE.Color;
  bounceColor?: THREE.Color;
  fillColor?: THREE.Color;
  rimGain?: number;
  albedo?: [number, number];
}

export function rockMaterial(vertexShader: string, light: RockLight, extra: Record<string, THREE.IUniform>, fade: THREE.IUniform<number>, texScale = 0.42, defines: Record<string, number> = {}): THREE.ShaderMaterial {
  const maps = rockTextures();
  return new THREE.ShaderMaterial({
    defines,
    vertexShader,
    fragmentShader: FRAGMENT,
    uniforms: {
      uRock: { value: maps.map },
      uRockNormal: { value: maps.normal },
      uSunDir: { value: light.sunDir },
      uRimDir: { value: light.rimDir },
      uSunColor: { value: light.sunColor ?? new THREE.Color(1.0, 0.95, 0.88).multiplyScalar(1.7) },
      uBounceDir: { value: light.bounceDir },
      uBounceColor: { value: light.bounceColor ?? new THREE.Color(0x3f8a5a).multiplyScalar(0.4) },
      uFill: { value: light.fillColor ?? new THREE.Color(0.16, 0.2, 0.26) },
      uRimColor: { value: light.rimGain === undefined ? new THREE.Color(1.0, 0.9, 0.78).multiplyScalar(1.5) : (light.sunColor ?? new THREE.Color(1.0, 0.95, 0.88).multiplyScalar(1.7)).clone().multiplyScalar(light.rimGain) },
      uAlbedo: { value: new THREE.Vector2(...(light.albedo ?? [0.045, 0.3])) },
      uTexScale: { value: texScale },
      uFade: fade,
      ...extra,
    },
  });
}

/** Tangents of the half field of view the composition is authored on (16:9, camera at rest). */
export interface FieldView {
  tanH: number;
  tanV: number;
}

const lerp = (r: [number, number], t: number) => r[0] + (r[1] - r[0]) * t;
const TAU = Math.PI * 2;

// ------------------------------------------------------------------ large rocks

export interface LargeRockOptions extends RockLight {
  /** The pool, biggest first (they pass nearest): radius, shape, icosahedron subdivision. */
  pool: [number, RockShape, number][];
  /** Distance of the first rock and of the last; the others spread between (log), overlapping a little. */
  distance: [number, number];
  /** No rock's top rises above this line of the frame (0 top, 1 bottom). */
  bandTop: number;
  /** How much lower than bandTop a rock's top may start, as a fraction of the frame's height. */
  bandDepth: number;
  /** Seconds a rock takes to cross the frame's width at its distance: [fastest, slowest]. */
  crossing: [number, number];
  /** Sink (down) and approach (toward the camera), as fractions of the rightward speed: [min, max]. */
  sink: [number, number];
  approach: [number, number];
  /** Spin, radians per second for a rock of radius 1; smaller rocks turn faster (1/sqrt of radius). */
  spin: [number, number];
  /** Points the first layout keeps clear of (the ship's way in), by this much beyond a rock's size. */
  avoid?: { points: THREE.Vector3[]; clearance: number };
  view: FieldView;
  seed: number;
  /** Awaited between big rocks: each takes tens of milliseconds to shape. */
  pace?: () => Promise<void>;
}

export interface LargeRocks {
  mesh: THREE.Mesh;
  update(dt: number): void;
  /** The window's horizontal and vertical half-view tangents, so passes start and end just outside it. */
  setView(tanH: number, tanV: number): void;
  setFade(k: number): void;
  /** Where each rock is in the 16:9 frame (0..1 from the top left), its distance, and how many passes it has made. */
  report(): { x: number; y: number; d: number; passes: number }[];
  dispose(): void;
}

/** A rock nearer than this is dealt a new pass. */
const NEAREST = 3;

export async function buildAsteroids(o: LargeRockOptions): Promise<LargeRocks> {
  const rand = mulberry32(o.seed);
  const count = o.pool.length;
  const parts: THREE.BufferGeometry[] = [];
  // Each rock's farthest point from its own centre (it turns about that).
  const extent = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const [radius, shape, detail] = o.pool[i];
    const rock = rockGeometry(detail, 101 + i * 37, shape).toNonIndexed();
    rock.scale(radius, radius, radius);
    const pos = rock.getAttribute('position') as THREE.BufferAttribute;
    for (let k = 0; k < pos.count; k++) extent[i] = Math.max(extent[i], Math.hypot(pos.getX(k), pos.getY(k), pos.getZ(k)));
    rock.setAttribute('aRock', new THREE.BufferAttribute(new Float32Array(pos.count).fill(i), 1));
    rock.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(pos.count).fill(rand()), 1));
    parts.push(rock);
    if (detail >= 4) await o.pace?.();
  }
  const geo = mergeGeometries(parts, false)!;
  for (const g of parts) g.dispose();

  const centres = Array.from({ length: count }, () => new THREE.Vector3());
  const spins = Array.from({ length: count }, () => new THREE.Vector4());
  const velocity = Array.from({ length: count }, () => new THREE.Vector3());
  const rate = new Float32Array(count);
  const passes = new Uint16Array(count);
  const fade = { value: 0 };
  const mesh = new THREE.Mesh(geo, rockMaterial(LARGE_VERTEX(count), o, { uCenter: { value: centres }, uSpin: { value: spins } }, fade));
  mesh.name = 'title-asteroids';
  // The vertices are placed in the shader, so the mesh's own bounds mean nothing.
  mesh.frustumCulled = false;

  const { tanH, tanV } = o.view;
  let viewH = tanH;
  let viewV = tanV;
  const dir = new THREE.Vector3();

  /**
   * Deals rock i a fresh pass: distance, height in the band, speed, sink, approach and spin. Its centre
   * goes at frame x `sx`, or (null) just outside the left edge of the view.
   */
  const deal = (i: number, sx: number | null) => {
    const t = THREE.MathUtils.clamp(i / Math.max(count - 1, 1) + (rand() - 0.5) * 0.3, 0, 1);
    const dist = o.distance[0] * Math.pow(o.distance[1] / o.distance[0], t);
    const size = extent[i] / dist;
    const x = sx ?? 0.5 - (0.5 * viewH) / tanH - size / (2 * tanH) - 0.02;
    const y = o.bandTop + size / (2 * tanV) + rand() * o.bandDepth;
    centres[i].copy(dir.set((2 * x - 1) * tanH, (1 - 2 * y) * tanV, -1).normalize()).multiplyScalar(dist);
    const speed = (2 * dist * tanH) / lerp(o.crossing, rand());
    velocity[i].set(speed, -speed * lerp(o.sink, rand()), speed * lerp(o.approach, rand()));
    spins[i].set(rand() - 0.5, rand() - 0.5, rand() - 0.5, 0).normalize();
    spins[i].w = rand() * TAU;
    rate[i] = (lerp(o.spin, rand()) / Math.sqrt(Math.max(o.pool[i][0], 0.3))) * (rand() < 0.5 ? -1 : 1);
    passes[i]++;
  };
  const clear = (i: number) => !o.avoid || o.avoid.points.every((p) => p.distanceTo(centres[i]) > extent[i] + o.avoid!.clearance);

  // First layout: spread across the frame (stratified, shuffled), clear of the ship's way in; a rock
  // that finds no clear place starts just outside the left edge instead.
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  for (let k = 0; k < count; k++) {
    const i = order[k];
    let placed = false;
    for (let tries = 0; tries < 24 && !placed; tries++) {
      deal(i, -0.05 + (1.1 * (k + rand())) / count);
      placed = clear(i);
    }
    if (!placed) deal(i, null);
    passes[i] = 0;
  }

  await rockTextures().ready;
  return {
    mesh,
    update(dt) {
      const step = Math.min(dt, 0.1);
      const right = 0.5 + (0.5 * viewH) / tanH + 0.02;
      const bottom = 0.5 + (0.5 * viewV) / tanV + 0.02;
      for (let i = 0; i < count; i++) {
        const c = centres[i].addScaledVector(velocity[i], step);
        spins[i].w = (spins[i].w + rate[i] * step) % TAU;
        const depth = -c.z;
        if (depth < NEAREST) {
          deal(i, null);
          continue;
        }
        const size = extent[i] / depth;
        const sx = 0.5 + (0.5 * c.x) / depth / tanH - size / (2 * tanH);
        const sy = 0.5 - (0.5 * c.y) / depth / tanV - size / (2 * tanV);
        // Wholly past the right edge, below the bottom or above the top: a new pass from the left.
        if (sx > right || sy > bottom || sy + size / tanV < 1 - bottom) deal(i, null);
      }
    },
    setView(h, v) {
      viewH = Math.max(h, tanH);
      viewV = Math.max(v, tanV);
    },
    setFade(k) {
      fade.value = k;
    },
    report() {
      return centres.map((c, i) => ({ x: 0.5 + (0.5 * c.x) / -c.z / tanH, y: 0.5 - (0.5 * c.y) / -c.z / tanV, d: -c.z, passes: passes[i] }));
    },
    dispose() {
      geo.dispose();
      mesh.material.dispose();
    },
  };
}

// ------------------------------------------------------------------ small debris

export interface DebrisOptions extends RockLight {
  count: number;
  /** Distances, nearest and farthest (spread log). */
  distance: [number, number];
  /** Radius as a fraction of distance (the tangent of its angular radius): [min, max]. */
  size: [number, number];
  /** Drift across the screen, in frame widths per second at `driftAt`: [min, max]. */
  drift: [number, number];
  /** The distance at which drift is as given; nearer rocks drift faster by (driftAt / distance)^parallax. */
  driftAt: number;
  parallax: number;
  /** Spin, radians per second: [min, max]. */
  spin: [number, number];
  view: FieldView;
  seed: number;
}

export interface Debris {
  group: THREE.Group;
  update(elapsed: number): void;
  /** The window's horizontal and vertical half-view tangents: the wrap box is kept just outside them. */
  setView(tanH: number, tanV: number): void;
  setFade(k: number): void;
  dispose(): void;
}

/** How far outside the view (in frame fractions) a rock wraps: its own size plus the camera's drift. */
const WRAP_MARGIN = 0.06;

export function buildDebris(o: DebrisOptions): Debris {
  const rand = mulberry32(o.seed);
  const { tanH, tanV } = o.view;
  const time = { value: 0 };
  const fade = { value: 0 };
  const wrap = { value: new THREE.Vector4() };
  const setWrap = (h: number, v: number) => {
    const hu = (0.5 * Math.max(h, tanH)) / tanH + WRAP_MARGIN;
    const hv = (0.5 * Math.max(v, tanV)) / tanV + WRAP_MARGIN;
    wrap.value.set(0.5 - hu, 0.5 - hv, 2 * hu, 2 * hv);
  };
  setWrap(tanH, tanV);
  const material = rockMaterial(DEBRIS_VERTEX, o, { uTime: time, uTan: { value: new THREE.Vector2(tanH, tanV) }, uWrap: wrap }, fade);
  const group = new THREE.Group();
  group.name = 'title-debris';
  // Three pebbles of different seeds: rounded at any size.
  const shapes: RockShape[] = ['pebble', 'pebble', 'pebble'];
  const geos: THREE.BufferGeometry[] = [];
  let left = o.count;
  shapes.forEach((shape, s) => {
    const n = s === shapes.length - 1 ? left : Math.round(o.count / shapes.length);
    left -= n;
    const base = rockGeometry(2, 911 + s * 53, shape);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    for (const name of ['position', 'normal', 'aCavity']) geo.setAttribute(name, base.getAttribute(name));
    geo.instanceCount = n;
    const slot = new Float32Array(n * 4);
    const drift = new Float32Array(n * 2);
    const spin = new Float32Array(n * 4);
    const seed = new Float32Array(n);
    const axis = new THREE.Vector3();
    for (let k = 0; k < n; k++) {
      const d = o.distance[0] * Math.pow(o.distance[1] / o.distance[0], rand());
      slot.set([rand(), rand(), d, d * lerp(o.size, rand())], k * 4);
      const speed = lerp(o.drift, rand()) * Math.pow(o.driftAt / d, o.parallax);
      const heading = rand() * TAU;
      // In frame widths and heights: the same speed on screen whichever way it heads.
      drift.set([Math.cos(heading) * speed, Math.sin(heading) * speed * (tanH / tanV)], k * 2);
      axis.set(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
      spin.set([axis.x, axis.y, axis.z, lerp(o.spin, rand()) * (rand() < 0.5 ? -1 : 1)], k * 4);
      seed[k] = rand();
    }
    geo.setAttribute('aSlot', new THREE.InstancedBufferAttribute(slot, 4));
    geo.setAttribute('aDrift', new THREE.InstancedBufferAttribute(drift, 2));
    geo.setAttribute('aSpin', new THREE.InstancedBufferAttribute(spin, 4));
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));
    geos.push(geo);
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = `title-debris-${s}`;
    // Placed in the shader.
    mesh.frustumCulled = false;
    group.add(mesh);
  });
  return {
    group,
    update(elapsed) {
      time.value = elapsed;
    },
    setView: setWrap,
    setFade(k) {
      fade.value = k;
    },
    dispose() {
      for (const g of geos) g.dispose();
      material.dispose();
    },
  };
}
