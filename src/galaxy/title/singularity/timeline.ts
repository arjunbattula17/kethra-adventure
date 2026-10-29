/**
 * The black hole's beats, in seconds since New game was clicked (singularity.ts tells the story). Kept
 * apart, with no imports, so the menu (ui/titleDevour.ts) and the sound (audio/singularitySound.ts)
 * can share it without pulling the 3D code into the page's first download.
 */
export const TIMELINE = {
  warn: 0.35,
  haze: 0.45,
  implode: 0.62,
  birth: 1.15,
  fight: 1.3,
  /** The ship's engines start to fail. */
  shipLost: 3.25,
  capture: 3.7,
  plunge: 4.85,
  horizon: 6.05,
  end: 6.75,
} as const;

export type Cue = keyof typeof TIMELINE;

/** What the page needs each frame to move the menu with the picture (CSS pixels, from the top left). */
export interface SingularityFrame {
  t: number;
  x: number;
  y: number;
  /** The shadow's radius. */
  horizon: number;
  /** The shockwave's radius and strength (0 when there is none). */
  shockRadius: number;
  shockAmp: number;
  /** Camera shake, for the menu to share. */
  shakeX: number;
  shakeY: number;
  /** How far the menu's backing (the scrim, the corners) has been taken: 0..1. */
  pull: number;
  eat: number;
}

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smooth = (x: number) => {
  const k = clamp01(x);
  return k * k * (3 - 2 * k);
};
/** Where t is between a and b, 0..1. */
export const range = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
