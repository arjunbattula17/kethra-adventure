// Vessek Anchorage documents: what the player reads in level 3.
//
// vessek_ledger is the evidence for the mid-game reversal (LORE.md, "Level 3"): every rehearsal
// pulse in sixty years arrived on schedule, until eleven days after Kethra's Heart was relit.
// vessek_ring_plate is the archaeology read that confirms why: the ring and the Hearts are relays.

import type { JournalLogEntry } from '../../core/GameState';

export const VESSEK_ENTRIES: JournalLogEntry[] = [
  {
    id: 'vessek_ledger',
    title: 'The Anchorage Ledger — last page',
    body:
      'Every ship pulled in, in four generations of handwriting.\n\n' +
      'LANTERN BAY: year 0. MIREILLE (tanker): year 7. COPPER HEN: year 13. SIX SISTERS: year 22. …and on down the page, one every six to nine years.\n\n' +
      'Rehearsals (dim flash, no ships lost), in Varro’s hand: every 26 months, give or take four days, for sixty years.\n\n' +
      'Last entries:\n' +
      '— Unknown freighter, amber running lights. Full white sky. Drifted in dark. (That was the Wren.)\n' +
      '— Scope: lights on Kethra’s terraces, bright as we’ve ever seen.\n' +
      '— Eleven days later: REHEARSAL. Not due for two years. Every lamp in the ring went out.',
    corrupted: false,
    timestamp: 'Vessek Anchorage — the Lantern Bay',
    unlocked: false,
  },
  {
    id: 'vessek_ring_plate',
    title: 'The Ring Plate — Kindling script',
    body:
      'A bronze-coloured plate under the gallery floor, in the same script as Kethra’s carvings. You can read most of it now.\n\n' +
      '"This ring answers the Hearts. The Hearts answer the Choir. When every Heart is bright, the Choir is heard from edge to edge, and all our light comes home."\n\n' +
      'The Anchorage has been standing on a Kindling relay for sixty years. So has Kethra.',
    corrupted: false,
    timestamp: 'Kindling Era — ring station plate',
    unlocked: false,
  },
];

/** The breaker labels, each written by a different ship's crew (the ring is a patchwork). */
export const BREAKER_NOTES = {
  regulator: 'REGULATOR. First on, or nothing holds. —Lantern Bay',
  pumps: 'Circulation pumps. Needs the regulator. —Mireille crew',
  heaters: 'Hydroponics heaters. NO FLOW = TRIP. Pumps first!! —Dace',
  scrubbers: 'Air scrubbers. Needs the regulator. Don’t skip these. —Copper Hen',
  dock: 'Dock lights. Come back on by themselves after a pulse. —Six Sisters',
  lamps: 'Lantern Bay hall lamps. Also come back by themselves. —I. Varro',
} as const;
