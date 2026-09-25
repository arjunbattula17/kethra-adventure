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
 * Navigation figures shared by the course-plot puzzle and the galaxy map, so the two always agree.
 * Orbits are in millions of km (Mkm) and match planetData's orbitRadius values. Changing these
 * changes the course-plot answers (48 Mkm, 6 days, 4 cells).
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
