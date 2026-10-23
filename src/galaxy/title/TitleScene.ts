import * as THREE from 'three';
import type { GameScene } from '../../core/Engine';
import { getActiveEngine } from '../../core/EngineRegistry';
import { GRADES } from '../../core/GradeGlowPass';
import type { Pacer } from '../../core/prepare';
import { mark, span } from '../../core/perfMarks';
import { motion } from '../../motion';
import { mulberry32 } from '../../core/rng';
import { planetTexture, planetTexturesReady } from '../planetShader';
import { bakeDetailNoise } from './bake';
import { buildTitleSky } from './titleSky';
import type { TitleSky } from './titleSky';
import { buildRingworld } from './ringworld';
import type { Ringworld } from './ringworld';
import { buildAstronaut } from './astronaut';
import type { Astronaut } from './astronaut';
import { buildFormations } from './formations';
import type { Formation, Formations } from './formations';
import { buildAsteroids, buildDebris, rockTextures } from './asteroids';
import type { Debris, LargeRocks, RockLight, RockShape } from './asteroids';
import { buildEmbers } from './embers';
import type { Embers } from './embers';
import { buildSkyFx } from './skyFx';
import type { MeteorOptions, SkyFx } from './skyFx';

/**
 * The title screen's backdrop: an astronaut resting on a rock in the belt, looking out at Isilthe, the
 * ringed ocean moon at the edge of the system (LORE.md), backlit by its sun, its rings sweeping across
 * the sky. It sits behind the DOM menu (TitleScreen.ts), drawn by the engine like any scene, and is gone
 * (disposed by Engine.setScene) once the player picks.
 *
 * Composition is authored on a 16:9 frame (COMPOSITION, PERCH, FRAME_ROCKS: screen fractions from the
 * top left, and distances) and solved into world space at build, so the numbers read like the layout
 * they produce. The menu holds the left third; the astronaut sits just right of it, the planet and its
 * rings fill the centre and the right, rocks frame the edges. Narrower windows turn the camera so the
 * planet and the figure stay in frame (frame()).
 *
 * Everything draws with its own shaders: no scene lights and no environment map, so nothing waits for
 * either, and the scene is a dozen small programs prepared in the background while the menu is already
 * up. It is complete from its first frame; the menu dissolves its stand-in sky into it.
 *
 * Everything moves on elapsed time, so at the same speed at any frame rate: the planet turns and its
 * haze drifts, the rings shear at their Kepler rates, rubble orbits in the ring plane (behind the disc
 * and across it), rocks drift through the middle distance and are dealt new passes out of sight, pebbles
 * tumble, sparks drift and flare, shooting stars cross the sky now and then, the astronaut breathes and
 * looks about, and the camera drifts and leans a little toward the pointer. The update path allocates
 * nothing. Under reduced motion the camera holds still, the figure sits still and there are no meteors.
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
  /** Isilthe: where its centre is seen, how big (degrees), how far. */
  planet: { at: [0.69, 0.36] as [number, number], angularRadius: 10.5, distance: 6000 },
  /**
   * Its rings: opened toward us by `opening` degrees (seen from above: the near side crosses the lower
   * disc, the far side arches over the top), the long axis rising to the right by `tilt` degrees.
   */
  rings: { opening: 25, tilt: 17 },
  /** The sun, behind the planet, offset (screen right, up) from straight behind: the crescent is on the opposite side. */
  sunBehind: [-0.42, -0.4] as [number, number],
  /** Turn, haze drift and ring rate (see ringworld.ts). */
  spin: 0.015,
  hazeDrift: 0.0011,
  ringRate: 0.02,
  glow: 2.4,
  /** The galactic band, from where it enters the frame to where it leaves, and its brightest knot. */
  band: { from: [0.2, -0.08] as [number, number], to: [1.05, 0.78] as [number, number], knot: [0.86, 0.2] as [number, number] },
  /** The direction the near-field dust drifts. */
  dustDrift: [0.22, -0.1, 1] as [number, number, number],
};

/**
 * The astronaut's perch: where the seat (the figure's origin) is seen and how far, and which way the
 * figure faces, in degrees from facing the camera (positive turns it toward the right of the frame).
 */
const PERCH = {
  at: [0.445, 0.705] as [number, number],
  distance: 4.4,
  facing: 62,
};

/**
 * The rocks that frame the picture and the ledge under the figure (formations.ts). Perched ones are in
 * the figure's frame (metres; +Z the way it faces); the seat is cut flat at y = 0 and the step its
 * boots rest on slopes from y -0.125 under the left boot to -0.165 under the right.
 */
const FRAME_ROCKS: Formation[] = [
  // The seat, its front cut back under the knees, and the step in front for the boots.
  { at: { perch: [0.05, -0.7, -0.35] }, radius: 1, stretch: [1.5, 0.95, 1.1], shape: 'angular', detail: 6, seed: 311, planes: [{ n: [0, 1, 0], p: [0, 0, 0] }, { n: [0, -0.2, 1], p: [0, 0, 0.3] }] },
  { at: { perch: [0.02, -0.75, 0.75] }, radius: 0.9, stretch: [1.3, 0.85, 1.0], shape: 'chunky', detail: 5, seed: 523, planes: [{ n: [-0.11, 1, 0.04], p: [0, -0.145, 0] }] },
  // Behind the figure, and the ledge's mass running down and off the bottom of the frame.
  { at: { perch: [-0.85, -0.35, -0.75] }, radius: 0.6, stretch: [1.2, 1.3, 1], shape: 'angular', detail: 5, seed: 731 },
  { at: { perch: [-1.2, -1.35, 0.4] }, radius: 1.3, stretch: [1.4, 1, 1.2], shape: 'chunky', detail: 5, seed: 977 },
  { at: { perch: [1.0, -1.1, 1.1] }, radius: 0.9, stretch: [1.2, 1, 1.3], shape: 'angular', detail: 5, seed: 1181 },
  // The left wall behind the menu, an overhang at the top left, a corner rock at the top right.
  { at: { screen: [-0.07, 0.52], distance: 8 }, radius: 3.6, stretch: [0.75, 1.5, 0.9], turn: [0.3, 0.5, 0.1], shape: 'angular', detail: 5, seed: 1409 },
  { at: { screen: [0.1, -0.1], distance: 11 }, radius: 2.8, stretch: [1.5, 0.7, 1], turn: [0.2, 0.9, -0.2], shape: 'chunky', detail: 5, seed: 1601 },
  { at: { screen: [1.09, -0.1], distance: 26 }, radius: 6, stretch: [1.25, 0.9, 1], turn: [0.6, 0.2, 0.4], shape: 'angular', detail: 5, seed: 1873 },
  // The bottom right, and the bottom left under the menu.
  { at: { screen: [0.88, 1.06], distance: 9 }, radius: 2.3, stretch: [1.6, 0.8, 1], turn: [0.1, 1.1, 0.15], shape: 'angular', detail: 5, seed: 2111 },
  { at: { screen: [1.05, 0.84], distance: 13 }, radius: 2.6, stretch: [1, 1.2, 1], turn: [0.4, 0.3, 0.7], shape: 'chunky', detail: 5, seed: 2333 },
  { at: { screen: [0.16, 1.1], distance: 7 }, radius: 2, stretch: [1.8, 0.7, 1.1], turn: [0.1, 0.4, -0.1], shape: 'chunky', detail: 5, seed: 2557 },
];

/**
 * Rocks in the middle distance: a pool of twelve drifting in from the left and down across the frame
 * (with the rings' sweep), each pass its own distance, height, speed, slope and spin, dealt a new pass
 * out of sight once it leaves (asteroids.ts).
 */
const DRIFT_ROCKS = {
  pool: [
    [1.4, 'chunky', 5],
    [1.2, 'angular', 5],
    [1.1, 'elongated', 4],
    [1.1, 'chunky', 4],
    [0.9, 'angular', 4],
    [0.8, 'elongated', 4],
    [0.65, 'chunky', 3],
    [0.55, 'angular', 3],
    [0.45, 'elongated', 3],
    [0.4, 'chunky', 3],
    [0.32, 'angular', 2],
    [0.28, 'chunky', 2],
  ] as [number, RockShape, number][],
  distance: [16, 150] as [number, number],
  /** Entry heights: rock centres enter between these lines of the frame. */
  bandTop: 0.02,
  bandDepth: 0.62,
  /** Seconds to cross the frame's width: the near ones within half a minute, the far ones in two. */
  crossing: [32, 110] as [number, number],
  sink: [0.08, 0.32] as [number, number],
  approach: [0, 0.08] as [number, number],
  spin: [0.05, 0.12] as [number, number],
  seed: 0x15a7e,
};

/**
 * Shooting stars in the open sky above the planet: about one every 10 s (the first at 6 s), a long
 * bright streak falling away to the left in about a second. Drawn with the far sky, so the planet, its
 * rings and the rocks all stand in front of them.
 */
const METEORS: MeteorOptions = {
  area: [-0.15, 0.62, 0.55, 0.86],
  heading: [Math.PI + 0.12, Math.PI + 0.3],
  first: 6,
  every: [8, 12],
  seconds: 1.0,
  travel: 0.75,
  length: [0.45, 0.65],
  width: 0.022,
  brightness: 7,
};

/** Small pebbles at every depth: drifting in seeded directions and tumbling, nearer ones a little faster. */
const DEBRIS = {
  count: 18,
  countLow: 12,
  distance: [6.5, 60] as [number, number],
  size: [0.0065, 0.014] as [number, number],
  drift: [0.007, 0.015] as [number, number],
  driftAt: 25,
  parallax: 0.35,
  spin: [0.15, 0.7] as [number, number],
  seed: 0xdeb13,
};

/** The camera: its slow drift (units, at three unrelated rates), and how far it leans toward the pointer (units, and degrees of turn). */
const CAMERA = {
  drift: [0.05, 0.03, 0.07] as [number, number, number],
  lean: 0.06,
  leanTurn: 0.6,
  /** How quickly the lean follows the pointer (per second). */
  follow: 1.6,
  push: 1.4,
};

/**
 * Isilthe's signal (LORE.md: the Choir under its sea transmits on a cycle): now and then a faint pulse
 * runs out through the rings, and the menu's corner scope picks it up (TitleScreen, onSignal). Seconds
 * to the first, and between later ones.
 */
const SIGNAL = { first: 11, every: [18, 28] as [number, number], seed: 0x5c1e };

/**
 * Fitting other windows (frame()): the span of the 16:9 frame that must stay in view, from just left of
 * the astronaut's pack to just past the planet's far limb, and where it may run in a window: from the
 * menu column's right edge (style.css: --ts-pad + --ts-btn-w is 32-36% of the width) to the right edge.
 * Below `landscape` the window is treated as portrait.
 */
const FRAMING = { keep: [0.372, 0.865] as [number, number], menuEdge: 0.37, right: 0.985, landscape: 1.2 };

/** The maps the backdrop draws with, fetched as soon as the menu is up (TitleScreen.show). */
const MAPS: [string, boolean][] = [['isilthe_day.jpg', true]];

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
  camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.3, 40000);

  /** Called on the first frame actually drawn, so the menu can dissolve its stand-in sky into it. */
  onFirstFrame: (() => void) | null = null;
  /** Called when Isilthe's signal goes out (SIGNAL). */
  onSignal: (() => void) | null = null;
  private signalRand = mulberry32(SIGNAL.seed);
  private nextSignal = SIGNAL.first;

  private detail: THREE.WebGLRenderTarget | null = null;
  private sky!: TitleSky;
  private world!: Ringworld;
  private astronaut!: Astronaut;
  private formations!: Formations;
  private rocks!: LargeRocks;
  private debris!: Debris;
  private embers!: Embers;
  private fx!: SkyFx;

  private elapsed = 0;
  private firstFrame = true;
  private disposed = false;
  private yaw = 0;
  private leaveT = -1;
  private onLeft: (() => void) | null = null;
  private lowTier = false;

  /** The pointer, -1..1 across the window (target), and the lean that follows it (current). */
  private pointer = new THREE.Vector2();
  private lean = new THREE.Vector2();
  private onPointer = (e: PointerEvent) => {
    this.pointer.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
  };

  private scratchW = new THREE.Vector3();
  private lookTarget = new THREE.Vector3();

  async init(pacer?: Pacer): Promise<void> {
    const engine = getActiveEngine();
    if (!engine) throw new Error('TitleScene needs the engine');
    const renderer = engine.renderer;
    this.lowTier = engine.getQualityTier() === 'low';
    this.scene.background = new THREE.Color(0x03060c);

    // ---- solve the composition
    const P = COMPOSITION.planet;
    const toPlanet = dirAt(...P.at);
    const centre = toPlanet.clone().multiplyScalar(P.distance);
    const R = P.distance * Math.sin(P.angularRadius * DEG);
    // Screen axes at the planet: right and up, square to the line of sight.
    const right = new THREE.Vector3().crossVectors(toPlanet, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, toPlanet).normalize();
    const { opening, tilt } = COMPOSITION.rings;
    const major = right.clone().multiplyScalar(Math.cos(tilt * DEG)).addScaledVector(up, Math.sin(tilt * DEG));
    const minor = up.clone().multiplyScalar(Math.cos(tilt * DEG)).addScaledVector(right, -Math.sin(tilt * DEG));
    // The plane holds the long axis and a line running away from us, lifted toward the minor axis by the opening.
    const away = toPlanet.clone().multiplyScalar(Math.cos(opening * DEG)).addScaledVector(minor, Math.sin(opening * DEG));
    const ringNormal = new THREE.Vector3().crossVectors(major, away).normalize();
    const [sx, sy] = COMPOSITION.sunBehind;
    const sunDir = toPlanet.clone().addScaledVector(right, sx).addScaledVector(up, sy).normalize();

    // The light on everything near: a cool key from the right and in front (the ring arc's light), a
    // cyan rim from the planet's side, a warm bounce from below, a dim blue fill.
    const keyDir = new THREE.Vector3(0.8, 0.42, -0.18).normalize();
    const rimDir = toPlanet.clone().addScaledVector(right, 0.35).addScaledVector(up, 0.25).normalize();
    const bounceDir = new THREE.Vector3(-0.3, -0.85, 0.3).normalize();
    const near: RockLight = {
      sunDir: keyDir,
      rimDir,
      bounceDir,
      sunColor: new THREE.Color(0.62, 0.8, 1.0).multiplyScalar(0.8),
      bounceColor: new THREE.Color(0.42, 0.26, 0.14).multiplyScalar(0.25),
      fillColor: new THREE.Color(0.022, 0.036, 0.06),
      rimGain: 2.2,
      albedo: [0.035, 0.24],
    };
    // Rubble out by the planet: lit from behind, silhouettes against the rings with a bright rim.
    const far: RockLight = {
      sunDir,
      rimDir: sunDir,
      bounceDir: ringNormal,
      sunColor: new THREE.Color(1.0, 0.9, 0.8).multiplyScalar(1.4),
      bounceColor: new THREE.Color(0.2, 0.45, 0.6).multiplyScalar(0.25),
      fillColor: new THREE.Color(0.02, 0.035, 0.05),
      rimGain: 1.4,
      albedo: [0.035, 0.24],
    };

    const pace = () => pacer?.breathe() ?? Promise.resolve();
    let at = performance.now();
    const step = (name: string) => {
      span(`title:${name}`, at);
      at = performance.now();
    };
    const band = COMPOSITION.band;
    const baking = bakeDetailNoise(renderer, pace);
    const skying = buildTitleSky(renderer, baking.then((rt) => rt.texture), { from: tangentAt(...band.from), to: tangentAt(...band.to), core: tangentAt(...band.knot) }, { stars: this.lowTier ? 4200 : 8000, pace });
    const [detail, sky] = await Promise.all([baking, skying]);
    this.detail = detail;
    this.sky = sky;
    this.scene.add(this.sky.group);
    step('bakes');
    await pacer?.tick();

    this.world = buildRingworld({
      center: centre,
      radius: R,
      ringNormal,
      sunDir,
      day: planetTexture('isilthe_day.jpg', true),
      detail: detail.texture,
      segments: this.lowTier ? 128 : 192,
      spin: COMPOSITION.spin,
      hazeDrift: COMPOSITION.hazeDrift,
      ringRate: COMPOSITION.ringRate,
      glow: COMPOSITION.glow,
      rubble: { count: this.lowTier ? 36 : 56, size: [R * 0.004, R * 0.02], light: far, seed: 0x7ab1e },
    });
    this.scene.add(this.world.group);
    step('planet');
    await pacer?.tick();

    // ---- the perch: the astronaut and the ledge, in the figure's frame
    const seat = dirAt(...PERCH.at).multiplyScalar(PERCH.distance);
    const perch = new THREE.Matrix4().compose(seat, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), PERCH.facing * DEG), new THREE.Vector3(1, 1, 1));
    this.astronaut = buildAstronaut({
      detail: detail.texture,
      still: motion.reduced,
      light: {
        keyDir,
        keyColor: new THREE.Color(0.85, 0.92, 1.0).multiplyScalar(1.15),
        rimDir,
        rimColor: new THREE.Color(0.45, 0.8, 1.0).multiplyScalar(0.9),
        fill: new THREE.Color(0.05, 0.075, 0.11),
        bounceDir,
        bounceColor: new THREE.Color(0.4, 0.26, 0.15).multiplyScalar(0.3),
        planetDir: toPlanet,
        planetAngle: P.angularRadius * DEG,
        ringNormal,
      },
    });
    this.astronaut.group.matrixAutoUpdate = false;
    this.astronaut.group.matrix.copy(perch);
    this.scene.add(this.astronaut.group);
    step('astronaut');
    await pacer?.tick();

    this.formations = await buildFormations({ rocks: FRAME_ROCKS, perch, dirAt: (x, y) => dirAt(x, y), light: near, occluders: this.astronaut.occluders(), pace: () => pacer?.tick() ?? Promise.resolve() });
    this.scene.add(this.formations.mesh);
    step('formations');

    const view = { tanH: TAN_H, tanV: TAN_V };
    const D = DRIFT_ROCKS;
    // Out in the glow of the rings the drifting rocks take more fill and rim than the near rock, or
    // against the planet's dark disc they read as holes.
    const mid: RockLight = { ...near, fillColor: new THREE.Color(0.06, 0.09, 0.13), rimGain: 3 };
    this.rocks = await buildAsteroids({
      ...D,
      ...mid,
      pool: D.pool.map(([r, shape, sub]) => [r, shape, this.lowTier ? Math.min(sub, 4) : sub]),
      view,
      pace: () => pacer?.tick() ?? Promise.resolve(),
    });
    this.scene.add(this.rocks.mesh);
    this.debris = buildDebris({ ...DEBRIS, ...near, count: this.lowTier ? DEBRIS.countLow : DEBRIS.count, view });
    this.scene.add(this.debris.group);
    step('rocks');
    await pacer?.tick();

    // Sparks among the rocks on the right, in front of the planet and behind the figure.
    this.embers = buildEmbers({ count: this.lowTier ? 26 : 44, boxMin: new THREE.Vector3(-1, -5, -26), boxSize: new THREE.Vector3(14, 10, 20), seed: 0xe3be5 });
    this.scene.add(this.embers.points);

    const drift = new THREE.Vector3(...COMPOSITION.dustDrift).normalize().multiplyScalar(0.9);
    this.fx = buildSkyFx({
      sunDir,
      coreDistance: 30000,
      dust: {
        count: this.lowTier ? 90 : 180,
        boxMin: new THREE.Vector3(-16, -11, -42),
        boxSize: new THREE.Vector3(40, 22, 36),
        stream: drift,
      },
      meteors: METEORS,
    });
    this.fx.setMeteors(!motion.reduced);
    this.scene.add(this.fx.group);

    // Complete from the first frame: the menu's dissolve is the only arrival.
    this.sky.setReveal(1, 1);
    this.world.setFade(1);
    this.astronaut.setFade(1);
    this.formations.setFade(1);
    this.rocks.setFade(1);
    this.debris.setFade(1);
    this.embers.setIntensity(1);
    this.fx.setGlare(0);
    this.fx.setDust(0.6);

    this.frame(window.innerWidth / window.innerHeight);
    this.world.update(0);
    this.astronaut.update(0);
    this.placeCamera(0, 0);
    step('fx');
    await planetTexturesReady();
    step('maps');
  }

  onEnter(): void {
    mark('title:backdrop');
    window.addEventListener('pointermove', this.onPointer);
  }

  /** The way out: the camera eases forward and the picture goes to black. */
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
    const e = this.elapsed;
    this.world.update(e);
    this.astronaut.update(e);
    this.rocks.update(dt);
    this.debris.update(e);
    this.embers.update(e);
    if (e >= this.nextSignal && this.leaveT < 0) {
      this.nextSignal = e + SIGNAL.every[0] + this.signalRand() * (SIGNAL.every[1] - SIGNAL.every[0]);
      this.world.pulse();
      this.onSignal?.();
    }

    // Leaving: push in, black.
    let push = 0;
    if (this.leaveT >= 0) {
      this.leaveT += dt;
      const k = clamp01(this.leaveT / (motion.reduced ? 0.35 : LEAVE_SECONDS));
      this.fx.setVeil(smooth(k));
      push = motion.reduced ? 0 : k * k * CAMERA.push;
      if (k >= 1 && this.onLeft) {
        const done = this.onLeft;
        this.onLeft = null;
        done();
      }
    }

    this.placeCamera(push, dt);
    this.fx.update(this.camera, dt, e);
    this.sky.update(this.camera);

    if (this.firstFrame) {
      this.firstFrame = false;
      this.onFirstFrame?.();
    }
  }

  /** Rest position, a slow drift that shows the depth between the figure, the rocks and the planet, the lean toward the pointer, and the push-in when leaving. */
  private placeCamera(push: number, dt: number): void {
    const still = motion.reduced ? 0 : 1;
    const e = this.elapsed;
    const [dx, dy, dz] = CAMERA.drift;
    // The lean follows the pointer on a first-order lag (frame-rate independent).
    const k = 1 - Math.exp(-CAMERA.follow * Math.min(dt, 0.1));
    this.lean.x += (this.pointer.x * still - this.lean.x) * k;
    this.lean.y += (this.pointer.y * still - this.lean.y) * k;
    this.camera.position.set(
      (Math.sin(e * 0.11) * dx + this.lean.x * CAMERA.lean) * still,
      (Math.sin(e * 0.083 + 1.3) * dy - this.lean.y * CAMERA.lean * 0.6) * still,
      Math.sin(e * 0.061 + 0.6) * dz * still,
    );
    const turn = CAMERA.leanTurn * DEG;
    const yaw = this.yaw + this.lean.x * turn * still;
    this.lookTarget.set(Math.sin(yaw) * 120, -this.lean.y * turn * 0.6 * still * 120, -Math.cos(yaw) * 120);
    if (push > 0) {
      this.scratchW.copy(this.lookTarget).sub(this.camera.position).normalize();
      this.camera.position.addScaledVector(this.scratchW, push);
    }
    this.camera.lookAt(this.lookTarget);
  }

  /**
   * Fits the picture to the window. Landscape: the span from the figure to the planet's far limb
   * (FRAMING.keep) has to fit between the menu's column and the right edge, so a squarer window opens
   * the field of view as much as that needs and turns the camera left until the figure clears the
   * menu (at 16:9 neither is needed). Portrait, where the menu covers the width anyway: the old rule,
   * a wider view turned toward the planet.
   */
  private frame(aspect: number): void {
    let tanV: number;
    let shift = 0;
    if (aspect >= FRAMING.landscape) {
      const [l, r] = FRAMING.keep.map((x) => (2 * x - 1) * TAN_H);
      const room = FRAMING.right - FRAMING.menuEdge;
      const tanH = Math.max(TAN_V * aspect, (r - l) / (2 * room));
      tanV = tanH / aspect;
      // Where the figure's edge lands: 0.5 + (l - shift) / (2 tanH) = menuEdge, unless it is clear already.
      shift = Math.min(0, l - (2 * FRAMING.menuEdge - 1) * tanH);
    } else {
      tanV = Math.max(TAN_V, 0.36 / aspect);
      shift = Math.tan(Math.max(0, Math.atan(TAN_H) - Math.atan(tanV * aspect)) * 0.6);
    }
    this.camera.fov = (2 * Math.atan(tanV)) / DEG;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.yaw = Math.atan(shift);
    this.rocks?.setView(tanV * aspect, tanV);
    this.debris?.setView(tanV * aspect, tanV);
  }

  onResize(width: number, height: number): void {
    this.frame(width / height);
  }

  dispose(): void {
    this.disposed = true;
    window.removeEventListener('pointermove', this.onPointer);
    // A leave() still waiting resolves, so nothing waits on a scene that is gone.
    const left = this.onLeft;
    this.onLeft = null;
    left?.();
    this.detail?.dispose();
    this.sky?.dispose();
    this.world?.dispose();
    this.astronaut?.dispose();
    this.formations?.dispose();
    this.rocks?.dispose();
    this.debris?.dispose();
    this.embers?.dispose();
    this.fx?.dispose();
  }
}
