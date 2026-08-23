// Prepares one interior round: writes a per-piece brief (decoded blind critique + measured value
// structure) to renders/briefs/, and emits the small args object the workflow needs.
//
//   node tools/build-round-args.mjs <round> <prevResults.json|-> <exposure.txt> <out.json>
//
// Pass "-" for prevResults on the first round.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { slotsForRound } from './blind-slots.mjs';

const [round, prevPath, exposurePath, outPath] = process.argv.slice(2);

const PIECES = [
  ['floor', 'floor', 'src/ship/interior/floor.ts'],
  ['walls', 'wallLeft', 'src/ship/interior/walls.ts'],
  ['ceiling', 'ceiling', 'src/ship/interior/ceiling.ts'],
  ['console', 'console', 'src/ship/interior/console.ts'],
  ['displays', 'displays', 'src/ship/interior/suspendedDisplay.ts'],
  ['airlock', 'airlock', 'src/ship/interior/airlock.ts'],
  ['props', 'props', 'src/ship/interior/props.ts'],
  ['starfieldWindow', 'window', 'src/ship/interior/starfieldWindow.ts'],
  ['lighting', 'hero', 'src/ship/interior/lighting.ts'],
];

const slots = slotsForRound(Number(round));
const prev = prevPath === '-' ? [] : JSON.parse(readFileSync(prevPath, 'utf8'));
const byPiece = Object.fromEntries(prev.map((r) => [r.piece, r]));

// exposure-check emits one "=== <piece> ===  ours: ..." header per block; split on the line start
// so the trailing "===" on the same line does not split it again.
const blocks = {};
for (const chunk of readFileSync(exposurePath, 'utf8').split(/^=== /m).slice(1)) {
  blocks[chunk.split(' ')[0]] = ('=== ' + chunk).trimEnd();
}

mkdirSync('renders/briefs', { recursive: true });

const pieces = PIECES.map(([name, view, file]) => {
  const p = byPiece[name];
  const briefPath = `renders/briefs/${name}-r${round}.md`;

  const critiqueSection = p
    ? `## Blind critic verdict on your last round

A fresh critic compared your render against the AAA reference without being told which was which.
It **${p.oursWon ? 'preferred your version' : 'preferred the reference'}** (margin: ${p.margin})${p.wowed ? ', and was genuinely impressed' : ''}.

### The single biggest gap it identified in YOUR render

> ${p.ourGap}

This is your primary target this round. Fix it decisively — a timid tweak will lose again.

### Its full reasoning comparing the two

${p.reasoning}

### What it thought was weakest about the *reference*

> ${p.theirGap}

That is where the reference is beatable. You do not have to merely catch up.
`
    : `## First round

No critic feedback yet. The current version is far below the bar. Make a large, confident change.
`;

  writeFileSync(
    briefPath,
    `# ${name} — round ${round} brief

${critiqueSection}
## Measured value structure

Perceived-luma statistics of your current render against the reference crop — the objective version
of the critic's complaint.

\`\`\`
${blocks[name] || '(no measurement available)'}
\`\`\`

You do **not** control global exposure; a separate lighting pass handles that after you finish.
What these numbers tell you about your own work:

- **crushed% far above the reference** means your dark areas are dead pure black. The reference has
  almost no true black anywhere — its shadows still carry material and detail. Raise the albedo of
  surfaces reading black and give them texture/roughness variation to catch light, rather than
  leaving flat near-black base colours.
- **p95 far above the reference** means your brightest surfaces are too light. The reference's
  highlights top out well below white. Bring hot albedo values down and let emissive elements, not
  base colour, carry brightness.
`,
  );

  return { name, view, file, oursSlot: slots[name], brief: briefPath, hasCritique: !!p };
});

const missing = pieces.filter((p) => !blocks[p.name]);
if (missing.length) console.error('WARNING: no exposure block for:', missing.map((p) => p.name).join(', '));

writeFileSync(outPath, JSON.stringify({ round: Number(round), pieces }));
console.log(`round ${round} args -> ${outPath}  (${pieces.length} pieces, briefs in renders/briefs/)`);
console.log('slots:', pieces.map((p) => `${p.name}:${p.oursSlot}`).join(' '));
