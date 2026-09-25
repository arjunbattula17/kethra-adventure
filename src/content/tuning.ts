/**
 * The tuning file: numbers a designer adjusts to change how the game feels, in one place.
 * Code reads these; it doesn't redefine them.
 *
 * Careful with PLAYER: level layouts are built around these exact values. Kethra's gaps assume
 * a jump apex of JUMP_SPEED^2 / (2 * |GRAVITY|) = 1 m and a 0.45 m step-up (see the notes in
 * src/planets/kethra/KethraScene.ts). After changing movement, run tools/collision-check.mjs to
 * confirm every target is still reachable.
 */
export const PLAYER = {
  EYE_HEIGHT: 1.7,
  WALK_SPEED: 3.2,
  SPRINT_SPEED: 5.6,
  CROUCH_SPEED: 1.6,
  PLAYER_RADIUS: 0.35,
  /** Standing height of the collision capsule — the eye sits just under the top of it. */
  PLAYER_HEIGHT: 1.8,
  /** Obstacles shorter than this are walked over rather than into. */
  STEP_OVER: 0.25,
  GRAVITY: -18,
  JUMP_SPEED: 6,
  MOUSE_SENSITIVITY: 0.0022,
  MAX_STEP_UP: 0.45,
} as const;
