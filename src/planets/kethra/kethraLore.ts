// Kethra lore documents — in-world journal entries for the Cistern Heart puzzle.
//
// Entries kethra_frag_first, kethra_frag_between, and kethra_frag_last are the three
// scattered inscription fragments. Together they unambiguously encode KETHRA_TRUE_SEQUENCE
// below (each names its own position — first / between / last — and describes one color
// evocatively rather than stating it outright). kethra_ritual_record is the modern Aiveth
// record of the ritual as they currently (incorrectly) perform it, useful as a contrasting
// red herring. kethra_kindling_record is the deeper-mystery hint tying the Kindling's
// disappearance to the player's own ship disaster.
//
// unlocked is left false on all entries — they are meant to be discovered/unlocked by
// exploration or puzzle logic elsewhere, not granted at game start like the ship's
// personal logs.

import type { JournalLogEntry } from '../../core/GameState';

export const KETHRA_LORE_ENTRIES: JournalLogEntry[] = [
  {
    id: 'kethra_frag_first',
    title: 'Inscription Fragment — The First Breath',
    body: `"...the Heart wakes first to the color of water remembered — not the rain that falls, but the water that waited in the dark beneath the roots, cold and old and blue as a sky that has never been seen. Call this hue ▓▓▓▓, before any other, or the Heart will not stir at ▓▓▓▓..."`,
    corrupted: true,
    timestamp: 'Kindling Era — Outer Terrace Fragment',
    unlocked: false,
  },
  {
    id: 'kethra_frag_between',
    title: 'Inscription Fragment — The Breath Between',
    body: `"...this is not the first breath, and it is not the last — it is the one that answers the first. Where root-cold meets fire, call the color of coal woken from ash, of dawn caught in the moment before it clears the ▓▓▓▓. Call it second, between water and green, or the ▓▓▓▓ answers nothing..."`,
    corrupted: true,
    timestamp: 'Kindling Era — Lower Terrace Fragment',
    unlocked: false,
  },
  {
    id: 'kethra_frag_last',
    title: 'Inscription Fragment — The Final Breath',
    body: 'Remarkably intact for its age. "Last of the three, called only once water and ember have already answered: the color of new leaf unfurling, of the whole canopy breathing out at once. Call it last, and only last, and the Heart is whole again."',
    corrupted: false,
    timestamp: 'Kindling Era — Inner Approach Fragment',
    unlocked: false,
  },
  {
    id: 'kethra_ritual_record',
    title: 'The Rite of Three Breaths, as Performed Today',
    body: 'A clean, well-kept grove record. "Each season the grove gathers at the terrace rail, and the acolytes raise their lanterns together. Blue is called first, to wake the roots. Green is called second, to answer the blue. Gold is called last, to close the Rite and send the color home." Passed down unchanged, or so every acolyte believes.',
    corrupted: false,
    timestamp: 'Aiveth Fourth Generation, Current Practice',
    unlocked: false,
  },
  {
    id: 'kethra_kindling_record',
    title: 'Last Carving Before the Silence',
    body: `"...and on the ▓▓▓▓ day the sky above every terrace turned white at once — not a fire spreading from one bough to the next, but every light in the world called home in the same breath, everywhere, together. There was no ▓▓▓▓ before it. There was no warning carved anywhere that we have found. [DATA INCOMPLETE — remaining stanzas illegible] ...if it comes again, let whoever reads this know it has happened ▓▓▓▓ before..."`,
    corrupted: true,
    timestamp: 'Kindling Era — Final Recorded Carving',
    unlocked: false,
  },
];

export const KETHRA_TRUE_SEQUENCE: string[] = ['azure', 'amber', 'verdant'];

// The Aiveth's current Rite of Three Breaths, per kethra_ritual_record: blue, then green,
// then gold. Plausible, still performed, and wrong — it swaps the true sequence's last two.
export const KETHRA_RITUAL_SEQUENCE: string[] = ['azure', 'verdant', 'amber'];
