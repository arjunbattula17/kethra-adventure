import * as THREE from 'three';
import type { GameScene } from '../core/Engine';
import { getActiveEngine } from '../core/EngineRegistry';
import { displayFontsReady } from '../core/loadFonts';
import { UIManager } from '../ui/UIManager';
import { AudioSystem } from '../audio/AudioSystem';
import { getSharedEnvironment } from '../core/Environment';
import { t, wordCount } from '../content/strings';
import type { StringKey } from '../content/strings';
import { buildShipHull } from './shipHull';
import { buildStarfield, getPointSprite } from './spaceDressing';

/**
 * The opening cinematic, "Cold Start": the moment the Wren died, and the moment it came back.
 *
 * The Wren crosses the dark with its lights on, engines warm. The sky goes white (light from
 * everywhere at once, as the final travel log describes) and every system on the hull dies. It
 * drifts, cold. Then the port beacon blinks, a wave of amber emergency light sweeps the viewports
 * bow to stern, the stern panels warm, a glow settles into the crew section, and the engines try
 * three times and die, which is what the rest of the game is about repairing.
 *
 * Four lines of exposition ride the beats, one at a time: where you are, what happened, what
 * works, what to do (see intro.line.* in the string table, and LORE.md for the source). The cut
 * to black hands over to waking up inside.
 *
 * Design brief, timeline rationale and the performance budget: INTRO_DESIGN.md next to this file.
 *
 * Budget, in short: 18 draw calls on the low tier, no shadows, no shader compiles after the
 * warm-up frame. Every light exists from frame 0 (adding one later would recompile every
 * material), all motion is uniforms/transforms, the update path allocates nothing, and the text
 * layer only toggles classes on elements built in init().
 *
 * Skippable by anyone at any time (Space/Enter/click); it carries mood, not instruction.
 */

/** Exposition lines in order: [string key, the beat each one starts on]. */
const LINES: ReadonlyArray<readonly [StringKey, number]> = [
  ['intro.line.background', 0.6],
  ['intro.line.event', 6.55],
  ['intro.line.status', 12.5],
  ['intro.line.goal', 18.8],
];

/** On-screen time for a line: 2.5 s plus 0.35 s per word (about three words a second, while the
 * eye is also following the picture). */
const readSeconds = (key: StringKey) => 2.5 + 0.35 * wordCount(t(key));

/** Every beat in one place, in seconds on the scene clock. Retune here, not in the logic. */
const TIMELINE = {
  /** Longest wall-clock wait for steady frames before the clock starts anyway (see update()). */
  settleCapMs: 3500,
  /** Rim and fill light find the running ship. */
  rim: { at: 0, dur: 1.6 },
  beaconPeriod: 2.4,
  /** The white sky: light from everywhere swells, and every system on the hull dies under it. */
  whiteSky: { at: 6.4, rise: 0.5, hold: 0.3, fall: 1.6 },
  firstBlink: 12.2,
  /** The emergency-light front sweeps the viewports bow to stern over `span`. */
  wave: { at: 13.0, span: 3.2 },
  sternPanels: { at: 15.4, dur: 1.8 },
  crewGlow: { at: 16.4, dur: 2.4 },
  engineAttempt: 17.6,
  done: LINES[LINES.length - 1][1] + readSeconds(LINES[LINES.length - 1][0]),
} as const;

/** Levels the timeline ramps toward. */
const LEVEL = {
  rim: 1.7,
  fill: 0.95,
  ambient: 0.22,
  envStart: 0.08,
  envEnd: 0.35,
  window: 0.9,
  // The four big aft hex panels (mat13) are large flat planes; above ~0.15 they outshine the
  // viewports and pull the eye to the stern instead of the crew section.
  sternPanels: 0.07,
  crewGlow: 12,
  /** Stern ignition light at a pulse peak of 1 (ENGINE_PULSES scales it). */
  engineLight: 32,
  /** Engines idling before the white sky, as a fraction of a cough's peak. */
  engineRunning: 0.55,
  beacon: 2.2,
  sky: 0.38,
  /** The white sky's peak: sky, and an ambient term for "light from everywhere at once". */
  whiteSkyBackground: 2.6,
  whiteSkyAmbient: 3.2,
  /** Opacity of the white shell at the white sky's peak. */
  whiteSkyShell: 0.9,
} as const;

/** Wave front travel along the hull's X axis, in ship units (viewports span about -4.0..2.3). */
const WAVE_FROM_X = 3.0;
const WAVE_TO_X = -4.8;
/** The engine-ring material also covers trim near the nose; only the bells aft of this X glow. */
const ENGINE_BELLS_MAX_X = -3.0;

/** Engine-ring sputter: [offset from engineAttempt (s), peak]. Each pulse lasts ENGINE_PULSE s. */
const ENGINE_PULSES: ReadonlyArray<readonly [number, number]> = [
  [0, 0.9],
  [0.32, 0.6],
  [0.58, 0.28],
];
const ENGINE_PULSE = 0.16;

/** Camera path and look targets, ship-relative (+X nose, +Y up, +Z toward camera side). */
const CAMERA_PATH = [
  [-10.5, -1.3, 10.5],
  [-5.0, -0.4, 10.2],
  [0.8, 0.7, 10.0],
  [4.8, 1.3, 8.0],
  [3.6, 1.0, 5.2],
] as const;
const LOOK_PATH = [
  [-0.5, 0.0, 0.0],
  [0.0, 0.1, 0.0],
  [0.4, 0.15, 0.5],
  [0.9, 0.25, 1.0],
  [0.9, 0.25, 1.4],
] as const;

const CREW_GLOW_OFFSET = new THREE.Vector3(1.6, 1.2, 2.2);
// Just aft and to the camera side of the engine bells, so engine light reaches the stern
// structure the camera can actually see (the bells themselves face away from every shot).
const ENGINE_LIGHT_OFFSET = new THREE.Vector3(-4.4, 0.3, 1.8);
const DRIFT_PER_SECOND = 0.13;
// Normal running lights are the hull's own teal; after the white sky only emergency amber answers.
const WINDOW_RUNNING_COLOR = 0x8fd8ff;
const WINDOW_EMERGENCY_COLOR = 0xffb45a;
const NAV_LIGHT_SCALE = 0.6;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;
const ramp = (t: number, at: number, dur: number) => clamp01((t - at) / dur);

/** 1 or a deep dropout, with the stutter of a failing starter; used only on a ramp's edge. */
function stutter(t: number, seed: number): number {
  return Math.sin(t * 31 + seed) * Math.sin(t * 7.3 + seed * 2) > -0.15 ? 1 : 0.1;
}

/** 0..1 envelope of the white sky: rise, hold, long fall. */
function whiteSkyAmount(t: number): number {
  const w = TIMELINE.whiteSky;
  if (t < w.at) return 0;
  if (t < w.at + w.rise) return easeOutCubic((t - w.at) / w.rise);
  if (t < w.at + w.rise + w.hold) return 1;
  return 1 - easeOutCubic(clamp01((t - w.at - w.rise - w.hold) / w.fall));
}

/** 1 while the ship's own systems run, stuttering out as the white sky peaks, then 0. */
function runningAmount(t: number): number {
  const out = TIMELINE.whiteSky.at + 0.25;
  if (t < out) return 1;
  const r = ramp(t, out, 0.6);
  return r >= 1 ? 0 : (1 - r) * stutter(t, 3);
}

/**
 * Masks a hull material's emissive by position along the ship, on the GPU. The viewports and the
 * engine rings are each ONE mesh spanning the hull, so a bow-to-stern wave can't be done by
 * staggering materials; this does it per pixel instead. `uFront`: points aft of it stay dark, with
 * a brief surge just behind it; `uStutter` flickers only that leading band; `uMaxX` clips the lit
 * region's bow end. Both users share one program (same cache key), compiled in the warm-up frame.
 */
function addShipSpaceMask(mat: THREE.MeshStandardMaterial, worldToShip: THREE.IUniform<THREE.Matrix4>) {
  const uniforms = {
    uFront: { value: WAVE_FROM_X },
    uStutter: { value: 1 },
    uMaxX: { value: 100 },
  };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWorldToShip = worldToShip;
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 uWorldToShip;\nvarying float vShipX;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvShipX = (uWorldToShip * modelMatrix * vec4(transformed, 1.0)).x;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uFront;\nuniform float uStutter;\nuniform float uMaxX;\nvarying float vShipX;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float behind = vShipX - uFront;
        float lit = smoothstep(-0.25, 0.25, behind);
        float leading = 1.0 - smoothstep(0.0, 1.1, behind);
        float surge = 1.0 + 0.9 * exp(-behind * behind * 6.0);
        totalEmissiveRadiance *= lit * mix(1.0, uStutter, leading) * surge * step(vShipX, uMaxX);`,
      );
  };
  mat.customProgramCacheKey = () => 'intro-ship-space-mask';
  return uniforms;
}

function toCurve(points: ReadonlyArray<readonly [number, number, number]>): THREE.CatmullRomCurve3 {
  return new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'centripetal');
}

export class IntroScene implements GameScene {
  readonly kind = 'IntroScene';
  readonly usesAO = false;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 2000);
  onDone: (() => void) | null = null;

  private ship!: THREE.Group;
  private navPort: THREE.MeshStandardMaterial | null = null;
  private navStarboard: THREE.MeshStandardMaterial | null = null;
  private worldToShip: THREE.IUniform<THREE.Matrix4> = { value: new THREE.Matrix4() };
  private windowMats: THREE.MeshStandardMaterial[] = [];
  private windowMasks: ReturnType<typeof addShipSpaceMask>[] = [];
  private sternPanelMats: THREE.MeshStandardMaterial[] = [];
  private engineMats: THREE.MeshStandardMaterial[] = [];
  private rim!: THREE.DirectionalLight;
  private fill!: THREE.DirectionalLight;
  private ambient!: THREE.AmbientLight;
  private crewGlow!: THREE.PointLight;
  private engineLight!: THREE.PointLight;
  private whiteShell!: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private cameraCurve = toCurve(CAMERA_PATH);
  private lookCurve = toCurve(LOOK_PATH);
  private scratchPos = new THREE.Vector3();
  private scratchLook = new THREE.Vector3();
  private emergencyLit = false;

  private textLayer!: HTMLDivElement;
  private lineEls: HTMLDivElement[] = [];
  private skipEl!: HTMLDivElement;
  /** One-shot beats, fired in order by an index pointer so the per-frame check allocates nothing. */
  private cues: { at: number; run: () => void }[] = [];
  private nextCue = 0;

  /** Scene clock; only advances once frames are steady (see update()). */
  private elapsed = 0;
  private started = false;
  private steadyFrames = 0;
  private settleStartedAt = 0;
  private finished = false;
  private stopAmbient: (() => void) | null = null;

  // Skip counts from the moment the clock starts; before that the scene is still behind the
  // loading overlay while GameFlow prepares the interior, and a skip there would start a second
  // interior build.
  private keyHandler = (e: KeyboardEvent) => {
    if (this.started && (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter')) this.finish();
  };
  private clickHandler = () => {
    if (this.started) this.finish();
  };

  async init(): Promise<void> {
    UIManager.setLookPromptEnabled(false);
    UIManager.showLetterbox(true);
    const lowTier = getActiveEngine()?.getQualityTier() === 'low';

    this.scene.background = new THREE.Color(0x010208);
    // The hull's plating is 0.85-metalness: without an environment to reflect, metal renders as a
    // hole in the starfield. The IBL ramps up with the rim light so the hull wakes edge-first.
    this.scene.environment = getSharedEnvironment();
    this.scene.environmentIntensity = LEVEL.envStart;
    // Creating the AudioContext costs ~50ms on the main thread; lazily, that landed on the first
    // beacon blink as a visible hitch. Here it lands behind the loading overlay instead.
    AudioSystem.prepare();

    // Everything the first frame shows is awaited here, so the sky's decode, equirect-to-cube
    // conversion and upload land in Engine.setScene's warm-up frame behind the loading overlay
    // rather than mid-sequence (the old async load hitched the intro at 5.4s).
    const [hull, sky] = await Promise.all([buildShipHull(), this.loadSky(lowTier), displayFontsReady()]);
    if (sky) {
      this.scene.background = sky;
      // Dim enough that the sky's milky band stops reading as grey haze, bright enough that the
      // dead hull still separates from it as a silhouette.
      this.scene.backgroundIntensity = LEVEL.sky;
    }
    this.scene.add(buildStarfield(1400, 600, 0.7));
    this.scene.add(this.buildDust(lowTier ? 90 : 220));

    this.ship = hull.group;
    this.ship.position.set(-3.5, 0, 0);
    this.ship.rotation.set(0.1, 0, 0.06);
    this.scene.add(this.ship);
    this.ship.updateMatrixWorld(true);
    this.collectHullMaterials();

    this.rim = new THREE.DirectionalLight(0x8fb4ff, 0);
    this.rim.position.set(-6, 3, -10);
    this.scene.add(this.rim);
    this.fill = new THREE.DirectionalLight(0x5a70a0, 0);
    this.fill.position.set(4, 2, 10);
    this.scene.add(this.fill);
    // Also the white sky's "light from everywhere": an ambient swell is exactly that.
    this.ambient = new THREE.AmbientLight(0xdfe6ff, LEVEL.ambient);
    this.scene.add(this.ambient);
    this.crewGlow = new THREE.PointLight(0xffc27a, 0, 14);
    this.scene.add(this.crewGlow);
    this.engineLight = new THREE.PointLight(0xff8c3a, 0, 8);
    this.scene.add(this.engineLight);
    // The white sky itself: an inward-facing shell behind everything, so the dead hull reads as a
    // silhouette against it. Raising the sky texture's intensity only brightened the stars.
    // Visible for the warm-up frame (so its program compiles behind the loading overlay), then
    // only while the beat runs: one full-screen blended draw for ~2.4 s, none otherwise.
    this.whiteShell = new THREE.Mesh(
      new THREE.SphereGeometry(900, 24, 12),
      new THREE.MeshBasicMaterial({ color: 0xeef3ff, side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false, fog: false }),
    );
    this.whiteShell.renderOrder = -1;
    this.scene.add(this.whiteShell);

    this.buildTextLayer();
    this.buildCues();
    this.placeCamera(0);

    window.addEventListener('keydown', this.keyHandler);
    window.addEventListener('click', this.clickHandler);
  }

  private async loadSky(lowTier: boolean): Promise<THREE.Texture | null> {
    let texture: THREE.Texture;
    try {
      texture = await new THREE.TextureLoader().loadAsync(`${import.meta.env.BASE_URL}textures/space/starfield.jpg`);
    } catch {
      return null; // the flat void colour set above still frames the ship
    }
    if (lowTier) {
      // Low tier: a 2048x1024 copy. Once converted to a cubemap the 4096 source costs ~4x the
      // VRAM for detail a shared-memory integrated GPU spends on nothing else in this shot.
      const image = texture.image as HTMLImageElement;
      const canvas = document.createElement('canvas');
      canvas.width = 2048;
      canvas.height = 1024;
      canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
      texture.dispose();
      texture = new THREE.CanvasTexture(canvas);
    }
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  /** Sparse near dust the camera trucks through: the parallax layer between it and the hull. Same
   * material configuration as buildStarfield's, so it shares that shader program. */
  private buildDust(count: number): THREE.Points {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = -13 + Math.random() * 22;
      positions[i * 3 + 1] = -3.5 + Math.random() * 7;
      positions[i * 3 + 2] = 1.5 + Math.random() * 11;
      const b = 0.12 + Math.random() * 0.22;
      colors[i * 3] = b * 0.8;
      colors[i * 3 + 1] = b * 0.9;
      colors[i * 3 + 2] = b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      vertexColors: true,
      size: 0.04,
      map: getPointSprite(),
      sizeAttenuation: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return new THREE.Points(geo, mat);
  }

  /** Index what the timeline drives. The ship starts running: lights on, engines idling. */
  private collectHullMaterials(): void {
    this.ship.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (obj.name === 'nav-light-port' || obj.name === 'nav-light-starboard') {
        // At this scene's closing distance the full-size beacons read as coloured balls.
        obj.scale.setScalar(NAV_LIGHT_SCALE);
        if (obj.name === 'nav-light-port') this.navPort = mat;
        else this.navStarboard = mat;
        mat.emissiveIntensity = 0;
      } else if (mat.name === 'mat4') {
        mat.emissive.setHex(WINDOW_RUNNING_COLOR);
        mat.emissiveIntensity = LEVEL.window;
        const mask = addShipSpaceMask(mat, this.worldToShip);
        mask.uFront.value = WAVE_TO_X; // fully lit
        this.windowMats.push(mat);
        this.windowMasks.push(mask);
      } else if (mat.name === 'mat1') {
        mat.emissiveIntensity = 0;
        const mask = addShipSpaceMask(mat, this.worldToShip);
        mask.uFront.value = -100;
        mask.uMaxX.value = ENGINE_BELLS_MAX_X;
        this.engineMats.push(mat);
      } else {
        if (mat.name === 'mat13') this.sternPanelMats.push(mat);
        mat.emissiveIntensity = 0;
      }
    });
  }

  /** The exposition lines, pre-built so the update path only toggles classes. Each word is its
   * own span for the staggered rise. */
  private buildTextLayer(): void {
    const layer = document.createElement('div');
    layer.className = 'intro-text';
    const scrim = document.createElement('div');
    scrim.className = 'intro-scrim';
    layer.appendChild(scrim);
    for (let i = 0; i < LINES.length; i++) {
      const line = document.createElement('div');
      line.className = i === LINES.length - 1 ? 'intro-line goal' : 'intro-line';
      const words = t(LINES[i][0]).split(' ');
      words.forEach((word, w) => {
        const span = document.createElement('span');
        span.textContent = word;
        span.style.setProperty('--w', String(w));
        line.appendChild(span);
        if (w < words.length - 1) line.appendChild(document.createTextNode(' '));
      });
      layer.appendChild(line);
      this.lineEls.push(line);
    }
    const skip = document.createElement('div');
    // Shown once the clock starts (see update): before that, skip is deliberately ignored.
    skip.className = 'tut-skip';
    const kbd = document.createElement('kbd');
    kbd.textContent = t('intro.skip.key');
    skip.append(kbd, document.createTextNode(t('intro.skip')));
    this.skipEl = skip;

    const root = document.getElementById('ui-root')!;
    root.append(layer, skip);
    this.textLayer = layer;
  }

  private buildCues(): void {
    const cues: { at: number; run: () => void }[] = [];
    LINES.forEach(([key, at], i) => {
      const el = this.lineEls[i];
      cues.push({ at, run: () => { el.classList.remove('out'); el.classList.add('on'); this.textLayer.classList.add('active'); } });
      cues.push({ at: at + readSeconds(key), run: () => { el.classList.remove('on'); el.classList.add('out'); } });
    });
    cues.push(
      { at: TIMELINE.whiteSky.at, run: () => AudioSystem.playTone(62, 1.6, 'sine', 0.06) },
      { at: TIMELINE.firstBlink, run: () => AudioSystem.playTone(88, 0.5, 'sine', 0.05) },
      { at: TIMELINE.sternPanels.at, run: () => { this.stopAmbient = AudioSystem.startAmbient(48, 0.02); } },
      { at: TIMELINE.engineAttempt, run: () => AudioSystem.playTone(46, 0.9, 'triangle', 0.07) },
      { at: TIMELINE.done, run: () => this.finish() },
    );
    this.cues = cues.sort((a, b) => a.at - b.at);
  }

  update(dt: number): void {
    // Settle gate: the interior builds behind this scene, and its synchronous kit parsing blocks
    // the main thread for ~2-2.5s right as the intro starts. The clock waits on the opening shot
    // (a quiet wide frame, where a stalled frame is invisible) until 20 steady frames in a row
    // arrive or the wall-clock cap passes, so the choreography starts on smooth frames.
    if (!this.started) {
      const now = performance.now();
      if (this.settleStartedAt === 0) this.settleStartedAt = now;
      this.steadyFrames = dt < 0.025 ? this.steadyFrames + 1 : 0;
      if (this.steadyFrames < 20 && now - this.settleStartedAt < TIMELINE.settleCapMs) return;
      this.started = true;
      this.skipEl.classList.add('visible');
    }

    this.elapsed += dt;
    const t = this.elapsed;

    this.ship.position.x += DRIFT_PER_SECOND * dt;
    this.ship.rotation.z += dt * 0.0015;
    this.ship.updateMatrixWorld();
    this.worldToShip.value.copy(this.ship.matrixWorld).invert();

    // The distant star lights the hull throughout; the white sky briefly drowns everything.
    const wake = easeOutCubic(ramp(t, TIMELINE.rim.at, TIMELINE.rim.dur));
    const white = whiteSkyAmount(t);
    this.rim.intensity = LEVEL.rim * wake;
    this.fill.intensity = LEVEL.fill * wake;
    this.scene.environmentIntensity = LEVEL.envStart + (LEVEL.envEnd - LEVEL.envStart) * wake;
    this.ambient.intensity = LEVEL.ambient + (LEVEL.whiteSkyAmbient - LEVEL.ambient) * white;
    this.scene.backgroundIntensity = LEVEL.sky + (LEVEL.whiteSkyBackground - LEVEL.sky) * white;
    this.whiteShell.material.opacity = LEVEL.whiteSkyShell * white;
    this.whiteShell.visible = white > 0;
    this.whiteShell.position.copy(this.camera.position);

    // The ship's own systems: running, then dead, then back one at a time.
    const running = runningAmount(t);
    const blinkOn = (from: number, offset: number) => t >= from && (t - from + offset) % TIMELINE.beaconPeriod < 0.16;
    if (this.navPort) {
      const on = running > 0 ? blinkOn(0, 0) : blinkOn(TIMELINE.firstBlink, 0);
      this.navPort.emissiveIntensity = on ? LEVEL.beacon * (running > 0 ? running : 1) : 0;
    }
    if (this.navStarboard) {
      const half = TIMELINE.beaconPeriod / 2;
      const on = running > 0 ? blinkOn(0, half) : blinkOn(TIMELINE.sternPanels.at, half);
      this.navStarboard.emissiveIntensity = on ? LEVEL.beacon * (running > 0 ? running : 1) : 0;
    }

    // Viewports: running teal until the white sky, then the amber emergency front sweeps bow to
    // stern (see addShipSpaceMask). The colour swap happens while every window is dark.
    if (t < TIMELINE.wave.at) {
      for (const mat of this.windowMats) mat.emissiveIntensity = LEVEL.window * running;
    } else {
      if (!this.emergencyLit) {
        this.emergencyLit = true;
        for (const mat of this.windowMats) {
          mat.emissive.setHex(WINDOW_EMERGENCY_COLOR);
          mat.emissiveIntensity = LEVEL.window;
        }
      }
      const wave = easeInOutSine(ramp(t, TIMELINE.wave.at, TIMELINE.wave.span));
      const front = WAVE_FROM_X + (WAVE_TO_X - WAVE_FROM_X) * wave;
      const flicker = stutter(t, 1);
      for (const mask of this.windowMasks) {
        mask.uFront.value = front;
        mask.uStutter.value = flicker;
      }
    }
    const panels = ramp(t, TIMELINE.sternPanels.at, TIMELINE.sternPanels.dur);
    const panelLevel = panels === 0 ? 0 : LEVEL.sternPanels * easeOutCubic(panels) * (panels < 0.4 ? stutter(t, 7) : 1);
    for (const mat of this.sternPanelMats) mat.emissiveIntensity = panelLevel + LEVEL.sternPanels * running;

    // Settle: somebody's home.
    this.crewGlow.intensity = LEVEL.crewGlow * easeInOutSine(ramp(t, TIMELINE.crewGlow.at, TIMELINE.crewGlow.dur));
    this.crewGlow.position.copy(this.ship.position).add(CREW_GLOW_OFFSET);

    // Engines: idling until the white sky; later three weakening coughs, and they stay dark.
    let engine = LEVEL.engineRunning * running;
    const since = t - TIMELINE.engineAttempt;
    for (const [offset, peak] of ENGINE_PULSES) {
      const p = since - offset;
      if (p >= 0 && p < ENGINE_PULSE) engine = peak * (1 - p / ENGINE_PULSE);
    }
    for (const mat of this.engineMats) mat.emissiveIntensity = engine;
    this.engineLight.intensity = LEVEL.engineLight * engine;
    this.engineLight.position.copy(this.ship.position).add(ENGINE_LIGHT_OFFSET);

    this.placeCamera(t);

    while (this.nextCue < this.cues.length && t >= this.cues[this.nextCue].at) this.cues[this.nextCue++].run();
  }

  /** One continuous move over the whole sequence, arc-length parameterised so speed follows the
   * ease alone rather than the spacing of the keys. */
  private placeCamera(t: number): void {
    const u = easeInOutSine(clamp01(t / TIMELINE.done));
    this.cameraCurve.getPointAt(u, this.scratchPos).add(this.ship.position);
    this.lookCurve.getPointAt(u, this.scratchLook).add(this.ship.position);
    this.camera.position.copy(this.scratchPos);
    this.camera.lookAt(this.scratchLook);
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.textLayer.classList.add('skipped');
    this.skipEl.classList.remove('visible');
    this.stopAmbient?.();
    // The letterbox deliberately stays up: the tutorial's cold open re-uses it immediately, and a
    // retract/re-extend across the handover would read as a glitch.
    this.onDone?.();
  }

  onResize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    window.removeEventListener('keydown', this.keyHandler);
    window.removeEventListener('click', this.clickHandler);
    this.stopAmbient?.();
    this.textLayer?.remove();
    this.skipEl?.remove();
    this.finished = true;
  }
}
