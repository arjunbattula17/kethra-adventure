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

Measurement notes:
- `tools/serve-like-pages.mjs` (127.0.0.1:4193) gzips like GitHub Pages (checked against the live
  site's headers: `.bin`/`.gltf`/`.js` gzip, images raw, max-age=600). Byte counts before change 2
  were taken from `vite preview` (no compression) and overstate the live download.
- Port 4191 on `::1` is held by another session's `vite preview` (a different build): never use
  `localhost:4191`. Runs against it were discarded.
- A killed capture left a headless Chrome running the game for 30 min and slowed every run in that
  window: after killing a tool, kill its Chrome tree too.

Investigated, not changed:
- Depth pre-pass in the Wren (opaque meshes drawn depth-only first, then lit; `DepthPrepassRenderPass`, transparent/cut-out/shader materials excluded): A/B x2 on Performance, uncapped, GPU timer queries: 20.6-26.6 ms without, 21.1-24.8 ms with (pass 2), within noise. Overdraw is not what the Wren pays for; the per-pixel cost is in the surfaces in front. **Reverted.**
- Releasing the Wren's ~120 MB of painted source canvases after upload: measured −182 MB of Chrome
  memory in the Wren (experiment shrinking them in place), but ~10 module-level caches keep those
  canvases on purpose so a return aboard doesn't repaint (~1-1.5 s), and a GPU context restore would
  re-upload from them. Not worth the risk and the slower returns; listed under recommendations.
- Programs alive grow 54 → 147 over a session: three.js keeps every program a material has used
  while the materials are never disposed. Bounded (each scene reuses its programs on return) and it
  saves recompiling Kethra (16 s cold) on a revisit. Left as is.

## Next step

1. Frame pacing in the Wren on Performance (p95 50-66 ms in look-arounds; steady state with Auto).
2. Remaining session growth (heap 31 → 88 MB aboard after Vessek).
