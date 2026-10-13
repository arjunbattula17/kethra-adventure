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
