export const meta = {
  name: 'interior-round',
  description: 'One build/render/blind-judge round over every piece of the ship interior',
  phases: [
    { title: 'Build', detail: 'one builder per interior piece, each owning a single module file' },
    { title: 'Render', detail: 'capture every view and generate the blind A/B pairs' },
    { title: 'Judge', detail: 'fresh-context blind judges compare our render against the reference' },
  ],
}

const ROOT = 'C:/Users/deept/Documents/TSAPROJECT'
const round = args.round
const pieces = args.pieces

const VERDICT = {
  type: 'object',
  additionalProperties: false,
  required: ['preferred', 'margin', 'wowed', 'gapA', 'gapB', 'reasoning'],
  properties: {
    preferred: { type: 'string', enum: ['A', 'B'], description: 'Which image is the higher-quality game environment art' },
    margin: { type: 'string', enum: ['decisive', 'clear', 'narrow'], description: 'How far ahead the preferred image is' },
    wowed: { type: 'boolean', description: 'True only if the preferred image is genuinely impressive shipped-AAA-quality work, not merely better of two' },
    gapA: { type: 'string', description: 'The single biggest quality gap holding image A back. One specific, actionable sentence.' },
    gapB: { type: 'string', description: 'The single biggest quality gap holding image B back. One specific, actionable sentence.' },
    reasoning: { type: 'string', description: '2-4 sentences on what separates them' },
  },
}

const briefLine = `Read ${ROOT}/docs/interior-art-brief.md first — it is the shared art direction every piece follows.`

function builderPrompt(p) {
  const prior = p.critique
    ? `\n## Blind critic verdict on your last round\n\nA fresh critic compared your render against the AAA reference without being told which was which.\n\n- Verdict: **${p.critiqueVerdict}**\n- The single biggest gap it identified in YOUR render: "${p.critique}"\n- Its reasoning: ${p.critiqueReasoning}\n\nThis gap is your primary target this round. Fix it decisively — a timid tweak will lose again.\n`
    : `\n## First round\n\nThis is the first pass. The current version is far below the bar: flat saturated brown/blue palette, almost no geometric detail, and prop density an order of magnitude too low. Make a large, confident change, not a tweak.\n`

  return `You are a senior environment artist on a AAA game, working in Three.js. You own exactly one piece of a spaceship interior: **${p.name}**.

${briefLine}

## Your files

- **Edit only:** \`${ROOT}/${p.file}\`
- You may also create \`${ROOT}/src/ship/interior/${p.name}Textures.ts\` for new procedural canvas textures.
- **Do not edit any other file.** Eight other artists are editing the other modules in parallel right now. Touching their files, \`ShipInteriorScene.ts\`, \`ctx.ts\`, or \`ShipTextures.ts\` will corrupt their work.

## What to look at

1. The reference bar: \`${ROOT}/reference/bar.png\` (full room) and \`${ROOT}/reference/crops/${p.name}.png\` (the region your piece corresponds to).
2. Your current output: \`${ROOT}/renders/latest/${p.view}.png\`. This is the actual rendered frame of your piece. Study it against the reference crop and be honest about the distance.
3. \`${ROOT}/src/ship/interior/ctx.ts\` (read-only) for the shared context API, room constants, and helpers.
${prior}
## How to work

Study the reference crop closely, then rebuild your piece to match its craft level. Concretely, that
usually means: correcting the palette to the brief's values, adding real bevelled/panelised geometry
where there are currently bare boxes, adding a second and third layer of smaller detail on top of the
primary forms, and multiplying prop/greeble density several times over. Share materials and geometries
across repeated elements so the draw call and allocation cost stays sane.

Do not simply add more of what is already there — look at what the reference does that your render
structurally does not, and build that.

## Finishing

1. Run \`cd ${ROOT} && npx tsc --noEmit\`. Fix every error **that names your own file**. Errors naming
   other artists' files are their in-flight edits — ignore those, do not "fix" them.
2. Reply with a short summary: what you changed, and what you think is still weakest about your piece.

Do not run the capture or review scripts — a separate render step handles that after everyone finishes.`
}

const renderPrompt = `Run the interior review capture for round ${round}.

1. \`cd ${ROOT} && npx tsc --noEmit\` — report any errors verbatim. If a file fails to compile the render
   will be stale, so this matters.
2. \`cd ${ROOT} && node tools/review-round.mjs ${round}\`
3. If the capture prints a "PAGE ERRORS" block, report it verbatim — it means a module threw at runtime
   and part of the room is missing from the render.

Reply with: whether tsc was clean, whether any page errors appeared, and the list of captured views.
Do not edit any source file.`

function judgePrompt(p) {
  return `You are a principal environment artist judging game art quality. Two images are in front of you:

- \`${ROOT}/renders/blind/${p.name}/r${round}/A.png\`
- \`${ROOT}/renders/blind/${p.name}/r${round}/B.png\`

Read both images and compare them. Both show a section of a science-fiction spaceship or station
interior, framed comparably and rendered at the same size.

**Judge only what is in these two images.** Do not read, search, or open any other file, directory or
source code — not the repository, not any other render, nothing. Which image came from where is
deliberately withheld and you must not try to infer or look it up. If you find yourself reasoning
about "the reference" or "the game project", stop: you have only two images, A and B.

Judge them on the craft that separates shipped AAA environment art from student work:

- **Material believability** — does each surface read as a specific real material, with correct
  roughness, specular response and reflected light? Or as flat coloured plastic?
- **Lighting** — motivated sources, believable pooling and falloff, contact shadows, ambient
  occlusion where forms meet, colour separation between warm and cool.
- **Geometric detail** — bevels, panel seams, rivets, flanges, layered forms. Or bare boxes?
- **Detail density** — how much considered set dressing per square metre, and does it look placed by
  someone with intent rather than scattered?
- **Wear and storytelling** — localised, motivated wear that implies use, versus uniform tint or none.
- **Composition and readability** — is there a clear focal point and a legible value structure?

Then answer:

- \`preferred\`: which image is the better piece of environment art.
- \`margin\`: how far ahead it is.
- \`wowed\`: **true only if the preferred image is genuinely impressive, shipped-AAA-quality work you
  would be happy to see in a released game.** Being merely the better of two mediocre images is not
  enough. Hold this bar high and default to false.
- \`gapA\`: the single biggest thing holding image A back, as one specific actionable sentence.
- \`gapB\`: the same for image B.
- \`reasoning\`: 2–4 sentences on what separates them.`
}

// ---- Build ----
phase('Build')
await parallel(
  pieces.map((p) => () => agent(builderPrompt(p), { label: `build:${p.name}`, phase: 'Build' })),
)

// ---- Render (barrier: every builder must be done before one shared capture) ----
phase('Render')
const renderReport = await agent(renderPrompt, { label: `render:r${round}`, phase: 'Render' })
log(`round ${round} rendered`)

// ---- Judge ----
phase('Judge')
const verdicts = await parallel(
  pieces.map((p) => () =>
    agent(judgePrompt(p), { label: `judge:${p.name}`, phase: 'Judge', schema: VERDICT }).then((v) => ({ piece: p.name, v })),
  ),
)

// Decode the blind slots: p.oursSlot says which of A/B was ours for this piece this round.
const results = pieces.map((p) => {
  const found = verdicts.filter(Boolean).find((r) => r.piece === p.name)
  if (!found || !found.v) return { piece: p.name, error: 'judge returned nothing' }
  const v = found.v
  const ourGap = p.oursSlot === 'A' ? v.gapA : v.gapB
  const theirGap = p.oursSlot === 'A' ? v.gapB : v.gapA
  const oursWon = v.preferred === p.oursSlot
  return {
    piece: p.name,
    oursSlot: p.oursSlot,
    oursWon,
    wowed: oursWon && v.wowed,
    margin: v.margin,
    ourGap,
    theirGap,
    reasoning: v.reasoning,
  }
})

return { round, renderReport, results }
