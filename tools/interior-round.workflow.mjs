export const meta = {
  name: 'interior-round',
  description: 'One build/light/render/blind-judge round over every piece of the ship interior',
  phases: [
    { title: 'Build', detail: 'one builder per interior piece, each owning a single module file' },
    { title: 'Render', detail: 'capture every view after the material pass lands' },
    { title: 'Light', detail: 'calibrate exposure, bloom and occlusion against the reference histogram' },
    { title: 'Rerender', detail: 'recapture and generate the blind A/B pairs' },
    { title: 'Judge', detail: 'fresh-context blind judges compare our render against the reference' },
  ],
}

const ROOT = 'C:/Users/deept/Documents/TSAPROJECT'
const round = args.round
const all = args.pieces
const builders = all.filter((p) => p.name !== 'lighting')
const lighting = all.find((p) => p.name === 'lighting')

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

function priorSection(p) {
  if (!p.critique) {
    return `\n## First round\n\nMake a large, confident change, not a tweak.\n`
  }
  return `## Blind critic verdict on your last round

A fresh critic compared your render against the AAA reference without being told which was which.
It ${p.oursWon ? 'preferred your version' : 'preferred the reference'}.

**The single biggest gap it identified in YOUR render:**
> ${p.critique}

Its reasoning: ${p.critiqueReasoning}

This gap is your primary target this round. Fix it decisively — a timid tweak will lose again.
`
}

function builderPrompt(p) {
  return `You are a senior environment artist on a AAA game, working in Three.js. You own exactly one piece of a spaceship interior: **${p.name}**.

Read ${ROOT}/docs/interior-art-brief.md first — it is the shared art direction every piece follows.

## Your files

- **Edit only:** \`${ROOT}/${p.file}\`
- You may also create/edit \`${ROOT}/src/ship/interior/${p.name}Textures.ts\` for procedural canvas textures.
- **Do not edit any other file.** Other artists are editing the other modules in parallel right now.
  \`ShipInteriorScene.ts\`, \`ctx.ts\`, \`ShipTextures.ts\`, \`PostProcessing.ts\` and \`lighting.ts\` are off limits.

## What to look at

1. The bar: \`${ROOT}/reference/bar.png\` (full room) and \`${ROOT}/reference/crops/${p.name}.png\` (your region).
2. Your current output: \`${ROOT}/renders/latest/${p.view}.png\` — the actual rendered frame of your piece.
3. \`${ROOT}/src/ship/interior/ctx.ts\` (read-only) for the shared context API and room constants.

${priorSection(p)}
## Measured value structure for your piece

\`\`\`
${p.exposure}
\`\`\`

These are perceived-luma statistics of your current render against the reference crop. They are the
objective version of the critic's complaint. **You do not control global exposure** — a separate
lighting pass handles that after you finish. What you *do* control, and what these numbers are
telling you:

- **crushed% far above the reference** means your dark areas are dead pure black. The reference has
  almost no true black anywhere: its shadows still carry material and detail. Raise the albedo of
  surfaces that are reading black and make sure they have some texture/roughness variation to catch
  light, rather than leaving flat near-black base colours.
- **p95 far above the reference** means your brightest surfaces are too light. The reference's
  highlights top out well below white. Bring hot albedo values (especially large light-painted
  areas) down, and let emissive elements — not base colour — carry the brightness.

## The recurring critique across all nine pieces this project

Every judge said the same thing: **surfaces read as flat untextured plastic with one uniform
roughness, and nothing is grounded.** Prop count is no longer the problem — material response is.
Concretely, that means:

- Give distinct materials genuinely distinct roughness/metalness, not the same value with a different
  colour. Painted metal, bare steel, rubber, glass and worn composite should respond differently.
- Use texture maps (\`map\`, \`roughnessMap\`, \`normalMap\`) rather than flat colours. \`applyPbr()\` from
  \`../../core/TextureLibrary\` wires up the downloaded PBR sets; procedural canvas textures work too.
- Set \`castShadow\` and \`receiveShadow\` on your meshes so the lighting pass can actually ground them.
- Put wear where use would put it — grime pooling in seams, edge chipping on corners, drip streaks
  under pipes — not as a uniform tint.

## Finishing

1. Run \`cd ${ROOT} && npx tsc --noEmit\`. Fix every error **that names your own file**. Errors naming
   other artists' files are their in-flight edits — ignore those.
2. Reply with a short summary: what you changed, and what you think is still weakest.

Do not run the capture or review scripts — a separate render step handles that.`
}

const renderPrompt = (tag) => `Run the interior capture for ${tag}.

1. \`cd ${ROOT} && npx tsc --noEmit\` — report any errors verbatim.
2. \`cd ${ROOT} && node tools/review-round.mjs ${round}\` (it starts its own dev server if needed).
3. If the capture prints a "PAGE ERRORS" block, report it verbatim — it means a module threw at
   runtime and part of the room is missing from the render.

Reply with: whether tsc was clean, any page errors, and the list of captured views.
Do not edit any source file.`

function lightingPrompt() {
  return `You are a lighting artist on a AAA game, working in Three.js. You own the ship interior's
**lighting and post-processing** — the room's whole value structure.

Read ${ROOT}/docs/interior-art-brief.md first.

## Your files

- \`${ROOT}/src/ship/interior/lighting.ts\` — scene lights
- \`${ROOT}/src/core/PostProcessing.ts\` — the composer chain (bloom, grade, output)
- You may also create \`${ROOT}/src/ship/interior/lightingTextures.ts\` (e.g. light cookies / gobos).

**Do not edit any other file.** The eight geometry/material modules were just finished by other
artists and are final for this round.

## The problem, measured

Every blind judge this project has said the room is *blown out*, *flat*, and that *nothing is
grounded — no contact shadows, no ambient occlusion*. The numbers agree. Run:

\`\`\`
cd ${ROOT} && node tools/exposure-check.mjs
\`\`\`

This grades every view's perceived-luma histogram against the matching reference crop. The two
failures that repeat across almost every piece:

1. **p95 is +0.13 to +0.40 above the reference.** The reference's highlights top out around 0.47–0.58
   luma. Ours run to 0.87. The room reads as washed out.
2. **crushed% is 9–28% versus the reference's ~0.1%.** We have huge regions of dead pure black. The
   reference has essentially none: every shadow still carries readable material detail.

Together those mean our value structure is squeezed into the two extremes with nothing in the middle,
while the reference lives almost entirely in a rich 0.05–0.6 band. Fixing this is the highest-leverage
change available to the whole room.

## What to consider

- \`renderer.toneMappingExposure\` and the tonemapping operator (set in \`src/core/Engine.ts\`, which you
  may **not** edit — so compensate inside \`PostProcessing.ts\` instead, e.g. an exposure/filmic-curve
  term in the grade shader).
- The bloom pass's threshold/strength/radius — currently strength 0.45, radius 0.4, threshold 0.95.
- **Ambient occlusion.** \`three/examples/jsm/postprocessing/GTAOPass.js\` and \`SSAOPass.js\` are both
  available in this project's three build. AO is the single most direct fix for "nothing is grounded"
  and would address the complaint every judge raised. Verify the constructor signature against the
  installed source in \`node_modules/three/examples/jsm/postprocessing/\` before wiring it up — do not
  guess the API.
- Shadow-casting lights: only two lights currently cast shadows, at 512px. More casters and/or higher
  resolution will produce real contact shadows.
- Lifting the shadow *floor* so blacks carry detail, while pulling highlights down — that is the shape
  of the whole fix.

## How to work — iterate against the numbers

You are the one builder permitted to render. Loop:

\`\`\`
cd ${ROOT} && node tools/review-round.mjs ${round} && node tools/exposure-check.mjs
\`\`\`

then look at \`${ROOT}/renders/latest/hero.png\` and compare it by eye to \`${ROOT}/reference/bar.png\`.
Iterate until the p95 and crushed% deltas are inside tolerance across most pieces **and** the hero
shot actually looks better — the numbers are a guide, not the goal. Do at least three iterations.

Watch out for: over-darkening into mud (median dropping well below the reference), and killing the
cool screen glow / warm practical separation the room's colour story depends on.

## Finishing

1. \`cd ${ROOT} && npx tsc --noEmit\` must be clean.
2. Confirm \`renders/latest/hero.png\` renders without page errors.
3. Reply with the before/after exposure-check numbers and what you changed.`
}

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

// ---- Build: the eight geometry/material pieces, in parallel ----
phase('Build')
await parallel(builders.map((p) => () => agent(builderPrompt(p), { label: `build:${p.name}`, phase: 'Build' })))

// ---- Render: barrier, so lighting calibrates against the finished material pass ----
phase('Render')
await agent(renderPrompt('the material pass'), { label: `render:materials`, phase: 'Render' })
log(`round ${round}: material pass rendered, calibrating lighting`)

// ---- Light: alone, iterating against the reference histogram ----
phase('Light')
const lightingReport = await agent(lightingPrompt(), { label: 'light:calibrate', phase: 'Light' })

// ---- Rerender: fresh blind pairs from the lit result ----
phase('Rerender')
const renderReport = await agent(renderPrompt('the final round state'), { label: `render:final`, phase: 'Rerender' })
log(`round ${round} rendered, judging`)

// ---- Judge ----
phase('Judge')
const verdicts = await parallel(
  all.map((p) => () =>
    agent(judgePrompt(p), { label: `judge:${p.name}`, phase: 'Judge', schema: VERDICT }).then((v) => ({ piece: p.name, v })),
  ),
)

// Decode the blind slots: p.oursSlot says which of A/B was ours for this piece this round.
const results = all.map((p) => {
  const found = verdicts.filter(Boolean).find((r) => r.piece === p.name)
  if (!found || !found.v) return { piece: p.name, error: 'judge returned nothing' }
  const v = found.v
  const oursWon = v.preferred === p.oursSlot
  return {
    piece: p.name,
    oursSlot: p.oursSlot,
    oursWon,
    wowed: oursWon && v.wowed,
    margin: v.margin,
    ourGap: p.oursSlot === 'A' ? v.gapA : v.gapB,
    theirGap: p.oursSlot === 'A' ? v.gapB : v.gapA,
    reasoning: v.reasoning,
  }
})

return { round, lightingReport, renderReport, results }
