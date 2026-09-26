# Audit

Two parts. **Part A** is the systems audit for the overhaul (docs/BRIEF.md), written 2026-09-26
from the code, a fresh baseline and three subsystem read-throughs. **Part B** is the TSA rubric
audit from 2026-09-25, unchanged. File references are `path:line` from the `overhaul` branch at
commit 9daf513.

---

# Part A · Systems audit for the overhaul (2026-09-26)

## Project facts, resolved

| Brief field | Answer |
|---|---|
| Engine / framework | three.js 0.185.1 (WebGL 2) + TypeScript 6.0, bundled by Vite 8.2. No game framework: a custom `Engine` (src/core/Engine.ts) with a `GameScene` interface. Tooling: Playwright 1.62, Node 24. |
| How to run it | `npm install`, then `npm run dev` (dev server) or `npm run build && npx vite preview` and open `http://localhost:4173/kethra-adventure/`. `npm run play` does both. `npm run smoke` boots every scene. |
| Target platform | Desktop browsers from a link (Chrome, Edge, Firefox, Safari 15+), including school Chromebooks. It is a TSA High School Video Game Design entry: rated E, no combat, at least three levels, RPG stats must be how puzzles are solved, no team names anywhere (STATE_OF_PLAY.md, "Hard constraints"). |
| Input | Keyboard and mouse (pointer lock), and the whole game plays keyboard-only (DECISIONS D-23). **No gamepad support exists** (src/core/InputManager.ts), so none is in scope. |
| Third-party assets | CC0: Quaternius kits, Poly Haven textures. **Not CC0:** the Wren's hull `freighter.glb` (CC BY 3.0), the planet and sun maps (CC BY 4.0), Rajdhani and Atkinson Hyperlegible (SIL OFL). The log is docs/ASSET_LICENSE_LOG.md, not CREDITS.md. The brief's "CC0 only" conflicts with this; see DESIGN.md, "Decisions for the checkpoint". |

## The current game mapped onto the brief's journey

| Brief's journey | What exists now | Gap |
|---|---|---|
| Opening | Title screen: DOM over a flat planet photo (src/ui/TitleScreen.ts) | Not 3D, not connected to what follows |
| Opening motion-design sequence | "Cold Start", a 24 s cinematic of the white sky hitting the Wren (src/galaxy/IntroScene.ts) | Built on the toy hull and a grey sky |
| *(not in the brief)* | Wake, five-step tutorial, sit at the console, the galaxy reveal (GalaxyRevealScene.ts) | Reveal is a poster-style orrery |
| Mini-game 1 | The course plot: three typed answers on a keypad in a DOM panel (src/ship/CoursePlot.ts) | A quiz, not a game (D-7) |
| Pre-travel cinematic | None | Missing |
| Planet travel | Map "Set course" → scan-line fade → loading bar → the level appears (GameFlow.ts:85-127) | Missing |
| Mini-game 2, Mini-game 3 | None. Kethra's Rite and Vessek's breakers are DOM panels over a paused frame | Missing |
| Level 2 | Two planet levels: Kethra (TSA level 2) and Vessek Anchorage (TSA level 3), both thin | See below |
| Designed ending and progression | "The ledger goes home" cinematic + credits (EndingScene.ts), then back to the ship | No summary, no replay path |

The TSA rules require three levels, so the game can't collapse to the brief's two. DESIGN.md §1
proposes the reconciliation: MG1 on the Wren; the cinematic and the cruise to Kethra; MG2 as
Kethra's arrival; MG3 as Kethra's climax; Vessek becomes the brief's expanded "Level 2", and
then the ending.

## Systems: keep, refactor or replace

| System | Where | Verdict | Why |
|---|---|---|---|
| Render loop, tiers, governor, start-up benchmark, prepare/prewarm, context-loss recovery, battery cap | core/Engine.ts | **Keep**, refactor the clock | Measured, careful work (GPU-string tier guess, warm-up frame behind covers, compileAsync behind the intro). Problem: `timer.update` runs while paused (Engine.ts:469), so `elapsed` jumps behind panels. The dt clamp at 0.1 s desyncs scene clocks from CSS/WAAPI/audio under 10 fps. |
| Post-processing | core/PostProcessing.ts | **Refactor** | One global grade shader tuned only against the ship interior (PostProcessing.ts:9-20). Its shadow toe (`c += 0.035` on near-black, line 70) lifts empty space to grey. MSAA and pixel-ratio fixes are correct and stay. Low has no glow at all (bloom off), which flattens a game whose thesis is light. |
| Scene lifecycle | `GameScene` in Engine.ts:50-68, `setScene`/`prepareScene` | **Keep** the interface, **refactor** disposal | GalaxyRevealScene.dispose frees nothing (GalaxyRevealScene.ts:526-531). Kethra's 1600 ms timer isn't cleared on dispose (KethraScene.ts:401). The Wren is rebuilt from scratch on every return (GameFlow.ts:145), about 93 programs and ~130 canvases each time. |
| Progression | core/GameFlow.ts (526 lines) + flags in core/GameState.ts | **Refactor** GameFlow, **keep** GameState/SaveSystem | Progression is an imperative async script with flag checks and no transition guard: `travelToPlanet` can run twice, `start()` twice (title double-click, TitleScreen.ts:49-70). The save model is sound: versioned, migrated, and safe when storage is blocked. |
| Level 1, the Wren | ship/ShipInteriorScene.ts + ship/interior/* (~16k lines) | **Keep** the room, **refactor** light and performance | The strongest scene: dense, composed, a clear focal point (baseline 07). But it's lit like a fully powered room while the story says emergency power. It's also the one scene over budget (next section). |
| The current mini-game | ship/CoursePlot.ts | **Replace** | A keypad quiz in a DOM panel; the chart "draws itself" only as pop-ins (CoursePlot.ts:300-340). DECISIONS D-7 already asks for a chart mechanic. |
| Repairs | ship/RepairUI.ts | **Keep** as a panel | A list of Repair buttons ("collect N of X", D-8). It's a hub function, not a mini-game. Repairing should visibly change the room. |
| Kethra (TSA level 2) | planets/kethra/* | **Refactor** | See "Gameplay root causes". It floats over a void under a flat-colour sky (KethraScene.ts:352, 415-424). Props are primitives. There is no chamber at the Heart (KethraScene.ts:724-786). |
| Vessek (TSA level 3) | planets/vessek/* | **Replace** the layout, **keep** the story and characters | One 16×24 m room (VessekScene.ts:38-45) with a DOM breaker panel. The pulse and the ledger reversal are worth keeping. |
| Input | core/InputManager.ts, content/controls.ts | **Keep** | One bindings table feeds the player, the Controls screen and the docs. Missing: hold detection (for hold-to-skip) and an input context for mini-games. |
| Player control | player/PlayerController.ts | **Keep** | Coyote time, jump buffer, landing dip, AABB colliders with step-up rules, and no per-frame allocations. Crouch snaps instantly (:273). Shake noise is re-rolled every frame, so its frequency follows the frame rate (:268). |
| Cinematic camera | player/CameraController.ts (`CinematicSequencer`) | **Replace** | It eases to a dead stop at every keyframe (:72-83), allocates a Vector3 per frame (:78), and its `skip()` is never used. IntroScene's arc-length Catmull-Rom path (IntroScene.ts:544-550) is the better model and becomes the shared camera path. |
| UI | ui/UIManager.ts, ui/PanelManager.ts, style.css | **Keep** the component set, **refactor** motion and defaults | Good bones: one palette, sentence case, a real type scale, keyboard focus. Problems: every panel has a backdrop blur (the brief's "glass everywhere"); tracked-caps micro-labels on the chart and eyebrows; panels have no exit animation and replay `panel-in` on every keypress (PanelManager.ts:72, and the setContent callers); chapter-card timers collide (UIManager.ts:265-275). |
| Asset loading | core/textureCache.ts, kit loaders, dynamic imports | **Keep**, extend | Chunks load behind covers with failure guards (GameFlow.ts:107-115). Missing: preloading the next scene during a cinematic. |
| Animation and tweening | everywhere | **Replace** with one motion module | 5 home-grown timeline systems, 3 `wait` helpers, 3 copies of easeInOutCubic, 8 CSS easings and 23 distinct durations (only 40 of ~84 CSS entries use the tokens), and 4 separate rAF loops on wall-clock time. No springs anywhere. |
| Transitions | UIManager.scan (the scan line) | **Keep** as the plain scene change | A good signature (it comes from the game's verb). But it's the *only* transition: travel, arrivals and returns are all the same 560 ms wipe. |
| Audio | audio/AudioSystem.ts | **Keep** | Synthesized in code, one key, three buses, generative beds per place. Cues are called directly from animation code, on a fourth clock (AudioContext). |
| Characters | characters/Figure.ts | **Keep** | Code-built figures with idle breathing, head tracking and a glow for mood. Idle only: no gestures, no locomotion. |
| Tools and tests | tools/ (~70 scripts) | **Keep** | The flow tests caught real regressions. Gaps: no debug harness (scene jump, auto-win/fail, time scale, frame step, overlay), and `window.__DEBUG__` is exposed in every build (boot.ts:128). |

## Root causes of the visual problems

Screenshots: docs/screenshots/baseline-1920x1080/ (numbered as below).

1. **Space is grey, not dark (05, 17, 29).** The global grade adds a constant lift to near-black
   pixels in linear HDR before tone mapping (PostProcessing.ts:69-70). Measured empty sky:
   RGB 20–35, against the Void's 7,8,10 (the letterbox bars in the same frames). Every space
   scene inherits a grade that was tuned for a lit room.
2. **The Wren looks like a toy (05, 17, 29).** The CC BY freighter ships as eleven flat colour
   slots with palette-atlas UVs, so it can't take texture maps (shipHull.ts:16-22). Re-assigning
   PBR values to its slots is the ceiling of what that asset can do.
3. **The starfield is uniform white dots (05, 17).** Equal-size, equal-colour points over a
   generated sky, all under the grey lift.
4. **The reveal is a poster (17).** Every planet is at one depth, the corona is a large soft
   orange blur, and there's no scale reference. The engines trail embers (GalaxyRevealScene.ts:498-502)
   although the intro establishes they're dead until repaired.
5. **Kethra reads as a kit scattered on slabs (19, 21).** Flat-colour sky, a void below the
   terraces, box/cylinder props, pillars that appear to float ~0.42 m (KethraScene.ts:569-573 vs
   895-900; verify), and a Heart built from an icosahedron cage. The Heart's waking snaps the
   canopy bright in one frame (KethraScene.ts:1044-1049).
6. **Vessek is a lit box (22-27).** One room, flat hemisphere-plus-point lighting, primitive
   fixtures, floating grow-light bars, and the interaction prompt over Varro's face (25).
7. **The Wren's light contradicts its story (07).** "Emergency reboot complete" over a fully lit
   room. Idle pulses everywhere (console glow, floor LEDs, status blinks; ShipInteriorScene.ts:211-224).
8. **Type isn't one voice.** In-world signage uses whatever the OS has: `Arial Narrow`, `Impact`,
   `Courier New`, `monospace` (airlockTextures.ts:481, displaysTextures.ts:77, ShipTextures.ts:90…).
   ChromeOS has neither Arial Narrow nor Impact, so a judge's Chromebook shows different lettering.
   Rajdhani, the UI's number face, has no tabular figures and proportional digits (checked with
   fontTools), so every counter set in it jitters as it counts.
9. **Generic UI defaults.** Backdrop blur on every panel, tracked caps micro-labels (13, 14),
   identical panel entry on every state change, no exit motion.

## Root causes of the gameplay problems

1. **Every puzzle is a DOM menu over a frozen frame.** Opening any panel pauses the engine
   (boot.ts:37-41), so nothing in 3D responds while the player solves the Rite, the breakers or
   the course plot.
2. **The course plot is a quiz** (D-7), and **the Rite can be brute-forced**: one fragment is
   enough to open it, progress is visible, and a wrong pick only resets (KethraMechanismPuzzle.ts:53-59,
   135-161). The breaker notes nearly state the answer (vessekLore.ts:40-45).
3. **Promised mechanics don't exist.** The Wickmoth is a light switch with no detection
   (grove.ts:205-226) though dialogue promises going quietly (kethraDialogue.ts:147, 327). Crouch
   is never read. No jump is ever required. Dace's duct is a toast (VessekScene.ts:854-866).
4. **Stats rarely decide the critical path.** Kethra's path needs no stat (only a perception
   hint). Vessek's stats add time or information, and the Varro deals differ only in flavour
   (vessekDialogue.ts:155, VessekScene.ts:908).
5. **Travel is a fade.** No departure, no landing, no docking (GameFlow.ts:85-127).
6. **Soft-lock, reproduced.** At Vessek, pressing Esc on Varro's closing line sets
   `vessek_varro_met` but skips the dialogue-close callback that starts the pulse; every later
   talk takes the post-pulse branch, so `vessek_pulse` is never set. Reproduced on 2026-09-26
   through real input (E, number keys, Esc) on the production build: after Esc and a second full
   conversation, the pulse flag was still unset. Only "Restart this level" recovers. A regression
   test lands with the fix (milestone M0). **This is in the TSA build on master too.**
7. **Interruptibility bugs** (motion audit): a double-click on New game starts the flow twice
   (TitleScreen.ts:49-70); the breaker board can call `onSolved` twice (BreakerPuzzle.ts:141-160);
   stale timers call `PanelManager.close()` on whatever panel is open (CoursePlot.ts:185,
   BreakerPuzzle.ts:157); a replaced panel's rAF loop is never cancelled (PanelManager.ts:45-55).
8. **Motion ignores reduced motion in the big moves.** The intro dolly, the reveal's flight and
   FOV zooms, the sit/stand glides and the Vessek white-sky shell all ignore the setting, which
   has two sources of truth (body class and `PlayerController.motion`).

## Performance, as measured

Baseline runs: `docs/perf/overhaul-baseline/{low-cpu6,high-cpu1}/results.json` (1366×768, DPR 1,
this PC's RTX 4060; CPU throttled 6× for the Low run). Full table in docs/PROGRESS.md.

- **The Wren is the only scene over budget:** 30.3 fps, p95 49.9 ms, 614 draw calls at Low/6×
  CPU. Everything else holds 59–60 fps there.
- **Where the Wren's draw calls come from** (render audit, estimates from the code): the console
  module ~280–300, because the desk, journal terminal and repair station are excluded from
  merging wholesale for being interactive (console.ts:464, 1377, 1464-1465); props ~120–170;
  starfield window ~65; walls ~55; lighting ~50 (16 sprites, 9 double-sided transparent glows
  drawn twice); suspended display ~50. **An atlas isn't the first lever:** proxy colliders for the
  interactive furniture, instanced status LEDs, expanding instanced props into merges and sharing
  identical decal materials are estimated to cut ~300–400 calls with no visual change.
- **Bugs found on the way:** the two alarm-beacon sweeps are merged by `batchStaticGeometry` and
  frozen (lighting.ts:530-541); the Low-tier canvas downscale only touches ~3 canvases because the
  cap is 1024 (disposeSceneTextures.ts:60); floor textures are uploaded twice (floorTextures.ts:21-47).
- **Kethra at High draws 1.24 M triangles** in 611 calls (shadows and GTAO both redraw the scene).
  Fine on a discrete GPU, a risk on integrated graphics at Medium.
- **First load:** intro playable 16.3–16.6 s from a cold browser on this PC; level loads are one
  4–5.6 s long task each, behind the cover.

---

# Part B · TSA rubric audit (2026-09-25)

Where the game stands against the TSA rules and rating form, written after the session that added
level 3, the ending, the art-direction pass and the performance work. "Before" means the state
recorded in STATE_OF_PLAY.md and docs/STYLE_AUDIT.md at the start of that session. Every score is
[opinion]; every measured number cites its file. The working checklist is docs/PLAN.md.

## What exists

**Levels and story**
- **Title screen** with Continue, New game, Controls and Settings (credits roll at the ending).
- **Intro** ("Cold Start", 24 s, skippable): the white sky hits the Wren.
- **Level 1, the Wren:** a five-step tutorial, the galaxy reveal, the course plot, and the ship
  as a hub (travel logs, repairs, the navigation map).
- **Level 2, Kethra:** the Aiveth (Warden Corvenna, Fen), three inscriptions, the Wickmoth, and the
  Rite of Three Breaths at the Cistern Heart.
- **Level 3, Vessek Anchorage:** Dace and Harbormaster Varro, the rehearsal pulse, the breaker
  puzzle with a frost clock, the ledger (the story's reversal), and the conduit alloy.
- **Ending, "The ledger goes home":** repair comms, transmit, a closing cinematic, then credits.
  Levels 4 and 5 (Orrun's Reach, Isilthe) are planned in LORE.md and not built.

**Systems (all in `src/`)**
- **RPG:** six stats that grow with use, XP and levels, skill points spent on the character sheet,
  stat-gated dialogue, and stat-gated world interactions (`GameState.ts`, `CharacterPanel.ts`,
  `DialogueSystem.ts`).
- **Characters:** a procedural figure builder with idle breathing and head-tracking; the Aiveth's
  glow shows their mood (`characters/Figure.ts`).
- **Puzzles:**
  - The Rite: a colour sequence with a glyph for each colour, so it works without colour vision
    (`KethraMechanismPuzzle.ts`).
  - The breaker bus: capacity plus dependency order (`vessek/BreakerPuzzle.ts`).
  - The course plot (`ship/CoursePlot.ts`).
- **UI:** one component set (`style.css`, `ui/UIManager.ts`); pause menu, settings, controls from
  one bindings table (`content/controls.ts`); the scan-line transition; chapter cards; a document
  reader.
- **Audio:** everything synthesized in code, in one musical key. There are three volume buses and
  generative music for each place (`audio/AudioSystem.ts`).
- **Engine:** quality tiers with a frame-time governor, shader pre-warming, a point-light budget,
  context-loss recovery, a battery cap, and a clear message where WebGL 2 is unavailable
  (`core/Engine.ts`, `main.ts`).
- **Saving:** automatic, versioned, and it plays without saving where storage is blocked
  (`SaveSystem.ts`, `GameState.ts` migrateSave).

**Tools (`tools/`)**
- **Flow tests:** `test-tutorial-flow.mjs` (36 checks), `test-kethra-flow.mjs` (18) and
  `test-vessek-flow.mjs` (29). Together they play every level through real controls.
- **`npm run smoke`:** 6 boot cases.
- **`test-resilience.mjs`:** no WebGL, context loss, storage blocked, hidden tab.
- **`browser-matrix.mjs`:** Chromium, Edge, Firefox and WebKit.
- **`perf-run.mjs`:** a throttled "weak laptop" profile.
- **Capture tools** for the before/after screenshots.

## Rubric, line by line

| Line | Before [opinion] | Now [opinion] | Why |
|---|---|---|---|
| Creativity & Artisanship (×2) | 6 | 8 | See below. |
| Technical Skill (×2) | 7 | 8 | See below. |
| Storyline & Flow (×1) | 6 | 8 | See below. |
| Overall Appeal (×2) | 5 | 8 | See below. |
| Game Directions & Controls (×1) | 6 | 9 | See below. |
| Bonus (10 pts) | partial | strong candidate | See "Bonus: what's unusual" below. |

**Creativity & Artisanship.**
- The Aiveth were capsules, the Heart an octahedron, and the grove off-palette (STYLE_AUDIT.md).
  Now they are designed figures and set pieces in one palette, with one UI language and a type
  logo.
- Not 9–10 yet: the Wren's hull in the intro and ending is still a recoloured toy-palette model,
  and Kethra's ground is still the photo-scanned texture (D-9).

**Technical Skill.**
- Data-driven levels (dialogue trees, puzzle rules and lore as data), and measured performance
  work with before/after numbers (docs/perf/).
- Automated flow tests for every level.
- The Wren's draw-call count is still over budget (see risks).

**Storyline & Flow.**
- The arc now has a middle and an end: the reversal (the Hearts are relays) lands in level 3, and
  the ending pays off the through-line.
- Chapter cards give each level context on arrival and completion.
- The story stops at "part one"; the Choir itself is never visited.

**Overall Appeal.**
- Added a pause menu, restart, volume, reduced motion, text size and keyboard-only play.
- Failures are kind and instant to retry (the frost clock).
- Toasts moved off the centre of the view.

**Game Directions & Controls.**
- The controls screen, docs/CONTROLS_AND_HOW_TO_PLAY.md and the code's bindings all come from
  `content/controls.ts`, so they cannot disagree.

## Bonus: what's unusual
1. **Characters who speak in light.** The Aiveth's bioluminescent veins are their "glow-speech"
   (LORE.md). The Warden's light starts drawn in and opens as she comes to trust you, so the
   player reads a relationship change without a line of text.
2. **A puzzle whose kind answer costs you something.** The Anchorage bus can carry 6 units. To
   save the hydroponics bay, the player has to switch off the dock lights and the harbormaster's
   own hall lamps. It is an engineering puzzle (capacity, dependency order) that teaches a
   community choice.
3. **Stats change what you can see, not whether you can win.**
   - Engineering 2 reads the load stamped on each breaker; without it, you learn a load by trying.
   - Perception 2 notices the circuits that switched themselves back on.
   - Archaeology 2 reads the ring plate that confirms the reversal.
   - Every puzzle stays solvable at level-1 stats, so the RPG layer rewards attention rather than
     grinding.
4. **Science by use.** The Ship's Library adds real entries (navigation maths, Doppler,
   spectroscopy, bioluminescence) at the moment the player has just used the idea. Nothing is
   quizzed, except the course plot (see risk 5).

## Top risks against the non-negotiables

1. **Real Safari and real Chromebooks are untested.**
   - The four-browser matrix (tools/browser-matrix.mjs) reached every level with zero console
     errors in Chromium 151, Edge 153, Firefox 153 and WebKit 26.5. That result was reported
     during the session; `docs/perf/browser-matrix.json` currently holds only the later
     WebKit-only rerun.
   - WebKit here is the Windows test build, not Safari on a Mac. In that build, after starting
     from the title screen (which switches audio on), the 3D view stops appearing on screen, even
     though WebGL is still drawing. The pre-session build does the same, so it is not new, and it
     may be specific to that build.
   - **Must be checked on a real Mac before submission.**
2. **The Wren is heavy for weak CPUs.**
   - With the CPU throttled 6× at the Performance tier, the ship interior runs at 23.3 fps with
     643 draw calls per frame. Kethra runs at 47.6 fps and the Anchorage at 50.3 fps
     (docs/perf/final/low-tier/results.json).
   - The fix is a texture atlas for the room's ~350 generated prop materials (PERF_LOG).
3. **First load on a fresh browser is slow.**
   - Throttled, New game to a playable intro took 21.8 s, against 65.0 s before the light budget
     (docs/perf/final/low-tier and docs/perf/baseline/low-tier, `introFromNewGameMs`). Most of it is shader
     compilation.
   - On a real Chromebook it will be longer [unsourced — estimate].
4. **Names in the submission (D-12).** The repository sits under a personal GitHub account, and
   commit history carries an author name. The game's own screens show only "Team #____". This is
   a team action.
5. **The course plot reads as a quiz (D-7).** Three typed arithmetic answers on a keypad. The rules
   don't count quizzes as educational value; the chart-based replacement is designed but needs the
   team's approval.
6. **The game's title (D-17).** The tab and title screen say "Kethra". The team should confirm it.
7. **Scope.** Three levels plus an ending meet the minimum. Levels 4–5 exist only in LORE.md and
   DESIGN.md.
8. **Run length.** No timed human playthrough has been recorded yet. The scripted flow tests
   teleport between sites, so they understate real play time. A first-time judge will take longer
   than three minutes [unsourced — estimate: intro 24 s plus three levels of reading, dialogue and
   puzzles], but it should be timed by hand and recorded in PLAYTEST_REPORT.md.

## Plan
docs/PLAN.md holds the checklist in priority order (non-negotiables, double-weight rows, flow,
directions, bonus, documents).
