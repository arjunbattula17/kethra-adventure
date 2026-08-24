import * as THREE from 'three';
import { InputManager } from './InputManager';
import { initSharedEnvironment } from './Environment';
import { PostProcessing } from './PostProcessing';
import type { QualityTier } from './PostProcessing';

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

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    initSharedEnvironment(this.renderer);
    InputManager.init(this.renderer.domElement);

    this.postFx = new PostProcessing(this.renderer, new THREE.Scene(), new THREE.PerspectiveCamera());
    this.tier = guessInitialTier();
    this.applyTier(this.tier);

    window.addEventListener('resize', () => this.handleResize());
  }

  private applyTier(tier: QualityTier): void {
    const settings = TIERS[tier];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.pixelRatio));
    this.renderer.shadowMap.enabled = settings.shadows;
    this.postFx.setQuality(tier);
  }

  /**
   * Runtime downgrade path: the startup guess is a crude core-count heuristic, and even a
   * correctly-classified device can bog down in a scene the guess didn't account for (Kethra's
   * foliage density vs. the ship interior's draw calls are very different costs). Sampled from
   * the real per-frame dt the game loop already computes — this *is* the p95 metric
   * tools/frame-trace.mjs measures offline, just computed continuously during actual play.
   * One-directional and rate-limited: never upgrades back up mid-session (a mid-play quality
   * jump reads as more jarring than staying conservative), and won't fire again for 5s after a
   * downgrade so the renderer has time to actually recover before being judged again.
   */
  private recordFrameForQuality(dtMs: number): void {
    if (this.tier === 'low') return; // nowhere further down to go
    this.recentFrameMs.push(dtMs);
    if (this.recentFrameMs.length < 60) return;
    if (this.recentFrameMs.length > 90) this.recentFrameMs.shift();

    const now = performance.now();
    if (now - this.lastDowngradeAt < 5000) return;

    const sorted = [...this.recentFrameMs].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    if (p95 > 33.3) {
      // sustained sub-30fps at p95 — a real, felt stutter, not a one-off hitch
      this.tier = this.tier === 'high' ? 'medium' : 'low';
      this.applyTier(this.tier);
      this.lastDowngradeAt = now;
      this.recentFrameMs.length = 0;
    }
  }

  async setScene(factory: () => Promise<GameScene> | GameScene): Promise<void> {
    if (this.current) {
      this.current.dispose();
      this.current = null;
    }
    const scene = await factory();
    await scene.init();
    this.current = scene;
    this.postFx.setActive(scene.scene, scene.camera);
    this.handleResize();
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
