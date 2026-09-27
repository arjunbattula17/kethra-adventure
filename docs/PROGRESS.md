# Progress · the overhaul

Working state for docs/BRIEF.md. Branch `overhaul` (from master 9daf513). After compaction or in a
fresh session, read docs/BRIEF.md, this file, docs/DESIGN.md and `git log --oneline -15` first.
(The root PROGRESS.md is the TSA session log; this file is the overhaul's.)

## Status
**2026-09-27: M1 done; starting M2.** Milestone check-ins are OFF, so work continues milestone
to milestone without stopping.

## Milestones
- [x] Phase 0: brief saved, branch, baseline (screens, perf, journey test)
- [x] Phase 1: audit (docs/AUDIT.md, Part A)
- [x] Phase 2: design (docs/DESIGN.md)
- [x] Checkpoint: design approved 2026-09-27, all recommendations taken
- [x] **M0 Foundations**
  - [x] Vessek soft-lock fixed on master (ea28978) and merged; regression test tools/test-dialogue-esc.mjs
  - [x] Motion module (src/motion), flow state machine, ?debug harness, per-scene grades + LiteGlow, space sky, code-built Wren (freighter removed), world fonts, panel lifecycle and bug fixes (131f3a3)
  - [x] UI kit pass: chamfered plates, sentence-case labels, hold-to-skip, kinetic title, tabular counts, HUD steps back (1e9c53a)
  - [x] Wren draw calls, steps 1–6 (docs/DESIGN.md §7): Low 614 → 256, High 942 → 520 (1e9c53a)
  - [x] The Conductor (HUD holds during cinematic beats, ambient motion ducks under hero moments), the space kit's sun, panel morphs, `npm run journey`, perf re-measure, M0 screenshots
- [x] **M1 Level 1: the reveal and MG1 Intercept**
  - [x] The reveal rebuilt at plot scale as MG1's opening: the hero pass, the ping resolving the system, one continuous move onto the plot (ca4357a)
  - [x] MG1 Intercept: three legs, readable fails with instant rewind, the amber wavefront win, stats that change the play; keyboard, mouse or both (ca4357a)
  - [x] The course on the desk chart (real state), the player leaning over it after the win (ca4357a)
  - [x] The keypad plot deleted (ca4357a)
  - [x] The Wren's lighting arc: emergency → navigation → full (power.ts); full stands on `left_wren` until First light exists (M2)
- [ ] M2 First light and the cruise ← next
- [ ] M2 First light and the cruise
- [ ] M3 MG2 Canopy
- [ ] M4 MG3 Hush and Kethra's floor
- [ ] M5 Level 2: Vessek expanded
- [ ] M6 Opening, menus, ending
- [ ] M7 Whole-game pass and art pass
- [ ] M8 Report

## Open issues
| # | Sev | Issue | Where | Plan |
|---|---|---|---|---|
| 1 | ~~P1~~ | **Fixed (ea28978)**: Esc on Varro's closing line meant the pulse never fired | DialogueSystem.ts | Regression test fails before and passes after |
| 2 | ~~P1~~ | **Fixed (131f3a3)**: double start from the title | flow machine + title guard | |
| 3 | ~~P1~~ | **Fixed (131f3a3)**: breaker double solve | BreakerPuzzle.ts | |
| 4 | ~~P2~~ | **Fixed (131f3a3)**: stale timers closing the wrong panel (`close(id)`) | PanelManager.ts | |
| 5 | ~~P2~~ | **Fixed (131f3a3)**: replaced panels now close properly | PanelManager.ts | |
| 6 | ~~P2~~ | **Fixed (131f3a3)**: beacon sweeps registered noMerge | lighting.ts | |
| 7 | P2 | The Wren is still over its Low budget: 256 calls against 150 (was 614). Its scene pass is 30–50% cheaper than the baseline's in a controlled A/B (below), but perf-run's Low p95 at 6× still misses 33 ms in the Wren, Kethra and Vessek | ship/interior/*, all scenes | M7: the remaining calls are unique-parameter materials; measure with the steadier method in issue 16 |
| 8 | ~~P2~~ | **Fixed (131f3a3)**: per-scene grades; space grade has no toe lift | GradeGlowPass.ts | |
| 9 | ~~P2~~ | **Fixed (131f3a3)**: world text on bundled faces; counters on Atkinson tabular | *Textures.ts, style.css | |
| 10 | P2 | Reduced motion: glides and FOV now handled; the intro dolly and the white-sky swell still ignore it | IntroScene | M6 (intro rebuild) |
| 11 | ~~P3~~ | **Fixed (131f3a3)**: reveal frees its resources; Kethra's timer is scene-owned | | |
| 12 | P3 | Floor textures: one canvas wrapped by several CanvasTextures (per-texture `.repeat`), so the same image uploads more than once. The Low downscale's reach is now moot for the Wren: its small canvases live in atlas pages, which the downscale deliberately skips so Low keeps each canvas's own resolution | floorTextures.ts:21-47 | M7 (bake the repeat into UVs so the textures can share) |
| 13 | P3 | Kethra pillars appear to float ~0.42 m; the Heart's amber vane may overhang the slab (from code, unverified in engine) | KethraScene.ts:569-573, grove.ts:326 | M4 |
| 14 | ~~P3~~ | **Fixed (131f3a3)**: the reveal's engine embers removed; the ports glow emergency amber | | |
| 15 | ~~P3~~ | **Fixed (ca4357a)**: the reveal is rebuilt at plot scale as MG1's opening | GalaxyRevealScene.ts | |
| 16 | P2 | perf-run's Low numbers at 6× CPU are too noisy to rank builds on this PC: identical runs differ by about ±10 ms at p50, and throttling from page load vs after arrival changed the Wren's scene pass from ~10 ms to ~30 ms | tools/perf-run.mjs | M7: repeat runs, report the median of medians, and add main-thread CPU per frame from a trace |
| 17 | P3 | Every return to the Wren redraws a rebuilt ship, and its warm-up frame (programs, texture uploads) freezes the loading screen for ~5.2 s on High | GameFlow.returnFromPlanet, Engine.setScene | M7: keep the ship's programs alive across planet visits, or prewarm it while the planet plays |
| 18 | P3 | Three materials in Kethra bump their version every frame (one MeshStandardMaterial by 8 per frame), so three.js re-checks their programs each frame. Pre-existing: the baseline does the same | Kethra scene | M4 (Kethra's floor pass) |
| 19 | P2 | Vessek's JS heap went 52 → 79 MB (Low) and 53 → 105 MB (High) with the eight code-built hull variants | shipHull.ts, VessekScene.ts | M5: share geometry across variants or drop the CPU-side arrays after upload |
| 20 | P3 | The Wren's power stage is set when the room is built; nothing animates between stages yet | ShipInteriorScene, power.ts | M2: First light animates emergency → full as the power wave |
| 21 | P3 | In MG1 the Kethra and Wren tick numerals can overlap where the two ghosts cross | InterceptGame.drawLabels | M7 art pass: offset labels by side of the line |

## Decisions log
| Date | Decision | Why |
|---|---|---|
| 2026-09-26 | Working docs live in docs/ per the brief; the root DESIGN/PROGRESS stay as the TSA records | The team's workflow uses the root files; the brief's resume steps read docs/ |
| 2026-09-26 | Treat the design checkpoint as not yet passed | The brief's "Design approved" line still had its `[your notes]` placeholder, and no overhaul design existed on disk (checked every branch, stash and path) |
| 2026-09-26 | Journey mapping: MG2 and MG3 on Kethra, Vessek as the expanded "Level 2" (proposed) | TSA needs three levels; keeps the brief's order; the two new games fix the thinnest level (DESIGN §1) |
| 2026-09-26 | Keep Rajdhani as the ship's stencil face, move every counter to Atkinson tabular figures (proposed) | A reason from the world, and Rajdhani has no `tnum` (fontTools check) |
| 2026-09-26 | Screenshots are committed as JPEG q90 (4:4:4); lossless PNGs stay outside the repo for zoomed inspection | 30 PNGs at 1080p were 27 MB, and the brief's verification matrix multiplies that per milestone; as JPEG they're 6.9 MB |
| 2026-09-27 | Low keeps a glow: the grade pass's quarter-res LiteGlow (UnrealBloom stays High-only) | Low must look simpler, never broken (brief); without glow every screen and lamp reads flat. Measured: toggling it on Kethra at 6× CPU moved frame times less than run-to-run noise |
| 2026-09-27 | The freighter GLB (CC BY 3.0) is deleted; Vessek's twenty-one hulls use `buildShipHull({ variant })` | Approved at the checkpoint; one ship language, one fewer licence to carry |
| 2026-09-27 | Milestone screenshots commit at 1920×1080, Low and High; the other three sizes of the brief's matrix are inspected from scratch and committed at M7 | The full matrix is ~200 images per milestone; M7 is where the design puts the four-size verification |
| 2026-09-27 | Atlas pages are exempt from the Low canvas downscale | An atlas page is 2048 px only because it packs small canvases that were already within budget; halving it halved every placard's text on Low |
| 2026-09-27 | Tools wait for the flow to go idle, not just for the scene to become current | The scene is current ~5 s before its transition finishes; perf-run's next jump was being ignored |
| 2026-09-27 | MG1 leg 3 is two burns (a hop over the belt, then the lead); the belt is a full ring of clumps | At a fixed cruise speed a single straight burn has one intercept day, so "pay the extra day" can't happen in one burn. Details in DESIGN §4 slot 1 |
| 2026-09-27 | The reveal's system is at plot scale (1 unit = 1 Mkm) and matches the galaxy map's NAV figures | What the ping resolves is exactly what the player plots against; the old poster orrery had the Wren outside Kethra's orbit |
| 2026-09-27 | The desk chart draws real state: the belt band, Kethra's orbit, the buoy and the player's own course | DESIGN §2 "Screens show real state"; it replaced invented waypoints and telemetry |

## QA log
| Date | What | Result |
|---|---|---|
| 2026-09-26 | Build | clean (`tsc && vite build`) |
| 2026-09-26 | `npm run smoke` (preview build) | 6/6 |
| 2026-09-26 | Journey: tutorial flow / Kethra flow / Vessek flow | 36/36 / 18/18 / all passed, zero console errors |
| 2026-09-26 | Baseline screenshots, 1920×1080, every screen and state (`tools/capture-screens.mjs`) | 30 shots in docs/screenshots/baseline-1920x1080/, zero console errors. Ranked by visual quality: the Wren interior > solar chart > title > Kethra > Vessek > reveal > intro > ending |
| 2026-09-26 | Vessek soft-lock repro (E, number keys, Esc; then a second full talk) | Reproduced: `vessek_pulse` never set |
| 2026-09-27 | `npm run journey` (smoke, tutorial, dialogue Esc, Kethra, Vessek) on the M0 build | 5/5 |
| 2026-09-27 | Tutorial flow flaked on its 30 s wait for the intro's skip | The intro offers the skip only after the ship builds under the loading screen: 29.3–30.1 s before M0's draw-call work, 30.5–31.1 s after, under the software rasteriser. Waits raised to 180 s, as for the intro's arrival |
| 2026-09-27 | Panel morph: Character (560×700) → Settings | The frame eases through 12 frames to 600×733; no re-entry, no errors |
| 2026-09-27 | Controlled A/B against the baseline build (same day, 6× CPU after arrival, seed 7) | Wren scene pass 10.0–14.9 ms vs 18.3–20.1 ms; Kethra 28.6–33.5 ms vs 28.3–28.7 ms |
| 2026-09-27 | M0 screenshots: 1920×1080 Low + High committed (docs/screenshots/m0, 36 JPEGs); 1280×720, 2560×1080 and 1440×900 inspected from scratch (108 PNGs) | Zero console errors. Fixed: atlased text on Low was half-resolution; the arrival card came within 4 px of a two-line objective at 1280×720 (now `top: max(14vh, 140px)`). Noted for M6: the centred "Level N" card is still the default the design replaces |
| 2026-09-27 | MG1 model: `tools/test-intercept-sim.mjs` | 17/17: each leg solvable; aiming at Kethra now misses by 19 Mkm; a flattened lead misses; the straight route hits the belt; no single burn (1,500 directions × every cell count) and no dive arrives; the belt has no gap in the plane; a plain climb costs the fourth cell |
| 2026-09-27 | MG1 played with real input: `tools/test-mg1-flow.mjs` | All passed: Shift + arrow aiming, [ ], 1/2, Space, R, the plate's buttons by mouse; the miss and contact labels; the budget refused past four; the counted win; the saved course; +1 insight and engineering; engineering 2 → five cells |
| 2026-09-27 | `npm run journey` (now seven tests) | 7/7; the tutorial flow is 39/39 with the MG1 and lighting-arc checks |
| 2026-09-27 | M1 screenshots: 1920×1080 Low + High (docs/screenshots/m1, 32 JPEGs): reveal beats, MG1's legs and win, the desk chart, the three power stages | Zero console errors. Fixed on the way: the reveal's line shader (reversed smoothstep showed the grid before the ping), a ping that washed the screen gold, the sun filling leg 1, near-side belt rocks cluttering leg 3, a white win line, the desk chart seen as a sliver from the seat, interaction prompts over the scripted poses |
| 2026-09-27 | The reveal + MG1 at 1366×768 (`measure-scene`) | Low (6× CPU) 30 calls, 14k tris, p50 16.7 / p95 24.3 ms; High 40 calls, p50 16.6 / p95 25.9 ms. Budget 80 / 160 |

## Performance
Baseline on this PC (RTX 4060) at 1366×768, DPR 1. Low = pinned Low tier with 6× CPU throttle;
High = pinned High tier, unthrottled. Source: docs/perf/overhaul-baseline/{low-cpu6,high-cpu1}/results.json.

| Scene | Preset | fps | p50 / p95 ms | Draw calls | Triangles | Textures | Heap MB | Budget (calls / tris) |
|---|---|---|---|---|---|---|---|---|
| Intro | Low | 60 | 16.7 / 16.7 | 18 | 47.6k | 224 | 48.4 | 80 / 150k |
| Intro | High | 60 | 16.7 / 16.7 | 31 | 47.7k | 245 | 26.6 | 160 / 300k |
| The Wren | Low | **30.3** | 33.3 / **49.9** | **614** | 142k | 231 | 25.9 | 150 / 150k |
| The Wren | High | 60 | 16.7 / 16.7 | **942** | 251k | 267 | 27.1 | 350 / 300k |
| Kethra | Low | 60 | 16.7 / 16.8 | 155 | 311k | 50 | 46.5 | 160 / 320k |
| Kethra | High | 60 | 16.7 / 16.7 | **611** | **1.24M** | 69 | 41.1 | 450 / 900k |
| Vessek | Low | 59.3 | 16.7 / 16.8 | 197 | 76k | 65 | 52.3 | 180 / 200k |
| Vessek | High | 60 | 16.7 / 16.7 | 405 | 152k | 84 | 53.3 | 400 / 400k |

- **Loading:** title 0.7–1.3 s; intro playable 16.3–16.6 s from a cold browser; 24.6 MB total.
- **Memory:** heap loop-to-loop +0.7% (Low) and +1.8% (High), so no leak shows.

### M0 (2026-09-27)
Same presets. Source: docs/perf/m0/{low-cpu6,high-cpu1}/results.json; the reveal and ending rows
are from `tools/measure-scene.mjs` (spawn view, no pan), since perf-run doesn't visit them.

| Scene | Preset | fps | p50 / p95 ms | Draw calls | Triangles | Textures | Heap MB |
|---|---|---|---|---|---|---|---|
| Intro | Low | 59.8 | 16.7 / 16.7 | 17 | 6k | 204 | 25.4 |
| Intro | High | 60 | 16.7 / 16.7 | 27 | 6k | 224 | 26.0 |
| The Wren | Low | 24.5 | 49.9 / 66.7 | **251** | 147k | 205 | 25.8 |
| The Wren | High | 60 | 16.7 / 16.8 | **422** | 278k | 236 | 26.8 |
| Kethra | Low | 40.1 | 16.7 / 50.0 | 187 | 312k | 55 | 39.0 |
| Kethra | High | 59.8 | 16.7 / 16.7 | 612 | 1.24M | 73 | 40.1 |
| Vessek | Low | 29.8 | 33.3 / 66.6 | 256 | 72k | 71 | **79.1** |
| Vessek | High | 59.8 | 16.7 / 16.8 | 404 | 117k | 89 | **105.1** |
| Reveal | Low | – | 16.5 / 18.9 | 25 | 25k | 34 | – |
| Reveal | High | – | 16.7 / 18.6 | 35 | 25k | 46 | – |
| Ending | Low | – | 16.6 / 18.7 | 24 | 7k | 22 | – |
| Ending | High | – | 16.6 / 18.0 | 34 | 7k | 34 | – |

- **Read the Low rows with issue 16 in mind.** Re-running the baseline build the same day gave the
  Wren 33.4 / 99.9 ms and Vessek 16.7 / 50.0 ms, and identical runs of one build differ by about
  ±10 ms at p50. The controlled A/B in the QA log is the comparison to trust: the Wren's scene pass
  is 30–50% cheaper than the baseline's.
- **Loading:** intro playable 28.3 s (Low, 6×) and 37.0 s (High). This PC ran about 2× slower
  today: the baseline build re-run on Low gave 31.5 s where it had given 16.6 s. A same-day High
  baseline wasn't taken.
- **Memory:** loop-to-loop +1.2% (Low) and +1.5% (High). Vessek's heap is new: the twenty-one
  hulls are now code-built (issue 19).
- The Wren's draw calls at the spawn view (`measure-scene`): Low 614 → 256, High 942 → 520.
