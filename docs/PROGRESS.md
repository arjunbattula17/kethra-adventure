# Progress · the overhaul

Working state for docs/BRIEF.md. Branch `overhaul` (from master 9daf513). After compaction or in a
fresh session, read docs/BRIEF.md, this file, docs/DESIGN.md and `git log --oneline -15` first.
(The root PROGRESS.md is the TSA session log; this file is the overhaul's.)

## Status
**2026-09-27: design approved; building M0.** Milestone check-ins are OFF, so work continues
milestone to milestone without stopping.

## Milestones
- [x] Phase 0: brief saved, branch, baseline (screens, perf, journey test)
- [x] Phase 1: audit (docs/AUDIT.md, Part A)
- [x] Phase 2: design (docs/DESIGN.md)
- [x] Checkpoint: design approved 2026-09-27, all recommendations taken
- [ ] **M0 Foundations** ← here
  - [x] Vessek soft-lock fixed on master (ea28978) and merged; regression test tools/test-dialogue-esc.mjs
  - [x] Motion module (src/motion), flow state machine, ?debug harness, per-scene grades + LiteGlow, space sky, code-built Wren (freighter removed), world fonts, panel lifecycle and bug fixes (131f3a3)
  - [ ] UI kit pass: chamfered plates, sentence-case labels, hold-to-skip, kinetic title, tabular counts, HUD steps back
  - [ ] Wren draw calls, steps 1–5 (docs/DESIGN.md §7)
  - [ ] Journey runner + perf re-measure; M0 screenshots; M0 commit (motion, flow machine, debug harness, grade profiles, space kit, code-built Wren, UI kit, fonts, P1 fixes, Wren draw calls 1–5)
- [ ] M1 Level 1: the reveal and MG1 Intercept
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
| 7 | P2 | The Wren over budget at Low (30 fps, p95 49.9 ms, 614 calls at 6× CPU) | ship/interior/* | M0 steps 1–5, atlas later |
| 8 | ~~P2~~ | **Fixed (131f3a3)**: per-scene grades; space grade has no toe lift | GradeGlowPass.ts | |
| 9 | ~~P2~~ | **Fixed (131f3a3)**: world text on bundled faces; counters on Atkinson tabular | *Textures.ts, style.css | |
| 10 | P2 | Reduced motion: glides and FOV now handled; the intro dolly and the white-sky swell still ignore it | IntroScene | M6 (intro rebuild) |
| 11 | ~~P3~~ | **Fixed (131f3a3)**: reveal frees its resources; Kethra's timer is scene-owned | | |
| 12 | P3 | Floor textures uploaded twice; Low canvas downscale barely applies | floorTextures.ts:21-47, disposeSceneTextures.ts:60 | M0 |
| 13 | P3 | Kethra pillars appear to float ~0.42 m; the Heart's amber vane may overhang the slab (from code, unverified in engine) | KethraScene.ts:569-573, grove.ts:326 | M4 |
| 14 | ~~P3~~ | **Fixed (131f3a3)**: the reveal's engine embers removed; the ports glow emergency amber | | |
| 15 | P3 | The reveal still frames the Wren large against a poster-style system; corona is a big soft blur | GalaxyRevealScene.ts | M1 (reveal rebuilt as MG1's opening) |

## Decisions log
| Date | Decision | Why |
|---|---|---|
| 2026-09-26 | Working docs live in docs/ per the brief; the root DESIGN/PROGRESS stay as the TSA records | The team's workflow uses the root files; the brief's resume steps read docs/ |
| 2026-09-26 | Treat the design checkpoint as not yet passed | The brief's "Design approved" line still had its `[your notes]` placeholder, and no overhaul design existed on disk (checked every branch, stash and path) |
| 2026-09-26 | Journey mapping: MG2 and MG3 on Kethra, Vessek as the expanded "Level 2" (proposed) | TSA needs three levels; keeps the brief's order; the two new games fix the thinnest level (DESIGN §1) |
| 2026-09-26 | Keep Rajdhani as the ship's stencil face, move every counter to Atkinson tabular figures (proposed) | A reason from the world, and Rajdhani has no `tnum` (fontTools check) |
| 2026-09-26 | Screenshots are committed as JPEG q90 (4:4:4); lossless PNGs stay outside the repo for zoomed inspection | 30 PNGs at 1080p were 27 MB, and the brief's verification matrix multiplies that per milestone; as JPEG they're 6.9 MB |

## QA log
| Date | What | Result |
|---|---|---|
| 2026-09-26 | Build | clean (`tsc && vite build`) |
| 2026-09-26 | `npm run smoke` (preview build) | 6/6 |
| 2026-09-26 | Journey: tutorial flow / Kethra flow / Vessek flow | 36/36 / 18/18 / all passed, zero console errors |
| 2026-09-26 | Baseline screenshots, 1920×1080, every screen and state (`tools/capture-screens.mjs`) | 30 shots in docs/screenshots/baseline-1920x1080/, zero console errors. Ranked by visual quality: the Wren interior > solar chart > title > Kethra > Vessek > reveal > intro > ending |
| 2026-09-26 | Vessek soft-lock repro (E, number keys, Esc; then a second full talk) | Reproduced: `vessek_pulse` never set |

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
- The reveal and the ending aren't in `perf-run.mjs` yet; they'll be added with the journey test in M0.
