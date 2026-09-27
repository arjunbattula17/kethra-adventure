import * as THREE from 'three';
import { MotionScope, motion, damp, dampVec3, DUR } from '../../motion';
import { UIManager } from '../../ui/UIManager';
import { PanelManager } from '../../ui/PanelManager';
import { registerMiniGame } from '../../debug/hooks';
import { AudioSystem } from '../../audio/AudioSystem';
import { t } from '../../content/strings';
import type { StringKey } from '../../content/strings';
import * as sim from './sim';
import { Dots, INK, Labels, Lines, toV3 } from './instrument';
import type { Belt } from './props';

/**
 * MG1 Intercept (docs/DESIGN.md §4, slot 1): plot the burn to Kethra in the real 3D system, drawn
 * through the Wren's navigation instrument. Three legs in one session: clear the drift to ORION's
 * buoy, lead Kethra, then take the course over the belt. The model and its numbers live in ./sim;
 * this is the instrument, the input and the choreography.
 */

export interface InterceptWorld {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** The Wren at plot scale; the game places and turns it. Its nose is local +X. */
  wren: THREE.Object3D;
  /** Kethra; the game moves it along its orbit as plotted days pass. */
  kethra: THREE.Object3D;
  belt: Belt;
  /** Where pointer input lands (the renderer's canvas). */
  surface: HTMLElement;
  stats: { insight: number; perception: number; engineering: number };
}

export interface InterceptResult {
  /** The plotted course, start to arrival, in plot units. */
  course: THREE.Vector3[];
  days: number;
  cells: number;
}

interface Plan {
  azimuth: number;
  elevation: number;
  cells: number;
}

type Phase = 'plot' | 'run' | 'result' | 'between' | 'won';

/** Leg 1's opening view: from the sun's side, looking out along the hop, so the sun is behind the
 * camera and the buoy reads against dark space. The reveal ends its camera move exactly here, so
 * the handover has no jump. */
export const LEG1_VIEW = { yaw: -2.1, pitch: 0.7, dist: 24 } as const;
/** Leg 1 looks at a point a little nearer the Wren than the buoy, keeping both clear of the captions. */
export const LEG1_FOCUS = 0.42;

/** The orbit camera's position for a view about `target`. */
export function orbitPosition(target: THREE.Vector3, view: { yaw: number; pitch: number; dist: number }, out = new THREE.Vector3()): THREE.Vector3 {
  const cp = Math.cos(view.pitch);
  return out.set(target.x + view.dist * cp * Math.sin(view.yaw), target.y + view.dist * Math.sin(view.pitch), target.z + view.dist * cp * Math.cos(view.yaw));
}

const DEG = Math.PI / 180;
/** How many days of Kethra's future the ghost shows; insight 2 shows three more. */
const KETHRA_GHOST_DAYS = 8;

const c = (hex: number, k = 1) => new THREE.Color(hex).multiplyScalar(k);
const AMBER = c(INK.amber);
const AMBER_DIM = c(INK.amber, 0.35);
const GROVE = c(INK.grove, 0.9);
const GROVE_DIM = c(INK.grove, 0.28);
const STEEL = c(INK.steel, 0.5);
const WARN = c(INK.warn);
const INK_BRIGHT = c(INK.ink);

export class InterceptGame {
  onComplete: ((result: InterceptResult) => void) | null = null;

  private readonly w: InterceptWorld;
  private readonly fx = new MotionScope('game');
  private readonly legs: sim.Leg[];
  private readonly clumps = sim.beltWall();
  private legIndex = 0;
  private plans: Plan[] = [];
  private selected = 0;
  private phase: Phase = 'between';
  private outcome: sim.Outcome | null = null;
  /** The plot's clock while a run plays, in days. */
  private runDay = 0;
  private runFrom = 0;
  private runTo = 0;
  private runSeconds = 1;
  private hitStop = 0;
  /** Legs already flown, as polylines: they stay drawn as the committed course. */
  private committed: THREE.Vector3[][] = [];

  private readonly instrument = new THREE.Group();
  private readonly staticLines = new Lines(400, 3);
  private readonly ghost = new Lines(600, 12);
  private readonly ticks = new Dots(200, 7);
  private readonly bodies = new Dots(16, 11, 13);
  private readonly course = new Lines(64, 14);
  private readonly labels = new Labels();
  private readonly arrow: THREE.Group;
  private readonly arrowCones: THREE.Mesh[] = [];
  private dirty = true;

  // Camera: an orbit around a target, every value eased toward its goal.
  private readonly target = new THREE.Vector3();
  private readonly goalTarget = new THREE.Vector3();
  private yaw = 0;
  private pitch = 0.5;
  private dist = 30;
  private goalYaw = 0;
  private goalPitch = 0.5;
  private goalDist = 30;
  private readonly held = new Set<string>();
  private drag: { mode: 'orbit' | 'aim'; x: number; y: number } | null = null;

  private readonly panel: HTMLDivElement;
  private readonly unregister: () => void;
  private resultNote: { at: THREE.Vector3; text: string } | null = null;
  private resultLine: [THREE.Vector3, THREE.Vector3] | null = null;

  constructor(world: InterceptWorld) {
    this.w = world;
    this.legs = sim.legs(world.stats.engineering);
    this.instrument.name = 'intercept-instrument';
    for (const obj of [this.staticLines.object, this.ghost.object, this.ticks.object, this.bodies.object, this.course.object]) this.instrument.add(obj);
    this.arrow = this.buildArrow();
    this.instrument.add(this.arrow);
    world.scene.add(this.instrument);

    this.panel = document.createElement('div');
    this.panel.className = 'intercept-panel';
    // Every key on the plate is also a button, so the plot can be flown with the mouse alone.
    this.panel.addEventListener('click', this.onPanelClick);
    const root = document.getElementById('ui-root')!;
    root.append(this.labels.root, this.panel);
    world.belt.setDensityVisible(world.stats.perception >= 2);

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    world.surface.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    world.surface.addEventListener('wheel', this.onWheel, { passive: true });
    this.unregister = registerMiniGame({ name: 'intercept', win: () => this.debugWin(), fail: () => this.debugFail() });
  }

  /** The point the camera orbits: the scene keeps its near plane in proportion to it. */
  get focus(): THREE.Vector3 {
    return this.target;
  }

  /** Begins leg 1, with the camera where the reveal left it. */
  start(fromCamera: THREE.Vector3, fromTarget: THREE.Vector3): void {
    this.target.copy(fromTarget);
    const off = fromCamera.clone().sub(fromTarget);
    this.dist = off.length();
    this.pitch = Math.asin(THREE.MathUtils.clamp(off.y / this.dist, -1, 1));
    this.yaw = Math.atan2(off.x, off.z);
    this.beginLeg(0);
  }

  // ------------------------------------------------------------------ legs

  private get leg(): sim.Leg {
    return this.legs[this.legIndex];
  }

  private beginLeg(index: number, plans?: Plan[]): void {
    this.legIndex = index;
    const leg = this.leg;
    this.selected = 0;
    this.outcome = null;
    this.resultNote = null;
    this.resultLine = null;
    if (plans) this.plans = plans;
    else if (leg.id === 1) {
      // Pointed well off the buoy, so the first thing the player does is aim.
      const toBuoy = sim.anglesOf(sim.sub(sim.BUOY, leg.start));
      this.plans = [{ azimuth: toBuoy.azimuth - 40 * DEG, elevation: 0, cells: 1 }];
    } else {
      // Straight at where Kethra is now: the natural first try, and the miss leg 2 teaches from.
      const now = sim.anglesOf(sim.sub(sim.orbitAt(sim.KETHRA, leg.startDay), leg.start));
      this.plans = [{ azimuth: now.azimuth, elevation: now.elevation, cells: 3 }];
    }
    this.frameLeg();
    this.phase = 'plot';
    this.dirty = true;
    this.placeBodies(leg.startDay);
    this.renderPanel();
    this.say(`mg1.leg${leg.id}.orion` as StringKey);
    UIManager.setObjective(t(`mg1.leg${leg.id}.objective` as StringKey));
  }

  private frameLeg(): void {
    const leg = this.leg;
    if (leg.id === 1) {
      this.goalTarget.lerpVectors(toV3(leg.start), toV3(sim.BUOY), LEG1_FOCUS);
      this.goalDist = LEG1_VIEW.dist;
      this.goalPitch = LEG1_VIEW.pitch;
      this.goalYaw = LEG1_VIEW.yaw;
    } else if (leg.id === 2) {
      this.goalTarget.copy(toV3(scaleMid(leg.start, sim.orbitAt(sim.KETHRA, leg.startDay + 6))));
      this.goalDist = 92;
      this.goalPitch = 0.72;
      this.goalYaw = 0.25;
    } else {
      // Side-on to the belt, from inside the ring behind the buoy: the only angle the wall reads as
      // a wall, with the near side of the ring behind the camera.
      this.goalTarget.copy(toV3(scaleMid(leg.start, sim.orbitAt(sim.KETHRA, leg.startDay + 6))));
      this.goalDist = 44;
      this.goalPitch = 0.12;
      this.goalYaw = 3.1;
    }
  }

  private toBurns(plans = this.plans): sim.Burn[] {
    return plans.map((p) => ({ dir: sim.direction(p.azimuth, p.elevation), cells: p.cells }));
  }

  private budgetLeft(): number {
    return this.leg.budget - this.plans.reduce((n, p) => n + p.cells, 0);
  }

  // ------------------------------------------------------------------ running

  private run(): void {
    if (this.phase !== 'plot') return;
    const leg = this.leg;
    this.outcome = sim.simulate(leg, this.toBurns(), this.clumps);
    this.runFrom = leg.startDay;
    this.runDay = leg.startDay;
    this.runTo = this.outcome.day;
    // "A six-second fast-forward of the voyage", shorter for a short hop.
    this.runSeconds = THREE.MathUtils.clamp((this.runTo - this.runFrom) * 0.8, 1.4, 6);
    this.phase = 'run';
    this.dirty = true;
    UIManager.clearCaption();
    AudioSystem.playTone(110, 0.5, 'sine', 0.06);
    this.renderPanel();
  }

  private rewind(): void {
    if (this.phase !== 'result' && this.phase !== 'run') return;
    this.phase = 'plot';
    this.outcome = null;
    this.resultNote = null;
    this.resultLine = null;
    this.placeBodies(this.leg.startDay);
    this.frameLeg();
    this.dirty = true;
    UIManager.clearCaption();
    AudioSystem.playUiClick();
    this.renderPanel();
  }

  private finishRun(): void {
    const o = this.outcome!;
    const leg = this.leg;
    if (o.kind === 'arrive') {
      AudioSystem.playSuccess();
      this.committed.push(this.flownPath(o.day));
      this.phase = 'between';
      this.dirty = true;
      if (leg.id === 1) {
        this.say('mg1.leg1.done');
        this.fx.after(2.2, () => this.beginLeg(1));
      } else if (leg.id === 2) this.resolveBelt();
      else this.win(o.day);
      this.renderPanel();
      return;
    }
    // A readable fail (DESIGN §4): stop, look at what went wrong, say by how much. R retries.
    this.phase = 'result';
    AudioSystem.playFail();
    const at = toV3(o.at);
    if (o.kind === 'contact') {
      this.hitStop = 0.06;
      this.resultNote = { at, text: t('mg1.fail.contact', { day: String(Math.ceil(o.day)) }) };
      this.goalTarget.copy(at);
      this.goalDist = Math.min(this.goalDist, 34);
    } else {
      const there = toV3(o.targetAt);
      this.resultLine = [at, there];
      const miss = String(Math.round(o.distance));
      const day = String(Math.round(o.day));
      this.resultNote = {
        at: there,
        text: leg.target.kind === 'buoy' ? t('mg1.fail.buoy', { miss }) : t('mg1.fail.kethra', { day, miss }),
      };
      this.goalTarget.lerpVectors(at, there, 0.5);
      this.goalDist = THREE.MathUtils.clamp(at.distanceTo(there) * 2.4, 18, this.goalDist);
      if (leg.target.kind === 'kethra') this.say('mg1.hint.lead');
    }
    this.dirty = true;
    this.renderPanel();
  }

  /** Where the Wren went on this leg, up to `day`, as a polyline through each burn's corner. */
  private flownPath(day: number): THREE.Vector3[] {
    const leg = this.leg;
    const pts = [toV3(leg.start)];
    let t0 = leg.startDay;
    for (const b of this.toBurns()) {
      const span = b.cells * sim.DAYS_PER_CELL;
      if (day <= t0 + span) break;
      t0 += span;
      pts.push(toV3(sim.wrenAt(leg, this.toBurns(), t0).at));
    }
    pts.push(toV3(sim.wrenAt(leg, this.toBurns(), day).at));
    return pts;
  }

  /**
   * Leg 2 landed. ORION finishes resolving the belt, and the line the player just flew turns out
   * to go straight through it: that is leg 3's problem, found by the scan, not announced.
   */
  private resolveBelt(): void {
    this.say('mg1.leg2.done');
    const flown = this.committed.pop()!;
    const straight = this.plans[0];
    this.fx.tween({ duration: 1.6, update: (k) => this.w.belt.setResolved(k) });
    this.fx.after(1.9, () => {
      const blocked = sim.simulate(this.legs[2], this.toBurns([straight]), this.clumps);
      if (blocked.kind === 'contact') {
        this.resultNote = { at: toV3(blocked.at), text: t('mg1.fail.contact', { day: String(Math.ceil(blocked.day)) }) };
        this.resultLine = [flown[0], toV3(blocked.at)];
        AudioSystem.playError();
      }
      this.dirty = true;
    });
    this.fx.after(4.2, () => {
      const hop: Plan = { ...straight, cells: 1 };
      const rest: Plan = { ...straight, cells: Math.max(1, straight.cells - 1) };
      this.beginLeg(2, [hop, rest]);
    });
  }

  // ------------------------------------------------------------------ the win

  private win(day: number): void {
    this.phase = 'won';
    motion.conductor.duck(3);
    const course = this.committed.flat().filter((p, i, all) => i === 0 || p.distanceTo(all[i - 1]) > 1e-6);
    // The transfer's own figures, from the buoy: what First light and the cruise quote back.
    const cells = this.plans.reduce((n, p) => n + p.cells, 0);
    const days = Math.ceil(day - this.leg.startDay);
    // The signature wavefront: the course draws itself outward from the Wren.
    this.wave = { course, k: 0 };
    this.fx.tween({ duration: motion.reduced ? 0.2 : 1.4, update: (k) => { if (this.wave) this.wave.k = k; this.dirty = true; } });
    this.panel.innerHTML = `<div class="eyebrow">${t('mg1.win.eyebrow')}</div>
      <div class="intercept-win"><div><span class="label">${t('mg1.win.days')}</span><span class="num big" data-count="${days}">0</span></div>
      <div><span class="label">${t('mg1.win.cells')}</span><span class="num big" data-count="${cells}">0</span></div></div>`;
    for (const el of this.panel.querySelectorAll<HTMLElement>('[data-count]')) {
      const to = Number(el.dataset.count);
      motion.ui.tween({ duration: DUR.large, update: (k) => (el.textContent = String(Math.round(to * k))) });
    }
    this.say('mg1.win.orion');
    AudioSystem.playChime();
    // The chart eases to a hero angle on the whole course.
    const mid = new THREE.Vector3();
    for (const p of course) mid.add(p);
    this.goalTarget.copy(mid.divideScalar(course.length));
    this.goalDist = 96;
    this.goalPitch = 0.55;
    this.goalYaw = 0.6;
    this.fx.after(4.4, () => this.onComplete?.({ course, days, cells }));
  }
  private wave: { course: THREE.Vector3[]; k: number } | null = null;

  // ------------------------------------------------------------------ frame

  update(dt: number): void {
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      dt = 0;
    }
    this.orbitFromKeys(dt);

    if (this.phase === 'run') {
      this.runDay = Math.min(this.runTo, this.runDay + ((this.runTo - this.runFrom) / this.runSeconds) * dt);
      this.placeBodies(this.runDay);
      this.dirty = true;
      if (this.runDay >= this.runTo) this.finishRun();
    } else if (this.phase === 'plot') {
      // The Wren turns to face the selected burn: the ship answers the aim.
      this.placeBodies(this.leg.startDay);
    }

    // Camera.
    dampVec3(this.target, this.goalTarget, 3.2, dt);
    this.yaw = this.dampAngle(this.yaw, this.goalYaw, dt);
    this.pitch = damp(this.pitch, this.goalPitch, 3.2, dt);
    this.dist = damp(this.dist, this.goalDist, 3.2, dt);
    const cam = this.w.camera;
    orbitPosition(this.target, { yaw: this.yaw, pitch: this.pitch, dist: this.dist }, cam.position);
    cam.lookAt(this.target);

    this.layoutArrow();
    if (this.dirty) this.redraw();
    this.drawLabels();
  }

  /** Eases yaw the short way round, then lets the goal follow, so dragging past ±π never spins. */
  private dampAngle(from: number, to: number, dt: number): number {
    const d = THREE.MathUtils.euclideanModulo(to - from + Math.PI, Math.PI * 2) - Math.PI;
    return from + d * (1 - Math.exp(-3.2 * dt));
  }

  private orbitFromKeys(dt: number): void {
    const h = this.held;
    const rate = 1.4 * dt;
    if (h.has('KeyA') || (h.has('ArrowLeft') && !h.has('Shift'))) this.goalYaw -= rate;
    if (h.has('KeyD') || (h.has('ArrowRight') && !h.has('Shift'))) this.goalYaw += rate;
    if (h.has('KeyW') || (h.has('ArrowUp') && !h.has('Shift'))) this.goalPitch = Math.min(1.45, this.goalPitch + rate);
    if (h.has('KeyS') || (h.has('ArrowDown') && !h.has('Shift'))) this.goalPitch = Math.max(-1.2, this.goalPitch - rate);
    if (h.has('Equal') || h.has('NumpadAdd')) this.goalDist = Math.max(6, this.goalDist * Math.exp(-1.2 * dt));
    if (h.has('Minus') || h.has('NumpadSubtract')) this.goalDist = Math.min(220, this.goalDist * Math.exp(1.2 * dt));
  }

  /** Puts the Wren and Kethra where they are on `day` of the plot. */
  private placeBodies(day: number): void {
    const leg = this.leg;
    const k = sim.orbitAt(sim.KETHRA, day);
    this.w.kethra.position.set(k.x, k.y, k.z);
    const burns = this.toBurns();
    const { at } = sim.wrenAt(leg, burns, day);
    this.w.wren.position.set(at.x, at.y, at.z);
    // Facing: the burn being flown (or aimed).
    let t0 = leg.startDay;
    let dir = burns[this.phase === 'run' ? 0 : this.selected]?.dir ?? burns[0].dir;
    if (this.phase === 'run') {
      for (const b of burns) {
        dir = b.dir;
        t0 += b.cells * sim.DAYS_PER_CELL;
        if (day <= t0) break;
      }
    }
    _look.set(at.x + dir.x, at.y + dir.y, at.z + dir.z);
    this.w.wren.lookAt(_look);
    // lookAt aims local +Z; the hull's nose is +X.
    this.w.wren.rotateY(-Math.PI / 2);
  }

  // ------------------------------------------------------------------ drawing

  private redraw(): void {
    this.dirty = false;
    const leg = this.leg;
    const burns = this.toBurns();

    // The committed course and the static marks: buoy ring, drop lines for the bodies.
    const lines = this.staticLines.clear();
    const bodies = this.bodies.clear();
    const buoy = toV3(sim.BUOY);
    lines.add(buoy, _a.set(buoy.x, 0, buoy.z), STEEL);
    bodies.add(buoy, leg.id === 1 ? AMBER : AMBER_DIM);
    const kNow = this.w.kethra.position;
    lines.add(kNow.clone(), _a.set(kNow.x, 0, kNow.z).clone(), GROVE_DIM);
    const wren = this.w.wren.position;
    bodies.add(wren, INK_BRIGHT);
    lines.add(wren.clone(), _a.set(wren.x, 0, wren.z).clone(), STEEL);
    if (this.resultLine) lines.dashed(this.resultLine[0], this.resultLine[1], WARN, 0.9, 0.7);
    if (this.resultNote) bodies.add(this.resultNote.at, WARN);

    const course = this.course.clear();
    if (this.wave) {
      // The win: the course draws itself outward from the Wren in amber, a bright head leading.
      const pts = this.wave.course;
      const total = pts.slice(1).reduce((s, p, i) => s + p.distanceTo(pts[i]), 0);
      let left = total * this.wave.k;
      for (let i = 1; i < pts.length && left > 0; i++) {
        const seg = pts[i].distanceTo(pts[i - 1]);
        const end = seg <= left ? pts[i] : _b.lerpVectors(pts[i - 1], pts[i], left / seg).clone();
        course.add(pts[i - 1], end, AMBER);
        left -= seg;
        if (left <= 0 && this.wave.k < 1) bodies.add(end, INK_BRIGHT);
      }
    } else for (const path of this.committed) course.path(path, AMBER);

    // The plan: the ghost line and its day ticks, and Kethra's ghost ticks.
    const ghost = this.ghost.clear();
    const ticks = this.ticks.clear();
    this.tickLabels.length = 0;
    const planning = this.phase === 'plot' || this.phase === 'result' || this.phase === 'run';
    if (planning) {
      let start = toV3(leg.start);
      burns.forEach((b, i) => {
        const end = toV3(sim.add(start, sim.scale(b.dir, sim.SPEED * b.cells * sim.DAYS_PER_CELL)));
        ghost.add(start, end, i === this.selected ? AMBER : AMBER_DIM);
        start = end;
      });
      const endDay = sim.endDay(leg, burns);
      for (let d = Math.floor(leg.startDay) + 1; d <= endDay + 1e-6; d++) {
        const p = toV3(sim.wrenAt(leg, burns, d).at);
        const target = sim.targetAt(leg.target, d);
        const match = sim.dist(p, target) < sim.CAPTURE * 1.3;
        ticks.add(p, match ? INK_BRIGHT : AMBER);
        ghost.add(p, _a.set(p.x, 0, p.z).clone(), c(INK.amber, 0.12));
        this.tickLabels.push({ at: p, text: String(d), cls: match ? 'wren match' : 'wren' });
        if (match && leg.target.kind === 'kethra') ghost.add(p, toV3(target), INK_BRIGHT);
      }
      if (leg.target.kind === 'kethra') {
        const extra = this.w.stats.insight >= 2 ? 3 : 0;
        for (let d = Math.floor(leg.startDay) + 1; d <= leg.startDay + KETHRA_GHOST_DAYS + extra; d++) {
          const p = toV3(sim.orbitAt(sim.KETHRA, d));
          const wr = sim.wrenAt(leg, burns, d);
          const match = !wr.done && sim.dist(wr.at, p) < sim.CAPTURE * 1.3;
          ticks.add(p, match ? INK_BRIGHT : GROVE);
          ghost.add(p, _a.set(p.x, 0, p.z).clone(), GROVE_DIM);
          this.tickLabels.push({ at: p, text: String(d), cls: match ? 'kethra match' : 'kethra' });
        }
      }
    }
    lines.commit();
    bodies.commit();
    course.commit();
    ghost.commit();
    ticks.commit();
  }
  private tickLabels: { at: THREE.Vector3; text: string; cls: string }[] = [];

  private drawLabels(): void {
    const cam = this.w.camera;
    const L = this.labels;
    L.begin();
    for (const l of this.tickLabels) L.add(l.at, l.text, l.cls, cam);
    L.add(toV3(sim.BUOY), t('mg1.label.buoy'), 'body', cam);
    if (this.legIndex > 0 || this.phase === 'won') L.add(this.w.kethra.position, t('mg1.label.kethra'), 'body kethra', cam);
    if (this.resultNote) L.add(this.resultNote.at, this.resultNote.text, 'note warn', cam);
    if (this.phase === 'run') L.add(this.w.wren.position, t('mg1.label.day', { day: String(Math.floor(this.runDay)) }), 'body wren', cam);
    L.end();
  }

  private buildArrow(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'aim-arrows';
    for (let i = 0; i < 2; i++) {
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.2, 0.55, 12).rotateX(Math.PI / 2).translate(0, 0, 0.275),
        new THREE.MeshBasicMaterial({ color: INK.amber, toneMapped: false, transparent: true, depthWrite: false }),
      );
      cone.renderOrder = 15;
      this.arrowCones.push(cone);
      group.add(cone);
    }
    return group;
  }

  /** Arrow length: a steady size on screen, whatever the zoom. */
  private arrowLength(at: THREE.Vector3): number {
    return this.w.camera.position.distanceTo(at) * 0.075;
  }

  private burnStart(i: number): THREE.Vector3 {
    const leg = this.leg;
    const burns = this.toBurns();
    let p = leg.start;
    for (let k = 0; k < i; k++) p = sim.add(p, sim.scale(burns[k].dir, sim.SPEED * burns[k].cells * sim.DAYS_PER_CELL));
    return toV3(p);
  }

  private layoutArrow(): void {
    const show = this.phase === 'plot';
    this.arrowCones.forEach((cone, i) => {
      const plan = this.plans[i];
      cone.visible = show && !!plan;
      if (!cone.visible) return;
      const start = this.burnStart(i);
      const L = this.arrowLength(start);
      const dir = toV3(sim.direction(plan.azimuth, plan.elevation));
      cone.position.copy(start).addScaledVector(dir, L);
      cone.lookAt(_a.copy(cone.position).add(dir));
      cone.scale.setScalar(L * 0.55);
      (cone.material as THREE.MeshBasicMaterial).opacity = i === this.selected ? 1 : 0.4;
    });
  }

  // ------------------------------------------------------------------ input

  private blocked(): boolean {
    return PanelManager.isOpen || this.phase === 'won' || this.phase === 'between';
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Shift') this.held.add('Shift');
    this.held.add(e.code);
    if (this.blocked()) return;
    const plan = this.plans[this.selected];
    const step = (e.altKey ? 0.25 : 1) * DEG;
    if (e.shiftKey && this.phase === 'plot' && plan) {
      if (e.code === 'ArrowLeft') this.aimBy(-step, 0);
      else if (e.code === 'ArrowRight') this.aimBy(step, 0);
      else if (e.code === 'ArrowUp') this.aimBy(0, step);
      else if (e.code === 'ArrowDown') this.aimBy(0, -step);
      if (e.code.startsWith('Arrow')) e.preventDefault();
    }
    if (e.repeat) return;
    if (e.code === 'BracketLeft' || e.code === 'BracketRight') this.changeCells(e.code === 'BracketRight' ? 1 : -1);
    else if (e.code === 'Space') {
      e.preventDefault();
      this.run();
    } else if (e.code === 'KeyR') this.rewind();
    else if ((e.code === 'Digit1' || e.code === 'Digit2') && this.plans.length > 1 && this.phase === 'plot') {
      this.selected = e.code === 'Digit1' ? 0 : 1;
      this.dirty = true;
      this.renderPanel();
    }
  };

  private onPanelClick = (e: MouseEvent): void => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (!act || this.blocked()) return;
    if (act === 'run') this.run();
    else if (act === 'rewind') this.rewind();
    else if (act === 'less' || act === 'more') this.changeCells(act === 'more' ? 1 : -1);
    else if (act.startsWith('burn') && this.phase === 'plot') {
      this.selected = Number(act.slice(4));
      this.dirty = true;
      this.renderPanel();
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.key === 'Shift') this.held.delete('Shift');
    this.held.delete(e.code);
  };

  private aimBy(dAz: number, dEl: number): void {
    const plan = this.plans[this.selected];
    plan.azimuth += dAz;
    plan.elevation = THREE.MathUtils.clamp(plan.elevation + dEl, -80 * DEG, 80 * DEG);
    this.dirty = true;
    this.renderPanel();
  }

  private changeCells(delta: number): void {
    if (this.phase !== 'plot') return;
    const plan = this.plans[this.selected];
    const next = plan.cells + delta;
    if (next < 1 || (delta > 0 && this.budgetLeft() <= 0)) {
      AudioSystem.playError();
      return;
    }
    plan.cells = next;
    AudioSystem.playUiClick();
    this.dirty = true;
    this.renderPanel();
  }

  private readonly ray = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();

  private onPointerDown = (e: PointerEvent): void => {
    if (this.blocked() || e.button !== 0) return;
    // Grab an arrow if the press is on one (screen distance to its tip); otherwise orbit.
    let grab = -1;
    if (this.phase === 'plot') {
      this.arrowCones.forEach((cone, i) => {
        if (!cone.visible) return;
        const p = _a.copy(cone.position).project(this.w.camera);
        const x = ((p.x + 1) / 2) * window.innerWidth;
        const y = ((1 - p.y) / 2) * window.innerHeight;
        if (Math.hypot(x - e.clientX, y - e.clientY) < 30 && (grab < 0 || i === this.selected)) grab = i;
      });
    }
    if (grab >= 0) {
      this.selected = grab;
      this.renderPanel();
    }
    this.drag = { mode: grab >= 0 ? 'aim' : 'orbit', x: e.clientX, y: e.clientY };
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.drag) return;
    if (this.drag.mode === 'orbit') {
      this.goalYaw -= (e.clientX - this.drag.x) * 0.006;
      this.goalPitch = THREE.MathUtils.clamp(this.goalPitch + (e.clientY - this.drag.y) * 0.006, -1.2, 1.45);
    } else this.aimAtPointer(e.clientX, e.clientY);
    this.drag.x = e.clientX;
    this.drag.y = e.clientY;
  };

  private onPointerUp = (): void => {
    this.drag = null;
  };

  private onWheel = (e: WheelEvent): void => {
    if (this.blocked()) return;
    this.goalDist = THREE.MathUtils.clamp(this.goalDist * Math.exp(e.deltaY * 0.0012), 6, 220);
  };

  /** Drags the selected arrow around a sphere about its burn's start. */
  private aimAtPointer(x: number, y: number): void {
    const plan = this.plans[this.selected];
    const center = this.burnStart(this.selected);
    const R = this.arrowLength(center);
    this.ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.w.camera);
    const r = this.ray.ray;
    const oc = _a.copy(r.origin).sub(center);
    const b = oc.dot(r.direction);
    const cc = oc.lengthSq() - R * R;
    const disc = b * b - cc;
    let point: THREE.Vector3;
    if (disc >= 0) {
      // Of the two crossings, the one on the side the arrow is already pointing.
      const cur = toV3(sim.direction(plan.azimuth, plan.elevation));
      const p1 = r.at(-b - Math.sqrt(disc), new THREE.Vector3());
      const p2 = r.at(-b + Math.sqrt(disc), new THREE.Vector3());
      point = p1.clone().sub(center).dot(cur) >= p2.clone().sub(center).dot(cur) ? p1 : p2;
    } else point = r.at(-b, new THREE.Vector3());
    const dir = point.sub(center);
    if (dir.lengthSq() < 1e-9) return;
    const a = sim.anglesOf(dir);
    plan.azimuth = a.azimuth;
    plan.elevation = THREE.MathUtils.clamp(a.elevation, -80 * DEG, 80 * DEG);
    this.dirty = true;
    this.renderPanel();
  }

  // ------------------------------------------------------------------ the plate

  private renderPanel(): void {
    if (this.phase === 'won') return;
    const leg = this.leg;
    const plan = this.plans[this.selected];
    const used = this.plans.reduce((n, p) => n + p.cells, 0);
    const days = used * sim.DAYS_PER_CELL;
    const burnTabs =
      this.plans.length > 1
        ? `<div class="intercept-burns">${this.plans.map((_, i) => `<button type="button" data-act="burn${i}" class="${i === this.selected ? 'on' : ''}"><span class="keycap">${i + 1}</span>${t('mg1.burn', { n: String(i + 1) })}</button>`).join('')}</div>`
        : '';
    const az = Math.round(THREE.MathUtils.euclideanModulo(plan.azimuth / DEG, 360));
    const el = Math.round(plan.elevation / DEG);
    const statNotes = [
      this.w.stats.insight >= 2 && leg.target.kind === 'kethra' ? t('mg1.stat.insight') : '',
      this.w.stats.perception >= 2 && leg.belt ? t('mg1.stat.perception') : '',
      this.w.stats.engineering >= 2 ? t('mg1.stat.engineering') : '',
    ].filter(Boolean);
    const action =
      this.phase === 'result'
        ? `<button type="button" data-act="rewind"><span class="keycap">R</span>${t('mg1.key.rewind')}</button>`
        : this.phase === 'run'
          ? `<span class="num">${t('mg1.label.day', { day: String(Math.floor(this.runDay)) })}</span>`
          : `<button type="button" data-act="run"><span class="keycap">Space</span>${t('mg1.key.run')}</button>`;
    this.panel.innerHTML = `
      <div class="eyebrow">${t('mg1.eyebrow', { n: String(leg.id) })}</div>
      <h3>${t(`mg1.leg${leg.id}.title` as StringKey)}</h3>
      <p>${t(`mg1.leg${leg.id}.how` as StringKey)}</p>
      ${burnTabs}
      <div class="intercept-readouts">
        <div><span class="label">${t('mg1.readout.heading')}</span><span class="num">${az}° / ${el >= 0 ? '+' : ''}${el}°</span></div>
        <div><span class="label">${t('mg1.readout.cells')}</span><span class="num"><button type="button" class="keycap" data-act="less" aria-label="${t('mg1.key.less')}">[</button> ${plan.cells} <button type="button" class="keycap" data-act="more" aria-label="${t('mg1.key.more')}">]</button></span></div>
        <div><span class="label">${t('mg1.readout.budget')}</span><span class="num">${used} / ${leg.budget}</span></div>
        <div><span class="label">${t('mg1.readout.days')}</span><span class="num">${days}</span></div>
      </div>
      ${statNotes.length ? `<ul class="intercept-stats">${statNotes.map((s) => `<li>${s}</li>`).join('')}</ul>` : ''}
      <div class="intercept-keys">${action}<span><span class="keycap">Shift</span>+<span class="keycap">←↑↓→</span>${t('mg1.key.aim')}</span><span>${t('mg1.key.orbit')}</span></div>`;
  }

  private say(key: StringKey): void {
    UIManager.showCaption(t(key), 5200);
  }

  // ------------------------------------------------------------------ debug harness and tests

  /** F2 in the harness: fly every remaining leg with its reference course. */
  private debugWin(): void {
    if (this.phase === 'won') return;
    for (let i = this.legIndex; i < this.legs.length; i++) {
      const leg = this.legs[i];
      this.legIndex = i;
      const burns = sim.solution(leg);
      this.plans = burns.map((b) => ({ ...sim.anglesOf(b.dir), cells: b.cells }));
      const o = sim.simulate(leg, burns, this.clumps);
      if (leg.id !== 2) this.committed.push(this.flownPath(o.day));
      if (i === this.legs.length - 1) {
        this.w.belt.setResolved(1);
        this.win(o.day);
      }
    }
  }

  /** F3: run a course that misses. */
  private debugFail(): void {
    if (this.phase !== 'plot') return;
    this.plans[this.selected].azimuth += 90 * DEG;
    this.run();
  }

  /** What the tests in tools/ read. */
  state(): { leg: number; phase: Phase; plans: Plan[]; budget: number; outcome: sim.Outcome | null; buoy: sim.Vec; start: sim.Vec } {
    return { leg: this.leg.id, phase: this.phase, plans: this.plans.map((p) => ({ ...p })), budget: this.leg.budget, outcome: this.outcome, buoy: sim.BUOY, start: this.leg.start };
  }

  dispose(): void {
    this.unregister();
    this.fx.dispose();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.w.surface.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.w.surface.removeEventListener('wheel', this.onWheel);
    this.labels.dispose();
    this.panel.remove();
    this.instrument.removeFromParent();
    this.instrument.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | undefined;
      mat?.dispose();
    });
  }
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _look = new THREE.Vector3();

function scaleMid(a: sim.Vec, b: sim.Vec): sim.Vec {
  return sim.scale(sim.add(a, b), 0.5);
}
