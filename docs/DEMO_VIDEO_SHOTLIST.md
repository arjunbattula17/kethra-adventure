# Demo video shot list (target 4:20, limit 4:30)

It covers the three things the rules ask for: the tutorial, one full level of play, and a
walkthrough of the code, scripts, files and engine. The recommended level is **Vessek Anchorage**:
it has a set piece, a stat-gated conversation, a puzzle with a visible failure and retry, and the
story's reversal, all in about a minute and a half of edited play.

**Recording tips**
- Capture at 1920×1080 at the Quality setting, with sound on.
- Use a save made at the Wren just before level 3: play to that point once, then use Continue.
- Turn on a larger text size if on-screen text will be hard to read in the video.
- Narrate in your own words; the notes are prompts, not a script.

| Time | Shot | On screen | Say (prompt) |
|---|---|---|---|
| 0:00–0:12 | Title | The KETHRA logo with the scan line; hover over the buttons | Name, team number, theme: a deep-space RPG where you progress by puzzles, not combat. |
| 0:12–0:32 | Intro | The white sky hits the Wren (skip once the goal line appears) | The disaster, shown instead of explained. |
| 0:32–1:05 | Tutorial | Step 1 (look, including arrow keys), step 2 (move and jump), step 3 (Tab sheet), step 5 (E at the console, the sit-down) | It teaches by doing, one step at a time, and never more than two sentences on screen. |
| 1:05–1:15 | Reveal and map | Galaxy reveal (brief); the navigation map with Vessek preselected; Set course | The ship's scanner line is the transition. |
| 1:15–1:25 | Arrival | The level 3 card; the collar; Dace says hello | Every level opens with context. |
| 1:25–1:45 | Varro | Dialogue with the locked stat options visible; choose an option with a number key | Stats open better offers, but you never need them to finish. |
| 1:45–2:05 | The pulse | The white flash, lights dying deck by deck, emergency strips, the frost meter | One of only two camera shakes in the game (the other is the Heart waking). |
| 2:05–2:40 | Breakers | Turn on pumps and heaters, then overload; read the message; then the solution (switch off the dock lights and hall lamps, then pumps → heaters → scrubbers) | The kind answer costs the harbormaster her own lights. The failure says exactly why. |
| 2:40–2:55 | Ledger | Lights return; the ledger document; Varro's reversal line | Fixing Kethra made the signal louder: the story's twist. |
| 2:55–3:05 | Ending (tease) | Transmit; the first ring of amber light leaving the Wren | Keep it short; don't spoil the credits. |
| 3:05–3:20 | Code: data | `src/planets/vessek/vessekDialogue.ts` (`varroDialogue`, the `requires: { attribute, min }` options) and `src/content/controls.ts` | Levels are data. The controls table feeds the player code, the Controls screen and our how-to-play doc. |
| 3:20–3:35 | Code: puzzle | `src/planets/vessek/BreakerPuzzle.ts`, `toggle()`: the dependency check, the capacity check, the trip | This is the puzzle's rules in about 40 lines. |
| 3:35–3:50 | Code: characters and sound | `src/characters/Figure.ts` (constructor, `update()` head-tracking and glow); `src/audio/AudioSystem.ts` `startMusic()` | Characters and music are made by code; there are no audio files. |
| 3:50–4:05 | Engine: performance | `src/ship/ShipInteriorScene.ts` `applyLightBudget()`; a terminal running `node tools/perf-run.mjs` | 41 lights made the first load over a minute; measuring found it (PERF_LOG). |
| 4:05–4:20 | Tests | A terminal running `node tools/test-vessek-flow.mjs`, with PASS lines scrolling | A script plays the level through real controls and fails if anything breaks. |

**Cuts if it runs long:** shorten the reveal (1:05–1:15) first, then the characters/sound code shot.
