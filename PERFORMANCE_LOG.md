# Performance log: low-end web pass (2026-10-21)

Resumable log for the "lowest-end device is the baseline" pass. If a session is interrupted, read
this file first and carry on from **Next step**.

## Setup and assumptions

- **Engine: not Godot.** The brief was written for Godot 4; this project has no `project.godot`. It
  is a **three.js 0.185 + Vite 8 + TypeScript** WebGL2 game (`package.json`). Each Godot item in the
  brief was mapped to its three.js equivalent (Compatibility renderer → WebGL2 through ANGLE;
  MultiMeshInstance3D → InstancedMesh / merged geometry; Performance monitors → `renderer.info`,
  `performance.memory`, Chrome's process memory; shader pre-warm → `Engine.warmScene` /
  `prepare.ts`; scaling_3d_scale → the render-scale steps in `Engine`).
- **Branch:** `perf/lowend-pass` in worktree `C:\Users\swath\Desktop\kethra-adventure-lowend`, off
  `origin/overhaul` d6e51f5 (the live build). Nothing pushed or deployed.
- **Hardware:** the target class itself: Intel Core i5-1035G1, **Intel UHD (Ice Lake G1)**, 16 GB,
  installed Chrome through ANGLE D3D11, 1366×768 at DPR 1, on mains power. Auto picks Performance
  (`tier low`) on this GPU. Earlier passes (docs/PERF_LOG.md, docs/PERF_REPORT.md) already built:
  quality tiers + Auto governor + render-scale steps + start-up benchmark, shader preparation behind
  covers, background quick-light upgrade, texture release between levels, a `?debug` stats overlay.
  This pass measures what is left.
- **Throttling:** this laptop is already the weak device; CPU throttling on top of it is used only
  where noted. Runs drift 10-20 % as the laptop heats, so frame-cost decisions use A/B runs.
- **Tools:** `tools/journey-profile.mjs` (the whole game in order; this pass added bytes over the wire,
  Chrome's per-process private memory at each look-around, and a forced GC before each heap reading).

## Baseline (d6e51f5, cold GPU cache, Auto → Performance)

First measurements, against `vite preview` (no compression), so the bytes here are raw sizes. The
like-for-like comparison with the final build (Pages-style gzip, same runs back to back) is in the
final report at the end.

`docs/perf/lowend-base-journey/journey.json`

| Metric | Value |
|---|---|
| Download, whole game | **32.0 MB** over 233 URLs: 6.0 MB to the Wren, +14.7 MB Kethra, +11.4 MB Vessek |
| JS bundle | three 710 KB (180 KB gz), boot 405 KB (128 KB gz) |
| Reveal / cruise / canopy / ending (visible) | 59-60 fps, p95 17 ms; worst 133-183 ms (1 frame each) |
| The Wren, first visit (quick-light upgrade + cruise prep in the background) | 29 fps, p95 66.6, p99 83, 125 frames > 50 ms in 28 s |
| The Wren, later visits (look-around) | 33-44 fps, p50 16.7, p95 50-66 ms |
| Kethra | 37 fps, p50 32.7, p95 49.9, max 116 |
| Vessek | 52.5 fps, p95 33.3, max 33.5 |
| Chrome private memory (all processes) at each look-around | Wren 1184 → Kethra 1172 → Wren 1475 → Vessek 1566 → Wren **1681 MB** |
| JS heap (no forced GC) | Wren 31 → 62 → 115 MB |
| GPU textures alive in the Wren | 218 each visit (release works) |
| Programs alive at the end | 157 |

## Changes

| # | Change | Measure | Before | After | Result |
|---|---|---|---|---|---|
| 1 | 1024-pixel copies (`<name>.1k.jpg`, made by `tools/make-1k-textures.mjs`, listed in `src/core/textures1k.ts`) of the 28 maps over 1024 px; `textureCache.sizedUrl` fetches the copy when the tier caps maps at 1024 (Performance), which it already shrank them to after downloading | bytes over the wire, whole journey, cold (`lowend-1k-journey`) | 32.02 MB; 5.98 MB to the Wren | **20.05 MB; 2.90 MB to the Wren** (Kethra +14.7 MB, Vessek +2.5 MB, was +11.4) | **Kept.** Frames unchanged (Kethra 37 → 40 fps, Vessek 52.5 → 53.8, within noise); Wren boot transition 13.3 → 11.7 s. Image check, Performance, 6 views (`docs/perf/lowend-1k`): mean 0.49/255 vs 0.24 run-to-run noise; the two largest differences are a light glint and a flicker caught at a different moment (`crop-*.png`), not texture detail. Balanced and Quality still fetch the full maps |
| 2 | Level caches emptied back aboard (`core/levelCaches.ts`; `Engine.releaseLevelCaches` when a scene with `releasesLevelCaches` - the Wren - is on screen): the nature kit's templates (geometry, materials) and its decoded maps (`textureCache.forgetTextures`), and every `TextureLibrary` map no scene on hand uses; ImageBitmaps closed. The ship kit stays (fast returns) | Chrome private memory (all processes) and post-GC heap aboard the Wren after Kethra and after Vessek, journey, Pages-like server (`lowend-caches-journey`) | after Kethra 1439-1483 MB, geo 377; after Vessek 1597-1681 MB (3 runs), heap 97-101 MB, geo 387 | **after Kethra 1376 MB, geo 311; after Vessek 1455 MB, heap 88 MB, geo 320** | **Kept.** `tools/test-level-caches.mjs`: Kethra and Vessek twice each with releases between, 0 WebGL/console errors, second visits match the first (Kethra 0.77/255 mean, fireflies; Vessek 0.04). Frames and transitions unchanged |
| 3 | The governor remembers its verdict per kind of scene for the session (`Engine.verdicts`: the steady-30 cap it set, or an 85% resolution trial that was holding) and applies it from the first frame of the next visit; a cap held only for the lighting upgrade is not a verdict | Return aboard after Kethra, first 20 s, Auto on Performance, vsync, draws timed (`tools/wren-timeline.mjs --return=kethra`), A/B x2 alternating builds | 12 and 14 frames > 50 ms; 37-56 fps windows swinging (p95 up to 54 ms) while it re-judged: grace, judging window, trial | **0 and 0 frames > 50 ms**; an even every-other-refresh from the first frame (p95 36.6-36.9 ms at this headless 56 Hz) | **Kept.** Same end state the governor reached on its own each visit, minus the 5-15 s it took. First visit unchanged |
| 4 | The Wren's background lighting upgrade (first visit): the steady-30 hold from the first frame instead of after the 4 s grace, and one program compiling at a time (`PACE.background`) instead of three | First 40 s aboard, Auto on Performance, cold shader cache, draws timed (`wren-timeline`), A/B x2 of four variants (`docs/perf/up-*`) | frames > 40 ms: 93-103; > 50 ms: 6-11 in the first 5 s, 11-22 after; upgrade 18.6-22.2 s | **frames > 40 ms: 19-30; > 50 ms: 2-5 in the first 5 s, 3-4 after**; upgrade 22.3-23.8 s | **Kept.** Hold alone: 65-68 > 40 ms; two at a time: 74-76. The longer upgrade is background time the player doesn't see |
| 5 | Performance readout for any machine (`src/debug/PerfOverlay.ts`): the backquote key toggles it, `?fps` opens it at load. fps and frame p50/p95/max between real draws, frames over 50 ms, draw calls, triangles, textures/geometries/programs, JS heap, tier, render scale, the 30 cap, the benchmark and the GPU name. No cheats (the `?debug` harness keeps those) | cost when closed | - | a 2.6 KB chunk loaded on first use; closed: one null check per frame (`Engine.drawObserver`), three.js counters back on autoReset | **Kept** (`docs/perf/perf-overlay.png`) |
| 6 | A masked or empty graphics-chip name (`WebKit WebGL`, `Mozilla`, none) starts on Performance (`guessInitialTier`); recognised chips keep their rules (Intel UHD/HD, Mali, Adreno, PowerVR, software: Performance; Iris/AMD integrated: Balanced; others by core count) | first tier on an unknown device | core-count guess (8 threads: Quality) | Performance | **Kept** (the brief's rule). Checked against 8 sample strings; this laptop, an RTX 4060 and Apple GPU unchanged |
| 7 | Fix: the background lighting upgrade's off-screen first draws (`drawProgressively`) stop as soon as the room is replaced (`keepGoing`), and the upgrade returns. Before, leaving the Wren during that step kept drawing the disposed room, which uploaded its textures and geometry again with nothing left to free them | GPU textures/geometries in Vessek, journey | one final-journey run of change 6: **267 textures, 670 geometries**, Chrome 1611 MB (the Wren's ~193 painted textures and ~280 meshes back); runs of the same code before and after: 74 / 385 | 74 / 385 in every run since | **Kept.** Intermittent: it needs the departure to land inside that step, which change 4 (a longer upgrade that more often spills into the next visit aboard) made likelier. A targeted test (leave as the compile ends) could not hit the window on either build, because the departure keeps the room on screen for seconds; the fix closes the path whatever the timing |

Measurement notes:
- `tools/serve-like-pages.mjs` (127.0.0.1:4193) gzips like GitHub Pages (checked against the live
  site's headers: `.bin`/`.gltf`/`.js` gzip, images raw, max-age=600). Byte counts before change 2
  were taken from `vite preview` (no compression) and overstate the live download.
- Port 4191 on `::1` is held by another session's `vite preview` (a different build): never use
  `localhost:4191`. Runs against it were discarded.
- A killed capture left a headless Chrome running the game for 30 min and slowed every run in that
  window: after killing a tool, kill its Chrome tree too.

Investigated, not changed:
- Compiled programs kept for the session (54 -> 147): measured 0.52 MB each in the GPU process (60 Wren materials as new variants: 113 programs, +59 MB), so ~50 MB over a full playthrough. Freeing a departed level's programs would mean recompiling Kethra (16 s cold) on a revisit. Left as is.
- Main thread in the Wren (CDP profile, unminified build, 10 s, capped at 30): 278 ms/s busy, ~9 ms per drawn frame, almost all three.js draw submission (setProgram, uniforms, projectObject); GC 0.2 ms/s; no game logic in the top 25. No change.
- Kethra is per-pixel bound: GPU 14.4-18.6 ms p50 at full resolution, 6.6-6.7 ms at half (`perf-frames --scale`), triangles unchanged at 311k. The governor caps it at a steady 30. A 70 % step before the cap would hold ~60 but is a visible softness: listed under recommendations.
- Audio is synthesised (Web Audio oscillators and short noise buffers): no files to download or decode.
- Single 100-150 ms frames at about six scene cuts per playthrough (cruise start, Kethra arrival, the Wren after a loading cover). Residual from the 2026-09-30 pass; each sits at a cut or a fade.
- Depth pre-pass in the Wren (opaque meshes drawn depth-only first, then lit; `DepthPrepassRenderPass`, transparent/cut-out/shader materials excluded): A/B x2 on Performance, uncapped, GPU timer queries: 20.6-26.6 ms without, 21.1-24.8 ms with (pass 2), within noise. Overdraw is not what the Wren pays for; the per-pixel cost is in the surfaces in front. **Reverted.**
- Releasing the Wren's ~120 MB of painted source canvases after upload: measured −182 MB of Chrome
  memory in the Wren (experiment shrinking them in place), but ~10 module-level caches keep those
  canvases on purpose so a return aboard doesn't repaint (~1-1.5 s), and a GPU context restore would
  re-upload from them. Not worth the risk and the slower returns; listed under recommendations.
- Programs alive grow 54 → 147 over a session: three.js keeps every program a material has used
  while the materials are never disposed. Bounded (each scene reuses its programs on return) and it
  saves recompiling Kethra (16 s cold) on a revisit. Left as is.

## Loading, first visit (original d6e51f5 vs this branch, fresh profile, cold shader cache, Pages-like gzip server)

| Path | Original | This branch |
|---|---|---|
| Title on screen (10 Mbps) | 0.6 s (0.33 MB) | 0.6 s (0.33 MB) |
| New game -> walking in the Wren, watching the intro (10 Mbps, x2) | 30.2-30.3 s | 30.1-30.4 s (the intro hides the download either way) |
| New game -> the Wren, intro skipped at 3 s (5 Mbps, x2) | 13.9 / 15.2 s | **13.6 / 13.4 s** |
| Bytes before the Wren | 6.14 MB | **3.06 MB** |
| Whole game, over the wire | 26.1 MB | **14.1 MB** |

The Wren's cold compile (5-7 s on this GPU) is what remains of the skip path; its programs are already
prepared behind the intro when the intro is watched.

## Status

**Done.** All nine audit areas checked (table below), every finding fixed or written up with a
reason, final numbers compared with the original build, and regression tests run. Branch
`perf/lowend-pass` (8 commits on top of d6e51f5); nothing pushed or deployed.

## Audit areas A-I (final pass)

| Area | What exists / what this pass found | Outcome |
|---|---|---|
| A. Renderer and settings | WebGL2 through ANGLE (three.js; Godot's Compatibility renderer has no equivalent to switch). Tiers set pixel ratio (1 / 1.5 / 2), shadows (off on Performance), AO (Quality only), MSAA (Quality only), FXAA (Balanced); canvas has no MSAA or depth; ACES tone mapping; one environment map. Render scale steps 100/85/70 % on Performance | No change needed |
| B. Scene cost | Wren ~180 draws / 130k triangles, Kethra ~130 / 311k, Vessek ~136 / 167k after earlier batching and instancing. Kethra is per-pixel bound (half resolution: 18 -> 6.6 ms GPU); the Wren is lighting per pixel, not overdraw (depth pre-pass: no gain) | Pre-pass tried and reverted; 70 % step left as a recommendation |
| C. Shader / first-use hitches | Programs compiled behind covers and during cinematics; quick-light upgrade in the Wren. This pass: upgrade one program at a time + hold 30 from the first frame (89 -> 24 slow frames); fixed the upgrade drawing a replaced room | Changes 4 and 7 |
| D. Script cost | CPU profile, Wren, unminified, real GPU: ~9 ms per drawn frame, all three.js draw submission; GC 0.2 ms/s; no game logic in the top 25 | No change needed |
| E. Physics | No physics engine: box colliders and a kinematic player; nothing in the profile | No change needed |
| F. Memory and assets | Planet caches kept for the session (fixed, change 2); 2048 maps downloaded for 1024 use (fixed, change 1); programs kept (~0.5 MB each, ~50 MB a session, deliberate); Wren canvases kept for fast returns (~120 MB, recommendation); audio is synthesised (no files) | Changes 1, 2 |
| G. Loading and size | Title 0.33 MB, 0.6 s; Wren prepared behind the intro; levels behind their cruises. Bytes before the Wren 5.8 -> 2.8 MB, whole game 26 -> 14 MB (Pages gzip) | Change 1 |
| H. Frame pacing and adaptive quality | Auto governor (tier steps, 85 % trial, steady-30 cap, render-scale relief), start-up benchmark, Settings with Auto / Performance / Balanced / Quality (Auto default). This pass: verdict memory per scene (change 3), masked GPU -> Performance (change 6); delta time already clamped (0.1 s) | Changes 3, 6 |
| I. UI | No UI work shows in the Wren's CPU profile (top 25 functions are all three.js draw submission). Performance readout added (change 5) | Change 5 |

## Final report

### 1. Baseline vs final (Intel UHD laptop, Auto -> Performance, cold, the whole game in order)

Original = live build d6e51f5; final = ce1c7b9. Same machine, same server (GitHub Pages-style gzip),
runs back to back. Headless Chrome on this laptop refreshes at ~56 Hz, so "full rate" reads 56 fps
and "steady 30" reads 28 fps (every other refresh).

| Metric | Original | Final |
|---|---|---|
| Download, whole game (over the wire) | 26.1 MB | **14.1 MB** |
| Download before walking in the Wren | 5.84 MB | **2.76 MB** |
| Title on screen | 0.6 s | 0.6 s |
| New game -> walking in the Wren (intro watched, 10 Mbps) | 30.2-30.3 s | 30.1-30.4 s |
| New game -> the Wren, intro skipped (5 Mbps) | 13.9 / 15.2 s | **13.6 / 13.4 s** |
| First 40 s aboard: frames > 40 ms / > 50 ms | 89 / 24 | **24 / 8** |
| Returning aboard, first 20 s: frames > 50 ms | 12-14 | **0** |
| The Wren, settled (Auto) | steady 30, 0 frames > 50 ms | steady 30, 0 frames > 50 ms (settles ~15 s later) |
| Kethra, settled | steady 30, p95 36.7 ms, 0 > 50 ms | same |
| Vessek, settled | full rate, p95 19 ms, 0 > 50 ms | same |
| Draw calls (Wren / Kethra / Vessek) | ~181 / 129 / 136 | same |
| Chrome memory, all processes: aboard after Kethra | 1437 MB | **1326-1350 MB** |
| Chrome memory at the end of the game (aboard) | 1583 MB (1597-1681 in three earlier runs) | **1417-1473 MB** |
| JS heap after GC, aboard at the end | 96.9 MB | 87.6 MB |
| Geometries on the GPU aboard at the end | 387 | **320** (305 at first) |
| GPU textures aboard after every visit | 218 | 218 |
| Visible worst frames in cinematics | single 100-160 ms frames at cuts | same |

Input: the engine reads input inside the frame loop, so it acts on the next drawn frame (33 ms at the
steady 30). Not separately instrumented.

### 2. Issues found, ranked by measured impact

1. **Level assets kept for the whole session** (Kethra's nature kit, decoded maps, planet PBR maps):
   memory grew ~150-250 MB per planet visit. Fixed: `src/core/levelCaches.ts`, `Engine.releaseLevelCaches`,
   `TextureLibrary.ts`, `textureCache.forgetTextures`, `planets/kethra/kit.ts`.
2. **2048-pixel maps downloaded for 1024 use on Performance**: 12 MB of the download. Fixed:
   `tools/make-1k-textures.mjs`, `public/**/*.1k.jpg`, `src/core/textures1k.ts`, `textureCache.sizedUrl`.
3. **Background shader upgrade competing with play** in the Wren's first minute (3 programs at a time,
   cap only after 4 s): 89 slow frames. Fixed: `PACE.background` in `src/core/prepare.ts`,
   `Engine.upgradeQuickLights`.
4. **The governor re-judged every return aboard**: 5-15 s of 20-60 fps swings each time. Fixed:
   `Engine.verdicts` (setScene).
5. **The upgrade could draw a replaced room**, re-uploading ~190 textures and ~280 meshes for good
   (intermittent). Fixed: `drawProgressively(..., keepGoing)` in `src/core/prepare.ts`.
6. **Unknown/masked GPU started on a core-count guess** (Quality on 8 threads). Fixed:
   `guessInitialTier` in `src/core/Engine.ts`.
7. **No way to read performance on a real device** without the cheat harness. Added:
   `src/debug/PerfOverlay.ts`, `boot.ts` (backquote key, `?fps`).

### 3. Quality trade-offs applied

None visible. The 1024-pixel copies are what Performance already drew (pixel diff within run-to-run
noise). The verdict memory and the upgrade pacing change only when the existing steady-30 cap starts.
Changes that would have been visible (70 % resolution, fewer lights, simpler reflections) were not
applied.

### 4. Recommendations (need your decision)

| Recommendation | Expected gain | Cost |
|---|---|---|
| Merge `perf/lowend-pass` into `overhaul` + `master` and deploy | everything above, live | a deploy |
| 70 % render-scale step before the steady-30 cap on Performance | Kethra and the Wren ~60 fps instead of a steady 30 on this laptop (half resolution measured 6.6 ms GPU in Kethra) | visibly softer image on weak laptops |
| Free the Wren's painted canvases after upload | ~180 MB less memory in the Wren (measured) | ~1-1.5 s repaint on every return aboard; context-loss restore needs a repaint path; ~10 module caches to change |
| Free a departed level's shader programs | ~50 MB per playthrough (0.52 MB a program) | Kethra recompiles on a revisit (~16 s in the background, cold) |
| Meshopt-compress Kethra's tree geometry (three.js ships the decoder in `examples/jsm/libs`) | ~1-2 MB of Kethra's download | a decoder module and a re-export of the kit |
| Delete the unused 2048 PNG originals in `public/models/quaternius-nature/glTF` (redirected to the `Textures/` JPEGs) | ~33 MB smaller deploy and repo; no player download change | check nothing else references them |
| Custom export template (Godot item in the brief) | not applicable to three.js; the closest is importing three.js modules piecemeal | ~50 KB gzip at most; not worth it |

### 5. Not verified without real hardware, and a checklist

Not verified: an ARM Chromebook GPU (Mali/PowerVR), a Celeron-class CPU (this i5 spends ~9 ms of CPU per
frame in the Wren; a Celeron N4000-class chip could need ~20-27 ms, still inside a steady 30), a 4 GB
machine under memory pressure (measured: Chrome's private memory, not the OS), a real school network,
Safari. Checklist: `docs/TESTING_ON_A_REAL_CHROMEBOOK.md`, section 0 (the readout): per place, fps,
frame p95, frames > 50 ms, tier / render scale / cap, JS heap first time aboard and after both planets.

### 6. Remaining known issues and risks

- The Wren and Kethra end at a steady 30 on this laptop: per-pixel lighting (see recommendations).
- About six single 100-150 ms frames per playthrough, each at a scene cut or fade.
- The lighting upgrade now takes ~4 s longer, so a player who leaves the Wren within ~30 s of arriving
  finishes it on the next visit (the path that could leak is fixed and checked in every journey since).
- `tools/test-kethra-flow.mjs` "Warden Corvenna talks" fails intermittently on both the original
  (1 in 5 runs) and this branch: the E tap is sometimes not registered after closing Fen's dialogue
  (the prompt is showing). Pre-existing; worth a look in the input/dialogue code.
- A fast desktop whose browser hides its GPU name now starts on Performance and stays there unless the
  player picks a tier in Settings (the benchmark only steps down).

### 7. Keeping it from regressing

Budgets (Intel UHD laptop, Auto, cold, `tools/journey-profile.mjs` against `tools/serve-like-pages.mjs`):

| Budget | Limit | Now |
|---|---|---|
| Bytes before the Wren (Performance) | 3.5 MB | 2.76 MB |
| Whole game over the wire | 16 MB | 14.1 MB |
| Chrome memory at the end of the journey | 1.5 GB | 1.42-1.47 GB |
| GPU textures aboard after any visit | 218 (+ new Wren content) | 218 |
| Geometries aboard after both planets | 330 | 320 |
| Main-pass draw calls (Wren / Kethra / Vessek) | 200 / 150 / 150 | ~181 / 129 / 136 |
| Frames > 40 ms in the first 40 s aboard, cold (`tools/wren-timeline.mjs`) | 35 | 19-30 |
| Frames > 50 ms returning aboard (`wren-timeline --return=kethra`) | 2 | 0 |
| Settled frames > 50 ms in any level (`perf-frames --tiers=auto --capped`) | 0-2 | 0 |

Pre-release checklist:
1. `npm run build`; if a texture was replaced, `node tools/make-1k-textures.mjs` first.
2. `node tools/serve-like-pages.mjs 4193`, then `tools/smoke.mjs`, `tools/test-title.mjs`,
   `tools/test-level-caches.mjs`, `tools/test-tutorial-flow.mjs`, `tools/test-vessek-flow.mjs`
   (installed Chrome via the `use-chrome` preload).
3. `node tools/journey-profile.mjs <label> http://127.0.0.1:4193/kethra-adventure/ --cold-gpu`; compare
   with the budgets above.
4. `node tools/wren-timeline.mjs <label> --cold-gpu --return=kethra`.
5. On a real school laptop: open the readout (`) in each place and fill in the template in
   `docs/TESTING_ON_A_REAL_CHROMEBOOK.md`.
