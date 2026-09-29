import { bus } from '../core/EventBus';
import { AMBIENT_DUCK, DUR, FLASH_LIMIT_PER_SECOND } from './tokens';
import { clocks, markEngineTick, MotionScope, reducedState } from './core';
import { damp } from './spring';

export { DUR, EXIT_FACTOR, STAGGER, SPRING, REDUCED_MAX, BEZIER, AMBIENT_DUCK } from './tokens';
export type { DurToken, BezierToken, SpringToken, SpringConfig } from './tokens';
export { ease, cubicBezier, cssBezier } from './ease';
export type { EaseFn } from './ease';
export { damp, dampVec3, dampAngle, stepSpring, springAtRest } from './spring';
export { MotionScope, Tween, Timeline, SpringValue, staggerDelays, startUiClock } from './core';
export type { Cue, Domain, AnimateOpts } from './core';
export { CameraPath } from './cameraPath';
export type { CameraKey } from './cameraPath';
export { applyCssTokens } from './css';

const flashTimes: number[] = [];
/** Frames the debug harness asked to step while frozen. */
let pendingSteps = 0;

const holds = new Set<string>();
let duckUntil = -1;
let ambient = 1;
let ambientTime = 0;

/**
 * Coordinates cinematic moments.
 * - hold(key) hides the HUD: the body gets the `conducting` class and `motion:conducting` is
 *   emitted, so HUD updates can wait for the release.
 * - duck(seconds) eases ambient world motion down to AMBIENT_DUCK and back. Scenes opt in by driving
 *   idle motion from `motion.ambient` and `motion.ambientTime`.
 */
const conductor = {
  /** Hides the HUD under `key`; holds can overlap, and the HUD returns when the last is released. */
  hold(key: string): void {
    if (holds.has(key)) return;
    holds.add(key);
    if (holds.size > 1) return;
    document.body.classList.add('conducting');
    bus.emit('motion:conducting', true);
  },
  release(key: string): void {
    if (!holds.delete(key) || holds.size) return;
    document.body.classList.remove('conducting');
    bus.emit('motion:conducting', false);
  },
  get holding(): boolean {
    return holds.size > 0;
  },
  /** Ducks ambient motion for `seconds` of game time. */
  duck(seconds: number): void {
    duckUntil = Math.max(duckUntil, clocks.game.time + seconds);
  },
};

/**
 * Motion entry point. The engine calls tick() once per display frame; animations read the game or
 * ui clock through a MotionScope.
 */
export const motion = {
  clocks,
  conductor,
  /** Scope for UI that lives for the whole session (HUD, toasts, cards). */
  ui: new MotionScope('ui'),

  get reduced(): boolean {
    return reducedState.value;
  },

  /** The single source of truth for reduced motion; the page's CSS class follows it. */
  setReduced(on: boolean): void {
    reducedState.value = on;
    document.body.classList.toggle('reduced-motion', on);
  },

  /** Debug harness only: scales game time, and can freeze it and step it a frame at a time. */
  timeScale: 1,
  frozen: false,

  /** Advance one 1/60 s frame while frozen. */
  step(): void {
    pendingSteps++;
  },

  /**
   * Advances both clocks by one display frame and returns the game clock's delta, which is what
   * the scene should update by: zero while the game is paused or frozen by the debug harness.
   */
  tick(realDt: number, gamePaused: boolean): number {
    markEngineTick();
    clocks.ui.advance(realDt);
    let gameDt = 0;
    if (!gamePaused) {
      if (!this.frozen) gameDt = realDt * this.timeScale;
      else if (pendingSteps > 0) {
        pendingSteps--;
        gameDt = (1 / 60) * this.timeScale;
      }
    }
    if (gameDt > 0) {
      clocks.game.advance(gameDt);
      // Settles in about DUR.large each way.
      ambient = damp(ambient, clocks.game.time < duckUntil ? AMBIENT_DUCK : 1, 3 / DUR.large, gameDt);
      ambientTime += gameDt * ambient;
    }
    return gameDt;
  },

  /** 1 normally, lower while ducked: multiply ambient world motion's dt by it. */
  get ambient(): number {
    return ambient;
  },

  /** Game time scaled by the ambient factor, so it slows while ducked. Drive idle sines from this. */
  get ambientTime(): number {
    return ambientTime;
  },

  /** Game time in seconds: stops while paused, so sine-driven idles never jump on resume. */
  get gameTime(): number {
    return clocks.game.time;
  },

  /**
   * Asks to flash the whole screen. Grants at most FLASH_LIMIT_PER_SECOND in any rolling second, in
   * every mode, and callers that are refused skip the flash rather than queue it.
   */
  requestFlash(): boolean {
    const now = clocks.ui.time;
    while (flashTimes.length && now - flashTimes[0] > 1) flashTimes.shift();
    if (flashTimes.length >= FLASH_LIMIT_PER_SECOND) return false;
    flashTimes.push(now);
    return true;
  },
};
