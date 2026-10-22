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

## Next step

1. Heap growth with a forced GC (`lowend-base-journey-gc`), then find what holds memory.
2. 1024-pixel copies of 2048 maps for Performance (`tools/make-1k-textures.mjs`, `textureCache.sizedUrl`).
