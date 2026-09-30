import * as THREE from 'three';
import type { GameScene } from '../core/Engine';
import { CameraPath, MotionScope, ease, motion } from '../motion';
import { disposeSceneFully } from '../core/disposeSceneTextures';
import { getActiveEngine } from '../core/EngineRegistry';
import { getSharedEnvironment } from '../core/Environment';
import { GRADES, lerpGrade } from '../core/GradeGlowPass';
import type { GradeProfile } from '../core/GradeGlowPass';
import { AudioSystem } from '../audio/AudioSystem';
import { UIManager } from '../ui/UIManager';
import { HoldToSkip } from '../ui/HoldToSkip';
import { playKineticTitle } from '../ui/KineticTitle';
import { t } from '../content/strings';
import type { StringKey } from '../content/strings';
import { PLANETS } from './planetData';
import { buildShipHull } from './shipHull';
import type { ShipHull } from './shipHull';
import { buildPlanetInstance, planetTexturesReady, type PlanetInstance } from './planetShader';
import { buildSpaceSky } from './spaceSky';
import type { SpaceSky } from './spaceSky';
import { buildSun, sunMapReady } from './sun';
import type { Sun } from './sun';
import { buildCanopyLights, buildCloudLayer, buildPassingRocks, buildPlume, buildShockRing, Streaks } from './cruise/pieces';
import { buildSkiff } from './skiff';
import type { Skiff } from './skiff';
import { buildAnchorage } from '../planets/vessek/anchorage';
import type { Anchorage } from '../planets/vessek/anchorage';
import type { Pacer } from '../core/prepare';

export interface CruiseOptions {
  destination: 'kethra' | 'vessek';
  /** Trip length in days, from GameState.course; shown by the day counter and captions. */
  days: number;
  cells: number;
}

/** Start time of each beat, in seconds from the start of the cruise. */
const BEAT = {
  stern: 0,
  departure: 3.5,
  acceleration: 10,
  transit: 16,
  reveal: 28,
  entry: 36,
  handoff: 44,
  end: 49,
} as const;

/** Time in seconds when the ship reaches its berth at Vessek. */
const DOCKED = BEAT.handoff + 1.2;

/** Ship speed keyframes as [time in s, units per second], linearly interpolated. At Kethra the ship
 * keeps moving for the skiff drop; at Vessek it stops at the berth. */
const SPEED: Record<CruiseOptions['destination'], [number, number][]> = {
  kethra: [[0, 0], [0.8, 0], [BEAT.acceleration, 9], [BEAT.transit, 70], [BEAT.reveal, 70], [BEAT.entry, 25]],
  vessek: [[0, 0], [0.8, 0], [BEAT.acceleration, 9], [BEAT.transit, 70], [BEAT.reveal, 70], [BEAT.entry, 14], [BEAT.handoff - 1, 2.2], [DOCKED, 0]],
};

function speedAt(time: number, speeds: [number, number][]): number {
  for (let i = 1; i < speeds.length; i++) {
    const [t1, v1] = speeds[i];
    const [t0, v0] = speeds[i - 1];
    if (time <= t1) return v0 + ((v1 - v0) * (time - t0)) / (t1 - t0);
  }
  return speeds[speeds.length - 1][1];
}

/** Distance travelled along +x at `time`, integrated from the speed curve so a skip lands in the
 * right place. */
function distanceAt(time: number, speeds: [number, number][]): number {
  let x = 0;
  const step = 1 / 30;
  for (let s = 0; s < time; s += step) x += speedAt(s + step / 2, speeds) * Math.min(step, time - s);
  return x;
}

const smooth = (a: number, b: number, x: number) => {
  const k = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return k * k * (3 - 2 * k);
};

/**
 * Exterior cutscene of the ship's cruise to a planet: launch, transit, planet reveal, then the
 * skiff's descent at Kethra or the docking at Vessek. The last shot holds until prepareArrival
 * resolves.
 */
export class CruiseScene implements GameScene {
  readonly kind = 'CruiseScene';
  readonly usesAO = false;
  readonly grade: GradeProfile = { ...GRADES.space, cool: [...GRADES.space.cool], warm: [...GRADES.space.warm] };
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.05, 20000);
  /** Called once the title is shown and the destination level is ready. */
  onArrive: (() => void) | null = null;
  /** Builds the destination level. Called when the title appears, so the slow first build happens
   * during a held shot; the scene waits for the promise before calling onArrive. */
  prepareArrival: (() => Promise<unknown>) | null = null;

  private readonly opts: CruiseOptions;
  private fx = new MotionScope('game');
  private sky!: SpaceSky;
  private sun!: Sun;
  private hull!: ShipHull;
  /** Kethra's arrival only; see updateEntry. */
  private readonly fog = new THREE.FogExp2(0x0a211b, 0);
  private plumes: ReturnType<typeof buildPlume>[] = [];
  private rings: ReturnType<typeof buildShockRing>[] = [];
  private planet!: PlanetInstance;
  private rocks!: THREE.InstancedMesh;
  private streaks = new Streaks();
  private course!: THREE.Line;
  private skiff: Skiff | null = null;
  private clouds: ReturnType<typeof buildCloudLayer> | null = null;
  private canopy: THREE.Group | null = null;
  private anchorage: Anchorage | null = null;
  /** Ship's resting position at Vessek; the Anchorage and planet are placed relative to it. */
  private readonly berth = new THREE.Vector3();
  private readonly speeds: [number, number][];
  private engineLight!: THREE.PointLight;
  private time = 0;
  private skip: HoldToSkip | null = null;
  private dayEl!: HTMLDivElement;
  private titleEl!: HTMLDivElement;
  private titled = false;
  private arrived = false;
  private readonly shipPos = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private sternPath!: CameraPath;
  private sweepPath!: CameraPath;

  constructor(opts: CruiseOptions) {
    this.opts = opts;
    this.speeds = SPEED[opts.destination];
  }

  async init(pacer?: Pacer): Promise<void> {
    this.scene.background = new THREE.Color(0x02030a);
    this.scene.environment = getSharedEnvironment();
    this.scene.environmentIntensity = 0.25;
    this.sky = buildSpaceSky({ seed: 0xc2 });
    this.scene.add(this.sky.group);

    // The sun's light is the key light on the hull.
    this.sun = buildSun({ radius: 90 });
    this.sun.group.position.set(-2600, 260, -1400);
    this.scene.add(this.sun.group, this.sun.light, this.sun.light.target);
    this.scene.add(new THREE.AmbientLight(0x3a4a66, 0.1));

    this.hull = await buildShipHull();
    this.hull.parts.windows.emissive.setHex(0xffb45a);
    this.hull.parts.windows.emissiveIntensity = 0.9;
    this.scene.add(this.hull.group);
    // Warm engine light behind the hull; its intensity follows the drive level.
    this.engineLight = new THREE.PointLight(0xffa25a, 0, 40, 1.6);
    this.hull.group.add(this.engineLight);
    this.engineLight.position.set(-7, 0.4, 0);
    for (const p of this.hull.engineLocalPositions) {
      const plume = buildPlume();
      plume.mesh.position.copy(p);
      this.hull.group.add(plume.mesh);
      this.plumes.push(plume);
      const ring = buildShockRing();
      ring.mesh.position.copy(p).add(new THREE.Vector3(-0.4, 0, 0));
      this.hull.group.add(ring.mesh);
      this.rings.push(ring);
    }

    this.rocks = buildPassingRocks();
    this.scene.add(this.rocks);
    this.scene.add(this.streaks.object);

    const courseGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(3000, 0, 0)]);
    courseGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array([0.85, 0.64, 0.25, 0, 0, 0]), 3));
    this.course = new THREE.Line(courseGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.course.visible = false;
    this.scene.add(this.course);

    const def = PLANETS.find((p) => p.id === this.opts.destination)!;
    this.planet = buildPlanetInstance({ ...def, radius: 170 }, new THREE.Vector3(1e5, 0, 0), this.sun.group.position, this.camera);
    this.scene.add(this.planet.group);
    // The sun's and the planet's maps in hand before the cruise is prepared, rather than decoded and
    // uploaded in a frame of it.
    await Promise.all([planetTexturesReady(), sunMapReady()]);

    if (this.opts.destination === 'kethra') {
      this.scene.fog = this.fog;
      this.skiff = buildSkiff();
      this.skiff.group.visible = false;
      this.scene.add(this.skiff.group);
      this.clouds = buildCloudLayer();
      this.clouds.group.visible = false;
      this.scene.add(this.clouds.group);
      this.canopy = buildCanopyLights();
      this.canopy.visible = false;
      this.scene.add(this.canopy);
    } else {
      this.anchorage = await buildAnchorage(pacer);
      this.berth.set(distanceAt(DOCKED + 1, this.speeds), 0, 0);
      this.anchorage.group.position.copy(this.berth);
      this.scene.add(this.anchorage.group);
    }

    const root = document.getElementById('ui-root')!;
    this.dayEl = document.createElement('div');
    this.dayEl.className = 'cruise-days';
    this.titleEl = document.createElement('div');
    this.titleEl.className = 'cruise-title';
    root.append(this.dayEl, this.titleEl);

    // From the viewport back along the hull to the stern, in ship-relative coordinates.
    this.sternPath = new CameraPath(
      [
        { position: new THREE.Vector3(7.2, 1.5, 3.4), target: new THREE.Vector3(3.2, 0.7, 0), fov: 50 },
        { position: new THREE.Vector3(1.5, 2.2, 6), target: new THREE.Vector3(-1, 0.2, 0), fov: 50 },
        { position: new THREE.Vector3(-13, 2.8, 7.5), target: new THREE.Vector3(-4.8, 0, 0), fov: 50 },
      ],
      { pace: 'keys' },
    );
    // Sweep past the nose toward the planet, in ship-relative coordinates.
    this.sweepPath = new CameraPath(
      [
        { position: new THREE.Vector3(-4, 2.4, 12), target: new THREE.Vector3(2, 0, 0), fov: 50 },
        { position: new THREE.Vector3(9, 1.6, 7), target: new THREE.Vector3(60, 0, 0), fov: 52 },
        { position: new THREE.Vector3(16, 0.9, -2.5), target: new THREE.Vector3(400, -10, 0), fov: 54 },
      ],
      { pace: 'keys' },
    );

    this.update(0);
  }

  /** The timeline starts here, not in init(): the scene is built while the previous one still
   * plays. */
  onEnter(): void {
    UIManager.showLetterbox(true);
    this.skip = new HoldToSkip({ onSkip: () => this.skipToArrival() });
    this.skip.show();
    this.fx.timeline([
      { at: 0.35, run: () => this.ignite(), beat: 'cruise:ignition' },
      { at: BEAT.departure + 0.6, run: () => this.say('cruise.orion.burn', { days: String(this.opts.days) }) },
      { at: BEAT.transit + 5, run: () => this.say('cruise.orion.day3') },
      { at: BEAT.reveal + 1, run: () => AudioSystem.playChime() },
      { at: BEAT.handoff, run: () => this.showTitle(), beat: 'cruise:title' },
    ]);
  }

  private say(key: StringKey, vars?: Record<string, string>): void {
    UIManager.showCaption(t(key, vars), 4200);
  }

  /** Staggered ignition tone per engine; the plumes and rings are driven by time in update(). */
  private ignite(): void {
    this.rings.forEach((_, i) => this.fx.after(i * 0.16, () => AudioSystem.playTone(48 + i * 7, 0.7, 'triangle', 0.08)));
  }

  private showTitle(): void {
    if (this.titled) return;
    this.titled = true;
    const def = PLANETS.find((p) => p.id === this.opts.destination)!;
    const title = this.opts.destination === 'vessek' ? t('cruise.title.vessek') : def.name;
    this.titleEl.classList.add('visible');
    playKineticTitle(this.titleEl, title, 'rgba(92, 209, 176, 0.95)');
    motion.conductor.duck(3);
    AudioSystem.playLevelStart();
    // Hold on the title until the destination level is built.
    const ready = this.prepareArrival?.() ?? Promise.resolve();
    void ready.then(() => this.fx.after(motion.reduced ? 0.3 : 2.4, () => this.finish()));
  }

  private finish(): void {
    if (this.arrived) return;
    this.arrived = true;
    this.skip?.dispose();
    this.skip = null;
    this.onArrive?.();
  }

  private skipToArrival(): void {
    this.skip?.dispose();
    this.skip = null;
    this.time = Math.max(this.time, BEAT.handoff);
    UIManager.clearCaption();
    this.showTitle();
  }

  update(dt: number): void {
    if (!this.arrived) this.time = Math.min(BEAT.end + 60, this.time + dt);
    const time = this.time;
    const S = this.shipPos.set(distanceAt(time, this.speeds), 0, 0);
    this.hull.group.position.copy(S);

    // Drive level: ramps up at ignition, eases down in transit, and fades to zero before docking.
    const coast = this.anchorage ? 1 - smooth(BEAT.reveal, BEAT.entry, time) : 1;
    const drive = time < 0.35 ? 0 : Math.min(1, (time - 0.35) / 0.6) * (1 - 0.35 * smooth(BEAT.transit, BEAT.transit + 4, time)) * coast;
    this.plumes.forEach((p, i) => p.set(time < 0.35 + i * 0.16 ? 0 : drive));
    this.rings.forEach((r, i) => r.set(time - (0.35 + i * 0.16)));
    this.hull.parts.engines.emissiveIntensity = 2.4 * drive;
    this.engineLight.intensity = 26 * drive;

    // During transit the sun rotates around the hull once per in-game day.
    const dayProgress = smooth(BEAT.transit + 0.5, BEAT.reveal - 1, time) * this.opts.days;
    const sunAngle = dayProgress * Math.PI * 2;
    const sunDir = _sunDir.copy(SUN_DIR).applyAxisAngle(_x, sunAngle);
    this.sun.group.position.copy(S).addScaledVector(sunDir, 3000);
    this.sun.light.position.copy(this.sun.group.position);
    this.sun.light.target.position.copy(S);
    this.dayEl.classList.toggle('visible', time > BEAT.transit + 0.5 && time < BEAT.reveal);
    const day = Math.min(this.opts.days, Math.max(1, Math.ceil(dayProgress)));
    const dayText = t('cruise.day', { day: String(day) });
    if (this.dayEl.textContent !== dayText) this.dayEl.textContent = dayText;
    this.course.visible = time > BEAT.transit && time < BEAT.reveal + 2;
    this.course.position.copy(S);
    this.rocks.visible = time < BEAT.transit + 2;

    // The planet follows the ship at a fixed offset so it keeps its size; at Vessek it is fixed
    // relative to the berth instead, so it grows as the ship approaches.
    this.planet.group.position.copy(this.anchorage ? this.berth : S).add(_planetOffset);
    // At Kethra the planet is hidden once the skiff is in the air.
    this.planet.group.visible = time > BEAT.reveal - 0.5 && (time < BEAT.entry + 2 || !this.skiff);
    this.planet.group.rotation.y += dt * 0.01;
    // From the reveal on, the sun sits behind the planet and slightly above so it is backlit. Set
    // before planet.update(), which reads the sun position.
    if (time > BEAT.reveal - 0.5) {
      const behind = _behind.copy(this.planet.group.position).sub(S).normalize().multiplyScalar(2600).add(this.planet.group.position);
      behind.y += 420;
      this.sun.group.position.copy(behind);
      this.sun.light.position.copy(behind);
    }
    this.planet.update(motion.ambientTime, dt);
    const reveal = smooth(BEAT.reveal, BEAT.reveal + 6, time);
    lerpGrade(GRADES.space, this.opts.destination === 'kethra' ? GRADES.kethra : GRADES.vessek, reveal, this.grade);

    this.updateEntry(time, dt);
    this.anchorage?.update(motion.ambientTime);
    this.anchorage?.setDocked(smooth(DOCKED - 0.2, DOCKED + 0.4, time));
    this.updateCamera(time, S);

    const streak = smooth(BEAT.acceleration, BEAT.acceleration + 2, time) * (1 - smooth(BEAT.transit - 1, BEAT.transit + 3, time));
    this.streaks.update(this.camera, _x, streak * 9);
    this.sky.update(this.camera);
    this.sun.update(this.camera, dt);
    // Set the grade only once this scene is current; update() also runs while it preloads.
    const engine = getActiveEngine();
    if (engine?.getCurrentScene() === this) engine.setGrade(this.grade);
  }

  private updateEntry(time: number, dt: number): void {
    if (!this.skiff || !this.clouds || !this.canopy) return;
    const inAir = time >= BEAT.entry + 2;
    this.sky.group.visible = !inAir;
    // The hull's meshes hide but its engine light stays, dark: every lit program is compiled for a
    // fixed number of lights, and fog is always on (at no density until the skiff is in the air), for
    // the same reason. Both used to change here, so the skiff, the clouds and the canopy lights needed
    // programs the preparation hadn't made: ~370 ms of freezes as the skiff dropped in on an Intel UHD
    // laptop.
    for (const part of this.hull.group.children) if (part !== this.engineLight) part.visible = !inAir;
    if (inAir) this.engineLight.intensity = 0;
    this.sun.group.visible = !inAir;
    this.clouds.group.visible = inAir;
    this.canopy.visible = inAir;
    this.fog.density = inAir ? FOG_DENSITY : 0;
    this.scene.background = inAir ? _night : _space;
    // The skiff separates from the hull, then descends through the cloud layer.
    this.skiff.group.visible = time >= BEAT.entry - 0.2;
    if (!inAir) {
      const k = smooth(BEAT.entry - 0.2, BEAT.entry + 2, time);
      this.skiff.group.position.copy(this.shipPos).add(new THREE.Vector3(1.5 + k * 8, -1.3 - k * 6, 0));
      this.skiff.group.rotation.set(0, 0, -0.25 * k);
      this.skiff.heat.uniforms.uHeat.value = 0;
    } else {
      const k = smooth(BEAT.entry + 2, BEAT.handoff + 1.5, time);
      this.skiff.group.position.set(k * 40, THREE.MathUtils.lerp(260, 60, k), 0);
      this.skiff.group.rotation.set(0, 0, THREE.MathUtils.lerp(-0.45, -0.05, k));
      this.skiff.heat.uniforms.uHeat.value = 1 - smooth(BEAT.entry + 2.5, BEAT.handoff - 1, time);
      for (const cl of this.clouds.clouds) {
        cl.position.y += dt * 60 * (1 - k * 0.8);
        if (cl.position.y > this.skiff.group.position.y + 60) cl.position.y -= 240;
      }
      this.clouds.group.position.set(this.skiff.group.position.x, 0, 0);
    }
  }

  private updateCamera(time: number, S: THREE.Vector3): void {
    const cam = this.camera;
    const reduced = motion.reduced;
    if (time < BEAT.departure) {
      this.sternPath.apply(cam, reduced ? 1 : time / BEAT.departure);
      cam.position.add(S);
      this.sternPath.targetAt(reduced ? 1 : time / BEAT.departure, this.look).add(S);
      cam.lookAt(this.look);
    } else if (time < BEAT.acceleration) {
      // Fixed camera that pans to follow the ship.
      cam.position.set(18, 6, 64);
      this.look.set(0, 0, 0).lerp(S, smooth(BEAT.departure + 1.5, BEAT.acceleration, time));
      cam.lookAt(this.look);
      this.setFov(46);
    } else if (time < BEAT.transit) {
      // Chase camera behind and above; the FOV widens with speed.
      const k = smooth(BEAT.acceleration, BEAT.transit, time);
      cam.position.copy(S).add(new THREE.Vector3(THREE.MathUtils.lerp(-26, -19, k), THREE.MathUtils.lerp(7, 4.5, k), 3));
      cam.lookAt(this.look.copy(S).add(new THREE.Vector3(25, 0, 0)));
      this.setFov(reduced ? 62 : THREE.MathUtils.lerp(50, 62, k));
    } else if (time < BEAT.reveal) {
      // Slow orbit around the ship that eases to a stop.
      const k = reduced ? 1 : ease.decelerate(THREE.MathUtils.clamp((time - BEAT.transit) / 8, 0, 1));
      const a = THREE.MathUtils.lerp(-2.2, -0.6, k);
      cam.position.copy(S).add(new THREE.Vector3(Math.cos(a) * 17, 3.2, Math.sin(a) * 17));
      cam.lookAt(this.look.copy(S));
      this.setFov(50);
    } else if (time < BEAT.entry + 2) {
      const k = reduced ? 1 : THREE.MathUtils.clamp((time - BEAT.reveal) / (BEAT.entry + 2 - BEAT.reveal), 0, 1);
      this.sweepPath.apply(cam, k);
      cam.position.add(S);
      this.sweepPath.targetAt(k, this.look).add(S);
      cam.lookAt(this.look);
    } else if (this.skiff) {
      // Follow the skiff from behind and above as it descends.
      const k = smooth(BEAT.entry + 2, BEAT.handoff + 2, time);
      const sk = this.skiff.group.position;
      cam.position.copy(sk).add(new THREE.Vector3(THREE.MathUtils.lerp(-7, -9, k), THREE.MathUtils.lerp(3, 4.5, k), 1.5));
      cam.lookAt(this.look.copy(sk).add(new THREE.Vector3(8, -4 - k * 6, 0)));
      this.setFov(52);
    } else if (this.anchorage) {
      // Docking camera behind and above the ship, settling on the berth; reduced motion holds the
      // start position.
      const k = reduced ? 0 : smooth(BEAT.entry + 2, DOCKED + 0.6, time);
      const settle = reduced ? 1 : smooth(BEAT.entry + 3, DOCKED, time);
      cam.position.copy(_dockCamFrom).lerp(_dockCamTo, k).add(this.berth);
      this.look.copy(S).add(_dockLead).lerp(_dockAt.copy(_dockLook).add(this.berth), settle);
      cam.lookAt(this.look);
      this.setFov(48);
    }
  }

  private setFov(fov: number): void {
    if (Math.abs(this.camera.fov - fov) < 0.01) return;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  onResize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.fx.dispose();
    this.skip?.dispose();
    this.dayEl.remove();
    this.titleEl.remove();
    UIManager.showLetterbox(false);
    UIManager.clearCaption();
    // The hull shares the cached template's geometry, so it is removed before disposal; only the
    // plumes and rings added here are disposed.
    for (const part of [...this.plumes, ...this.rings]) {
      part.mesh.geometry.dispose();
      (part.mesh.material as THREE.Material).dispose();
    }
    this.scene.remove(this.hull.group);
    disposeSceneFully(this.scene);
  }
}

const _x = new THREE.Vector3(1, 0, 0);
const SUN_DIR = new THREE.Vector3(-0.85, 0.25, -0.45).normalize();
const _sunDir = new THREE.Vector3();
const _behind = new THREE.Vector3();
const _planetOffset = new THREE.Vector3(520, -40, 30);
const _space = new THREE.Color(0x02030a);
const _night = new THREE.Color(0x061612);
/** The haze under Kethra's cloud layer. */
const FOG_DENSITY = 0.0035;
// The docking shot, relative to the berth.
const _dockCamFrom = new THREE.Vector3(-48, 5, 9);
const _dockCamTo = new THREE.Vector3(-16, 4.4, 7.5);
const _dockLead = new THREE.Vector3(6, 0, 0);
const _dockLook = new THREE.Vector3(7, 0.5, -1.5);
const _dockAt = new THREE.Vector3();
