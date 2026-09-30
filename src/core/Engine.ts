import * as THREE from 'three';
import { InputManager } from './InputManager';
import { getSharedEnvironment, initSharedEnvironment, initSharedEnvironmentAsync, rebuildSharedEnvironment } from './Environment';
import { PostProcessing } from './PostProcessing';
import type { QualityTier } from './PostProcessing';
import type { GradeProfile } from './GradeGlowPass';
import { UIManager } from '../ui/UIManager';
import { setKitTextureMaxSize } from './textureCache';
import { applyShaderPatches } from './shaderPatches';
import { motion } from '../motion';
import { span, timed } from './perfMarks';
import { takeProbedContext } from './glContext';
import { PACE, Pacer, compileProgressively, drawProgressively, texturesOf, uploadProgressively, yieldToBrowser } from './prepare';
import type { Pace } from './prepare';

export interface PrepareOptions {
  /** How much work per frame; defaults to loading-screen pace. The caller may change pacer.pace mid-way. */
  pacer?: Pacer;
  /** Progress through the current stage, for a loading bar. */
  onProgress?: (fraction: number, stage: 'build' | 'compile' | 'upload' | 'draw') => void;
}

/** A scene's name on the performance timeline ("ShipInteriorScene:init"). */
const kindOf = (scene: GameScene) => (scene as { kind?: string }).kind ?? 'scene';

// Per-tier renderer settings. shadowMap.enabled and pixelRatio are both free to toggle at
// runtime (no GL context loss, no re-construction) — only the WebGLRenderer's own creation-time
// flags (antialias, powerPreference) can't be changed after the fact, so those stay fixed.
const TIERS: Record<QualityTier, { pixelRatio: number; shadows: boolean }> = {
  high: { pixelRatio: 2, shadows: true },
  medium: { pixelRatio: 1.5, shadows: true },
  low: { pixelRatio: 1, shadows: false },
};

const TIER_ORDER: QualityTier[] = ['low', 'medium', 'high'];

/**
 * One-shot startup guess from two immediately-available signals. Logical core count alone was
 * the original heuristic, and it misclassifies the most common weak machine there is: a
 * many-core laptop on integrated graphics guessed 'high' and spent its first ~15-20s stuttering
 * while the runtime monitor walked the tier back down (the monitor never climbs, so the guess is
 * the ceiling for the whole session). The GPU string caps the guess: Intel UHD/HD and ARM
 * Chromebook parts and software rasterizers start at 'low', Iris and AMD integrated parts at
 * 'medium'. Chrome reports it through the ANGLE
 * wrapper ("ANGLE (Intel, Intel(R) Iris(R) Xe Graphics ..., D3D11)"), so substring matching is
 * the dependable shape. Unrecognized GPUs cap nothing — discrete parts stay on the core guess,
 * and the runtime monitor still corrects any leftover optimism within seconds of real play.
 */
function guessInitialTier(renderer: THREE.WebGLRenderer): QualityTier {
  const cores = navigator.hardwareConcurrency || 4;
  const coreGuess: QualityTier = cores <= 2 ? 'low' : cores <= 4 ? 'medium' : 'high';

  let gpu = '';
  try {
    const gl = renderer.getContext();
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    gpu = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)).toLowerCase();
  } catch {
    // No renderer string — fall through to the core guess alone.
  }
  // Intel's UHD/HD parts and the ARM chips in Chromebooks start at Performance: measured on an Intel
  // UHD (Ice Lake G1), the Wren runs at ~35 fps on Balanced and ~50 on Performance even after the
  // 2026-09-27 performance pass (15 and 30 before it; docs/PERF_LOG.md). Guessing Balanced there
  // meant the benchmark stepped down after the ship's shaders were built, and a cold first load
  // compiled every one of them twice. Iris and AMD integrated graphics keep the Balanced guess; the
  // benchmark still checks all of them.
  let gpuCap: QualityTier = 'high';
  if (/swiftshader|llvmpipe|software/.test(gpu)) gpuCap = 'low';
  else if (/uhd graphics|hd graphics|mali|adreno|powervr/.test(gpu)) gpuCap = 'low';
  else if (/intel|iris|radeon\(tm\) graphics|vega/.test(gpu)) gpuCap = 'medium';

  return TIER_ORDER[Math.min(TIER_ORDER.indexOf(coreGuess), TIER_ORDER.indexOf(gpuCap))];
}

export interface GameScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Builds the scene. A long build may `await pacer.tick()` between its pieces to let frames through. */
  init(pacer?: Pacer): void | Promise<void>;
  /** Called once the scene is current. A scene prepared ahead (prepareScene) runs its init while
   * another scene is still on screen, so its timelines and input start here, not in init. */
  onEnter?(): void;
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
  /** This scene's colour grade (GradeGlowPass.ts, GRADES). Defaults to the interior's. */
  grade?: GradeProfile;
}

export class Engine {
  renderer: THREE.WebGLRenderer;
  // Timer, not Clock: three.js deprecated Clock (it printed a warning on every load).
  timer = new THREE.Timer();
  private current: GameScene | null = null;
  private rafId = 0;
  private running = false;
  private paused = false;
  private postFx: PostProcessing;
  private tier: QualityTier;
  // Rolling frame-time window the runtime monitor judges against — short enough to react within
  // a couple of seconds, long enough that one hitch (GC pause, texture upload) can't trigger a
  // downgrade on its own.
  private recentFrameMs: number[] = [];
  private lastDowngradeAt = -Infinity;
  // Loading is not evidence of a slow machine. A scene preparing in the background (the interior
  // builds behind the intro) and the first seconds after a handover (driver-deferred shader and
  // texture work) produce multi-second frames on any GPU; judged as gameplay, they walked an
  // RTX 4060 from high to low within the intro. The monitor ignores frames while either is true.
  private preparing = 0;
  private governorHoldUntil = 0;
  private static readonly POST_SCENE_GRACE_MS = 4000;
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
  // The composer's multisample count is baked into its render target at construction, so it can
  // only follow a tier change by rebuilding the whole PostProcessing pipeline — done exclusively
  // for MANUAL tier choices (a menu action can absorb a one-off rebuild; the automatic downgrade
  // path stays instant and just keeps whatever samples it started with).
  private msaaSamples: number;
  // Frames counted since the governor last judged; it sorts its window every 30 frames instead of
  // copying and sorting it on every frame (a per-frame allocation in the hot loop).
  private framesSinceJudged = 0;
  /** Set when the browser reports low battery: the loop then draws at most 30 frames a second. */
  private capTo30 = false;
  /** Set by the governor at the bottom tier when this machine can't hold ~45 fps: a steady 30
   * instead (see recordFrameForQuality). Unlike the tier it is judged per scene and cleared at each
   * scene change: on Intel UHD graphics the Wren needs it and Kethra holds 60 without it. */
  private steadyCap = false;
  private lastDrawAt = 0;
  private contextLost = false;
  /** Set when the runtime governor stepped the tier down mid-play. Mid-play it leaves shadows and
   * anti-aliasing as they were (toggling them recompiles every shader, a multi-second freeze), so
   * the full preset for the new tier is applied at the next scene change, behind the cover. */
  private fullPresetPending = false;
  private toldAboutDowngrade = false;

  constructor(container: HTMLElement) {
    // Before any program is built: every lit shader in the game includes the patched chunk.
    applyShaderPatches();
    // No multisampling and no depth buffer on the canvas itself: every frame reaches it as one
    // full-screen quad from the post-processing chain's last pass (PostProcessing.ts), which does its
    // own anti-aliasing on its own targets. A multisampled canvas smoothed nothing and still cost a
    // 4x colour and depth buffer (~33 MB at 1366x768 on a laptop that shares its RAM with the GPU)
    // and a resolve every frame.
    // The context main.ts created to check WebGL 2 works, with these same attributes (glContext.ts):
    // one context instead of two. three.js takes its alpha flag from a context it is handed, and
    // would then clear to transparent; clearing opaque keeps what it does with a context of its own.
    const probed = takeProbedContext();
    this.renderer = timed('engine:renderer', () =>
      // (three.js's typings still name the WebGL 1 context type; it only accepts WebGL 2 now.)
      new THREE.WebGLRenderer({ canvas: probed?.canvas, context: probed?.context as unknown as WebGLRenderingContext | undefined, antialias: false, depth: false, powerPreference: 'high-performance' }));
    if (probed) this.renderer.setClearAlpha(1);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    // PCFShadowMap: three.js r185 deprecated PCFSoftShadowMap and was already substituting this.
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // On by default, and it makes three.js call gl.getProgramInfoLog/getShaderInfoLog for every
    // program it builds — synchronous calls that force a GPU flush purely to report errors. This
    // scene compiles 91 distinct programs on boot and shader compilation is not cached across page
    // loads, so that cost is paid on every single load; measured, turning it off roughly halves the
    // main thread's blocking time during boot. Kept on in dev, where the custom shaders in
    // planetShader.ts and PostProcessing.ts are actually being edited and a compile error should
    // surface loudly rather than as a silently black screen.
    this.renderer.debug.checkShaderErrors = !import.meta.env.PROD;
    // Opaque draw order: grouped by shader program first. three.js sorts by material, and the Wren
    // has ~400 materials sharing ~70 programs in no particular order, so a frame switched program
    // 215 times for 520 draws, and every switch re-sends the program's light and camera uniforms.
    // Grouping cut frame time 6.7% and render-call JavaScript 7.6% on Intel UHD graphics
    // (docs/PERF_LOG.md, 2026-09-27). Within a program the order is three.js's own (material, then
    // near to far). Sorting purely near to far was measured too: 6% slower, from the extra switches.
    // Transparent objects keep three.js's back-to-front order, which blending depends on.
    const props = this.renderer.properties;
    const programOf = (m: THREE.Material) => (props.get(m) as { currentProgram?: { id: number } }).currentProgram?.id ?? 0;
    // three.js numbers every material at creation; the typings don't declare it.
    const idOf = (m: THREE.Material) => (m as unknown as { id: number }).id;
    this.renderer.setOpaqueSort((a: THREE.RenderItem, b: THREE.RenderItem) =>
      a.groupOrder - b.groupOrder || a.renderOrder - b.renderOrder || programOf(a.material) - programOf(b.material) || idOf(a.material) - idOf(b.material) || a.z - b.z || a.id - b.id);
    container.appendChild(this.renderer.domElement);

    InputManager.init(this.renderer.domElement);

    this.tier = guessInitialTier(this.renderer);
    // MSAA resolves per-frame at full buffer resolution, so only Quality pays for it; Balanced uses
    // FXAA instead (PostProcessing's constructor note) and Performance draws without either.
    this.msaaSamples = Engine.samplesFor(this.tier);
    this.postFx = timed('engine:postfx', () => new PostProcessing(this.renderer, new THREE.Scene(), new THREE.PerspectiveCamera(), this.msaaSamples));
    this.applyTier(this.tier);

    window.addEventListener('resize', () => this.handleResize());

    // A browser can take the GPU context away (driver reset, too many tabs, a laptop switching
    // graphics). Default behaviour is a permanently black canvas. preventDefault asks for it back;
    // three.js rebuilds its GPU state on restore and re-uploads textures and geometry on next use.
    const canvas = this.renderer.domElement;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
      UIManager.toast('The browser reset the graphics. Restoring…', 'fail');
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      if (getSharedEnvironment()) {
        const env = rebuildSharedEnvironment(this.renderer);
        if (this.current?.scene.environment) this.current.scene.environment = env;
      }
      this.renderer.shadowMap.needsUpdate = true;
      this.handleResize();
      UIManager.toast('Graphics restored.', 'learn');
    });

    // Battery: where the browser reports it (Chromium), a laptop below 20% and unplugged drops to
    // 30 frames a second. Steady 30 costs half the GPU work of 60 and still reads as smooth.
    const nav = navigator as Navigator & { getBattery?: () => Promise<{ level: number; charging: boolean; addEventListener: (t: string, f: () => void) => void }> };
    nav.getBattery?.().then((battery) => {
      const check = () => {
        this.capTo30 = !battery.charging && battery.level < 0.2;
      };
      check();
      battery.addEventListener('levelchange', check);
      battery.addEventListener('chargingchange', check);
    }).catch(() => {});
  }

  // `automatic` keeps the current shadow state: toggling shadowMap.enabled changes the program of
  // every shadow-receiving material, and the recompile froze the ship interior for ~7s — worse than
  // the frame time it was meant to save. Startup guesses and manual choices apply the full preset.
  private applyTier(tier: QualityTier, automatic = false): void {
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
    if (!automatic) {
      this.renderer.shadowMap.enabled = settings.shadows;
      // A static-shadow scene (shadowMap.autoUpdate off) has consumed its one needsUpdate; shadows
      // coming back after a tier change need a fresh paint or they'd show a stale/empty map.
      if (settings.shadows && !this.renderer.shadowMap.autoUpdate) this.renderer.shadowMap.needsUpdate = true;
    }
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
    // At the bottom tier the steady-30 cap and the render-scale steps are what's left; stop only
    // once those run out too.
    const atFloor = this.tier === 'low' && this.renderScale <= Engine.RENDER_SCALE_STEPS[Engine.RENDER_SCALE_STEPS.length - 1];
    if (atFloor && this.steadyCap) return;
    const now = performance.now();
    if (this.preparing > 0 || now < this.governorHoldUntil) return;
    this.recentFrameMs.push(dtMs);
    if (this.recentFrameMs.length < 60) return;
    if (this.recentFrameMs.length > 90) this.recentFrameMs.shift();

    if (now - this.lastDowngradeAt < 5000) return;
    if (++this.framesSinceJudged < 30) return;
    this.framesSinceJudged = 0;

    const sorted = [...this.recentFrameMs].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    let total = 0;
    for (const ms of this.recentFrameMs) total += ms;
    const average = total / this.recentFrameMs.length;
    // Steady 30 before anything else at the bottom tier. A machine averaging under ~45 fps on a
    // 60 Hz screen shows each frame for one refresh or two in no fixed pattern, which reads as judder
    // when the camera turns; drawing every other refresh shows every frame for exactly two. It also
    // halves the GPU's work, which keeps a fanless laptop from heating up and throttling further.
    // The brief's rule: a stable 30 beats a 20-60 swing.
    if (this.tier === 'low' && !this.steadyCap && average > 22) {
      this.steadyCap = true;
      this.lastDowngradeAt = now;
      this.recentFrameMs.length = 0;
      return;
    }
    if (atFloor) return;
    // Capped frames last two refreshes (33.3 ms) by design, so under the cap a frame only counts as
    // missed once it takes a third.
    const budget = this.steadyCap ? 40 : 33.3;
    // A frame that misses one vsync lasts ~33.4ms, so a burst of isolated misses on a machine
    // otherwise holding 60fps clears the p95 bar by itself — measured on an RTX 4060, 13 such
    // frames in 15s were enough to walk it to 'low'. Requiring the average to be off 60fps too
    // keeps that jitter out while still catching a machine that is genuinely GPU-bound.
    if (p95 > budget && average > 20) {
      // sustained sub-30fps at p95 with a sub-50fps average — a real, felt stutter, not jitter
      if (this.tier !== 'low') {
        this.tier = this.tier === 'high' ? 'medium' : 'low';
      } else {
        const steps = Engine.RENDER_SCALE_STEPS;
        this.renderScale = steps[Math.min(steps.indexOf(this.renderScale) + 1, steps.length - 1)];
      }
      this.applyTier(this.tier, true);
      this.fullPresetPending = true;
      this.noteDowngrade();
      this.lastDowngradeAt = now;
      this.recentFrameMs.length = 0;
    }
  }

  /**
   * Prepares a scene without making it current: init (asset fetch, geometry build), then warmScene.
   * Everything after init is done in small pieces between frames (prepare.ts), so it is safe to run
   * while another scene plays: the Wren prepares itself behind the intro. Pass the prepared scene to
   * setScene with `prepared: true` so it isn't initialized twice.
   */
  async prepareScene(scene: GameScene, opts: PrepareOptions = {}): Promise<void> {
    await this.ensureEnvironment();
    const pacer = opts.pacer ?? this.newPacer(PACE.loading);
    this.preparing++;
    try {
      const t = performance.now();
      opts.onProgress?.(0, 'build');
      await scene.init(pacer);
      span(`${kindOf(scene)}:init`, t);
    } finally {
      this.preparing--;
    }
    await this.warmScene(scene, { ...opts, pacer });
  }

  /**
   * The GPU half of preparing a built scene: its programs, its textures and each object's first draw,
   * a few at a time. Run again after anything that changes the programs (a tier change's light budget).
   */
  async warmScene(scene: GameScene, opts: PrepareOptions = {}): Promise<void> {
    this.preparing++;
    const pacer = opts.pacer ?? this.newPacer(PACE.loading);
    const report = opts.onProgress ?? (() => {});
    const kind = kindOf(scene);
    try {
      let t = performance.now();
      // Programs first, a few at a time (prepare.ts). They are compiled for the render target the
      // composer draws the scene into: three.js keys a program on the target bound when it is built,
      // and a compile with nothing bound built the canvas variant of every program (tone mapping, sRGB
      // output), so the first real frame compiled them all again, synchronously. Measured on Intel UHD
      // graphics, cold: 11.6 s of wasted compiling, then a 28 s freeze (docs/PERF_LOG.md, 2026-09-28).
      await compileProgressively(this.renderer, scene.scene, scene.camera, this.compileTarget, pacer, (f) => report(f, 'compile'));
      span(`${kind}:compile`, t);
      t = performance.now();
      await uploadProgressively(this.renderer, texturesOf(scene.scene), pacer, (f) => report(f, 'upload'));
      span(`${kind}:upload`, t);
      t = performance.now();
      await drawProgressively(this.renderer, scene.scene, scene.camera, this.compileTarget, pacer, 24, (f) => report(f, 'draw'));
      span(`${kind}:firstDraw`, t);
    } finally {
      this.preparing--;
      this.holdGovernor();
    }
  }

  /**
   * The environment map every scene lights its metals with, made on first need rather than with the
   * engine: 0.9-1.3 s on a first visit to an Intel UHD laptop, nearly all of it compiling its shaders,
   * which Environment.ts now does off the page's thread. boot.ts asks for it while the title screen
   * waits; otherwise the first scene's preparation waits for it, behind the loading bar.
   */
  ensureEnvironment(): Promise<void> {
    if (getSharedEnvironment()) return Promise.resolve();
    this.environmentPending ??= (async () => {
      const start = performance.now();
      try {
        await initSharedEnvironmentAsync(this.renderer, this.compileTarget);
      } catch {
        initSharedEnvironment(this.renderer); // the plain way, if the parallel route fails
      }
      span('engine:environment', start);
    })();
    return this.environmentPending;
  }

  private environmentPending: Promise<void> | null = null;

  /** A pacer for scene preparation, fenced on this renderer's GPU queue (see Pacer). */
  newPacer(pace: Pace): Pacer {
    return new Pacer(pace, this.renderer.getContext() as WebGL2RenderingContext);
  }

  /** The off-screen target scene preparation compiles and draws against; see prepareScene. */
  private compileTarget = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType });

  /** `quiet` skips the loading indicator, for a scene prepared while a cutscene is still on screen. */
  async setScene(factory: () => Promise<GameScene> | GameScene, opts: { prepared?: boolean; quiet?: boolean; onProgress?: PrepareOptions['onProgress'] } = {}): Promise<void> {
    // Asset fetch + shader compile below can run several seconds on a cold cache (first load, or
    // a judge's laptop on unfamiliar wifi) with nothing else on screen — the caller's fade-to-black
    // covers scene transitions, but the very first scene at boot has no fade at all. A spinner here
    // covers both cases, so a slow load reads as "loading" instead of "did this freeze?".
    if (!opts.quiet) UIManager.showLoading();
    try {
      if (this.current) {
        this.current.dispose();
        this.current = null;
      }
      // A safe moment: the screen is covered and the new scene's shaders are about to compile anyway.
      if (this.fullPresetPending) this.applyFullPreset(this.tier);
      const scene = await factory();
      // WebGLRenderer compiles (and on some drivers, links) each material's shader program lazily
      // on its first real draw call — not at material-creation time — so without the compile in
      // prepareScene, the first frame(s) a given material is actually visible on screen pay a
      // real, synchronous compile stall. Landing it here keeps that cost behind the caller's
      // fade-to-black (where one is used) instead of surfacing as an unpredictable mid-gameplay
      // hitch. A scene the caller already ran through prepareScene() skips straight to handover.
      if (!opts.prepared) await this.prepareScene(scene, { onProgress: opts.onProgress });
      this.current = scene;
      // Frame pacing is this scene's to earn: the governor judges it afresh after the grace period.
      this.steadyCap = false;
      this.postFx.setActive(scene.scene, scene.camera);
      this.postFx.setAOSupported(scene.usesAO !== false);
      this.postFx.setGrade(scene.grade);
      this.renderer.shadowMap.autoUpdate = scene.staticShadows !== true;
      // One paint for the new scene's maps; consumed by the first render when autoUpdate is off.
      this.renderer.shadowMap.needsUpdate = true;
      this.handleResize();
      // Warm-up frame, drawn while the loading overlay (boot) or fade-to-black (transitions)
      // still covers the screen. compileAsync links the programs, but drivers defer per-program
      // draw specialization and every texture upload to first *use* — without this, all of that
      // lands in the first visible frame, i.e. a freeze exactly when the loading UI disappears.
      // Measured on the software-rendered harness: ~40s of first-frame stall (93 programs, ~300
      // texture sources) moved from after the overlay to behind it; real GPUs pay the same
      // pattern at smaller scale, on boot and on every ship<->planet<->reveal transition.
      timed(`${kindOf(scene)}:warmup`, () => this.drawEverythingOnce(scene));
      scene.onEnter?.();
    } finally {
      if (!opts.quiet) UIManager.hideLoading();
      this.holdGovernor();
    }
  }

  /** Sets the colour grade immediately, for a scene that changes grade partway through. */
  setGrade(profile: GradeProfile): void {
    this.postFx.setGrade(profile);
  }

  /**
   * The warm-up frame, drawn with frustum culling off and every hidden mesh shown, then put back.
   *
   * three.js uploads a mesh's geometry and textures, and the driver does its first-draw work, the
   * first time that mesh is actually drawn. A warm-up frame drawn from the spawn camera only pays that
   * for what is in view, so the rest was paid in play, the first time the player turned around or a
   * hidden prop was shown: measured on Intel UHD graphics, 130-530 ms frames on the first turn in the
   * Wren and a 2 s freeze on the first turn in the Anchorage (docs/PERF_LOG.md, 2026-09-27). Drawing
   * everything once moves all of it behind the loading cover. Only drawable leaves are un-hidden, never
   * lights or groups, so the light count (and with it every shader program) stays the same. An
   * un-hidden mesh casts no shadow for the frame: a static-shadow scene paints its one shadow map in
   * this very frame, and would keep that mesh's shadow for good.
   */
  private drawEverythingOnce(scene: GameScene): void {
    const culled: THREE.Object3D[] = [];
    const hidden: { o: THREE.Object3D; castShadow: boolean }[] = [];
    scene.scene.traverse((o) => {
      const drawable = (o as THREE.Mesh).isMesh || (o as THREE.Points).isPoints || (o as THREE.Sprite).isSprite || (o as THREE.Line).isLine;
      if (!drawable) return;
      if (o.frustumCulled) {
        o.frustumCulled = false;
        culled.push(o);
      }
      if (!o.visible) {
        hidden.push({ o, castShadow: o.castShadow });
        o.visible = true;
        o.castShadow = false;
      }
    });
    try {
      this.postFx.render();
    } finally {
      for (const o of culled) o.frustumCulled = true;
      for (const { o, castShadow } of hidden) {
        o.visible = false;
        o.castShadow = castShadow;
      }
    }
  }

  private holdGovernor(): void {
    this.recentFrameMs.length = 0;
    this.governorHoldUntil = performance.now() + Engine.POST_SCENE_GRACE_MS;
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
    this.applyFullPreset(tier);
  }

  /**
   * A tier's whole preset, shadows and anti-aliasing included. Only ever called where a shader
   * recompile can't be seen: a manual choice in the menu, or behind a scene transition's cover.
   */
  private applyFullPreset(tier: QualityTier): void {
    this.fullPresetPending = false;
    this.tier = tier;
    // Crossing the MSAA boundary (Quality <-> the other tiers) needs the composer rebuilt, or a
    // machine that guessed a lower tier and was manually raised would silently run High without
    // anti-aliasing for the rest of the session.
    const samples = Engine.samplesFor(tier);
    if (samples !== this.msaaSamples) {
      this.msaaSamples = samples;
      this.postFx.dispose();
      this.postFx = new PostProcessing(this.renderer, new THREE.Scene(), new THREE.PerspectiveCamera(), samples);
      if (this.current) {
        this.postFx.setActive(this.current.scene, this.current.camera);
        this.postFx.setAOSupported(this.current.usesAO !== false);
        this.postFx.setGrade(this.current.grade);
      }
      this.postFx.setSize(window.innerWidth, window.innerHeight);
    }
    this.applyTier(tier);
  }

  private static samplesFor(tier: QualityTier): number {
    return tier === 'high' ? 4 : 0;
  }

  /**
   * The start-up benchmark (docs/PERF_REPORT.md, "Auto-detect"): a handful of hidden frames of the
   * real scene, drawn and timed behind the loading cover, with gl.finish() so GPU time counts too.
   * The hardware guess from the GPU name and core count is only a guess; this measures. If the
   * median frame misses the budget, the tier steps down before the player sees a single frame.
   * Skipped when the player chose a tier themselves.
   */
  async benchmarkScene(scene: GameScene): Promise<QualityTier> {
    if (this.manualOverride) return this.tier;
    let median = await this.medianFrameMs(scene);
    // Step down only for a machine that clearly can't hold the tier: under ~45 fps from Quality goes
    // to Balanced, under ~30 fps goes to Performance. Balanced is measured again before it is kept:
    // a laptop that misses Quality by far can miss Balanced too (Intel UHD graphics before the
    // 2026-09-27 pass: the Wren at 10 fps on Quality, 15 on Balanced), and a single step left it there
    // until the runtime governor noticed mid-play. The runtime governor handles the rest.
    if (this.tier === 'high' && median > 22) {
      this.applyFullPreset('medium');
      this.noteDowngrade();
      median = await this.medianFrameMs(scene);
    }
    if (this.tier !== 'low' && median > 33) {
      this.applyFullPreset('low');
      this.noteDowngrade();
    }
    this.lastBenchmarkMs = +median.toFixed(1);
    return this.tier;
  }

  /**
   * The benchmark's second half, for a machine already on Performance: if even Performance misses
   * 30 fps, lower the internal render resolution now, behind the loading cover, through the same
   * steps as the runtime governor's relief valve (RENDER_SCALE_STEPS). Otherwise the player sat
   * through the governor's evidence window, seconds of stutter at the start of play, before it
   * stepped down; this way the first frame they see is already one the machine can keep up.
   * Call after the scene has adapted to the tier (ShipInteriorScene.adaptToTier), so the room being
   * measured is the room that will be drawn.
   */
  async fitRenderScale(scene: GameScene): Promise<void> {
    if (this.manualOverride || this.tier !== 'low') return;
    const steps = Engine.RENDER_SCALE_STEPS;
    let median = await this.medianFrameMs(scene);
    while (median > 33 && this.renderScale > steps[steps.length - 1]) {
      this.renderScale = steps[steps.indexOf(this.renderScale) + 1];
      this.applyTier(this.tier, true);
      median = await this.medianFrameMs(scene);
    }
    this.lastBenchmarkMs = +median.toFixed(1);
  }

  /**
   * Twelve hidden frames of `scene`, each waited out on the GPU (gl.finish), median of the last eight.
   * The page gets a frame every ~40 ms of them (the engine's own loop held meanwhile, so nothing else
   * draws in between): run back to back they froze the loading bar for up to half a second.
   */
  private async medianFrameMs(scene: GameScene): Promise<number> {
    const gl = this.renderer.getContext();
    const times: number[] = [];
    const wasPaused = this.paused;
    this.paused = true;
    let lastYield = performance.now();
    try {
      for (let i = 0; i < 12; i++) {
        this.postFx.setActive(scene.scene, scene.camera);
        this.postFx.setAOSupported(scene.usesAO !== false);
        this.postFx.setGrade(scene.grade);
        const t = performance.now();
        this.postFx.render();
        gl.finish();
        // The first frames still carry first-use driver work (measured: enough to push a desktop RTX
        // 4060 over the line); judge only the last eight.
        if (i >= 4) times.push(performance.now() - t);
        if (this.current) {
          this.postFx.setActive(this.current.scene, this.current.camera);
          this.postFx.setAOSupported(this.current.usesAO !== false);
          this.postFx.setGrade(this.current.grade);
        }
        if (performance.now() - lastYield > 40) {
          await yieldToBrowser();
          lastYield = performance.now();
        }
      }
    } finally {
      this.paused = wasPaused;
    }
    times.sort((a, b) => a - b);
    return times[Math.floor(times.length / 2)];
  }

  /** Median frame time from the last start-up benchmark, for the settings panel and the tools. */
  lastBenchmarkMs: number | null = null;

  /** Told once per session, in the plainest words: what changed and where to change it back. */
  private noteDowngrade(): void {
    if (this.toldAboutDowngrade) return;
    this.toldAboutDowngrade = true;
    window.setTimeout(() => UIManager.toast('Graphics set to Performance to keep this computer smooth. Change it in Settings (O).'), 4000);
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
    // Idempotent: the flow calls this from whichever boot path runs first, and the intro handover
    // calls it again after the interior is built — a second live loop would double every update.
    if (this.running) return;
    this.running = true;
    const loop = (now: number) => {
      this.rafId = requestAnimationFrame(loop);
      // Low-battery or steady-30 cap: skip this display frame if the last drawn one was under ~30 fps ago.
      if ((this.capTo30 || this.steadyCap) && now - this.lastDrawAt < 31) return;
      this.lastDrawAt = now;
      this.timer.update(now);
      const realDt = Math.min(this.timer.getDelta(), 0.1);
      // One clock for everything that moves (src/motion). The game clock stops while paused so
      // sine-driven idles don't jump on resume.
      const dt = motion.tick(realDt, this.paused || this.contextLost);
      if (!this.paused && this.current && !this.contextLost) {
        this.current.update(dt, motion.gameTime);
        this.postFx.render();
        this.recordFrameForQuality(realDt * 1000);
      }
      InputManager.endFrame();
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }
}
