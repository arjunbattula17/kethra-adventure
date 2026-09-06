import { gameState } from './GameState';
import { bus } from './EventBus';

const SAVE_KEY = 'kethra_save_v1';
/** Roughly half a typical 5MB origin quota — a warning, not a limit. */
const SAVE_WARN_BYTES = 2_000_000;

export const SaveSystem = {
  hasSave(): boolean {
    return localStorage.getItem(SAVE_KEY) !== null;
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
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    try {
      gameState.loadFrom(raw);
      return true;
    } catch {
      return false;
    }
  },

  clear(): void {
    localStorage.removeItem(SAVE_KEY);
  },
};
