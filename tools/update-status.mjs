// Refreshes renders/status.json, which the progress page polls.
//   node tools/update-status.mjs <round> <resultsJsonFile>
// results: [{ piece, oursWon, wowed, margin, ourGap }]
import { readFileSync, writeFileSync } from 'node:fs';

const [round, resultsPath] = process.argv.slice(2);
const results = JSON.parse(readFileSync(resultsPath, 'utf8'));

const VIEWS = {
  lighting: 'hero',
  floor: 'floor',
  walls: 'wallLeft',
  ceiling: 'ceiling',
  console: 'console',
  displays: 'displays',
  airlock: 'airlock',
  props: 'props',
  starfieldWindow: 'window',
};

const prev = JSON.parse(readFileSync('renders/status.json', 'utf8'));
const byPiece = Object.fromEntries(results.map((r) => [r.piece, r]));

writeFileSync(
  'renders/status.json',
  JSON.stringify(
    {
      round: Number(round),
      updated: new Date().toISOString().replace('T', ' ').slice(0, 19) + 'Z',
      pieces: prev.pieces.map((p) => {
        const r = byPiece[p.name];
        if (!r) return p;
        return {
          name: p.name,
          view: VIEWS[p.name],
          round: Number(round),
          won: !!r.oursWon,
          note: r.oursWon
            ? `Preferred over the reference (${r.margin})${r.wowed ? ' — judge was wowed' : ''}. Next: ${r.ourGap}`
            : r.ourGap,
        };
      }),
    },
    null,
    2,
  ),
);
console.log('status updated for round', round);
