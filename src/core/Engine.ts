import * as THREE from 'three';
import { InputManager } from './InputManager';
import { initSharedEnvironment } from './Environment';
import { PostProcessing } from './PostProcessing';
import type { QualityTier } from './PostProcessing';
import { UIManager } from '../ui/UIManager';
import { setKitTextureMaxSize } from './textureCache';

// Per-tier renderer settings. shadowMap.enabled and pixelRatio are both free to toggle at
// runtime (no GL context loss, no re-construction) — only the WebGLRenderer's own creation-time
// flags (antialias, powerPreference) can't be changed after the fact, so those stay fixed.
const TIERS: Record<QualityTier, { pixelRatio: number; shadows: boolean }> = {
  high: { pixelRatio: 2, shadows: true },
  medium: { pixelRatio: 1.5, shadows: true },
  low: { pixelRatio: 1, shadows: false },
};

// One-shot startup guess from a real, immediately-available signal (logical core count) — crude,
// but the runtime monitor below corrects a wrong guess within a couple of seconds of actual play,
// so this only has to be roughly right, not perfectly right.
function guessInitialTier(): QualityTier {
  const cores = navigator.hardwareConcurrency || 4;
  if (cores <= 2) return 'low';
  if (cores <= 4) return 'medium';
  return 'high';
}

export interface GameScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  init(): void | Promise<void>;
  update(dt: number, elapsed: number): void;
  dispose(): void;
  onResize?(width: number, height: number): void;
  /** Opt out of screen-space ambient occlusion. Defaults to on. A scene that is mostly empty space
   * has nothing for GTAO to occlude, and the pass's half-resolution buffer instead paints visible
   * blocky rectangles across the sky and a hard square halo around additive sprites -- see the
   * with/without pair in renders/space-audit. */
  usesAO?: boolean;
  /** Declare that nothing in this scene that casts a shadow ever moves (meshes or lights — light
   * intensity changes are fine, they don't touch the depth map). The engine then renders the
   * scene's shadow maps once instead of every frame. Measured on the ship interior: the per-frame
   * shadow pass was ~1,100 of its ~2,470 draw calls, re-drawing an identical depth map. A scene
   * that opts in and later animates a caster must arm renderer.shadowMap.needsUpdate itself. */
  staticShadows?: boolean;
}

export class Engine {
  renderer: THREE.WebGLRenderer;
  clock = new THREE.Clock();
  private current: GameScene | null = null;
  private rafId = 0;
  private paused = false;
  private postFx: PostProcessing;
  private tier: QualityTier;
  // Rolling frame-time window the runtime monitor judges against — short enough to react within
  // a couple of seconds, long enough that one hitch (GC pause, texture upload) can't trigger a
  // downgrade on its own.
  private recentFrameMs: number[] = [];
  private lastDowngradeAt = -Infinity;
  // Set once a player explicitly picks a tier in the settings menu — from then on the automatic
  // downgrade monitor stops overriding their choice. Players who never open the menu keep the
  // fully automatic behavior above.
  private manualOverride = false;
  // Below-'low' relief valve for machines where even the low tier stays GPU-bound (old integrated
  // graphics): the same sustained-p95 evidence that walks the tier down keeps going, stepping the
  // internal render scale 1 -> 0.85 -> 0.7. Like the tier itself it never climbs back mid-session
  // (see the recordFrameForQuality note), and a manual tier choice resets it to 1.
  private renderScale = 1;
  private static readonly RENDER_SCALE_STEPS = [1, 0.85, 0.7];

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // On by default, and it makes three.js call gl.getProgramInfoLog/getShaderInfoLog for every
    // program it builds — synchronous calls that force a GPU flush purely to report errors. This
    // scene compiles 91 distinct programs on boot and shader compilation is not cached across page
    // loads, so that cost is paid on every single load; measured, turning it off roughly halves the
    // main thread's blocking time during boot. Kept on in dev, where the custom shaders in
    // planetShader.ts and PostProcessing.ts are actually being edited and a compile error should
    // surface loudly rather than as a silently black screen.
    this.renderer.debug.checkShaderErrors = !import.meta.env.PROD;
    container.appendChild(this.renderer.domElement);

    initSharedEnvironment(this.renderer);
    InputManager.init(this.renderer.domElement);

    this.tier = guessInitialTier();
    // MSAA resolves per-frame at full buffer resolution, so only the low tier skips it.
    this.postFx = new PostProcessing(this.renderer, new THREE.Scene(), new THREE.PerspectiveCamera(), this.tier === 'low' ? 0 : 4);
    this.applyTier(this.tier);

    window.addEventListener('resize', () => this.handleResize());
  }

  private applyTier(tier: QualityTier): void {
    const settings = TIERS[tier];
    const ratio = Math.min(window.devicePixelRatio, settings.pixelRatio) * this.renderScale;
    this.renderer.setPixelRatio(ratio);
    // Scenes loaded from here on decode kit textures at half size on the lowest tier — the
    // shared-VRAM integrated GPUs that land there gain ~75% of the kits' texture memory back.
    // Already-loaded scenes keep their current textures; the cache re-decodes on a tier change.
    setKitTextureMaxSize(tier === 'low' ? 1024 : Infinity);
    // The composer holds its own copy of the pixel ratio (snapshotted at construction) — without
    // this it keeps rendering at the old ratio and the result is scaled to fit the canvas.
    this.postFx.setPixelRatio(ratio);
    this.renderer.shadowMap.enabled = settings.shadows;
    // A static-shadow scene (shadowMap.autoUpdate off) has consumed its one needsUpdate; shadows
    // coming back after a tier change need a fresh paint or they'd show a stale/empty map.
    if (settings.shadows && !this.renderer.shadowMap.autoUpdate) this.renderer.shadowMap.needsUpdate = true;
    this.postFx.setQuality(tier);
  }

  // Runtime downgrade path: the startup guess is a crude core-count heuristic, and even a
  // correctly-classified device can bog down in a scene the guess didn't account for (Kethra's
  // foliage density vs. the ship interior's draw calls are very different costs). Sampled from
  // the real per-frame dt the game loop already computes — this *is* the p95 metric
  // tools/frame-trace.mjs measures offline, just computed continuously during actual play.
  // One-directional and rate-limited: never upgrades back up mid-session (a mid-play quality
  // jump reads as more jarring than staying conservative), and won't fire again for 5s after a
  // downgrade so the renderer has time to actually recover before being judged again.
  private recordFrameForQuality(dtMs: number): void {
    if (this.manualOverride) return; // player has chosen a tier themselves — stop overriding it
    // At the bottom tier the render-scale steps are what's left; stop only once those run out too.
    if (this.tier === 'low' && this.renderScale <= Engine.RENDER_SCALE_STEPS[Engine.RENDER_SCALE_STEPS.length - 1]) return;
    this.recentFrameMs.push(dtMs);
    if (this.recentFrameMs.length < 60) return;
    if (this.recentFrameMs.length > 90) this.recentFrameMs.shift();

    const now = performance.now();
    if (now - this.lastDowngradeAt < 5000) return;

    const sorted = [...this.recentFrameMs].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    if (p95 > 33.3) {
      // sustained sub-30fps at p95 — a real, felt stutter, not a one-off hitch
      if (this.tier !== 'low') {
        this.tier = this.tier === 'high' ? 'medium' : 'low';
      } else {
        const steps = Engine.RENDER_SCALE_STEPS;
        this.renderScale = steps[Math.min(steps.indexOf(this.renderScale) + 1, steps.length - 1)];
      }
      this.applyTier(this.tier);
      this.lastDowngradeAt = now;
      this.recentFrameMs.length = 0;
    }
  }

  async setScene(factory: () => Promise<GameScene> | GameScene): Promise<void> {
    // Asset fetch + shader compile below can run several seconds on a cold cache (first load, or
    // a judge's laptop on unfamiliar wifi) with nothing else on screen — the caller's fade-to-black
    // covers scene transitions, but the very first scene at boot has no fade at all. A spinner here
    // covers both cases, so a slow load reads as "loading" instead of "did this freeze?".
    UIManager.showLoading();
    try {
      if (this.current) {
        this.current.dispose();
        this.current = null;
      }
      const scene = await factory();
      await scene.init();
      // WebGLRenderer compiles (and on some drivers, links) each material's shader program lazily
      // on its first real draw call — not at material-creation time — so without this, the first
      // frame(s) a given material is actually visible on screen pay a real, synchronous compile
      // stall. compileAsync walks the scene up front and warms every program before the scene is
      // exposed to the player, so that cost lands here (behind the caller's fade-to-black, where one
      // is used) instead of surfacing as an unpredictable mid-gameplay hitch the first time the
      // camera turns toward a material nothing has rendered yet.
      await this.renderer.compileAsync(scene.scene, scene.camera);
      this.current = scene;
      this.postFx.setActive(scene.scene, scene.camera);
      this.postFx.setAOSupported(scene.usesAO !== false);
      this.renderer.shadowMap.autoUpdate = scene.staticShadows !== true;
      // One paint for the new scene's maps; consumed by the first render when autoUpdate is off.
      this.renderer.shadowMap.needsUpdate = true;
      this.handleResize();
    } finally {
      UIManager.hideLoading();
    }
  }

  private handleResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.postFx.setSize(w, h);
    if (this.current) {
      this.current.camera.aspect = w / h;
      this.current.camera.updateProjectionMatrix();
      this.current.onResize?.(w, h);
    }
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  getCurrentScene(): GameScene | null {
    return this.current;
  }

  getQualityTier(): QualityTier {
    return this.tier;
  }

  // Manual override entry point for the settings menu: applies the tier's preset immediately
  // and permanently disables the automatic downgrade monitor for the rest of the session.
  setManualQualityTier(tier: QualityTier): void {
    this.manualOverride = true;
    // An explicit choice also clears any render-scale relief the automatic path had applied —
    // the player asked for this tier's real resolution.
    this.renderScale = 1;
    this.tier = tier;
    this.applyTier(tier);
  }

  setShadowsEnabled(enabled: boolean): void {
    this.renderer.shadowMap.enabled = enabled;
    // Same re-arm as applyTier: a static-shadow scene needs one fresh paint on re-enable.
    if (enabled && !this.renderer.shadowMap.autoUpdate) this.renderer.shadowMap.needsUpdate = true;
  }

  setAOEnabled(enabled: boolean): void {
    this.postFx.setAOEnabled(enabled);
  }

  setBloomEnabled(enabled: boolean): void {
    this.postFx.setBloomEnabled(enabled);
  }

  start(): void {
    const loop = () => {
      this.rafId = requestAnimationFrame(loop);
      const dt = Math.min(this.clock.getDelta(), 0.1);
      const elapsed = this.clock.getElapsedTime();
      if (!this.paused && this.current) {
        this.current.update(dt, elapsed);
        this.postFx.render();
        this.recordFrameForQuality(dt * 1000);
      }
      InputManager.endFrame();
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.rafId);
  }
}
