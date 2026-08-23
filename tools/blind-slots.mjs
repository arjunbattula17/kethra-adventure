// Single source of truth for which of A/B is our render in a given round's blind pairs.
//
// Assignment is deterministic (so the driver and the orchestrator agree without passing state) and
// per-round balanced (so half the pieces put ours in A and half in B). An unbalanced draw would let
// any positional bias in a judge read as a real quality signal.
import { createHash } from 'node:crypto';

export const PIECES = {
  floor: 'floor',
  walls: 'wallLeft',
  ceiling: 'ceiling',
  console: 'console',
  displays: 'displays',
  airlock: 'airlock',
  props: 'props',
  starfieldWindow: 'window',
  lighting: 'hero',
};

const rank = (piece, round) => parseInt(createHash('sha256').update(`${piece}-r${round}`).digest('hex').slice(0, 12), 16);

/** @returns {Record<string,'A'|'B'>} piece -> the slot holding OUR render this round. */
export function slotsForRound(round) {
  const names = Object.keys(PIECES).sort((a, b) => rank(a, round) - rank(b, round));
  const half = Math.ceil(names.length / 2);
  return Object.fromEntries(names.map((n, i) => [n, i < half ? 'A' : 'B']));
}
