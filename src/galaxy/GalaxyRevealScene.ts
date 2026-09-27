import * as THREE from 'three';
import type { GameScene } from '../core/Engine';
import { CameraPath, MotionScope, ease, motion } from '../motion';
import { disposeSceneFully } from '../core/disposeSceneTextures';
import { UIManager } from '../ui/UIManager';
import { HoldToSkip } from '../ui/HoldToSkip';
import { getSharedEnvironment } from '../core/Environment';
import { getActiveEngine } from '../core/EngineRegistry';
import { AudioSystem } from '../audio/AudioSystem';
import { gameState } from '../core/GameState';
import { t } from '../content/strings';
import { PLANETS } from './planetData';
import { buildShipHull } from './shipHull';
import { buildPlanetInstance, type PlanetInstance } from './planetShader';
import { buildSpaceSky } from './spaceSky';
import type { SpaceSky } from './spaceSky';
import { buildSun } from './sun';
import type { Sun } from './sun';
import { GRADES } from '../core/GradeGlowPass';
import * as sim from './intercept/sim';
import { INK, eclipticGrid, orbitLoop, revealHairline, toV3 } from './intercept/instrument';
import type { Reveal } from './intercept/instrument';
import { buildBelt, buildBuoy, buildDrift } from './intercept/props';
import type { Belt } from './intercept/props';
import { InterceptGame, LEG1_FOCUS, LEG1_VIEW, orbitPosition } from './intercept/InterceptGame';
import type { InterceptResult } from './intercept/InterceptGame';

/** The Wren's length in plot units: a few pixels in the plot, a hero up close. */
const WREN_LENGTH = 0.5;
/** Planets are drawn larger than life at plot scale, or they'd be single pixels. */
const PLANET_SCALE = 0.33;
/** The ping's shell: how far it reaches and how long it takes. */
const PING_REACH = 150;
const PING_SECONDS = 5.2;

/**
 * The reveal, rebuilt as MG1's opening (docs/DESIGN.md §1): the scanner's ping resolves the
 * system in 3D around the Wren, and the shot it ends on is the navigation plot MG1 is played in.
 * One scene, no cut. The system is at plot scale (1 unit = 1 Mkm, src/galaxy/intercept/sim.ts),
 * so what the player sees during the reveal is exactly what they plot against afterwards.
 */
export class GalaxyRevealScene implements GameScene {
  /** Stable identity for the harnesses in tools/ (constructor names are mangled in production). */
  readonly kind = 'GalaxyRevealScene';
  readonly usesAO = false;
  readonly grade = GRADES.space;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.002, 3000);
  /** MG1, once the reveal hands over; public for the tools. */
  intercept: InterceptGame | null = null;
  onPlotted: ((result: InterceptResult) => void) | null = null;

  private fx = new MotionScope('game');
  private sky!: SpaceSky;
  private sun!: Sun;
  private ship!: THREE.Group;
  private kethra!: PlanetInstance;
  private planets: PlanetInstance[] = [];
  private belt!: Belt;
  private drift!: ReturnType<typeof buildDrift>;
  private buoy!: ReturnType<typeof buildBuoy>;
  private shell!: THREE.Mesh;
  private readonly reveal: Reveal = { uOrigin: { value: toV3(sim.WREN_START) }, uRadius: { value: 0 } };
  /** Bodies the ping resolves as its shell passes them: they grow in from nothing. */
  private resolving: { obj: THREE.Object3D; at: number; scale: number }[] = [];
  private readonly lookTarget = new THREE.Vector3();
  private skip: HoldToSkip | null = null;
  private elapsed = 0;

  async init(): Promise<void> {
    UIManager.setLookPromptEnabled(false);
    this.scene.background = new THREE.Color(0x02030a);
    this.scene.environment = getSharedEnvironment();
    // Enough for the hull's metals to have something to reflect, low enough to stay vacuum-dark.
    this.scene.environmentIntensity = 0.25;

    this.sky = buildSpaceSky();
    this.scene.add(this.sky.group);

    this.sun = buildSun({ radius: 1.7 });
    this.scene.add(this.sun.group);
    // The key: the sun's light on the Wren. A faint cool bounce is the only fill (DESIGN §2).
    const wren = toV3(sim.WREN_START);
    this.sun.light.position.set(0, 0, 0);
    this.sun.light.target.position.copy(wren);
    this.scene.add(this.sun.light, this.sun.light.target, new THREE.AmbientLight(0x3a4a66, 0.12));

    const hull = await buildShipHull();
    this.ship = hull.group;
    // Emergency power since the white sky: the ports glow the ship's own amber, low.
    hull.parts.windows.emissive.setHex(0xffb45a);
    hull.parts.windows.emissiveIntensity = 0.55;
    const size = new THREE.Box3().setFromObject(this.ship).getSize(new THREE.Vector3());
    this.ship.scale.setScalar(WREN_LENGTH / Math.max(size.x, size.z));
    this.ship.position.copy(wren);
    // Nose (+X) along the first burn's rough heading, so the hero pass sees it underway-ready.
    this.ship.rotation.y = -0.2;
    this.scene.add(this.ship);

    this.drift = buildDrift(sim.WREN_START);
    this.scene.add(this.drift.group);
    this.buoy = buildBuoy(sim.BUOY);
    this.scene.add(this.buoy.group);
    this.resolving.push({ obj: this.buoy.group, at: sim.dist(sim.WREN_START, sim.BUOY), scale: 1 });

    this.belt = buildBelt(sim.beltWall());
    this.scene.add(this.belt.group);
    this.belt.setResolved(0);

    // The instrument's fixed lines, resolved by the ping: the ecliptic grid and every orbit.
    const lineMat = revealHairline(this.reveal);
    this.scene.add(eclipticGrid(80, lineMat));
    this.scene.add(orbitLoop(sim.KETHRA, INK.grove, 0.35, lineMat));

    for (const def of PLANETS) {
      const isKethra = def.id === 'kethra';
      const orbit: sim.Orbit = isKethra ? sim.KETHRA : { radius: def.orbitRadius, inclination: 0.02, node: 0, phase: def.orbitAngle, rate: 0.03 };
      const at = toV3(sim.orbitAt(orbit, 0));
      const planet = buildPlanetInstance({ ...def, radius: def.radius * PLANET_SCALE }, at, this.sun.group.position, this.camera);
      this.scene.add(planet.group);
      this.planets.push(planet);
      if (isKethra) this.kethra = planet;
      else this.scene.add(orbitLoop(orbit, INK.steel, 0.3, lineMat));
      this.resolving.push({ obj: planet.group, at: at.distanceTo(wren), scale: 1 });
      planet.group.scale.setScalar(0.001);
    }
    for (const r of this.resolving) r.obj.scale.setScalar(0.001);

    // The ping itself: a thin shell of the Wren's light, brightest at its rim.
    this.shell = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1, 5),
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(0xffd9a0) }, uFade: { value: 0 } },
        vertexShader: /* glsl */ `
          varying float vRim;
          void main() {
            vec4 w = modelMatrix * vec4(position, 1.0);
            vRim = 1.0 - abs(dot(normalize(mat3(modelMatrix) * normal), normalize(cameraPosition - w.xyz)));
            gl_Position = projectionMatrix * viewMatrix * w;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          uniform float uFade;
          varying float vRim;
          void main() { gl_FragColor = vec4(uColor * pow(vRim, 9.0) * 1.6 * uFade, 1.0); }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.shell.position.copy(wren);
    this.shell.visible = false;
    this.scene.add(this.shell);

    this.kethra.group.position.copy(toV3(sim.orbitAt(sim.KETHRA, 0)));
    this.playReveal();
  }

  private playReveal(): void {
    UIManager.showLetterbox(true);
    const W = toV3(sim.WREN_START);
    const B = toV3(sim.BUOY);
    const mid = W.clone().lerp(B, LEG1_FOCUS);
    // MG1's first view: the same orbit framing the game opens leg 1 with.
    const end = orbitPosition(mid, LEG1_VIEW);
    // The wide the ping resolves: the whole approach, sun to Kethra's orbit.
    const wideTarget = new THREE.Vector3(24, 0, 24);
    const wide = orbitPosition(wideTarget, { yaw: 0.55, pitch: 0.66, dist: 125 });
    const path = new CameraPath([
      // Close on the hull's sunlit flank (the sun is at the origin, toward -X).
      { position: W.clone().add(new THREE.Vector3(-0.42, 0.1, 0.34)), target: W.clone().add(new THREE.Vector3(0.05, 0, 0)), fov: 42 },
      { position: W.clone().add(new THREE.Vector3(-1.6, 0.7, 2.2)), target: W.clone(), fov: 45 },
      { position: wide, target: wideTarget, fov: 50 },
      { position: end, target: mid, fov: 50 },
    ], { pace: 'keys' });
    const MOVE = 11;
    const move = this.fx.tween({
      duration: motion.reduced ? 0.01 : MOVE,
      ease: ease.standard,
      update: (e) => {
        path.apply(this.camera, e);
        path.targetAt(e, this.lookTarget);
      },
    });
    const ping = () => {
      this.shell.visible = true;
      AudioSystem.playTone(880, 1.6, 'sine', 0.05);
      this.fx.tween({
        duration: motion.reduced ? 0.2 : PING_SECONDS,
        // Constant speed, like light: the shell's band sweeps the grid visibly from the wide.
        ease: (k) => k,
        update: (k) => this.setPing(k),
      });
    };
    const beats = this.fx.timeline([
      { at: 1.2, run: () => UIManager.showCaption(t('reveal.caption.stranded'), 4200) },
      { at: 5.0, run: ping, beat: 'reveal:ping' },
      { at: 6.6, run: () => UIManager.showCaption(t('reveal.caption.truth'), 4200) },
      { at: MOVE + 0.2, state: true, run: () => this.beginPlot() },
    ]);
    // Hold to skip lands on the plot, fully resolved: skipping cuts to the arrival state.
    this.skip = new HoldToSkip({
      onSkip: () => {
        move.finish();
        this.setPing(1);
        beats.skip();
      },
    });
    this.skip.show();
  }

  /** The ping at `k` of its reach: the shell grows and fades, and what it passes resolves. */
  private setPing(k: number): void {
    const r = PING_REACH * k;
    this.reveal.uRadius.value = k >= 1 ? 1e5 : r;
    this.shell.scale.setScalar(Math.max(0.01, r));
    (this.shell.material as THREE.ShaderMaterial).uniforms.uFade.value = (1 - k) * Math.min(1, k * 8);
    this.shell.visible = k < 1;
    for (const item of this.resolving) {
      const grow = THREE.MathUtils.clamp((r - item.at) / 6, 0, 1);
      item.obj.scale.setScalar(Math.max(0.001, ease.decelerate(grow) * item.scale));
    }
  }

  private beginPlot(): void {
    this.skip?.dispose();
    this.skip = null;
    UIManager.clearCaption();
    UIManager.showLetterbox(false);
    const engine = getActiveEngine();
    const a = gameState.data.attributes;
    this.intercept = new InterceptGame({
      scene: this.scene,
      camera: this.camera,
      wren: this.ship,
      kethra: this.kethra.group,
      belt: this.belt,
      surface: engine?.renderer.domElement ?? document.body,
      stats: { insight: a.insight, perception: a.perception, engineering: a.engineering },
    });
    this.intercept.onComplete = (result) => this.onPlotted?.(result);
    this.intercept.start(this.camera.position.clone(), this.lookTarget.clone());
  }

  update(dt: number, elapsed: number): void {
    this.elapsed = elapsed;
    this.sky.update(this.camera);
    this.sun.update(this.camera, dt);
    const ambientDt = dt * motion.ambient;
    for (const planet of this.planets) {
      planet.group.rotation.y += ambientDt * 0.05;
      planet.update(motion.ambientTime, ambientDt);
    }
    this.drift.update(ambientDt);
    this.buoy.update(this.elapsed);
    this.intercept?.update(dt);
    // The near plane follows the shot, from a hull a metre away to a system 100 Mkm across.
    const focus = this.intercept?.focus ?? this.lookTarget;
    const near = THREE.MathUtils.clamp(this.camera.position.distanceTo(focus) * 0.004, 0.002, 0.5);
    if (Math.abs(near - this.camera.near) / this.camera.near > 0.1) {
      this.camera.near = near;
      this.camera.updateProjectionMatrix();
    }
  }

  onResize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.fx.dispose();
    this.skip?.dispose();
    this.intercept?.dispose();
    UIManager.showLetterbox(false);
    UIManager.clearCaption();
    // This scene owns everything it loaded: free it all. The hull is the exception: its clones
    // share the cached template's geometry.
    this.scene.remove(this.ship);
    disposeSceneFully(this.scene);
  }
}
