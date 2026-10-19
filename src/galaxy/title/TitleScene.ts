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
import { buildAsteroids, buildDebris, rockTextures } from './asteroids';
import type { Debris, LargeRocks, RockShape } from './asteroids';
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
const X_AXIS = new THREE.Vector3(1, 0, 0);

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
 * The ship's way in: one continuous flight, not stitched moves. The scene holds still for `delay`;
 * then the ship sets off behind the camera beyond the right edge, overtakes us flat out, brakes
 * suddenly once well into the frame and drifts on toward the planet, passing its composed pose (SHIP)
 * and never stopping.
 *
 * Speed along the path: v(t) = vDrift(t) + boost(t). The boost holds at `speed` (300 times the drift)
 * until the last speed * tau units of its `distance`, then falls as exp(-(t - tBrake) / tau): a dash
 * across the frame, then a sudden stop. vDrift(t) = drift * exp(-t / driftTau), so the drift outlasts
 * any visit without carrying the ship off. Position is that speed integrated (closed form). The path
 * runs straight, then over its last `turnDistance` units arcs into the composed heading, so it comes in
 * from the side and covers more of the frame; the nose is always along the path, and the ship banks into
 * the arc. Its plumes follow the boost: full through the dash, out about half a second after it shows.
 */
const FLIGHT = {
  /** Seconds after the backdrop's first frame before it sets off: the galaxy alone first. */
  delay: 2,
  /** Units it travels on the boost, from its start to (nearly) its stop. The ship is ~12 long. */
  distance: 34,
  /** The dash: units per second until it brakes. */
  speed: 60,
  /** Braking time constant, seconds: the boost falls by e every tau once it brakes (it brakes for speed * tau = 9 units). */
  tau: 0.15,
  /**
   * Drift speed once the boost is spent (units/s), and the time constant it eases off over (s). Its drift
   * runs mostly away from the camera, so it has to be this fast to read on screen (~5-7 px/s at 1600 wide).
   */
  drift: 0.2,
  driftTau: 120,
  /**
   * Seconds after setting off at which it passes the composed pose. Soon after it stops, so it flies a
   * little further than the composition before it glides (~2 units past where it used to stop).
   */
  composedAt: 3,
  /** Its heading at the start, turned from the composed one about its up axis (degrees; + = toward the left of frame). */
  turn: 16,
  /** The arc into the composed heading: its length along the path, in units. */
  turnDistance: 26,
  /** Bank into the arc at the full turn, degrees. */
  bank: 10,
  /** Plume strength per unit of boost (1 through the dash); out below `thrustCut`: full through the dash, gone ~0.4 s into the braking. */
  thrustGain: 2,
  thrustCut: 0.1,
  /** How far beyond a rock's size its first place must be from the ship's way in. */
  clearance: 8,
};

/** Whether the entrance has played in this page: a later visit to the title picks up the drift instead. */
let flightFlown = false;

/**
 * Large rocks: a pool of twelve, streaming rightward along the bottom of the frame, under the menu and
 * the ship's plumes, biggest nearest. Each pass gets its own distance, height, speed, sink, approach and
 * spin; a rock that leaves is dealt a new pass from just outside the left edge (asteroids.ts).
 */
const LARGE_ROCKS = {
  pool: [
    [2.3, 'chunky', 5],
    [1.8, 'angular', 5],
    [1.5, 'elongated', 4],
    [1.2, 'chunky', 4],
    [1.0, 'angular', 4],
    [0.85, 'elongated', 4],
    [0.7, 'chunky', 3],
    [0.6, 'angular', 3],
    [0.5, 'elongated', 3],
    [0.42, 'chunky', 3],
    [0.35, 'angular', 2],
    [0.3, 'chunky', 2],
  ] as [number, RockShape, number][],
  distance: [11, 70] as [number, number],
  bandTop: 0.8,
  bandDepth: 0.12,
  /** Seconds to cross the frame's width: big near rocks visibly move within a few seconds. */
  crossing: [26, 60] as [number, number],
  sink: [-0.02, 0.1] as [number, number],
  approach: [0, 0.12] as [number, number],
  spin: [0.04, 0.1] as [number, number],
  seed: 0xa57e,
};

/** Small debris at every depth: a sparse scatter of pebbles with fixed drift (seeded random heading) and spin, nearer ones a little faster. */
const DEBRIS = {
  /** About 10 on screen at a time (the wrap box runs a little past the view); with the large rocks, ~15 in all. */
  count: 12,
  countLow: 10,
  distance: [7, 70] as [number, number],
  size: [0.006, 0.013] as [number, number],
  /** Frame widths per second at `driftAt` units: 1-3% of the width every second, so it reads within seconds. */
  drift: [0.008, 0.016] as [number, number],
  driftAt: 25,
  parallax: 0.35,
  spin: [0.15, 0.7] as [number, number],
  seed: 0xdeb12,
};

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
  private rocks!: LargeRocks;
  private debris!: Debris;
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
  private shipScale = 1;

  /** The ship's composed pose (SHIP) and its axes there: forward, up, and the side its turn swings toward. */
  private pose = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), forward: new THREE.Vector3(), up: new THREE.Vector3(), side: new THREE.Vector3() };
  /** Flight time at elapsed 0 (negative: the wait before it sets off). */
  private flightClock = -FLIGHT.delay;
  private thrust = 1;
  private turnQ = new THREE.Quaternion();
  private bankQ = new THREE.Quaternion();
  private offset = new THREE.Vector3();

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

    // A later visit, or reduced motion: no entrance, the ship is already drifting.
    if (flightFlown || motion.reduced) this.flightClock = FLIGHT.composedAt;
    this.solveShip();
    const view = { tanH: TAN_H, tanV: TAN_V };
    const light = { sunDir: this.light, rimDir: this.sunSeen, bounceDir };
    const L = LARGE_ROCKS;
    this.rocks = await buildAsteroids({
      ...L,
      ...light,
      pool: L.pool.map(([r, shape, sub]) => [r, shape, this.lowTier ? Math.min(sub, 4) : sub]),
      avoid: { points: this.flightPath(2), clearance: FLIGHT.clearance },
      view,
      pace: () => pacer?.tick() ?? Promise.resolve(),
    });
    this.scene.add(this.rocks.mesh);
    this.debris = buildDebris({ ...DEBRIS, ...light, count: this.lowTier ? DEBRIS.countLow : DEBRIS.count, view });
    this.scene.add(this.debris.group);
    step('rocks');
    await pacer?.tick();

    this.ship = await shipping;
    this.flyShip(this.flightClock);
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
    this.debris.setFade(1);
    this.ship.setFade(1);
    this.fx.setGlare(1);
    this.fx.setDust(0.9);

    this.frame(window.innerWidth / window.innerHeight);
    this.placeCamera(0);
    step('fx');
    await planetTexturesReady();
    step('maps');
  }

  /** Solves the ship's composed pose from SHIP: the line from stern to nose sets its heading and its size. */
  private solveShip(): void {
    const nose = dirAt(...SHIP.nose).multiplyScalar(SHIP.noseDistance);
    const stern = dirAt(...SHIP.stern).multiplyScalar(SHIP.sternDistance);
    const forward = nose.sub(stern);
    this.shipScale = forward.length() / (SHIP_NOSE_X - SHIP_STERN_X);
    forward.normalize();
    const up = new THREE.Vector3(0, 1, 0).addScaledVector(forward, -forward.y).normalize().applyAxisAngle(forward, SHIP.roll * DEG);
    const starboard = new THREE.Vector3().crossVectors(forward, up);
    const p = this.pose;
    p.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(forward, up, starboard));
    p.position.copy(stern).addScaledVector(forward, -SHIP_STERN_X * this.shipScale);
    p.forward.copy(forward);
    p.up.copy(up);
    // Turning the heading by +angle about up swings it toward this side (up x forward).
    p.side.crossVectors(up, forward);
  }

  /** Units travelled along the path by flight time t (FLIGHT): the speed model, integrated. */
  private travelled(t: number): number {
    if (t <= 0) return 0;
    const F = FLIGHT;
    const brakeAt = F.distance / F.speed - F.tau;
    const boost = t <= brakeAt ? F.speed * t : F.speed * brakeAt + F.speed * F.tau * (1 - Math.exp(-(t - brakeAt) / F.tau));
    return F.drift * F.driftTau * (1 - Math.exp(-t / F.driftTau)) + boost;
  }

  /**
   * The ship's offset from its composed pose with `remaining` units still to go to it (negative once
   * past), written to `out`; returns its heading's turn from the composed one, in radians. Straight
   * beyond the arc; on the arc the turn is proportional to the distance left.
   */
  private pathOffset(remaining: number, out: THREE.Vector3): number {
    const { forward, side } = this.pose;
    if (remaining <= 0) {
      out.copy(forward).multiplyScalar(-remaining);
      return 0;
    }
    const turn = FLIGHT.turn * DEG;
    const L = FLIGHT.turnDistance;
    const k = turn / L;
    const a = Math.min(remaining, L);
    // Back along the arc: the heading (forward turned by k*s toward side) integrated over s in 0..a.
    out.copy(forward).multiplyScalar(-Math.sin(k * a) / k).addScaledVector(side, -(1 - Math.cos(k * a)) / k);
    if (remaining > L) out.addScaledVector(forward, -Math.cos(turn) * (remaining - L)).addScaledVector(side, -Math.sin(turn) * (remaining - L));
    return turn * (a / L);
  }

  /** Points along the way in, every `step` units, for the first rock layout to keep clear of. */
  private flightPath(step: number): THREE.Vector3[] {
    const points: THREE.Vector3[] = [];
    const total = this.travelled(FLIGHT.composedAt) - this.travelled(Math.max(this.flightClock, 0));
    for (let r = total; r > -step; r -= step) {
      this.pathOffset(Math.max(r, 0), this.offset);
      points.push(this.pose.position.clone().add(this.offset));
    }
    return points;
  }

  /** Places the ship at flight time t: the one owner of its group's transform. */
  private flyShip(t: number): void {
    const time = Math.max(t, 0);
    const turned = this.pathOffset(this.travelled(FLIGHT.composedAt) - this.travelled(time), this.offset);
    const g = this.ship.group;
    g.position.copy(this.pose.position).add(this.offset);
    this.turnQ.setFromAxisAngle(this.pose.up, turned);
    // Banked into the arc, about its own long axis (+X): starboard down while it swings right.
    this.bankQ.setFromAxisAngle(X_AXIS, FLIGHT.bank * DEG * (turned / (FLIGHT.turn * DEG)));
    g.quaternion.copy(this.turnQ).multiply(this.pose.quaternion).multiply(this.bankQ);
    g.scale.setScalar(this.shipScale);
    const brakeAt = FLIGHT.distance / FLIGHT.speed - FLIGHT.tau;
    const boost = time <= brakeAt ? 1 : Math.exp(-(time - brakeAt) / FLIGHT.tau);
    this.thrust = clamp01((boost * FLIGHT.thrustGain - FLIGHT.thrustCut) / (1 - FLIGHT.thrustCut));
  }

  onEnter(): void {
    mark('title:backdrop');
    flightFlown = true;
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
    this.rocks.update(dt);
    this.debris.update(e);
    this.flyShip(e + this.flightClock);
    this.ship.update(e, this.thrust);

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
    this.rocks?.setView(tanV * aspect, tanV);
    this.debris?.setView(tanV * aspect, tanV);
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
    this.debris?.dispose();
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
