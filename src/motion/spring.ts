import type { SpringConfig } from './tokens';

export interface SpringState {
  x: number;
  v: number;
}

/**
 * Advances a damped spring toward `target` by exactly `dt` seconds using the closed-form solution,
 * so it lands in the same place at 30 Hz and at 144 Hz (a per-frame integrator doesn't).
 */
export function stepSpring(s: SpringState, target: number, cfg: SpringConfig, dt: number): void {
  const { omega: w, zeta: z } = cfg;
  const d0 = s.x - target;
  const v0 = s.v;
  if (dt <= 0) return;
  let d: number;
  let v: number;
  if (z < 1) {
    const wd = w * Math.sqrt(1 - z * z);
    const e = Math.exp(-z * w * dt);
    const c = Math.cos(wd * dt);
    const sn = Math.sin(wd * dt);
    const b = (v0 + z * w * d0) / wd;
    d = e * (d0 * c + b * sn);
    // The derivative of e·(d0·cos + b·sin).
    v = e * (-z * w * (d0 * c + b * sn) + (-d0 * wd * sn + b * wd * c));
  } else if (z === 1) {
    const e = Math.exp(-w * dt);
    const b = v0 + w * d0;
    d = (d0 + b * dt) * e;
    v = (v0 - w * b * dt) * e;
  } else {
    const r = Math.sqrt(z * z - 1);
    const r1 = -w * (z - r);
    const r2 = -w * (z + r);
    const c2 = (v0 - r1 * d0) / (r2 - r1);
    const c1 = d0 - c2;
    const e1 = Math.exp(r1 * dt);
    const e2 = Math.exp(r2 * dt);
    d = c1 * e1 + c2 * e2;
    v = c1 * r1 * e1 + c2 * r2 * e2;
  }
  s.x = target + d;
  s.v = v;
}

/** True once a spring is close enough to rest that drawing it again changes nothing visible. */
export function springAtRest(s: SpringState, target: number, epsilon = 1e-3): boolean {
  return Math.abs(s.x - target) < epsilon && Math.abs(s.v) < epsilon * 10;
}

/**
 * Samples a 0 → 1 spring as a CSS `linear()` easing and its settle time, so DOM elements can use the
 * same springs as the 3D world. Returns null where the browser doesn't support `linear()`.
 */
export function springToCss(cfg: SpringConfig): { easing: string; duration: number } | null {
  if (typeof CSS === 'undefined' || !CSS.supports('transition-timing-function', 'linear(0, 1)')) return null;
  const s: SpringState = { x: 0, v: 0 };
  const dt = 1 / 120;
  const samples: number[] = [0];
  let t = 0;
  while (t < 3) {
    stepSpring(s, 1, cfg, dt);
    t += dt;
    samples.push(s.x);
    if (springAtRest(s, 1, 5e-4)) break;
  }
  const step = Math.max(1, Math.floor(samples.length / 40));
  const pts: string[] = [];
  for (let i = 0; i < samples.length; i += step) pts.push(samples[i].toFixed(4));
  pts.push('1');
  return { easing: `linear(${pts.join(', ')})`, duration: t };
}

/**
 * Exponential damping toward a target: exact for any dt, unlike `x += (target - x) * k * dt`, which
 * overshoots on long frames. `lambda` is how quickly the gap closes, per second.
 */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return target + (current - target) * Math.exp(-lambda * dt);
}

/** Damps a vector in place (anything with lerp, e.g. THREE.Vector3). */
export function dampVec3<V extends { lerp(target: V, alpha: number): V }>(current: V, target: V, lambda: number, dt: number): V {
  return current.lerp(target, 1 - Math.exp(-lambda * dt));
}

/** Damps an angle the short way round. */
export function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  const twoPi = Math.PI * 2;
  const delta = ((((target - current + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
  return current + delta * (1 - Math.exp(-lambda * dt));
}
