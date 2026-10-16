# Title screen — "Sunrise over Kethra"

## Concept
The first thing a judge sees: sunrise over Kethra's limb, seen from inside the belt the planet
orbits (LORE.md: "first orbit past the belt"), with Isilthe's rings over the horizon. On the left,
the KETHRA wordmark under "Deep-space exploration", and the four menu buttons.

Screens: `docs/screens/title/` (1920×1080, 1366×768, 390×844, the opening at 1 s, Settings).

## How it is built
Two layers, so the menu never waits for 3D:

| Layer | Files | What it does |
|---|---|---|
| Menu (DOM, CSS) | `src/ui/TitleScreen.ts`, `src/style.css` (Title screen section) | Kicker, wordmark (one SVG path) with its orbit ring, four buttons, the opening, input, audio. Up and clickable ~0.3 s after load, over its own CSS starfield. |
| Backdrop (three.js scene) | `src/galaxy/title/` | Drawn by the engine like any scene, behind the menu; disposed by `Engine.setScene` when the player picks. |

Backdrop modules:

| File | Contents |
|---|---|
| `TitleScene.ts` | Composition, camera, reveal timeline, idle motion, the exit. |
| `heroPlanet.ts` | Kethra up close: the real day, night and cloud maps plus baked detail at three scales (sunlit relief, a palette of greens from lowland forest to pale terraces, lakes with a sun glint, cloud edges and cloud shadows cast toward the terminator, the canopy's teal night glow), under an analytic scattering atmosphere kept light over the disc so the canopy reads green. |
| `titleSky.ts` | Galactic band and nebula baked once to a "sky card", three star layers. |
| `asteroids.ts` | 16 belt rocks (craters, ridges, cavity shading, the lichen_rock maps mapped three ways, sun rims), one draw, turned on the GPU. |
| `skyFx.ts` | Sun core and lens rays, three faint ghosts, occasional meteor, near-field dust, the exit veil. |
| `bake.ts` | One-off GPU bakes (detail noise sheet), compiled in the background and drawn in strips. |

Everything draws with its own shaders: no scene lights, no environment map, about a dozen small
programs. Reused from the game: the planet maps and `buildPlanetInstance` (Isilthe), the lichen_rock
maps, the post chain (bloom on Quality, glow pass below it), a new `title` colour grade, the
synthesized audio (`AudioSystem`: the existing `title` music bed, hover and click sounds, and a new
`playLaunch`). No new asset files.

## Composition (tune in `COMPOSITION` and `ROCKS`, TitleScene.ts)
Authored as screen fractions of a 16:9 frame and solved into world space at build:
- Kethra's limb is the circle through three screen points; the planet's centre and size follow.
- The sun sits just outside the limb at `sunAt`. The light that shades the planet and the rocks is
  turned toward the camera by `lightTowardCamera`: with the true sun direction the whole disc would be
  night (correct, and a black picture). At 0.42 the terminator runs diagonally, day upper right, the
  canopy's teal night glow toward the menu.
- Rocks: a screen point, a distance and a size each.
- Narrower windows turn the camera so the right of the picture stays in frame; very narrow ones also
  widen the field of view (`frame()`).

## The opening (≈2.5 s; any key or click finishes it)
Menu, from page load: stars → kicker (0.15 s) → wordmark (0.3 s) → orbit (0.6 s) → buttons one by one
(1.0–1.3 s). Opacity and translate only, which the compositor runs without repainting (see
Performance).

Backdrop, from its first frame (`REVEAL`): stars, nebula, planet surface, atmosphere rim, rocks,
sunrise glare with a slight swell, dust. On this laptop the backdrop arrives ~2.7 s after load, so the
world fades in behind a menu that is already usable; on a desktop GPU it is ~1 s.

## Always moving, never busy
Kethra turns (~1 turn per 95 min) with clouds shearing over it and their shadows moving with them;
rocks tumble and drift; dust drifts past; the camera drifts and leans a little toward the pointer; a
meteor every 9–20 s. On the menu, once the backdrop has settled (`ts-live`): a light sweep across the
wordmark every 9 s, a point of light running the orbit every 7 s and flaring at the A's foot, light
running along the edges of the selected button. Moving through the menu swells the sunrise briefly.

Reduced motion (Settings or the OS): no camera drift or pointer lean, no meteors, no loops on the
menu, short fades.

## The buttons
A console strip: a hairline hexagon brightest toward its two points, a glass fill with faint
scanlines, a highlight along the top, the icon in a diamond socket, three signal ticks. Selected (mouse
hover and keyboard focus are one state): the edge blazes cyan, a lit cap appears beyond each point, the
fill lights from the left, light runs along the top and bottom edges, a sheen crosses once, label,
socket and ticks glow, and the strip steps right with its chevron; keyboard focus brightens the edge
further. Pressed: a brightness flash and a slight squeeze. Disabled: dimmed, no glow, with the reason
under the label. Arrow keys or W/S move, Home/End jump, Enter/Space pick. Focus returns to Controls or
Settings when their panel closes; those panels take the title's palette while it is up.

## Behaviour kept
- Continue resumes the save exactly as before. Without a usable save it is shown disabled with the
  reason ("No saved journey yet" / "The saved journey could not be read") instead of hidden.
- New game: unchanged (fresh start, or a clean reboot with `?newGame=1` when a save was loaded; there
  was and is no overwrite prompt).
- Controls prints `src/content/controls.ts`; Settings is the game's one settings panel.
- Test and capture flags (`?newGame`, `?skipIntro`, `?jump`…) skip the title as before.

## Performance (Intel UHD i5-1035G1, cold profile; docs/PERF_LOG.md, 2026-10-16)
- Steady 60 fps on Performance and Balanced at 1366×768 and 1920×1080 (median 16.6 ms, p95 ≤ 17 ms,
  no frame over 20 ms). Quality (4× MSAA, full bloom) runs ~30 fps here, as the rest of the game does;
  Auto picks Performance on this class of GPU.
- Start-up as before: buttons ~0.3 s, engine creation ~50 ms, New game → intro unchanged (A/B).
- Bakes: compiled with `compileAsync` and drawn in strips; loop bounds are uniforms so Direct3D keeps
  them as loops (compiled on the spot and unrolled, one cost a 1.9 s frozen page).
- Hashes are sine-free: `sin()` of large arguments loses precision under ANGLE/D3D and showed as blocks.
- The menu animates only opacity and translate during start-up, and its loops wait for `ts-live`. An
  animated blur, a stroke being drawn, an SVG part turning and two screen-sized star layers fading had
  kept the GPU process busy and stretched the engine's creation from ~50 ms to ~500 ms.
- The title is not judged by the runtime quality governor (`GameScene.governed = false`): a step-down
  judged on it would follow the player into the Wren.
- Leaving disposes everything the title made (render targets, geometry, materials); shared maps are
  released by the engine.

## Testing
`node tools/test-title.mjs <base>`: 35 checks (buttons, both save cases, keyboard and mouse,
panels and focus, a quality change from the title, New game, Continue, reduced motion, skip, an early
click). `node tools/title-bench.mjs <label> <base>`: start-up, title frame pacing and click to scene,
written to `docs/perf/<label>/`.
