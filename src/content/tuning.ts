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
  /** Crouched, the capsule is this tall: low enough to crawl Vessek's ducts (1.25 m inside). */
  CROUCH_HEIGHT: 1.1,
  /** Up or down a ladder (m/s). */
  CLIMB_SPEED: 1.8,
  /** Obstacles shorter than this are walked over rather than into. */
  STEP_OVER: 0.25,
  GRAVITY: -18,
  JUMP_SPEED: 6,
  MOUSE_SENSITIVITY: 0.0022,
  MAX_STEP_UP: 0.45,
  /** Forgiveness windows (seconds). Coyote time: a jump still works this long after walking off a
   * ledge. Jump buffer: a press this long before landing still jumps on touchdown. Neither changes
   * how high or far a jump goes, so the level layouts above are unaffected. */
  COYOTE_TIME: 0.1,
  /** Keyboard turning speed (radians per second) for playing without a mouse. */
  TURN_SPEED: 2.2,
  JUMP_BUFFER: 0.12,
  /** How far the camera dips on a hard landing, and how fast it springs back. */
  LAND_DIP: 0.09,
  LAND_RECOVER: 9,
} as const;

/**
 * MG1 Intercept's pacing (src/galaxy/intercept/InterceptGame.ts), in seconds of game time. The whole
 * plot is meant to take a first-time player 10–20 s: one choice, one launch.
 */
export const MG1 = {
  /** ORION's automatic hop out of the debris to the buoy, while the camera pulls out. */
  HOP_SECONDS: 1.8,
  /** How long the matching day has to stay selected before the course locks (a sweep past doesn't). */
  LOCK_DWELL: 0.3,
  /** Unlocked this long: ORION hints, and the meeting day pulses. */
  HINT_AFTER: 7,
  /** Unlocked this long: "Let ORION plot it" appears, so nobody can get stuck. */
  AUTOPLOT_AFTER: 15,
  /** The six-day voyage, fast-forwarded. */
  RUN_SECONDS: 2.8,
  /** The win's course and count-up hold before the Wren takes over. */
  WIN_HOLD: 3.2,
} as const;

/**
 * Navigation figures for the galaxy map. Orbits are in millions of km (Mkm) and match planetData's
 * orbitRadius values. MG1's model (src/galaxy/intercept/sim.ts) uses the same cruise speed and belt
 * but keeps its own copies, so its tests can load it into Node alone: change them together.
 */
export const NAV = {
  /** Where the Wren is parked after the white sky. */
  SHIP_ORBIT_MKM: 12,
  CRUISE_MKM_PER_DAY: 8,
  MARGIN_DAYS: 2,
  DAYS_PER_CELL: 2,
  /** The asteroid belt Kethra orbits just past, drawn on the solar chart. */
  BELT_INNER_MKM: 38,
  BELT_OUTER_MKM: 47,
} as const;
