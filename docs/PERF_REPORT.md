# Performance Report

## 2026-09-30: the overhaul build, measured end to end on the Intel UHD laptop

Same laptop as the section below (i5-1035G1, Intel UHD, 16 GB, installed Chrome, 1366×768), now on
the live overhaul build, with every cache empty including the graphics driver's shader cache.
`tools/startup-profile.mjs` measures New game → the Wren; `tools/journey-profile.mjs` plays the
whole game in order. Every change and rejected experiment is in docs/PERF_LOG.md; the plain-language
version is in docs/PERF_CHANGELOG_FOR_TEAM.md (19–23).

### What changed for a player

| Moment | Before (2026-09-29 build) | Now |
|---|---|---|
| End of the intro → walking in the Wren | 6.0 s loading bar (the Wren's shaders took 27 s, the intro 24) | **1.1–1.3 s** (quick shaders, 7–10 s; full ones swapped in during the tutorial) |
| New game → walking in the Wren | 38.0 s | **31.1 s**, the intro at 59.9 fps |
| The Wren on Auto, playing | a steady 30 fps | **~45–56 fps** at 85% resolution once the full shaders are in; a steady 30 until then |
| Cruise → MG2 cut | 0.47 s freeze | **33–59 ms** worst frame |
| Kethra cruise, skiff entering the atmosphere | 0.47 s freeze | **133–150 ms** worst frame |
| Leaving the Wren → walking in Vessek | 74 s (the docking title held ~24 s) | **50–54 s**, no hold; worst cruise frame 333 → 166 ms |
| Graphics memory aboard after both planets | 409 MB | **231 MB** (same as at boot) |

### What we found

- The Wren's frame on this laptop is per-pixel lighting: half the pixels saves 13 ms of ~27; the
  environment map is 16–28% of it, the point lights 9–17%, and all post-processing ~0.5 ms. Getting
  it faster without drawing fewer pixels would mean changing how the room is lit.
- Every freeze inside a cinematic that we traced was a shader made while you watched: something
  changed the light count or the fog after the scene had been prepared. `tools/cpu-profile-cut.mjs`
  names them.
- Level textures were never given back, so graphics memory grew through a session. That is the most
  likely cause of the one 7-second freeze seen when returning aboard after Kethra (not seen again in
  three full playthroughs today) and possibly of the one browser crash on the way to Vessek
  (2026-09-29; not reproduced since).

### Still open

- Kethra's heaviest views still end at a steady 30 on this laptop.
- The unrolled shaders take 15–35 s to compile in the background during the tutorial; a player who
  skips the tutorial reaches MG1 before they are in, and the second Wren picks the upgrade up again.

## 2026-09-27: measured on an Intel UHD laptop

The section after this one was measured on a desktop with an RTX 4060 and a throttled processor,
which cannot show what a weak graphics chip does. This pass used the target hardware itself: an
ordinary laptop with an Intel Core i5-1035G1 and **Intel UHD graphics**, 16 GB, installed Chrome,
1366×768 at device pixel ratio 1. The team reports school laptops are similar or a little faster.
Raw data: `docs/perf/igpu-before*/` and `docs/perf/igpu-after*/` (`tools/perf-frames.mjs`); every
change and every rejected experiment: docs/PERF_LOG.md. Runs on this laptop drift 10–20% as it
heats up, so single-change decisions used an A/B harness that alternates the two versions.

### What a player sees (Auto, vsync on, the camera turning a full circle)

| Scene | Before | After |
|---|---|---|
| The Wren | 16–20 fps; frames of 75–340 ms throughout | **30 fps, steady**: worst frame 35 ms, none over 50 ms |
| Kethra | 60 fps | **60 fps**, worst frame 18 ms |
| Vessek Anchorage | 58 fps | **60 fps**, worst frame 29 ms |
| Galaxy reveal | 60 fps, after a 2.6–5.5 s freeze on first play | **60 fps**, no freeze |

"Before" is the Continue path, which skips the start-up benchmark: the governor lowered the tier
mid-play, but mid-play steps leave Balanced's shadows and anti-aliasing on until the next level, so
the Wren stayed slow. On the new build the GPU name puts this laptop on Performance from the start.
The Wren runs at a steady 30 rather than 60 because facing its console costs ~31 ms of lighting maths
(see "Still open"); the other three directions run at 60, and a steady 30 beats a 30–60 swing.

### Loading, first visit (Auto, a fresh browser profile, two runs each)

| | Before | After |
|---|---|---|
| Title on screen | 1.7–1.9 s | 2.1 s |
| New game → intro playable | 52–54 s | 33–39 s |
| Skip the intro → the Wren playable | 31–33 s | 0.3 s |
| **New game → playing in the Wren** | **~85 s** | **~36 s** |

The old build guessed Balanced for this laptop, stepped down to Performance during the intro, and
rebuilt every shader at the handover to the ship. The new one starts on Performance and builds them
once. Intel's driver keeps its own shader cache between browser launches, so a truly first visit on
a fresh laptop is slower than this in both builds.

### Frame rate per tier (vsync off, steady state, mean over a full turn)

| Scene | Performance | Balanced | Quality |
|---|---|---|---|
| The Wren | 31 → **53** | 15 → **37** | 10 → **17** |
| Kethra | 45 → **62** | 21 → **59** | 13 → **25** |
| Vessek Anchorage | 47 → **72** | 24 → **54** | 17 → **25** |
| Galaxy reveal | 167 → **197** | 57 → **140** | 58 → 57 |

Quality is for desktops and recent laptops; Auto never picks it on this hardware.

### The first look around (worst single frame, first turn in each scene)

| Scene | Performance | Balanced | Quality |
|---|---|---|---|
| The Wren | 480 → 100 ms | 352 → 102 ms | 451 → 153 ms |
| Vessek Anchorage | 1,614 → 91 ms | 2,293 → 97 ms | 2,565 → 114 ms |
| Galaxy reveal | 2,641 → 32 ms | 5,439 → 41 ms | 5,477 → 53 ms |

With vsync off, the GPU queue itself produces occasional 90–150 ms intervals in steady state too;
with vsync on (the table above) the worst frames are 18–35 ms. What the first-look column shows is
the multi-second freezes gone.

### What moved the numbers, largest first
1. **Lights skip pixels they can't reach** (`src/core/shaderPatches.ts`): the Wren's Performance frame
   30.5 → 23.8 ms, with the image unchanged.
2. **FXAA instead of 4× MSAA on Balanced**: multisampling alone was 36% of a Balanced frame.
3. **The warm-up frame draws the whole scene, and scenes wait for their images**: the freezes above.
4. **Fewer draw calls and shader switches in the Wren**: instanced pieces and interaction targets now
   merge, opaque objects are grouped by shader. Facing the console: 520 → 377 draws, 215 → 84
   switches; a full turn on Performance averages 201 draws a frame, down from 348.
5. **Kethra paints its shadow map once**: about 170 draws and 310k triangles a frame on Balanced.
6. **Auto**: Intel UHD/HD and ARM graphics start on Performance (no second compile on a cold load);
   the benchmark re-measures after each step; a steady 30 per scene where 60 can't hold.

### What changed on screen
- **Performance:** nothing measurable. Five views of the Wren and five of the planets differ from the
  old build by 0.03/255 per pixel; two runs of the old build differ from each other by 0.02.
- **Balanced:** FXAA instead of multisampling. Mean 1.6/255, at edges and the smallest screen text.
- **Kethra:** the two Aiveth's shadows no longer follow their breathing and head turns.
- **Auto on a laptop like this one:** the Wren is held at 30 fps.
All three are listed in DECISIONS.md (D-25) with how to reverse them.

### Still open
- **Facing the Wren's console, ~31 ms per frame on Performance.** Timing each draw call showed no
  single expensive object: the cost is the lighting maths across many overlapping lights. Tested and
  rejected: normal maps off (−3%), half the lights (−8%, a visible change). Getting this view to 60
  would take simpler lighting in that room on Performance, which is the team's call on the look.
- **The real school laptop.** docs/TESTING_ON_A_REAL_CHROMEBOOK.md still applies (B-29).

---

## 2026-09-25: desktop RTX 4060 with a simulated slow processor

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
| Title on screen, simulated Chromebook | 2.0 s | 1.8 s | — |
| Bytes to the title | 0.45 MB | 0.52 MB | under 5 MB ✓ |
| New game → intro playable, cold browser, simulated Chromebook, Auto tier | 81.9 s | 60.1 s | 5 s ✗ |
| Same, pinned to the Performance tier | 66.6 s | 26.6 s | 5 s ✗ |
| Same, desktop, unthrottled, Auto (stays on Quality) | 65–69 s (this session's build before the light budget) | 32.8 s | 2 s local ✗ |
| Total bytes, a full loop with the cache off | 22.1 MB (2 levels) | 29.0 MB (3 levels + ending; 24.6 MB unique) | 20 MB ✗ |
| Heap, second loop through every level vs the first (after a forced GC) | +105% (no GC) | −8.1% (sim), −6.5% (Performance), −4.6% (desktop) | within 10% ✓ |
| Console errors across every run | 0 | 0 | 0 ✓ |
| **Second visit** (same browser, reload), desktop: title / intro playable | — | **0.19 s / 3.9 s** | 5 s ✓ |

Per scene, simulated Chromebook (final/chromebook-sim, tier chosen automatically; it chose
Performance):

| Scene | fps | p95 frame | Hitches >50 ms in 8 s | Draw calls | 30 fps met? |
|---|---|---|---|---|---|
| Intro | 60 | 16.7 ms | 0 | 18 | ✓ |
| The Wren | 16.2 | 116.6 ms | 67 | 655 | ✗ |
| Kethra | 35.0 | 50 ms | 3 | 195 | ✓ |
| Vessek Anchorage | 46.2 | 33.4 ms | 1 | 225 | ✓ |

Pinned to Performance with no network limit (final/low-tier): the Wren 22.8, Kethra 56.3,
Vessek 44.4 fps. On the unthrottled desktop every scene holds 60 fps at Quality with no hitches
(final/desktop). The same scene varies by several fps between runs on this machine, so treat
differences under ~5 fps as noise.

The Auto tier's cold start (60 s) is slower than pinned Performance (27 s) because it compiles the
Quality shaders first and then recompiles when the benchmark steps down. Running the benchmark on
a lighter scene before the ship is built would remove the double compile (next step, B-4).

## What moved the numbers
1. **The point-light budget** (the Wren kept its 16 strongest of 41 lights; 8 on Performance). Every
   light is written into every shader, so the first load compiled 93 very long shader programs.
   Cold boot on the desktop went from ~65 s to ~30 s with the room within about 2/255 per pixel.
2. **The start-up benchmark** now picks the tier from measured frames, not only from the GPU's
   name: on the simulated Chromebook it chose Performance before the first frame. Against the
   automatic run before it existed, Kethra went from 26 to 35 fps and Vessek from 22 to 46 fps.
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
  happens once: the browser keeps compiled shaders, and a second visit reached the intro in
  3.9 s (`tools/warm-load.mjs`). Before presenting, open the game once on the laptop you'll use.
  The loading screen shows real progress and a line of lore throughout.
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
