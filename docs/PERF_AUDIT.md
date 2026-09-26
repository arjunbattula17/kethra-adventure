# Performance Audit

What a judge on a weak laptop gets, measured rather than guessed. Tool: `tools/perf-run.mjs`
(results in `docs/perf/<run>/results.json`). Browser check: `tools/browser-matrix.mjs`.

## The simulated weak laptop, and what it can't simulate

- **CPU:** Chrome's built-in throttling at 6× slower.
- **Network:** 10 Mbps with the cache disabled (every file downloaded fresh, like a judge's first
  visit), in the runs marked "10 Mbps".
- **Screen:** 1366×768 at device pixel ratio 1 (one screen pixel per CSS pixel, as on most school
  laptops).
- **Not simulated: the graphics card.** Headless Chrome here uses this PC's real GPU, an NVIDIA RTX
  4060. A Chromebook's integrated graphics are far slower, so anything limited by the GPU (shader
  compiling, texture upload, pixel-heavy effects) will be worse on a real Chromebook than these
  numbers show. `TESTING_ON_A_REAL_CHROMEBOOK.md` is how the team closes that gap.

## The runs

| Run | Build | CPU | Network | Tier |
|---|---|---|---|---|
| `baseline-chromebook-sim` | before this session (commit dc05fdb) | 6× | 10 Mbps, cold | Auto |
| `baseline-low` | before this session | 6× | unthrottled | Low (pinned) |
| `final-desktop` | this session, *before* the light budget | 1× | unthrottled | Auto |
| `final-chromebook-sim` | this session, light budget in, 12 Vessek hulls | 6× | 10 Mbps, cold | Auto |
| `diag-low` | same as above | 6× | unthrottled | Low (pinned) |
| `final-low` | this session, all changes | 6× | unthrottled | Low (pinned) |

Where each run's `results.json` lives: `baseline-chromebook-sim` → `docs/perf/baseline/chromebook-sim/`,
`baseline-low` → `docs/perf/baseline/low-tier/`, `final-low` → `docs/perf/final/low-tier/`,
`final-chromebook-sim` → `docs/perf/intermediate/chromebook-sim-before-hull-trim/`,
`diag-low` → `docs/perf/intermediate/low-tier-before-hull-trim/`, `final-desktop` →
`docs/perf/intermediate/desktop-before-light-budget/`. The final unthrottled and throttled runs
of the finished build are in `docs/perf/final/` (see docs/PERF_REPORT.md).

Only Kethra was measured on the baseline builds, because Vessek Anchorage didn't exist yet.
`final-desktop`'s draw-call counts read "1"; the counting bug was found in that run and fixed
before the others (three.js resets its counters between post-processing passes).

## Loading timeline

Time from opening the page, cold cache.

| | Title visible | Intro playable | Ship playable | Bytes to title | Total bytes |
|---|---|---|---|---|---|
| baseline, 6× + 10 Mbps, Auto | 1956 ms | 81 881 ms | 92 672 ms | 0.45 MB | 22.11 MB |
| final, 6× + 10 Mbps, Auto | 1679 ms | 44 586 ms | 54 268 ms | 0.52 MB | 29.93 MB* |
| baseline, 6×, Low | 1367 ms | 66 560 ms | 77 240 ms | 0.45 MB | 22.11 MB |
| final, 6×, Low | 1284 ms | 23 278 ms | 32 992 ms | 0.52 MB | 24.61 MB |
| final, 1×, Auto, before light budget | 750 ms | 68 887 ms | 78 480 ms | 0.52 MB | 24.61 MB |

\* The 29.93 MB run re-downloaded some kit textures after the auto tier changed mid-run (the
largest-assets list shows `T_Trim_02_ORM.jpg` and `Leaves.png` twice). The other final runs, which
cover the same three levels, total 24.61 MB.

Level transitions, first visit (final, 6×, Low): Kethra 8 117 ms, Vessek 16 619 ms.

**Budgets:** title under 5 MB, yes (0.52 MB). Whole game under 20 MB, no: 24.61 MB. First playable
under 5 s, no: the intro takes 23 s even at Low on the simulated CPU. It was 67 s before this
session.

## Frame times per scene (6× CPU)

p50 is the typical frame, p95 the slowest 1 in 20; a "hitch" is any frame over 50 ms.

| Scene | Run | fps | p50 | p95 | Hitches | Draw calls | Tier |
|---|---|---|---|---|---|---|---|
| Intro | final-low | 60 | 16.7 | 16.8 | 0 | 18 | Low |
| The Wren | baseline-low | 19.3 | 33.4 | 116.6 | 60 | 651 | Low |
| The Wren | final-low | 23.3 | 33.4 | 100 | 36 | 643 | Low |
| The Wren | final-chromebook-sim | 8.2 | 133.3 | 199.9 | 62 | 1295 | Medium** |
| Kethra | baseline-low | 58.1 | 16.7 | 16.8 | 0 | 121 | Low |
| Kethra | final-low | 47.6 | 16.7 | 33.4 | 2 | 172 | Low |
| Vessek | diag-low (12 hulls) | 26.3 | 33.3 | 66.7 | 39 | 265 | Low |
| Vessek | final-low (8 hulls) | 50.3 | 16.7 | 33.4 | 5 | 216 | Low |

\*\* In the Auto run, the quality governor (the code that lowers quality when frames are slow) was
still at Medium when the Wren was sampled; it waits a few seconds after a scene loads before
judging, so the sample caught it before it stepped down. Pinned-Low runs are the fair comparison.

Unthrottled on the dev PC (final-desktop), every scene held 59–60 fps at the High tier.

## Long tasks (main thread blocked over 50 ms)

- **Level loads** are one or two very long tasks, all behind the loading screen. Final, 6×, Low:
  Kethra's load had a longest task of 4 583 ms, Vessek's 9 649 ms then 4 217 ms. These are building
  the level and compiling its shaders.
- **During play in the Wren:** 34 long tasks in 8 seconds (longest 132 ms) at final-low, down from
  67 (longest 138 ms) at baseline-low. These are the frames that feel like stutter.
- **Kethra and Vessek during play:** 1 and 8 long tasks respectively at final-low.

## Largest downloads

From the final runs: `models/ship/freighter.glb` 2.93 MB, `textures/space/starfield.jpg` 1.31 MB,
`T_Trim_02_ORM.jpg` 1.04 MB, `Leaves.png` 0.89 MB, `T_Trim_03_ORM.jpg` 0.84 MB, the five
`TwistedTree_*.bin` files 0.67–0.77 MB each, `T_Trim_01_ORM.jpg` 0.68 MB, `T_PaddedWall_BaseColor.jpg`
0.51 MB. By type: 21.38 MB of fetched models and textures, 2.8 MB of images, 0.34 MB of script.

## Memory

JS heap after the first ship, then after each full loop through every level and back:

| Run | After first ship | After loop 1 | After loop 2 | Loop-to-loop |
|---|---|---|---|---|
| baseline-low | 28.7 MB | 49 MB | 96.3 MB | +96.5% |
| baseline-chromebook-sim | 52.7 MB | 60.3 MB | 123.7 MB | +105.1% |
| diag-low | 52.6 MB | 67.3 MB | 58.1 MB | −13.7% |
| final-low | 35.9 MB | 76 MB | 68.2 MB | −10.3% |
| final-chromebook-sim | 32.8 MB | 81.8 MB | 97.6 MB | +19.3% |

The first loop grows on purpose: model and texture caches fill so a second visit is instant. What
matters is loop 2 against loop 1. The old build roughly doubled every loop (a leak). Two of the three
final runs went down; the third, the Auto run whose tier changed mid-run, went up 19%, so treat "no
leak" as likely rather than proven. GPU memory isn't measured by this tool.

## Browsers

`tools/browser-matrix.mjs` on this PC: Chromium 151, Edge 153, Firefox 153 and WebKit 26.5 (the
engine Safari uses, in its Windows test build) all reached every level with zero console errors.
**One problem:** in WebKit, starting from the title screen's New game button leaves the 3D view black
(frame brightness 13.6 on Kethra and 12 on Vessek, where a lit scene measures 30–70). Reading pixels
straight from WebGL shows the game *is* drawing; the picture just isn't reaching the screen. It only
happens once sound has started (the New game click unlocks audio), and the pre-session build does
the same. It may be specific to WebKit's Windows test build. It must be checked on a real Mac in
Safari before submission.

## Causes, ranked

1. **The Wren's 41 point lights, unrolled into every shader.** three.js writes one block of lighting
   code per point light into every lit shader. The Wren had 41 lights and about 93 shader programs,
   so a fresh browser spent about 18 s compiling and about 45 s on the first frame. Measured on the
   dev PC, cold, High tier: 41 lights → 65 s to the intro, 16 → 30 s, 8 → 22 s. **Fixed** (16 kept,
   8 on Low).
2. **About 650 draw calls in the Wren.** The room has 765 meshes using 413 materials, and 367 of
   those materials are used by exactly one mesh, each with its own generated texture. Every material
   is at least one draw call (one "draw this" instruction from the CPU to the GPU), and a slow CPU
   spends its frame sending them. The budget is 100 at Low and 300 at the default tier. **Open**:
   the fix is a texture atlas (many small textures packed into a few large ones) so props can share
   materials.
3. **Vessek's moored hulls.** Each freighter clone costs about eleven draw calls. **Reduced** from
   12 to 8 hulls.
4. **Download size.** 24.61 MB against a 20 MB budget; the freighter model and the kit textures are
   the biggest items. **Open.**

## What a judge on a Chromebook experiences today (honest estimate)

- The title screen appears in about 1–2 seconds even on a slow network (measured 1.3–1.7 s
  simulated).
- Pressing New game: a loading bar with lore lines, then the intro. Simulated at Low: 23 s. On a real
  Chromebook's graphics chip, shader compiling is slower than on this PC's GPU, so expect longer,
  perhaps 30–60 s [unsourced — estimate].
- The intro plays smoothly. The Wren, the first place you walk around, runs around 20–25 fps with
  some stutter on the simulated CPU (measured 23.3 fps at Low), possibly lower on a real one. It is
  playable, but below the 30 fps target.
- Kethra and the Anchorage hold 45–50 fps on the simulated CPU at Low.
- If the school has switched off WebGL, the judge sees a clear "graphics unavailable" screen instead
  of a black page.
