# Performance Report

One page, before and after. Details and every run's raw numbers: docs/PERF_AUDIT.md,
docs/PERF_LOG.md and `docs/perf/{baseline,final}/*/results.json` (made by `tools/perf-run.mjs`).

**How it was measured.** Headless Chromium on the team's dev PC, 1366×768 at device pixel ratio
1, a cold cache, and for the "Chromebook simulation" the CPU slowed 6× and the network limited to
10 Mbps. The GPU is not simulated: it is this PC's RTX 4060, so anything limited by a weak
graphics chip will be worse on a real Chromebook than shown here. "Before" is the build from the
start of this session (commit dc05fdb), measured the same way.

## Key numbers

| | Before | After | Budget |
|---|---|---|---|
| Title on screen, simulated Chromebook | 2.0 s | 1.7 s | — |
| Bytes to the title | 0.45 MB | 0.52 MB | under 5 MB ✓ |
| New game → intro playable, cold browser, simulated Chromebook (Auto) | 81.9 s | 59.4 s | 5 s ✗ |
| Same, pinned to the Performance tier | 66.6 s | 23.3 s | 5 s ✗ |
| Same, desktop, unthrottled | 65–69 s (this session's build before the light budget) | 34.1 s | 2 s local ✗ |
| Total bytes, a full loop with the cache off | 22.1 MB (2 levels) | 29.0 MB (3 levels + ending) | 20 MB ✗ |
| Heap growth, second loop through every level vs the first | +105% (no GC before reading) | +4 to +9% (after a forced GC) | within 10% ✓ |
| Console errors across the run | 0 | 0 | 0 ✓ |

Per scene, simulated Chromebook, tier chosen automatically (final/chromebook-sim):

| Scene | fps | p95 frame | Hitches >50 ms in 8 s | Draw calls | Budget met? |
|---|---|---|---|---|---|
| Intro | 60 | 16.7 ms | 0 | 18 | ✓ |
| The Wren | 15.3 | 100 ms | 83 | 656 | ✗ (30 fps, 100 calls at Low) |
| Kethra | 57.1 | 16.8 ms | 0 | 158 | ✓ fps, ✗ calls |
| Vessek Anchorage | 31.9 | 66.6 ms | 21 | 253 | ✓ fps, ✗ hitches and calls |

On the unthrottled desktop, every scene holds 60 fps at the Quality tier with no hitches
(final/desktop).

## What moved the numbers
1. **The point-light budget** (the Wren kept its 16 strongest of 41 lights; 8 on Performance). Every
   light is written into every shader, so the first load compiled 93 very long shader programs.
   Cold boot on the desktop went from ~65 s to ~30 s with the room within about 2/255 per pixel.
2. **The start-up benchmark** now picks the tier from measured frames, not only from the GPU's
   name: on the simulated Chromebook it chose Performance before the first frame, which lifted
   Kethra from 26 to 57 fps and Vessek from 22 to 32 fps against the previous automatic run.
3. **Downgrades apply fully at the next level change**, behind the loading cover, so "automatic
   Performance" is the same as choosing Performance.
4. Vessek's lights 20 → 12 and moored hulls 12 → 8; no per-frame sorting or allocation in the
   hot loop.

## Auto-detect, in one paragraph
At first launch the game guesses a tier from two cheap signals: the GPU's name (software
renderers start at Performance, integrated Intel/AMD/ARM chips at Balanced) and the number of CPU
cores. Then, while the loading screen still covers the view, it draws eight hidden frames of the
real ship interior (twelve, ignoring the first four), waits for the GPU to finish each one, and
takes the median.
Over 33 ms (under ~30 fps), it switches to Performance; over 22 ms from Quality, to Balanced. During play, a
governor watches real frame times and steps down if the slowest 5% of frames stay over 33 ms,
applying the full preset at the next level change. It never steps up mid-session, a choice in
Settings turns all of this off, and the player is told once, with where to change it back.

## Where it's still short, and why
- **The Wren on a slow CPU (~15–23 fps).** It draws ~650 objects a frame because its ~350
  generated textures each need their own draw call. The fix is a texture atlas (BACKLOG B-28).
- **First load on a cold browser.** Still tens of seconds, mostly shader compilation. It
  happens once; browsers cache compiled shaders, so a second visit is much faster. The loading
  screen shows real progress and a line of lore throughout.
- **Download size.** 29 MB for everything. The largest single files are the freighter model
  (2.9 MB), the starfield (1.3 MB) and the kit textures; compressing the models (meshopt) and
  textures (KTX2) is the next step, and ~70 MB of unused files in the build folder (D-10) are
  never downloaded.

## The minimum device it is comfortable on
From these measurements: any laptop from the last five years with integrated graphics runs every
level smoothly at Balanced or Performance [opinion, from the desktop and throttled runs; not yet
tested on such a laptop]. A school Chromebook is likely to play Kethra and Vessek at 30+ fps and
the Wren's room at around 15–25 fps [unsourced — estimate from the 6× CPU simulation]; the team
should confirm with docs/TESTING_ON_A_REAL_CHROMEBOOK.md before submission.
