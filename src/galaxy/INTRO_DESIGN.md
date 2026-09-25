# Intro — "Cold Start"

## Concept
The survey freighter *Wren* crosses the dark with its lights on and engines warm. Then the sky
goes white (light from everywhere at once, exactly as the last travel log describes), and every
system on the hull dies. The ship drifts, cold. Then it boots: the port beacon blinks, a wave of
amber emergency light sweeps the viewports bow to stern, the stern panels warm, a glow settles
into the crew section, and the engines cough three times and die. That failure is the game's
goal. Four short lines of exposition ride those beats, one at a time, so a first-time player
finishes knowing where they are, what went wrong, and what to do.

## Length: 24.1 s of picture, then the existing 1.2 s fade
*History: 31.5 s originally, 13.2 s after the first rework, 24.1 s now.*
- **Why longer than 13.2 s:** the exposition needs reading time. Each line is on screen for
  2.5 s + 0.35 s per word (about three words a second while the eye also follows the motion).
  Four lines of 9, 9, 10 and 8 words come to 22.6 s, plus 0.3 s gaps and a 0.6 s lead-in.
  That is under the 25 s ceiling.
- **Why four lines, not three or six:** background (where, why), event (what happened), status
  (what still works), goal. Each answers one of the three questions a first-time player needs,
  and the goal gets its own line so it's the last thing read.
- **What the extra time bought visually:** the white-sky event itself. The old intro started on
  an already-dead ship; now the player sees it die, so the reboot and the engines' failure mean
  something.

## Timeline (seconds on the scene clock; all values in `LINES` / `TIMELINE` / `LEVEL` in IntroScene.ts)
The clock starts only once the scene is fully ready and frames are steady (see *Loading* below).

| t | Beat | Picture | Text (one line at a time) |
|---|------|---------|---------------------------|
| 0.0 → 1.6 | anticipation | Rim and fill light find the running ship: teal viewports, warm engines, blinking beacons. Camera begins one continuous Catmull-Rom move from the wide stern quarter (easeInOutSine over the whole 24.1 s). | |
| 0.6 → 6.25 | background | Slow truck past the running ship; dust parallax | "Day 23 past the Kessic Drift, hunting lost ships." |
| 6.4 → 8.8 | **the white sky** | Pale shell swells behind the ship (rise 0.5 s easeOut, hold 0.3 s, fall 1.6 s), ambient floods the hull, and every system stutters out under it | |
| 6.55 → 12.2 | event | The dead hull drifts, lit only by the rim | "Then the sky went white. The Wren went dark." |
| 12.2 | first sign of life | Port beacon's first blink + low tone | |
| 12.5 → 18.5 | status | 13.0 amber emergency front sweeps the viewports bow to stern (easeInOutSine, 3.2 s); 15.4 stern panels warm + hum; 16.4 crew glow (easeInOutSine, 2.4 s); **17.6 engines cough three times and die**, just as the reader reaches "No engines" | "Emergency power only. No engines, no charts, no familiar stars." |
| 18.8 → 24.1 | goal | Camera settles into the push on the lit crew band | "Get the Wren flying. Find the way home." (accent colour) |
| 24.1 | hand-off | `finish()` → GameFlow's fade to black → interior | |

**Text rules, enforced in code:** each line's hide time is computed from its own word count
(`readSeconds`), so rewording a line in `src/content/strings.ts` retimes it automatically.
`tools/intro-check.mjs` checks one-line-at-a-time, word counts (at most 12 per line, 36 total
against a 70 limit) and on-screen time on every run.

**Text motion:** words rise in with a 45 ms stagger (ease-out), an amber rule draws in above the
line, and the line leaves by easing out upward (ease-in). That is the same easing family as the
picture's entrances and settles. A soft radial scrim in the lower-left guarantees contrast over
anything, including the white-sky beat, without slowing the animation.

## Color, light, type
- **Dominant:** cold blue-black. The sky is dimmed to 0.38 so the milky band stops reading as
  grey haze, the rim light is `#8fb4ff`, and the ambient is low.
- **Accent:** the game's amber (`--accent #d9a441`). The viewports run teal under normal power,
  then answer in `#ffb45a` emergency amber after the reboot; the crew glow, the text rule and the
  goal line are also amber.
- **Event colour:** the white sky is a pale blue-white (`#eef3ff`), the only time the frame goes
  light.
- **Type:** Rajdhani 600, sentence case, 2.7 vh (clamped 18–48 px), lower-left inside the
  letterbox picture area. Checked at 1280×720, 1024×768 (4:3), 1440×900 (16:10), 1920×1080,
  2560×1080 (21:9) and 3840×2160.
- **Depth:** four layers. The equirect sky (far), two procedural starfields (mid), a sparse near
  dust layer the camera trucks through (parallax), then the hull.

## Loading
The ship interior (~93 shader programs) is built, compiled and first-drawn **before** the intro's
clock starts, under the loading overlay (`GameFlow` + `Engine.prewarmScene`). It used to build
behind the intro to overlap the wait. On a cold shader cache that froze the intro's opening frame
for ~11 s, and the interior's first draw still stalled at the handover. The total wait is the
same; it now happens where the loading screen (with rotating lore lines) says so, and the intro
plays uninterrupted. Skip is ignored until the clock starts, so it can't trigger a second
interior build.

## Performance budget (low tier = the reference low-end target)
Measured with `tools/intro-check.mjs` on the production build, Chrome, 1920×1080, on the dev
machine (RTX 4060). The low-tier row adds 4x CPU throttling as a stand-in for a weak laptop. No
integrated-GPU hardware was available, so GPU cost on a UHD 620 class part is an estimate from
draw/triangle counts, not a measurement.

| Item | Budget | Result | Why it fits |
|------|--------|--------|-------------|
| Frame time, low, 4x CPU | ≤16.6 ms, no spike >33 ms | p50 16.7, p95 18.2, p99 32.7 ms, no long tasks | 18 draw calls, 47k triangles |
| Frame time, low, 1x CPU | same | p50 16.7 ms, no long tasks; scattered 34–66 ms frames | These land at different beats run to run with no main-thread work behind them, matching this machine's measured vsync jitter, not intro content |
| Draw calls | ≤25 on low | 18 (+1 for the white shell during its 2.4 s) | Dust shares the starfield's program; the shell is hidden outside its beat |
| Programs | no compile mid-sequence | all built in the warm-up frame | Every light exists from frame 0 (intensity 0); only uniforms change after that |
| Full-screen post | ≤1 cheap pass on low | Low: grade + output (bloom/AO off) | Both are single-texture-read ALU passes; output is the required tonemap + sRGB step |
| Particles | hard cap | Dust: 90 on low, 220 on high, static buffer | No per-frame CPU work; motion comes only from the camera |
| Sky texture | no 4K on low | 4096×2048 on high, 2048×1024 on low | Loaded in `init()`, so its upload lands in the warm-up frame behind the overlay |
| Fonts / audio | no first-use hitch | `displayFontsReady()` awaited and `AudioSystem.prepare()` called in `init()` | The lazy AudioContext cost ~30–50 ms on the first tone |
| Per-frame allocation | 0 | Scratch vectors, a shared matrix uniform, index-pointer beat cues, text elements pre-built in `init()` (the update path only toggles classes) | |
