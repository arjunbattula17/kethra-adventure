import * as THREE from 'three';

/**
 * One-off GPU bakes for the title backdrop: a full-target shader pass drawn once into a render target,
 * then sampled as a texture every frame. Doing the expensive noise once here is what lets the planet
 * and the sky carry fine detail at a few texture taps a pixel (the per-frame budget on Intel UHD).
 */

const FULLSCREEN_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/**
 * Draws `fragmentShader` over the whole of `target`, without stalling the page: the program is compiled
 * in the background (compileAsync, KHR_parallel_shader_compile) and the drawing is split into
 * horizontal strips, one per `pace` step. Compiled on the spot, Direct3D took 0.5 s for the detail
 * shader and 1.9 s for the sky's on an Intel UHD laptop, each a frozen page; drawn in one go, the sky
 * card is a single GPU job long enough to drop frames.
 */
export async function bakeInto(
  renderer: THREE.WebGLRenderer,
  target: THREE.WebGLRenderTarget,
  fragmentShader: string,
  uniforms: Record<string, THREE.IUniform> = {},
  opts: { strips?: number; pace?: () => Promise<void> } = {},
): Promise<void> {
  const material = new THREE.ShaderMaterial({ vertexShader: FULLSCREEN_VERTEX, fragmentShader, uniforms, depthTest: false, depthWrite: false });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const camera = new THREE.Camera();
  const strips = opts.strips ?? 1;
  const mipmaps = target.texture.generateMipmaps;
  try {
    // Programs are keyed on the target they draw into: compile with it bound (see prepare.ts).
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    const compiled = renderer.compileAsync(scene, camera);
    renderer.setRenderTarget(previous);
    await compiled;
    const h = target.height;
    for (let i = 0; i < strips; i++) {
      if (i > 0) await opts.pace?.();
      const y0 = Math.floor((i * h) / strips);
      const y1 = Math.floor(((i + 1) * h) / strips);
      target.scissor.set(0, y0, target.width, y1 - y0);
      target.scissorTest = strips > 1;
      // Mipmaps once, after the last strip.
      target.texture.generateMipmaps = mipmaps && i === strips - 1;
      const before = renderer.getRenderTarget();
      const autoClear = renderer.autoClear;
      renderer.autoClear = false;
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.setRenderTarget(before);
      renderer.autoClear = autoClear;
    }
  } finally {
    target.scissorTest = false;
    target.texture.generateMipmaps = mipmaps;
    quad.geometry.dispose();
    material.dispose();
  }
}

/**
 * Periodic gradient noise and fbm, for tiling textures: every lattice coordinate is wrapped by the
 * octave's period, so the result repeats exactly once across 0..1.
 */
export const PERIODIC_NOISE = /* glsl */ `
  // Loop bounds come from a uniform (always 8) so the shader compiler keeps real loops: unrolled, the
  // shader was large enough that Direct3D spent seconds compiling it.
  uniform int uLoop;
  // Sine-free (Hoskins): see titleSky.ts for why sin() hashes are avoided here.
  vec2 phash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return -1.0 + 2.0 * fract((p3.xx + p3.yz) * p3.zy);
  }
  float pnoise(vec2 p, float period) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    float a = dot(phash(mod(i, period)), f);
    float b = dot(phash(mod(i + vec2(1.0, 0.0), period)), f - vec2(1.0, 0.0));
    float c = dot(phash(mod(i + vec2(0.0, 1.0), period)), f - vec2(0.0, 1.0));
    float d = dot(phash(mod(i + vec2(1.0, 1.0), period)), f - vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float pfbm(vec2 uv, float period, int octaves, float gain) {
    float sum = 0.0;
    float amp = 0.5;
    float norm = 0.0;
    float per = period;
    for (int i = 0; i < uLoop; i++) {
      if (i >= octaves) break;
      sum += amp * pnoise(uv * per, per);
      norm += amp;
      amp *= gain;
      per *= 2.0;
    }
    return sum / norm;
  }
`;

const DETAIL_FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  ${PERIODIC_NOISE}
  void main() {
    vec2 uv = vUv;
    // R: broad terrain height. G: ridges (sharp crests, the canopy's terrace lines from orbit).
    // B: domain-warped cloud structure. A: fine grain.
    float r = 0.5 + 0.75 * pfbm(uv, 4.0, 7, 0.52);
    float ridge = 1.0 - abs(pfbm(uv + 0.37, 6.0, 6, 0.55) * 1.6);
    float g = ridge * ridge;
    vec2 warp = vec2(pfbm(uv, 3.0, 4, 0.5), pfbm(uv + vec2(0.41, 0.73), 3.0, 4, 0.5));
    float b = 0.5 + 0.8 * pfbm(fract(uv + warp * 0.18), 5.0, 6, 0.56);
    float a = 0.5 + 0.9 * pfbm(uv + 0.11, 32.0, 3, 0.5);
    gl_FragColor = clamp(vec4(r, g, b, a), 0.0, 1.0);
  }
`;

/** A 512² tiling RGBA noise sheet with mipmaps (see DETAIL_FRAGMENT for what each channel holds). */
export async function bakeDetailNoise(renderer: THREE.WebGLRenderer, pace?: () => Promise<void>, size = 512): Promise<THREE.WebGLRenderTarget> {
  const target = new THREE.WebGLRenderTarget(size, size, {
    type: THREE.UnsignedByteType,
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.RepeatWrapping,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: true,
    depthBuffer: false,
    anisotropy: 4,
  });
  target.texture.name = 'title-detail-noise';
  await bakeInto(renderer, target, DETAIL_FRAGMENT, { uLoop: { value: 8 } }, { strips: 2, pace });
  return target;
}
