import * as THREE from 'three';
import type { GameScene } from '../../core/Engine';
import { getActiveEngine } from '../../core/EngineRegistry';
import { GRADES } from '../../core/GradeGlowPass';
import type { Pacer } from '../../core/prepare';
import { mark, span } from '../../core/perfMarks';
import { motion } from '../../motion';
import { buildPlanetInstance, planetTexture, planetTexturesReady } from '../planetShader';
import type { PlanetInstance } from '../planetShader';
import { PLANETS } from '../planetData';
import { bakeDetailNoise } from './bake';
import { buildTitleSky } from './titleSky';
import type { TitleSky } from './titleSky';
import { buildHeroPlanet } from './heroPlanet';
import type { HeroPlanet } from './heroPlanet';
import { buildAsteroids, rockTextures } from './asteroids';
import type { AsteroidField, RockSpec } from './asteroids';
import { buildSkyFx } from './skyFx';
import type { SkyFx } from './skyFx';

/**
 * The title screen's backdrop: sunrise over Kethra's limb, seen from inside the belt the planet orbits,
 * with Isilthe's rings over the horizon. It sits behind the DOM menu (TitleScreen.ts), drawn by the
 * engine like any scene, and is gone (disposed by Engine.setScene) once the player picks.
 *
 * Composition is authored on a 16:9 frame (COMPOSITION, screen fractions from the top left) and solved
 * into world space at build, so the numbers below read like the layout they produce: Kethra's limb is
 * the circle through three screen points, the sun sits just over it, each rock at a screen point and a
 * distance. Narrower windows turn the camera so the right of the picture stays (frame()).
 *
 * Everything here draws with its own shaders: no scene lights and no environment map, so nothing
 * waits for either, and the whole scene is about a dozen small programs prepared in the background
 * while the menu is already up.
 *
 * Motion is all transforms and uniforms, deterministic sums of slow sines; the update path allocates
 * nothing. Under reduced motion the camera holds still, there are no meteors, and the reveal is short.
 */

const FOV = 40;
const TAN_V = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
const TAN_H = TAN_V * (16 / 9);
const DEG = Math.PI / 180;

/** World direction through a point of the 16:9 frame (0..1 from the top left) for the camera at rest. */
function dirAt(sx: number, sy: number, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set((2 * sx - 1) * TAN_H, (1 - 2 * sy) * TAN_V, -1).normalize();
}

/** The same point on the sky card's tangent plane (titleSky.ts). */
function tangentAt(sx: number, sy: number): THREE.Vector2 {
  return new THREE.Vector2((2 * sx - 1) * TAN_H, (1 - 2 * sy) * TAN_V);
}

const COMPOSITION = {
  planetRadius: 6000,
  /** Three points of the 16:9 frame Kethra's limb passes through. */
  limb: [[0.3, 1.0], [0.6, 0.385], [1.0, 0.17]] as [number, number][],
  /** Where the sun is seen (the glare), and how far outside the limb, in degrees. */
  sunAt: [0.64, 0.36] as [number, number],
  sunLift: 0.9,
  /**
   * How far the light that shades the planet and the rocks is turned from the seen sun toward the
   * camera (0..1). With the sun exactly behind the limb the whole visible disc would be night, which is
   * physically right and a black picture; turned, the terminator crosses the disc on a diagonal, day
   * toward the upper right and the canopy's night glow toward the menu.
   */
  lightTowardCamera: 0.42,
  isilthe: { at: [0.905, 0.215] as [number, number], distance: 17000, angularRadius: 4.1 },
  /** The galactic band, from where it enters the frame to where it sinks behind the limb, and its brightest knot. */
  band: { from: [0.42, -0.08] as [number, number], to: [1.02, 0.6] as [number, number], knot: [0.7, 0.2] as [number, number] },
  /** The direction the near-field dust drifts (we are coasting forward through it). */
  dustDrift: [0.25, -0.12, 1] as [number, number, number],
};

/**
 * Rocks: screen point, distance, radius, subdivision. Dark ones close in the lower left, one lit low on
 * the right framing the planet, and debris out toward the limb.
 */
const ROCKS: [number, number, number, number, number][] = [
  [0.03, 1.04, 9, 2.3, 5],
  [0.17, 1.09, 8, 1.6, 4],
  [-0.07, 0.8, 12, 2.1, 4],
  [0.3, 1.0, 16, 0.7, 3],
  [0.95, 1.02, 11, 1.25, 5],
  [0.72, 0.66, 22, 0.85, 4],
  [0.8, 0.52, 34, 0.55, 3],
  [0.62, 0.76, 28, 0.5, 3],
  [0.47, 0.86, 26, 0.6, 3],
  [0.53, 0.8, 34, 0.38, 2],
  [0.41, 0.72, 44, 0.36, 2],
  [0.66, 0.58, 50, 0.28, 2],
  [0.95, 0.66, 26, 0.4, 3],
  [0.56, 0.62, 60, 0.22, 2],
  [0.86, 0.38, 64, 0.3, 2],
  [0.12, 0.84, 30, 0.35, 2],
];

/** The opening, in seconds from the first frame: [start, end] of each element's fade. */
const REVEAL = {
  stars: [0, 1.0],
  nebula: [0.15, 1.5],
  planet: [0.45, 2.0],
  atmosphere: [0.8, 2.3],
  worlds: [0.7, 2.0],
  rocks: [0.5, 1.9],
  glare: [1.3, 2.5],
  dust: [1.1, 2.4],
  end: 2.5,
} as const;

/** The maps the backdrop draws with, fetched as soon as the menu is up (TitleScreen.show). */
const MAPS: [string, boolean][] = [
  ['kethra_day.jpg', true],
  ['kethra_night.jpg', true],
  ['clouds.jpg', false],
  ['isilthe_day.jpg', true],
  ['isilthe_night.jpg', true],
  ['isilthe_ring.png', true],
];

/** Starts the downloads the backdrop needs, so its build doesn't wait on the network. */
export function preloadTitle(): void {
  for (const [file, srgb] of MAPS) planetTexture(file, srgb);
  rockTextures();
}

const LEAVE_SECONDS = 0.6;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x: number) => x * x * (3 - 2 * x);

export class TitleScene implements GameScene {
  readonly kind = 'TitleScene';
  readonly usesAO = false;
  readonly grade = GRADES.title;
  readonly needsEnvironment = false;
  readonly governed = false;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.5, 40000);

  /** Called on the first frame actually drawn, so the menu can drop its stand-in background. */
  onFirstFrame: (() => void) | null = null;

  private detail: THREE.WebGLRenderTarget | null = null;
  private sky!: TitleSky;
  private hero!: HeroPlanet;
  private worlds: PlanetInstance[] = [];
  private rocks!: AsteroidField;
  private fx!: SkyFx;

  private sunSeen = new THREE.Vector3();
  private light = new THREE.Vector3();

  private t = 0;
  private elapsed = 0;
  private firstFrame = true;
  private disposed = false;
  private yaw = 0;
  private pointer = new THREE.Vector2();
  private pointerSmooth = new THREE.Vector2();
  private energy = 0;
  private energyTarget = 0;
  private energyHold = 0;
  private leaveT = -1;
  private onLeft: (() => void) | null = null;
  private lowTier = false;

  private scratchW = new THREE.Vector3();
  private lookTarget = new THREE.Vector3();

  async init(pacer?: Pacer): Promise<void> {
    const engine = getActiveEngine();
    if (!engine) throw new Error('TitleScene needs the engine');
    const renderer = engine.renderer;
    this.lowTier = engine.getQualityTier() === 'low';
    this.scene.background = new THREE.Color(0x050912);

    // Solve the composition: Kethra's centre and size from the three limb points.
    const [v1, v2, v3] = COMPOSITION.limb.map(([x, y]) => dirAt(x, y));
    const axis = new THREE.Vector3().crossVectors(v2.clone().sub(v1), v3.clone().sub(v1)).normalize();
    if (axis.dot(dirAt(1, 1)) < 0) axis.negate();
    const limbAngle = Math.acos(THREE.MathUtils.clamp(v1.dot(axis), -1, 1));
    const R = COMPOSITION.planetRadius;
    const centre = axis.clone().multiplyScalar(R / Math.sin(limbAngle));

    // The seen sun: on the limb's cone, nearest the authored point, lifted just clear of it.
    const s0 = dirAt(...COMPOSITION.sunAt);
    const perp = s0.clone().sub(axis.clone().multiplyScalar(s0.dot(axis))).normalize();
    const sunAngle = limbAngle + COMPOSITION.sunLift * DEG;
    this.sunSeen.copy(axis).multiplyScalar(Math.cos(sunAngle)).addScaledVector(perp, Math.sin(sunAngle)).normalize();
    // The shading light: turned from the seen sun toward the camera (see COMPOSITION).
    this.light.copy(this.sunSeen).lerp(axis.clone().negate(), COMPOSITION.lightTowardCamera).normalize();

    // GPU bakes, each a strip a frame, fenced so the GPU has finished one before the next is queued.
    const pace = () => pacer?.breathe() ?? Promise.resolve();
    // Each step on the performance timeline (title:bakes, title:planets, ...).
    let at = performance.now();
    const step = (name: string) => {
      span(`title:${name}`, at);
      at = performance.now();
    };
    // The two bakes compile and draw side by side; neither needs the other.
    const band = COMPOSITION.band;
    const baking = bakeDetailNoise(renderer, pace);
    const skying = buildTitleSky(renderer, baking.then((rt) => rt.texture), { from: tangentAt(...band.from), to: tangentAt(...band.to), core: tangentAt(...band.knot) }, { stars: this.lowTier ? 4200 : 8000, pace });
    const [detail, sky] = await Promise.all([baking, skying]);
    this.detail = detail;
    this.sky = sky;
    this.scene.add(this.sky.group);
    step('bakes');
    await pacer?.tick();

    this.hero = buildHeroPlanet({
      radius: R,
      center: centre,
      sunDir: this.light,
      glareDir: this.sunSeen,
      day: planetTexture('kethra_day.jpg', true),
      night: planetTexture('kethra_night.jpg', true),
      clouds: planetTexture('clouds.jpg', false),
      detail: detail.texture,
      segments: this.lowTier ? 160 : 224,
    });
    // Turned so the bright terraces are in view, and they drift across as it spins.
    this.hero.surface.rotation.y = 2.25;
    this.scene.add(this.hero.group);

    const sunFar = this.light.clone().multiplyScalar(1e7);
    const world = (id: string, at: [number, number], distance: number, angularRadius: number, spin: number) => {
      const def = PLANETS.find((p) => p.id === id)!;
      const position = dirAt(...at).multiplyScalar(distance);
      const planet = buildPlanetInstance({ ...def, radius: distance * Math.sin(angularRadius * DEG) }, position, sunFar, this.camera);
      planet.group.rotation.y = spin;
      planet.setFade(0);
      this.scene.add(planet.group);
      this.worlds.push(planet);
    };
    world('isilthe', COMPOSITION.isilthe.at, COMPOSITION.isilthe.distance, COMPOSITION.isilthe.angularRadius, 0.6);
    step('planets');
    await pacer?.tick();

    // Kethra's lit face lies down and to the right: that is where its green bounce comes from.
    const rocks: RockSpec[] = ROCKS.map(([x, y, d, r, sub]) => ({ at: dirAt(x, y).multiplyScalar(d), radius: r, detail: this.lowTier ? Math.min(sub, 4) : sub }));
    this.rocks = await buildAsteroids(rocks, { sunDir: this.light, rimDir: this.sunSeen, bounceDir: dirAt(0.85, 0.95), pace: () => pacer?.tick() ?? Promise.resolve() });
    this.scene.add(this.rocks.mesh);
    step('rocks');
    await pacer?.tick();

    const drift = new THREE.Vector3(...COMPOSITION.dustDrift).normalize().multiplyScalar(1.1);
    this.fx = buildSkyFx({
      sunDir: this.sunSeen,
      coreDistance: 30000,
      dust: {
        count: this.lowTier ? 110 : 240,
        boxMin: new THREE.Vector3(-16, -11, -42),
        boxSize: new THREE.Vector3(40, 22, 38),
        stream: drift,
      },
      meteorArea: [0.05, 0.45, 0.85, 0.92],
    });
    this.fx.setMeteors(!motion.reduced);
    this.scene.add(this.fx.group);

    this.frame(window.innerWidth / window.innerHeight);
    this.placeCamera(0, 0);
    step('fx');
    await planetTexturesReady();
    step('maps');
  }

  onEnter(): void {
    mark('title:backdrop');
  }

  // ------------------------------------------------------------------ the player's hand on it

  /** Pointer position over the window, -1..1 each way; the camera leans with it a little. */
  setPointer(x: number, y: number): void {
    this.pointer.set(x, y);
  }

  /** The player moved through the menu: the sunrise answers with a brief swell. */
  nudge(): void {
    this.energyTarget = 1;
    this.energyHold = 0.45;
  }

  /** Jumps the opening to its end (a key or click during it). */
  skipReveal(): void {
    this.t = Math.max(this.t, REVEAL.end);
  }

  /** The way out: the camera eases forward toward the limb and the picture goes to black. */
  leave(): Promise<void> {
    return new Promise((resolve) => {
      if (this.disposed) {
        resolve();
        return;
      }
      const previous = this.onLeft;
      this.onLeft = () => {
        previous?.();
        resolve();
      };
      if (this.leaveT < 0) this.leaveT = 0;
    });
  }

  // ------------------------------------------------------------------ per frame

  update(dt: number): void {
    this.elapsed += dt;
    this.t += motion.reduced ? dt * 2.2 : dt;
    const t = this.t;
    const ramp = (r: readonly [number, number]) => smooth(clamp01((t - r[0]) / (r[1] - r[0])));

    this.sky.setReveal(ramp(REVEAL.stars), ramp(REVEAL.nebula));
    this.hero.setReveal(ramp(REVEAL.planet), ramp(REVEAL.atmosphere));
    const worlds = ramp(REVEAL.worlds);
    for (const w of this.worlds) {
      w.setFade(worlds);
      w.update(this.elapsed, dt);
    }
    this.hero.update(dt, this.elapsed);
    this.rocks.setFade(ramp(REVEAL.rocks));
    this.rocks.update(this.elapsed);

    if ((this.energyHold -= dt) <= 0) this.energyTarget = 0;
    this.energy += (this.energyTarget - this.energy) * (1 - Math.exp(-dt / (this.energyTarget > this.energy ? 0.12 : 0.6)));
    // The sunrise: a slight swell past full as it clears, then it settles; the menu nudges it.
    const glare = ramp(REVEAL.glare);
    const swell = 1 + 0.35 * Math.sin(Math.PI * clamp01((t - REVEAL.glare[0]) / 1.6));
    this.fx.setGlare(glare * (t < REVEAL.glare[0] + 1.6 ? swell : 1) * (1 + this.energy * 0.12));
    this.fx.setDust(ramp(REVEAL.dust) * 0.9);

    // Leaving: push in, black.
    let push = 0;
    if (this.leaveT >= 0) {
      this.leaveT += dt;
      const k = clamp01(this.leaveT / (motion.reduced ? 0.35 : LEAVE_SECONDS));
      this.fx.setVeil(smooth(k));
      push = motion.reduced ? 0 : k * k * 2.4;
      if (k >= 1 && this.onLeft) {
        const done = this.onLeft;
        this.onLeft = null;
        done();
      }
    }

    this.placeCamera(push, dt);
    this.fx.update(this.camera, dt, this.elapsed);
    this.sky.update(this.camera);

    if (this.firstFrame) {
      this.firstFrame = false;
      this.onFirstFrame?.();
    }
  }

  /** Rest position, slow drift, pointer lean, and the push-in when leaving. Looks at a fixed point far off. */
  private placeCamera(push: number, dt: number): void {
    const still = motion.reduced ? 0 : 1;
    const e = this.elapsed;
    this.pointerSmooth.lerp(this.pointer, 1 - Math.exp(-dt / 0.9));
    const px = this.pointerSmooth.x * 0.55 * still;
    const py = this.pointerSmooth.y * 0.3 * still;
    this.camera.position.set(Math.sin(e * 0.11) * 0.2 * still + px, Math.sin(e * 0.083 + 1.3) * 0.12 * still - py, 0);
    this.lookTarget.set(Math.sin(this.yaw) * 120, 0, -Math.cos(this.yaw) * 120);
    if (push > 0) {
      this.scratchW.copy(this.lookTarget).sub(this.camera.position).normalize();
      this.camera.position.addScaledVector(this.scratchW, push);
    }
    this.camera.lookAt(this.lookTarget);
  }

  /**
   * Fits the picture to the window: a narrower window keeps the right of the 16:9 composition (the
   * planet) by turning the camera, and a very narrow one opens the field of view too.
   */
  private frame(aspect: number): void {
    const tanV = Math.max(TAN_V, 0.36 / aspect);
    this.camera.fov = (2 * Math.atan(tanV)) / DEG;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.yaw = Math.max(0, Math.atan(TAN_H) - Math.atan(tanV * aspect));
  }

  onResize(width: number, height: number): void {
    this.frame(width / height);
  }

  dispose(): void {
    this.disposed = true;
    // A leave() still waiting resolves, so nothing waits on a scene that is gone.
    const left = this.onLeft;
    this.onLeft = null;
    left?.();
    this.detail?.dispose();
    this.sky?.dispose();
    this.hero?.dispose();
    this.rocks?.dispose();
    this.fx?.dispose();
    for (const w of this.worlds) disposeObject(w.group);
  }
}

/**
 * Frees an object's geometries and materials. Textures are left alone: the planet maps are shared,
 * cached across scenes, and released by the engine (Engine.releaseTextures).
 */
function disposeObject(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of mats) mat.dispose();
  });
}
