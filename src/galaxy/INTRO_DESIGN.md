# Intro — "Cold Start"

## Concept
A dead freighter hangs in deep space, visible only as the edge a distant star catches on its hull.
Then the ship boots: one wave of amber emergency light sweeps bow to stern through its viewports,
the big stern panels warm up, a glow settles into the crew section, and the engines cough three
times and die. That failure is the game's goal, and the player learns it before they ever move.
A diegetic reboot readout in the game's own amber-and-Rajdhani language confirms each system a
beat after the hull shows it.

## Length: 13.2 s of picture, then the existing 1.2 s fade (was 31.5 s)
- The story needs four beats (dark → wake → settle → the engines' failure), and 3–8 s can't
  hold them without cramming. The old 31.5 s spent 9 s on a static opening shot and ~10 s on a
  slow push.
- The intro also hides the ship interior's build (`GameFlow.pendingShip`). Measured on the dev
  machine: about 4–10 s of build and shader prep on a warm cache, 9–13.5 s on a cold one. At
  13.2 s the intro covers the warm case with margin and nearly all of the cold case. Anything
  left over lands behind the handover fade and loading overlay, which were already there.
- A shorter intro would just move that wait onto a black screen. A longer one makes every new
  player sit through dead air.

## Timeline (seconds on the scene clock; all values live in `TIMELINE` / `LEVEL` in IntroScene.ts)
Before the clock starts, a settle gate holds the opening shot (still sky, dark hull) until 20
steady frames arrive, capped at 3.5 s. The interior build's synchronous start (~2–2.5 s of
blocked main thread) lands on a frame where a freeze can't be seen, not mid-animation.

| t | Beat | What happens | Easing |
|---|------|--------------|--------|
| 0.0 → 13.2 | camera | One continuous arc-length move along a Catmull-Rom path: wide low stern quarter, trucking forward past the hull, settling into a 3/4 push on the lit viewport band | easeInOutSine over the whole path |
| 0.3 → 3.0 | anticipation | Rim light, fill light and IBL fade up, so the silhouette appears edge-first | easeOutCubic |
| 0.6 | | Skip hint | CSS |
| 2.6 | first sign of life | Port beacon's first blink + low tone | step |
| 3.0 | | Readout header "COLD START" rises in letter by letter; hairline rule draws | ease-out, 28 ms stagger |
| 3.4 | | Row: REACTOR · AUX POWER | ease-out |
| 3.8 → 7.0 | reveal | Emergency-light front sweeps the viewports bow to stern, per pixel on the GPU (see below), with a brief surge and a stutter only on its leading edge | easeInOutSine on the front |
| 4.6 | | Row: VIEWPORTS · ONLINE | |
| 6.2 → 8.0 | | Stern hex panels warm up, the hum starts, starboard beacon joins the port one | easeOutCubic |
| 7.2 → 9.6 | settle | Crew-section glow | easeInOutSine |
| 8.0 | | Row: LIFE SUPPORT · ONLINE | |
| 9.2 → 9.9 | the hook | Engines cough three times, each weaker: the bells' emissive plus a warm stern light (the bells face away from camera, so the light is what reads), with a low thud | decaying pulses, 160 ms each |
| 9.9 | | Row: ENGINES · OFFLINE (red) | |
| 11.6 | hand-off | Readout leaves bottom-up, then the header | ease-in |
| 13.2 | | `finish()` → GameFlow's fade to black → interior | |

Every overlap is deliberate: each readout row lands 0.4–0.8 s *after* the hull event it reports,
so the text confirms what the eye already saw instead of announcing it.

**Why the wave is a shader:** the freighter's viewports are ONE mesh spanning the hull, and so are
the engine rings, so staggering materials can't stagger anything. `addShipSpaceMask` adds a few
lines to this scene's own material clones: each pixel's position along the ship (via a
world-to-ship matrix uniform) is compared against a moving `uFront` uniform. The same hook clips
the engine-ring material to the bells at the stern. It adds one program, compiled in the warm-up
frame, and per frame it costs one matrix invert and three uniform writes.

## Color, light, type
- **Dominant:** cold blue-black. The sky is dimmed to 0.38 so the milky band stops reading as
  grey haze, the rim light is `#8fb4ff`, and the ambient is kept low.
- **Accent:** the game's amber (`--accent #d9a441`). Viewports glow `#ffb45a` for this scene
  only (emergency lighting; the reveal scene keeps its teal under normal power), plus the crew
  glow, the stern panels (held at 0.07 so they don't outshine the viewports) and the readout.
- **Warning:** a single red element, `--corrupt` lifted to `#d06a5c` so it reads at small sizes,
  only on "ENGINES OFFLINE".
- **Type:** Rajdhani 600, tracked wide, uppercase. The readout sits lower-left inside the
  letterbox safe area, sized with `clamp()` against viewport height (checked at 720p, 16:10,
  21:9 and 4K).
- **Depth:** four layers. The equirect sky (far), two procedural starfields (mid), a sparse near
  dust layer the camera trucks through (parallax), then the hull.

## Performance budget (low tier = the reference low-end target)
Measured in Chrome at 1920×1080 on the dev machine (RTX 4060). The low-tier row adds 4x CPU
throttling as a stand-in for a weak laptop. No integrated-GPU hardware was available, so GPU
cost on a UHD 620 class part is an estimate from draw/triangle counts, not a measurement.

| Item | Budget | Result | Why it fits |
|------|--------|--------|-------------|
| Frame time, low tier, 4x CPU | ≤16.6 ms, no spike >33 ms | p50 16.7, p99 18.9–21.5 ms; one ~150 ms spike (see below) | Scene is 18 draw calls and 47k triangles on low |
| Frame time, high tier | same | p50 16.7, p99 17.5–17.8 ms | 31 draw calls including bloom |
| Draw calls | ≤25 on low | 18 | Dust reuses the starfield's PointsMaterial config, so it shares that program |
| Programs | no mid-sequence compile | 12 on low, 20 on high, all built in the warm-up frame; program and texture counts logged per frame never changed during the sequence | Every light exists from frame 0 (intensity 0); only uniforms change after that |
| Full-screen post | ≤1 cheap pass on low | Low: grade + output (bloom/AO off) | Both are single-texture-read ALU passes; output is the required tonemap + sRGB step. Merging them would mean editing the shared pipeline every scene uses |
| Particles | hard cap | Dust: 90 on low, 220 on high, static buffer | No per-frame CPU work; motion comes only from the camera (parallax) |
| Sky texture | no 4K on low | 4096×2048 on high, 2048×1024 on low | Loaded in `init()`, so decode, cubemap conversion and upload land in the warm-up frame behind the loading overlay (the old async load hitched the intro at 5.4 s) |
| Fonts / audio | no first-use hitch | `displayFontsReady()` awaited and `AudioSystem.prepare()` called in `init()` | The lazy AudioContext used to cost ~30–50 ms on the first beacon tone |
| Per-frame allocation | 0 | Scratch vectors, a shared matrix uniform, index-pointer beat cues | |

**Known remaining spike:** about 40–50 ms (about 150 ms at 4x throttle), once, when Chrome finishes
the document load (trace: `ResponseBodyLoader::DidFinishLoadingBody`, next to the favicon
request). It isn't intro code, and when it lands depends on the network.
