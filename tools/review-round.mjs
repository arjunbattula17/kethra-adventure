// Captures every interior view for one review round and builds the blind A/B pairs the judges
// grade. Run from the repo root:  node tools/review-round.mjs <roundNumber>
//
// Layout produced (round 2 shown):
//   renders/r2/<view>.png              raw render of each view
//   renders/blind/<piece>/r2/A.png     the blind pair a judge is given
//   renders/blind/<piece>/r2/B.png
//   renders/keys/<piece>-r2.json       which of A/B is ours (judges never get this path)
import { execFileSync } from 'node:child_process';
import { mkdirSync, cpSync } from 'node:fs';

const round = process.argv[2];
if (!round) {
  console.error('usage: node tools/review-round.mjs <roundNumber>');
  process.exit(1);
}

// piece -> the capture view whose framing that piece owns
const PIECES = {
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

const roundDir = `renders/r${round}`;
mkdirSync(roundDir, { recursive: true });
mkdirSync('renders/keys', { recursive: true });

const node = process.execPath;
console.log(`--- capturing round ${round} ---`);
execFileSync(node, ['tools/capture-interior.mjs', roundDir], { stdio: 'inherit' });

// Keep renders/latest as a stable path the progress page and agents can always point at.
cpSync(roundDir, 'renders/latest', { recursive: true });

console.log(`--- pairing round ${round} ---`);
for (const [piece, view] of Object.entries(PIECES)) {
  const outDir = `renders/blind/${piece}/r${round}`;
  execFileSync(
    node,
    [
      'tools/imgtool.mjs',
      'pair',
      `${roundDir}/${view}.png`,
      `reference/crops/${piece}.png`,
      outDir,
      `${piece}-r${round}`,
      `renders/keys/${piece}-r${round}.json`,
    ],
    { stdio: 'inherit' },
  );
}
console.log(`round ${round} ready`);
