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

**Exit:** corrections committed; the suites they touch pass (ending 25/25, the stress scenario,
cruise, smoke 6/6, chamber 28/28 three times running).
