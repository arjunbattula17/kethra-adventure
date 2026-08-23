// Captures every interior view for one review round and builds the blind A/B pairs the judges
// grade. Run from the repo root:  node tools/review-round.mjs <roundNumber>
//
// Layout produced (round 2 shown):
//   renders/r2/<view>.png              raw render of each view
//   renders/blind/<piece>/r2/A.png     the blind pair a judge is given
//   renders/blind/<piece>/r2/B.png
//   renders/keys/<piece>-r2.json       which of A/B is ours (judges never get this path)
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, cpSync } from 'node:fs';
import { PIECES, slotsForRound } from './blind-slots.mjs';

// The capture needs the vite dev server. Start one if nothing is answering on 5180.
const BASE = process.env.BASE_URL || 'http://localhost:5180';
let viteProc = null;
async function ensureServer() {
  try {
    await fetch(BASE, { signal: AbortSignal.timeout(2000) });
    return;
  } catch {}
  console.log('starting vite dev server on 5180...');
  viteProc = spawn('npx vite --port 5180 --strictPort', { stdio: 'ignore', shell: true });
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      await fetch(BASE, { signal: AbortSignal.timeout(1000) });
      return;
    } catch {}
  }
  throw new Error('vite did not come up on 5180');
}
await ensureServer();

const round = process.argv[2];
if (!round) {
  console.error('usage: node tools/review-round.mjs <roundNumber>');
  process.exit(1);
}


const roundDir = `renders/r${round}`;
mkdirSync(roundDir, { recursive: true });
mkdirSync('renders/keys', { recursive: true });

const node = process.execPath;
console.log(`--- capturing round ${round} ---`);
execFileSync(node, ['tools/capture-interior.mjs', roundDir], { stdio: 'inherit' });

// Keep renders/latest as a stable path the progress page and agents can always point at.
cpSync(roundDir, 'renders/latest', { recursive: true });

console.log(`--- pairing round ${round} ---`);
const slots = slotsForRound(round);
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
      slots[piece],
      `renders/keys/${piece}-r${round}.json`,
    ],
    { stdio: 'inherit' },
  );
}
console.log(`round ${round} ready`);
if (viteProc) viteProc.kill();
