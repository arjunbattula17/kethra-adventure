import * as THREE from 'three';
import { mulberry32 } from '../../core/rng';
import { blackbody } from '../spaceSky';
import { bakeInto } from './bake';

/**
 * The title's sky: a faint galactic band with dust lanes and blue nebulosity, and three layers of
 * stars (a dense faint field, brighter stars, and a few with diffraction spikes).
 *
 * The title camera looks down -Z and never turns more than a degree, so the nebula is baked once into a
 * "sky card": a texture over the tangent plane z = -1, |x| < HALF.x, |y| < HALF.y. Each frame the dome
 * reads one texel per pixel instead of evaluating the noise. The bake stores sqrt(colour / 0.25) so an
 * 8-bit target keeps its precision in the near-black range, and the band density in alpha, which the
 * dome uses to sprinkle unresolved stars (fine grain from the detail sheet) at screen resolution.
 */

export const SKY_HALF = new THREE.Vector2(1.35, 0.95);

/** The band's spine and its brightest knot, in tangent-plane coordinates (x / -z, y / -z). */
export interface BandShape {
  from: THREE.Vector2;
  to: THREE.Vector2;
  core: THREE.Vector2;
}

const VALUE_NOISE = /* glsl */ `
  // Sine-free hash (Hoskins): sin() of large arguments loses precision on some GPU compilers (Direct3D
  // through ANGLE here), and a sin hash then turns into visible blocks.
  float vhash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(vhash(i), vhash(i + vec2(1.0, 0.0)), f.x), mix(vhash(i + vec2(0.0, 1.0)), vhash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  // The loop bound is a uniform (6) so the compiler keeps a loop (see bake.ts, PERIODIC_NOISE).
  uniform int uLoop;
  float vfbm(vec2 p) {
    float s = 0.0;
    float a = 0.5;
    for (int i = 0; i < uLoop; i++) {
      s += a * vnoise(p);
      p = p * 2.03 + vec2(17.1, 9.3);
      a *= 0.5;
    }
    return s / 0.984;
  }
`;

const CARD_FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform vec2 uHalf;
  uniform vec2 uFrom;
  uniform vec2 uTo;
  uniform vec2 uCore;
  ${VALUE_NOISE}
  void main() {
    vec2 p = (vUv * 2.0 - 1.0) * uHalf;
    vec2 ab = uTo - uFrom;
    float len = length(ab);
    vec2 dir = ab / len;
    vec2 nrm = vec2(-dir.y, dir.x);
    float along = dot(p - uFrom, dir) / len;
    float across = dot(p - uFrom, nrm);
    across += (vfbm(p * 2.2 + 3.1) - 0.5) * 0.24 + (vfbm(p * 5.0 - 1.7) - 0.5) * 0.07;
    float width = 0.15 + 0.11 * vfbm(p * 1.3 + 7.0);
    float band = exp(-across * across / (width * width));
    band *= smoothstep(-0.3, 0.2, along) * (1.0 - smoothstep(0.9, 1.4, along));

    vec2 q = vec2(vfbm(p * 1.8), vfbm(p * 1.8 + vec2(5.2, 1.3)));
    float neb = vfbm(p * 2.6 + q * 1.6);
    float neb2 = vfbm(p * 7.0 + q * 3.0);
    float lanes = smoothstep(0.5, 0.74, vfbm(p * 3.6 + q * 2.4 + 11.0));
    float knot = exp(-dot(p - uCore, p - uCore) / 0.06);

    float density = band * (0.35 + 0.85 * neb) * (0.65 + 0.55 * neb2);
    vec3 col = vec3(0.0015, 0.0027, 0.0060);
    col += vec3(0.0022, 0.0055, 0.0130) * smoothstep(0.0, 1.0, band * 0.8 + neb * 0.3);
    col += vec3(0.007, 0.018, 0.044) * density;
    col += vec3(0.040, 0.068, 0.100) * pow(density, 2.4) * 1.3;
    col += vec3(0.055, 0.042, 0.030) * knot * band * neb * 1.2;
    float dust = lanes * smoothstep(0.05, 0.5, band);
    col *= 1.0 - dust * 0.82;
    // The title sits over the upper left: keep that part of the sky quieter.
    col *= mix(0.5, 1.0, smoothstep(-1.0, -0.15, p.x - p.y * 0.4));

    float mask = clamp(density * (1.0 - dust * 0.85) * 1.3, 0.0, 1.0);
    float dither = (vhash(gl_FragCoord.xy) - 0.5) / 255.0;
    gl_FragColor = vec4(sqrt(col / 0.25) + dither, mask);
  }
`;

const DOME_VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const DOME_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform sampler2D uCard;
  uniform sampler2D uDetail;
  uniform vec2 uHalf;
  uniform float uBright;
  varying vec3 vDir;
  float dhash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  void main() {
    vec3 d = normalize(vDir);
    vec3 col = vec3(0.0015, 0.0027, 0.0060);
    if (d.z < -0.05) {
      vec2 t = d.xy / -d.z;
      vec2 uv = t / uHalf * 0.5 + 0.5;
      vec4 s = texture2D(uCard, uv);
      float edge = smoothstep(0.0, 0.05, uv.x) * smoothstep(0.0, 0.05, uv.y) * smoothstep(1.0, 0.95, uv.x) * smoothstep(1.0, 0.95, uv.y);
      col = mix(col, s.rgb * s.rgb * 0.25, edge);
      float sp = texture2D(uDetail, t * 7.0).a * texture2D(uDetail, t * 19.0 + 0.3).a;
      float speck = pow(max(sp * 1.9 - 0.62, 0.0) * 3.0, 4.0);
      col += vec3(0.6, 0.7, 0.85) * speck * s.a * edge * 0.05;
    }
    col *= uBright;
    col += (dhash(gl_FragCoord.xy) - 0.5) * 0.0004;
    gl_FragColor = vec4(max(col, 0.0), 1.0);
  }
`;

const STAR_VERTEX = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  uniform float uPixelRatio;
  uniform float uBright;
  varying vec3 vColor;
  varying float vSize;
  void main() {
    vColor = aColor * uBright;
    vSize = aSize * uPixelRatio;
    gl_PointSize = vSize + 2.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const STAR_FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec3 vColor;
  varying float vSize;
  void main() {
    float r = length(gl_PointCoord - 0.5) * (vSize + 2.0);
    float core = exp(-r * r / max(0.35, vSize * 0.18));
    float halo = exp(-r / max(0.8, vSize * 0.55)) * 0.12;
    gl_FragColor = vec4(vColor * (core + halo), 1.0);
  }
`;

/** A star seen through a telescope-like optic: a hard core, a soft halo and four thin spikes. */
const GLINT_FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec3 vColor;
  varying float vSize;
  void main() {
    vec2 p = (gl_PointCoord - 0.5) * (vSize + 2.0);
    float r = length(p);
    float core = exp(-r * r / 1.6);
    float halo = exp(-r / (vSize * 0.09)) * 0.22;
    float fade = smoothstep(vSize * 0.5, vSize * 0.1, r);
    float spikes = (exp(-abs(p.y) * 1.6) * exp(-abs(p.x) / (vSize * 0.16)) + exp(-abs(p.x) * 1.6) * exp(-abs(p.y) / (vSize * 0.16))) * 0.55;
    gl_FragColor = vec4(vColor * (core + halo + spikes * fade), 1.0);
  }
`;

export interface TitleSky {
  group: THREE.Group;
  update(camera: THREE.Camera): void;
  /** 0..1: stars, then the nebula, for the opening reveal. */
  setReveal(stars: number, nebula: number): void;
  dispose(): void;
}

/** Tangent-plane coordinates of a unit direction looking down -Z. */
function tangentOf(d: THREE.Vector3, out: THREE.Vector2): THREE.Vector2 {
  return out.set(d.x / -d.z, d.y / -d.z);
}

/** `detail` may still be baking: the card bakes alongside it, and only the dome waits for it. */
export async function buildTitleSky(renderer: THREE.WebGLRenderer, detail: Promise<THREE.Texture>, band: BandShape, opts: { stars: number; seed?: number; pace?: () => Promise<void> }): Promise<TitleSky> {
  const group = new THREE.Group();
  group.name = 'title-sky';

  const card = new THREE.WebGLRenderTarget(1280, 900, { type: THREE.UnsignedByteType, depthBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  card.texture.name = 'title-sky-card';
  await bakeInto(
    renderer,
    card,
    CARD_FRAGMENT,
    { uHalf: { value: SKY_HALF }, uFrom: { value: band.from }, uTo: { value: band.to }, uCore: { value: band.core }, uLoop: { value: 6 } },
    { strips: 6, pace: opts.pace },
  );

  const domeBright = { value: 0 };
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(10, 48, 24),
    new THREE.ShaderMaterial({
      uniforms: { uCard: { value: card.texture }, uDetail: { value: await detail }, uHalf: { value: SKY_HALF }, uBright: domeBright },
      vertexShader: DOME_VERTEX,
      fragmentShader: DOME_FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
    }),
  );
  dome.renderOrder = -1000;
  dome.frustumCulled = false;
  group.add(dome);

  // Stars: inside a 72° cone around the view, which covers every framing the camera uses, so none
  // are spent behind it. Faint ones crowd toward the band.
  const rand = mulberry32(opts.seed ?? 0x7171e);
  const cosCone = Math.cos(THREE.MathUtils.degToRad(72));
  const ab = band.to.clone().sub(band.from);
  const bandLen = ab.length();
  const bandDir = ab.clone().divideScalar(bandLen);
  const t = new THREE.Vector2();
  const acrossBand = (d: THREE.Vector3) => {
    tangentOf(d, t).sub(band.from);
    return Math.abs(t.x * -bandDir.y + t.y * bandDir.x);
  };
  const randomDir = (out: THREE.Vector3) => {
    // Uniform over the cap z <= -cosCone.
    const z = -(cosCone + rand() * (1 - cosCone));
    const a = rand() * Math.PI * 2;
    const s = Math.sqrt(1 - z * z);
    return out.set(Math.cos(a) * s, Math.sin(a) * s, z);
  };

  const pixelRatio = { value: 1 };
  const starBright = { value: 0 };
  const layer = (count: number, pick: (i: number, dir: THREE.Vector3, colour: THREE.Color) => number, fragment: string): THREE.Points => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const dir = new THREE.Vector3();
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      sizes[i] = pick(i, dir, c);
      positions[i * 3] = dir.x * 9;
      positions[i * 3 + 1] = dir.y * 9;
      positions[i * 3 + 2] = dir.z * 9;
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    const points = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({
        uniforms: { uPixelRatio: pixelRatio, uBright: starBright },
        vertexShader: STAR_VERTEX,
        fragmentShader: fragment,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
      }),
    );
    points.renderOrder = -999;
    points.frustumCulled = false;
    points.onBeforeRender = (r) => {
      pixelRatio.value = r.getPixelRatio();
    };
    return points;
  };
  const temperature = () => {
    const pick = rand();
    return pick < 0.12 ? 3300 + rand() * 1200 : pick > 0.86 ? 9000 + rand() * 6000 : 5400 + rand() * 2600;
  };

  // The dense faint field.
  group.add(
    layer(
      opts.stars,
      (_i, dir, c) => {
        for (let tries = 0; tries < 10; tries++) {
          randomDir(dir);
          const across = acrossBand(dir);
          if (rand() < 0.22 + 0.78 * Math.exp(-(across * across) / 0.05)) break;
        }
        const m = Math.pow(rand(), 3);
        blackbody(temperature(), c).multiplyScalar(0.05 + m * 0.5);
        return 0.7 + m * 0.9;
      },
      STAR_FRAGMENT,
    ),
  );
  // Brighter stars, spread evenly.
  const bright = Math.round(opts.stars * 0.07);
  group.add(
    layer(
      bright,
      (_i, dir, c) => {
        randomDir(dir);
        const m = Math.pow(rand(), 4);
        blackbody(temperature(), c).multiplyScalar(0.5 + m * 1.8);
        return 1.5 + m * 1.9;
      },
      STAR_FRAGMENT,
    ),
  );
  // A handful with spikes, kept off the title (left third, upper half of the frame).
  group.add(
    layer(
      18,
      (_i, dir, c) => {
        for (let tries = 0; tries < 30; tries++) {
          randomDir(dir);
          tangentOf(dir, t);
          if (t.x > -0.15 || t.y < -0.05) break;
        }
        blackbody(rand() < 0.6 ? 9000 + rand() * 7000 : 5600 + rand() * 1500, c).multiplyScalar(1.1 + rand() * 1.2);
        return 16 + rand() * 12;
      },
      GLINT_FRAGMENT,
    ),
  );

  return {
    group,
    update(camera) {
      camera.getWorldPosition(group.position);
    },
    setReveal(stars, nebula) {
      starBright.value = stars;
      domeBright.value = nebula;
    },
    dispose() {
      card.dispose();
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        if (m.material) (m.material as THREE.Material).dispose();
      });
    },
  };
}
