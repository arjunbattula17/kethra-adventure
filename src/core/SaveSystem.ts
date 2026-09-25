import { gameState } from './GameState';
import { bus } from './EventBus';

const SAVE_KEY = 'kethra_save_v1';
/** Roughly half a typical 5MB origin quota — a warning, not a limit. */
const SAVE_WARN_BYTES = 2_000_000;

// Merely touching localStorage throws (SecurityError) where a browser blocks storage: some private
// modes, and managed school Chromebooks with site data disabled. hasSave() runs at boot, so an
// unguarded read there left the game on a black screen. Every access goes through these instead,
// and a blocked browser just plays without saving.
function readSave(): string | null {
  try {
    return localStorage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
}

export const SaveSystem = {
  hasSave(): boolean {
    return readSave() !== null;
  },

  /**
   * Writes the save, reporting failure rather than throwing. localStorage is a hard ~5MB per origin
   * and the journal, clues and clue connections only ever grow, so a long enough playthrough can
   * eventually be refused — and every caller here is a fire-and-forget bus handler that would turn
   * a QuotaExceededError into an unhandled rejection mid-play. Well inside the limit at current
   * content volume; this is so it fails visibly rather than silently if that changes.
   */
  save(): boolean {
    const json = gameState.toJSON();
    try {
      localStorage.setItem(SAVE_KEY, json);
      if (json.length > SAVE_WARN_BYTES) {
        console.warn(`[SaveSystem] save is ${(json.length / 1024).toFixed(0)}KB, approaching the localStorage limit`);
      }
      return true;
    } catch (err) {
      console.error('[SaveSystem] could not write save', err);
      bus.emit('save:failed');
      return false;
    }
  },

  load(): boolean {
    const raw = readSave();
    if (!raw) return false;
    try {
      gameState.loadFrom(raw);
      return true;
    } catch {
      return false;
    }
  },

  clear(): void {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      // Storage blocked: there is nothing to clear.
    }
  },
};
