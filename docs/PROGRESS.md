# Progress · the overhaul

Working state for docs/BRIEF.md. Branch `overhaul` (from master 9daf513). After compaction or in a
fresh session, read docs/BRIEF.md, this file, docs/DESIGN.md and `git log --oneline -15` first.
(The root PROGRESS.md is the TSA session log; this file is the overhaul's.)

## Status
**2026-09-26: Phases 0–2 done. Stopped at the design checkpoint** (it's ON in the brief). Waiting
on the decisions in docs/DESIGN.md §10. Nothing in `src/` has changed on this branch yet.

## Milestones
- [x] Phase 0: brief saved, branch, baseline (screens, perf, journey test)
- [x] Phase 1: audit (docs/AUDIT.md, Part A)
- [x] Phase 2: design (docs/DESIGN.md)
- [ ] **Checkpoint: design approved** ← here
- [ ] M0 Foundations (motion, flow machine, debug harness, grade profiles, space kit, code-built Wren, UI kit, fonts, P1 fixes, Wren draw calls 1–5)
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
| 1 | **P1** | Soft-lock: Esc on Varro's closing line means the pulse never fires (reproduced through real input) | VessekScene.ts:731-735, DialogueSystem.ts:133-136 | M0 (and master, if approved) |
| 2 | P1 | New game double-click starts the flow twice; `GameFlow.start` has no guard | TitleScreen.ts:49-70 | M0 flow machine |
| 3 | P1 | Breaker board can call `onSolved` twice | BreakerPuzzle.ts:141-160 | M0 (panel replaced in M5) |
| 4 | P2 | Stale timers call `PanelManager.close()` on whatever panel is open | CoursePlot.ts:185, BreakerPuzzle.ts:157 | M0 MotionScope |
| 5 | P2 | Replaced panels leak their rAF loops | PanelManager.ts:45-55 | M0 |
| 6 | P2 | Alarm-beacon sweeps frozen by the merge pass | lighting.ts:530-541 | M0 |
| 7 | P2 | The Wren over budget at Low (30 fps, p95 49.9 ms, 614 calls at 6× CPU) | ship/interior/* | M0 steps 1–5, atlas later |
| 8 | P2 | Space scenes lifted to grey by the global grade (sky RGB 20–35 vs Void 7,8,10) | PostProcessing.ts:69-70 | M0 grade profiles |
| 9 | P2 | In-world text uses OS fonts missing on ChromeOS; Rajdhani counters jitter (no tabular figures) | *Textures.ts, style.css | M0 fonts |
| 10 | P2 | Reduced motion ignored by cinematic camera moves and FOV zooms | IntroScene, GalaxyRevealScene, GameFlow glides | M0 motion |
| 11 | P3 | GalaxyRevealScene frees nothing on dispose; Kethra's 1600 ms timer survives dispose | GalaxyRevealScene.ts:526, KethraScene.ts:401 | M0 lifecycle |
| 12 | P3 | Floor textures uploaded twice; Low canvas downscale barely applies | floorTextures.ts:21-47, disposeSceneTextures.ts:60 | M0 |
| 13 | P3 | Kethra pillars appear to float ~0.42 m; the Heart's amber vane may overhang the slab (from code, unverified in engine) | KethraScene.ts:569-573, grove.ts:326 | M4 |
| 14 | P3 | The reveal shows the Wren's engines lit before they're repaired (continuity) | GalaxyRevealScene.ts:498-502 | M1 |

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
