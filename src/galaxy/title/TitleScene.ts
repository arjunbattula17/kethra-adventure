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
import { buildHeroPlanet, buildMoon } from './heroPlanet';
import type { HeroPlanet, Moon } from './heroPlanet';
import { buildAsteroids, rockTextures } from './asteroids';
import type { AsteroidField, RockSpec } from './asteroids';
import { buildSkyFx } from './skyFx';
import type { SkyFx } from './skyFx';
import { buildTitleShip, SHIP_NOSE_X, SHIP_STERN_X } from './titleShip';
import type { TitleShip } from './titleShip';

/**
 * The title screen's backdrop: a survey cruiser on blue engines over Kethra's day side at sunrise,
 * inside the belt the planet orbits, with Isilthe's rings over the horizon and a small moon off the
 * limb. It sits behind the DOM menu (TitleScreen.ts), drawn by the engine like any scene, and is gone
 * (disposed by Engine.setScene) once the player picks.
 *
 * Composition is authored on a 16:9 frame (COMPOSITION, SHIP, ROCKS: screen fractions from the top
 * left) and solved into world space at build, so the numbers below read like the layout they produce:
 * Kethra's limb is the circle through three screen points, the sun sits just over it, the ship runs
 * from a nose point to a stern point at two distances, each rock at a screen point and a distance.
 * Narrower windows turn the camera so the right of the picture stays (frame()).
 *
 * Everything here draws with its own shaders: no scene lights and no environment map, so nothing waits
 * for either, and the whole scene is under twenty small programs prepared in the background while the
 * menu is already up. It is complete from its first frame; the menu dissolves its stand-in sky into it.
 *
 * Motion is all transforms and uniforms, deterministic sums of slow sines on elapsed time; the update
 * path allocates nothing. Nothing follows the pointer or the menu: the world keeps its own time. Under
 * reduced motion the camera holds still and there are no meteors.
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
  limb: [[0.32, 0.74], [0.62, 0.37], [1.0, 0.14]] as [number, number][],
  /** Where the sun is seen (the glare), and how far outside the limb, in degrees. */
  sunAt: [0.635, 0.355] as [number, number],
  sunLift: 0.9,
  /**
   * How far the light that shades the planet and the rocks is turned from the seen sun toward the
   * camera (0..1). With the sun exactly behind the limb the whole visible disc would be night, which is
   * physically right and a black picture; turned, the terminator crosses the disc on a diagonal, day
   * toward the upper right and the canopy's night glow toward the menu.
   */
  lightTowardCamera: 0.42,
  /** Isilthe, mostly set behind the limb, its rings opened toward us. */
  isilthe: { at: [0.89, 0.15] as [number, number], distance: 17000, angularRadius: 6.2 },
  /** A small grey moon off the limb, between the wordmark and the sunrise. */
  moon: { at: [0.425, 0.43] as [number, number], distance: 9000, angularRadius: 1.45 },
  /** The galactic band, from where it enters the frame to where it sinks behind the limb, and its brightest knot. */
  band: { from: [0.42, -0.08] as [number, number], to: [1.02, 0.6] as [number, number], knot: [0.7, 0.2] as [number, number] },
  /** The direction the near-field dust drifts (we are coasting forward through it). */
  dustDrift: [0.25, -0.12, 1] as [number, number, number],
};

/**
 * The ship: where its nose and the mouths of its engines are seen, and how far each is, which sets its
 * heading and its size; and its bank about its own long axis (negative turns the deck toward us).
 */
const SHIP = {
  nose: [0.585, 0.53] as [number, number],
  noseDistance: 30,
  stern: [0.8, 0.66] as [number, number],
  sternDistance: 20,
  roll: -8,
};

/**
 * Rocks: screen point, distance, radius, subdivision. Dark ones close in the lower left, debris in
 * the lower middle under the ship, and a few out toward the limb, all clear of the ship and its plumes.
 */
const ROCKS: [number, number, number, number, number][] = [
  [0.03, 1.04, 9, 2.3, 5],
  [0.17, 1.09, 8, 1.6, 4],
  [-0.07, 0.8, 12, 2.1, 4],
  [0.3, 1.0, 16, 0.7, 3],
  [0.95, 1.04, 11, 1.25, 5],
  [0.66, 0.88, 20, 0.8, 4],
  [0.93, 0.44, 40, 0.5, 3],
  [0.6, 0.8, 30, 0.45, 3],
  [0.47, 0.86, 26, 0.6, 3],
  [0.53, 0.8, 34, 0.38, 2],
  [0.41, 0.72, 44, 0.36, 2],
  [0.53, 0.66, 52, 0.26, 2],
  [0.98, 0.9, 24, 0.5, 3],
  [0.47, 0.61, 62, 0.2, 2],
  [0.86, 0.36, 64, 0.3, 2],
  [0.12, 0.84, 30, 0.35, 2],
  [0.36, 0.79, 38, 0.3, 2],
  [0.78, 0.94, 30, 0.34, 2],
  [0.7, 0.47, 72, 0.22, 2],
];

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

  /** Called on the first frame actually drawn, so the menu can dissolve its stand-in sky into it. */
  onFirstFrame: (() => void) | null = null;

  private detail: THREE.WebGLRenderTarget | null = null;
  private sky!: TitleSky;
  private hero!: HeroPlanet;
  private worlds: PlanetInstance[] = [];
  private moon!: Moon;
  private rocks!: AsteroidField;
  private ship!: TitleShip;
  private fx!: SkyFx;

  private sunSeen = new THREE.Vector3();
  private light = new THREE.Vector3();

  private elapsed = 0;
  private firstFrame = true;
  private disposed = false;
  private yaw = 0;
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
    // Kethra's lit face lies down and to the right: that is where its bounce comes from.
    const bounceDir = dirAt(0.85, 0.95);

    // GPU bakes, each a strip a frame, fenced so the GPU has finished one before the next is queued.
    const pace = () => pacer?.breathe() ?? Promise.resolve();
    // Each step on the performance timeline (title:bakes, title:planets, ...).
    let at = performance.now();
    const step = (name: string) => {
      span(`title:${name}`, at);
      at = performance.now();
    };
    // The three bakes compile and draw side by side; none needs another.
    const band = COMPOSITION.band;
    const baking = bakeDetailNoise(renderer, pace);
    const skying = buildTitleSky(renderer, baking.then((rt) => rt.texture), { from: tangentAt(...band.from), to: tangentAt(...band.to), core: tangentAt(...band.knot) }, { stars: this.lowTier ? 4200 : 8000, pace });
    // The ship's key light comes from the sun's side, raised: the deck takes a warm sheen toward the
    // sunrise, and the flank toward us stays dark.
    const keyDir = this.sunSeen.clone().add(new THREE.Vector3(0, 0.6, 0)).normalize();
    const fillDir = new THREE.Vector3(-0.45, 0.35, 0.82).normalize();
    const shipping = buildTitleShip(renderer, { keyDir, sunDir: this.sunSeen, bounceDir, fillDir, planetCenter: centre, planetRadius: R, planetLight: this.light, pace });
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
    this.scene.add(this.hero.group);

    const sunFar = this.light.clone().multiplyScalar(1e7);
    const isilthe = COMPOSITION.isilthe;
    const def = PLANETS.find((p) => p.id === 'isilthe')!;
    const position = dirAt(...isilthe.at).multiplyScalar(isilthe.distance);
    const world = buildPlanetInstance({ ...def, radius: isilthe.distance * Math.sin(isilthe.angularRadius * DEG) }, position, sunFar, this.camera);
    // Half a turn about the line of sight: the rings are seen from above, opened toward us by about a
    // third and rising a little to the right over the limb. Any spin about the vertical would close
    // them toward edge-on.
    world.group.rotation.set(0, 0, Math.PI + 0.06);
    this.scene.add(world.group);
    this.worlds.push(world);

    const moon = COMPOSITION.moon;
    this.moon = buildMoon({ position: dirAt(...moon.at).multiplyScalar(moon.distance), radius: moon.distance * Math.sin(moon.angularRadius * DEG), light: this.light, detail: detail.texture });
    this.scene.add(this.moon.mesh);
    step('planets');
    await pacer?.tick();

    const rocks: RockSpec[] = ROCKS.map(([x, y, d, r, sub]) => ({ at: dirAt(x, y).multiplyScalar(d), radius: r, detail: this.lowTier ? Math.min(sub, 4) : sub }));
    this.rocks = await buildAsteroids(rocks, { sunDir: this.light, rimDir: this.sunSeen, bounceDir, pace: () => pacer?.tick() ?? Promise.resolve() });
    this.scene.add(this.rocks.mesh);
    step('rocks');
    await pacer?.tick();

    this.ship = await shipping;
    this.placeShip();
    this.scene.add(this.ship.group);
    step('ship');

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
      // Over the sky between the wordmark and the limb, clear of the corner labels.
      meteorArea: [0.05, 0.4, 0.7, 0.78],
    });
    this.fx.setMeteors(!motion.reduced);
    this.scene.add(this.fx.group);

    // Complete from the first frame: the menu's dissolve is the only arrival.
    this.sky.setReveal(1, 1);
    this.hero.setReveal(1, 1);
    for (const w of this.worlds) w.setFade(1);
    this.moon.setFade(1);
    this.rocks.setFade(1);
    this.ship.setFade(1);
    this.fx.setGlare(1);
    this.fx.setDust(0.9);

    this.frame(window.innerWidth / window.innerHeight);
    this.placeCamera(0);
    step('fx');
    await planetTexturesReady();
    step('maps');
  }

  /** Solves the ship's place from SHIP: the line from stern to nose sets its heading and its size. */
  private placeShip(): void {
    const nose = dirAt(...SHIP.nose).multiplyScalar(SHIP.noseDistance);
    const stern = dirAt(...SHIP.stern).multiplyScalar(SHIP.sternDistance);
    const forward = nose.sub(stern);
    const scale = forward.length() / (SHIP_NOSE_X - SHIP_STERN_X);
    forward.normalize();
    const up = new THREE.Vector3(0, 1, 0).addScaledVector(forward, -forward.y).normalize().applyAxisAngle(forward, SHIP.roll * DEG);
    const starboard = new THREE.Vector3().crossVectors(forward, up);
    const g = this.ship.group;
    g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(forward, up, starboard));
    g.scale.setScalar(scale);
    g.position.copy(stern).addScaledVector(forward, -SHIP_STERN_X * scale);
  }

  onEnter(): void {
    mark('title:backdrop');
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
    const e = this.elapsed;
    for (const w of this.worlds) w.update(e, dt);
    this.hero.update(e);
    this.rocks.update(e);
    this.ship.update(e);

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

    this.placeCamera(push);
    this.fx.update(this.camera, dt, e);
    this.sky.update(this.camera);

    if (this.firstFrame) {
      this.firstFrame = false;
      this.onFirstFrame?.();
    }
  }

  /** Rest position, a slow drift that shows the depth between rocks, ship and planet, and the push-in when leaving. */
  private placeCamera(push: number): void {
    const still = motion.reduced ? 0 : 1;
    const e = this.elapsed;
    this.camera.position.set(Math.sin(e * 0.11) * 0.22 * still, Math.sin(e * 0.083 + 1.3) * 0.12 * still, Math.sin(e * 0.061 + 0.6) * 0.3 * still);
    this.lookTarget.set(Math.sin(this.yaw) * 120, 0, -Math.cos(this.yaw) * 120);
    if (push > 0) {
      this.scratchW.copy(this.lookTarget).sub(this.camera.position).normalize();
      this.camera.position.addScaledVector(this.scratchW, push);
    }
    this.camera.lookAt(this.lookTarget);
  }

  /**
   * Fits the picture to the window: a narrower window keeps the right of the 16:9 composition (the
   * planet and the ship) by turning the camera, and a very narrow one opens the field of view too.
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
    this.moon?.dispose();
    this.rocks?.dispose();
    this.ship?.dispose();
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
