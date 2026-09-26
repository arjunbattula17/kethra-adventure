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
