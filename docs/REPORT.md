# Report · the overhaul (2026-10-25)

The overhaul brief (docs/BRIEF.md) asked for the game to be taken from a working prototype to a
finished, consistent piece: audit, design, build in vertical slices, a whole-game pass, then this
report. This is the final report. Earlier passes have their own: the finishing pass (2026-10-13) is
the previous version of this file (`git show 0420221:docs/REPORT.md`), and the release pass is
docs/REPORT_2.md. docs/PROGRESS.md is the running log; DECISIONS.md holds every decision with how to
undo it.

**Where it stands.** All eight milestones are done (M0 to M8, PROGRESS "Milestones"). The game plays
from the title to the ending with no console errors on any tier; every suite passes on the final
build; every scene is inside its Low draw-call and triangle budgets; the Low frame target is met once
a level has settled. Two things are not at the bar and are said plainly below: texture memory is over
budget in two scenes (issue 49), and the first mini-game does not pass the brief's "could this be
2D?" test, by the team's redesign. A last pass (2026-10-25 to 26, below) checked where this branch's
work meets the team's and fixed the thirteen issues it found there.

Judgements here (quality, "feels") are [opinion]; every figure names where it was measured.

---

## 1 · What changed, by area, and why

The whole overhaul in brief; each line points at the decision or log that has the detail.

- **Foundations (M0).** One motion module (`src/motion`: springs, tweens, tokens, a Conductor that
  holds the HUD and ducks ambient motion under hero moments), a flow state machine, a debug harness,
  per-scene colour grades, the UI plate kit (chamfered opaque plates, sentence case, tabular figures)
  and the Wren rebuilt in code. Why: everything after rests on one way to move, one way to look, and a
  way to jump to any state to test it (DESIGN §3, §8).
- **Level 1 and Mini-game 1 (M1).** The reveal rebuilt at plot scale as MG1's opening, MG1 as a
  hands-on charter (drag the course onto Kethra's path on the right day), the course drawn on the desk
  chart, the Wren's lighting arc from emergency to full power (DESIGN §4 slot 1; redesigned twice with
  the team, 2026-09-28 and 29).
- **First light and the cruise (M2).** A held throttle that powers the ship stern to helm, a match
  cut through the viewport into a 45-second cruise that hides the next level's build (DESIGN §5).
- **MG2 Canopy (M3)** and **MG3 Hush (M4).** Two new mini-games on Kethra: steering a skiff down
  through a dark forest with a lamp, and a first-person stealth Rite under the Wickmoth's gaze
  (DESIGN §4 slots 2 and 3).
- **Level 2, Vessek expanded (M5).** Four compartments joined by ducts, a ring bus of physical levers,
  a frost clock, and a docking arrival among twenty moored hulls (DESIGN §6).
- **Opening, menus, ending (M6).** The ending's summary and a chapter select; the live 3D title was
  built by the team (D-37); the arrival title now carries the level's number (issue 25).
- **Whole-game and art pass (M7).** A survey of 18 things to find (D-26), a ranked art pass of the
  five weakest scenes (D-39), the four-size screenshot matrix, and the fixes they found.

**This last pass (2026-10-24 to 25)**, in the order it was done:
- **Integration.** The team's 35 new commits (the live title, arrow-key look, the wall sweep,
  low-end memory work) were merged with this branch's; the release pass's draw-call work (D-31)
  re-applied on top; three collision holes the team's wall sweep found were closed (QA log).
- **Correctness.** The title black on High (NaN pixels under MSAA), black frames while a level
  upgrades its lighting (b1570e5), seven places where the camera came within centimetres of geometry
  or passed through it (503fbfb), 208–256 WebGL warnings per arrival on High (e3ba2af), a jump 10 cm
  short at 30 fps (b25fbbb), the cloud the skiff drops through
  showing square edges (3763abc), trees seen through the Heart's chamber door vanishing as the player
  walked in (197a575).
- **Art** (D-39): MG2's canopy, the cruise's Kethra and its arrival title, First light's throttle, the
  Hush lantern, the Vessek vents.
- **UI.** The HUD inside a 16:9 safe area on ultrawide screens; the credits roll on short screens;
  one arrival title per level instead of a title and a card.
- **Performance.** Kethra inside its Low triangle budget (7c45ab8); the Wren inside both draw-call
  budgets for the first time (D-40, 134bbd8); a measuring error found and corrected on the way
  (7ded32c: the Wren's Low count had been read as 123 when it was 246).
- **Tools.** `console-scan`, `nan-scan`, `capture-journey`, `live-frames-check`, `test-frame-rates`,
  `draw-list`, `measure-scene --settled`.

**The seams pass (2026-10-25 to 26).** Everything this branch adds on top of the team's last commit
(f624308) was reviewed in four areas, after the team's own tests had been run on the final build (all
passed). Thirteen issues, all fixed (PROGRESS 50–62). The eight a player can meet were each seen on
the build before the fix and are gone after: seven in `stress_tests/s15-seams.mjs`, the shallows in
a render from above. The rest were found in the code:
- **Where the two branches' code meets.** The Wren, built behind MG1's win, put "Click to look
  around" over the chart; it now does that on arrival, as the team's levels already did. A first
  trip that failed before leaving lost the team's console guide. Two of the team's level files went
  without its download retry. The Wren's batching went by the tier's name, not by whether shadows
  are drawn (the player can turn them on at Performance). The governor's battery and steady-30 caps
  were counted twice.
- **Saves and input.** Enter held on the title's Chapters replaced the saved journey; a chapter
  could open on a level already finished; after a hold-to-skip, the first jump was ignored.
- **Kethra.** The shallows were painted mirror-image, the glow motes made an invisible step near the
  landing, a step off the last stepping stone sank into the loam, and the moon's shadow could miss
  the trees.
- **Shaders.** pow() of a value that can round just below zero, in the cruise's planet and the
  team's title shaders (never seen; clamped).

---

## 2 · How to run it

```
npm install
npm run play          # builds, then opens the production version
```
`npm run dev` for live reload. Needs Node and a browser with WebGL 2.

**Controls** (the in-game Controls screen and docs/CONTROLS_AND_HOW_TO_PLAY.md print the same table,
both generated from `src/content/controls.ts`): mouse or the arrow keys to look, W A S D to move,
Shift to sprint, Space to jump, C or Ctrl to crouch, E to interact, Tab for the character sheet,
O for settings, Esc to pause. In the Heart's chamber F or the right mouse button hoods the lantern,
and 1 2 3 breathe the Rite's colours. Holding Space or Enter, or the hint, skips a cinematic. Everything works from
the keyboard alone.

**Chapters** on the title starts any of the three levels.

**Performance readout** (the team's): the backquote key (`) or `?fps` shows frame rate, frame times,
draw calls, memory and the quality setting on any machine.

**Debug** (`?debug=1`): F1 jumps to any state, F2 and F3 win and fail the current mini-game, F4
cycles the time scale, F7 freezes, F8 steps a frame; an overlay shows frame time, draw calls,
triangles and memory. `?tier=low|medium|high` pins the quality tier; `?seed=N` fixes every random
stream; `?jump=kethra|vessek|ending` starts there.

**Tier names.** This report uses the brief's Low, Medium and High; the game's Settings call the same
tiers Performance, Balanced and Quality.

**Checks**
```
npm run build
npx vite preview --port 4180 --strictPort     # keep running
npm run journey                               # sixteen flow tests, title to ending
node stress_tests/run.mjs                     # fourteen stress scenarios
node tools/measure-scene.mjs ship --tier=low --cpu=6 --settled   # one scene's counters
```

---

## 3 · Performance

On this PC (RTX 4060) at 1366×768, DPR 1, the view each scene opens on. Counts from
`tools/measure-scene.mjs` (per frame drawn, all post passes included), 2026-10-25. Budgets from
DESIGN §7; **bold** is over.

| Scene | Low: calls / triangles (budget) | High: calls / triangles (budget) |
|---|---|---|
| Intro | 17 / 6k (80 / 150k) | 27 / 6k (160 / 300k) |
| Reveal + MG1 | 29 / 12k (80 / 150k) | 38 / 11k (160 / 300k) |
| The Wren | 138 / 150k (150 / 150k) | 334 / 299k (350 / 300k) |
| Cruise | 30 / 7k (80 / 150k) | 40 / 7k (160 / 300k) |
| MG2 Canopy | 34 / 198k (120 / 250k) | 44 / 198k (300 / 600k) |
| Kethra | 126 / 186k (160 / 320k) | 267 / 597k (450 / 900k) |
| The Hush (chamber view) | 93 / 163k (120 / 200k) | 206 / **504k** (300 / 500k) |
| Docking at Vessek | 31 / 108k (80 / 150k) | 41 / 108k (160 / 300k) |
| Vessek | 167–175 / 177–186k (180 / 200k) | 360 / 375k (400 / 400k) |
| Ending | 24 / 7k (80 / 150k) | 34 / 7k (160 / 300k) |

**Frame time.**
- **Low proxy** (DESIGN: p95 ≤ 33 ms at 6× CPU throttle), three runs each once the level's arrival
  work is done (`--settled`): the Wren 24.1–27.6 ms, Vessek 22.6–25.3, Kethra 24.0–34.6 (one run of
  three over). During its first ~20 s on Low the Wren compiles its full lighting programs in the
  background and holds 30 fps by design.
- **High** (p95 ≤ 17 ms unthrottled): 3.9–6.9 ms per frame at p95 in the Wren, Kethra and Vessek with
  vsync off, so the whole pipeline's cost, on installed Chrome (`tools/perf-frames.mjs`,
  docs/perf/final-20261025).

**Texture memory on Low** (estimated as TEXTURE_AUDIT.md does): the Wren **210 MB** against 150,
Vessek **165 MB** against 110, Kethra 84 against 90. Issue 49 has the breakdown, what was tried, and
why it was reverted.

**Other costs of this pass:** the Wren's batching added 10 shader programs (82) and 5 MB of vertex
data; its Low and High triangle counts sit within 0.5% of their budgets.

The budgets are counters on a desktop GPU with a CPU throttle standing in for a school laptop. They
are not frame rates on that laptop (§7).

---

## 4 · Verification

Against the production build after the seams pass (`npm run build`, `vite preview`), this PC, Chrome on its GPU.

| Check | Result |
|---|---|
| Type-check and build | Clean |
| `npm run journey` (sixteen flow tests, title to ending, every mini-game's win, fail and retry) | 16 of 16 |
| `stress_tests/run.mjs` (key spam and held keys across alt-tab and the cut, resize spam, corrupt saves and blocked storage, dropped downloads mid-trip, skips mid-cruise, round trips measured for leaks, and the seams between the branches) | 14 of 14 (s08 keeps its one open design question, BUG-013) |
| `stress_tests/s04-endurance.mjs 15`, fifteen round trips and a restart | GPU objects, listeners and DOM nodes flat; the heap 17.8 → 19.3 MB, level by the last laps |
| The team's own tests: `test-title`, `test-controls`, `test-load-failure`, `test-level-caches`, `texture-leaks`, `test-offline`, `test-resilience` | All pass (52/52, 22/22, 6/6; revisits match; nothing from a planet alive back aboard; no request off the local server) |
| `tools/console-scan.mjs`, every route, Low, Medium and High | No errors or warnings |
| `tools/nan-scan.mjs`, every scene | No NaN or Inf pixels |
| `tools/live-frames-check.mjs`, 16 s after arriving in each level | No frame drawn off the live layer |
| `tools/test-frame-rates.mjs`, springs, damping and the jump at 30, 60 and 144 Hz | All agree; the jump peaks at 1.000 m at each |
| `tools/wall-sweep.mjs`, every reachable wall in all three levels | Never inside a collider; nothing within 8 cm of the eye |
| Room sweeps of the Wren (56 frames, Low and High, full and emergency power) against the build before D-40 | Inside the old build's own run-to-run noise, one local difference (D-40) |
| Screenshot matrix, four sizes × Low and High × 62 beats (496), looked at | Fixes in the QA log; 148 committed |

**Not verified here:** a real school Chromebook or Intel laptop, Safari, and a person playing it.

---

## 5 · Screenshots

`docs/screenshots/overhaul-final/`: every beat of the journey at 1920×1080 on Low and on High (62
each), and the layout shots (title, HUD, panels, MG1's plate, the summary) at 1280×720, 1440×900 and
2560×1080. Earlier milestones' sets are beside it (m0 to m4, release).

---

## 6 · Known issues

By number in docs/PROGRESS.md, "Open issues":
- **40 (P1, team).** `reference/bar.png` and its crops, a commercial game's promotional image, are in
  the public repository. Not in the build. The team should remove it, and decide with the advisor
  whether the published history needs the fresh-repository fix (docs/ASSETS.md).
- **49 (P2).** Texture memory over budget on Low in the Wren and Vessek (§3).
- **22 (P2).** Arriving at Kethra with a cold shader cache stalls one frame for seconds while the
  driver links its programs; this pass's extra programs add to it.
- **19 (P2).** Vessek's JavaScript heap grew with its code-built hulls (not re-measured this pass).
- **29 (P3).** The Hush view on High: 504k triangles against 500k.
- **38, 39 (P3).** The evidence board's own "connect two clues" action can never succeed (a
  conversation makes its only connection); three of the Wren's seven repairs have no effect.
- **48 (P3, deliberate).** The return trip from a planet keeps a loading screen (D-39).
- **63 (P3).** A machine the start-up benchmark steps down to Performance after the Wren was built
  for Balanced keeps Balanced's batching until its next visit aboard, as the team's lights and
  canvases already do.
- **64 (P3, team).** The Wren's music and hum start while it is built behind the intro and behind
  MG1's win, a few seconds before the player is aboard. Left as it is until someone listens.
- **12, 27, 30, 31, 32, 43, 46.** Smaller items, each with its plan in the table.

---

## 7 · What needs people, real hardware, or human-made assets

- **A person who has never played it, timed, start to finish.** Every result here comes from scripts.
  Where a first-time player hesitates is the one thing they cannot tell you (MG1's charter and MG2's
  descent most of all: issue 27).
- **A school Chromebook and an Intel UHD laptop**, with docs/TESTING_ON_A_REAL_CHROMEBOOK.md: the
  frame rate there, the cold-cache stall (issue 22), and whether the texture overage (issue 49)
  matters in practice. **Safari** on a Mac.
- **Team decisions:** MG1 and the "could this be 2D?" test (§8, question 1); the title's own
  palette and labels (D-37, question 15); the new canon text (D-26); the team number in the credits
  (`credits.original`, "team #____", D-29); issue 40; whether the Wren's music should wait for the
  player to arrive (issue 64).
- **Human-made assets** would help most in two places: Vessek's interiors, which read plainer than the
  Wren and Kethra, and sound, which is synthesised throughout.

---

## 8 · The brief's seventeen questions

| # | Question | Answer | Evidence |
|---|---|---|---|
| 1 | Does Mini-game 1 pass the "could this be 2D?" test? | **No** | The team's redesign (DESIGN §4, 2026-09-28 and 29) keeps the course on Kethra's plane so height is never the player's problem; concept 1A is the 3D way back |
| 2 | Do all three mini-games play like finished games, with start, win, fail, and restart states? | Yes | test-mg1-flow, test-mg2-flow and test-mg3-flow each play an in-world start, a fail with its retry, and the win |
| 3 | Do they differ in verb, camera, and pacing? | Yes | Plan on an orbiting chart; steer and light from a chase camera; sneak and time in first person (DESIGN §4, "The three side by side") |
| 4 | Does Level 2 add new mechanics, new zones, and a climax? | Yes | The ring bus, the ducts and the frost clock across four compartments, ending in the grow lights coming back (test-vessek-flow) |
| 5 | Is visual quality consistent, with no scene noticeably weaker than the rest? | Partially | The ranked art pass lifted the five weakest scenes (D-39) and the matrix's last finds are fixed; Vessek's rooms still read plainer than the Wren and Kethra [opinion] |
| 6 | Does motion follow the motion system, with clear hierarchy and nothing animated just for the sake of it? | Yes | One module and its tokens (src/motion); loops only on things to act on; reduced motion stills them; the integrators agree at 30, 60 and 144 Hz |
| 7 | Do the transitions and cinematics feel authored, and do they hide loading? | Partially | The forward journey has no loading screen after the first (the cruise, MG2's establishing shot and the docking hide each build); the trip back from a planet keeps one (issue 48) and a cold cache stalls at Kethra (issue 22) |
| 8 | Does every UI state feel designed and part of one visual language? | Partially | One plate kit for the HUD, panels, plates and the summary, checked at four sizes; the title has its own blue palette (D-37) |
| 9 | Does each environment have a focal point, depth, and something to discover? | Yes | The console, the Heart, the Lantern Bay; 18 survey finds (test-survey) |
| 10 | Do materials and lighting read as intentional and believable within the art direction? | Yes | Per-world grades and light owners (DESIGN §2); the art pass's material fixes (D-39) [opinion] |
| 11 | Does every VFX element communicate something? | Yes | Plumes and rings for thrust, sparks for a scrape, the gaze for the moth's sight, the wake for the Heart (DESIGN §4, §5) |
| 12 | Are there zero known clipping, z-fighting, overlap, or popping issues? | Yes, as far as checked | Wall sweep: nothing within 8 cm of the eye; no UI overlap at four sizes; the chamber's tree pop fixed (197a575), and the seams pass's look prompt over MG1's win and invisible step near Kethra's landing (72372c3, b7c0cea). The body touching thin wall fixtures (issue 46) is never seen |
| 13 | Does every element look finished, with nothing that reads as a placeholder? | Partially | The vents' outlines and the cloud's square edges are fixed; the evidence board's dead action and three repairs without an effect remain (issues 38, 39); the credits' team number is the team's to fill |
| 14 | Is the Low preset within budget, and does it still look like the same game? | Partially | Inside on draw calls and triangles in every scene, and on frame time once settled; over on texture memory in the Wren and Vessek (issue 49). The Low shots in overhaul-final are the same game |
| 15 | Does the game avoid every default in <art_direction>, or justify each one? | Partially | DESIGN §2's audit holds everywhere but the title, which uses tracked caps labels, an arrow on a button and its own palette by the team's choice (D-37, recorded in DESIGN) |
| 16 | Does the whole thing feel like one cohesive experience? | Partially | One continuous journey from the intro to the ending, which sums it up and offers every level again; the title stands apart in palette [opinion] |
| 17 | Would a talented game developer and motion designer be proud to put this in their portfolio? | Partially | The Wren, the cruise and the Hush, yes [opinion]; not before a person has played it, it has run on a school laptop, and the team has settled MG1 |
