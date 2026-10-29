import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

/**
 * The black hole itself, drawn over the finished scene: a full-screen pass that runs between the
 * scene's render and the bloom (Engine.setScreenEffect), so its accretion disk blooms like any other
 * light and the grade treats it like the rest of the picture.
 *
 * Every pixel's view ray is traced past a Schwarzschild hole of radius uRs (world units) at uBH (view
 * space). Inside uFar (in Rs) the ray is integrated step by step (leapfrog) with the photon-orbit
 * acceleration a = -1.5 h^2 r / |r|^5 (Rs = 1, h = the ray's angular momentum): Schwarzschild's null
 * geodesics, with the photon sphere at 1.5 Rs and the shadow at 2.6 Rs. Beyond it the bending is the
 * far-field series 2/b + (15 pi / 16) / b^2, applied in one go; the march adds the part of that bending
 * its sphere leaves out (the fraction outside, exact for this force), and the two are blended over the
 * last 1.5 Rs, so there is no seam. uReach fades the far field out with distance: the hole's reach
 * grows with it, instead of the whole frame bending from the first moment.
 * A ray that falls under 1 Rs is lost (the shadow); one that crosses the disk plane between uDiskIn
 * and uDiskOut picks up the disk's light (thin disk temperature profile, Doppler beaming from its
 * orbital speed, gravitational redshift), up to three times, so the far side of the disk shows bent
 * over and under the shadow and the photon ring sits at its rim. A ray that escapes looks up the
 * scene in its new direction: the scene texture is the sky at infinity, mirrored where the bent ray
 * leaves the frame, so the planet, the sun, the ship and the stars are all truly lensed into arcs and
 * an Einstein ring.
 *
 * Around that, screen-space touches the choreography drives (singularity.ts): the light-ring that
 * converges before the birth, the flash, the shockwave that refracts across the frame after it, a
 * frame-dragging swirl, chromatic splitting of the bent light, a blue shift as the camera falls, and
 * uEat, the final fade to true black.
 *
 * The step loop's bound is a uniform: a constant bound is unrolled by Direct3D's shader compiler, which
 * turned a program like this into seconds of compiling on an Intel UHD laptop (see Environment.ts).
 */

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  precision highp float;
  uniform sampler2D tDiffuse;
  uniform vec2 uTan;
  uniform vec3 uBH;
  uniform float uRs;
  uniform float uFar;
  uniform float uReach;
  uniform vec3 uDiskX;
  uniform vec3 uDiskN;
  uniform vec3 uDiskZ;
  uniform float uDiskIn;
  uniform float uDiskOut;
  uniform float uDiskGain;
  uniform float uDiskHeat;
  uniform float uTime;
  uniform int uSteps;
  uniform vec2 uBhUv;
  uniform vec3 uShock;
  uniform vec3 uImplode;
  uniform float uFlash;
  uniform float uSwirl;
  uniform float uCA;
  uniform float uRing;
  uniform float uShift;
  uniform float uEat;
  uniform float uHaze;
  varying vec2 vUv;

  // Sine-free hash and value noise (a sine hash bands on some GPUs).
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash12(i);
    float b = hash12(i + vec2(1.0, 0.0));
    float c = hash12(i + vec2(0.0, 1.0));
    float d = hash12(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  // The scene as the sky at infinity: mirrored past its edges, so a bent ray that leaves the frame
  // still finds sky, continuous with what is beside it.
  vec3 sky(vec2 uv) {
    uv = 1.0 - abs(1.0 - mod(uv, 2.0));
    return texture2D(tDiffuse, uv).rgb;
  }

  // Ember red through gold and white to blue-white: the disk's colour by (shifted) temperature.
  vec3 heat(float t) {
    vec3 c = mix(vec3(0.5, 0.05, 0.01), vec3(1.0, 0.32, 0.05), smoothstep(0.0, 0.35, t));
    c = mix(c, vec3(1.0, 0.7, 0.3), smoothstep(0.3, 0.7, t));
    c = mix(c, vec3(1.0, 0.94, 0.84), smoothstep(0.65, 1.05, t));
    c = mix(c, vec3(0.7, 0.83, 1.0), smoothstep(1.05, 1.7, t));
    return c;
  }

  // The disk's light where a ray crosses its plane at hit (r from the centre, Rs units), the ray
  // travelling along vel (away from the camera; the light comes the other way).
  vec4 disk(vec3 hit, float r, vec3 vel) {
    float x = dot(hit, uDiskX);
    float z = dot(hit, uDiskZ);
    float ang = atan(z, x);
    // Keplerian shear: inner rings lap the outer ones, so streaks wind into spirals.
    float rot = ang + uTime * 5.0 * pow(r, -1.5);
    float lr = log(r);
    float streak = 0.5 + 0.5 * sin(rot * 3.0 + lr * 9.0);
    streak *= 0.62 + 0.38 * sin(rot * 7.0 - lr * 16.0 + 1.7);
    vec2 q = vec2(cos(rot), sin(rot)) * r;
    float n = vnoise(q * 1.6) * 0.6 + vnoise(q * 4.3 + 7.3) * 0.4;
    float dens = mix(0.15, 1.0, streak) * mix(0.35, 1.5, n);
    float edge = smoothstep(uDiskIn, uDiskIn * 1.3, r) * (1.0 - smoothstep(uDiskOut * 0.5, uDiskOut, r));
    // Thin-disk temperature, normalised: 1 just outside the inner edge, falling as r^-3/4.
    float xr = uDiskIn / r;
    float temp = pow(xr, 0.75) * pow(max(1.0 - sqrt(xr * 0.97), 0.0), 0.25) * 2.0;
    // Orbital speed (fraction of c) and the Doppler factor toward the camera, with the climb out of the well.
    float beta = clamp(sqrt(0.5 / max(r - 1.0, 0.25)), 0.0, 0.7);
    vec3 orbit = normalize(cross(uDiskN, hit));
    float cosT = dot(orbit, -normalize(vel));
    float dop = sqrt(1.0 - beta * beta) / (1.0 - beta * cosT);
    float g = dop * sqrt(max(1.0 - 1.0 / r, 0.0));
    // Beaming as g^3, eased so the receding side still glows.
    float boost = mix(1.0, g * g * g, 0.72);
    vec3 col = heat(temp * mix(1.0, g, 0.85) * uDiskHeat) * (0.25 + 2.2 * temp * temp) * boost;
    float a = clamp(dens * edge * 1.4, 0.0, 1.0);
    return vec4(col * dens * uDiskGain * 2.0, a);
  }

  // The far-field bending, faded beyond uReach.
  float farBend(float b) {
    return (2.0 / b + 2.945 / (b * b)) / (1.0 + b * b / (uReach * uReach));
  }

  void main() {
    float aspect = uTan.x / uTan.y;
    vec2 toAspect = vec2(aspect, 1.0);
    vec2 dS = (vUv - uBhUv) * toAspect;
    float rS = length(dS);
    vec2 nS = rS > 1e-5 ? dS / rS : vec2(0.0);

    // Screen-space bends first: they change which way the pixel looks.
    vec2 uv = vUv;
    // The shockwave after the birth: a refracting ring running outward.
    float sw = (rS - uShock.x) / uShock.z;
    uv -= nS / toAspect * uShock.y * sw * exp(-sw * sw);
    // The light-ring that converges on the point before it opens.
    float iw = (rS - uImplode.x) / uImplode.z;
    float implodeRing = exp(-iw * iw);
    uv += nS / toAspect * uImplode.y * 0.015 * iw * implodeRing;
    // Frame dragging, stylised: the picture turns about the hole, faster near it.
    vec2 rel = (uv - uBhUv) * toAspect;
    float sa = uSwirl / (1.0 + dot(rel, rel) * 14.0);
    float cs = cos(sa);
    float sn = sin(sa);
    rel = vec2(rel.x * cs - rel.y * sn, rel.x * sn + rel.y * cs);
    // Heat shimmer around the point before the birth.
    rel += uHaze * 0.004 * vec2(vnoise(vUv * 38.0 + uTime * 3.1) - 0.5, vnoise(vUv * 38.0 - uTime * 2.7 + 9.1) - 0.5) / (0.05 + rS * 6.0);
    uv = uBhUv + rel / toAspect;

    vec2 ndc = uv * 2.0 - 1.0;
    vec3 dir = normalize(vec3(ndc.x * uTan.x, ndc.y * uTan.y, -1.0));
    vec3 outDir = dir;
    vec4 glow = vec4(0.0);
    bool lost = false;
    float b = 1e6;

    if (uRs > 1e-6) {
      vec3 pos = -uBH / uRs;
      float along = dot(-pos, dir);
      vec3 closest = pos + dir * along;
      b = length(closest);
      vec3 toward = b > 1e-6 ? -closest / b : vec3(0.0);
      if (along > 0.0 && b < uFar) {
        float R = uFar + 1.0;
        float S = sqrt(max(R * R - b * b, 0.0));
        vec3 p = pos + dir * max(along - S, 0.0);
        vec3 v = dir;
        float h2 = b * b;
        float r = length(p);
        vec3 acc = -1.5 * h2 * p / pow(r, 5.0);
        for (int i = 0; i < uSteps; i++) {
          r = length(p);
          if (r < 1.0) {
            lost = true;
            break;
          }
          if (r > R && dot(p, v) > 0.0) break;
          float dt = clamp((r - 0.92) * 0.24, 0.015, 1.2);
          vec3 prev = p;
          v += 0.5 * acc * dt;
          p += v * dt;
          float r2 = dot(p, p);
          acc = -1.5 * h2 * p / (r2 * r2 * sqrt(r2));
          v += 0.5 * acc * dt;
          float y0 = dot(prev, uDiskN);
          float y1 = dot(p, uDiskN);
          if (y0 * y1 < 0.0 && glow.a < 0.985) {
            vec3 hit = mix(prev, p, y0 / (y0 - y1));
            float rh = length(hit);
            if (rh > uDiskIn && rh < uDiskOut) {
              vec4 c = disk(hit, rh, v);
              glow.rgb += (1.0 - glow.a) * c.rgb * c.a;
              glow.a += (1.0 - glow.a) * c.a;
            }
          }
        }
        // Out of steps close in: it was circling the photon sphere, as good as lost.
        if (!lost && r < 2.0) lost = true;
        // The bending the march leaves out, beyond its sphere at both ends: for this force the part
        // inside a chord of half-length S is S (2 S^2 + 3 b^2) / (2 R^3) of the whole.
        float inside = S * (2.0 * S * S + 3.0 * b * b) / (2.0 * R * R * R);
        outDir = normalize(normalize(v) + toward * farBend(max(b, 1e-3)) * (1.0 - inside));
        outDir = normalize(mix(outDir, normalize(dir + toward * farBend(b)), smoothstep(uFar - 1.5, uFar, b)));
      } else if (along > 0.0) {
        outDir = normalize(dir + toward * farBend(b));
      }
    }

    vec3 col = vec3(0.0);
    if (!lost) {
      vec3 d = outDir;
      // Bent past 90 degrees: look the mirrored way, dimmer.
      float back = smoothstep(-0.2, 0.3, d.z);
      d.z = min(-abs(d.z), -0.06);
      vec2 suv = vec2(d.x / (-d.z) / uTan.x, d.y / (-d.z) / uTan.y) * 0.5 + 0.5;
      // The colour split follows the bending, capped at a few pixels: uncapped, the Einstein ring's huge
      // bends split into rainbow bands.
      vec2 split = (suv - uv) * uCA;
      split *= min(1.0, 0.005 / max(length(split), 1e-6));
      col.r = sky(suv + split).r;
      col.g = sky(suv).g;
      col.b = sky(suv - split).b;
      col *= 1.0 - 0.55 * back;
    }
    // Rays grazing the photon sphere circle it a different number of times from one pixel to the next,
    // which reads as glitter: just outside the shadow they fade into the photon ring's glow.
    float graze = smoothstep(2.62, 3.15, b);
    col *= graze;
    col = col * (1.0 - glow.a) + glow.rgb * mix(0.55, 1.0, graze);
    float ring = (b - 2.68) * 3.2;
    col += vec3(1.0, 0.86, 0.66) * exp(-ring * ring) * uRing;
    col += vec3(0.6, 0.78, 1.0) * implodeRing * uImplode.y * 1.1;
    col += vec3(1.0, 0.93, 0.85) * uFlash * (exp(-rS * rS * 160.0) * 4.0 + exp(-rS * rS * 7.0) * 0.12);
    col *= mix(vec3(1.0), vec3(0.62, 0.86, 1.55), uShift);
    col *= 1.0 - uEat;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export class LensPass extends Pass {
  readonly uniforms = {
    tDiffuse: { value: null as THREE.Texture | null },
    uTan: { value: new THREE.Vector2(1, 1) },
    uBH: { value: new THREE.Vector3(0, 0, -50) },
    uRs: { value: 0 },
    uFar: { value: 12 },
    uReach: { value: 40 },
    uDiskX: { value: new THREE.Vector3(1, 0, 0) },
    uDiskN: { value: new THREE.Vector3(0, 1, 0) },
    uDiskZ: { value: new THREE.Vector3(0, 0, 1) },
    uDiskIn: { value: 3 },
    uDiskOut: { value: 10 },
    uDiskGain: { value: 0 },
    uDiskHeat: { value: 1 },
    uTime: { value: 0 },
    uSteps: { value: 72 },
    uBhUv: { value: new THREE.Vector2(0.5, 0.5) },
    uShock: { value: new THREE.Vector3(-1, 0, 0.05) },
    uImplode: { value: new THREE.Vector3(-1, 0, 0.03) },
    uFlash: { value: 0 },
    uSwirl: { value: 0 },
    uCA: { value: 0 },
    uRing: { value: 0 },
    uShift: { value: 0 },
    uEat: { value: 0 },
    uHaze: { value: 0 },
  };
  private material = new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader: FRAGMENT, uniforms: this.uniforms, depthTest: false, depthWrite: false });
  private quad = new FullScreenQuad(this.material);

  constructor() {
    super();
    this.needsSwap = true;
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  /**
   * Starts linking the program off the page's thread; resolves when it is linked (Singularity.start
   * holds the event's silence until then).
   */
  compile(renderer: THREE.WebGLRenderer): Promise<void> {
    // The very mesh the pass draws with: linked through a stand-in plane, the program was built again
    // at its first draw (the main thread waited 0.24 s on it on an Intel UHD laptop).
    const mesh = (this.quad as unknown as { _mesh: THREE.Mesh })._mesh;
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    // Programs are keyed on the target they draw into: a half-float target, like the composer's. It is
    // only needed while three builds the program, which compileAsync does before it returns.
    const previous = renderer.getRenderTarget();
    const target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
    renderer.setRenderTarget(target);
    let linked: Promise<unknown>;
    try {
      linked = renderer.compileAsync(mesh, camera);
    } finally {
      renderer.setRenderTarget(previous);
    }
    return linked.finally(() => target.dispose()) as Promise<void>;
  }

  dispose(): void {
    this.material.dispose();
    this.quad.dispose();
  }
}
