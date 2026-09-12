import { bus } from '../core/EventBus';
import { gameState } from '../core/GameState';
import { UIManager } from '../ui/UIManager';
import { AudioSystem } from '../audio/AudioSystem';
import type { JournalLogEntry } from '../core/GameState';

/**
 * The Ship's Library: short, real-science reference entries earned by playing. Each unlocks at
 * the moment the game just USED the concept — solve the scan correlation and the Doppler,
 * spectroscopy and Kepler entries appear, because those are literally the tools the puzzle
 * handed the player; reach Kethra's glowing canopy and bioluminescence unlocks; repair a ship
 * system and energy systems unlock. The science is real and checkable; the last line of each
 * entry ties it back to the thing the player just did, so the education rides the game instead
 * of interrupting it. Entries live in the normal journal (locked entries are hidden until
 * earned, same as Kethra's lore fragments).
 */

const LIBRARY_ENTRIES: JournalLogEntry[] = [
  {
    id: 'lib_kepler',
    title: 'Ship’s Library — Kepler’s Third Law',
    body: 'Planets do not all move at the same speed: the farther a body orbits from its star, the slower it travels and the longer its year. Johannes Kepler pinned the exact relationship in 1619 — the square of the orbital period grows with the cube of the orbit’s size — and it still holds for every planet, moon and spacecraft we know. It is why the scan could place Contact α on the farthest orbit from nothing but its lazy drift.',
    corrupted: false,
    timestamp: 'REFERENCE ARCHIVE',
    unlocked: false,
  },
  {
    id: 'lib_doppler',
    title: 'Ship’s Library — The Doppler Effect',
    body: 'Waves from something moving toward you arrive compressed; waves from something moving away arrive stretched. You hear it in a siren’s falling pitch as it passes, and astronomers see it in light: motion shifts a body’s spectrum toward blue when approaching and red when receding. Careful Doppler measurements reveal how fast planets orbit — and have discovered hundreds of worlds around other stars by the wobble they leave in their sun’s light. It is how the scanner clocked each contact’s speed without ever visiting one.',
    corrupted: false,
    timestamp: 'REFERENCE ARCHIVE',
    unlocked: false,
  },
  {
    id: 'lib_spectroscopy',
    title: 'Ship’s Library — Reading Light: Spectroscopy',
    body: 'Every element and molecule swallows light at its own exact wavelengths, leaving dark fingerprint lines in a spectrum. Split any light finely enough and it names what the light touched — that is how we know what stars are made of without leaving home. Plants have a famous signature of their own: chlorophyll drinks red and blue light and rejects green and infrared so sharply that satellites map Earth’s forests by the “red edge” alone. The chlorophyll-analog line the scan caught on the first orbit past the belt is that same trick, pointed outward.',
    corrupted: false,
    timestamp: 'REFERENCE ARCHIVE',
    unlocked: false,
  },
  {
    id: 'lib_belts',
    title: 'Ship’s Library — Asteroid Belts',
    body: 'An asteroid belt is rubble that never became a planet — leftover building blocks kept stirred up by a big neighbor’s gravity, in our system Jupiter’s. Despite every movie chase scene, belts are mostly empty space: our own holds millions of rocks, yet spacecraft cross it routinely without a close call, and all of it together weighs far less than the Moon. A belt is also a landmark — a fixed ring you can measure other orbits against, which is exactly what the calibration used it for.',
    corrupted: false,
    timestamp: 'REFERENCE ARCHIVE',
    unlocked: false,
  },
  {
    id: 'lib_biolum',
    title: 'Ship’s Library — Bioluminescence',
    body: 'Living light is real chemistry: a molecule called luciferin reacts with oxygen, and nearly all of the energy leaves as light instead of heat — a “cold light” more efficient than any bulb humans have built. Fireflies flash it in code, deep-sea anglerfish lure prey with it, and whole bays on Earth glow blue when disturbed dinoflagellates bloom. On a world with a dim sky, a forest that makes its own light is not fantasy — it is an ecosystem solving the same problem Earth’s deep ocean solved.',
    corrupted: false,
    timestamp: 'REFERENCE ARCHIVE',
    unlocked: false,
  },
  {
    id: 'lib_energy',
    title: 'Ship’s Library — Energy Systems and Redundancy',
    body: 'A spacecraft is an exercise in energy budgeting: every system — heat, air, light, computation — draws from the same limited supply, and energy is never created, only converted and spent. Real spacecraft survive failures through redundancy and priority: life support first, everything else negotiable, backups for whatever cannot be allowed to die. An emergency reboot that wakes life support before navigation is not drama — it is exactly the order a well-designed ship would choose.',
    corrupted: false,
    timestamp: 'REFERENCE ARCHIVE',
    unlocked: false,
  },
];

export const ShipLibrary = {
  init(): void {
    // Present-but-locked from the start (hidden until earned); dedupe by id so loading an old
    // save that already carries some entries never doubles them.
    for (const entry of LIBRARY_ENTRIES) {
      if (!gameState.data.journalLogs.some((l) => l.id === entry.id)) {
        gameState.data.journalLogs.push({ ...entry });
      }
    }
    bus.on('ship:repaired', () => this.award(['lib_energy']));
  },

  /** Unlocks entries and announces only the genuinely new ones. Safe to call repeatedly. */
  award(ids: string[]): void {
    const fresh: string[] = [];
    for (const id of ids) {
      const log = gameState.data.journalLogs.find((l) => l.id === id);
      if (log && !log.unlocked) {
        gameState.unlockLog(id);
        fresh.push(log.title.replace('Ship’s Library — ', ''));
      }
    }
    if (fresh.length === 1) UIManager.toast(`Ship’s Library: “${fresh[0]}” added to the journal.`);
    else if (fresh.length > 1) UIManager.toast(`Ship’s Library updated — ${fresh.length} new entries in the journal.`);
    if (fresh.length > 0) AudioSystem.playUiClick();
  },
};
