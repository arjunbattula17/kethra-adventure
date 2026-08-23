import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// The scene lighting rig runs hot for the ACES filmic curve baked into the renderer (Engine.ts,
// not ours to edit) plus a room-wide IBL ambient (ShipInteriorScene.ts's environmentIntensity,
// also not ours to edit) that puts a non-trivial floor under every surface regardless of the
// local light rig — measured medians and p95s sat 0.05-0.24 above the matching reference crop
// across nearly every view, with crushed-black regions running 10-30x the reference. Four moves
// compensate: a flat exposure trim for the broad "too bright" baseline; a highlight shoulder so
// hot practicals/bloom settle below the tonemap's plateau instead of riding it; a gamma>1 shadow
// compression that pulls the ambient floor down *proportionally harder than it pulls down the
// highlights* (x^1.15 shrinks a small x by a bigger fraction than a large x); and a narrow toe
// that lifts only genuinely crushed near-zero pixels so they keep a sliver of material detail —
// the brief's whole-fix shape: lift the shadow floor's readability without milkifying it, pull
// the highlights down separately.
const gradeShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      vec3 c = color.rgb;

      // Flat exposure trim compensating for the fixed renderer exposure + ambient IBL running hot.
      c *= 0.85;

      // Highlight shoulder: soft-knee compression above 0.42 luma. Round 4: the previous knee
      // (0.4 / coeff 2.2, asymptote ~0.85) was strong enough that no pixel anywhere ever reached
      // hot (>=0.90) — measured hot% was 0.00% on every view including ones whose reference sits
      // at 0.9-1.7% hot (console, displays, starfieldWindow), and their p95 read 0.09-0.27 below
      // the reference as a result. Softened coeff 2.2->2.0 (asymptote ~0.92) so genuinely hot
      // sources (screens, the pendant tube) can punch further toward white than before, while
      // staying short of the full 1.8 tried first — that let one extreme outlier (an airlock
      // practical far brighter than anything else in the room) blow out even harder than the
      // knee alone could tame.
      float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
      float knee = 0.4;
      if (luma > knee) {
        float excess = luma - knee;
        float compressed = knee + excess / (1.0 + excess * 2.0);
        c *= compressed / max(luma, 1e-4);
      }

      // Gamma shadow compression — see note above: pulls the ambient-lit floor down without
      // crushing it to pure black, since gamma > 1 never reaches 0 unless the input already is.
      c = pow(clamp(c, 0.0, 1.0), vec3(1.15));

      // Shadow toe: lift only genuinely crushed (near-zero) pixels a few percent so they keep a
      // sliver of readable detail — narrow and small so it doesn't milkify the rest of the range.
      float shadowWeight = 1.0 - smoothstep(0.0, 0.04, luma);
      c += 0.035 * shadowWeight;

      // Warm highlights, cool shadows split-tone.
      float luma2 = dot(c, vec3(0.2126, 0.7152, 0.0722));
      vec3 warm = vec3(1.06, 1.0, 0.9);
      vec3 cool = vec3(0.92, 0.96, 1.05);
      c *= mix(cool, warm, smoothstep(0.15, 0.85, luma2));

      // Vignette — softened so frame corners don't add to the crushed-black count.
      vec2 centered = vUv - 0.5;
      float vig = 1.0 - smoothstep(0.35, 0.85, length(centered) * 1.15);
      c *= mix(0.85, 1.0, vig);

      gl_FragColor = vec4(clamp(c, 0.0, 1.0), color.a);
    }
  `,
};

export class PostProcessing {
  composer: EffectComposer;
  private renderPass: RenderPass;
  private aoPass: GTAOPass;
  private bloomPass: UnrealBloomPass;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.composer = new EffectComposer(renderer);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    // Ground contact shadows: the room's most direct fix for "nothing is grounded". Runs before
    // bloom so AO darkens the base shading only, not the glow bloom adds around fixtures.
    this.aoPass = new GTAOPass(scene, camera, window.innerWidth, window.innerHeight);
    this.aoPass.output = GTAOPass.OUTPUT.Default;
    this.aoPass.updateGtaoMaterial({ radius: 0.4, distanceExponent: 1.5, thickness: 1, distanceFallOff: 0.5, scale: 1, samples: 16, screenSpaceRadius: false });
    this.aoPass.blendIntensity = 0.5;
    this.composer.addPass(this.aoPass);

    // Round 4: threshold 0.96 meant almost nothing in the room ever bloomed — screens and the
    // pendant tube read as flat, un-lit-looking surfaces instead of the hot practicals the
    // reference shows. Lowered so genuinely bright emissives catch bloom; strength/radius raised
    // to match so the catch actually reads as a glow rather than a faint fringe.
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.4, 0.24, 0.93);
    this.composer.addPass(this.bloomPass);

    this.composer.addPass(new ShaderPass(gradeShader));
    this.composer.addPass(new OutputPass());
  }

  setActive(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    this.aoPass.scene = scene;
    this.aoPass.camera = camera;
  }

  setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
    this.aoPass.setSize(width, height);
    this.bloomPass.setSize(width, height);
  }

  render(): void {
    this.composer.render();
  }
}
