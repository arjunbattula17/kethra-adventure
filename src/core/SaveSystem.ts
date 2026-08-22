import { gameState } from './GameState';

const SAVE_KEY = 'kethra_save_v1';

export const SaveSystem = {
  hasSave(): boolean {
    return localStorage.getItem(SAVE_KEY) !== null;
  },

  save(): void {
    localStorage.setItem(SAVE_KEY, gameState.toJSON());
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
