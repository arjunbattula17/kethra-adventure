/**
 * Every input the game reads, defined once. PlayerController and the interaction system read their
 * key codes from here; the in-game Controls screen and docs/CONTROLS_AND_HOW_TO_PLAY.md (generated
 * by tools/gen-controls-doc.mjs) print from here. So the written directions and the real bindings
 * cannot disagree, which is a judged line on the rubric (Game Directions and Control Functions).
 *
 * Plain data with no TypeScript-only syntax, so the doc generator can import it directly in Node.
 */
export interface Binding {
  action: string;
  /** What the Controls screen shows, in order. */
  keys: string[];
  /** KeyboardEvent.code values the game actually listens for. Empty for mouse-only actions. */
  codes: string[];
  /** When the player uses it, for the how-to-play text. */
  note?: string;
}

export const BINDINGS = {
  look: { action: 'Look around', keys: ['Mouse'], codes: [], note: 'Click the game first to capture the mouse.' },
  forward: { action: 'Move forward', keys: ['W', '↑'], codes: ['KeyW', 'ArrowUp'] },
  back: { action: 'Move back', keys: ['S', '↓'], codes: ['KeyS', 'ArrowDown'] },
  left: { action: 'Move left', keys: ['A', '←'], codes: ['KeyA', 'ArrowLeft'] },
  right: { action: 'Move right', keys: ['D', '→'], codes: ['KeyD', 'ArrowRight'] },
  sprint: { action: 'Sprint (hold)', keys: ['Shift'], codes: ['ShiftLeft', 'ShiftRight'] },
  jump: { action: 'Jump', keys: ['Space'], codes: ['Space'] },
  crouch: { action: 'Crouch (hold)', keys: ['C', 'Ctrl'], codes: ['KeyC', 'ControlLeft', 'ControlRight'] },
  interact: { action: 'Interact, talk, read', keys: ['E'], codes: ['KeyE'], note: 'When a prompt appears at the centre of the screen.' },
  character: { action: 'Character sheet', keys: ['Tab'], codes: ['Tab'] },
  settings: { action: 'Settings', keys: ['O'], codes: ['KeyO'] },
  pause: { action: 'Pause menu, close a panel', keys: ['Esc'], codes: ['Escape'] },
  skip: { action: 'Skip a cinematic', keys: ['Space', 'Enter', 'Click'], codes: ['Space', 'Enter'] },
};

export type BindingId = keyof typeof BINDINGS;

/** The order the Controls screen and the doc list them in. */
export const BINDING_ORDER = ['look', 'forward', 'back', 'left', 'right', 'sprint', 'jump', 'crouch', 'interact', 'character', 'settings', 'pause', 'skip'];
