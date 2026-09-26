# Audit

Where the game stands against the TSA rules and rating form, written after the session that added
level 3, the ending, the art-direction pass and the performance work. "Before" means the state
recorded in STATE_OF_PLAY.md and docs/STYLE_AUDIT.md at the start of that session. Every score is
[opinion]; every measured number cites its file. The working checklist is docs/PLAN.md.

## What exists

**Levels and story**
- **Title screen** with Continue, New game, Controls, Credits and Settings.
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
