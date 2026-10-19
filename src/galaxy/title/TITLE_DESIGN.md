# Title screen — "A cruiser over Kethra at sunrise"

## Concept
The first thing a judge sees: a survey cruiser on four blue engines, banked toward us, flying over
Kethra's day side as the sun rises on the limb, inside the belt the planet orbits (LORE.md: "first
orbit past the belt"). Isilthe's rings rise over the horizon, a small grey moon hangs off the limb,
rocks drift past. On the left, "A deep-space survey" over the KETHRA wordmark, the tagline, and the
four menu buttons; small labels in three corners. Composition after the user's reference image of
2026-10-16 (second pass that day).

Screens: `docs/screens/title/` (1920×1080, 1366×768, 1280×1024, 390×844, the opening at 1 s,
Settings).

## How it is built
Two layers, so the menu never waits for 3D:

| Layer | Files | What it does |
|---|---|---|
| Menu (DOM, CSS) | `src/ui/TitleScreen.ts`, `src/style.css` (Title screen section) | Kicker, wordmark (one SVG path) with its orbit ring, tagline, four buttons, corner labels, input, audio. Held back (inert, drawn at 1/255 opacity) until the backdrop's first frame, then comes in with it. |
| Backdrop (three.js scene) | `src/galaxy/title/` | Drawn by the engine like any scene, behind the menu; disposed by `Engine.setScene` when the player picks. |

Backdrop modules:

| File | Contents |
|---|---|
| `TitleScene.ts` | Composition (`COMPOSITION`, `SHIP`), the ship's way in (`FLIGHT`), the rock fields' tuning (`LARGE_ROCKS`, `DEBRIS`), camera, motion, the exit. |
| `titleShip.ts` | The cruiser, built in code: lofted chamfered sections (keel hull, spine, bridge, stepped bow plates, two rounded nacelles with two engines each, booms past the engines, a ventral pod, greebles), one merged flat-shaded mesh. A panel sheet baked on the GPU (random plate splits, grooves, vents, raised blocks, bolt rows, lit ports), box-projected in ship space and read as bump. Shading: key from the sunrise's side (raised), the sun's rim, a cool fill from our side, Kethra's bounce, the engines' blue on the stern, reflections of an analytic sky. Engines: glowing throats, a camera-facing glow per bell, plumes as ribbons turned to the camera with streaks flowing out of the nozzle; plumes and glows are one additive draw. |
| `heroPlanet.ts` | Kethra up close: the real day, night and cloud maps plus baked detail at three scales. Elevation from the map's brightness (read softened through a warp) plus the detail's relief, so coastlines are the noise's, fractal and sharp: seas in the lowest fifth or so, greens from coastal canopy to pale terraces, a sun glint and sheen on the water, clouds with their shadows (softened edge-on near the limb), the canopy's teal night glow. An analytic scattering atmosphere over it. Also the small moon (`buildMoon`). |
| `titleSky.ts` | Galactic band and nebula baked once to a "sky card", three star layers. |
| `asteroids.ts` | Belt rocks (noise, ridges, fracture planes for broken faces, craters, cavity shading, the lichen_rock maps mapped three ways, sun rims) in chunky, elongated and angular shapes. A pool of 12 large rocks, one draw placed from per-rock uniforms that one controller moves and recycles; 12 small instanced rocks (10 on low; about 10 on screen, ~15 rocks in all with the large ones) drifting and wrapping on the GPU. |
| `skyFx.ts` | Sun core and lens rays, three faint ghosts, shooting stars (MeteorOptions), near-field dust, the exit veil. |
| `bake.ts` | One-off GPU bakes (detail noise sheet), compiled in the background and drawn in strips. |

Everything draws with its own shaders: no scene lights, no environment map, under twenty small
programs (25 in the renderer with the post chain's). Reused from the game: the planet maps and `buildPlanetInstance` (Isilthe and its ring), the
lichen_rock maps, the post chain (bloom on Quality, glow pass below it), the `title` colour grade, the
synthesized audio (`AudioSystem`: the `title` music bed, hover and click sounds, `playLaunch`). No new
asset files.

## Composition (tune in `COMPOSITION`, `SHIP` and `ROCKS`, TitleScene.ts)
Authored as screen fractions of a 16:9 frame and solved into world space at build:
- Kethra's limb is the circle through three screen points (a flat arc, as in the reference); the
  planet's centre and size follow.
- The sun sits just outside the limb at `sunAt`. The light that shades the planet and the rocks is
  turned toward the camera by `lightTowardCamera`: with the true sun direction the whole disc would be
  night (correct, and a black picture).
- The ship: a nose point and a stern point at two distances set its heading and its size; `roll`
  banks it about its own long axis. Its two engine pairs land where the reference has them.
- Isilthe is half set behind the limb, turned half about the line of sight so its rings are seen from
  above, opened by about a third and rising a little to the right.
- Large rocks stream rightward along the bottom of the frame, their tops below `bandTop` (under the
  menu and the plumes); their first layout keeps clear of the ship's way in.
- Narrower windows turn the camera so the right of the picture (planet and ship) stays in frame;
  very narrow ones also widen the field of view (`frame()`). Squarer windows get a deeper shade behind
  the menu, since the limb then lies behind the wordmark.

## Arrival: no staged opening
Everything comes in together. Until the backdrop's first frame the page shows only a stand-in sky
(deep blue, a few stars, a teal glow low on the right where Kethra will be); then, in one moment, the
stand-in dissolves into the backdrop (0.6 s) and the menu fades in as one piece (0.45 s, opacity and
translate only). Nothing on it is on a timer: no stagger, no loops, no light sweeps. The backdrop is
complete from its first frame. On this laptop that happens ~2.2-2.5 s after load; on a desktop GPU
~1 s. If the backdrop fails, or has not come within 9 s, the menu comes in over the stand-in alone.

While it waits, the menu is drawn at 1/255 opacity (invisible) and inert, on GPU layers of its own
that it keeps: its glows compile their blur shaders on first draw, and drawn first at the reveal they
froze the fade for 0.6-0.8 s; a layer made for the fade and dropped after it repainted the menu, a
0.2 s frame in the middle of the ship's entrance.

What used to happen, and why it read as lag: the 3D arrived ~3-4.4 s after load and then built itself
up in eight staggered fades over another 2.5 s (stars, nebula, planet, rocks, atmosphere, worlds,
glare with a swell, dust), while the menu's own opening brought its buttons in only after ~1-2 s.

What runs while the title waits (boot.ts): the engine (~0.6 s after the menu shows), the backdrop's
preparation and, alongside it, the downloads the game's first scene needs, then the environment map.
All of it is done before the backdrop's first frame (the map 0.8-1.2 s before it), so nothing decodes
or compiles with the backdrop on screen. Measured, the other orders were worse: the prefetch decoding
models and textures with the backdrop on screen dropped 5-6 frames of 120-150 ms right through its
arrival, and the environment map made once the backdrop was up put 1-3 frames over 50 ms on it in
most runs. The map used to wait for the backdrop because, made alongside it, it doubled the
backdrop's bakes; that was its GGX filter's unrolled compile, gone since 2026-10-17 (Environment.ts).
Made alongside now, it costs the backdrop's first frame ~0.1-0.3 s (docs/PERF_LOG.md, 2026-10-17).

## Always moving, never busy
Kethra turns about once in 12 minutes, so the ground visibly runs back under the ship within ten or
twenty seconds; the clouds shear a little on top. The ship flies in once per page, 2 s after the reveal (the galaxy
alone first): from behind the camera off the right edge, curving in from the side, flat out at 60
units/s until its last 9 units, then braking on exp(-t / 0.15 s), so it dashes across the frame and
stops all but dead; plumes full through the dash and 0.35 s into the braking, then fading out over 0.6 s, then drifting on toward the planet at 0.2 units/s (easing off over minutes) with a
slow heave; a later visit or reduced motion starts it drifting. Large rocks cross the frame in 26-60 s
(~30-70 px/s at 1600 wide) and are dealt a new pass from the left once they leave; small rocks (rounded
pebbles: at a few pixels, cut and stretched shapes read as metal shards) drift at 9-25 px/s in seeded random directions, nearer ones faster, and spin. Dust drifts past; the camera drifts
a little, showing the depth between rocks, ship and planet; a shooting star about every 10 s (first at
5 s) in the top-left sky over the wordmark, bright but thin and behind every planet, so it reads as far off. Every motion runs on elapsed time, so its speed is the same at any frame
rate. Nothing follows the pointer or answers the menu.

Reduced motion (Settings or the OS): the camera holds still, no meteors, the menu simply appears.

## The buttons
A hairline hexagon round a glass fill, the icon, the label. Selected (mouse hover and keyboard focus
are one state): the edge turns bright cyan and glows, the fill lights from the left, the strip steps
right and its chevron shows, all within 0.2 s; keyboard focus brightens the edge further. Pressed: a
brightness flash and a slight squeeze. Disabled: dimmed, no glow, with the reason under the label.
Arrow keys or W/S move, Home/End jump, Enter/Space pick. Focus returns to Controls or Settings when
their panel closes; those panels take the title's palette while it is up.

## Behaviour kept
- Continue resumes the save exactly as before. Without a usable save it is shown disabled with the
  reason ("No saved journey yet" / "The saved journey could not be read").
- New game: unchanged (fresh start, or a clean reboot with `?newGame=1` when a save was loaded).
- Controls prints `src/content/controls.ts`; Settings is the game's one settings panel.
- Test and capture flags (`?newGame`, `?skipIntro`, `?jump`…) skip the title as before.

## Performance (Intel UHD i5-1035G1, cold profile; docs/PERF_LOG.md, 2026-10-16 and 17)
- Title frame pacing as before: ~60 fps on Performance and Balanced (median 16.7 ms, p95 ~17 ms).
  Quality (4× MSAA, full bloom) ~30 fps here, as in the rest of the game; Auto picks Performance.
- Start-up: the menu shows from ~0.4 s and is fully in by ~0.8-0.9 s (the buttons used to arrive
  at ~1-2 s); the backdrop at a median of
  ~3.0 s, as before, with a ship, a moon and a third bake added. The environment map is made alongside
  its preparation and holds its first frame back ~0.1-0.3 s (see above). New game → intro and
  Continue → the Wren unchanged.
- The ship is one mesh (13.4k triangles) and one 88-triangle additive draw for its plumes and glows;
  its panel sheet is a 512² bake. The 12 large rocks are one draw; the small rocks three instanced
  draws of 320 triangles each.
- Bakes: compiled with `compileAsync` and drawn in strips; loop bounds are uniforms so Direct3D keeps
  them as loops. Hashes are sine-free (`sin()` of large arguments loses precision under ANGLE/D3D).
- The title is not judged by the runtime quality governor (`GameScene.governed = false`).
- Leaving disposes everything the title made (render targets, geometry, materials); shared maps are
  released by the engine.
- The environment map's long frame just after the dissolve (83-383 ms, in every run) is gone: it was
  the map's first GGX draw waiting on that filter's unrolled compile, and the loop bound is now a
  uniform (Environment.ts, `keepSampleLoop`, 2026-10-17); the map is also done before the backdrop
  shows.

## Testing
`node tools/test-title.mjs <base>`: 39 checks (buttons, both save cases, keyboard and mouse, panels
and focus, a quality change from the title, the ship, moon and rocks in the scene, the planet turning
by itself, nothing looping on the menu, the menu up and answering keys before the backdrop, reduced
motion holding the camera still, New game, Continue, an early click). `node tools/title-bench.mjs
<label> <base>`: start-up, title frame pacing and click to scene, written to `docs/perf/<label>/`.
