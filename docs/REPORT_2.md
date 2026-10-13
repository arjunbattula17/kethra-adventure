# Report 2 · the release pass (2026-10-13)

The brief for this pass: make the game safe to submit, fast on weak hardware and trustworthy, in
four strict phases after an audit, and stop at a clean commit wherever time runs out. This file is
written phase by phase, so that wherever it ends is where the work ended.

**Read this first.** At the very end of the pass a fetch showed that the remote `overhaul` branch
holds fifteen commits this branch has never had: a second author's performance work, measured on
a real Intel UHD laptop. The two branches have parted and conflict in fourteen files (DECISIONS
D-32). So nothing here can be pushed until they are merged by hand; every measurement below is of
a build without that work; and the place this pass stopped, the Wren's draw calls, is something
the other branch also worked on. Merging the two is the next job.

**And second:** Phase 2's code is on a local branch of its own, `overhaul-phase2-unverified`,
because its last verification run was cut off when the machine ran out of memory. `overhaul` holds
Phases 0 and 1, both proven, and this report.

**Where the brief and the project disagree** (the brief says the project's rules win):
- *"No non-CC0 asset remains."* The project's approved design (docs/DESIGN.md §10.3, approved
  2026-09-27) keeps two exceptions: the planet surface maps (CC BY 4.0) and the two fonts (SIL OFL
  1.1). They are listed in docs/ASSETS.md as approved exceptions, not removed. See Phase 1.
- *The owner decisions were left blank.* Each took the default the brief itself recommends
  (DECISIONS D-29).
- *A second brief asked for the branch to be pushed.* Nothing has been pushed. Publishing cannot be
  undone and was not asked for in the owner's own words, so it waits for a yes.

Figures are from this session's runs unless a file is cited.

---

## Phase 0 · Audit of the previous pass

### The four tests the previous pass changed

| Test | What was changed | Verdict | Evidence |
|---|---|---|---|
| `tools/test-mg3-flow.mjs` (the chamber) | Waits for the moth to settle on its next perch before asserting it, and before the next breath | **Intent preserved; the explanation was imprecise and is corrected** | `HushGame.update` calls `brain.moveTo(RITE_PERCHES[step])` *before* it resolves a pending breath (`held()` → `step++`). So for one frame after a breath counts, `step` is ahead of the moth, which is still `perched` on its old perch. The test polled every 50 ms, read `perch` inside that frame, then pressed the next key inside `BREATH_COOLDOWN` (1.2 s), where `breathe()` returns early. The check's subject, "it comes a step closer", is still asserted, now on arrival. Not a game fault: the gap is one frame and the cooldown is by design |
| `tools/test-kethra-flow.mjs` | Closes the document after each read | **Intent preserved** | No assertion changed. Reading an inscription now opens a panel, which pauses the engine; without the close, the next `E` reached nothing |
| `stress_tests/s07-flow.mjs` (double-click) | Spliced `kethra_warden_met` out of the save between its two conversations | **Weakened in method; redone** | The comparison needs two conversations that open on the same line. Rewinding the save made that true by editing game state the scenario was not about. It now gets past the greeting once and compares a click and a double-click on the first *topic*, where the Warden's conversation really opens from then on. The assertion is the original plus a check that both opened on the same line |
| `tools/collision-check.mjs` | Travels by `flow.debugGo`; marks one target `JUMP` instead of `FAIL`; treats a target with no geometry as its origin | **Intent preserved, with one caveat** | The old travel event now starts a cinematic that waits on a held key, so the tool could not arrive at all. The `JUMP` allowance is by label, so it would not notice the stepping stones being removed; `tools/test-survey.mjs` would, because it crosses them |

### The four player-path fixes, run again without the tests written beside them
`scratchpad/scripts/audit_run.mjs`: a different quality tier and seed, the real trip in (map, Set
course, First light, cruise), walking by key, levers thrown by hand, no flags set. 22 of 22.

| Fix | How it was exercised | Result |
|---|---|---|
| The pool on arrival at Kethra | Walk, then sprint, straight off the landing; walk back from the plaza; hug each edge of the span | No fall in any |
| Inscription text | Walk from the plaza up the west ramp to the pillar, press E | The carving's 276 characters on screen; the game runs again on closing |
| The Anchorage trip's days | Read the chart, set course, read ORION's caption and the day counter | Chart 10.4 days; "Burn started. 11 days."; counter to day 11 |
| Dace's conversation | Meet Varro, meet Dace, switch the fans off and the school on at their levers, talk again | Her ducts line, then her question about other stars, persuasion +1 |

### What the audit found wrong in the previous pass, and corrected
1. **The days fix made the sun strobe.** In transit the sun laps the hull once a day. Eleven days in
   the same ten seconds lapped it in under a second: two frames 0.38 s apart show the hull lit, then
   dark. The laps are now capped at the six the sequence was tuned at; the day counter still counts
   eleven (DECISIONS D-28).
2. **A chapter whose level failed to load left a black screen.** A chapter boots with no ship
   behind it, and the level's own failure path assumes one. It now falls back to booting the Wren
   with the chapter's state. `tools/test-ending.mjs` blocks the level's file and checks where it lands.
3. **Older saves undercounted Kethra's survey.** The shrine's flag was new; a save that already held
   the shrine's record did not have it. It is set from the record on arrival.
4. **The stress scenario**, above.

### Looked for and not found
- Changes to the save's shape: none. New flags only; `migrateSave` is untouched; chapter snapshots
  live under their own key and go through the same migration when loaded.
- Stray logging, `TODO`s or debug defaults in the new files: none.
- Boot: the only new paths are `?chapter=` and `#chapters`, both covered by `test-ending`.

### A note on the test machine
The laptop went to sleep during this phase (power log: 08:29:35 to 09:14:34), one second into a
chamber-test run, which then failed with every wait expired. That run is discarded. The chamber test
passed five other runs, three of them consecutively after the wake. A process-scoped keep-awake
request (no power setting changed) was held for the rest of the session's unattended runs.

**Exit:** corrections committed as `c53e322`; the suites they touch pass (ending 25/25, the stress
scenario, cruise, smoke 6/6, chamber 28/28 three times running). That commit, checked out on its own
and built, passes the journey suite 16 of 16 (09:28 to 09:49, no sleep in the power log).

---

## Phase 1 · Submission blockers

### What the licence audit found
Every third-party file in the build was checked against its source's own licence page on the day,
not against the old log. The result is docs/ASSETS.md.

| Found | Done |
|---|---|
| Three CC BY 4.0 models in the build (Kethra's column, crystal cluster and moth), against the project's CC0-only rule | Rebuilt in code; the three files (244 KB) and their credit line are gone (DECISIONS D-30) |
| The built game no longer carried three.js's licence notice. Its MIT licence asks that the notice travel with copies; the bundler strips it | The licence text now ships with the build, `public/licenses/three.js-LICENSE.txt` |
| `reference/bar.png` and ten crops of it: a commercial game's promotional image, logos included. Not in the build, but in a repository that is public | **Left in place and flagged.** It needs a person; see "Needs a human" at the end |
| The licence log called `ship_wall` and `bark_willow` unused. The Anchorage's walls and the chamber's roots load them. D-10 proposes archiving them | Log and D-10 corrected. Acting on D-10 as written would have broken two levels |
| `public/fonts/CREDITS.md` listed a font file that is not there and left out Atkinson Hyperlegible | Corrected |
| The planet maps (CC BY 4.0) and the two fonts (SIL OFL 1.1) are not CC0 | **Kept.** They are the exceptions the approved design keeps (DESIGN §10.3). Listed in docs/ASSETS.md for the team to confirm, with what replacing them would take |

### The three models, rebuilt
Same size and placement as the files they replace, so nothing in the level moved.

| | Model | In code | 
|---|---|---|
| Column | 2,200 triangles, a reduced photo scan | 810 triangles: plinth, moulded base, a shaft with 16 shallow flutes, a slanted break |
| Crystal cluster | 2,157 triangles and a 512 px texture | 216 triangles, 12 shards, no texture; each face carries its own shade |
| Moth | 900 triangles | 80 triangles: two rounded wings a side, a band and a spotted margin |

**The first version was not good enough, and the screenshots showed it.** The columns read as a
picket fence with a saw-tooth top; the crystals were pale, chunky and had no facets; the moth was
four white triangles. All three were redone: the shaft is worn out of true and broken on one long
slant, the crystals have almost twice the shards and per-face shading, the moth has rounded wings.
Before and after, same cameras: `docs/screenshots/release/p1-*.jpg`.

What is still weaker than the originals: the column has none of a real ruin's chipping, and the
crystal has no bright edge lines. Zoomed far in, the crystals' edges show stair-steps against the lit
water; that is the half-resolution post pass, which the paler originals hid.

| Scene | Preset | Draw calls | Triangles | Textures |
|---|---|---|---|---|
| Kethra | Low, before → after | 231 → 231 | 362k → 349k | 63 → 62 |
| Kethra | High, before → after | 471 → 471 | 843k → 798k | 86 → 85 |
| Chamber view | Low, before → after | 138 → 141 | 359k → 347k | 63 → 62 |
| Chamber view | High, before → after | 302 → 301 | 872k → 819k | 86 → 85 |

`tools/measure-scene.mjs`, one run each; "before" is the finishing pass's table in docs/PROGRESS.md.
The chamber view's calls move by a few with where the moth's gaze is in its sweep. Draw calls were
not the aim here; they are Phase 2's.

### Credits and the team number
The ending's credits are six lines: the team, the planet maps, the two kits, Poly Haven, the fonts,
three.js. **The team number is still a placeholder** ("team #____"), because none was given
(DECISIONS D-29). It is in two places: `credits.original` in `src/content/strings.ts`, and the first
line of README.md.

### The survey's story text (D-26)
Not yet approved, so kept and listed: docs/CANON_REVIEW.md sets each of the ten new documents, the
restored day-22 log and the smaller lines beside the LORE.md sentence it was written from. It opens
with the four places the text says more than its source does: where Oshel's grove is, "the brightest
thing in the sky", ARK refusing its crew twice, and Mbeki agreeing to fly.

### Chapters (D-27)
Open from the first launch, as the brief recommends, with a switch: `CHAPTERS_OPEN` in
`src/core/chapters.ts`. Set to `false`, a chapter is offered only once the player has arrived there,
both in the list and by its `?chapter=` address. `tools/test-ending.mjs` checks the rule both ways.

### Verified
- Type-check clean. `tools/test-ending.mjs` 28 of 28, including the gate. `tools/test-survey.mjs
  kethra` 23 of 23: it reads the Wickmoth's perch and crosses the stepping stones, which are in the
  same merged mesh as the columns. `tools/collision-check.mjs kethra`: 11 targets, none failing (one is reached by a jump, as before).
- The journey suite on the build that was committed: 16 of 16 (10:20 to 10:41, no sleep in the power
  log, and no source file changed between that build and the commit).
- Looked at: the columns from the plaza and the landing, the crystals asleep and awake, each moth
  perch, on High; the columns and crystals on Low.

### Not verified
- The crystals during the wake itself (the light travelling up the terraces), only before and after.
- A console warning on arriving at Kethra, "THREE.Material: parameter 'map' has value of undefined",
  is in the build from before this phase as well. Its source was not traced.

**Exit:** no CC BY model, no unlicensed file in the build; credits match what ships; the two
approved exceptions are documented; one repository-only image is flagged for a person.

---

## Phase 2 · Performance

### Measured first
Every view `tools/measure-scene.mjs` can reach, both presets, on the Phase 1 build, before any
change. The tool gained two views it could not reach, the cruise in mid-transit and MG2.
Draw calls a frame, with the budget from docs/DESIGN.md §7 in brackets.

| View | Low | High |
|---|---|---|
| Intro | 19 (80) | 32 (160) |
| **The Wren** | **271 (150)** | **550 (350)** |
| Reveal and MG1 | 29 (80) | 39 (160) |
| Cruise | 22 (80) | 32 (160) |
| MG2 Canopy | 30 (120) | 40 (300) |
| **Kethra** | **231 (160)** | **471 (450)** |
| **The Heart's chamber** | **141 (120)** | **301 (300)** |
| Docking shot | 31 (80) | 41 (160) |
| **The Anchorage** | **221 (180)** | **450 (400)** |
| Ending | 24 (80) | 34 (160) |

Four views over, on both presets; the six space and cinematic views well inside. One triangle count
is over that this phase did not touch: MG2 draws 271k on Low against 250k.

### Where the calls were going
A script that records every draw of one frame showed three things the earlier logs had not:
- **Kethra's plants and rocks were 68 draws**: one instanced mesh per species per part, though the
  56 species use only 12 materials between them. Its 12 terraces and ramps were 24 more, each with
  its own material because each tiled the rock map differently.
- **Each character was about 24 draws**, a primitive at a time.
- **On High every mesh is drawn twice**, once more for the ambient-occlusion pass, so a draw saved
  is two saved there.

### What changed
| View | Low: before → after (budget) | High: before → after (budget) | |
|---|---|---|---|
| Kethra | 231 → **122** (160) | 471 → **253** (450) | inside |
| The Heart's chamber | 141 → **91** (120) | 301 → **202** (300) | inside |
| The Anchorage | 221 → **176** (180) | 450 → **360** (400) | inside, by 4 on Low |
| The Wren | 271 → 246 (150) | 550 → 500 (350) | **still over** |

The six views that were already inside were not measured again after the change; none of them
uses the code that changed.

Standard three.js merging, in three functions:
- `mergeKit` (src/planets/kethra/kit.ts): instanced kit meshes that draw alike become one mesh, each
  placement baked into its vertices. Run once the colliders, which read the placements, are built.
- `mergeRigid` (src/core/mergeRigid.ts): the meshes of a part that moves as a unit become one mesh
  per material. Used for the characters (legs, torso, each arm, head), the Anchorage's fans, and by
  hand for Kethra's pillars, valve and carving.
- `shareTiledTextures` (src/ship/interior/materialMerge.ts): where surfaces sample the same image
  and differ only in how it tiles, the tiling moves into each mesh's UVs so they can share one
  material. The Wren's and the Anchorage's existing batcher then merges them (it found 117
  shareable materials where it had found 26).
- Smaller: Kethra's terraces as one mesh per stone colour, its glow motes as one mesh per colour,
  the Anchorage's duct floors as one mesh, the ledger's page as a sheet instead of a per-face
  material.

### Nothing looks different
The same fixed cameras before and after, compared pixel by pixel (mean difference per channel on a
0–255 scale): the Wren, 7 cameras, 0.00–0.19; the Anchorage, 6 cameras, 0.01–0.49; Kethra, 21
cameras, 0.01–1.31 on High. What difference there is, is the things that move: motes, water, lamps,
the moth's gaze (one Low frame of the chamber differs by 10.5 because the gaze was mid-sweep).
Three of the pairs are in `docs/screenshots/release/` (`p2-*.png`) on the Phase 2 branch.

### What it bought
Low at 6× CPU, three runs of each build in turn, median / 95th-percentile frame in ms:

| | Before | After |
|---|---|---|
| Kethra | 28.8 / 47.6, 29.0 / 52.2, 30.6 / 52.1 | **21.5 / 38.5, 21.6 / 36.9, 20.0 / 38.4** |
| The Anchorage | 23.0 / 38.0, 22.5 / 40.1, 20.0 / 38.6 | 20.6 / 33.8, 21.1 / 41.8, 18.2 / 34.8 |
| The Wren | 32.9 / 53.1, 33.6 / 54.7, 34.7 / 52.1 | 33.0 / 50.5, 31.5 / 60.1, 35.3 / 71.2 |

Kethra's median frame is about a quarter shorter and its runs agree with each other. The Anchorage
is about 2 ms better at the median, and its 95th percentile is inside the noise. **The Wren shows
no gain**: 25 fewer draws of 271 is not measurable.

**The design's frame target, p95 ≤ 33 ms on Low at 6× CPU, is not met in any of the three levels**,
before or after.

### What it cost
Vertex data held by each scene on Low: Kethra 11.9 → **22.7 MB** (each tree now owns a copy of its
vertices); the Anchorage 10.1 → 10.1; the Wren 8.2 → 8.6. Texture counts did not change.

### Verified
- **The journey suite was cut off at 9 of 16, all nine passing.** The machine ran critically short
  of memory while the run was unattended, and the session's background jobs were stopped: the
  journey run, the preview server it was using, and the keep-awake request. The seven tests that
  did not run in that pass are MG2, the chamber, the dialogue test, the Kethra flow, the Anchorage
  flow, the survey and the ending. Five of those seven had been run by hand on this code earlier
  (below). MG2 and the ending test had not been run on it at all, and both end inside a level
  whose code changed, so they are the two that most need running.
- **`stress_tests/run.mjs` was not run on the Phase 2 code**, for the same reason.
- Type-check clean on the code as it stands.
- Run by hand during the work: `tools/test-vessek-flow.mjs` 49/49 and `tools/test-survey.mjs` 20/20
  (the Wren) and 14/14 (the Anchorage) on the final code; `tools/test-kethra-flow.mjs` 16/16,
  `tools/test-mg3-flow.mjs` 28/28, `tools/test-dialogue-esc.mjs` 4/4 and the Kethra survey 23/23 on
  the code one step before final (the batcher's tiling step and the Anchorage's fans and floors
  came after; Kethra's own code did not change again).
- `tools/collision-check.mjs`: the Wren 1,757 of 1,757 cells reachable, as before. Kethra 11 targets,
  none failing; its colliders went from 242 to 230 because the pillars, valve and carving are one
  box each now, and 17 fewer cells are walkable next to them.

### Phase 2's code is on its own branch, not on `overhaul`
The brief's rule is that every commit passes the journey suite on its own. Phase 2's did not get
to finish its run, so its code is **not** on `overhaul`. It is committed on a local branch,
`overhaul-phase2-unverified`, one commit ahead of `overhaul`, so nothing is lost and nothing unproven
is presented as proven. To bring it in once memory is free:

```
git switch overhaul-phase2-unverified
npm run build && npm run preview -- --port 4191 --strictPort      (one terminal)
node tools/run-journey.mjs http://localhost:4191/kethra-adventure/    (another; about 25 minutes)
git switch overhaul && git merge --ff-only overhaul-phase2-unverified    (only if all 16 pass)
```

Every Phase 2 figure in this report is of that branch.

### Phase 2's exit is not met
The brief's exit for this phase is every scene inside its draw-call budget. **The Wren is not**: 246
against 150 on Low, 500 against 350 on High. DECISIONS D-31 says what its remaining draws are and
why the means used here cannot share them. The honest summary: three of four levels fixed, the
fourth improved by a tenth, and the fourth is the one the player spends the opening in.

---

## Where the pass stopped

**In Phase 2, for two separate reasons.** The Wren is still over its draw-call budget, which is the
phase's exit; and the phase's last verification run was cut off when the machine ran out of memory
(above). `overhaul` itself stands at a clean, proven commit: Phase 1, plus these documents. The
brief orders the phases strictly and allows a phase only once the one before has met its exit, so:

- **Phase 3 was not started.** Not done: the journey under WebKit; a 4× and 6× throttled
  playthrough; the four-size screenshot matrix; reduced motion, pause, restart, save and resume
  checked in two browsers. One known problem sits here untouched: docs/PERF_AUDIT.md records that
  Playwright's WebKit build on Windows shows a black 3D view after New Game. It was never checked on
  a real Mac.
- **Phase 4 was not started.** Not done: the live 3D title, a third Kethra find, docs/PLAYTEST.md
  and its telemetry.

If the team would rather have Phase 3 than a finished Wren, that is a reasonable call and it is
theirs: say so and the next pass starts there. **Before either, see D-32:** the remote branch has
work on the Wren's performance that this branch has not seen, and the two have to be merged first.

---

## What was not verified, and what will most likely break

**Not verified**
- **Any real weak machine, by this pass.** Every number here is from one PC with an RTX 4060, with
  the CPU throttled as a stand-in. A Chromebook's GPU, memory pressure and thermal throttling are
  not modelled by that. (The remote branch holds a teammate's measurements on an Intel UHD laptop;
  see D-32. They are of a different build from this one.)
- **Any browser but Chromium.** See Phase 3.
- **A person playing.** Every playthrough was a script. Nobody has judged whether the three
  rebuilt models, the survey's text or the chapter list read well.
- **The canon** (docs/CANON_REVIEW.md): written from LORE.md, approved by nobody.
- **Every camera.** The draw-call figures are the view each scene opens on, which is how the budget
  has always been measured. Other views differ: the Anchorage is inside its Low budget by only 4.
- **The wake on Kethra with the merged kit**, beyond the flow tests passing and the awake
  screenshots matching.

**Most likely to break on real hardware or with real people**
1. **The Wren on a school laptop.** It is the first level, it is the one still over budget, and at 6×
   throttle its 95th-percentile frame is 50 ms or worse.
2. **Kethra's arrival stall** (issue 22, about ten seconds linking shaders on a cold cache). Untouched
   by this pass, and the first thing a judge on a fresh machine would meet after the cruise. The
   remote branch has a commit aimed at exactly this (D-32), which this branch does not have.
3. **Safari.** Unknown, with one black-screen report on record.
4. **Memory on a 4 GB machine at Kethra**: 11 MB more vertex data than before, on a scene already
   over its texture budget.
5. **A judge reading the repository** and finding `reference/bar.png`.

---

## Decisions made on the owner's behalf
All in DECISIONS.md, each with how to undo it.
- **D-28** The cruise's sun laps the hull at most six times.
- **D-29** The four blank owner answers took their defaults: team number left as a placeholder;
  chapters open, behind `CHAPTERS_OPEN`; the survey's text kept and listed for review; no deadline
  assumed. And the second brief's push was not carried out.
- **D-30** The three CC BY models rebuilt in code; the planet maps and fonts kept as the approved
  exceptions; the reference image flagged and left.
- **D-31** Three levels brought inside their draw-call budgets at the price of 11 MB at Kethra; the
  Wren left over budget rather than rewriting its shaders blind; the pass stopped in Phase 2.
- **D-32** On finding that the remote branch has fifteen commits this one lacks: not merged, not
  rebased, not pushed. Recorded, with the fourteen files that conflict, for the team to decide.

Smaller choices, made and reversible: the release brief's "no non-CC0 asset" was read as "none
beyond the two the approved design keeps"; the brief's stray `tsc` package was removed from the npx
cache; a keep-awake request was held on this PC during the long runs (it ended with the other
background jobs when memory ran short); Phase 2's unproven code was kept on its own branch.

---

## Needs a human, most urgent first
1. **The remote has fifteen commits this branch lacks, and the two conflict** (DECISIONS D-32).
   A second author's performance work, measured on a real Intel UHD laptop, was pushed to
   `overhaul` and `master` on the remote at the end of September. This branch never had it.
   Nothing here can be pushed until the two are merged by hand, and nothing here was measured with
   that work in. Decide who merges and when; it is the next job whatever else is chosen.
2. **`reference/bar.png` and `reference/crops/`**: a commercial game's promotional image in a public
   repository. Remove it, and ask the advisor whether the history needs a fresh repository (D-12).
3. **Phase 2 needs its journey run** before it joins `overhaul` (the commands are under Phase 2).
   It was not restarted here: the machine had 1.1 GB of its 15.7 GB free when checked afterwards.
4. **The push.** Nothing has been pushed, and item 1 is why it cannot simply be. The second
   brief's checks, run without changing anything: this branch is behind the remote and a merge
   conflicts (its first gate fails); this branch's own commits add no file over 5 MB (the largest
   is 1.4 MB), no stray file types and no paths from this machine; docs/ASSETS.md exists; every
   commit here is by one account. A clean install was not run. A scan for key files by name was
   refused by this machine's command policy and replaced by a listing of added files by type.
5. **The team number** in `src/content/strings.ts` (`credits.original`) and README.md, line 1.
6. **TSA's rules on CC BY and OFL material.** The planet maps and both fonts are credited and
   licensed for this use, but they are not CC0. docs/ASSETS.md has the detail.
7. **Phase 3 or the Wren?** Decide which the next pass does first (D-31).
8. **docs/CANON_REVIEW.md**: mark each row keep, change or cut. Four are flagged at the top.
9. **A real Chromebook and a real Mac**, with docs/TESTING_ON_A_REAL_CHROMEBOOK.md.
10. **The commit author names.** This branch's commits carry one account name; the remote's fifteen
   carry a second author's handle and personal email address. If the repository is submitted, D-12's
   fresh-repository fix covers both.
11. **57 MB of files nothing loads** (D-10, corrected: two of its textures are in use).
12. **Chapters open or gated** for the submitted build (`CHAPTERS_OPEN`).

---

## Git receipt
- `overhaul`, local: `c53e322` (Phase 0), `fe67639` (Phase 1), then the commit that adds this
  report. Working tree clean. Phases 0 and 1 each passed the journey suite 16 of 16 on their own
  build; the report's commit changes no code.
- `overhaul-phase2-unverified`, local: one commit ahead of `overhaul`, holding Phase 2's code.
  Type-checks; journey 9 of 16 run, all passing, then cut off.
- Remote: untouched. Nothing pushed, nothing merged, nothing rebased, nothing forced. After the
  fetch, `origin/overhaul` and `origin/master` are at `30fbd3c`, fifteen commits this branch does
  not have (D-32).
- No longer running: this session's preview servers and its keep-awake request. Left running, not
  this session's: the servers on ports 4174, 4180, 5173 and 5176.
