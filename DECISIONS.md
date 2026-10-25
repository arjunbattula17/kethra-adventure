# Decisions

Every significant change is sorted into one bucket and recorded here with its reasoning.
- **KEEP:** leave it alone or polish lightly.
- **UPGRADE:** right idea, execution needs work; improve in place.
- **ADD:** missing and needed.
- **CUT/REPLACE:** needs the team's explicit approval before any action, except for
  hard-constraint violations, which are fixed immediately and reported.

**Status:** *Done*, *Proposed* (waiting on the team), *Approved*, or *Rejected*. Items marked
**Team decision** are taste calls. Each one lists options with a recommendation, and work
continues on everything that doesn't depend on the answer.

---

### D-1 · KEEP · The premise, world and characters — *Done*
The stranded survey ship, the Kindling, the Aiveth, Corvenna and Fen, the four worlds. This is
the team's work and the game's identity. LORE.md was written as an expansion of it: no name,
line or fact was changed. Three contradictions in existing text are listed in LORE.md's open
questions for the team to settle (D-11).

### D-2 · UPGRADE · A signature verb carried through levels 1–3 — *Proposed, team decision*
The game's recurring idea is already *reading light*: the scan, the course plot's Doppler speed,
the spectroscopy clue, the Cistern Heart's colours, the white sky. There is no single verb the
player carries between levels yet. **Option A (recommended): "tune".** The Wren's Deep Scanner
reads and emits light frequencies. Level 1 *introduces* it (calibrate the scan to find Kethra),
level 2 *develops* it (call the Heart's three colours in order), and level 3 *twists* it (at the
Anchorage, counter-tune a white sky so a ship doesn't lose power). Stats change what the scanner
can do (D-3). **Option B:** keep separate puzzle types per level, which is simpler but less
memorable to judges. A is recommended because it turns the theme into one verb a judge can name
after playing.

### D-3 · UPGRADE · Stats are how puzzles get solved, on every level — *Proposed*
The TSA challenge requires the RPG system to be *how* puzzles are solved. Kethra already does
this (persuasion, archaeology and insight gate dialogue; perception reveals a hint). The ship
does not, engineering is never checked, and traversal does nothing. Proposal: every level's
critical-path puzzle has at least two solutions, one of them stat-gated (for example,
engineering 2 re-routes power around a dead panel; traversal 2 reaches a vantage point that
reveals the answer). Every stat opens something by the end of level 3. This follows the pattern
the team already built on Kethra, extended rather than replaced.

### D-4 · ADD · A third level: Vessek Anchorage — *Built 2026-09-25 (option A), team to approve*
The rules require three levels, and judges play through level 3. **Option A (recommended):
Vessek Anchorage.** A ring of stranded ships; a social level where persuasion and insight shine,
Harbormaster Varro bargains for the Wren's core, and the set piece is a white sky hitting the
ring mid-level (lights die deck by deck; the player restores power in the right order). It
reuses the ship-interior kit the game already has, which makes it the cheapest level to build
well. **Option B:** Orrun's Reach (a desert with buried machines; a traversal level). It needs a
new outdoor kit and weather, so it's more expensive. Option A is recommended for cost and because
it delivers the story's mid-game reversal (LORE.md).

### D-5 · ADD · Title screen with a start gate, controls screen, credits — *Done 2026-09-25*
Required by the rules (a controls screen from the menu), by licensing (CC BY attribution for the
freighter model and the planet maps), and by browsers (audio can't play before the first
click or key). A title screen with *Continue / New Game / Controls / Credits / Settings*, in the
existing panel style.

### D-6 · ADD · Level select unlocked by progress — *Proposed (pause menu's "Restart this level" covers part of it)*
Judges reload. Saves already persist (localStorage, now safe when storage is blocked). A level
select on the title screen lets a judge jump back to any level they've reached.

### D-7 · CUT/REPLACE · The course plot's typed answers — *Proposed, needs team approval*
The course plot is good maths in the wrong shape: three typed answers on a keypad read as a quiz,
which the rules exclude from counting as educational value. **Proposal:** keep the same three
calculations, but make them actions on the nav chart. Drag the Wren's course to measure the
distance, set the cruise speed and watch the day counter, then pick the arrival window on the
chart grid. The chart shows the result instead of marking an answer right or wrong. Nothing is
deleted until the new version is playable end to end on a branch and the team has tried it.

### D-8 · UPGRADE · Repairs are "collect N of X" — *Proposed*
Ship repair is currently collect-the-resource, then press repair. The rules single out
"collect ten of X to open the door" with no twist. **Proposal:** each repair becomes a small
engineering puzzle (route power through a damaged bus without overloading it), with the resource
as the entry ticket and the engineering stat unlocking shortcuts (D-3).

### D-9 · UPGRADE · Kethra's ground texture is a style outlier — *Proposed, team decision*
The grove's ground and ruins use a photo-scanned rock material (Poly Haven `lichen_rock`) under
hand-painted stylized plants. **Option A (recommended):** replace it with a stylized ground
painted to match the Quaternius plants, originals archived. **Option B:** keep the photo scan
and push the plants toward it. A is recommended: the plants are 90% of what's on screen.

### D-10 · CUT · Unused files in the build — *Proposed, needs team approval*
`public/models/quaternius-nature/glTF/*.png` (20 files, 38 MB) are copies of textures the loader
never requests, and `public/textures/ship_*` plus `bark_willow` (32 MB) are loaded by nothing.
Together that is ~70 MB of a 108 MB build. They are third-party kit files, not student-made, and
would be archived rather than deleted.

*Corrected 2026-10-13:* two of those have since come into use and must stay. `ship_wall` is the
Anchorage's walls and `bark_willow` the roots in the Heart's chamber. What is still loaded by
nothing: `ship_floor`, `ship_console` and `ship_trim` (19.7 MB) and the 20 kit PNGs (37.1 MB), of a
build that is now 98 MB (docs/ASSETS.md).

### D-11 · Team decision · Lore contradictions
Listed in LORE.md, "Conflicts in existing text". The main one: are there crew asleep aboard the
Wren (the chosen reading, which keeps "the only one aboard awake" and the log's "we") or is the
player alone? Recommendation: keep the sleepers. They give the ending a payoff.

### D-12 · Hard constraint · Names in the submission — *Partly done*
*Fixed today:* a machine user path in `tools/interior-round.workflow.mjs`. *Open, team action:*
the repository is under a personal GitHub account, and commit history carries the author name.
Recommendation: deploy through Render or Cloudflare under a project name with the team number,
and ask the advisor whether the repo itself will be shared (if so, a fresh repository without
history is the clean fix; rewriting history is destructive and needs the team's approval).

### D-13 · Hard constraint · Blocked browser storage crashed the game at boot — *Done*
Reading `localStorage` throws where a browser blocks storage. `SaveSystem.hasSave()` and the
settings panel did that unguarded at boot, leaving a black screen. Guarded; the game now plays
without saving there. Covered by `npm run smoke`.

### D-14 · UPGRADE · Texture pass, intro exposition, lore bible — *Done*
See TEXTURE_AUDIT.md, INTRO_DESIGN.md and LORE.md. Texture memory is down 38%, the intro
shows the disaster and ends on the goal, and lore now appears in five in-game places.

### D-15 · ADD · Scaffolding — *Done*
Smoke test (`npm run smoke`), string table (`src/content/strings.ts`), tuning file
(`src/content/tuning.ts`), and the docs in this folder. Build and deploy were already scripted
(`npm run build`, `render.yaml`); DEPLOY.md adds the checklist.

### D-16 · Hard constraint (originality) · Template favicon — *Done*
`public/favicon.svg` was the Vite starter template's logo, not the team's art. Replaced with an
original mark in the game's palette: an amber ring with a beacon dot. Easy to redraw; it's the
team's to change.

### D-17 · Team decision · The game's title
The browser tab still reads "tsaproject", the npm package name, and the repository is
"kethra-adventure". Judges see the tab title first. The team should pick a title; the options
depend on how the team pitches the game. The obvious candidates come from the canon: something
around the white sky, the Wren, or "Cold Start".

### D-18 · UPGRADE · Navigation map redesign, and travel restored — *Done 2026-09-25*
Clicking a planet stopped starting the trip on Aug 22 (commit 8c0f886) and nothing replaced it, so
Kethra was unreachable in normal play. The redesigned map puts travel on a Set Course button in a
dossier panel, draws Kethra's terraces to scale, and adds a survey checklist. It follows
ART_BIBLE.md, so it's an upgrade in place, not a new style.

### D-19 · ADD · The scanner repair resolves the next world — *Done, reversible*
Repairing the Deep Scanner after Kethra resolves the ring of ships at Vessek on the chart (no
landing charts yet), so level 2 no longer ends in a dead end. It anticipates D-4's recommended
third level; if the team picks Orrun instead, it's one planet id in GameFlow and one string.

### D-20 · UPGRADE · Art direction written down and applied to every screen — *Done 2026-09-25*
docs/STYLE_AUDIT.md lists what read as unfinished; docs/STYLE_BIBLE.md is the contract that
fixed it: one visual idea ("every living thing announces itself with its own light"), seven named
colours with one job each, a second typeface (Atkinson Hyperlegible) for reading, sentence case,
one component set, the scan-line transition. It extends ART_BIBLE.md rather than replacing it.

### D-21 · UPGRADE · Designed characters and set pieces replace primitive stand-ins — *Done, reversible*
The Aiveth were capsules and the Cistern Heart was an octahedron: the worst thing on screen
(STYLE_AUDIT.md). Now low-poly figures built in code (`src/characters/Figure.ts`) whose glow shows
mood, a stained-glass Wickmoth, the Heart as a Kindling machine, and Kethra's foliage tinted into
the art bible's palette. The team's models and layout are unchanged.

### D-22 · UPGRADE · Point-light budget for a faster first load — *Done, reversible (one constant)*
The Wren's 41 point lights were compiled into every shader. Keeping the 16 strongest cut a
fresh-browser boot roughly in half with the room within ~2/255 per pixel of before (docs/PERF_LOG.md).
`POINT_LIGHT_BUDGET` in `src/ship/ShipInteriorScene.ts` restores all of them if the team prefers.

### D-23 · ADD · Pause menu, fuller settings, keyboard-only play — *Done*
Esc pauses (resume, settings, controls, restart level, quit). Settings add master/music/effects
volume, reduced motion, text size and mouse sensitivity. The arrow keys now turn (A/D still step
sideways) so the whole game plays without a mouse; every key comes from `src/content/controls.ts`.

### D-24 · ADD · The ending of part one — *Done, wording is the team's*
Repairing comms with the Anchorage's alloy offers the transmission of the ledger; the ending shows
the Wren's light leaving for home, names Isilthe as next, and rolls credits (team ID and every
licensed asset only).

### D-25 · ADD · Sourced models and textures for Kethra, rebuilt to its style — *Built 2026-10-12, team to approve*
The team supplied a list of assets for Kethra: two Poly Haven trees and two ground textures (CC0),
and three Sketchfab models, a ruined column, a crystal cluster and a moth (CC BY 4.0). All are in,
none as downloaded (public/models/CREDITS.md, "kethra/"):
- **Colonnade.** The column scan became a 2,200-triangle flat-shaded piece in the chamber's cut-stone
  colour, eight of them standing in the pool to frame the gate. They are out of reach on purpose:
  inside the Heart's chamber anything that looks like cover has to be a sight block (hush/sim.ts).
- **Resonant crystal** grows in the Cistern Heart's basin, tight to the plinth and no taller than
  it, dark until the wake. The Heart and the Wickmoth themselves are unchanged (D-21).
- **Moths.** Four small moths rest by the glyph lights. They are set dressing with no name or text;
  LORE.md still has one Wickmoth. This is the piece to cut first if it reads as clutter.
- **Trees.** One jacaranda on an islet east of the plaza and eight understory trees in the open water.
  The kit's trees, including the named ones, are all still in place (DESIGN_NOTES.md).
- **Ground.** Loam banks under the belt trees and moss on the terraces, both tinted by brightness.
  This does not settle D-9: the terraces still wear the photo-scanned lichen rock.
- **Water and mist** are written for this scene (src/planets/kethra/water.ts, dressing.ts).

*Settled 2026-10-13 (D-30):* the three CC BY models are out of the build and the colonnade, the
moths and the crystal are built in code. Point (1) below is closed; point (2) is not.

**Two things for the team to decide.** (1) docs/BRIEF.md says third-party assets are CC0 only. The
three Sketchfab models are CC BY 4.0, handled the way the planet maps already are: a row in
docs/ASSET_LICENSE_LOG.md and a line in the end credits (`credits.models`). If the team wants to
hold to CC0 only, remove `column.glb`, `crystal.glb` and `moth.glb` and their callers in
`dressing.ts`. (2) Kethra was already over its Low-tier budget and this adds to it; the numbers are
in docs/PROGRESS.md.

### D-26 · ADD · The survey: things to find on every level — *Built 2026-10-13, team to approve the canon*
Every level now has optional finds, counted as that level's **survey** (the word the surface chart
already used). They are data in `src/content/discoveries.ts`: 4 aboard the Wren, 8 on Kethra, 6 at
the Anchorage. Ten are new; the other eight are finds the levels already had (Kethra's inscriptions,
shrine, valve and last carving; the Anchorage's ring plate, bent grate and Dace's question), which
now count toward the same total.

**Why these rewards.** Before this, nothing in the game raised perception, and persuasion rose only
at the very end, so the Warden's trust (persuasion 2), Varro's message deal (persuasion 3) and the
perception routes through MG2, MG3 and the ring bus could only be reached by spending the one or two
skill points a run earns. The new finds pay the stats the next gates check: the Wren's pay
perception, persuasion and insight before Kethra; Kethra's pay persuasion and perception before the
Anchorage. Looking around is how a route opens.

**What is new, level by level.**
- **The Wren** (offered once the course is plotted): Carrow's note at the workbench, which sends you
  to a key under the sub-deck hatch and so into her locker; Mbeki's unsent letter in the suit
  lockers; the dead COMMS relay, readable at engineering 2. The locker holds a spare log buffer that
  restores the corrupted day-22 travel log, which the journal had always promised and never done.
- **Kethra:** stepping stones from the east terrace's north edge out to the landmark tree, and
  Oshel's grove under it (the lantern there is dark until the Heart wakes, and the text changes with
  it); the Wickmoth's perch on the far arch, readable only once it has settled on the Heart.
- **The Anchorage:** the scope at the hall's east port; Dace's chalk sky, on the wall of her duct and
  so behind the fan circuit; the seed book behind the tanker's last grow table.

**Canon this adds, for the team to approve (LORE.md is yours, D-1).** Each is written from a line
already in LORE.md and changes nothing that exists:
- Carrow kept a spare log buffer and a key ARK told her not to keep; the COMMS relay was a known
  fault ARK would not pay to fix. (LORE: she "left notes taped inside panels".)
- Mbeki wrote, and never sent, an objection to the contract. (LORE: "the one who argued against
  taking the contract".)
- The restored day-22 log fills its three gaps with "a tone on long-range scan", "on a fixed cycle"
  and "ORION to take apart". (LORE: the rehearsal is "a hum on long-range scanners".) The final
  log, with its "we were never supposed to—", is left corrupted: that reading is still yours.
- Oshel's grove is the islet under the old tree. Oshel is still never seen.
- The Aiveth's marks on the far arch stop short of the moth's perch. This says only what LORE
  already says, that the Wickmoth predates the Aiveth; open question 5 stays open.
- The Anchorage has a scope (the ledger's "Scope:" entries), and from it Kethra is now the brightest
  thing in the sky. Dace draws other stars from stories. The hydroponics crop came from the ships'
  galley stores; the Six Sisters "brought the songs".

**Also fixed here, because the finds depend on them.** Reading an inscription, the shrine or the last
carving on Kethra now shows its text on screen. Before, each showed a one-line toast and filed the
text in a journal that only opens aboard the Wren, so the Rite's order could not be read where it is
needed.

**To undo:** delete the entries in `src/content/discoveries.ts` and their placements
(`src/ship/interior/finds.ts`, `KethraScene.buildFinds`, `VessekScene.buildFinds`); the stepping
stones are `STEPPING_STONES` in `src/planets/kethra/dressing.ts`.

### D-27 · ADD · The ending's summary, and a chapter select — *Built 2026-10-13; closes D-6*
The two pieces of docs/DESIGN.md §6 that were still missing from the ending.
- **Summary.** Before the credits: days in flight, survey finds and level as three figures that count
  up; the six skills; the survey world by world; and the choices the save recorded (the deal with
  Varro, whether the Wickmoth ever caught your light, what was recovered).
- **Chapters**, on the title and at the end of the credits. Each of the three levels can be started
  directly. A chapter starts from your own save as it stood when you arrived there, if you have
  been; otherwise from a stand-in with the flags and stats a first playthrough has by then
  (`src/core/chapters.ts`). **Starting a chapter replaces the saved journey**, and with a journey
  saved the first press only arms the row.

**One thing to decide.** Chapters are open from the first launch, so that a judge can go straight to
level 3 without playing levels 1 and 2. If the team would rather a chapter unlock only once reached,
filter `CHAPTERS` in `ChapterSelect.open()` by `Chapters.hasOwn`.

**Not built:** the live 3D title with a match cut into the intro (DESIGN §1). The title is still the
DOM screen. It changes the boot path, the game's least-tested and most timing-sensitive code, and
wants a cold-cache check on real hardware; it is the first item in docs/REPORT.md's next steps.

### D-28 · FIX · The cruise's sun laps the hull at most six times — *Done 2026-10-13, reversible (one constant)*
Found auditing the previous pass. In transit the sun circles the hull once per day of the trip. The
trip to the Anchorage used to borrow Kethra's six days; flying it at the chart's eleven (the fix in
d5bffe9) put eleven laps into the same ten seconds, so the hull went from lit to dark and back about
once a second. The laps are now capped at six, the count the sequence was tuned and looked at with
(`SUN_LAPS_MAX`, src/galaxy/CruiseScene.ts). The day counter and ORION's line still say eleven.
- **What this gives up:** on a trip longer than six days the sun no longer turns exactly once a day.
  The counter is what tells the player the days; the sun is the mood.
- **Kethra's trip is unchanged** (six days, six laps).
- **To undo:** raise `SUN_LAPS_MAX`, or lengthen the transit beat for long trips instead.

### D-29 · Team decision · Four answers the release brief left blank — *Defaults taken 2026-10-13, each reversible*
The brief for the release pass asked the owner four questions and arrived with all four unanswered.
It also said not to stop and ask. Each took the choice that is easiest to undo, and the one the brief
itself recommended where it recommended one.
- **Team number: left as the placeholder.** The credits still read "team #____"
  (`credits.original` in `src/content/strings.ts`), and so does the first line of README.md. A made-up
  number would be worse than a blank one.
- **Chapters: open, behind a flag.** Every chapter can be started from the first launch, so a judge
  can go straight to level 3. `CHAPTERS_OPEN` in `src/core/chapters.ts` is the switch: set it to
  `false` and a chapter is offered only once the player has arrived there, in the list and by its
  `?chapter=` address alike; the Wren always is. `tools/test-ending.mjs` checks both settings of the
  rule. This is the choice D-27 left open.
- **The survey's story text (D-26): not yet approved, kept.** It stays in the game, and every new
  line is set beside its source in docs/CANON_REVIEW.md for the team to mark keep, change or cut.
  That file opens with four places where the text goes past LORE.md.
- **Deadline: none assumed.** The work ran in the brief's order and stopped where docs/REPORT_2.md
  says it stopped.

**One more, not in the brief's list.** A second brief asked for this branch to be pushed and a pull
request opened, with its own questions also blank. Nothing was pushed. Publishing cannot be taken
back, and it was not asked for in the owner's own words.

### D-30 · REPLACE · Kethra's column, moths and crystal are built in code — *Done 2026-10-13; settles D-25 (1)*
docs/BRIEF.md says third-party assets are CC0 only, and D-25 left three CC BY 4.0 models in the
build for the team to rule on. The release brief ruled: replace them. A licence the project's own
rule forbids is a hard constraint, so this was done without waiting (see the buckets at the top).
- **What changed.** `column.glb`, `moth.glb` and `crystal.glb` are deleted. `columnGeometry`,
  `mothGeometry` and `crystalGeometry` in `src/planets/kethra/dressing.ts` build the same three
  things: a fluted column with a square plinth, a moulded base and a top broken on a slant; a moth
  at rest with its wings open; a cluster of seven six-sided shards. Each keeps the size and
  placement its model had, so nothing in the level moved. Their credit line is gone from the ending.
- **What it gives up.** The column was a scan of a real ruin and carried a real ruin's wear. The
  code-built one is plainer: a shaft worn a little out of true, one slanted break, and moss and
  mottling painted into its vertices. The crystal lost its painted edge highlights; its facets are
  shaded in the geometry instead, and its shards are thinner. The moth's wings are a simpler shape
  with a band and a spotted margin. Before and after are in docs/screenshots/release/ (`p1-*`).
  The first version of each was weaker than this and was redone after being looked at beside the
  model it replaced (docs/REPORT_2.md, Phase 1).
- **What stays, on purpose.** The planet maps (CC BY 4.0) and the two fonts (SIL OFL 1.1) are the
  exceptions docs/DESIGN.md §10.3 approved on 2026-09-27. The release brief's "no non-CC0 asset
  remains" would remove them too; the project's rule wins where the two disagree, so they are kept
  and listed in docs/ASSETS.md as approved exceptions for the team to confirm.
- **Found by the same audit.**
  - The built game no longer carried three.js's licence notice, which its MIT licence asks to
    travel with copies. The text now ships as `public/licenses/three.js-LICENSE.txt`.
  - `reference/bar.png` and its ten crops are a commercial game's promotional image. It is not in
    the build and nothing was copied from it, but the repository is public and the project has no
    licence for it. **Left in place for the team to remove** (docs/ASSETS.md says why).
  - Two rows of the licence log called textures unused that two levels load (corrected under D-10).
- **To undo:** `git revert` this commit restores the three files, their loader and their credit.

### D-31 · UPGRADE · Draw calls: three levels brought inside budget, the Wren not — *Built 2026-10-13 on the branch `overhaul-phase2-unverified`; not yet on `overhaul`*
Four views were over docs/DESIGN.md §7's draw-call budgets on both presets: the Wren, Kethra, the
Heart's chamber and the Anchorage. Three are now inside. The Wren is closer and still over.

| View | Low: before → after (budget) | High: before → after (budget) |
|---|---|---|
| Kethra | 231 → **122** (160) | 471 → **253** (450) |
| The Heart's chamber | 141 → **91** (120) | 301 → **202** (300) |
| The Anchorage | 221 → **176** (180) | 450 → **360** (400) |
| The Wren | 271 → 246 (**150**) | 550 → 500 (**350**) |

- **What was done.** Nothing was removed and nothing looks different: the before and after
  screenshots match to within the things that move. Kethra's plants and rocks were an instanced mesh
  per species and are now a mesh per material (`mergeKit`); its terraces and ramps are one mesh per
  stone colour. Figures, fans, the valve, the carving and the pillars are a mesh per material in
  each part that moves as a unit (`mergeRigid`). The shared batcher now lets surfaces share a
  material when they differ only in how one image tiles (`shareTiledTextures`).
- **What it cost.** Kethra holds 22.7 MB of vertex data where it held 11.9: every tree now owns a
  copy of its vertices. Nothing else grew.
- **What it bought, measured.** Kethra on Low at 6× CPU, three runs of each build in turn: the
  median frame went from 29–31 ms to 20–22 ms. The Anchorage: about 2 ms better. The Wren: no
  difference that survives the noise.
- **Why the Wren is still over.** Its 241 scene draws on Low are: 69 surfaces that each carry their
  own tiling colour, normal and roughness maps (63 of them painted on canvases at start-up); 50
  small painted decals, glows and labels, 35 of them transparent; 66 untextured parts, 26 of which
  glow and are dimmed one by one by the power stages; 29 atlas pages; 17 instanced props; ten
  others. The first three kinds cannot share a material by the means used here. Getting to 150 needs
  either texture arrays for the painted surfaces (a custom shader on every surface of the game's
  best-looking room) or fewer distinct painted surfaces (an art decision). Both are larger than a
  release pass should take on blind.
- **One cheaper thing for High only, not done.** On High every mesh is drawn a second time for the
  ambient-occlusion pass (240 of the Wren's 500). Drawing one merged stand-in in that pass instead
  would bring the Wren's High count near 300. It does nothing for Low, which is the tier that matters
  on a school laptop.
- **Where the code is.** On the local branch `overhaul-phase2-unverified`, one commit ahead of
  `overhaul`. Its journey run was cut off at 9 of 16 (all passing) when the machine ran out of
  memory, and a commit goes on `overhaul` only once it has passed all 16. docs/REPORT_2.md has the
  three commands that finish the job.
- **What follows from that.** The release brief's phases are strictly ordered and Phase 2's exit
  is "every scene within its budget". It is not met, so Phases 3 and 4 (WebKit, the throttled
  playthrough, the screenshot matrix, the live title) were **not started**. docs/REPORT_2.md says
  exactly where the work stopped and what the team can choose next.
- **The frame target is a separate matter and is not met either.** DESIGN §7 asks for p95 ≤ 33 ms on
  Low at 6× CPU. Measured after this work: Kethra 37–39 ms, the Anchorage 34–42 ms, the Wren 50–71 ms.
- **To undo:** each of the three techniques is one function and one call site.

### D-32 · Team decision · The remote branch has fifteen commits this one lacks — *Found 2026-10-13; nothing merged, nothing pushed*
Found at the very end of the release pass, by the first check of the push brief (a fetch). On the
remote, `overhaul` and `master` both stand at `30fbd3c`: fifteen commits by a second author, dated
2026-09-27 to 09-30, that this branch has never had. This branch has commits the remote has never
had. The two part at `ca4e4b2` (2026-09-29).
- **What the remote's commits hold**, by their own summary (docs/PERF_CHANGELOG_FOR_TEAM.md on that
  branch): performance work measured on a laptop with Intel UHD graphics. Fewer lights in the Wren
  and the Anchorage, the Wren's instanced pieces merged, textures freed between scenes, each level
  prepared during its cruise, a retry for dropped downloads, recovery from a graphics reset, and a
  hands-on MG1. One commit message reports the Wren at a steady 30 fps on that laptop where it had
  been 16 to 20.
- **What that means for this pass.** Every figure in docs/REPORT_2.md was measured on a build
  without that work. Things the pass lists as open may be closed there: the arrival stall on Kethra
  (issue 22), and "no real weak machine was measured". The Wren's draw calls, where this pass
  stopped (D-31), are something the remote also worked on, by a different route.
- **What that means for a push.** This branch cannot be pushed as it stands. Git would refuse it,
  because it is fifteen commits behind; forcing it would delete the other author's work, which the
  push brief forbids and nobody asked for.
- **A merge conflicts in fourteen files:** DECISIONS.md, docs/PROGRESS.md, src/boot.ts,
  src/core/Engine.ts, src/core/GameFlow.ts, src/core/InputManager.ts, src/galaxy/IntroScene.ts,
  src/planets/kethra/KethraScene.ts, src/planets/kethra/kit.ts, src/planets/vessek/VessekScene.ts,
  src/player/PlayerController.ts, src/ship/ShipInteriorScene.ts, src/ship/interior/kit.ts,
  tools/test-mg3-flow.mjs. Both sides also use the decision number D-25 for different decisions.
- **Recommended.** Merge `origin/overhaul` into this branch on this machine, resolve the fourteen
  by hand with both authors' intent in view, renumber the decisions that collide, run every suite,
  measure every scene again, and only then push. The remote's MG1 differs from the one this
  branch's tests play, so expect test work too. That is a day of careful work on someone else's
  code and a choice between ways of doing it, so it was not started without the team's word.
- **Not done, on purpose:** no merge, no rebase, no push, no force.

### D-33 · UPGRADE · Performance pass measured on a real Intel UHD laptop — *Done 2026-09-27, reversible*
*Numbered D-25 where it was written, on the remote branch: the commits, docs/PERF_REPORT.md and
docs/PERF_CHANGELOG_FOR_TEAM.md call it that. This branch had already used D-25 for the Kethra
dressing, so it took the next free number when the two were merged (2026-10-14).*
Measured on an i5-1035G1 laptop with Intel UHD graphics, the class of machine the game has to run
on (docs/PERF_REPORT.md, "2026-09-27"). Most changes leave the picture identical (image diff at the
noise floor); two change it slightly and are the team's to reverse:
- **Balanced uses FXAA instead of 4x MSAA.** Multisampling was 36% of a Balanced frame on this GPU.
  Edges and the smallest screen text are a touch softer (mean 1.6/255 per pixel). Quality keeps MSAA.
  Revert: `Engine.samplesFor` and the `fxaaPass` line in `PostProcessing.setQuality`.
- **Kethra paints its shadow map once** (as Vessek and the Wren already did). The two Aiveth's
  shadows no longer follow their breathing and head turns, which the map could barely resolve.
  Revert: remove `staticShadows` from `KethraScene`.
Automatic behaviour that changed, all under Settings → Quality → Auto only: Intel UHD/HD and ARM
Chromebook graphics start on Performance; the start-up benchmark re-measures after stepping down and
can lower the render resolution before the first frame; and on Performance a scene that averages
under ~45 fps is held at a steady 30 fps (judged per scene). Choosing a tier by hand turns all of it
off, as before.

### D-34 · Team decision · A failed trip ends back aboard the Wren — *Chosen by the team 2026-10-14; validated on integration/A-validation*
When the remote's fifteen commits were merged (D-32), the two sides had tested opposite behaviour for
one failure: a level file that never loads after the departure. The remote ended the trip on the
"Something didn't load" screen with a reload; this branch (BUG-008) put the player back aboard. The
team chose **back aboard**: a fresh Wren, the player in control, "Navigation data unavailable. Check
your connection and try again.", and the trip can be flown again once the file loads.
- **What changed to hold to it.**
  - `GameFlow.cruiseTo` catches a failed trip, frees the trip's scenes that never reached the screen
    (the remote's design reloaded, so it never needed to), and puts the player back aboard.
  - A **chapter start** whose level fails while it builds now stays on the failure screen with
    nothing started behind it. Before, the Wren booted underneath and covered it. A chapter whose
    level *code* fails to download still lands aboard the Wren with the chapter's progress, as
    before. (`go()` records whether a failure was handled; only a handled one falls back.)
- **Tests.** Check 4 of the remote's `tools/test-load-failure.mjs` expected the failure screen. It
  now expects the recovery above and a successful retry. `stress_tests/s09-failures.mjs` (BUG-008) is
  kept as the regression test for the same thing. `tools/test-ending.mjs` gains the chapter case;
  with the old fallback it fails, as it should.
- **To reverse:** candidate `candidate/merge-B-failure-screen` holds the other choice.

### D-35 · FIX · Jumping works again — *Found and fixed 2026-10-14*
Found validating the merge, when the stepping-stone test passed on one build and failed on another.
A frame-by-frame trace showed that **every jump was cancelled on its first airborne frame**. The
floor snap that walks the player up and down steps also caught a player who was rising, if the floor
was within 1.45 m: at 60 fps a jump's first frame is 0.1 m up, so the player was put straight back
down. Measured on this branch, the merged branch and the remote alike: 0.095 m, held or tapped. It
only worked below about 22 fps, which is likely why nobody noticed. The code is the same as the first
commit's (2026-08-22).
- **The fix:** the snap only applies while not rising (`PlayerController.update`). A standing jump
  now peaks at 0.95 m on Kethra and 0.90 m aboard the Wren, against the 1 m every layout was designed
  for (tuning.ts, "a jump apex of ... 1 m").
- **What it changes for a player:** Space jumps. The stepping stones are crossed by jumping, as
  designed, instead of by sliding down their flared sides, which is what had made that test pass.
- **Not checked by a person yet:** places a working jump now reaches that it didn't before (the top
  of furniture, a shortcut). The layout tests assume the 1 m jump and pass. Both collision checks
  pass with the same counts as before (the Wren 1,757 of 1,757 cells, Kethra 11 targets), but they
  model walking, not jumping, so they do not look for what a jump newly reaches.
- **The remote fixed the same bug independently** (D-36, 2026-10-04), by skipping the floor snap for
  the whole of a jump (`!this.jumping`). That guard makes this fix's condition redundant, so the
  2026-10-24 merge kept the remote's code and comment alone; the behaviour is the same.

### D-36 · UPGRADE · The arrow keys look, W/A/S/D move, and Space jumps — *Done 2026-10-04*
*Numbered D-26 where it was written, on the remote branch (its commits and team changelog call it that). This branch already used D-26, so it took the next free number when the two were merged (2026-10-24).*
Asked for by the team. The mouse looks; the arrow keys are its keyboard stand-in (← → turn, ↑ ↓
look up and down) and no longer move the player, so ↑ and ↓ stop duplicating W and S. A and D
already stepped sideways. Space never left the ground: the floor snap that keeps the player on
stairs caught a jump on its second frame and set it back down, so the jump was one 10 cm frame. A
jump now rises the 1 m the tuning file always assumed and lands with the existing dip and thud.
Overhead colliders (Vessek's ducts, Kethra's root tunnels) stop the head, and anything that blocks
walking still blocks mid-jump, so a jump can't carry the player over a waist-high object and set
them down inside it. Floors up to 1.45 m above the take-off become reachable by jumping, which
nothing on the critical path depends on. Covered by `tools/test-controls.mjs`.

### D-37 · UPGRADE · A cinematic title screen with a live 3D backdrop — *Done 2026-10-16, reversible*
*Numbered D-27 where it was written, on the remote branch (its commits and team changelog call it that). This branch already used D-27, so it took the next free number when the two were merged (2026-10-24).*
The title is now a heavy capital ship over Kethra's day side at sunrise, rendered live
behind the menu, with a new wordmark and glowing hexagonal buttons; the menu is up at once and the
backdrop arrives complete, in one dissolve (src/galaxy/title/TITLE_DESIGN.md). Choices the team can
reverse:
- **The title has its own palette.** Deep-space blues with cyan marking what can be picked, instead
  of the game's amber and sea-green; Controls and Settings take it while the title is up. Revert: the
  token block at the top of the Title screen section of `src/style.css` and the
  `body.title-open .panel-overlay` rule.
- **Continue is shown disabled, with the reason, when there is no usable save** (it used to be
  hidden), so the menu always has the same four rows. Revert: skip the `add('title.continue', …)`
  call in `TitleScreen.show` when `opts.hasSave` is false.
- **A ship, the tagline and corner labels, after a new reference** (2026-10-16, second pass, at the
  user's request; an earlier pass that day had taken all three out). The ship is a new model built
  for the title to match the reference (`titleShip.ts`), not the Wren hull the intro flies, so the
  two ships differ. Rebuilt 2026-10-19 after the team's reference images: heavier, dark gunmetal
  with cyan light, a door and small boosters at the stern.
  The kicker reads "A deep-space survey" and the tagline "Your ship went dark past
  the edge of the charts. Wake it up." (`title.kicker`, `title.tagline`). The corner labels are
  decoration in the game's own terms ("Beyond the Kessic Drift / Uncharted system" where the
  reference had a made-up station and sector; `title.hud*`). Revert: drop `buildTitleShip` from
  `TitleScene.init`; empty `.ts-tagline`; remove the `.ts-hud` block from `TitleScreen.show`.
- **The world keeps its own time.** Nothing in the backdrop follows the pointer or the menu (the
  camera used to lean toward the pointer and the sunrise to swell on each selection), nothing on the
  menu loops, and there is no staged opening: the menu fades in as one piece and the backdrop arrives
  whole. Reduced motion holds the camera still and stops the meteors.
The backdrop can be switched off entirely by not calling `TitleScreen.startBackdrop` in `boot.ts`:
the menu then runs over its CSS starfield, as it does on any machine where the 3D fails to build.

### D-38 · UPGRADE · Nothing to walk through, nowhere to get stuck — *Done 2026-10-04*
*Numbered D-28 where it was written, on the remote branch (its commits and team changelog call it that). This branch already used D-28, so it took the next free number when the two were merged (2026-10-24).*
`tools/wall-sweep.mjs` drives the real player into every wall it can reach in the Wren, on Kethra
and on Vessek (walking, sprinting and jumping, at 60 fps and at the engine's 10 fps floor) and
checks the body and the camera against every visible triangle. What it found, now fixed:
- **Vessek's drop vents trapped the player** (live build). Crawling out of either one left them
  wedged against the wall under the vent, or inside the grow table under Dace's vent, and no key
  moved them; the tanker is reached that way during the crisis. Each drop vent has an unseen lip,
  so the fall starts clear of the wall, and the grow tables' tops are floors to land on.
- **Nothing can hold the player inside a collider any more.** Whatever leaves them overlapping one
  (a door, a fall), a move that takes them out of it is always allowed. The junction's keypad door
  also waits while someone stands in it instead of shutting on them.
- **The camera went through the root-tunnel arches** in the Heart's chamber: they hung at head
  height, and walking a tunnel passed through each one. They're lifted into the roof and show as
  braces where they meet the walls; the tunnels' size and the Wickmoth's sight lines are unchanged.
- **The Wren's wall fixtures above 2.1 m had no collision**, which a jump reached; colliders now
  cover everything up to the top of a jump.
- **Crouched, the eye sat above the top of the body**, so a crouched jump under a duct roof put
  the camera in the roof. The crouched view is 10 cm lower (1.0 m, still above the stealth mounds'
  0.82 m), and there's no jumping where there's no room to stand.
- **Vessek pieces with no collision:** Varro and Dace, the crate and barrel by the desk, the
  4 m pipe holder (only its middle 0.8 m was solid), the school stools and the junction's reset
  panel.
- **Two grime decals on the Wren's console** still sat where the old, smaller room had its desk,
  and hung in the air 1.2 m in front of it.
Covered by `tools/test-controls.mjs` (22 checks) and the sweep.

### D-39 · UPGRADE · The whole-game art pass: the weakest scenes first — *Done 2026-10-24, reversible*
A capture of the whole journey on the real GPU (`tools/capture-journey.mjs`, 62 shots) was ranked by
visual quality and the weakest brought up, one at a time, each looked at before and after:
- **The title was black on High** (a P1 found by the capture, not by any test): the ship's plumes and
  the shooting stars wrote NaN pixels under 4x MSAA and the bloom spread them (69463fc).
  `tools/nan-scan.mjs` now checks every scene.
- **MG2's canopy** (b7547d3): broad faceted leaves instead of soft blobs, Kethra's cold moon above,
  bark on the boughs, amber running lights on the skiff. Gameplay unchanged. Revert: the commit.
- **The cruise into Kethra** (5fefe8a): the title's planet (`heroPlanet`) replaces the cruise's
  Kethra, lit from the side for a crescent and terminator; the living lights below read; the arrival
  title is the design's 88 px, low in the frame, in each world's light. **A team call:** the title and
  the cruise now show the same Kethra; reverting to the old cruise planet is the commit's
  `CruiseScene.ts` hunk.
- **First light** (2fb3c42): the view leans over the throttle; its rim is a ring round the grip.
- **The Hush lantern** (a976a27): matcap brass instead of flat colour.
- **Back aboard after MG1** (cad35c0): the Wren builds under the win; no loading screen.
- **Not changed, on purpose:** the return trip from a planet still shows the loading screen. Building
  the Wren while the planet is resident would hold both levels' textures for several seconds, which
  the 8 GB school laptop is the wrong machine to risk. MG1's charter is left as the team redesigned
  it (DESIGN §4, 2026-09-28 and 29): height is deliberately never the player's problem, so it does not
  pass the brief's "could this be 2D?" test; the original 3D concept (1A) is the way back if the team
  wants it.

### D-40 · UPGRADE · The Wren inside both draw-call budgets — *Done 2026-10-25, reversible*
The opening level drew 246 calls on Low against DESIGN §7's 150 and 500 on High against 350 (D-31
left it there; a halved measurement on 2026-10-24 made Low look inside, corrected in 7ded32c). Now 138
and 334 (134bbd8). Nothing was removed; four changes to how the room's static geometry batches:
- **On Low, shadow flags don't split batches.** Low draws no shadows, so a mesh's cast and receive
  flags change nothing there; 26 draws were one material split by them. A batch casts and receives if
  any part did, which is what a player who switches to High mid-visit sees (until the next visit
  rebuilds the room).
- **Surfaces fold into vertex attributes** (`mergeSurfaces`): opaque lit materials that differ only in
  colour, roughness, metalness and glow share one material, with each part's values in the vertices
  and a small shader patch reading them. Glows are grouped by the power role that dims them, so the
  emergency and navigation stages look as before (checked: 0.02% of pixels differ by more than 8/255).
- **The atlas packs across tints**: canvases that differ in tint, opacity or roughness share a page,
  each keeping its own values for the passes above to fold.
- **envMapIntensity is ignored where three.js ignores it** (a material with no env map of its own
  draws with the scene's environment intensity).
- **What it cost:** 10 more shader programs (82; a longer compile on a cold cache, issue 22), 5 MB
  more vertex data, and merged batches cull as one (149.5k triangles at the spawn view against 150k;
  other views 141k). On the big screens, two transparent layers now blend in another order: a faint
  brightening under the bezel glint, visible only side by side. Every other view matches the old
  build within its own run-to-run noise.
- **What it bought:** Low at 6× CPU, settled, p95 27–29 ms where the old build measured 32–45 in the
  same session; the design's 33 ms target is now met in all three levels once each has settled (issue
  42).
- **Vessek is unchanged:** the surface folding is opt-in (`batchStaticGeometry(..., { surfaces: true })`)
  because it replaces materials, and every material changed after the build must first be registered
  as animated. The Wren's were audited (one was missing: the deck strip). Vessek's were not.
- **To undo:** pass `{}` instead of the options in `ShipInteriorScene.ts`.
