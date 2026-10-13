# Report · the finishing pass (2026-10-13)

What was asked: finish the game in one pass. Analyse it first, keep its feel, end with exactly
three fully playable levels that reward exploration, and deliver runnable code with no gaps. The
request was a general template with its project details left blank, so this report starts by
saying what the project actually is, because that changed what "finish" meant.

**The short version.** The game was not half-built. It already had three levels, three mini-games
and an ending, and a test suite that plays them. What was unfinished is written in its own log
(docs/PROGRESS.md): one milestone's verification, and the last three milestones never started.
Running the game also turned up bugs the tests had been walking around. This pass fixed those,
added things to find on every level, built the ending's missing summary and a chapter select, and
verified the result. One planned piece, a live 3D title screen, was not built; the reason is in §7.

Scores and judgements here are [opinion] unless a figure names its source.

---

## 1 · Game analysis

**Architecture.** three.js r185, TypeScript, built with Vite into a static site (the pasted brief
guessed Godot; the code is the source of truth). `src/boot.ts` creates the `Engine`, the UI layer
and one `GameFlow`, a state machine over `boot → intro → wren → reveal → kethra | vessek → ending`
that owns every scene change. Each scene implements `init / update / dispose`. `GameState` is the
save record (flags, six stats, ship systems, journal), written to `localStorage` by `SaveSystem`.
Player-facing text is in `src/content/strings.ts`, tuning in `src/content/tuning.ts`. `tools/`
holds about eighty Playwright tests and capture scripts.

**Core loop.** First person, no combat. Look around a place, read what is there, talk to whoever
lives there, and let what you learned (and the stats it raised) open a set-piece puzzle. Solving
it yields the part the ship needs; repairing the ship extends the chart to the next world.

**The three levels, as found.**

| Level | Place | Its mini-game or mechanic | State as found |
|---|---|---|---|
| 1 | The Wren (ship interior) | Tutorial, the reveal, MG1 Intercept, First light | Complete on its path; nothing optional paid anything |
| 2 | Kethra (terraced grove) | MG2 Canopy descent, MG3 Hush and the Rite | Complete, with two bugs on the player's path (below) |
| 3 | Vessek Anchorage (four compartments, ducts) | The ring bus, the frost clock | Complete, with one conversation unreachable |

**Mechanics inventory.**

| System | State | Note |
|---|---|---|
| Movement, crouch, ladders, coyote time, jump buffer | Complete | `PlayerController`, `tuning.ts` |
| Interaction (crosshair ray, proximity fallback) | Complete | |
| Dialogue with stat gates | Partial → fixed | The opening line's `onEnter` never ran |
| Stats, XP, levels, skill points | Partial → improved | Nothing raised perception; persuasion rose only at the end |
| MG1 Intercept, First light, the cruise | Complete | The Anchorage trip announced Kethra's day count (fixed) |
| MG2 Canopy | Complete | |
| Kethra: inscriptions and the Rite | Broken → fixed | Reading an inscription never showed its text |
| Kethra: arrival | Broken → fixed | Walking straight ahead fell into the pool |
| MG3 Hush | Complete | Its test raced the moth's flight (test fixed) |
| Vessek: bus, ducts, pulse, ledger | Complete | |
| Journal and evidence board | Partial | One corrupted log is now restorable. The board's only connection is made automatically, so its own "connect" action can never succeed (open) |
| Ship repairs | Partial | Scanner and comms matter. Navigation, shields and power distribution change nothing; the hyperdrive needs a part from a level not built (open, by plan) |
| Saving, settings, pause, restart level | Complete | |
| Title screen | Complete as DOM | The live 3D title was planned and is still not built |
| Ending | Partial → finished | Summary and chapter select were planned and missing |
| Debug harness | Complete | One stale jump entry (fixed) |

**Where development stopped.** docs/PROGRESS.md, milestones: M0–M4 done; **M5 (Vessek) built with
four verification items open**; **M6 (opening, menus, ending), M7 (whole-game pass) and M8 (this
report) not started**. LORE.md also names three threads as planned and unbuilt: Carrow's notes
"taped inside panels", "a secret ledge above the west terrace" (built since), and Oshel, who is
"never seen on screen in level 2".

**Style fingerprint, which the new code follows.** Scene builders as private `buildX()` methods;
data in its own file beside the scene (`kethraLore.ts`, `vessekMapData.ts`); comments that say why
and cite a measurement, never what; one module per concern; sentence-case UI text; amber for "you
can act on this", sea-green for "something was learned"; emissive only on things that matter;
every duration from `src/motion`'s tokens; fail states that cost seconds, never progress.

---

## 2 · Design

**Keep the three levels; give each a reason to leave the path, and make the reason matter.** The
finds are the game's **survey** (the word its chart already used). Each is one entry of data in
`src/content/discoveries.ts` and one placement in its level.

The reward is the design. Several stat-gated routes could not be reached in a normal run: nothing
raised perception anywhere, and persuasion rose only when the Anchorage was already over. So each
find pays the stat the *next* level checks.

| | The Wren | Kethra | Vessek Anchorage |
|---|---|---|---|
| Angle | A room read closely: who was aboard | Height and water: a descent, terraces, a jump | Two levels joined by ducts, under a clock |
| Asks of the player | Notice, and follow a lead | Cross, hide, read | Combine everything at once |
| New finds | Carrow's note, her key, her locker; Mbeki's letter; the dead relay | The stepping stones to Oshel's grove; the Wickmoth's empty perch | The scope; Dace's chalk sky; the seed book |
| Optional challenge | The note → key → locker chain | The stone crossing (fall and you wade back to the terrace) | The chalk sky: fans off, then a crawl down a one-way duct |
| Seen before reached | The locked locker | The old tree on its islet; the perch while the moth holds it | The chalk, behind a running fan |
| Pays | Perception, persuasion, insight | Persuasion, perception | Insight, perception, engineering |
| Which opens | The Warden's trust; a brighter gaze in the Hush | Varro's message deal; reset warnings on the bus | (the ending's summary) |
| Survey total | 4 | 8 | 6 |

Eight of the eighteen are finds the levels already had (Kethra's inscriptions, shrine, valve and
last carving; the Anchorage's ring plate, bent grate and Dace's question); they now count toward
the same total.

**The ending** gains what docs/DESIGN.md §6 planned: a summary that counts up, and a chapter
select so any level can be started directly.

**Not changed, on purpose:** the three mini-games, the art direction, the story's beats, the
quality tiers. Nothing was downloaded; every new object is built or drawn in code.

---

## 3 · What changed, file by file

Everything is on disk in the repository; nothing is reprinted here. New files are whole; changed
files are listed with what changed in them.

**New**

| File | What it is |
|---|---|
| `src/content/discoveries.ts` | The survey as data: every find, its text, its reward |
| `src/journal/Survey.ts` | Counting, and the one way a find is recorded |
| `src/ship/interior/finds.ts` | The Wren's finds, hung on its existing furniture |
| `src/core/chapters.ts` | Chapter list, per-chapter snapshots, the stand-in start states |
| `src/ui/ChapterSelect.ts` | The chapter list panel |
| `src/ui/JourneySummary.ts` | The ending's summary |
| `tools/test-survey.mjs` | Every find obtained, including the stone crossing with real jumps |
| `tools/test-ending.mjs` | The summary, the chapter list, the pause menu's survey line |

**Changed**

| File | Change |
|---|---|
| `src/dialogue/DialogueSystem.ts` | A conversation's first line runs its `onEnter` like any other |
| `src/planets/kethra/KethraScene.ts` | The span from the landing; inscriptions, shrine and carving open as text; the Warden remembers you; objectives; stepping-stone floors, Oshel's grove, the perch; a nearer respawn at the stones |
| `src/planets/kethra/dressing.ts` | Stepping stones, merged into the existing ruins mesh |
| `src/planets/kethra/hush/HushGame.ts` | Restores the objective on leaving; records whether the moth ever caught you |
| `src/planets/vessek/VessekScene.ts` | The scope, the chalk sky, the seed book |
| `src/core/GameFlow.ts`, `src/galaxy/planetData.ts` | Trips fly the chart's own figures; a direct boot into a level; chapter snapshots |
| `src/boot.ts` | `?chapter=`; the pause menu's survey line |
| `src/galaxy/EndingScene.ts`, `src/ui/TitleScreen.ts`, `src/ui/PauseMenu.ts` | Summary and Chapters; Chapters; the survey line |
| `src/galaxy/IntroScene.ts` | Respects reduced motion |
| `src/core/InputManager.ts` | A refused mouse capture no longer goes unhandled |
| `src/core/GameState.ts`, `src/journal/JournalSystem.ts` | A clue connection is recorded once; a corrupted log can be restored |
| `src/content/strings.ts`, `src/style.css` | New strings; summary and chapter styles; the chart's list is headed "Sites" |
| `src/debug/DebugHarness.ts` | The stale jump entry |
| Map data for Kethra and Vessek | The new places |
| `tools/collision-check.mjs`, `test-kethra-flow.mjs`, `test-mg3-flow.mjs`, `run-journey.mjs`, `gen-controls-doc.mjs` | Brought up to date (§5) |
| Documents | DECISIONS (D-26, D-27), PROGRESS, AI_AND_ASSET_LOG, CHANGELOG_FOR_TEAM, CONTROLS_AND_HOW_TO_PLAY, and four team documents that still described deleted features |

---

## 4 · How to run it

```
npm install
npm run play          # builds, then opens the production version
```
`npm run dev` for live reload. Requires Node and a browser with WebGL 2.

**Controls** (the in-game Controls screen and docs/CONTROLS_AND_HOW_TO_PLAY.md print the same
table): mouse to look, W A S D to move, Shift to sprint, Space to jump, C or Ctrl to crouch, E to
interact, Tab for the character sheet, O for settings, Esc to pause. On Kethra, F or the right
mouse button hoods the lantern. Everything works from the keyboard alone.

**Chapters** on the title screen starts at any of the three levels.

**Debug** (`?debug=1`): F1 jumps to any state, F2 and F3 win and fail the current mini-game, F4
cycles the time scale, F7 freezes, F8 steps a frame, and an overlay shows frame time, draw calls,
triangles and memory. `?tier=low|medium|high` pins the quality tier; `?seed=N` fixes every random
stream.

**Checks**
```
npm run build
npx vite preview --port 4180 --strictPort     # keep running
npm run journey                               # every flow test, in the order a player meets them
node stress_tests/run.mjs                     # the stress scenarios
```

---

## 5 · Verification

Everything below ran against the final production build (`npm run build`, served by
`vite preview`) on this PC, in a headless Chromium using its real GPU.

| Check | Result |
|---|---|
| Type-check and build | Clean |
| `tools/run-journey.mjs`, sixteen tests from the opening to the ending | 16 of 16 |
| `tools/test-survey.mjs` (new), every find on all three levels | The Wren 20/20, Kethra 23/23, Vessek 14/14 |
| `tools/test-ending.mjs` (new), the summary and chapters | 24/24 |
| `tools/test-mg3-flow.mjs`, five runs in a row | 5 of 5 (it passed 3 of 5 and 4 of 5 the day before; see below) |
| `tools/collision-check.mjs`, reachability by walking | The Wren: all 1,757 open cells and 9 of 9 targets. Kethra: 10 targets on foot, the eleventh by jumping |
| `tools/smoke.mjs` | 6 of 6 |
| `stress_tests/run.mjs`, thirteen scenarios | 12 of 13 on the full run; the thirteenth passes after its scenario was corrected (below) |

**What "obtainable" means here.** `test-survey` stands where a player would stand, looks at each
find and presses E. Whether a player can walk to that spot is the reachability check's job. The two
finds that need more than walking are done with real key presses: Kethra's stepping stones are
crossed with walking jumps, stone by stone, and Dace's duct is crawled from the school, up its
ladder, to the chalk.

**Three tests were wrong, not the game, and one of those was my doing.**
- The chamber test failed about one run in three. It pressed the next breath the instant the last
  one counted, while the moth was still flying to its next perch, and the game deliberately ignores
  a breath then (its hint says "Let it settle first"). It now waits, as a player is told to.
- The Kethra flow test read three inscriptions back to back. Each read now opens a document, which
  it has to close.
- A stress scenario compared a click and a double-click on the Warden's first line. Because she now
  remembers you, its second conversation opened somewhere else. The protection it tests was intact;
  the scenario now starts both conversations from the same line.

**Looked at, not only tested:** each new find from where a player stands (1366×768, High); the
docking approach to the Anchorage at five moments on Low and High; the title, the chapter list, the
pause menu and the ending at 1366×768 and 1280×720. Four things were changed because of what the
captures showed: the bench note sat in a lamp's hot spot; Mbeki's letter wore Carrow's tape; the
seed book read as a wall switch; the credits' buttons fell below a 720-pixel window.

**Not verified:** a real Chromebook, Safari, a human playing it, and the brief's full matrix of
four window sizes on two presets.

---

## 6 · Performance

`tools/measure-scene.mjs`, 1366×768, production builds, one run each; Low is the Performance tier
with the CPU throttled 6×. "Before" is the previous commit (0e1a526). Bold is over budget.

| Scene | Preset | Draw calls, before → after | Triangles | Budget (calls / triangles) |
|---|---|---|---|---|
| The Wren | Low | 269 → **271** | 148k | 150 / 150k |
| The Wren | High | 546 → **550** | 296k | 350 / 300k |
| Kethra | Low | 229 → **231** | **362k** | 160 / 320k |
| Kethra | High | 467 → **471** | 843k | 450 / 900k |
| Kethra, in the chamber | Low | 141 → **138** | **359k** | 120 / 200k |
| Kethra, in the chamber | High | 302 → **302** | **872k** | 300 / 500k |
| Vessek | Low | 218 → **221** | 187k | 180 / 200k |
| Vessek | High | 444 → **450** | 373k | 400 / 400k |

- **This pass cost two to six draw calls a scene** and about a thousand triangles. The stepping
  stones cost none: they are merged into a mesh that was already there.
- **Every one of these scenes was over its draw-call budget before this pass and still is.** That
  was not made better here. Kethra is the furthest over; docs/PROGRESS.md (issues 7, 28, 29, 33)
  has the breakdown and the plan.
- The chamber's count moves by a few with where the moth's gaze is in its sweep, which is the whole
  of that 141 → 138.
- Frame times are not compared: on this machine single throttled runs differ more from each other
  than the two builds do (PROGRESS issue 16). Whether Low holds 30 fps on the reference laptop can
  only be answered on one.
- Vessek's own row was one of M5's open items and is now taken.

---

## 7 · Changelog

**Fixed**
- Walking straight ahead from Kethra's landing fell into the pool, every time.
- Kethra's inscriptions, shrine record and last carving never showed their text where they are read.
- Dace's "what do other stars look like" conversation could not be reached; the Warden greeted you
  as a stranger on every visit. One cause: a conversation's first line skipped its `onEnter`.
- The trip to the Anchorage was announced as six days, the figure plotted for Kethra. It now flies
  the chart's figure, eleven, which is also the "eleven days" the Anchorage's ledger records.
- The intro's camera move and white-sky swell ignored the reduced-motion setting (issue 10).
- Opening and closing panels quickly raised an unhandled error from the browser's mouse capture.
- Kethra's objective was wrong on a return visit, and was not restored on leaving the chamber.
- A clue connection could be recorded twice; clue summaries were cut mid-word.
- The debug menu listed a jump to a puzzle that was deleted.
- Two tests: the chamber test raced the moth's flight (issue 35); the reachability checker could
  not travel to Kethra (issue 34).

**Finished** (started or planned before this pass)
- M5's verification: the twenty-hull Anchorage looked at, Vessek's own performance row, the journey.
- The ending's summary and the chapter select (DESIGN §6; closes decision D-6).
- Carrow's notes aboard the Wren, and one corrupted log restored (both named in LORE.md and the journal).
- The team's documents no longer describe the breaker panel or the keypad plot (issue 32).

**Added**
- The survey: ten new finds across the three levels, with rewards that open later routes.
- Stepping stones on Kethra, and a nearer place to wade back to when you miss one.

**Cut, and why**
- **The live 3D title** (DESIGN §1: the title's camera is the intro's first shot). Building it means
  rebuilding the boot sequence, which is the game's most timing-sensitive code, has the thinnest
  test coverage, and is where first-load time on a slow machine is decided. It deserves its own
  session with a cold-cache run on real hardware, not the tail of this one. The title still works
  and now offers Chapters.
- **A third new find on Kethra** (the niches the traders emptied). Kethra already had six optional
  finds and is over its draw-call budget; two good ones were better than three.
- **The full screenshot matrix** of the overhaul brief (four sizes × two tiers × every beat). The
  changed screens were captured and looked at; the matrix was not run.

---

## 8 · Assumptions

1. **The code, not the brief.** The request named no engine and left its project fields blank. The
   project is three.js, already has three levels, and has its own brief, design and lore; those
   were followed.
2. **"Exactly three levels" was already true**, so no level was added or removed. The work went
   into finishing and into exploration.
3. **"Deliver complete files, not fragments"** was read as: every file is complete on disk and the
   game builds and runs. Printing 42,000 lines into a chat would have helped nobody.
4. **No combat was added**, though the brief suggests it for one level. This game's rules (TSA
   theme, rated E, LORE.md) forbid it; pressure comes from the Wickmoth's gaze and the frost clock.
5. **New story text is canon the team has not approved yet.** Each line was written from an
   existing line of LORE.md and is listed in DECISIONS D-26 for the team to accept or change. The
   deliberately open questions in LORE.md were left open.
6. **Chapters are open from the first launch**, so a judge can reach level 3 directly. D-27 says
   how to gate them instead.
7. **Commits were made locally** on `overhaul` at each milestone, as docs/BRIEF.md's workflow asks.
   Nothing was pushed.

---

## 9 · Known issues

Open, in docs/PROGRESS.md by number:
- **36 (new).** Kethra on Medium and High logs about two hundred WebGL warnings on arrival: a
  shadow sampler is bound before its map has been drawn. It is there on the previous commit in the
  same numbers, so it is not from this pass, and nothing on screen was traced to it. It may be part
  of why arriving on Kethra with a cold shader cache stalls (issue 22).
- **37 (new).** The live 3D title is not built (§7).
- **38 (new).** The evidence board's only connection is made for the player by a conversation, so
  the board's own "connect two clues" action can never succeed.
- **39 (new).** Three of the Wren's seven systems can be repaired to no effect.
- **7, 28, 29, 33.** Draw-call and triangle budgets (§6).
- **22.** A stall of several seconds arriving on Kethra with a cold shader cache.
- **25.** The arrival card repeats the planet's name the cruise's title just gave.
- **32, partly.** docs/STORYBOARD_CHECK.md still predates MG2, MG3, First light and the cruise in
  places; the statements the code contradicts were corrected.

## 10 · What needs people, or real hardware

- **The canon in DECISIONS D-26.** Every new line of story is the team's to accept or change.
- **Whether chapters should be open from the start** (D-27).
- **The two decisions still open from D-25:** three CC BY models against the brief's CC0-only rule,
  and Kethra's budgets.
- **The team number** in the credits (`credits.original` still reads "team #____").
- **A Chromebook and a Mac**, and **someone who has never played it**.

---

## 11 · Next steps, in order of value

1. **A person plays it start to finish, timed** (BACKLOG B-30). Every result here comes from scripts.
   Where a first-time player hesitates is the one thing they cannot tell you.
2. **Real hardware:** a school Chromebook and a Mac with Safari (B-29), using
   docs/TESTING_ON_A_REAL_CHROMEBOOK.md. The budgets in §6 are counters, not frame rates.
3. **The live title** (§7). Start by building the intro scene behind the DOM title and holding its
   first frame; then prepare the ship while the title is up, and measure a cold cache before
   deciding whether the loading screen can go.
4. **Kethra's budget.** It is over on draw calls at High and on triangles at Low. The understory
   trees are the first thing to thin (D-25); merging the terraces' per-terrace materials is the
   largest saving that changes nothing visible.
5. **Give the remaining repairs a consequence**, or remove them: three of the Wren's seven systems
   can be repaired to no effect.

---

## 12 · The overhaul brief's seventeen questions

docs/BRIEF.md closes with seventeen questions. This pass did not re-judge the whole game, so only
the ones it changed or measured are answered; the rest are left for the whole-game art pass (M7),
not guessed at.

| # | Question | Answer | Evidence |
|---|---|---|---|
| 2 | Do the three mini-games have start, win, fail and restart states? | Yes | Their three flow tests pass, each with a fail and a recovery (§5) |
| 4 | Does Level 2 add new mechanics, new zones and a climax? | Yes | The bus and the ducts, four compartments, the frost clock; `test-vessek-flow` plays all of it |
| 9 | Does each environment have a focal point, depth, and something to discover? | Yes for discovery; the rest not re-judged | Eighteen finds across three levels (§2) |
| 12 | Zero known clipping, z-fighting, overlap or popping? | Not assessed | The new span on Kethra was sunk 2 mm so it shares no plane with its neighbours; nothing else was surveyed |
| 14 | Is the Low preset within budget? | No | §6: over on draw calls in every scene measured |
| 16 | Does it feel like one cohesive experience? | Partly | The ending now sums up the whole journey and offers every level again; the title is still the older DOM screen |
| 1, 3, 5–8, 10, 11, 13, 15, 17 | | Not assessed in this pass | |
