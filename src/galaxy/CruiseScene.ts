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
import { buildPlanetInstance, type PlanetInstance } from './planetShader';
import { buildSpaceSky } from './spaceSky';
import type { SpaceSky } from './spaceSky';
import { buildSun } from './sun';
import type { Sun } from './sun';
import { buildCanopyLights, buildCloudLayer, buildPassingRocks, buildPlume, buildShockRing, Streaks } from './cruise/pieces';
import { buildSkiff } from './skiff';
import type { Skiff } from './skiff';

export interface CruiseOptions {
  destination: 'kethra' | 'vessek';
  /** The plot's figures (GameState.course), which the day counter and ORION quote. */
  days: number;
  cells: number;
}

/** When each beat starts, in seconds of the cruise (docs/DESIGN.md §5). */
const BEAT = {
  /** First light's beat 4: out through the viewport to the stern as the plumes bloom. */
  stern: 0,
  /** Beat 5 and the cruise's departure: a locked-off wide from the belt side. */
  departure: 3.5,
  acceleration: 10,
  transit: 16,
  reveal: 28,
  entry: 36,
  handoff: 44,
  end: 49,
} as const;

/** The Wren's speed along its line (units per second) at key times: at rest, the burn, the cruise. */
const SPEED: [number, number][] = [
  [0, 0],
  [0.8, 0],
  [BEAT.acceleration, 9],
  [BEAT.transit, 70],
  [BEAT.reveal, 70],
  [BEAT.entry, 25],
];

function speedAt(time: number): number {
  for (let i = 1; i < SPEED.length; i++) {
    const [t1, v1] = SPEED[i];
    const [t0, v0] = SPEED[i - 1];
    if (time <= t1) return v0 + ((v1 - v0) * (time - t0)) / (t1 - t0);
  }
  return SPEED[SPEED.length - 1][1];
}

/** Distance along the line at `time`: the speed curve integrated, so a skip lands in the right place. */
function distanceAt(time: number): number {
  let x = 0;
  const step = 1 / 30;
  for (let s = 0; s < time; s += step) x += speedAt(s + step / 2) * Math.min(step, time - s);
  return x;
}

const smooth = (a: number, b: number, x: number) => {
  const k = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return k * k * (3 - 2 * k);
};

/**
 * First light's exterior and the cruise to a planet (docs/DESIGN.md §5): the plumes bloom, the Wren
 * leaves the belt, the days pass as the sun turns around the hull, the destination's night side
 * fills the frame, and for Kethra the skiff drops through the cloud to the canopy. The level it
 * arrives at builds underneath (the flow passes `arrival`); if it isn't ready when the title is up,
 * the last shot holds until it is.
 */
export class CruiseScene implements GameScene {
  readonly kind = 'CruiseScene';
  readonly usesAO = false;
  readonly grade: GradeProfile = { ...GRADES.space, cool: [...GRADES.space.cool], warm: [...GRADES.space.warm] };
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.05, 20000);
  /** Called once the title is up and the level underneath is ready: the flow cuts to it. */
  onArrive: (() => void) | null = null;
  /** Starts building the destination; called when the title goes up, so its long first build
   * lands on a held shot rather than mid-flight. The last beat holds until it settles. */
  prepareArrival: (() => Promise<unknown>) | null = null;

  private readonly opts: CruiseOptions;
  private fx = new MotionScope('game');
  private sky!: SpaceSky;
  private sun!: Sun;
  private hull!: ShipHull;
  private plumes: ReturnType<typeof buildPlume>[] = [];
  private rings: ReturnType<typeof buildShockRing>[] = [];
  private planet!: PlanetInstance;
  private rocks!: THREE.InstancedMesh;
  private streaks = new Streaks();
  private course!: THREE.Line;
  private skiff: Skiff | null = null;
  private clouds: ReturnType<typeof buildCloudLayer> | null = null;
  private canopy: THREE.Group | null = null;
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
  }

  async init(): Promise<void> {
    this.scene.background = new THREE.Color(0x02030a);
    this.scene.environment = getSharedEnvironment();
    this.scene.environmentIntensity = 0.25;
    this.sky = buildSpaceSky({ seed: 0xc2 });
    this.scene.add(this.sky.group);

    // The sun: huge and dim behind the belt's haze at the start; its light is the key on the hull.
    this.sun = buildSun({ radius: 90 });
    this.sun.group.position.set(-2600, 260, -1400);
    this.scene.add(this.sun.group, this.sun.light, this.sun.light.target);
    this.scene.add(new THREE.AmbientLight(0x3a4a66, 0.1));

    this.hull = await buildShipHull();
    this.hull.parts.windows.emissive.setHex(0xffb45a);
    this.hull.parts.windows.emissiveIntensity = 0.9;
    this.scene.add(this.hull.group);
    // The hull lit by its own engines for the first time: a warm key from behind.
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

    // MG1's course, running ahead of the ship: the shared element from the desk chart.
    const courseGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(3000, 0, 0)]);
    courseGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array([0.85, 0.64, 0.25, 0, 0, 0]), 3));
    this.course = new THREE.Line(courseGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.course.visible = false;
    this.scene.add(this.course);

    const def = PLANETS.find((p) => p.id === this.opts.destination)!;
    this.planet = buildPlanetInstance({ ...def, radius: 170 }, new THREE.Vector3(1e5, 0, 0), this.sun.group.position, this.camera);
    this.scene.add(this.planet.group);

    if (this.opts.destination === 'kethra') {
      this.skiff = buildSkiff();
      this.skiff.group.visible = false;
      this.scene.add(this.skiff.group);
      this.clouds = buildCloudLayer();
      this.clouds.group.visible = false;
      this.scene.add(this.clouds.group);
      this.canopy = buildCanopyLights();
      this.canopy.visible = false;
      this.scene.add(this.canopy);
    }

    const root = document.getElementById('ui-root')!;
    this.dayEl = document.createElement('div');
    this.dayEl.className = 'cruise-days';
    this.titleEl = document.createElement('div');
    this.titleEl.className = 'cruise-title';
    root.append(this.dayEl, this.titleEl);

    // Out through the viewport and back along the hull to the stern (ship-relative).
    this.sternPath = new CameraPath(
      [
        { position: new THREE.Vector3(7.2, 1.5, 3.4), target: new THREE.Vector3(3.2, 0.7, 0), fov: 50 },
        { position: new THREE.Vector3(1.5, 2.2, 6), target: new THREE.Vector3(-1, 0.2, 0), fov: 50 },
        { position: new THREE.Vector3(-13, 2.8, 7.5), target: new THREE.Vector3(-4.8, 0, 0), fov: 50 },
      ],
      { pace: 'keys' },
    );
    // Past the nose to the planet ahead (ship-relative; the planet is placed on the line).
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

  /** The cruise starts when it is on screen: it is prepared while First light is still playing. */
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

  /** The four pods light in turn, each with its shockwave: force, not flash. */
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
    // The last beat holds until the level underneath is ready; then the flow cuts to it.
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

  /** Hold-to-skip: straight to the arrival beat, never to black. */
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
    const S = this.shipPos.set(distanceAt(time), 0, 0);
    this.hull.group.position.copy(S);

    // The drive: four plumes bloom at ignition and settle to the cruise.
    const drive = time < 0.35 ? 0 : Math.min(1, (time - 0.35) / 0.6) * (1 - 0.35 * smooth(BEAT.transit, BEAT.transit + 4, time));
    this.plumes.forEach((p, i) => p.set(time < 0.35 + i * 0.16 ? 0 : drive));
    this.rings.forEach((r, i) => r.set(time - (0.35 + i * 0.16)));
    this.hull.parts.engines.emissiveIntensity = 2.4 * drive;
    this.engineLight.intensity = 26 * drive;

    // The sun's light turns around the hull once a day through the transit: that is how days read.
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

    // The destination waits on the line ahead, out of sight until the sweep turns to it: six days
    // out it would be a point, and the reveal is its first look.
    this.planet.group.position.copy(S).add(_planetOffset);
    // Kethra gives way to the skiff's entry; Vessek holds the frame until the title (its docking is M5).
    this.planet.group.visible = time > BEAT.reveal - 0.5 && (time < BEAT.entry + 2 || !this.skiff);
    this.planet.group.rotation.y += dt * 0.01;
    // For the reveal the sun sits straight behind the planet from where the sweep starts, a little
    // high: a black disc whose rim lights, and a terminator that crawls as the camera moves. Placed
    // before the planet reads it.
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
    this.updateCamera(time, S);

    // Stars stretch with speed during the climb, then relax into the cruise.
    const streak = smooth(BEAT.acceleration, BEAT.acceleration + 2, time) * (1 - smooth(BEAT.transit - 1, BEAT.transit + 3, time));
    this.streaks.update(this.camera, _x, streak * 9);
    this.sky.update(this.camera);
    this.sun.update(this.camera, dt);
    // Only once current: while it is being prepared behind the Wren, the Wren's grade stands.
    const engine = getActiveEngine();
    if (engine?.getCurrentScene() === this) engine.setGrade(this.grade);
  }

  private updateEntry(time: number, dt: number): void {
    if (!this.skiff || !this.clouds || !this.canopy) return;
    const inAir = time >= BEAT.entry + 2;
    // Space is left behind for the last two beats: a new sky, the cloud deck, the canopy.
    this.sky.group.visible = !inAir;
    this.rocks.visible = !inAir && time < BEAT.transit + 2;
    this.hull.group.visible = !inAir;
    this.sun.group.visible = !inAir;
    this.clouds.group.visible = inAir;
    this.canopy.visible = inAir;
    this.scene.fog = inAir ? _fog : null;
    this.scene.background = inAir ? _night : _space;
    // The skiff: separates from the belly, then drops through the cloud to hang above the canopy.
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
      // Clouds rush up past the skiff as it drops through them.
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
      // Locked off from the belt side; the camera holds, then turns to follow the ship out.
      cam.position.set(18, 6, 64);
      this.look.set(0, 0, 0).lerp(S, smooth(BEAT.departure + 1.5, BEAT.acceleration, time));
      cam.lookAt(this.look);
      this.setFov(46);
    } else if (time < BEAT.transit) {
      // Chase: behind and above, the field of view opening with the speed (a cut under reduced motion).
      const k = smooth(BEAT.acceleration, BEAT.transit, time);
      cam.position.copy(S).add(new THREE.Vector3(THREE.MathUtils.lerp(-26, -19, k), THREE.MathUtils.lerp(7, 4.5, k), 3));
      cam.lookAt(this.look.copy(S).add(new THREE.Vector3(25, 0, 0)));
      this.setFov(reduced ? 62 : THREE.MathUtils.lerp(50, 62, k));
    } else if (time < BEAT.reveal) {
      // A slow orbit round the ship, then stillness: time passing.
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
      // Behind and above the skiff through the cloud, settling over the canopy for the handoff.
      const k = smooth(BEAT.entry + 2, BEAT.handoff + 2, time);
      const sk = this.skiff.group.position;
      cam.position.copy(sk).add(new THREE.Vector3(THREE.MathUtils.lerp(-7, -9, k), THREE.MathUtils.lerp(3, 4.5, k), 1.5));
      cam.lookAt(this.look.copy(sk).add(new THREE.Vector3(8, -4 - k * 6, 0)));
      this.setFov(52);
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
    // The hull's geometry is the cached template's; what this scene hung on it is its own.
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
const _fog = new THREE.FogExp2(0x0a211b, 0.0035);
