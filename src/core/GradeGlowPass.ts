import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

/** Per-scene colour grade, applied in linear HDR before tone mapping. */
export interface GradeProfile {
  /** Flat exposure trim. */
  exposure: number;
  /** Highlight shoulder: luma where compression starts, and how hard it compresses. */
  knee: number;
  shoulder: number;
  /** Shadow compression (gamma > 1 pulls the ambient floor down proportionally harder). */
  gamma: number;
  /** Lift added to near-black pixels only. Zero keeps black black. */
  toe: number;
  /** Split tone: multiplier for shadows and for highlights. */
  cool: [number, number, number];
  warm: [number, number, number];
  /** Corner multiplier (1 = no vignette). */
  vignette: number;
}

/** A grade `t` of the way from `a` to `b`, written into `out`. */
export function lerpGrade(a: GradeProfile, b: GradeProfile, t: number, out: GradeProfile): GradeProfile {
  const m = (x: number, y: number) => x + (y - x) * t;
  out.exposure = m(a.exposure, b.exposure);
  out.knee = m(a.knee, b.knee);
  out.shoulder = m(a.shoulder, b.shoulder);
  out.gamma = m(a.gamma, b.gamma);
  out.toe = m(a.toe, b.toe);
  out.cool = [m(a.cool[0], b.cool[0]), m(a.cool[1], b.cool[1]), m(a.cool[2], b.cool[2])];
  out.warm = [m(a.warm[0], b.warm[0]), m(a.warm[1], b.warm[1]), m(a.warm[2], b.warm[2])];
  out.vignette = m(a.vignette, b.vignette);
  return out;
}

export const GRADES = {
  /** Ship interior; its lighting was tuned against this grade. */
  interior: { exposure: 0.85, knee: 0.48, shoulder: 1.15, gamma: 1.15, toe: 0.035, cool: [0.92, 0.96, 1.05], warm: [1.06, 1.0, 0.9], vignette: 0.85 },
  /** Space: black stays black, highlights roll off warm, a slightly firmer vignette. */
  space: { exposure: 1.0, knee: 0.6, shoulder: 0.9, gamma: 1.0, toe: 0, cool: [0.95, 0.98, 1.04], warm: [1.04, 1.0, 0.94], vignette: 0.8 },
  /** Kethra at night: deep blacks, teal shadows, the canopy's green kept clean. */
  kethra: { exposure: 0.95, knee: 0.5, shoulder: 1.0, gamma: 1.08, toe: 0.01, cool: [0.9, 1.0, 1.02], warm: [1.03, 1.0, 0.93], vignette: 0.82 },
  /** Vessek: warm mids, cool blue shadows. */
  vessek: { exposure: 0.9, knee: 0.5, shoulder: 1.1, gamma: 1.1, toe: 0.015, cool: [0.9, 0.97, 1.06], warm: [1.07, 1.0, 0.88], vignette: 0.84 },
} satisfies Record<string, GradeProfile>;

const fullscreenVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** Bright-pass and 2×2 downsample into the quarter-resolution glow buffer. */
const thresholdShader = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1.0 } },
  vertexShader: fullscreenVertex,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uTexel;
    uniform float uThreshold;
    varying vec2 vUv;
    vec3 bright(vec3 c) {
      float l = max(c.r, max(c.g, c.b));
      // Soft knee from 0.7x to 1.3x the threshold, so the glow edge doesn't pop.
      float k = clamp((l - uThreshold * 0.7) / (uThreshold * 0.6), 0.0, 1.0);
      return c * k * k;
    }
    void main() {
      vec3 c = bright(texture2D(tDiffuse, vUv + uTexel * vec2(-1.0, -1.0)).rgb)
             + bright(texture2D(tDiffuse, vUv + uTexel * vec2( 1.0, -1.0)).rgb)
             + bright(texture2D(tDiffuse, vUv + uTexel * vec2(-1.0,  1.0)).rgb)
             + bright(texture2D(tDiffuse, vUv + uTexel * vec2( 1.0,  1.0)).rgb);
      gl_FragColor = vec4(c * 0.25, 1.0);
    }
  `,
};

/** Nine-tap Gaussian in five fetches (linear sampling), one direction per pass. */
const blurShader = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, uDir: { value: new THREE.Vector2() } },
  vertexShader: fullscreenVertex,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uDir;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb * 0.2270270270;
      c += texture2D(tDiffuse, vUv + uDir * 1.3846153846).rgb * 0.3162162162;
      c += texture2D(tDiffuse, vUv - uDir * 1.3846153846).rgb * 0.3162162162;
      c += texture2D(tDiffuse, vUv + uDir * 3.2307692308).rgb * 0.0702702703;
      c += texture2D(tDiffuse, vUv - uDir * 3.2307692308).rgb * 0.0702702703;
      gl_FragColor = vec4(c, 1.0);
    }
  `,
};

const gradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tGlow: { value: null as THREE.Texture | null },
    uGlow: { value: 0 },
    uExposure: { value: 1 },
    uKnee: { value: 0.5 },
    uShoulder: { value: 1 },
    uGamma: { value: 1 },
    uToe: { value: 0 },
    uCool: { value: new THREE.Vector3(1, 1, 1) },
    uWarm: { value: new THREE.Vector3(1, 1, 1) },
    uVignette: { value: 1 },
  },
  vertexShader: fullscreenVertex,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tGlow;
    uniform float uGlow;
    uniform float uExposure;
    uniform float uKnee;
    uniform float uShoulder;
    uniform float uGamma;
    uniform float uToe;
    uniform vec3 uCool;
    uniform vec3 uWarm;
    uniform float uVignette;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      vec3 c = color.rgb + texture2D(tGlow, vUv).rgb * uGlow;
      c *= uExposure;
      // Highlight shoulder: a soft knee above uKnee, so hot sources settle below the tone curve's
      // plateau instead of riding it.
      float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
      if (luma > uKnee) {
        float excess = luma - uKnee;
        float compressed = uKnee + excess / (1.0 + excess * uShoulder);
        c *= compressed / max(luma, 1e-4);
      }
      c = pow(max(c, 0.0), vec3(uGamma));
      // Shadow toe: lifts only crushed pixels, and only where the profile asks for it.
      c += uToe * (1.0 - smoothstep(0.0, 0.04, luma));
      float luma2 = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c *= mix(uCool, uWarm, smoothstep(0.15, 0.85, luma2));
      vec2 centered = vUv - 0.5;
      float vig = 1.0 - smoothstep(0.35, 0.85, length(centered) * 1.15);
      c *= mix(uVignette, 1.0, vig);
      gl_FragColor = vec4(max(c, 0.0), color.a);
    }
  `,
};

/**
 * Colour grade plus an optional cheap glow for the Low and Medium tiers: a bright-pass into a
 * quarter-resolution buffer, a horizontal and a vertical blur, then a composite inside the grade.
 * The High tier runs UnrealBloom before this pass and leaves the glow here off.
 */
export class GradeGlowPass extends Pass {
  glowEnabled = false;
  glowStrength = 0.9;
  private readonly quad = new FullScreenQuad();
  private readonly threshold = new THREE.ShaderMaterial({ ...thresholdShader, uniforms: THREE.UniformsUtils.clone(thresholdShader.uniforms), depthTest: false, depthWrite: false });
  private readonly blur = new THREE.ShaderMaterial({ ...blurShader, uniforms: THREE.UniformsUtils.clone(blurShader.uniforms), depthTest: false, depthWrite: false });
  private readonly grade = new THREE.ShaderMaterial({ ...gradeShader, uniforms: THREE.UniformsUtils.clone(gradeShader.uniforms), depthTest: false, depthWrite: false });
  private readonly rtA: THREE.WebGLRenderTarget;
  private readonly rtB: THREE.WebGLRenderTarget;
  private readonly black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);

  constructor() {
    super();
    const opts = { type: THREE.HalfFloatType, depthBuffer: false } as const;
    this.rtA = new THREE.WebGLRenderTarget(1, 1, opts);
    this.rtB = new THREE.WebGLRenderTarget(1, 1, opts);
    this.black.needsUpdate = true;
    this.setGrade(GRADES.interior);
  }

  setGrade(p: GradeProfile): void {
    const u = this.grade.uniforms;
    u.uExposure.value = p.exposure;
    u.uKnee.value = p.knee;
    u.uShoulder.value = p.shoulder;
    u.uGamma.value = p.gamma;
    u.uToe.value = p.toe;
    (u.uCool.value as THREE.Vector3).set(...p.cool);
    (u.uWarm.value as THREE.Vector3).set(...p.warm);
    u.uVignette.value = p.vignette;
  }

  setSize(width: number, height: number): void {
    const w = Math.max(1, Math.round(width / 4));
    const h = Math.max(1, Math.round(height / 4));
    this.rtA.setSize(w, h);
    this.rtB.setSize(w, h);
    (this.threshold.uniforms.uTexel.value as THREE.Vector2).set(1 / width, 1 / height);
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    if (this.glowEnabled) {
      this.threshold.uniforms.tDiffuse.value = readBuffer.texture;
      this.quad.material = this.threshold;
      renderer.setRenderTarget(this.rtA);
      this.quad.render(renderer);
      this.quad.material = this.blur;
      this.blur.uniforms.tDiffuse.value = this.rtA.texture;
      (this.blur.uniforms.uDir.value as THREE.Vector2).set(1 / this.rtA.width, 0);
      renderer.setRenderTarget(this.rtB);
      this.quad.render(renderer);
      this.blur.uniforms.tDiffuse.value = this.rtB.texture;
      (this.blur.uniforms.uDir.value as THREE.Vector2).set(0, 1 / this.rtA.height);
      renderer.setRenderTarget(this.rtA);
      this.quad.render(renderer);
    }
    this.grade.uniforms.tDiffuse.value = readBuffer.texture;
    this.grade.uniforms.tGlow.value = this.glowEnabled ? this.rtA.texture : this.black;
    this.grade.uniforms.uGlow.value = this.glowEnabled ? this.glowStrength : 0;
    this.quad.material = this.grade;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  dispose(): void {
    this.rtA.dispose();
    this.rtB.dispose();
    this.threshold.dispose();
    this.blur.dispose();
    this.grade.dispose();
    this.black.dispose();
    this.quad.dispose();
  }
}
