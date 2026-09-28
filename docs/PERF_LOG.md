# Performance Log

One row per change: measure, change one thing, measure again, keep it only if it pays for itself.
Unless noted, measurements are on the dev PC (RTX 4060) with `tools/perf-run.mjs` or a one-off
Playwright script; "6×" means Chrome's CPU throttling at 6× slower. Full run data: `docs/perf/`.

| Change | Scene | Before | After | Result |
|---|---|---|---|---|
| Keep the 16 strongest of the Wren's 41 point lights (8 on Low), scored by intensity × reach² (`ShipInteriorScene.applyLightBudget`) | The Wren, cold boot to intro, 1×, High | 41 lights: 64.8 s | 16 lights: 30.1 s; 8 lights: 22.4 s | **Kept.** Image difference across five views: mean 2.06/255 per pixel, 0.61% of pixels changed by more than 32 levels |
| Same, measured end to end | Cold boot to intro, 6×, Low | 66 560 ms (pre-session build) | 23 278 ms | Kept |
| Vessek point lights 20 → 12 (one light per row of fixtures, fewer emergency lights, no reading lamp) | Vessek | 20 point lights | 12 point lights | **Kept** (Vessek was new this session; no earlier frame-time measurement at 20) |
| Moored hulls outside Vessek's windows 12 → 8 | Vessek, 6×, Low | 26.3 fps, 265 calls, 39 hitches (`diag-low`) | 50.3 fps, 216 calls, 5 hitches (`final-low`) | **Kept** |
| Quality governor sorts its frame window every 30 frames instead of copying and sorting it every frame | All | an array copy + sort per frame | one per 30 frames | **Kept** (removes a per-frame allocation; not separately timed) |
| Per-frame allocations removed: `PlayerController` scratch vectors, `InputManager.consumeMouseDelta` shared object | All, during play | ~8 new objects per frame [unsourced — estimate, counted from the code] | 0 | **Kept** (not separately timed) |
| Flatten small props on Low into shared plain materials so batching can merge them | The Wren, Low | 661 draw calls | 637 draw calls | **Reverted:** too small to justify the code |
| Hide transparent overlay planes on Low | The Wren, Low | 70 overlay planes drawn | would remove the window's stars | **Not applied.** Only the 29 grime decals were safe, too small a saving |
| Rebuild the environment map after a GPU context loss | The Wren, after a simulated context loss | screenshot brightness 65.0 before loss, 36.5 after restore | 67.9 after restore | **Kept** |
| `THREE.Clock` → `THREE.Timer`; `PCFSoftShadowMap` → `PCFShadowMap` | All | two console warnings on every load | none | **Kept** (three.js had already been substituting PCF, so shadows look the same) |
| Stop drawing and suspend audio in hidden tabs; pause on focus loss; cap to 30 fps below 20% battery unplugged | All | always drawing, always playing | as described | **Kept** (the battery cap needs a real laptop to verify; see TESTING_ON_A_REAL_CHROMEBOOK.md) |
| Start-up benchmark: 12 hidden frames of the ship behind the loading cover, median of the last 8; step down if over 33 ms (Performance) or over 22 ms from Quality (Balanced) (`Engine.benchmarkScene`) | Simulated Chromebook, 6×, 10 Mbps, Auto | Kethra 26.2 fps, Vessek 22.1 fps (governor kept shadows and MSAA on its way down) | Kethra 35.0 fps, Vessek 46.2 fps | **Kept.** First threshold (16 ms) wrongly moved the RTX 4060 desktop to Balanced; raised to 22 ms, desktop stays on Quality at 60 fps |
| Mid-play downgrades apply their full preset (shadows, anti-aliasing) at the next level change, behind the cover | All, Auto | "automatic Low" kept Quality's shadows and MSAA | same as choosing Performance after one transition | **Kept** |
| The Wren adapts to a benchmark downgrade (8 lights, halved canvases) and is re-warmed behind the cover | The Wren, 6×, Auto | 14.1 fps | 15.3–16.2 fps across two runs | **Kept** (within run-to-run noise; keeps Low meaning Low) |
| Heap measured after a forced GC (`--expose-gc`) | Loop through every level twice | +46% loop to loop without GC (noise) | −4.6% (desktop), −6.5% (Low), −8.1% (Chromebook sim) | Measurement fix; no leak |

## 2026-09-27: on a real Intel UHD laptop

Machine: Intel Core i5-1035G1 with Intel UHD graphics (Ice Lake G1), 16 GB, Chrome through ANGLE
D3D11, 1366×768 at device pixel ratio 1. This is the class of laptop the game has to run on, so the
GPU is real rather than simulated. Two tools, both new: `tools/perf-frames.mjs` (installed Chrome,
vsync off so a frame's interval is its real cost, the camera turning a full circle, a first pass
that includes first-sight costs and a second that is steady state, GPU timer queries) and
`tools/perf-ab.mjs`, which measures four fixed views and alternates the two versions to cancel the
laptop's thermal drift. "Frame ms" is the mean over the four views unless noted. Differences under
~5% are noise.

| Change | Scene | Before | After | Result |
|---|---|---|---|---|
| Skip the lighting maths for point and spot lights that can't reach the pixel (`src/core/shaderPatches.ts`) | The Wren, Performance | 30.5 ms | 23.8 ms (with the two rows below) | **Kept.** Image identical: 0.03/255 mean against a 0.02/255 noise floor |
| Canvas created without MSAA and depth (the composer does its own) | All | a 4× buffer the final pass never needed (~33 MB) | none | **Kept** |
| Balanced: FXAA instead of 4× MSAA on the composer | The Wren, Balanced | MSAA alone: 72.1 ms → 46.0 ms without it | 77.0 ms → 36.0 ms (with the light skip) | **Kept.** Mean 1.6/255, at edges and fine text |
| Bloom off (test) | The Wren, Balanced | 73.9 ms | 71.8 ms (−2.9%) | Not changed: noise-level |
| Opaque draw order near to far (test) | The Wren, Performance | 32.4 ms | 34.4 ms (+5.9%) | **Rejected:** more program switches cost more than the overdraw saved |
| Opaque draw order grouped by shader program | The Wren, Performance | 22.4 ms; 215 program switches for 520 draws | 20.9 ms (−6.7%); render JavaScript −7.6% | **Kept** |
| Colour grade folded into OutputPass (one full-screen pass, not two) | The Wren, Performance | grade pass 4.3% of the frame | — | **Kept.** Same maths |
| Normal maps off (test) | The Wren, Performance | 22.0 ms | 21.4 ms (−2.8%) | **Rejected:** noise-level, and the surfaces lose their detail |
| Half the point lights (test) | The Wren, Performance | 25.2 ms | 23.2 ms (−8%) | **Rejected:** a visible lighting change for 2 ms |
| Physical glass panes hidden (test) | The Wren, Performance | — | −3.4% | Not changed |
| Batching also takes instanced meshes, and merges inside interaction targets (originals kept on a raycast-only layer) | The Wren, console view | 520 draws, 215 program switches | 377 draws, 84 switches | **Kept.** Image 0.04/255. GPU time in that view barely moved (its cost is per-pixel lighting); render JavaScript fell |
| Static matrices for every mesh outside `noMerge` | The Wren | `updateMatrixWorld` 3% of the main thread | — | **Kept** |
| Warm-up frame draws the whole scene (culling off, hidden meshes shown) | First turn in each scene | worst first-sight frame: Wren 480 ms, Vessek 1,614 ms | 71 ms, 94 ms | **Kept** |
| Scenes await their images (reveal's starfield, sun and planets; Vessek's planet; `applyPbr` maps) | Galaxy reveal, first play | 2.6 s (Performance) to 5.5 s (Balanced) freeze | worst frame 16 ms | **Kept** |
| Kethra's shadow map painted once | Kethra, Balanced | ~170 extra draws and 310k extra triangles a frame | — | **Kept.** The Aiveth's shadows don't follow their breathing |
| Interaction raycast limited to the longest target range, no per-frame arrays; floor raycast reused within a frame; Kethra's per-frame `getObjectByName`; footstep noise buffers; cinematic and trail vectors | All | garbage and repeated searches every frame | none | **Kept** (not separately timed) |
| Title planet turns by transform, not `background-position` | Title screen, 3 s idle | 145 style recalculations, 192 ms of main thread, plus a repaint of the disc and its blurred shadows every frame | 0 recalculations, 7 ms | **Kept.** Screenshots match |
| GPU guess: Intel UHD/HD and ARM → Performance | Auto, first visit, New game → the Wren playable | ~85 s (Balanced built, then rebuilt for Performance at the handover: 31–33 s of it) | ~36 s | **Kept** |
| Benchmark re-measures after a step down; fits render scale on Performance | Auto | one step per boot | as many as needed | **Kept** |
| Steady 30 fps on Performance when a scene averages under ~45 fps, judged per scene | Auto, the Wren | 44–52 fps with dips to ~32 facing the console | 30 fps, worst frame 35 ms | **Kept** |
