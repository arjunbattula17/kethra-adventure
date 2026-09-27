/**
 * Motion tokens (docs/DESIGN.md §3). Every duration and curve in the game comes from here; CSS gets
 * the same values as custom properties at boot (applyCssTokens in ./index.ts).
 */

/** Seconds. Entrances use these; exits run at EXIT_FACTOR of them. */
export const DUR = {
  /** Hover, press. */
  micro: 0.1,
  /** An element entering. */
  small: 0.21,
  /** A panel. */
  medium: 0.38,
  /** A screen transition. */
  large: 0.75,
} as const;

export type DurToken = keyof typeof DUR;

/** Exits leave faster than entrances arrive. */
export const EXIT_FACTOR = 0.75;

/** Siblings entering in turn: the gap between them, and the most the whole stagger may add. */
export const STAGGER = { step: 0.04, cap: 0.24 } as const;

/** Cubic-bezier control points, shared by CSS and the JS easing functions. */
export const BEZIER = {
  /** Entrances: fast out of the gate, settling in. */
  decelerate: [0.2, 0.8, 0.2, 1],
  /** Exits: gathering speed as it leaves. */
  accelerate: [0.4, 0, 1, 1],
  /** A move between two on-screen states: camera moves, shared elements. */
  standard: [0.65, 0, 0.35, 1],
} as const;

export type BezierToken = keyof typeof BEZIER;

/** Damped springs, as angular frequency (rad/s) and damping ratio. */
export const SPRING = {
  /** Presses and toggles: quick, no overshoot. */
  press: { omega: 40, zeta: 1 },
  /** Arrivals: one small overshoot, then rest. */
  settle: { omega: 18, zeta: 0.7 },
  /** Big physical things: the skiff, the throttle lever. */
  heavy: { omega: 8, zeta: 0.85 },
} as const;

export type SpringToken = keyof typeof SPRING;
export interface SpringConfig {
  omega: number;
  zeta: number;
}

/** Under reduced motion no transition runs longer than this, and moves become cross-fades. */
export const REDUCED_MAX = 0.15;

/** The Conductor's duck: under a hero moment, ambient world motion runs at this fraction. */
export const AMBIENT_DUCK = 0.25;

/** Full-screen flashes allowed per rolling second, in every mode. */
export const FLASH_LIMIT_PER_SECOND = 3;
