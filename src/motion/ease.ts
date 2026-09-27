import { BEZIER } from './tokens';
import type { BezierToken } from './tokens';

export type EaseFn = (t: number) => number;

/**
 * A CSS-equivalent cubic-bezier as a function of progress, so a curve named in tokens.ts moves the
 * same in a WAAPI animation and in a tween on the game clock. Newton's method with a bisection
 * fallback, the way browsers solve it.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): EaseFn {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  const solveX = (x: number) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-6) return t;
      const d = slopeX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 30; i++) {
      const v = sampleX(t);
      if (Math.abs(v - x) < 1e-6) break;
      if (v < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return t;
  };
  return (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : sampleY(solveX(t)));
}

const fromToken = (name: BezierToken): EaseFn => {
  const [a, b, c, d] = BEZIER[name];
  return cubicBezier(a, b, c, d);
};

/** The named curves. Linear is only for mechanical or continuous motion. */
export const ease = {
  decelerate: fromToken('decelerate'),
  accelerate: fromToken('accelerate'),
  standard: fromToken('standard'),
  linear: (t: number) => t,
} as const;

export type EaseToken = keyof typeof ease;

export function cssBezier(name: BezierToken): string {
  const [a, b, c, d] = BEZIER[name];
  return `cubic-bezier(${a}, ${b}, ${c}, ${d})`;
}
