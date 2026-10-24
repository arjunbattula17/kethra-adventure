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

## 2026-09-29 and 30: the overhaul build, on the same Intel UHD laptop

The overhaul branched before the 2026-09-27 pass and the start-up work (`bacf042`); both were merged
into it by hand (`1dc63ee`), then the live build was profiled end to end. Tools, all new or rebuilt
for the overhaul: `tools/startup-profile.mjs` (title → New game → intro → the Wren, a fresh browser
profile per run), `tools/journey-profile.mjs` (the whole game in the player's order: the reveal and
MG1, First light, the cruise, MG2, Kethra, the docking cruise, Vessek, the ending), `--cold-gpu` on
both (a per-run term appended to every shader, so Intel's own shader cache misses too),
`tools/program-audit.mjs --keys`, `tools/cpu-profile-cut.mjs` (one cut: long tasks by function, and
any program first used on screen with the key fields that separate it from the prepared ones),
`tools/texture-leaks.mjs` (which GPU textures outlive their scene). "Cold" below means both caches
empty. The laptop throttles as it heats (the same intro ran at 57, 41 and 21 fps in three runs one
afternoon), so decisions on frame cost used interleaved A/B in one page.

| Change | Scene | Before | After | Result |
|---|---|---|---|---|
| Canvas atlas pages cropped to what they hold, painted in ordinary memory (`45c948b`) | The Wren, cold, Performance | upload stage 40.5 s; 540 MB of mostly empty 2048² pages | 3.6 s | **Kept.** Same pixels, same draw calls |
| Don't draw a scene a full cover hides (`8af1cf1`) | Intro → the Wren, cold | first draws waited 20.9 s on the GPU behind the finished intro | 0.8 s; intro end → the Wren playable 23.9 s → 3.7 s | **Kept** |
| Failed downloads retried, never cached as failed; a failed transition shows a reload screen (`d4add25`) | Any load | a dropped kit file left a black screen for the session | retried twice; reload offered | **Kept.** `tools/test-load-failure.mjs` 5/5 |
| Reveal and cruise wait for their sun and planet maps (`9ea70b0`) | Reveal, cruise | ~10 maps decoded in cinematic frames | in hand before the warm-up frame | **Kept** |
| Kethra prepares during the cruise (`3bb019e`) | MG2's last shot, cold | held ~18 s for Kethra's compile | done ~22 s into the 47 s cruise at 58.6 fps | **Kept** |
| Vessek built in paced pieces, prepared during the docking cruise | Departure → Vessek playable, cold | 74.2 s (docking title held ~24 s) | 50.1–53.7 s; worst cruise frame 333 → 166 ms | **Kept** (`docs/perf/base-0930`, `fix1-0930`, `final-0930`) |
| Moth hides its body, not its root (its light stays in the count) | Cruise → MG2 cut | 3 programs compiled in the first frame: 468 ms | 33–59 ms | **Kept** |
| Cruise keeps fog (no density in space) and the hull's engine light when the skiff drops in | Kethra cruise, entering the atmosphere | 3 unprepared programs: ~370 ms | worst cruise frame 466 → 133–150 ms | **Kept** |
| Free the replaced scene's textures the next scene doesn't use (`Engine.releaseTextures`) | GPU textures aboard after Kethra and Vessek, Performance | 409 MB (level file textures kept for the session) | 231 MB, the same as at boot; Kethra 144 → 103 MB, Vessek 339 → 224 MB | **Kept.** Returning aboard re-uploads the kit textures the Wren shares (~0.2 s behind the loading bar) |
| `TextureLibrary` maps decoded off the page's thread, capped by the tier | Vessek, Performance | ship_wall at 2048² (64 MB), decoded on the main thread | 1024² | **Kept** |
| Wren built with its batch merge paced (test) | Return aboard, cold | merge 224 ms | 503 ms, return +1 s | **Reverted** for the Wren (Vessek keeps it) |
| Real light loops instead of unrolled copies, everywhere (test) | The Wren's compile behind the intro, cold | 27.4 s | 7.7 s | Compile **kept for the first Wren only**: per frame, 6% slower in the Wren and 11–16% in Kethra (A/B, `gpu` timer queries) |
| Quick lighting programs for the first Wren, upgraded in the background (`QUICK_LIGHTS`, `upgradeQuickLights`) | Intro end → the Wren playable, cold | 6.0 s (compile 27.4 s); click → the Wren 38.0 s | 1.1–1.3 s (compile 7.0–10.1 s); click → the Wren 31.1 s; intro 59.9 fps. Unrolled programs compiled 15–35 s into the tutorial, then swapped with no frame over 67 ms | **Kept** (`start-fix1`, `start-quick`, `final-0930`) |
| The light-reach test without the unrolled copies (test) | The Wren / Kethra, per frame | — | stock three.js is 24% / 62% slower | Confirms the 2026-09-27 patch; kept |
| Spherical-harmonic fit for the environment's diffuse term (test) | The Wren / Kethra | — | 0% / −6% GPU, image unchanged | **Not applied:** no gain where it mattered |
| Same fit for the reflections too (test) | The Wren | — | compile −25% | **Rejected:** flatter metal, brighter ceiling (3.2/255 mean, 8% of pixels over 8 levels) |
| 6 point lights on Performance instead of 8 (test) | The Wren | compile ~805 ms a program | ~709 ms (−12%) | **Rejected:** the console's glow lights go, visibly |
| Post-processing cost (measurement) | The Wren, Performance | the grade, glow and output passes | ~0.5 ms of a 27–41 ms frame | Folding the grade into the output pass again would not help |
| Where the Wren's frame goes (A/B) | The Wren, Performance | — | environment map 16–28%, 85% resolution −24%, point lights 9–17%, spots −7%, directional fills −7%, fog 1%, glow 0% | The frame is per-pixel lighting |
| Governor: 85% resolution before the steady-30 cap, on the bottom tier | The Wren on Auto, vsync on | steady 30 | ~45–56 fps after the lighting upgrade; Vessek 55–60; Kethra's heaviest views still end at a steady 30 | **Kept** |
| Hidden prewarm copy of the tutorial markers in the Wren | First appearance of the markers | 2 programs compiled on screen (~130 ms) | compiled with the room | **Kept** |

## 2026-10-16: the cinematic title screen

Same Intel UHD laptop (i5-1035G1), installed Chrome through ANGLE D3D11, 1366×768, a fresh browser
profile per run, on battery. `tools/title-bench.mjs`: title buttons, the backdrop's first frame,
every frame interval from 3 s after the buttons for 8–10 s, long tasks, then one click. Baseline is
the build before (30fbd3c, a CSS-only title). "A/B" rows alternate the two builds run by run; the
laptop drifts too much between batches to compare them otherwise (`docs/perf/baseline-title`,
`title-v1`, `title-v3`, `title-final`, `*-continue`).

| Change | Measure | Before | After | Result |
|---|---|---|---|---|
| 3D backdrop behind the title (first version) | backdrop first frame; longest task; frames > 50 ms | — | 6.05 s; 1.84 s; 6 | Not good enough: the two noise bakes compiled synchronously (Direct3D: 0.5 s and 1.9 s frozen) |
| Bakes compiled in the background (`compileAsync`), drawn in strips, loop bounds as uniforms, both bakes in parallel, title maps fetched when the menu shows | backdrop first frame; longest task | 6.05 s; 1.84 s | 3.94 s; 447 ms | **Kept** |
| Sine-free hashes in the bake shaders | the nebula | visible blocks (sin() of large arguments under ANGLE/D3D) | smooth | **Kept** |
| Menu opening: opacity and translate only during start-up; no animated blur, stroke draw-on or SVG rotation; ornamental loops start after 3.6–4.5 s; static starfield | engine creation (`boot:engine`), A/B | 340–560 ms (baseline CSS title: 53–68 ms) | 28–307 ms, typically ~150 ms | **Kept.** The rest is the menu's own fade overlapping the engine's creation |
| Hull lights matched to IntroScene's rig, so the title compiles the intro's hull programs | New game → intro on screen, A/B ×3 | 2.28 s median (2.28–3.18) | 1.78 s median (1.73–1.94) | Kept until the ship was taken out of the title (row below) |
| (measurement) Continue → the Wren playable, A/B ×3 | | 11.0 s median | 11.3 s median | Within run-to-run noise |
| (measurement) Title frame pacing once settled | median / p95 frame | 16.7 / 17.0 ms | 16.7 / 17.1–17.4 ms (Performance and Balanced, 1366×768 and 1920×1080) | 60 fps. Quality (4× MSAA, bloom) ~30 fps on this GPU, as in the rest of the game; Auto picks Performance here |
| (measurement) Start-up window | frames > 50 ms; JS heap | 0; 7.8 MB | 2–4 (backdrop warm-up, ship warm-up); 15–16 MB | The menu stays responsive (longest task 236–339 ms). The heap is the backdrop's, freed on leaving |
| The ship taken out of the title (the user's call); no lights, no environment map; rocks with craters, normal-mapped lichen_rock and rims; buttons with static glow filters; frame labels and tagline removed | backdrop first frame; engine creation; New game → intro (A/B ×3); steady frame | 3.94 s; ~150 ms; 1.78 s; 16.7 / 17.1 ms | 2.59–2.85 s; 43–55 ms (baseline 35–46); 1.90 s median (baseline 1.94 in the same batch); 16.6 / 16.8–17.0 ms, no frame over 20 ms | **Kept.** New game is back to the baseline's speed (no hull programs to share). Start-up window: longest task 167–192 ms (baseline 169–198), 1–3 frames over 50 ms, heap 13 MB (baseline 7.8) |
| (measurement) First contentful paint | | 0.9–1.2 s | 1.1–3.3 s | A metric artefact: the menu's text starts at opacity 0 and fades in on the compositor, which Chrome doesn't count until the next main-thread paint. Screenshots show the wordmark at 0.5 s and the whole menu at 1.1 s, as before |

## 2026-10-16, second pass: the title with a ship, and how it arrives

Same laptop and method (cold profile per run, 1366×768, on battery, Auto picks Performance). Baseline
is the live build (9a0fb90, served from `dist`); the branch adds the cruiser, a moon and a third bake.
`tools/title-bench.mjs` rows alternate live and branch run by run (`docs/perf/title-ship/`). The
"arrival" rows count frames over 34 ms from the backdrop's first frame (the 1.2 s dissolve, then
10 s), from a per-frame probe with the engine's own marks.

| Change | Measure | Before | After | Result |
|---|---|---|---|---|
| The backdrop complete from its first frame, one 0.9 s dissolve from the menu's stand-in sky (was eight staggered fades over 2.5 s); the menu in as one piece (was kicker, wordmark, orbit, then buttons by ~1.3 s) | whole menu on screen; ornamental loops | buttons ~1-2 s after load; light sweep, comet and flare loops | menu shows from ~0.4 s, fully in by 0.77-0.91 s; nothing loops | **Kept** |
| Order of what runs while the title waits: environment map after the backdrop is on screen (was alongside it) | the title's bakes; backdrop first frame (A/B ×2) | 0.85-1.0 s; 2.85-3.30 s | 0.42-0.44 s; 2.29-2.43 s | Kept, with the next row |
| ...and the prefetch (the Wren's models and textures) moved after the backdrop too | slow frames in the dissolve | | 5-9 of up to 150 ms (prefetch alone: 5-6; environment map alone: 0-1) | **Not kept**: the arrival stuttered, which reads as lag |
| Prefetch alongside the backdrop's preparation, environment map after it (the final order) | backdrop first frame; slow frames in the dissolve; in the 10 s after | 2.37-2.62 s with neither running | 2.65-2.93 s; 0-1; 1 (100-133 ms, the environment map's last render step) | **Kept** |
| (measurement) Final branch vs live, A/B ×3 | backdrop first frame | 3.00 s median (2.80-3.66) | 2.99 s median (2.51-3.39) | Same, with more in the scene |
| (measurement) | title frames once settled: median fps, p95, share over 20 ms | 59.9-60.2; 17.0-17.1 ms; 0.7-2.7 % | 59.9-60.2; 17.1-17.4 ms; 0.2-0.7 % | Same |
| (measurement) | New game → intro on screen | 2.60 s median (2.57-2.97) | 2.56 s median (2.55-2.85) | Same |
| (measurement) Continue → the Wren playable, A/B ×1 | | 8.8 s | 8.1 s | Within run-to-run noise |
| (measurement) JS heap on the title | | 11-14 MB | 13.5-17.5 MB | The ship's geometry and the moon; freed on leaving |
| (measurement) Scene size | | | ship hull 13.4k triangles, plumes and glows one 88-triangle draw, 19 rocks 5.7k triangles in one draw; 25 programs with the post chain | |

## 2026-10-17: the environment map's frame on the title

Same Intel UHD laptop (i5-1035G1), installed Chrome through ANGLE D3D11, 1366×768, headless, a fresh
browser profile per run. Two boot orders: the live one (9a0fb90: the environment map is made while the
backdrop prepares) and the title branch's (feat/title-reference-ship, 3d02d13: the map once the
backdrop is on screen), built from this branch with only that change to boot.ts. `tools/env-map-frames.mjs`
(new) counts every frame inside the `engine:environment` span, names the generator's step drawn
last before each long one, times each step on the GPU, and hashes the finished map; builds alternate
run by run (`docs/perf/env-loop/`).

| Change | Measure | Before | After | Result |
|---|---|---|---|---|
| (measurement) The frame, title order | frames > 50 ms in the span | one of 83–217 ms in every run (8 of 8), right after the generator's first GGX draw (ggx level 1) | | A Chrome trace: one WebGL command-buffer flush holds the GPU process's main thread, which also draws the page, for 103 ms. That step is 20–34 ms of GPU time (timer queries), and a one-texel GGX draw ahead of the real steps took the whole stall onto itself (100 and 133 ms): a first-draw cost, not GPU load |
| (measurement) Why | the GGX program, alone on a page: link; first draw right after the link reports done, 24–34 ms later, 10 frames later | 0.63–0.96 s; 135–254 ms, ~97 ms, 9–11 ms | | The filter's 256-sample loop has a constant bound and ANGLE gives the HLSL compiler no `[loop]`, so it is unrolled (64 samples: 0.22 s to link). The driver goes on compiling for up to ~0.25 s after `COMPLETION_STATUS_KHR`, and the generator's first GGX draw came 0.12–0.15 s after it |
| The GGX loop bound read from a uniform (`Environment.ts`, keepSampleLoop) | link; first draw at any wait | 0.63–0.96 s; up to 254 ms | 0.08–0.18 s; 10–25 ms | **Kept** |
| (measurement) The map | every value of the 768×1024 half-float map, read back as floats | | 0 of 3,145,728 differ (alone on a page); in the game, one hash in all 32 runs that read it back, both builds, both orders | Identical |
| Same, title order, A/B ×8 (batches of 2, 3, 3) | frames > 50 ms in the span; slowest frame; the span | 26 (1–6 a run); 83–217 ms; 1.8–4.0 s | 0; 33–50 ms (two of 49.8–49.9 ms in the backdrop's first 0.3 s); 0.61–1.05 s | **Kept** |
| Same, live order, A/B ×10 (batches of 3, 4, 3), with a build that makes no map on the title (×4) | frames > 50 ms from the menu to 10 s after the backdrop; the span; map done before the backdrop; backdrop first frame | 51 in 4 runs, 44 in 3; 1.9–3.6 s; 4 of 10; 3.96 s median | 55, 45; 0.97–1.51 s; 10 of 10; 3.77 s median (no map: 60 in 4 runs, 4.05 s) | **Kept.** Here the span overlaps the backdrop's preparation, whose own frames these are: as many without the map |
| (measurement) `tools/title-bench.mjs`, A/B ×3, live order | New game → intro; idle p95; share over 20 ms; frames over 50 ms | 2.65 s median (2.61–2.67); 17.1–17.2 ms; 1.7–3.1 %; 4–6 | 2.64 s (2.53–2.76); 17.1–17.4 ms; 2.5–3.4 %; 5 | Same |
| (measurement) Same, title order | | 3.01 s (2.71–3.12); 33.0–33.2 ms; 5.0–6.4 %; 8–10 | 2.63 s (2.57–2.83); 17.2–17.3 ms; 2.6–3.4 %; 4–5 | Better: the old build ran inside the idle window. Why New game was slower after it was not looked into |
| (measurement) On the live title code (overhaul 3d02d13, the cruiser; the map made once the backdrop is up), the fix ×16 in four batches (×8 against the code unchanged), with no-map controls | the GGX frame; the span; frames > 50 ms in the span | 166–383 ms in 8 of 8 runs; 3.0–4.4 s | none in 16 of 16; 0.64–1.34 s; 0 in 6 of 16 runs, 1–3 in the rest (66–167 ms, at the span's start: the backdrop's own arrival, which the no-map build has too, and in batches run hot the map's six shader compiles overlapping it) | **Kept.** What is left comes from when the map starts, not from the map (`on-3d02d13*`) |
| (experiment) Same code, the map's programs compiled two at a time (prepare.ts pacing) | frames > 50 ms in the span; the span | 0 in 4 runs; 0.68–0.72 s | 1 in 4 runs; 0.81–0.98 s | **Not kept**: no better and slower (one cool batch) |
| (experiment) Same code, the map made alongside the backdrop's preparation again (9a0fb90's order) | map done before the backdrop; frames > 50 ms with the backdrop up during the build; frames > 50 ms over the whole wait; backdrop first frame (A/B ×4 with the map after it and with no map) | after it by design; 4 in 4 runs (1, 0, 0, 3); 37; 3.37 s median | 4 of 4; 0; 33 (no map: 32); 3.43 s (no map: 3.26) | Not applied: boot.ts is the title branch's, and it moved the map after the backdrop because the unrolled compile held the backdrop back, which no longer happens. A follow-up |
| (measurement) Tests | `tools/test-title.mjs`; `tools/smoke.mjs` | | all checks pass; 6 of 6 | |
| On overhaul with the fix merged (ec3f1ad + 25c162e), the map made alongside the backdrop's preparation again (boot.ts: in an idle callback after the prefetch's, 9a0fb90's order), A/B ×12 against the map made once the backdrop is up, with a build that makes no map on the title (rounds 4–11 one run per invocation, run again when another session's browser overlapped; `on-overhaul-order/`) | map done before the backdrop; frames > 50 ms with the backdrop up during the build; frames > 50 ms in the backdrop's first second; over the whole wait; the span | after it by design (0 of 12); 15 in 12 runs (1–3 in 9 of them); 21; 118; 1.05 s median (0.65–1.31) | 12 of 12, 0.77–1.24 s before it; 0; 16 (no map: 13); 119 (no map: 110); 1.39 s (1.14–1.82) | **Kept**: nothing of the map's build lands on the visible backdrop. The span's frames over 50 ms (63 in 12 runs) come while only the menu is up, inside the backdrop's preparation, whose own long frames the no-map build has too (110 over the whole wait against 119) |
| (measurement) Same runs, the backdrop's first frame | median; paired with the map-after build round by round | 4.10 s (3.14–5.22) | 4.33 s (3.33–5.89), no map 3.72 s; +0.28 s median over 12 rounds (−0.17 to +1.22), +0.12 s over rounds 4–11 | The order's cost, ~0.1–0.3 s, inside the run-to-run spread: the map-after and no-map builds, the same code until the backdrop, differ by −0.43 to +0.89 s (median +0.06) |
| (measurement) `tools/title-bench.mjs`, A/B ×6 (pairs in alternating order), map after the backdrop vs alongside its preparation (`bench-overhaul-*`) | New game → intro; idle p95; share over 20 ms; frames over 50 ms; backdrop first frame | 2.81 s median (2.58–3.04); 17.1–17.5 ms; 2.1 % (1.1–3.4); 2–6; 4.12 s (3.99–5.33) | 2.90 s (2.60–3.31; paired −0.34 to +0.72, median +0.06); 17.1–17.4 ms; 0.6 % (0.5–3.3); 2–3; 4.31 s (4.14–5.12; paired median +0.12) | Same click; a smoother idle title, since the map no longer builds in the idle window |
| (measurement) Tests, the new order | `tools/test-title.mjs`; `tools/smoke.mjs`; a rebuild from the committed source | | 39 of 39 pass; 6 of 6; byte-identical to the build measured | |

## 2026-10-19: the title's capital ship

Same Intel UHD laptop, installed Chrome through ANGLE D3D11, 1366×768, headless, a fresh profile per
run, on mains power. Baseline is the live build (cd1bb1c, the cruiser); the branch replaces the ship
and nothing else. `tools/title-bench.mjs` rows alternate live and branch run by run
(`docs/perf/capital-ship/`).

| Change | Measure | Before | After | Result |
|---|---|---|---|---|
| The capital ship replaces the cruiser: 41k triangles (was 13.4k) built in ~11 paced chunks, a 1024×512 markings sheet painted at load, a 58-triangle alpha-blended markings draw, 20 small boosters (plumes and glows one 440-triangle draw) | title frames once settled: median fps, p95, share over 20 ms, frames over 50 ms | 59.9-60.2; 16.9-17.0 ms; 0-0.2 %; 0 | 60.2; 16.9-17.0 ms; 0 %; 0 | **Kept.** Same |
| (measurement) | backdrop first frame | 2.97 s median (2.80-3.16) | 3.02 s median (2.91-3.02) | +0.05 s here; +0.09 and ~+0.1-0.15 s in two earlier batches of 3+3 |
| (measurement) The ship's build on the main thread (dev build, three cold loads) | longest chunk between frames | | 12-19 ms; ~75 ms in all | Each chunk yields a frame |
| (measurement) JS heap 6 s after the backdrop, after a forced garbage collection (`--js-flags=--expose-gc`), ×2 each | used heap | 11.3-11.4 MB | 13.4-13.5 MB | +2 MB, the ship's geometry. The bench's 39-42 MB readings (live 14-19) are the build's garbage before a collection |
| (measurement) Tests | `tools/test-title.mjs`; `tools/smoke.mjs` | | 41 of 41 pass; 6 of 6 | |
