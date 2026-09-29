import * as THREE from 'three';
import { MotionScope, motion, damp, dampVec3, DUR, ease } from '../../motion';
import { UIManager } from '../../ui/UIManager';
import { PanelManager } from '../../ui/PanelManager';
import { registerMiniGame } from '../../debug/hooks';
import { AudioSystem } from '../../audio/AudioSystem';
import { t } from '../../content/strings';
import type { StringKey } from '../../content/strings';
import { MG1 } from '../../content/tuning';
import * as sim from './sim';
import { Dots, INK, Labels, Lines, toV3 } from './instrument';

/**
 * MG1 Intercept (docs/DESIGN.md §4, slot 1): plot the burn to Kethra in the real 3D system, drawn
 * through the Wren's navigation instrument.
 *
 * One choice. ORION hops the Wren out of its own debris to the buoy on its own (which also shows
 * what a plotted day looks like), then asks where to meet Kethra. Kethra's next ten days are ticks
 * along its orbit; the player picks one (pointer or ← →), the course aims itself there, and the
 * plate says how long the Wren needs to get there against the day Kethra does. Only one tick has
 * the two agreeing. Holding it locks the course; Space launches the fast-forward; the win hands the
 * course to the Wren. The model and its numbers live in ./sim; this is the instrument, the input
 * and the choreography.
 */

export interface InterceptWorld {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** The Wren at plot scale; the game places and turns it. Its nose is local +X. */
  wren: THREE.Object3D;
  /** Kethra; the game moves it along its orbit as plotted days pass. */
  kethra: THREE.Object3D;
  /** Where pointer input lands (the renderer's canvas). */
  surface: HTMLElement;
  stats: { insight: number };
}

export interface InterceptResult {
  /** The plotted course, start to arrival, in plot units. */
  course: THREE.Vector3[];
  days: number;
  cells: number;
}

type Phase = 'hop' | 'plot' | 'locked' | 'run' | 'won';

/** The reveal's last framing, about a point between the Wren and the buoy: the hop starts here, so
 * the handover has no jump. */
export const LEG1_VIEW = { yaw: -2.1, pitch: 0.7, dist: 24 } as const;
/** How far from the Wren toward the buoy that framing looks. */
export const LEG1_FOCUS = 0.42;

/**
 * The plot's one framing: from the sun's side of the system, looking out past the buoy at Kethra's
 * next ten days. Kethra's ticks run left to right in the order the days count (→ is "later" on
 * screen as well as on the keys), and the Wren sits low in the frame with its course climbing
 * away. There's no camera control: nothing to learn, nothing to lose.
 */
const PLOT_VIEW = { yaw: Math.PI + 0.52, pitch: 0.86, dist: 66, shift: 16 } as const;
/** While ORION flies the hop: close on the Wren, already turned toward the plot. */
const HOP_VIEW = { pitch: 0.5, dist: 20 } as const;

/** The orbit camera's position for a view about `target`. */
export function orbitPosition(target: THREE.Vector3, view: { yaw: number; pitch: number; dist: number }, out = new THREE.Vector3()): THREE.Vector3 {
  const cp = Math.cos(view.pitch);
  return out.set(target.x + view.dist * cp * Math.sin(view.yaw), target.y + view.dist * Math.sin(view.pitch), target.z + view.dist * cp * Math.cos(view.yaw));
}

const c = (hex: number, k = 1) => new THREE.Color(hex).multiplyScalar(k);
const AMBER = c(INK.amber);
const AMBER_DIM = c(INK.amber, 0.35);
const GROVE = c(INK.grove, 0.9);
const GROVE_DIM = c(INK.grove, 0.28);
const STEEL = c(INK.steel, 0.5);
const INK_BRIGHT = c(INK.ink);
const WARN = c(INK.warn);
const GROVE_FAINT = c(INK.grove, 0.14);
const AMBER_FAINT = c(INK.amber, 0.1);
/** The match: the success green of the rest of the UI. */
const MATCH = c(0x7cbf7c, 1.25);

export class InterceptGame {
  onComplete: ((result: InterceptResult) => void) | null = null;

  private readonly w: InterceptWorld;
  private readonly fx = new MotionScope('game');
  private phase: Phase = 'hop';
  /** Every day the chart offers, 0 (Kethra now) to sim.MAX_MEET_DAY. */
  private readonly meetings = sim.meetings();
  /** The exact intercept the matching day locks onto. */
  private readonly solution = sim.intercept();
  private readonly solutionDay = this.meetings.find((m) => sim.matches(m))!.day;
  /** The same points as vectors, kept: labels are pinned to them every frame. */
  private readonly meetPoints = this.meetings.map((m) => toV3(m.at));
  /** Kethra's path over the days on offer, four points a day. */
  private readonly arcPoints = Array.from({ length: sim.MAX_MEET_DAY * 4 + 1 }, (_, i) => toV3(sim.kethraAt(i / 4)));
  private readonly hopPoints = Array.from({ length: sim.HOP_DAYS }, (_, i) => toV3(sim.hopAt(i + 1)));
  /** Course day ticks, reused: at most one per day of the longest flight on offer. */
  private readonly coursePoints = Array.from({ length: 12 }, () => new THREE.Vector3());
  /** The chosen meeting day. Starts on Kethra now: the natural first guess, and the one to learn from. */
  private meet = 0;
  private held = 0;
  /** Seconds spent choosing, for ORION's help. */
  private choosing = 0;
  private hinted = false;
  private autoOffered = false;
  private hopDay = 0;
  private runDay = 0;
  private flashAt = -1;

  private readonly instrument = new THREE.Group();
  private readonly staticLines = new Lines(600, 3);
  private readonly ticks = new Dots(64, 7);
  private readonly bodies = new Dots(8, 11, 13);
  private readonly halo = new Dots(2, 34, 12);
  private readonly course = new Lines(64, 14);
  private readonly labels = new Labels();
  private dirty = true;

  // Camera: an orbit about a target, every value eased toward its goal.
  private readonly target = new THREE.Vector3();
  private readonly goalTarget = new THREE.Vector3();
  private yaw = 0;
  private pitch = 0.5;
  private dist = 30;
  private goalYaw = 0;
  private goalPitch = 0.5;
  private goalDist = 30;

  private readonly panel: HTMLDivElement;
  private readonly unregister: () => void;
  private wave: { course: THREE.Vector3[]; k: number } | null = null;

  constructor(world: InterceptWorld) {
    this.w = world;
    this.instrument.name = 'intercept-instrument';
    for (const obj of [this.staticLines.object, this.ticks.object, this.bodies.object, this.halo.object, this.course.object]) this.instrument.add(obj);
    world.scene.add(this.instrument);
    // Insight 2 reads Kethra's motion at a glance: the meeting day is marked from the start.
    this.hinted = world.stats.insight >= 2;

    this.panel = document.createElement('div');
    this.panel.className = 'intercept-panel';
    this.panel.setAttribute('aria-live', 'polite');
    this.panel.addEventListener('click', this.onPanelClick);
    const root = document.getElementById('ui-root')!;
    root.append(this.labels.root, this.panel);

    window.addEventListener('keydown', this.onKeyDown);
    world.surface.addEventListener('pointermove', this.onPointerMove);
    world.surface.addEventListener('pointerdown', this.onPointerDown);
    this.unregister = registerMiniGame({ name: 'intercept', win: () => this.debugWin(), fail: () => this.debugFail() });
  }

  /** The point the camera orbits: the scene keeps its near plane in proportion to it. */
  get focus(): THREE.Vector3 {
    return this.target;
  }

  /** Begins with ORION's hop, the camera starting where the reveal left it. */
  start(fromCamera: THREE.Vector3, fromTarget: THREE.Vector3): void {
    this.target.copy(fromTarget);
    const off = fromCamera.clone().sub(fromTarget);
    this.dist = off.length();
    this.pitch = Math.asin(THREE.MathUtils.clamp(off.y / this.dist, -1, 1));
    this.yaw = Math.atan2(off.x, off.z);
    // During the hop the camera stays on the Wren; the pull-out to the plot is what reveals the choice.
    this.goalTarget.copy(this.w.wren.position);
    this.goalYaw = PLOT_VIEW.yaw;
    this.goalPitch = HOP_VIEW.pitch;
    this.goalDist = HOP_VIEW.dist;

    this.phase = 'hop';
    this.placeHop(0);
    this.say('mg1.hop.orion');
    UIManager.setObjective(t('mg1.objective'));
    this.renderPanel();
    this.hop = this.fx.tween({
      duration: motion.reduced ? 0.01 : MG1.HOP_SECONDS,
      ease: ease.standard,
      update: (k) => this.placeHop(k * sim.HOP_DAYS),
      done: () => this.beginChoosing(),
    });
  }
  private hop: { cancel(): void } | null = null;

  private beginChoosing(): void {
    if (this.phase !== 'hop') return;
    this.phase = 'plot';
    this.framePlot();
    this.dirty = true;
    this.placeChoice();
    this.say('mg1.orion');
    this.renderPanel();
  }

  /**
   * The plot's framing: the buoy, where the course starts, and Kethra's next ten days, nudged left of
   * centre so the plate at the top right never covers a tick.
   */
  private framePlot(): void {
    const box = new THREE.Box3().expandByPoint(toV3(sim.TRANSFER_START));
    for (const p of this.meetPoints) box.expandByPoint(p);
    box.getCenter(this.goalTarget);
    // A little toward the buoy, so the Wren sits clear of the captions at the bottom of the frame.
    this.goalTarget.lerp(toV3(sim.TRANSFER_START, _a), 0.15);
    this.goalTarget.x += Math.cos(PLOT_VIEW.yaw) * PLOT_VIEW.shift;
    this.goalTarget.z -= Math.sin(PLOT_VIEW.yaw) * PLOT_VIEW.shift;
    this.goalYaw = PLOT_VIEW.yaw;
    this.goalPitch = PLOT_VIEW.pitch;
    this.goalDist = PLOT_VIEW.dist;
  }

  // ------------------------------------------------------------------ the choice

  private get chosen(): sim.Meeting {
    return this.meetings[this.meet];
  }

  private select(day: number): void {
    const next = THREE.MathUtils.clamp(day, 0, sim.MAX_MEET_DAY);
    if (this.phase !== 'plot' || next === this.meet) return;
    this.meet = next;
    this.held = 0;
    AudioSystem.playHover();
    this.placeChoice();
    this.dirty = true;
    this.renderPanel();
  }

  /** The chosen day matched for long enough: the course locks, and only launching is left. */
  private lock(): void {
    if (this.phase !== 'plot') return;
    this.meet = this.solutionDay;
    this.phase = 'locked';
    this.dirty = true;
    this.placeChoice();
    this.swell(0.2);
    AudioSystem.playSuccess();
    this.say('mg1.locked.orion');
    this.renderPanel();
    this.panel.querySelector<HTMLButtonElement>('[data-act="launch"]')?.focus({ preventScroll: true });
  }

  /** Space before the days match: nothing runs. Say why, and bring ORION's hint forward. */
  private refuse(): void {
    AudioSystem.playError();
    this.flashAt = motion.gameTime;
    if (!this.hinted) {
      this.hinted = true;
      this.say('mg1.hint.lead');
    }
    this.dirty = true;
    this.renderPanel();
  }

  private autoPlot(): void {
    if (this.phase !== 'plot') return;
    this.lock();
  }

  // ------------------------------------------------------------------ the run and the win

  private launch(): void {
    if (this.phase !== 'locked') return;
    this.phase = 'run';
    this.runDay = 0;
    this.dirty = true;
    UIManager.clearCaption();
    AudioSystem.playTone(110, 0.5, 'sine', 0.06);
    AudioSystem.playConfirm();
    this.renderPanel();
  }

  private arrive(): void {
    this.swell(0.35);
    this.win();
  }

  /** Kethra answers the plot: a brief swell when the course locks on it, a bigger one on arrival. */
  private swell(amount: number): void {
    if (motion.reduced) return;
    const k = this.w.kethra;
    const base = this.kethraScale ?? (this.kethraScale = k.scale.x);
    this.fx.tween({ duration: 0.9, update: (_e, raw) => k.scale.setScalar(base * (1 + amount * Math.sin(Math.PI * raw))) });
  }
  private kethraScale: number | null = null;

  private win(): void {
    this.phase = 'won';
    motion.conductor.duck(3);
    const course = [toV3(sim.WREN_START), toV3(sim.BUOY), toV3(this.solution.at)];
    const days = Math.round(this.solution.days);
    const cells = sim.cellsFor(days);
    this.placeRun(this.solution.days);
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
    this.goalDist = 78;
    this.goalPitch = 0.55;
    this.goalYaw = PLOT_VIEW.yaw + 0.5;
    this.fx.after(motion.reduced ? 1.2 : MG1.WIN_HOLD, () => this.onComplete?.({ course, days, cells }));
  }

  // ------------------------------------------------------------------ frame

  update(dt: number): void {
    if (this.phase === 'plot') {
      this.choosing += dt;
      if (sim.matches(this.chosen)) {
        this.held += dt;
        if (this.held >= MG1.LOCK_DWELL) this.lock();
      }
      if (!this.hinted && this.choosing >= MG1.HINT_AFTER) {
        this.hinted = true;
        this.say('mg1.hint.lead');
      }
      if (!this.autoOffered && this.choosing >= MG1.AUTOPLOT_AFTER) {
        this.autoOffered = true;
        this.renderPanel();
      }
      // The hint's pulse and the selection's breathing redraw every frame (a few hundred vertices).
      this.dirty = true;
    } else if (this.phase === 'locked') {
      this.dirty = true;
    } else if (this.phase === 'run') {
      const to = this.solution.days;
      const seconds = motion.reduced ? 0.6 : MG1.RUN_SECONDS;
      const before = Math.floor(this.runDay);
      this.runDay = Math.min(to, this.runDay + (to / seconds) * dt);
      this.placeRun(this.runDay);
      // The camera leans in on the two converging: the Wren and the point they'll meet at.
      this.goalTarget.lerpVectors(this.w.wren.position, this.meetPoints[this.solutionDay], 0.5);
      this.goalDist = 44;
      if (Math.floor(this.runDay) !== before) this.renderPanel();
      this.dirty = true;
      if (this.runDay >= to) this.arrive();
    }

    // Camera: eased to its goal, with a slow drift so the instrument never looks frozen.
    dampVec3(this.target, this.goalTarget, 3.2, dt);
    const drift = this.phase === 'won' ? 0 : Math.sin(motion.ambientTime * 0.18) * 0.035;
    this.yaw = this.dampAngle(this.yaw, this.goalYaw + drift, dt);
    this.pitch = damp(this.pitch, this.goalPitch, 3.2, dt);
    this.dist = damp(this.dist, this.goalDist, 3.2, dt);
    const cam = this.w.camera;
    orbitPosition(this.target, { yaw: this.yaw, pitch: this.pitch, dist: this.dist }, cam.position);
    cam.lookAt(this.target);

    if (this.dirty) this.redraw();
    this.drawLabels();
  }

  /** Eases yaw the short way round. */
  private dampAngle(from: number, to: number, dt: number): number {
    const d = THREE.MathUtils.euclideanModulo(to - from + Math.PI, Math.PI * 2) - Math.PI;
    return from + d * (1 - Math.exp(-3.2 * dt));
  }

  // ------------------------------------------------------------------ placing the bodies

  private placeHop(day: number): void {
    this.hopDay = day;
    this.w.kethra.position.copy(toV3(sim.orbitAt(sim.KETHRA, day)));
    this.placeWren(sim.hopAt(day), sim.sub(sim.BUOY, sim.WREN_START));
    if (this.phase === 'hop') this.goalTarget.copy(this.w.wren.position);
    this.dirty = true;
  }

  /** Kethra where it is now; the Wren at the buoy, nose on the chosen point. */
  private placeChoice(): void {
    this.w.kethra.position.copy(toV3(sim.kethraAt(0)));
    const to = this.phase === 'locked' ? this.solution.at : this.chosen.at;
    this.placeWren(sim.TRANSFER_START, sim.sub(to, sim.TRANSFER_START));
  }

  private placeRun(day: number): void {
    this.w.kethra.position.copy(toV3(sim.kethraAt(day)));
    this.placeWren(sim.transferAt(this.solution.dir, day), this.solution.dir);
  }

  private placeWren(at: sim.Vec, dir: sim.Vec): void {
    this.w.wren.position.set(at.x, at.y, at.z);
    _look.set(at.x + dir.x, at.y + dir.y, at.z + dir.z);
    this.w.wren.lookAt(_look);
    // lookAt aims local +Z; the hull's nose is +X.
    this.w.wren.rotateY(-Math.PI / 2);
  }

  // ------------------------------------------------------------------ drawing

  private redraw(): void {
    this.dirty = false;
    const lines = this.staticLines.clear();
    const bodies = this.bodies.clear();
    const ticks = this.ticks.clear();
    const halo = this.halo.clear();
    const course = this.course.clear();
    this.tickLabels.length = 0;

    // Drop lines to the ecliptic for the bodies: the orrery's height cue.
    const wren = this.w.wren.position;
    bodies.add(wren, INK_BRIGHT);
    lines.add(wren, ground(wren), STEEL);
    const kNow = this.w.kethra.position;
    lines.add(kNow, ground(kNow), GROVE_DIM);

    // ORION's hop, drawn as it's flown and then kept: two days, 8 Mkm apart.
    if (!this.wave) course.add(toV3(sim.WREN_START, _a), toV3(this.phase === 'hop' ? sim.hopAt(this.hopDay) : sim.BUOY, _b), AMBER_DIM);
    this.hopPoints.forEach((p, i) => {
      if (this.phase === 'hop' && i + 1 > this.hopDay + 1e-6) return;
      ticks.add(p, AMBER_DIM);
      if (this.phase === 'hop') this.tickLabels.push({ at: p, text: String(i + 1), cls: 'wren' });
    });

    if (this.phase === 'plot' || this.phase === 'locked') this.drawChoice(lines, ticks, halo, course);
    else if (this.phase === 'run') this.drawRun(lines, ticks, halo, course);
    else if (this.wave) this.drawWave(bodies, course);

    lines.commit();
    bodies.commit();
    ticks.commit();
    halo.commit();
    course.commit();
  }

  private drawChoice(lines: Lines, ticks: Dots, halo: Dots, course: Lines): void {
    const locked = this.phase === 'locked';
    const time = motion.gameTime;
    const chosen = this.chosen;
    const matched = locked || sim.matches(chosen);

    // Kethra's next ten days: its path brightened, a tick per day, each dropped to the grid.
    for (let i = 1; i < this.arcPoints.length; i++) lines.add(this.arcPoints[i - 1], this.arcPoints[i], GROVE_DIM);
    const pulse = 0.55 + 0.45 * Math.sin(time * 5);
    for (const m of this.meetings) {
      const p = this.meetPoints[m.day];
      const isChosen = m.day === this.meet;
      const hint = this.hinted && m.day === this.solutionDay && !isChosen;
      lines.add(p, ground(p), GROVE_FAINT);
      if (m.day === 0) continue;
      ticks.add(p, isChosen ? (matched ? MATCH : INK_BRIGHT) : hint ? _c.setHex(INK.grove).multiplyScalar(0.6 + 0.9 * pulse) : GROVE);
      if (isChosen) continue;
      this.tickLabels.push({ at: p, text: String(m.day), cls: `kethra${isChosen ? ' chosen' : ''}${isChosen && matched ? ' match' : ''}${hint ? ' hint' : ''}` });
    }

    // The course: from the buoy to the chosen point, one amber tick per day of flight.
    const from = toV3(sim.TRANSFER_START, _a);
    const to = locked ? toV3(this.solution.at, _end) : this.meetPoints[this.meet];
    const breathe = locked ? 1 : 0.8 + 0.2 * Math.sin(time * 3);
    course.add(from, to, _c.copy(matched ? MATCH : AMBER).multiplyScalar(breathe));
    const dir = _b.copy(to).sub(from).normalize();
    const flight = locked ? this.solution.days : chosen.wrenDays;
    const days = Math.min(this.coursePoints.length, Math.floor(flight + 1e-6));
    for (let d = 1; d <= days; d++) {
      const p = this.coursePoints[d - 1].copy(from).addScaledVector(dir, sim.SPEED * d);
      ticks.add(p, matched ? MATCH : AMBER);
      lines.add(p, ground(p), AMBER_FAINT);
      this.tickLabels.push({ at: p, text: String(d), cls: `wren${matched ? ' match' : ''}` });
    }

    // The chosen point, ringed: amber while the days disagree, green once they meet.
    const flash = this.flashAt >= 0 && time - this.flashAt < 0.4;
    halo.add(to, matched ? MATCH : flash ? WARN : _c.setHex(INK.amber).multiplyScalar(0.55 + 0.25 * Math.sin(time * 4)));
    const w = chosen.wrenDays.toFixed(1);
    const note = matched
      ? t('mg1.note.match', { day: String(this.solutionDay) })
      : this.meet === 0
        ? t('mg1.note.now', { w })
        : t('mg1.note.day', { day: String(this.meet), w });
    this.tickLabels.push({ at: this.meetPoints[this.meet], text: note, cls: `note chosen-note ${matched ? 'match' : 'warn'}` });
  }

  private drawRun(lines: Lines, ticks: Dots, halo: Dots, course: Lines): void {
    // Both count the same days: the Wren's ticks fill in behind it, Kethra's ahead of it go by.
    const day = Math.floor(this.runDay + 1e-6);
    for (const m of this.meetings) {
      if (m.day === 0 || m.day > this.solutionDay) continue;
      const p = this.meetPoints[m.day];
      ticks.add(p, m.day <= day ? GROVE_DIM : GROVE);
      lines.add(p, ground(p), GROVE_FAINT);
      if (m.day > day) this.tickLabels.push({ at: p, text: String(m.day), cls: `kethra${m.day === this.solutionDay ? ' match' : ''}` });
    }
    const from = toV3(sim.TRANSFER_START, _a);
    const to = toV3(this.solution.at, _end);
    course.add(from, to, MATCH);
    halo.add(to, _c.copy(MATCH).multiplyScalar(0.6 + 0.4 * Math.sin(motion.gameTime * 6)));
    const dir = _b.copy(to).sub(from).normalize();
    for (let d = 1; d <= day; d++) ticks.add(_c3.copy(from).addScaledVector(dir, sim.SPEED * d), MATCH);
  }

  private drawWave(bodies: Dots, course: Lines): void {
    // The win: the course draws itself outward from the Wren in amber, a bright head leading.
    const wave = this.wave!;
    const pts = wave.course;
    const total = pts.slice(1).reduce((s, p, i) => s + p.distanceTo(pts[i]), 0);
    let left = total * wave.k;
    for (let i = 1; i < pts.length && left > 0; i++) {
      const seg = pts[i].distanceTo(pts[i - 1]);
      const end = seg <= left ? pts[i] : _b.lerpVectors(pts[i - 1], pts[i], left / seg).clone();
      course.add(pts[i - 1], end, AMBER);
      left -= seg;
      if (left <= 0 && wave.k < 1) bodies.add(end, INK_BRIGHT);
    }
  }

  private tickLabels: { at: THREE.Vector3; text: string; cls: string }[] = [];

  private drawLabels(): void {
    const cam = this.w.camera;
    const L = this.labels;
    L.begin();
    for (const l of this.tickLabels) L.add(l.at, l.text, l.cls, cam);
    // Kethra-now's chip already names it; at the win the two bodies share a point, and Kethra's name wins.
    const choosingNow = (this.phase === 'plot' || this.phase === 'locked') && this.meet === 0;
    if (!choosingNow) L.add(this.w.kethra.position, t('mg1.label.kethra'), 'body kethra', cam);
    if (this.phase !== 'won') L.add(this.w.wren.position, this.phase === 'run' ? t('mg1.label.day', { day: String(Math.max(1, Math.ceil(this.runDay))) }) : t('mg1.label.wren'), 'body wren', cam);
    L.end();
  }

  // ------------------------------------------------------------------ input

  private blocked(): boolean {
    return PanelManager.isOpen;
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.blocked()) return;
    if (this.phase === 'plot') {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        e.preventDefault();
        this.select(this.meet - 1);
        return;
      }
      if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        e.preventDefault();
        this.select(this.meet + 1);
        return;
      }
    }
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') {
      // A Space still held from skipping the reveal must not launch or refuse anything.
      if (e.repeat) return;
      if (this.phase === 'locked') {
        e.preventDefault();
        this.launch();
      } else if (this.phase === 'plot') {
        e.preventDefault();
        this.refuse();
      }
    }
  };

  private onPanelClick = (e: MouseEvent): void => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (!act || this.blocked()) return;
    if (act === 'launch') this.launch();
    else if (act === 'autoplot') this.autoPlot();
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.phase === 'plot' && !this.blocked()) this.pick(e.clientX, e.clientY);
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (this.blocked() || e.button !== 0) return;
    if (this.phase === 'plot') this.pick(e.clientX, e.clientY);
    else if (this.phase === 'locked') this.launch();
  };

  /** Selects the tick nearest the pointer on screen: the selection follows the mouse, no clicking. */
  private pick(x: number, y: number): void {
    let best = this.meet;
    let bestD = Infinity;
    for (const m of this.meetings) {
      const s = this.toClient(m.at);
      if (!s) continue;
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < bestD) {
        bestD = d;
        best = m.day;
      }
    }
    this.select(best);
  }

  private toClient(p: sim.Vec): { x: number; y: number } | null {
    const v = _a.set(p.x, p.y, p.z).project(this.w.camera);
    if (v.z > 1 || v.z < -1) return null;
    return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight };
  }

  // ------------------------------------------------------------------ the plate

  private renderPanel(): void {
    if (this.phase === 'won') return;
    const head = `<div class="eyebrow">${t('mg1.eyebrow')}</div><h3>${t('mg1.title')}</h3>`;
    if (this.phase === 'hop') {
      this.panel.innerHTML = `${head}<p>${t('mg1.hop.how')}</p>`;
      return;
    }
    if (this.phase === 'run') {
      const day = Math.max(1, Math.ceil(this.runDay));
      this.panel.innerHTML = `${head}<div class="intercept-status match">${t('mg1.status.run', { day: String(day), days: String(Math.round(this.solution.days)) })}</div>`;
      return;
    }
    const locked = this.phase === 'locked';
    const m = locked ? { ...this.meetings[this.solutionDay], wrenDays: this.solution.days } : this.chosen;
    const matched = locked || sim.matches(m);
    const w = m.wrenDays.toFixed(1);
    const status: [StringKey, string] = matched
      ? ['mg1.status.match', 'match']
      : m.day === 0
        ? ['mg1.status.now', 'late']
        : m.wrenDays > m.day
          ? ['mg1.status.late', 'late']
          : ['mg1.status.early', 'early'];
    const nudge = matched ? '' : status[1] === 'late' ? `<span class="keycap">→</span> ${t('mg1.nudge.later')}` : `<span class="keycap">←</span> ${t('mg1.nudge.sooner')}`;
    const flash = this.flashAt >= 0 && motion.gameTime - this.flashAt < 0.5 ? ' flash' : '';
    const action = locked
      ? `<button type="button" class="intercept-launch" data-act="launch"><span class="keycap">Space</span>${t('mg1.key.launch')}</button>`
      : `<div class="intercept-keys"><span><span class="keycap">${t('mg1.key.mouse')}</span> ${t('mg1.key.or')} <span class="keycap">←</span><span class="keycap">→</span> ${t('mg1.key.choose')}</span><span><span class="keycap">Space</span> ${t('mg1.key.launch')}</span></div>`;
    const auto = !locked && this.autoOffered ? `<button type="button" class="intercept-auto" data-act="autoplot">${t('mg1.autoplot')}</button>` : '';
    const stat = this.w.stats.insight >= 2 && !locked ? `<ul class="intercept-stats"><li>${t('mg1.stat.insight')}</li></ul>` : '';
    this.panel.innerHTML = `${head}
      <p>${t('mg1.how')}</p>
      <div class="intercept-readouts${matched ? ' matched' : ''}">
        <div><span class="label">${t('mg1.readout.distance')}</span><span class="num">${Math.round(m.distance)} Mkm</span></div>
        <div><span class="label">${t('mg1.readout.speed')}</span><span class="num">${sim.SPEED} Mkm/day</span></div>
        <div class="wren"><span class="label">${t('mg1.readout.wren')}</span><span class="num">${w} ${t('mg1.readout.days')}</span></div>
        <div class="kethra"><span class="label">${t('mg1.readout.kethra')}</span><span class="num">${m.day === 0 ? t('mg1.readout.now') : `${t('mg1.readout.day')} ${m.day}`}</span></div>
      </div>
      <div class="intercept-status ${status[1]}${flash}">${t(status[0], { day: String(m.day), w })}${nudge ? `<span class="intercept-nudge">${nudge}</span>` : ''}</div>
      ${stat}${action}${auto}`;
  }

  private say(key: StringKey): void {
    UIManager.showCaption(t(key), 5200);
  }

  // ------------------------------------------------------------------ debug harness and tests

  /** F2 in the harness: commit the intercept and go straight to the win. */
  private debugWin(): void {
    if (this.phase === 'won') return;
    this.hop?.cancel();
    this.meet = this.solutionDay;
    this.win();
  }

  /** F3: try to launch on Kethra-now. */
  private debugFail(): void {
    if (this.phase !== 'plot') return;
    this.select(0);
    this.refuse();
  }

  /** What the tests in tools/ read. */
  state(): {
    phase: Phase;
    meet: number;
    wrenDays: number;
    matched: boolean;
    solutionDay: number;
    hinted: boolean;
    autoOffered: boolean;
    ticks: { day: number; x: number; y: number }[];
  } {
    const ticks: { day: number; x: number; y: number }[] = [];
    for (const m of this.meetings) {
      const s = this.toClient(m.at);
      if (s) ticks.push({ day: m.day, x: s.x, y: s.y });
    }
    return {
      phase: this.phase,
      meet: this.meet,
      wrenDays: this.chosen.wrenDays,
      matched: this.phase === 'locked' || sim.matches(this.chosen),
      solutionDay: this.solutionDay,
      hinted: this.hinted,
      autoOffered: this.autoOffered,
      ticks,
    };
  }

  dispose(): void {
    this.unregister();
    this.fx.dispose();
    window.removeEventListener('keydown', this.onKeyDown);
    this.w.surface.removeEventListener('pointermove', this.onPointerMove);
    this.w.surface.removeEventListener('pointerdown', this.onPointerDown);
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
const _c3 = new THREE.Vector3();
const _end = new THREE.Vector3();
const _g = new THREE.Vector3();
const _look = new THREE.Vector3();
const _c = new THREE.Color();

/** The point straight below `p` on the ecliptic grid. A scratch vector: Lines and Dots copy it. */
function ground(p: THREE.Vector3): THREE.Vector3 {
  return _g.set(p.x, 0, p.z);
}
