import { bus } from '../core/EventBus';
import type { EaseFn } from './ease';
import { ease as EASE, cssBezier } from './ease';
import { DUR, EXIT_FACTOR, REDUCED_MAX } from './tokens';
import type { BezierToken, DurToken, SpringConfig } from './tokens';
import { stepSpring, springAtRest } from './spring';
import type { SpringState } from './spring';

/**
 * Two clocks: `game` stops while the game is paused; `ui` never stops, so menus still animate
 * while paused. Every tween, timer and timeline runs in a scope on one of them.
 */
export type Domain = 'game' | 'ui';

interface Active {
  /** Advances by dt; returns false once finished or cancelled, and is then dropped. */
  step(dt: number): boolean;
  cancel(): void;
}

export class DomainClock {
  time = 0;
  private scopes: MotionScope[] = [];

  attach(scope: MotionScope): void {
    this.scopes.push(scope);
  }

  detach(scope: MotionScope): void {
    const i = this.scopes.indexOf(scope);
    if (i >= 0) this.scopes.splice(i, 1);
  }

  advance(dt: number): void {
    this.time += dt;
    for (let i = 0; i < this.scopes.length; i++) this.scopes[i].update(dt);
  }
}

export const clocks: Record<Domain, DomainClock> = { game: new DomainClock(), ui: new DomainClock() };

/** When the engine last ticked the clocks (performance.now ms); see startUiClock. */
let lastEngineTick = -Infinity;
export function markEngineTick(): void {
  lastEngineTick = performance.now();
}

/**
 * Keeps the ui clock running before the engine's loop starts (the title screen) and whenever it
 * isn't ticking. It steps aside whenever the engine has ticked within the last 100 ms, so the clock
 * is never advanced twice in a frame.
 */
export function startUiClock(): void {
  let last = performance.now();
  const loop = (now: number) => {
    requestAnimationFrame(loop);
    if (now - lastEngineTick > 100) clocks.ui.advance(Math.min((now - last) / 1000, 0.1));
    last = now;
  };
  requestAnimationFrame(loop);
}

/** The shared reduced-motion flag. Set it through motion.setReduced (index.ts), which also updates
 * the page's CSS class. */
export const reducedState = { value: false };

export interface TweenOpts {
  duration: number;
  ease?: EaseFn;
  delay?: number;
  /** Called every step with the eased and the raw progress. */
  update: (eased: number, raw: number) => void;
  done?: () => void;
}

export class Tween implements Active {
  private elapsed = 0;
  private direction: 1 | -1 = 1;
  private cancelled = false;
  private finished = false;
  private readonly easeFn: EaseFn;
  private readonly opts: TweenOpts;

  constructor(opts: TweenOpts) {
    this.opts = opts;
    this.easeFn = opts.ease ?? EASE.decelerate;
    this.elapsed = -(opts.delay ?? 0);
  }

  get progress(): number {
    const d = this.opts.duration;
    return d <= 0 ? 1 : Math.min(1, Math.max(0, this.elapsed / d));
  }

  step(dt: number): boolean {
    if (this.cancelled) return false;
    this.elapsed += dt * this.direction;
    const d = this.opts.duration;
    const raw = d <= 0 ? (this.direction > 0 ? 1 : 0) : Math.min(1, Math.max(0, this.elapsed / d));
    if (this.elapsed < 0 && this.direction > 0) return true;
    this.opts.update(this.easeFn(raw), raw);
    const reachedEnd = this.direction > 0 ? raw >= 1 : raw <= 0;
    if (reachedEnd && !this.finished) {
      this.finished = true;
      this.opts.done?.();
      return false;
    }
    return true;
  }

  /** Stops where it is. `done` doesn't run. */
  cancel(): void {
    this.cancelled = true;
  }

  /** Jumps to the end state and runs `done`. */
  finish(): void {
    if (this.cancelled || this.finished) return;
    this.elapsed = this.direction > 0 ? this.opts.duration : 0;
    this.opts.update(this.easeFn(this.direction > 0 ? 1 : 0), this.direction > 0 ? 1 : 0);
    this.finished = true;
    this.cancelled = true;
    this.opts.done?.();
  }

  /** Flips the play direction from the current position. */
  reverse(): void {
    this.direction = this.direction > 0 ? -1 : 1;
    this.finished = false;
  }
}

class Timer implements Active {
  private left: number;
  private cancelled = false;
  private readonly fn: () => void;
  private readonly repeat: number | null;
  constructor(seconds: number, fn: () => void, repeat: number | null) {
    this.left = seconds;
    this.fn = fn;
    this.repeat = repeat;
  }
  step(dt: number): boolean {
    if (this.cancelled) return false;
    this.left -= dt;
    if (this.left > 0) return true;
    this.fn();
    if (this.repeat === null || this.cancelled) return false;
    this.left += this.repeat;
    return true;
  }
  cancel(): void {
    this.cancelled = true;
  }
}

export interface Cue {
  /** Seconds from the timeline's start. */
  at: number;
  run: () => void;
  /** A cue that sets state (not just sound or an effect): it still runs when the timeline is skipped. */
  state?: boolean;
  /** Emitted as `motion:beat` when the cue fires, so sound can land on it. */
  beat?: string;
}

/** A sequence of timed cues on a scope's clock. */
export class Timeline implements Active {
  private t = 0;
  private i = 0;
  private cancelled = false;
  private readonly cues: Cue[];
  readonly duration: number;
  onDone: (() => void) | null = null;

  constructor(cues: Cue[], duration?: number) {
    this.cues = [...cues].sort((a, b) => a.at - b.at);
    this.duration = duration ?? (this.cues.length ? this.cues[this.cues.length - 1].at : 0);
  }

  get time(): number {
    return this.t;
  }

  step(dt: number): boolean {
    if (this.cancelled) return false;
    this.t += dt;
    while (this.i < this.cues.length && this.cues[this.i].at <= this.t) this.fire(this.cues[this.i++]);
    if (this.i >= this.cues.length && this.t >= this.duration) {
      this.cancelled = true;
      this.onDone?.();
      return false;
    }
    return true;
  }

  private fire(cue: Cue): void {
    cue.run();
    if (cue.beat) bus.emit('motion:beat', cue.beat);
  }

  /** Jumps to the end: runs the remaining state cues (not the effects) in order, then onDone. */
  skip(): void {
    if (this.cancelled) return;
    while (this.i < this.cues.length) {
      const cue = this.cues[this.i++];
      if (cue.state) cue.run();
    }
    this.t = this.duration;
    this.cancelled = true;
    this.onDone?.();
  }

  cancel(): void {
    this.cancelled = true;
  }
}

/** A value driven by a spring toward a target that can change at any moment (retargeting keeps velocity). */
export class SpringValue implements Active {
  private readonly s: SpringState;
  private cancelled = false;
  private readonly cfg: SpringConfig;
  private readonly apply: (x: number) => void;
  target: number;

  constructor(initial: number, cfg: SpringConfig, apply: (x: number) => void) {
    this.s = { x: initial, v: 0 };
    this.target = initial;
    this.cfg = cfg;
    this.apply = apply;
  }

  get value(): number {
    return this.s.x;
  }

  set(target: number, kick = 0): void {
    this.target = target;
    this.s.v += kick;
  }

  /** Jumps straight to a value with no motion (loading a saved state, reduced motion). */
  snap(value: number): void {
    this.s.x = value;
    this.s.v = 0;
    this.target = value;
    this.apply(value);
  }

  step(dt: number): boolean {
    if (this.cancelled) return false;
    if (!springAtRest(this.s, this.target)) {
      stepSpring(this.s, this.target, this.cfg, dt);
      this.apply(this.s.x);
    }
    return true;
  }

  cancel(): void {
    this.cancelled = true;
  }
}

export interface AnimateOpts {
  /** A duration token or seconds. */
  dur?: DurToken | number;
  ease?: BezierToken | 'linear';
  /** An exit: runs at EXIT_FACTOR of the duration with the accelerate curve unless told otherwise. */
  exit?: boolean;
  delay?: number;
  fill?: FillMode;
  /** Under reduced motion: 'fade' keeps only opacity frames (the default), 'keep' plays as written. */
  reduced?: 'fade' | 'keep';
}

/**
 * Owns every tween, timer and animation for one scene, panel or component. to() on a property that
 * is already tweening retargets from its current value; dispose() cancels everything, so no timer
 * fires into a disposed scene.
 */
export class MotionScope {
  private items: Active[] = [];
  private props = new Map<object, Map<string, Tween>>();
  private anims = new Set<Animation>();
  private disposed = false;
  readonly domain: Domain;

  constructor(domain: Domain) {
    this.domain = domain;
    clocks[domain].attach(this);
  }

  update(dt: number): void {
    for (let i = 0; i < this.items.length; ) {
      if (this.items[i].step(dt)) i++;
      else this.items.splice(i, 1);
    }
  }

  private add<T extends Active>(item: T): T {
    if (!this.disposed) this.items.push(item);
    else item.cancel();
    return item;
  }

  tween(opts: TweenOpts): Tween {
    return this.add(new Tween(opts));
  }

  /** Tweens a numeric property to `target`, retargeting any tween already running on it. */
  to<T extends object>(obj: T, key: keyof T & string, target: number, opts: { duration: number; ease?: EaseFn; delay?: number; done?: () => void }): Tween {
    let byKey = this.props.get(obj);
    if (!byKey) this.props.set(obj, (byKey = new Map()));
    byKey.get(key)?.cancel();
    const record = obj as Record<string, number>;
    const from = record[key];
    const t = this.tween({
      duration: opts.duration,
      ease: opts.ease,
      delay: opts.delay,
      update: (e) => {
        record[key] = from + (target - from) * e;
      },
      done: () => {
        byKey!.delete(key);
        opts.done?.();
      },
    });
    byKey.set(key, t);
    return t;
  }

  after(seconds: number, fn: () => void): { cancel(): void } {
    return this.add(new Timer(seconds, fn, null));
  }

  /** Resolves after `seconds` on this scope's clock. Never resolves if the scope is disposed first. */
  wait(seconds: number): Promise<void> {
    return new Promise((resolve) => this.after(seconds, resolve));
  }

  every(seconds: number, fn: () => void): { cancel(): void } {
    return this.add(new Timer(seconds, fn, seconds));
  }

  timeline(cues: Cue[], duration?: number): Timeline {
    return this.add(new Timeline(cues, duration));
  }

  spring(initial: number, cfg: SpringConfig, apply: (x: number) => void): SpringValue {
    return this.add(new SpringValue(initial, cfg, apply));
  }

  /** Runs a Web Animation with the motion tokens and the reduced-motion rule; dispose() cancels it. */
  animate(el: Element, keyframes: Keyframe[], opts: AnimateOpts = {}): Animation {
    const base = typeof opts.dur === 'number' ? opts.dur : DUR[opts.dur ?? 'small'];
    let seconds = opts.exit ? base * EXIT_FACTOR : base;
    const curve = opts.ease ?? (opts.exit ? 'accelerate' : 'decelerate');
    let frames = keyframes;
    if (reducedState.value && opts.reduced !== 'keep') {
      seconds = Math.min(seconds, REDUCED_MAX);
      const fadeOnly = keyframes.filter((k) => 'opacity' in k).map((k) => ({ opacity: k.opacity, offset: k.offset }));
      frames = fadeOnly.length >= 2 ? fadeOnly : keyframes;
      if (fadeOnly.length < 2) seconds = 0.001;
    }
    const a = el.animate(frames, {
      duration: seconds * 1000,
      delay: (opts.delay ?? 0) * 1000,
      easing: curve === 'linear' ? 'linear' : cssBezier(curve),
      fill: opts.fill ?? 'none',
    });
    this.anims.add(a);
    a.finished.then(
      () => this.anims.delete(a),
      () => this.anims.delete(a),
    );
    return a;
  }

  /** Cancels everything this scope started. Safe to call twice. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const item of this.items) item.cancel();
    this.items.length = 0;
    this.props.clear();
    for (const a of this.anims) a.cancel();
    this.anims.clear();
    clocks[this.domain].detach(this);
  }
}

/** Offsets for siblings entering in turn: `step` apart, compressed so the last never waits past `cap`. */
export function staggerDelays(count: number, step: number, cap: number): number[] {
  const gap = count > 1 ? Math.min(step, cap / (count - 1)) : 0;
  return Array.from({ length: count }, (_, i) => i * gap);
}
