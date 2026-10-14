import * as THREE from 'three';
import { MotionScope, motion, damp, dampVec3, DUR, ease } from '../../motion';
import { UIManager } from '../../ui/UIManager';
import { PanelManager } from '../../ui/PanelManager';
import { InputManager } from '../../core/InputManager';
import { registerMiniGame } from '../../debug/hooks';
import { AudioSystem } from '../../audio/AudioSystem';
import { t } from '../../content/strings';
import type { StringKey } from '../../content/strings';
import { MG1 } from '../../content/tuning';
import * as sim from './sim';
import { Dots, INK, Lines, toV3 } from './instrument';
import { ChartOverlay } from './overlay';
import type { Pt, SocketState } from './overlay';

/**
 * The Intercept mini-game: chart the course to Kethra in the real 3D system.
 *
 * ORION flies the Wren to the buoy first. The player then drags the course's end (the handle) onto
 * one of Kethra's day markers, each the point Kethra reaches on that day. The plate checks two
 * things: the handle is on a marker, and the Wren's arrival day there (distance / SPEED) equals the
 * marker's day. Launch only works when both pass, and plays the transfer as a fast-forward.
 *
 * The model is in ./sim and the chart's drawing in ./overlay; this class handles input, the camera
 * and the sequence.
 */

export interface InterceptWorld {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** The Wren at plot scale; the game places and turns it. Its nose is local +X. */
  wren: THREE.Object3D;
  /** Kethra; the game moves it along its orbit as plotted days pass. */
  kethra: THREE.Object3D;
  /** Kethra's whole orbit, drawn by the reveal: hidden while the chart shows the path ahead. */
  kethraOrbit?: THREE.Object3D;
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

type Phase = 'hop' | 'plot' | 'run' | 'won';

/** The reveal's last framing, about a point between the Wren and the buoy: the hop starts here, so
 * the handover has no jump. */
export const LEG1_VIEW = { yaw: -2.1, pitch: 0.7, dist: 24 } as const;
/** How far from the Wren toward the buoy that framing looks. */
export const LEG1_FOCUS = 0.42;

/**
 * The fixed camera while charting: from the sun's side, looking out past the buoy at Kethra's next
 * ten days. The markers run left to right in day order (→ is later on screen and on the keys), with
 * the Wren low in the frame. `shift` moves the framing left, clear of the plate.
 */
const PLOT_VIEW = { yaw: Math.PI + 0.52, pitch: 0.86, dist: 60, shift: 19 } as const;
/** Camera while ORION flies the hop: close on the Wren, already turned toward the chart. */
const HOP_VIEW = { pitch: 0.5, dist: 20 } as const;

/** The orbit camera's position for a view about `target`. */
export function orbitPosition(target: THREE.Vector3, view: { yaw: number; pitch: number; dist: number }, out = new THREE.Vector3()): THREE.Vector3 {
  const cp = Math.cos(view.pitch);
  return out.set(target.x + view.dist * cp * Math.sin(view.yaw), target.y + view.dist * Math.sin(view.pitch), target.z + view.dist * cp * Math.cos(view.yaw));
}

const c = (hex: number, k = 1) => new THREE.Color(hex).multiplyScalar(k);
const AMBER = c(INK.amber);
const AMBER_DIM = c(INK.amber, 0.35);
const STEEL = c(INK.steel, 0.5);
const INK_BRIGHT = c(INK.ink);

/** Kethra's path is drawn a little past the last marker so its end arrow shows the direction of travel. */
const PATH_DAYS = sim.MAX_MEET_DAY + 0.6;
/** Initial course length (Mkm) from the buoy toward Kethra's current position; short of every marker. */
const START_REACH = 20;

export class InterceptGame {
  onComplete: ((result: InterceptResult) => void) | null = null;

  private readonly w: InterceptWorld;
  private readonly fx = new MotionScope('game');
  private phase: Phase = 'hop';
  /** Every day the chart offers, 0 (Kethra now) to sim.MAX_MEET_DAY. */
  private readonly meetings = sim.meetings();
  /** The exact intercept the matching marker stands for. */
  private readonly solution = sim.intercept();
  private readonly solutionDay = this.meetings.find((m) => sim.matches(m))!.day;
  private readonly meetPoints = this.meetings.map((m) => toV3(m.at));
  private readonly pathPoints = Array.from({ length: Math.round(PATH_DAYS * 4) + 1 }, (_, i) => toV3(sim.kethraAt(i / 4)));
  private readonly hopPoints = Array.from({ length: sim.HOP_DAYS }, (_, i) => toV3(sim.hopAt(i + 1)));
  private readonly origin = toV3(sim.TRANSFER_START);
  /** The plane the free handle slides on: Kethra's own orbital plane, so every marker lies in it. */
  private readonly plane: THREE.Plane;

  // The charter.
  /** The course's end, where the handle is. */
  private readonly end = new THREE.Vector3();
  /** The day marker the handle is plugged into, or null while it floats free. */
  private socket: number | null = null;
  private dragging = false;
  /** The pointer doing the dragging, so a second finger can't end it. */
  private pointerId = -1;
  /** The marker under the pointer while dragging, highlighted. */
  private hover: number | null = null;
  /** The player has moved the handle at least once (hides the "Drag me" chip). */
  private touched = false;
  /** Seconds spent charting without a correct course; drives the hint timers. */
  private stuck = 0;
  private hinted = false;
  private pulsing = false;
  private autoOffered = false;
  private toldNow = false;
  private assisting = false;
  private flash: 'path' | 'day' | null = null;
  private flashAt = -1;
  private hopDay = 0;
  private runDay = 0;
  private hop: { cancel(): void } | null = null;

  // 3D lines for the hop and the win animation; the chart itself is the overlay.
  private readonly instrument = new THREE.Group();
  private readonly lines = new Lines(64, 3);
  private readonly ticks = new Dots(16, 7);
  private readonly bodies = new Dots(8, 11, 13);
  private readonly course = new Lines(64, 14);
  private readonly overlay: ChartOverlay;
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
  private panelKey = '';
  private readonly touchAction: string;
  private readonly unregister: () => void;
  private wave: { course: THREE.Vector3[]; k: number } | null = null;

  constructor(world: InterceptWorld) {
    this.w = world;
    this.instrument.name = 'intercept-instrument';
    for (const obj of [this.lines.object, this.ticks.object, this.bodies.object, this.course.object]) this.instrument.add(obj);
    world.scene.add(this.instrument);
    this.plane = new THREE.Plane().setFromNormalAndCoplanarPoint(toV3(sim.orbitNormal(sim.KETHRA)), new THREE.Vector3());
    // Insight 2: the matching marker is highlighted from the start.
    this.pulsing = world.stats.insight >= 2;
    this.resetEnd();

    this.overlay = new ChartOverlay(this.meetings.length, 12);
    this.panel = document.createElement('div');
    this.panel.className = 'intercept-panel charter';
    this.panel.setAttribute('aria-live', 'polite');
    this.panel.addEventListener('click', this.onPanelClick);
    const root = document.getElementById('ui-root')!;
    root.append(this.overlay.root, this.panel);

    // The chart uses a visible cursor, so a click must not capture the mouse (pointer lock).
    InputManager.captureAllowed = false;
    InputManager.exitPointerLock();
    // Touch drags move the handle instead of scrolling or zooming the page.
    this.touchAction = world.surface.style.touchAction;
    world.surface.style.touchAction = 'none';
    window.addEventListener('keydown', this.onKeyDown);
    world.surface.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
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
    // During the hop the camera follows the Wren; beginCharting() pulls out to the chart.
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
      done: () => this.beginCharting(),
    });
  }

  private beginCharting(): void {
    if (this.phase !== 'hop') return;
    this.phase = 'plot';
    this.framePlot();
    this.dirty = true;
    if (this.w.kethraOrbit) this.w.kethraOrbit.visible = false;
    this.overlay.setVisible(true);
    this.placeCharting();
    this.say('mg1.orion');
    this.renderPanel();
  }

  /** The chart's framing: the buoy and Kethra's next ten days, left of the plate at the top right. */
  private framePlot(): void {
    const box = new THREE.Box3().expandByPoint(this.origin);
    for (const p of this.meetPoints) box.expandByPoint(p);
    box.getCenter(this.goalTarget);
    this.goalTarget.lerp(this.origin, 0.12);
    this.goalTarget.x += Math.cos(PLOT_VIEW.yaw) * PLOT_VIEW.shift;
    this.goalTarget.z -= Math.sin(PLOT_VIEW.yaw) * PLOT_VIEW.shift;
    this.goalYaw = PLOT_VIEW.yaw;
    this.goalPitch = PLOT_VIEW.pitch;
    this.goalDist = PLOT_VIEW.dist;
  }

  // ------------------------------------------------------------------ the charter

  private get ready(): boolean {
    return this.socket !== null && sim.matches(this.meetings[this.socket]);
  }

  /** Days from the buoy to the handle, as the chart shows them. */
  private get arrival(): number {
    return sim.arrivalDay(sim.arrivalDays(this.end));
  }

  private resetEnd(): void {
    const toward = toV3(sim.kethraAt(0)).sub(this.origin).normalize();
    this.end.copy(this.origin).addScaledVector(toward, START_REACH);
    this.socket = null;
  }

  /** Plugs the handle into a day marker. */
  private connect(day: number): void {
    const next = THREE.MathUtils.clamp(day, 0, sim.MAX_MEET_DAY);
    this.end.copy(this.meetPoints[next]);
    if (this.socket === next) return;
    this.socket = next;
    this.dirty = true;
    if (this.ready) {
      AudioSystem.playSuccess();
      this.swell(0.18);
    } else AudioSystem.playHover();
    if (next === 0 && !this.toldNow && !this.ready) {
      this.toldNow = true;
      this.say('mg1.now.orion');
    }
    this.renderPanel();
  }

  private unplug(): void {
    if (this.socket === null) return;
    this.socket = null;
    this.dirty = true;
    this.renderPanel();
  }

  /** Moves the handle to a screen point: onto the nearest marker if it's close, else free on the plane. */
  private moveHandleTo(x: number, y: number): void {
    const near = this.nearestSocket(x, y, this.snapRadius());
    if (near !== null) {
      this.connect(near);
      return;
    }
    const p = this.pointOnPlane(x, y);
    if (!p) return;
    const off = p.sub(this.origin);
    const len = THREE.MathUtils.clamp(off.length(), sim.MIN_REACH, sim.MAX_REACH);
    this.end.copy(this.origin).addScaledVector(off.normalize(), len);
    this.unplug();
    this.dirty = true;
  }

  /** Steps the handle a marker along Kethra's path (keyboard). Unplugged, the first step plugs it into "now". */
  private step(dir: -1 | 1): void {
    if (this.phase !== 'plot' || this.assisting) return;
    this.touched = true;
    this.connect(this.socket === null ? 0 : this.socket + dir);
    this.renderPanel();
  }

  /** Launch before both checks pass: flash the failing check and hint; a second refusal also highlights the matching marker. */
  private refuse(): void {
    AudioSystem.playError();
    this.flash = this.socket === null ? 'path' : 'day';
    this.flashAt = motion.gameTime;
    if (this.hinted) this.pulsing = true;
    this.hinted = true;
    this.say(this.socket === null ? 'mg1.hint.path' : 'mg1.hint.day');
    this.panelKey = '';
    this.renderPanel();
  }

  /** "Let ORION connect it": animates the handle onto the matching marker. The player still has to launch. */
  private autoPlot(): void {
    if (this.phase !== 'plot' || this.assisting || this.ready) return;
    this.assisting = true;
    this.dragging = false;
    this.touched = true;
    const from = this.end.clone();
    const to = this.meetPoints[this.solutionDay];
    this.fx.tween({
      duration: motion.reduced ? 0.01 : 0.8,
      ease: ease.standard,
      update: (k) => {
        this.end.lerpVectors(from, to, k);
        this.dirty = true;
      },
      done: () => {
        this.assisting = false;
        this.connect(this.solutionDay);
        this.focusLaunch();
      },
    });
  }

  private focusLaunch(): void {
    this.panel.querySelector<HTMLButtonElement>('[data-act="launch"]')?.focus({ preventScroll: true });
  }

  // ------------------------------------------------------------------ the run and the win

  private launch(): void {
    if (this.phase !== 'plot' || this.assisting) return;
    if (!this.ready) {
      this.refuse();
      return;
    }
    this.phase = 'run';
    this.dragging = false;
    this.runDay = 0;
    this.dirty = true;
    this.setCursor('');
    UIManager.clearCaption();
    AudioSystem.playTone(110, 0.5, 'sine', 0.06);
    AudioSystem.playConfirm();
    this.renderPanel();
  }

  private arrive(): void {
    this.swell(0.35);
    this.win();
  }

  /** Briefly scales Kethra up and back: a little when the course connects, more on arrival. */
  private swell(amount: number): void {
    if (motion.reduced) return;
    const k = this.w.kethra;
    const base = this.kethraScale ?? (this.kethraScale = k.scale.x);
    this.fx.tween({ duration: 0.9, update: (_e, raw) => k.scale.setScalar(base * (1 + amount * Math.sin(Math.PI * raw))) });
  }
  private kethraScale: number | null = null;

  private win(): void {
    this.phase = 'won';
    this.dragging = false;
    this.setCursor('');
    motion.conductor.duck(3);
    this.overlay.setVisible(false);
    if (this.w.kethraOrbit) this.w.kethraOrbit.visible = true;
    const course = [toV3(sim.WREN_START), toV3(sim.BUOY), toV3(this.solution.at)];
    const days = Math.round(this.solution.days);
    const cells = sim.cellsFor(days);
    this.placeRun(this.solution.days);
    // Animates the course drawing itself outward from the Wren (see drawWave).
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
    // Ease the camera out to frame the whole course.
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
      if (!this.ready && !this.assisting) {
        this.stuck += dt;
        if (!this.hinted && this.stuck >= MG1.HINT_AFTER) {
          this.hinted = true;
          this.say(this.socket === null ? 'mg1.hint.path' : 'mg1.hint.day');
        }
        if (!this.pulsing && this.stuck >= MG1.PULSE_AFTER) this.pulsing = true;
        if (!this.autoOffered && this.stuck >= MG1.AUTOPLOT_AFTER) {
          this.autoOffered = true;
          this.renderPanel();
        }
      }
      this.placeCharting();
      if (this.flash && motion.gameTime - this.flashAt > 0.6) {
        this.flash = null;
        this.renderPanel();
      }
    } else if (this.phase === 'run') {
      const to = this.solution.days;
      const seconds = motion.reduced ? 0.6 : MG1.RUN_SECONDS;
      const before = Math.floor(this.runDay);
      this.runDay = Math.min(to, this.runDay + (to / seconds) * dt);
      this.placeRun(this.runDay);
      // Keep the camera between the Wren and the meeting point.
      this.goalTarget.lerpVectors(this.w.wren.position, this.meetPoints[this.solutionDay], 0.5);
      this.goalDist = 44;
      if (Math.floor(this.runDay) !== before) this.renderPanel();
      if (this.runDay >= to) this.arrive();
    }

    // Camera: eased toward its goal, with a slow yaw drift. The drift is smaller while charting so
    // the markers stay under the pointer.
    dampVec3(this.target, this.goalTarget, 3.2, dt);
    const sway = this.phase === 'won' ? 0 : this.phase === 'plot' ? 0.012 : 0.035;
    const drift = Math.sin(motion.ambientTime * 0.18) * sway;
    this.yaw = this.dampAngle(this.yaw, this.goalYaw + drift, dt);
    this.pitch = damp(this.pitch, this.goalPitch, 3.2, dt);
    this.dist = damp(this.dist, this.goalDist, 3.2, dt);
    const cam = this.w.camera;
    orbitPosition(this.target, { yaw: this.yaw, pitch: this.pitch, dist: this.dist }, cam.position);
    cam.lookAt(this.target);
    cam.updateMatrixWorld();

    if (this.dirty) this.redraw();
    this.drawChart();
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

  /** Kethra at its current position; the Wren at the buoy with its nose toward the handle. */
  private placeCharting(): void {
    this.w.kethra.position.copy(this.meetPoints[0]);
    this.placeWren(sim.TRANSFER_START, sim.sub(this.end, sim.TRANSFER_START));
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

  // ------------------------------------------------------------------ drawing: the 3D instrument

  private redraw(): void {
    this.dirty = false;
    const lines = this.lines.clear();
    const bodies = this.bodies.clear();
    const ticks = this.ticks.clear();
    const course = this.course.clear();

    if (this.phase === 'hop') {
      // The hop, drawn up to the current day: two ticks, 8 Mkm apart.
      const wren = this.w.wren.position;
      bodies.add(wren, INK_BRIGHT);
      lines.add(wren, ground(wren), STEEL);
      course.add(toV3(sim.WREN_START, _a), toV3(sim.hopAt(this.hopDay), _b), AMBER_DIM);
      this.hopPoints.forEach((p, i) => {
        if (i + 1 <= this.hopDay + 1e-6) ticks.add(p, AMBER);
      });
    } else if (this.phase === 'plot' || this.phase === 'run') {
      // Keep the hop's line, dimmed, while charting and flying.
      course.add(toV3(sim.WREN_START, _a), this.origin, AMBER_DIM);
    } else if (this.wave) this.drawWave(bodies, course);

    lines.commit();
    bodies.commit();
    ticks.commit();
    course.commit();
  }

  private drawWave(bodies: Dots, course: Lines): void {
    // The course drawn from the Wren out to fraction wave.k of its length, with a bright dot at the head.
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

  // ------------------------------------------------------------------ drawing: the chart

  private drawChart(): void {
    const o = this.overlay;
    const W = window.innerWidth;
    const H = window.innerHeight;
    // Read before this frame writes anything, so it costs no extra layout.
    const plateLeft = this.phase === 'plot' ? this.panel.getBoundingClientRect().left : W;
    o.begin(W, H);
    if (this.phase !== 'plot' && this.phase !== 'run') {
      o.end();
      return;
    }
    const run = this.phase === 'run';
    // The course's start (the buoy); marker numbers go on the side of the path away from it.
    const from = this.screen(this.origin, _s2);

    // Kethra's path ahead, with chevrons showing its direction of travel.
    const path: Pt[] = this.pathPoints.map((p) => this.screen(p, { x: 0, y: 0 }));
    o.kethraPath(path, [2.5 / PATH_DAYS, 7.5 / PATH_DAYS, 1]);

    // Day markers, numbered on the far side of the path so the numbers never overlap the course.
    const runDay = Math.floor(this.runDay + 1e-6);
    const pulse = this.pulsing && !this.ready && !run;
    for (const m of this.meetings) {
      const p = path[m.day * 4];
      const out = this.outward(m.day, path, from);
      const plugged = !run && this.socket === m.day;
      let state: SocketState = 'idle';
      if (run) state = m.day === this.solutionDay ? 'target' : m.day <= runDay ? 'passed' : 'idle';
      else if (plugged) state = this.ready ? 'good' : 'bad';
      else if (this.dragging && this.hover === m.day) state = 'near';
      const hint = pulse && m.day === this.solutionDay;
      o.socket(m.day, p, state, { big: m.day === 0, hint });
      if (run && m.day === 0) continue;
      if (plugged) {
        const text = m.day === 0 ? t('mg1.chip.kethraNow') : t('mg1.chip.kethra', { day: String(m.day) });
        o.chip({ x: p.x + out.x * 50, y: p.y + out.y * 50 }, `${this.ready ? '✓' : '✕'} ${text}`, this.ready ? 'good' : 'bad', 'center', 'big');
      } else if (m.day === 0) {
        o.chip({ x: p.x + out.x * 36, y: p.y + out.y * 36 }, t('mg1.chip.now'), 'kethra', 'center');
      } else {
        o.chip({ x: p.x + out.x * 22, y: p.y + out.y * 22 }, String(m.day), run && m.day === this.solutionDay ? 'good' : 'kethra', 'center', `num${hint ? ' hint' : ''}${state === 'passed' ? ' passed' : ''}`);
      }
    }

    if (run) {
      // During the run: the course in green, a day counter on the Wren, and Kethra's label following it.
      const to = this.screen(this.meetPoints[this.solutionDay], _s1);
      o.courseLine(from, to, 'good', this.courseDots(from, to, sim.arrivalDays(this.meetPoints[this.solutionDay]), Math.floor(this.runDay)));
      const wren = this.screen(this.w.wren.position, _s0);
      o.chip({ x: wren.x - 16, y: wren.y }, t('mg1.label.day', { day: String(Math.max(1, Math.ceil(this.runDay))) }), 'you', 'left', 'big');
      const k = this.screen(this.w.kethra.position, _s3);
      o.chip({ x: k.x, y: k.y + 30 }, t('mg1.label.kethra'), 'kethra', 'center');
      o.end();
      return;
    }

    // The course from the Wren to the handle, with a dot per day of flight.
    const h = this.screen(this.end, _s1);
    const good = this.ready;
    o.courseLine(from, h, good ? 'good' : 'you', this.courseDots(from, h, sim.arrivalDays(this.end)));
    o.handleAt(h, good ? 'good' : this.dragging || this.assisting ? 'drag' : this.touched ? 'set' : 'idle');
    o.chip({ x: from.x - 16, y: from.y }, t('mg1.label.wren'), 'plain', 'left');

    // The handle's chip sits beside it, square to the course on the downward side, and is shifted
    // left so it never runs under the plate.
    const side = this.chipSide(h, from);
    const at = { x: h.x + side.x * 30, y: h.y + side.y * 30 };
    const text = this.touched ? `${good ? '✓ ' : ''}${t('mg1.chip.wren', { day: String(this.arrival) })}` : t('mg1.chip.drag');
    const anchor = side.x >= 0 ? 'right' : 'left';
    if (anchor === 'right') at.x = Math.min(at.x, plateLeft - 12 - text.length * 8.6 - 20);
    o.chip(at, text, this.touched ? (good ? 'good' : 'you') : 'you', anchor, this.touched ? 'big' : 'cta');
    o.end();
  }

  /** Dots along the course, one per whole day of flight (up to `upTo` days, if given). */
  private courseDots(from: Pt, to: Pt, days: number, upTo = Infinity): Pt[] {
    const out: Pt[] = [];
    const n = Math.min(Math.floor(days + 1e-6), upTo, 11);
    for (let d = 1; d <= n; d++) {
      const k = d / days;
      if (k >= 0.97) break;
      out.push({ x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k });
    }
    return out;
  }

  /** The screen direction off Kethra's path at a marker, away from the Wren. */
  private outward(day: number, path: Pt[], wren: Pt): Pt {
    const i = day * 4;
    const a = path[Math.max(0, i - 1)];
    const b = path[Math.min(path.length - 1, i + 1)];
    let nx = -(b.y - a.y);
    let ny = b.x - a.x;
    const l = Math.hypot(nx, ny) || 1;
    nx /= l;
    ny /= l;
    const p = path[i];
    if (nx * (p.x - wren.x) + ny * (p.y - wren.y) < 0) {
      nx = -nx;
      ny = -ny;
    }
    return { x: nx, y: ny };
  }

  /** Unit offset from the handle, perpendicular to the course and pointing down the screen. */
  private chipSide(h: Pt, from: Pt): Pt {
    let cx = from.x - h.x;
    let cy = from.y - h.y;
    const l = Math.hypot(cx, cy) || 1;
    cx /= l;
    cy /= l;
    let px = -cy;
    let py = cx;
    if (py < 0) {
      px = -px;
      py = -py;
    }
    return { x: px, y: py };
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
        this.step(-1);
        return;
      }
      if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        e.preventDefault();
        this.step(1);
        return;
      }
    }
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') {
      // A Space still held from skipping the reveal must not launch or refuse anything.
      if (e.repeat || this.phase !== 'plot') return;
      e.preventDefault();
      this.launch();
    }
  };

  private onPanelClick = (e: MouseEvent): void => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (!act || this.blocked()) return;
    if (act === 'launch') this.launch();
    else if (act === 'autoplot') this.autoPlot();
  };

  /** A press anywhere on the chart picks up the handle and moves it to the pointer (no precise grab needed). */
  private onPointerDown = (e: PointerEvent): void => {
    if (this.blocked() || e.button !== 0 || this.phase !== 'plot' || this.assisting) return;
    this.dragging = true;
    this.touched = true;
    this.pointerId = e.pointerId;
    try {
      this.w.surface.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic or already-released pointers can't be captured; window listeners still follow.
    }
    this.setCursor('grabbing');
    this.moveHandleTo(e.clientX, e.clientY);
    this.hover = this.socket;
    this.renderPanel();
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.phase !== 'plot' || this.blocked()) return;
    if (this.dragging) {
      this.moveHandleTo(e.clientX, e.clientY);
      this.hover = this.nearestSocket(e.clientX, e.clientY, this.snapRadius());
      return;
    }
    if (e.target !== this.w.surface) return;
    // Grab cursor where a press would pick up the handle.
    const h = this.screen(this.end, _s1);
    const onHandle = Math.hypot(h.x - e.clientX, h.y - e.clientY) < 34;
    const onPath = this.nearestSocket(e.clientX, e.clientY, this.snapRadius()) !== null;
    this.setCursor(onHandle || onPath ? 'grab' : 'crosshair');
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.dragging || (this.pointerId >= 0 && e.pointerId !== this.pointerId)) return;
    this.dragging = false;
    this.hover = null;
    this.pointerId = -1;
    this.setCursor('grab');
    if (this.ready) {
      this.say('mg1.ready.orion');
      this.focusLaunch();
    }
    this.renderPanel();
  };

  private setCursor(cursor: string): void {
    if (this.w.surface.style.cursor !== cursor) this.w.surface.style.cursor = cursor;
  }

  /** Snap radius in px. Markers are ~45 px apart at 1366 wide, so anywhere near the path snaps to one. */
  private snapRadius(): number {
    return Math.max(44, Math.min(window.innerWidth, window.innerHeight * 1.8) * 0.045);
  }

  private nearestSocket(x: number, y: number, radius: number): number | null {
    let best: number | null = null;
    let bestD = radius;
    for (const m of this.meetings) {
      const s = this.screen(this.meetPoints[m.day], _s3);
      // Day 0's ring (around Kethra) is bigger, so it snaps from further away.
      const d = Math.hypot(s.x - x, s.y - y) - (m.day === 0 ? 10 : 0);
      if (d < bestD) {
        bestD = d;
        best = m.day;
      }
    }
    return best;
  }

  private readonly ray = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();

  private pointOnPlane(x: number, y: number): THREE.Vector3 | null {
    this.ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.w.camera);
    return this.ray.ray.intersectPlane(this.plane, new THREE.Vector3());
  }

  private screen(p: THREE.Vector3, out: Pt): Pt {
    const v = _a.copy(p).project(this.w.camera);
    out.x = ((v.x + 1) / 2) * window.innerWidth;
    out.y = ((1 - v.y) / 2) * window.innerHeight;
    return out;
  }

  // ------------------------------------------------------------------ the plate

  private renderPanel(): void {
    if (this.phase === 'won') return;
    const head = `<div class="eyebrow">${t('mg1.eyebrow')}</div><h3>${t('mg1.title')}</h3>`;
    if (this.phase === 'hop') {
      this.setPanel('hop', `${head}<p>${t('mg1.hop.how')}</p>`);
      return;
    }
    if (this.phase === 'run') {
      const day = Math.max(1, Math.ceil(this.runDay));
      this.setPanel(`run${day}`, `${head}<div class="intercept-status match">${t('mg1.status.run', { day: String(day), days: String(Math.round(this.solution.days)) })}</div>`);
      return;
    }

    const plugged = this.socket !== null;
    const ready = this.ready;
    const m = plugged ? this.meetings[this.socket!] : null;
    const we = this.arrival;
    const pathRow = plugged ? 'ok' : 'bad';
    const dayRow = ready ? 'ok' : plugged ? 'bad' : 'todo';
    let detail = t('mg1.check.day.todo');
    if (m && ready) detail = t('mg1.check.day.ok', { day: String(m.day) });
    else if (m && m.day === 0) detail = t('mg1.check.day.now', { we: String(we) });
    else if (m && we > m.day) detail = t('mg1.check.day.late', { we: String(we), day: String(m.day) });
    else if (m) detail = t('mg1.check.day.early', { we: String(we), day: String(m.day) });
    const nudge = m && !ready ? (m.day === 0 || we > m.day ? `<span class="charter-nudge">${t('mg1.nudge.later')} <span class="keycap">→</span></span>` : `<span class="charter-nudge"><span class="keycap">←</span> ${t('mg1.nudge.sooner')}</span>`) : '';
    const flash = (row: 'path' | 'day') => (this.flash === row ? ' flash' : '');
    const mark = (s: string) => `<i class="mark" aria-hidden="true">${s === 'ok' ? '✓' : s === 'bad' ? '✕' : '·'}</i>`;
    const stat = this.w.stats.insight >= 2 && !ready ? `<ul class="intercept-stats"><li>${t('mg1.stat.insight')}</li></ul>` : '';
    const auto = !ready && this.autoOffered ? `<button type="button" class="intercept-auto" data-act="autoplot">${t('mg1.autoplot')}</button>` : '';
    const key = `plot|${this.socket}|${ready}|${this.touched}|${this.flash}|${this.autoOffered}|${we}`;
    this.setPanel(
      key,
      `${head}
      <p class="charter-how">${t('mg1.how')}</p>
      <ul class="charter-legend" aria-label="${t('mg1.legend.label')}">
        <li><i class="lg-knob" aria-hidden="true"></i>${t('mg1.legend.you')}</li>
        <li><i class="lg-ring" aria-hidden="true"></i>${t('mg1.legend.kethra')}</li>
        <li><i class="lg-ok" aria-hidden="true">✓</i>${t('mg1.legend.ok')}</li>
      </ul>
      <ol class="charter-checks">
        <li class="${pathRow}${flash('path')}" data-check="path">${mark(pathRow)}<span>${t('mg1.check.path')}<small>${plugged ? t('mg1.check.path.ok') : t('mg1.check.path.todo')}</small></span></li>
        <li class="${dayRow}${flash('day')}" data-check="day">${mark(dayRow)}<span>${t('mg1.check.day')}<small>${detail}</small>${nudge}</span></li>
      </ol>
      ${stat}
      <button type="button" class="charter-launch${ready ? ' ready' : ''}" data-act="launch" aria-disabled="${ready ? 'false' : 'true'}"><span class="keycap">Space</span>${ready ? t('mg1.key.launch') : t('mg1.key.launchWait')}</button>
      <div class="intercept-keys"><span><span class="keycap">${t('mg1.key.mouse')}</span> ${t('mg1.key.drag')}</span><span>${t('mg1.key.or')} <span class="keycap">←</span><span class="keycap">→</span> ${t('mg1.key.step')}</span></div>
      ${auto}`,
    );
  }

  /** Rewrites the plate only when what it says has changed, so a focused button keeps its focus. */
  private setPanel(key: string, html: string): void {
    if (key === this.panelKey) return;
    const focused = document.activeElement instanceof HTMLElement && this.panel.contains(document.activeElement) ? document.activeElement.dataset.act : undefined;
    this.panelKey = key;
    this.panel.innerHTML = html;
    if (focused) this.panel.querySelector<HTMLElement>(`[data-act="${focused}"]`)?.focus({ preventScroll: true });
  }

  private say(key: StringKey): void {
    UIManager.showCaption(t(key), 5200);
  }

  // ------------------------------------------------------------------ debug harness and tests

  /** F2 in the harness: commit the intercept and go straight to the win. */
  private debugWin(): void {
    if (this.phase === 'won') return;
    this.hop?.cancel();
    this.socket = this.solutionDay;
    this.win();
  }

  /** F3: plug into Kethra-now and try to launch. */
  private debugFail(): void {
    if (this.phase !== 'plot') return;
    this.connect(0);
    this.launch();
  }

  /** What the tests in tools/ read. Screen positions are CSS pixels, as the pointer sees them. */
  state(): {
    phase: Phase;
    socket: number | null;
    ready: boolean;
    touched: boolean;
    arrival: number;
    solutionDay: number;
    hinted: boolean;
    pulsing: boolean;
    autoOffered: boolean;
    handle: Pt;
    wren: Pt;
    sockets: { day: number; x: number; y: number }[];
  } {
    return {
      phase: this.phase,
      socket: this.socket,
      ready: this.ready,
      touched: this.touched,
      arrival: this.arrival,
      solutionDay: this.solutionDay,
      hinted: this.hinted,
      pulsing: this.pulsing,
      autoOffered: this.autoOffered,
      handle: this.screen(this.end, { x: 0, y: 0 }),
      wren: this.screen(this.origin, { x: 0, y: 0 }),
      sockets: this.meetings.map((m) => ({ day: m.day, ...this.screen(this.meetPoints[m.day], { x: 0, y: 0 }) })),
    };
  }

  dispose(): void {
    this.unregister();
    this.fx.dispose();
    window.removeEventListener('keydown', this.onKeyDown);
    this.w.surface.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    this.setCursor('');
    InputManager.captureAllowed = true;
    this.w.surface.style.touchAction = this.touchAction;
    if (this.w.kethraOrbit) this.w.kethraOrbit.visible = true;
    this.overlay.dispose();
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
const _g = new THREE.Vector3();
const _look = new THREE.Vector3();
const _s0: Pt = { x: 0, y: 0 };
const _s1: Pt = { x: 0, y: 0 };
const _s2: Pt = { x: 0, y: 0 };
const _s3: Pt = { x: 0, y: 0 };

/** The point straight below `p` on the ecliptic grid. A scratch vector: Lines and Dots copy it. */
function ground(p: THREE.Vector3): THREE.Vector3 {
  return _g.set(p.x, 0, p.z);
}
