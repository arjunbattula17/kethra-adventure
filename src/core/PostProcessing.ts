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

      // Highlight shoulder: soft-knee compression above the knee luma. Round 4/5 history: earlier
      // knee/coeff pairs asymptoted at ~0.85-0.92, which is *below* the 0.90 "hot" bucket the
      // exposure check counts — no pixel anywhere could ever read as hot regardless of source
      // brightness. Round 6: measured p95 on console/displays/ceiling/starfieldWindow — the views
      // whose reference crop is dominated by an actual emissive source (screens, pendant tube) —
      // sat 0.10-0.23 *below* the reference, while median on those same views ran flat/low too.
      // Raised the knee and loosened the coefficient so a genuinely bright source can clear 0.9
      // and read as a real highlight instead of a soft grey; broad mid-lit surfaces (walls, floor)
      // sit well under the new 0.48 knee so they pass through unchanged.
      // Round 7: tried raising the knee/loosening the coefficient further to give
      // ceiling/console/displays/starfieldWindow more highlight headroom, but A/B verified against
      // repeated renders it moved those p95s by less than this measurement's own run-to-run noise
      // (~0.01, from the alarm-beacon pulse's animation phase at capture time) while risking
      // reopening floor/walls, which the lighting.ts trims below just fixed cleanly. Left as-is —
      // the gamma+split-tone passes below already re-compress most of what a looser knee would add.
      float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
      float knee = 0.48;
      if (luma > knee) {
        float excess = luma - knee;
        float compressed = knee + excess / (1.0 + excess * 1.15);
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

export type QualityTier = 'high' | 'medium' | 'low';

export class PostProcessing {
  composer: EffectComposer;
  private renderPass: RenderPass;
  private aoPass: GTAOPass;
  private bloomPass: UnrealBloomPass;
  // Whether the *current scene* can benefit from AO at all, independent of the quality tier and of
  // the settings menu's own toggle. Both of those choose whether to pay for AO; this decides
  // whether AO is even meaningful here. See GameScene.usesAO.
  private aoSupported = true;
  private aoRequested = true;
  // GTAOPass keeps its own internal render targets sized independently of the main canvas — see
  // setSize() below.
  private static readonly AO_SCALE = 0.5;

  // CSS-pixel size, tracked so pass-level size overrides (AO at half res, bloom at CSS res) can
  // be re-applied after composer.setSize()/setPixelRatio() resize every pass to full buffer size.
  private width = window.innerWidth;
  private height = window.innerHeight;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, samples: number) {
    // Two things the default EffectComposer target gets wrong for this game:
    // - It has no MSAA samples, and the canvas's own `antialias: true` does not apply to
    //   composer rendering, so every edge in the game was aliased.
    // - The composer snapshots the renderer's pixel ratio at construction and never re-reads it;
    //   Engine raises the renderer to its tier's pixel ratio *after* building this object, so
    //   without setPixelRatio() below the whole game rendered at 1x and was upscaled to the
    //   canvas — uniformly blurry on any display with devicePixelRatio > 1.
    this.composer = new EffectComposer(
      renderer,
      new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { type: THREE.HalfFloatType, samples }),
    );
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    // Ground contact shadows: the room's most direct fix for "nothing is grounded". Runs before
    // bloom so AO darkens the base shading only, not the glow bloom adds around fixtures.
    //
    // Measured (A/B toggling this exact pass in a live session, not guessed): it's the single most
    // expensive pass in the chain, at a roughly *fixed* ~4.5ms/frame overhead — sample count barely
    // moved that number (16 vs 8 vs 4 samples were all within measurement noise of each other), so
    // the cost lives in the pass's own render-target/denoise machinery, not its sample loop. The
    // lever that actually helps is running that machinery at a lower resolution: AO is a low-
    // frequency effect to begin with (soft, blurry occlusion, no fine detail to lose), so halving
    // it and letting GTAOPass's own bilinear upscale handle the rest costs far less than it looks.
    const aoW = Math.round(window.innerWidth * PostProcessing.AO_SCALE);
    const aoH = Math.round(window.innerHeight * PostProcessing.AO_SCALE);
    this.aoPass = new GTAOPass(scene, camera, aoW, aoH);
    this.aoPass.output = GTAOPass.OUTPUT.Default;
    this.aoPass.updateGtaoMaterial({ radius: 0.4, distanceExponent: 1.5, thickness: 1, distanceFallOff: 0.5, scale: 1, samples: 16, screenSpaceRadius: false });
    this.aoPass.blendIntensity = 0.5;
    this.composer.addPass(this.aoPass);

    // Round 4: threshold 0.96 meant almost nothing in the room ever bloomed — screens and the
    // pendant tube read as flat, un-lit-looking surfaces instead of the hot practicals the
    // reference shows. Lowered so genuinely bright emissives catch bloom; strength/radius raised
    // to match so the catch actually reads as a glow rather than a faint fringe.
    // Round 5: that radius was wide enough that a single very bright source (e.g. the airlock's
    // own practical) smeared a soft halo across a large fraction of the frame, dragging p95 up
    // 0.1-0.24 on several views — a spatial problem the grade shader's per-pixel curve can't fix,
    // since it can't tell "one huge bloom halo" from "many small legitimate highlights" once
    // they're both just bright pixels. Pulled radius/strength back a notch so bloom still reads
    // as a glow around genuinely hot practicals without bleeding across half the deck.
    // Round 6: console/displays/ceiling/starfieldWindow p95 still read 0.10-0.23 *below* the
    // reference — those views' own emissive sources (screens, pendant tube) weren't clearing this
    // threshold. Dropping it to 0.85 barely moved those (their pre-bloom luma sits below even the
    // old threshold — the room's ACES tonemap/exposure just doesn't leave much headroom for a
    // pass sitting this late in the chain) but did measurably worsen the airlock's own outlier
    // practical (+0.224 -> +0.251 p95), which the round-5 note above already flagged as the one
    // source bright enough to bloom-smear on its own. Settled at 0.89: a smaller nudge off the
    // original 0.93 than round 5 left it, without reopening that regression.
    // Round 7: tried a narrower radius (0.11) + lower threshold (0.82) + higher strength (0.55) to
    // separate airlock's problem (bloom *area* — one hot practical smearing across a big fraction
    // of its frame) from the under-bright views' problem (too little headroom at their own hot
    // pixels). Measured worse on both counts: the tighter kernel concentrated rather than shrank
    // the airlock halo (peak got hotter over a similar footprint, p95 +0.251 -> +0.29-ish), and the
    // lower threshold didn't move the under-bright views beyond this measurement's own noise.
    // Reverted strength/radius to the round-5 values and only nudged threshold up from 0.89 toward
    // the original 0.93-0.95 range — round 6 found 0.85 "barely moved" the under-bright views while
    // measurably worsening airlock, so undoing that trade recovers airlock without the cost. The
    // real remaining lever for the under-bright views is their own fixtures directly (lighting.ts).
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.4, 0.18, 0.94);
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
    this.width = width;
    this.height = height;
    this.composer.setSize(width, height);
    this.applyPassSizes();
  }

  /** Keep the composer's buffers in step with the renderer's pixel ratio (see constructor note). */
  setPixelRatio(ratio: number): void {
    this.composer.setPixelRatio(ratio);
    this.applyPassSizes();
  }

  // composer.setSize()/setPixelRatio() size every pass to the full effective buffer; AO is
  // deliberately cheaper than that (half CSS resolution — it's a low-frequency effect, see the
  // constructor note) and bloom stays at CSS resolution (a blur pass gains nothing from DPR).
  private applyPassSizes(): void {
    this.aoPass.setSize(Math.round(this.width * PostProcessing.AO_SCALE), Math.round(this.height * PostProcessing.AO_SCALE));
    this.bloomPass.setSize(this.width, this.height);
  }

  // Toggling pass.enabled is instant and free — EffectComposer just skips a disabled pass's
  // render() call, no re-construction, no lost GL state. GTAOPass is the single most expensive
  // pass measured (~4.5ms/frame, roughly fixed regardless of sample count — see the constructor
  // note above), so it's the first thing to drop; bloom is comparatively cheap but still real
  // cost on a genuinely weak device, so 'low' drops both.
  setQuality(tier: QualityTier): void {
    this.aoRequested = tier === 'high';
    this.aoPass.enabled = this.aoRequested && this.aoSupported;
    this.bloomPass.enabled = tier !== 'low';
  }

  setAOSupported(supported: boolean): void {
    this.aoSupported = supported;
    this.aoPass.enabled = this.aoRequested && supported;
  }

  // Independent toggles for the settings menu, so a player can drop just one heavy effect
  // without forcing the coarser tier preset down. setQuality() above remains the default the
  // tier selector applies before either of these overrides it.
  setAOEnabled(enabled: boolean): void {
    this.aoRequested = enabled;
    this.aoPass.enabled = enabled && this.aoSupported;
  }

  setBloomEnabled(enabled: boolean): void {
    this.bloomPass.enabled = enabled;
  }

  render(): void {
    this.composer.render();
  }
}
