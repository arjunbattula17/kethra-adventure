import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GradeGlowPass, GRADES } from './GradeGlowPass';
import type { GradeProfile } from './GradeGlowPass';

export type QualityTier = 'high' | 'medium' | 'low';

export class PostProcessing {
  composer: EffectComposer;
  private renderPass: RenderPass;
  private aoPass: GTAOPass;
  private bloomPass: UnrealBloomPass;
  private gradePass = new GradeGlowPass();
  private tier: QualityTier = 'high';
  private bloomRequested = true;
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

    this.composer.addPass(this.gradePass);
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
    this.tier = tier;
    this.aoRequested = tier === 'high';
    this.aoPass.enabled = this.aoRequested && this.aoSupported;
    this.bloomRequested = true;
    this.applyGlow();
  }

  /** Glow on every tier: UnrealBloom on High, the grade pass's cheaper glow below it. */
  private applyGlow(): void {
    this.bloomPass.enabled = this.bloomRequested && this.tier === 'high';
    this.gradePass.glowEnabled = this.bloomRequested && this.tier !== 'high';
  }

  /** Sets the colour grade; undefined falls back to the interior grade. */
  setGrade(profile: GradeProfile | undefined): void {
    this.gradePass.setGrade(profile ?? GRADES.interior);
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
    this.bloomRequested = enabled;
    this.applyGlow();
  }

  render(): void {
    this.composer.render();
  }

  /** Releases the composer's render targets and every pass's internal buffers. Only called when
   * the whole pipeline is rebuilt (a manual tier change that crosses the MSAA boundary). */
  dispose(): void {
    for (const pass of this.composer.passes) pass.dispose?.();
    this.composer.dispose();
  }
}
