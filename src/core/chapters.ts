import { gameState } from './GameState';
import type { AttributeKey } from './GameState';
import { ShipLibrary } from '../journal/shipLibrary';

/**
 * The chapter select: starting at a level without playing the ones before it, for a judge with ten
 * minutes or a player who wants one level again. A chapter starts from the player's own save as it
 * stood on arriving there, if they have been (GameFlow records it); otherwise from a stand-in with
 * the flags and stats a first playthrough has by then. Starting a chapter replaces the saved journey.
 */
export type ChapterId = 'wren' | 'kethra' | 'vessek';

export const CHAPTERS: { id: ChapterId; number: number; title: string; line: string }[] = [
  { id: 'wren', number: 1, title: 'The Wren', line: 'Wake the ship, find out where you are, and plot a course.' },
  { id: 'kethra', number: 2, title: 'Kethra', line: 'Terraced ruins under a dimming canopy. Someone lives here.' },
  { id: 'vessek', number: 3, title: 'Vessek Anchorage', line: 'Twenty-one stranded ships and one very old ring.' },
];

const STORE_KEY = 'kethra_chapters_v1';

// Storage can be blocked outright (private modes, managed Chromebooks; see SaveSystem). Without it
// every chapter simply starts from its stand-in.
function readStore(): Partial<Record<string, string>> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Partial<Record<string, string>>) : {};
  } catch {
    return {};
  }
}

/** A first playthrough's state on arriving at a level: what the opening, MG1 and MG2 give, and for
 * the Anchorage what waking the Heart and repairing the Deep Scanner give on top. */
function standIn(id: 'kethra' | 'vessek'): void {
  const d = gameState.data;
  const flags = ['tutorial_battle_complete', 'galaxy_revealed', 'logs_available', 'damage_assessed', 'first_light', 'left_wren', 'canopy_flown'];
  const stats: Partial<Record<AttributeKey, number>> = { insight: 1, engineering: 1, traversal: 1 };
  d.planetsUnlocked = ['kethra'];
  if (id === 'vessek') {
    flags.push('kethra_warden_met', 'kethra_fragment_1_read', 'kethra_mechanism_solved');
    // One inscription read, and the Heart.
    stats.archaeology = 3;
    d.planetsUnlocked.push('vessek');
    // The Heart's three crystals fill navigation and the Deep Scanner; the scanner's repair is what
    // charted the Anchorage.
    gameState.addResource('resonant_crystal', 3);
    Object.assign(d.shipSystems.scanner, { repaired: true, damaged: false, progress: 100, haveAmount: 0 });
  }
  for (const flag of flags) gameState.setFlag(flag);
  for (const [key, amount] of Object.entries(stats)) gameState.addAttributeXp(key as AttributeKey, amount);
  ShipLibrary.award(['lib_navigation', 'lib_doppler', 'lib_spectroscopy', 'lib_kepler', 'lib_belts']);
}

export const Chapters = {
  /** Keeps the save as it stands on arriving at a level, to start that chapter from later. */
  remember(id: string, json: string): void {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ ...readStore(), [id]: json }));
    } catch {
      // Storage blocked or full: the chapter will start from its stand-in.
    }
  },

  /** Whether the chapter would start from the player's own arrival rather than a stand-in. */
  hasOwn(id: ChapterId): boolean {
    return typeof readStore()[id] === 'string';
  },

  /**
   * Puts the game state at a chapter's start, in a state that is otherwise a new game. Returns the
   * level to enter, or null for the Wren, which is the new game itself.
   */
  begin(id: ChapterId): 'kethra' | 'vessek' | null {
    if (id === 'wren') return null;
    const own = readStore()[id];
    if (own) {
      try {
        gameState.loadFrom(own);
        return id;
      } catch {
        // An unreadable snapshot: start from the stand-in instead.
      }
    }
    standIn(id);
    return id;
  },
};
