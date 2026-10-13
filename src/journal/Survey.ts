import { DISCOVERIES, SURVEY_LEVEL_NAMES } from '../content/discoveries';
import type { Discovery, SurveyLevel } from '../content/discoveries';
import { gameState } from '../core/GameState';
import { SaveSystem } from '../core/SaveSystem';
import { UIManager } from '../ui/UIManager';
import { AudioSystem } from '../audio/AudioSystem';

/**
 * The survey's bookkeeping over src/content/discoveries.ts: what has been found on each level, and
 * the one way a find is recorded.
 */
export const Survey = {
  entries(level: SurveyLevel): Discovery[] {
    return DISCOVERIES.filter((d) => d.level === level);
  },

  found(level: SurveyLevel): number {
    return this.entries(level).filter((d) => gameState.hasFlag(d.flag)).length;
  },

  total(level: SurveyLevel): number {
    return this.entries(level).length;
  },

  /** "Survey: 2 of 4 found", for cards and menus. */
  line(level: SurveyLevel): string {
    return `Survey: ${this.found(level)} of ${this.total(level)} found`;
  },

  /**
   * Records a find the first time (its flag, its reward, a save), and shows its text every time.
   * `onClose` runs when the player closes the text, or at once for a find that has none.
   */
  collect(id: string, onClose?: () => void): void {
    const d = DISCOVERIES.find((e) => e.id === id);
    if (!d) return;
    const first = !gameState.hasFlag(d.flag);
    if (first) {
      gameState.setFlag(d.flag);
      if (d.reward) gameState.addAttributeXp(d.reward.attribute, d.reward.amount);
      AudioSystem.playCollect();
      SaveSystem.save();
    }
    const after = () => {
      if (first) {
        const reward = d.reward ? ` ${d.reward.attribute[0].toUpperCase()}${d.reward.attribute.slice(1)} +${d.reward.amount}.` : '';
        UIManager.toast(`${SURVEY_LEVEL_NAMES[d.level]} survey: ${this.found(d.level)} of ${this.total(d.level)}.${reward}`, 'learn');
      }
      onClose?.();
    };
    if (!d.doc) {
      after();
      return;
    }
    const alt = d.doc.alt;
    UIManager.showDocument(d.doc.title, alt && gameState.hasFlag(alt.flag) ? alt.body : d.doc.body, after);
  },
};
