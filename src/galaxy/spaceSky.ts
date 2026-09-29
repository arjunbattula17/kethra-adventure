import * as THREE from 'three';
import { mulberry32 } from '../core/rng';

/**
 * The procedural sky shared by the space scenes: a dark dome with a faint galactic band, and a
 * sparse star field. Both follow the camera, so they sit at infinity, and draw first with no depth
 * test, so everything in the scene draws over them.
 */

/** Approximate linear RGB of a black body at `kelvin` (Tanner Helland's fit, normalised). */
export function blackbody(kelvin: number, out: THREE.Color): THREE.Color {
  const t = kelvin / 100;
  let r: number;
  let g: number;
  let b: number;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }
  out.setRGB(Math.min(255, Math.max(0, r)) / 255, Math.min(255, Math.max(0, g)) / 255, Math.min(255, Math.max(0, b)) / 255, THREE.SRGBColorSpace);
  return out;
}

/** The galactic band's pole: the band runs round the great circle perpendicular to it. */
const BAND_POLE = new THREE.Vector3(0.28, 0.93, -0.24).normalize();

const domeVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const domeFragment = /* glsl */ `
  precision highp float;
  uniform vec3 uVoid;
  uniform vec3 uBand;
  uniform vec3 uPole;
  uniform float uBrightness;
  varying vec3 vDir;
  float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  float noise(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  void main() {
    vec3 d = normalize(vDir);
    float lat = dot(d, uPole);
    // Two octaves of noise give the band an uneven edge.
    float n = noise(d * 3.1) * 0.6 + noise(d * 7.3) * 0.4;
    float band = exp(-lat * lat / (0.05 + 0.03 * n)) * (0.55 + 0.45 * n);
    vec3 col = uVoid + uBand * band;
    col *= uBrightness;
    // Dither: a dark gradient bands visibly in 8 bits without it.
    col += (hash(vec3(gl_FragCoord.xy, 1.0)) - 0.5) / 255.0 * 0.6;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const starVertex = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  uniform float uPixelRatio;
  uniform float uBrightness;
  varying vec3 vColor;
  varying float vSize;
  void main() {
    vColor = aColor * uBrightness;
    vSize = aSize * uPixelRatio;
    gl_PointSize = vSize + 2.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const starFragment = /* glsl */ `
  precision highp float;
  varying vec3 vColor;
  varying float vSize;
  void main() {
    // A sharp core with a thin halo, sized in real pixels so a star stays a point at any resolution.
    float r = length(gl_PointCoord - 0.5) * (vSize + 2.0);
    float core = exp(-r * r / max(0.35, vSize * 0.18));
    float halo = exp(-r / max(0.8, vSize * 0.55)) * 0.12;
    gl_FragColor = vec4(vColor * (core + halo), 1.0);
  }
`;

export interface SpaceSky {
  group: THREE.Group;
  /** Call every frame with the camera, so the sky stays at infinity. */
  update(camera: THREE.Camera): void;
  /** Multiplies the brightness of the dome and the stars. */
  setBrightness(k: number): void;
}

export function buildSpaceSky(opts: { seed?: number; stars?: number } = {}): SpaceSky {
  const rand = mulberry32(opts.seed ?? 0x5ea5);
  const count = opts.stars ?? 3000;
  const group = new THREE.Group();
  group.name = 'space-sky';

  const brightness = { value: 1 };
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(10, 32, 16),
    new THREE.ShaderMaterial({
      uniforms: {
        uVoid: { value: new THREE.Color(0x07080a) },
        uBand: { value: new THREE.Color(0x0b0d14) },
        uPole: { value: BAND_POLE },
        uBrightness: brightness,
      },
      vertexShader: domeVertex,
      fragmentShader: domeFragment,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
    }),
  );
  dome.renderOrder = -1000;
  dome.frustumCulled = false;
  group.add(dome);

  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const dir = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    // Magnitude first: the brightest stars are rare. Faint ones crowd toward the band.
    const m = Math.pow(rand(), 7);
    for (let tries = 0; tries < 12; tries++) {
      dir.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1);
      const len = dir.length();
      if (len < 1e-3 || len > 1) continue;
      dir.divideScalar(len);
      const lat = dir.dot(BAND_POLE);
      const keep = m > 0.05 ? 1 : 0.3 + 0.7 * Math.exp(-(lat * lat) / 0.04);
      if (rand() < keep) break;
    }
    positions[i * 3] = dir.x * 9;
    positions[i * 3 + 1] = dir.y * 9;
    positions[i * 3 + 2] = dir.z * 9;
    // Mostly sun-like whites, a few cool blues and warm oranges.
    const tpick = rand();
    const kelvin = tpick < 0.12 ? 3200 + rand() * 1200 : tpick > 0.88 ? 9000 + rand() * 5000 : 5200 + rand() * 2600;
    blackbody(kelvin, c);
    const intensity = 0.1 + m * 2.4;
    colors[i * 3] = c.r * intensity;
    colors[i * 3 + 1] = c.g * intensity;
    colors[i * 3 + 2] = c.b * intensity;
    sizes[i] = 0.9 + m * 2.6;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  const pixelRatio = { value: 1 };
  const stars = new THREE.Points(
    geo,
    new THREE.ShaderMaterial({
      uniforms: { uPixelRatio: pixelRatio, uBrightness: brightness },
      vertexShader: starVertex,
      fragmentShader: starFragment,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    }),
  );
  stars.renderOrder = -999;
  stars.frustumCulled = false;
  // Keep the render target's pixel ratio current, so star size is in screen pixels on any display.
  stars.onBeforeRender = (renderer) => {
    pixelRatio.value = renderer.getPixelRatio();
  };
  group.add(stars);

  return {
    group,
    update(camera) {
      camera.getWorldPosition(group.position);
    },
    setBrightness(k) {
      brightness.value = k;
    },
  };
}
