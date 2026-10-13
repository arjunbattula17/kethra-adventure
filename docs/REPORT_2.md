# Report 2 · the release pass (2026-10-13)

The brief for this pass: make the game safe to submit, fast on weak hardware and trustworthy, in
four strict phases after an audit, and stop at a clean commit wherever time runs out. This file is
written phase by phase, so that wherever it ends is where the work ended.

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
