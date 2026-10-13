import type { AttributeKey } from '../core/GameState';

/**
 * The survey: everything optional a level has to find, as data. Each entry is one flag in the save.
 * Entries with a `doc` are read where they are found and own their text here; the older finds
 * (Kethra's inscriptions, the Anchorage's ring plate) keep their text where it was written and only
 * count toward the total. Story facts come from LORE.md, as for src/content/strings.ts.
 *
 * To add a find: add an entry here, then place it in its level (src/ship/interior/finds.ts,
 * KethraScene.buildFinds, VessekScene.buildFinds) with Survey.collect(id).
 */
export type SurveyLevel = 'wren' | 'kethra' | 'vessek';

export interface Discovery {
  id: string;
  level: SurveyLevel;
  /** Set in the save once found. */
  flag: string;
  /** Short name for lists: the pause menu and the ending. */
  name: string;
  /** What the player reads. `alt` replaces the body once its flag is set. */
  doc?: { title: string; body: string; alt?: { flag: string; body: string } };
  /** Paid once, on the first find. */
  reward?: { attribute: AttributeKey; amount: number };
}

export const SURVEY_LEVEL_NAMES: Record<SurveyLevel, string> = {
  wren: 'The Wren',
  kethra: 'Kethra',
  vessek: 'Vessek Anchorage',
};

export const DISCOVERIES: Discovery[] = [
  // ---------------------------------------------------------------- the Wren
  {
    id: 'wren_bench_note',
    level: 'wren',
    flag: 'wren_found_bench_note',
    name: 'Carrow’s note at the bench',
    doc: {
      title: 'Taped to the workbench — I. Carrow',
      body:
        '“Whoever has the watch: the vise sticks. Hit it, don’t oil it.\n\n' +
        'The spare log buffer is in my locker, A-1, for when the main one cooks again. Key is under the lip of the sub-deck hatch, where it has been since ARK told us not to keep it there.\n\n' +
        'If you are reading this and I’m still asleep, something went wrong. Fix it quietly. — Ines”',
    },
  },
  {
    id: 'wren_locker',
    level: 'wren',
    flag: 'wren_found_locker',
    name: 'The spare log buffer',
    doc: {
      title: 'Locker A-1 — the spare log buffer',
      body:
        'A flight jacket, a tin of recycler coffee with NOT ORION’S written on the lid, and a log buffer in a padded sleeve.\n\n' +
        'ORION reads it in. One corrupted entry comes back whole: day 22, the unknown signal.\n\n' +
        'Carrow kept a second copy of the Wren’s memory in a locker because she didn’t trust the first. The travel logs at the log terminal have the restored entry.',
    },
    reward: { attribute: 'perception', amount: 1 },
  },
  {
    id: 'wren_letter',
    level: 'wren',
    flag: 'wren_found_letter',
    name: 'Mbeki’s unsent letter',
    doc: {
      title: 'Unsent — H. Mbeki to ARK Ltd',
      body:
        'Folded small and tucked behind the vent slats of suit locker EVA-1.\n\n' +
        '“Three freighters gone on one run, and you want a fourth ship to go and look. I have flown freight for twenty years. Nothing out there takes a ship and leaves no wreckage, so whatever this is, it isn’t weather.\n\n' +
        'I’ll fly it. I am saying no first so that it is written down somewhere.”\n\n' +
        'It was never sent. The pilot who argued against the contract is asleep in section 4-B, behind the breach.',
    },
    reward: { attribute: 'persuasion', amount: 1 },
  },
  {
    id: 'wren_relay',
    level: 'wren',
    flag: 'wren_found_relay',
    name: 'The dead comms relay',
    doc: {
      title: 'Relay rack — the COMMS run',
      body:
        'PWR-A, NAV BUS, LIFE SUP and AUX are carrying load. The COMMS relay is dark, fused in the white sky. An old tag is taped under it:\n\n' +
        '“This one runs hot. When it goes, don’t burn the spares on it: the fault is the conduit behind. Two lengths of new alloy. ARK wouldn’t sign for them. — I.C.”\n\n' +
        'So long-range comms won’t come back with anything aboard. It needs conduit alloy, and the Wren has none.',
    },
    reward: { attribute: 'insight', amount: 1 },
  },

  // ---------------------------------------------------------------- Kethra
  { id: 'kethra_fragment_1', level: 'kethra', flag: 'kethra_fragment_1_read', name: 'Inscription: the first breath' },
  { id: 'kethra_fragment_2', level: 'kethra', flag: 'kethra_fragment_2_read', name: 'Inscription: the breath between' },
  { id: 'kethra_fragment_3', level: 'kethra', flag: 'kethra_fragment_3_read', name: 'Inscription: the final breath' },
  { id: 'kethra_shrine', level: 'kethra', flag: 'kethra_shrine_read', name: 'The grove shrine’s record' },
  { id: 'kethra_valve', level: 'kethra', flag: 'kethra_helped_with_valve', name: 'The lower valve, realigned' },
  { id: 'kethra_carving', level: 'kethra', flag: 'kethra_kindling_record', name: 'The last Kindling carving' },
  {
    id: 'kethra_oshel',
    level: 'kethra',
    flag: 'kethra_found_oshel',
    name: 'Oshel’s grove',
    doc: {
      title: 'Under the old tree — Oshel’s grove',
      body:
        'A sleeping mat rolled under the roots, and a child’s lantern hung on the lowest bough, unlit.\n\n' +
        'Fen said their sibling’s grove was the dimmest on the terrace. This is it. Oshel sleeps through the daylight here, because there isn’t enough light left to wake them.',
      alt: {
        flag: 'kethra_mechanism_solved',
        body:
          'The lantern on the lowest bough is lit: a small, steady green. The sleeping mat is rolled up and put away.\n\n' +
          'Nobody is here. Oshel is awake, somewhere up in the boughs.',
      },
    },
    reward: { attribute: 'persuasion', amount: 1 },
  },
  {
    id: 'kethra_perch',
    level: 'kethra',
    flag: 'kethra_found_perch',
    name: 'The Wickmoth’s perch',
    doc: {
      title: 'The far arch — the Wickmoth’s perch',
      body:
        'With the moth settled on the Heart, the arch it watched from is empty. Its feet have worn two hollows into the stone, each as deep as a thumb.\n\n' +
        'The Aiveth’s own marks, cut small along the arch, stop short of the hollows on every side. Whoever first climbed up here found it already sitting.',
    },
    reward: { attribute: 'perception', amount: 1 },
  },

  // ---------------------------------------------------------------- Vessek Anchorage
  { id: 'vessek_plate', level: 'vessek', flag: 'vessek_plate_read', name: 'The ring plate' },
  { id: 'vessek_grate', level: 'vessek', flag: 'vessek_grate_open', name: 'The bent grate' },
  { id: 'vessek_stars', level: 'vessek', flag: 'vessek_dace_stars', name: 'Dace’s question' },
  {
    id: 'vessek_scope',
    level: 'vessek',
    flag: 'vessek_found_scope',
    name: 'The Anchorage scope',
    doc: {
      title: 'At the east port — the Anchorage scope',
      body:
        'A salvaged survey scope on a gimbal, aimed out of the port and chained there. Someone has scratched tally marks all the way round the eyepiece.\n\n' +
        'Through it: a green point, steady, brighter than anything near it. Kethra’s terraces, lit from end to end.\n\n' +
        'You did that. From here it is the brightest thing in the sky.',
    },
    reward: { attribute: 'insight', amount: 1 },
  },
  {
    id: 'vessek_sky',
    level: 'vessek',
    flag: 'vessek_found_sky',
    name: 'Dace’s chalk sky',
    doc: {
      title: 'Chalk on the duct wall',
      body:
        'Along the duct, where no adult fits, the wall is covered in chalk: dots, hundreds of them, each with a careful ring drawn round it. Beside the biggest, in a child’s capitals: OURS.\n\n' +
        'Every other dot has a question mark.\n\n' +
        'Dace has been drawing a sky out of other people’s stories.',
    },
    reward: { attribute: 'perception', amount: 1 },
  },
  {
    id: 'vessek_seeds',
    level: 'vessek',
    flag: 'vessek_found_seeds',
    name: 'The seed book',
    doc: {
      title: 'Behind the last grow table — the seed book',
      body:
        'Hung on a nail: a ledger of its own, kept by whoever runs the bay.\n\n' +
        '“MIREILLE: beans, two kinds. COPPER HEN: barley, one jar. SIX SISTERS: carried ore. Nothing we could plant, so they brought the songs.” It runs on, a line for every hull.\n\n' +
        'Twenty-one ships. Everything growing in this hold came out of somebody’s galley stores.',
    },
    reward: { attribute: 'engineering', amount: 1 },
  },
];

/** The Wren's day-22 log as the spare buffer holds it: the same entry with nothing missing. */
export const RESTORED_SIGNAL_LOG =
  '"Picked up a tone on long-range scan, repeating on a fixed cycle, not in any catalog. Structure to it — too regular for background noise. Recording for ORION to take apart later. Whatever it is, it\'s close."';
