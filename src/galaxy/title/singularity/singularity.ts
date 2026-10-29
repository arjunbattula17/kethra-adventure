import * as THREE from 'three';
import { GRADES, lerpGrade } from '../../../core/GradeGlowPass';
import type { GradeProfile } from '../../../core/GradeGlowPass';
import { LensPass } from './lensPass';
import { createGravityWell } from './gravityWell';
import type { GravityWell } from './gravityWell';
import { buildEmbers } from './embers';
import type { Embers } from './embers';
import { TIMELINE, clamp01, range, smooth } from './timeline';
import type { Cue, SingularityFrame } from './timeline';

export { TIMELINE };
export type { Cue, SingularityFrame };

export interface SingularityHooks {
  setScreenEffect(pass: LensPass | null): void;
  setGrade(profile: GradeProfile): void;
  onFrame?(frame: SingularityFrame): void;
  onCue?(cue: Cue): void;
}

export interface SingularityOptions {
  /** The hole's place and the disk's axis, in world space. */
  centre: THREE.Vector3;
  axis: THREE.Vector3;
  lowTier: boolean;
}

const easeOutBack = (x: number) => {
  const c = 1.9;
  const k = clamp01(x) - 1;
  return 1 + (c + 1) * k * k * k + c * k * k;
};
const X_AXIS = new THREE.Vector3(1, 0, 0);

/** Where the silence waits for the lens program, and for how long at most (seconds). */
const HOLD_AT = 0.3;
const HOLD_MAX = 3;
const LINK_SETTLE = 0.35;

/** Under reduced motion the event is shorter and still: no shake, no swirl, no shockwave, no camera move. */
const GENTLE_SPEED = 1.8;

/**
 * New game's way out of the title: a black hole is born in the sky over Kethra and eats the picture,
 * the menu with it, and the game starts in the dark it leaves.
 *
 * One clock (seconds since the click, TIMELINE) drives everything: the lens pass (lensPass.ts), the
 * gravity well bent into the scene's own shaders (gravityWell.ts), the sparks it feeds on (embers.ts),
 * the camera, the ship, the grade, and, through the per-frame report and the cues, the menu being torn
 * off the screen (ui/titleDevour.ts) and the sound (audio/singularitySound.ts). Nothing is
 * scheduled on wall-clock timers, so a slow frame slows the whole event together and nothing drifts
 * out of step.
 *
 * The beats:
 *  - hush (0): the music stops dead; the clicked button flashes. Nothing else, on purpose.
 *  - warn: the corner readouts lose the signal. A shimmer gathers over the sky by the sun.
 *  - implode: light from the whole frame converges on that point.
 *  - birth: the hole opens with a flash; a shockwave refracts across the screen and jolts the menu.
 *  - feed: the disk ignites and spins up, Kethra's limb, the sun and the stars bend into an Einstein
 *    ring, rocks, dust and sparks wind into it, the menu is pulled apart piece by piece. The ship lights
 *    its engines and turns to run, holds, loses, and is torn apart.
 *  - capture: the camera is turned to face the hole, the shaking grows.
 *  - plunge: it falls in; the field of view opens as it goes (a dolly zoom), the light blue-shifts.
 *  - horizon: black. The last sound cuts. A moment of silence, then the game.
 */
export class Singularity {
  readonly lens = new LensPass();
  readonly well: GravityWell = createGravityWell();
  /** The ship's own well: it holds out against the pull until its engines fail. */
  readonly shipWell: GravityWell = createGravityWell();
  readonly embers: Embers;

  active = false;
  /** Seconds since the click, on the event's own clock. */
  t = 0;
  private speed = 1;
  private gentle = false;
  private hooks: SingularityHooks | null = null;
  private resolveDone: (() => void) | null = null;
  private cuesFired = new Set<Cue>();

  private centre: THREE.Vector3;
  private axis: THREE.Vector3;
  private diskX = new THREE.Vector3();
  private diskZ = new THREE.Vector3();
  private lowTier: boolean;

  private grade: GradeProfile = { ...GRADES.title, cool: [...GRADES.title.cool], warm: [...GRADES.title.warm] };
  private gradeHot: GradeProfile = { exposure: 0.86, knee: 0.66, shoulder: 0.85, gamma: 1.06, toe: 0, cool: [0.86, 0.93, 1.12], warm: [1.22, 0.96, 0.78], vignette: 0.52 };

  // Accumulators.
  private diskTime = 0;
  private swirlPhase = 0;
  private shipSwirl = 0;

  // The values this frame (advance), read by the camera, the ship and the uniforms.
  private rs = 0;
  private shake = new THREE.Vector2();
  private shakeAmp = 0;
  private lookBlend = 0;
  private fall = 0;
  private fovExtra = 0;
  private roll = 0;
  private eat = 0;
  private shockR = -1;
  private shockA = 0;
  private pull = 0;

  // The ship's run.
  private shipStart: { p: THREE.Vector3; q: THREE.Quaternion; away: THREE.Quaternion; awayDir: THREE.Vector3 } | null = null;
  private tumbleAxis = new THREE.Vector3(0.3, 0.8, -0.5).normalize();

  // Scratch.
  private v3 = new THREE.Vector3();
  private v3b = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private q2 = new THREE.Quaternion();
  private m3 = new THREE.Matrix3();
  private holeView = new THREE.Vector3();
  private frameOut: SingularityFrame = { t: 0, x: 0, y: 0, horizon: 0, shockRadius: 0, shockAmp: 0, shakeX: 0, shakeY: 0, pull: 0, eat: 0 };

  constructor(o: SingularityOptions) {
    this.centre = o.centre.clone();
    this.axis = o.axis.clone().normalize();
    this.lowTier = o.lowTier;
    // An in-plane basis (only the disk's texture turns with it).
    this.diskX.crossVectors(this.axis, new THREE.Vector3(0, 0, 1)).normalize();
    if (this.diskX.lengthSq() < 0.5) this.diskX.set(1, 0, 0);
    this.diskZ.crossVectors(this.diskX, this.axis).normalize();
    for (const w of [this.well, this.shipWell]) {
      w.uniforms.uWellPos.value.copy(this.centre);
      w.uniforms.uWellAxis.value.copy(this.axis);
      w.uniforms.uWell.value.set(0, 0, 0, 6);
    }
    this.embers = buildEmbers(this.centre, this.axis, o.lowTier ? 900 : 1600);
    this.lens.uniforms.uSteps.value = o.lowTier ? 64 : 90;
  }

  /**
   * Bends the scene's shaders (the ship's with its own well). Called at the end of the backdrop's init,
   * so the bent programs are the ones the engine compiles while it prepares.
   */
  prepare(world: THREE.Object3D[], ship: THREE.Object3D): void {
    for (const root of world) this.well.patch(root);
    this.well.patch(this.embers.points);
    this.shipWell.patch(ship);
  }

  /** Whether the lens program is linked; until then the event holds in its silence (advance). */
  private lensReady = false;
  private linking: Promise<void> | null = null;

  /**
   * Links the lens program off the page's thread ahead of the click (TitleScreen calls this once the
   * title has settled and the browser is idle). Linking takes ~0.7 s on an Intel UHD laptop; done at the
   * click it lengthened the silence by that much. Its first draw (~0.4 s of the driver's own work) is
   * still left for the silence: drawn while the title idles it would stop the picture.
   */
  prelink(renderer: THREE.WebGLRenderer): void {
    if (this.linking) return;
    // Drawn at once after its link completes, a big program can block the GPU thread on Direct3D (the
    // cinematic title notes): it is first drawn LINK_SETTLE seconds after at the earliest.
    const settle = () => new Promise<void>((resolve) => window.setTimeout(resolve, LINK_SETTLE * 1000));
    this.linking = this.lens.compile(renderer).then(settle, settle);
  }
  /** Seconds spent holding for it. */
  private held = 0;

  /**
   * Starts the event; resolves at its end, on black. The lens program is not linked while the backdrop
   * prepares (that held its first frame back by 0.7-1 s on an Intel UHD laptop) but once the title has
   * settled (prelink), or at the latest now, and the silence waits for it.
   */
  start(hooks: SingularityHooks, renderer: THREE.WebGLRenderer, gentle: boolean): Promise<void> {
    this.hooks = hooks;
    this.gentle = gentle;
    this.speed = gentle ? GENTLE_SPEED : 1;
    this.active = true;
    this.t = 0;
    this.lens.enabled = false;
    hooks.setScreenEffect(this.lens);
    this.prelink(renderer);
    void this.linking!.then(() => (this.lensReady = true));
    return new Promise((resolve) => (this.resolveDone = resolve));
  }

  /** Any key or click once the hole is open: the rest plays out three times as fast. */
  hurry(): void {
    if (this.active && this.t > TIMELINE.birth + 0.3) this.speed = Math.max(this.speed, 3);
  }

  /** Advances the clock and works out this frame's values. */
  advance(dt: number): void {
    if (!this.active) return;
    // The silence lasts until the lens is linked (at most HOLD_MAX seconds; after that its first draw
    // links it, at once). Its first draw happens here too, before anything moves much.
    if (!this.lensReady && this.t >= HOLD_AT && this.held < HOLD_MAX) {
      this.held += dt;
      dt = 0;
    }
    this.lens.enabled = this.lensReady || this.held >= HOLD_MAX;
    const step = dt * this.speed;
    this.t += step;
    const t = this.t;
    const T = TIMELINE;
    const g = this.gentle;
    for (const cue of Object.keys(T) as Cue[]) {
      if (t >= T[cue] && !this.cuesFired.has(cue)) {
        this.cuesFired.add(cue);
        this.hooks?.onCue?.(cue);
      }
    }

    const pre = range(t, T.haze, T.birth);
    const since = t - T.birth;
    const born = since >= 0;
    const grow = range(t, T.birth, T.plunge);
    const plunge = range(t, T.plunge, T.horizon);
    const u = this.lens.uniforms;

    // The hole: a pinprick that bends starlight, then it snaps open, swells, and in the plunge grows
    // as fast as the camera falls.
    if (!born) this.rs = 0.002 + 0.035 * pre * pre;
    else this.rs = (0.035 + 0.5 * easeOutBack(since / 0.34) + 0.8 * smooth(grow)) * (1 + 4.2 * Math.pow(plunge, 2.1));
    u.uRs.value = this.rs;

    // The disk ignites over a second and a half, spreads, heats, and spins faster as we near it.
    // In the fall the disk fills the frame: each pixel of it is kept from blowing out to white.
    u.uDiskGain.value = born ? smooth(since / 1.5) * (1 - 0.35 * plunge) : 0;
    u.uDiskOut.value = 4 + 9 * smooth(since / 2.6);
    u.uDiskHeat.value = 0.75 + 0.2 * grow + 0.25 * plunge;
    this.diskTime += step * (0.5 + 1.6 * grow + 7 * plunge);
    u.uTime.value = this.diskTime;
    u.uFar.value = Math.max(u.uDiskOut.value + 2, 9);
    // The far field reaches further as it grows: barely past the disk at first, the whole frame by the fall.
    u.uReach.value = Math.max(3 * u.uFar.value, 18 + 60 * grow * grow + 400 * plunge);
    // The whole screen is inside the strong field in the plunge: fewer steps keep the frame time flat.
    const steps = this.lowTier ? 64 : 90;
    u.uSteps.value = Math.round(steps * (1 - 0.35 * plunge));
    u.uRing.value = born ? 0.85 + 2.2 * Math.exp(-since * 5) : 0;

    // Before: the shimmer, then the converging light.
    const imp = range(t, T.implode, T.birth);
    u.uHaze.value = g ? 0 : born ? 0.35 * Math.exp(-since * 0.8) : pre;
    u.uImplode.value.set(1.25 * Math.pow(1 - imp, 1.7), imp > 0 && !born ? smooth(imp * 1.4) : 0, 0.004 + 0.018 * (1 - imp));
    u.uFlash.value = born ? Math.exp(-since * 12) : 0;

    // After: the shockwave, the swirl, the colour split.
    this.shockR = born && !g && since < 2.2 ? since * 1.55 : -1;
    this.shockA = this.shockR >= 0 ? 0.05 * Math.exp(-since * 1.5) : 0;
    u.uShock.value.set(this.shockR, this.shockA, 0.045 + 0.07 * Math.max(since, 0));
    u.uSwirl.value = g || !born ? 0 : (0.55 * smooth(grow) + 2.4 * Math.pow(plunge, 1.5)) * smooth(since / 0.5);
    u.uCA.value = born ? 0.006 + 0.012 * grow + 0.05 * plunge + 0.04 * u.uFlash.value : 0;
    u.uShift.value = 0.6 * Math.pow(plunge, 1.5);
    this.eat = t >= T.horizon ? 1 : Math.pow(range(t, T.horizon - 0.34, T.horizon), 1.4);
    u.uEat.value = this.eat;

    // The pull on the world: swallowed from the inside out, wound about the axis, flattened to the disk.
    const reat = born ? 1 + 38 * Math.pow(smooth((since - 0.15) / (T.plunge - T.birth)), 1.5) + 90 * plunge * plunge : 0;
    this.swirlPhase += step * (born ? 0.6 + 3.5 * grow + 10 * plunge : 0);
    this.well.uniforms.uWell.value.set(Math.pow(reat, 1.5), this.swirlPhase, born ? 0.85 * smooth(since / 3) : 0, 6);
    const lost = range(t, T.shipLost, T.shipLost + 1.5);
    const shipReat = 34 * Math.pow(lost, 1.6) + 90 * plunge * plunge;
    this.shipSwirl += step * (lost > 0 ? 1 + 4 * lost : 0);
    this.shipWell.uniforms.uWell.value.set(Math.pow(shipReat, 1.5), this.shipSwirl, 0.6 * lost, 6);
    this.embers.set(born ? smooth(since / 0.9) * (1 + 0.8 * plunge) * (1 - this.eat) : 0, this.diskTime);
    this.pull = smooth(range(t, T.birth + 0.4, T.plunge));

    // The camera: a kick at the birth, a rumble that builds, turned to face the hole, then the fall.
    const kick = born ? Math.exp(-since * 3.2) * 0.32 : 0;
    this.shakeAmp = g ? 0 : kick + (born ? 0.015 + 0.07 * grow + 0.16 * plunge : pre * 0.006) * (1 - this.eat);
    const s = t;
    this.shake.set(
      (Math.sin(s * 23.1) * 0.5 + Math.sin(s * 37.7 + 1.3) * 0.3 + Math.sin(s * 6.3 + 0.4) * 0.6) * this.shakeAmp,
      (Math.sin(s * 19.7 + 2.1) * 0.5 + Math.sin(s * 41.3 + 0.7) * 0.3 + Math.sin(s * 5.1 + 2.7) * 0.6) * this.shakeAmp,
    );
    this.lookBlend = g ? 0 : smooth(range(t, T.capture, T.capture + 1.5));
    this.fall = g ? 0 : Math.pow(plunge, 2.2) * 0.6;
    this.fovExtra = g ? 0 : 38 * smooth(plunge);
    this.roll = g ? 0 : 0.12 * this.lookBlend + 0.7 * Math.pow(plunge, 1.6) + Math.sin(t * 7.3) * this.shakeAmp * 0.08;

    // The grade: a flash at the birth, then the light is taken, warmer and darker at the corners.
    lerpGrade(GRADES.title, this.gradeHot, smooth(range(t, T.birth, T.capture)), this.grade);
    this.grade.exposure += 0.4 * u.uFlash.value;
    this.hooks?.setGrade(this.grade);

    if (t >= T.end) this.finish();
  }

  /**
   * The ship's run, applied over the pose the scene just gave it: it lights everything, turns away and
   * pulls a little clear, is dragged back stern first, its engines sputter and die, and it tumbles in.
   * Returns the thrust for its engines.
   */
  driveShip(group: THREE.Object3D, thrust: number): number {
    if (!this.active || this.gentle) return thrust;
    const t = this.t;
    const T = TIMELINE;
    if (t < T.fight) return thrust;
    if (!this.shipStart) {
      const awayDir = group.position.clone().sub(this.centre).normalize();
      const up = new THREE.Vector3(0, 1, 0).addScaledVector(awayDir, -awayDir.y).normalize();
      const starboard = new THREE.Vector3().crossVectors(awayDir, up);
      const away = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(awayDir, up, starboard));
      this.shipStart = { p: group.position.clone(), q: group.quaternion.clone(), away, awayDir };
    }
    const st = this.shipStart;
    const turn = smooth(range(t, T.fight, T.fight + 1.15));
    // Banks hard through the turn.
    this.q.copy(st.q).slerp(st.away, turn);
    this.q2.setFromAxisAngle(X_AXIS, Math.sin(turn * Math.PI) * 0.55);
    this.q.multiply(this.q2);
    // Clear of the pull a little, then dragged back toward the hole, faster and faster.
    const escape = 2.4 * smooth(range(t, T.fight, T.fight + 1.7));
    const dragT = Math.max(t - (T.fight + 1.2), 0);
    const drag = 0.5 * 7 * dragT * dragT;
    group.position.copy(st.p).addScaledVector(st.awayDir, escape - drag);
    // The hull shudders under the strain.
    const strain = range(t, T.fight, T.shipLost) * 0.06;
    group.position.x += Math.sin(t * 47.0) * strain;
    group.position.y += Math.sin(t * 53.0 + 1.0) * strain;
    // Lost: it tumbles.
    const lostT = Math.max(t - T.shipLost, 0);
    if (lostT > 0) {
      this.q2.setFromAxisAngle(this.tumbleAxis, 0.5 * 4.5 * lostT * lostT);
      this.q.premultiply(this.q2);
    }
    group.quaternion.copy(this.q);
    // Engines: full (with a stutter of effort), then failing in bursts, then dark.
    if (t < T.shipLost) return Math.min(1, range(t, T.fight, T.fight + 0.18)) * (0.92 + 0.08 * Math.sin(t * 61));
    const fail = range(t, T.shipLost, T.shipLost + 0.6);
    const sputter = Math.sin(t * 38) * Math.sin(t * 23 + 1.7) > 0.05 ? 1 : 0.15;
    return (1 - fail) * sputter;
  }

  /** Applied after the scene has placed its camera at rest, aimed at `look`. */
  applyCamera(camera: THREE.PerspectiveCamera, look: THREE.Vector3, baseFov: number): void {
    if (!this.active) return;
    // Fall toward the hole.
    if (this.fall > 0) {
      this.v3.copy(this.centre).sub(camera.position);
      camera.position.addScaledVector(this.v3, this.fall);
    }
    this.v3b.copy(look).lerp(this.centre, this.lookBlend);
    camera.up.set(0, 1, 0);
    camera.lookAt(this.v3b);
    // Shake in the camera's own plane, roll about its axis.
    camera.translateX(this.shake.x * 0.25);
    camera.translateY(this.shake.y * 0.25);
    camera.rotateZ(this.roll);
    camera.rotateX(this.shake.y * 0.012);
    camera.rotateY(this.shake.x * 0.012);
    camera.fov = baseFov + this.fovExtra;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  /** Writes this frame's view-space uniforms and reports to the page. Call after applyCamera. */
  sync(camera: THREE.PerspectiveCamera): void {
    if (!this.active) return;
    const u = this.lens.uniforms;
    this.well.sync(camera);
    this.shipWell.sync(camera);
    const view = camera.matrixWorldInverse;
    this.holeView.copy(this.centre).applyMatrix4(view);
    u.uBH.value.copy(this.holeView);
    this.m3.setFromMatrix4(view);
    u.uDiskN.value.copy(this.axis).applyMatrix3(this.m3).normalize();
    u.uDiskX.value.copy(this.diskX).applyMatrix3(this.m3).normalize();
    u.uDiskZ.value.copy(this.diskZ).applyMatrix3(this.m3).normalize();
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const tanH = tanV * camera.aspect;
    u.uTan.value.set(tanH, tanV);
    const z = Math.min(this.holeView.z, -1e-3);
    const ndcX = this.holeView.x / -z / tanH;
    const ndcY = this.holeView.y / -z / tanV;
    u.uBhUv.value.set(ndcX * 0.5 + 0.5, ndcY * 0.5 + 0.5);

    const w = window.innerWidth;
    const h = window.innerHeight;
    const dist = this.holeView.length();
    const shadow = Math.atan(Math.min((2.598 * this.rs) / Math.max(dist, 1e-3), 50));
    const f = this.frameOut;
    f.t = this.t;
    f.x = (ndcX * 0.5 + 0.5) * w;
    f.y = (0.5 - ndcY * 0.5) * h;
    f.horizon = (Math.tan(Math.min(shadow, 1.5)) / tanV) * h * 0.5;
    f.shockRadius = this.shockR >= 0 ? this.shockR * h : 0;
    f.shockAmp = this.shockA * h;
    f.shakeX = this.shake.x * 26;
    f.shakeY = this.shake.y * 26;
    f.pull = this.pull;
    f.eat = this.eat;
    this.hooks?.onFrame?.(f);
  }

  private finish(): void {
    if (!this.resolveDone) return;
    const done = this.resolveDone;
    this.resolveDone = null;
    done();
  }

  /** Takes the lens out of the chain and frees what this made. */
  dispose(): void {
    if (this.active) this.hooks?.setScreenEffect(null);
    this.active = false;
    this.finish();
    this.lens.dispose();
    this.embers.dispose();
  }
}
