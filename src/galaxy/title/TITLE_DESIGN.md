# Title screen — the ship over Kethra (and the astronaut by Isilthe, kept)

## Which one
Every player sees **Kethra at sunrise**: the capital ship dashes in over Kethra's day side, Isilthe's
rings over the horizon (`kethraTitle.ts`, `KethraTitleScene`, with `heroPlanet.ts` and
`titleShip.ts`), with or without a save. It is the title that was live until 2026-10-22, unchanged;
its design notes are in git history (this file at overhaul 0bcce10).

**Looking out at Isilthe** (the astronaut resting on a rock before the ringed moon, `TitleScene.ts`,
described below) was shown to returning players from 26a55a9 and taken off on 2026-10-22 at the user's
call. It is kept, working and tested, for use elsewhere: the URL flag `?title=isilthe` shows it
(`pickBackdrop` in `src/ui/TitleScreen.ts`). A later, unfinished rework of it (a sculpted astronaut
baked from a distance field, a slim pillar, a bigger planet) is parked on the local branch
`wip/title-astronaut-sculpt`.

Only the picked module is downloaded, preloaded and built. Both report `kind = 'TitleScene'` to the
engine and tests; only Isilthe's has the signal (`onSignal`). The rock shader both use keeps the
Kethra scene's look by default (`RockLight`: albedo, rim colour, fill); the Isilthe scene passes its
own.

## "Looking out at Isilthe": concept
A surveyor in an EVA suit, resting on a rock in the belt and looking
out at Isilthe, the ringed ocean moon at the edge of the system (LORE.md), backlit by its sun. The
planet is a dark disc with a bright rim and an amber glow on its sun side, its rings sweep across the
sky, rubble orbits in the ring plane, rocks frame the edges and drift through the middle distance.
The menu (unchanged: kicker, wordmark, tagline, four buttons, corner labels) holds the left third.
Composition after the user's reference image of 2026-10-22 (the menu in that image was not copied:
the user wanted the existing buttons kept).

## How it is built
Two layers, so the menu never waits for 3D:

| Layer | Files | What it does |
|---|---|---|
| Menu (DOM, CSS) | `src/ui/TitleScreen.ts`, `src/style.css` (Title screen section) | Kicker, wordmark, tagline, four buttons, corner labels, input, audio. Held back (inert, drawn at 1/255 opacity) until the backdrop's first frame, then comes in with it. |
| Backdrop (three.js scene) | `src/galaxy/title/` | Drawn by the engine like any scene, behind the menu; disposed by `Engine.setScene` when the player picks. |

Backdrop modules:

| File | Contents |
|---|---|
| `TitleScene.ts` | Composition (`COMPOSITION`, `PERCH`, `FRAME_ROCKS`, `FRAMING`), the drifting rocks' tuning (`DRIFT_ROCKS`, `DEBRIS`), meteors, the signal (`SIGNAL`), the camera (`CAMERA`: drift, pointer lean, push-in on leaving), the lights, the exit. |
| `ringworld.ts` | Isilthe: the surface (its map under the detail sheet, turning about the rings' axis, a haze layer drifting at its own rate, the rings' shadow, the amber crescent and limb haze, teal ringshine on the hemisphere facing the lit rings); the atmosphere (a shell, two analytic forward-scattering layers: a hairline rim and a cyan halo); the rings (one annulus 1.32-4.4 radii, radial structure from a 2048-texel CPU-made profile, streaks from the detail sheet, each radius turning at its own Kepler rate, slow spokes and a swell, the planet's shadow, the far side hidden by depth); rubble on its own orbits in the ring plane (one instanced draw). |
| `astronaut.ts` | The figure, built in code: tubes along the bones with elliptical sections and accordion folds at the joints, armour plates laid on those tubes with bevelled, worn rims, superellipsoid boots, gloves, pack and caps, a helmet with a lime trim and a gold visor. Baked analytic occlusion (capsule stand-ins). Six rigid bones: breathing, shoulders following half way, a slow look about, hands swaying, a chest lamp blinking. Its shader reflects an analytic sky (the planet's disc and rim, the ring band). |
| `formations.ts` | The ledge (a seat cut flat at y = 0, a step for the boots) and the framing rocks, belt-rock shapes with chosen fracture planes, merged into one static draw, with the figure's contact shadow and occlusion. |
| `asteroids.ts` | The rocks' shapes and shader (shared by every rock): the drifting pool (dealt new passes out of sight), the pebbles (GPU-wrapped), plus the orbit and static vertex shaders used by `ringworld.ts` and `formations.ts`. Light colours, fill and rim gain are options. |
| `embers.ts` | Warm sparks drifting up through the right of the picture, each flaring now and then (one Points draw). |
| `titleSky.ts` | Galactic band and nebula baked once to a "sky card", three star layers. |
| `skyFx.ts` | Shooting stars, near-field dust, the exit veil (its sun glare is off: the sun is behind the planet). |
| `bake.ts` | The detail noise sheet, compiled in the background and drawn in strips. |

Everything draws with its own shaders: no scene lights, no environment map. Reused from the game:
Isilthe's map, the lichen_rock maps, the post chain and `title` grade, the synthesized audio (title
music bed, hover and click, `playLaunch`, and a new very quiet `playSignal`). No new asset files.
`heroPlanet.ts` and `titleShip.ts` serve the Kethra backdrop (`tools/capture-title-ship.mjs` inspects
its ship; open the title without a save).

## Composition (TitleScene.ts)
Authored as screen fractions of a 16:9 frame plus distances, solved into world space at build:
- Isilthe's centre at (0.69, 0.36), 10.5° in radius. Its rings are opened 25° toward us (the near side
  crosses the lower disc, the far side arches over the top) with the long axis rising 17° to the right.
- The sun is behind the planet, offset down and left: a thin amber crescent and haze on that side,
  the bright rim all round.
- Near things (figure, ledge, framing rocks) share a cool key from the right (the ring arc's light),
  a cyan rim from the planet's side, a warm bounce from below and a dim blue fill. Rubble by the
  planet is lit by the real sun from behind: silhouettes with rims against the rings.
- The figure's seat at (0.445, 0.705), 4.4 units away, facing 62° to the right.
- Other windows (`FRAMING`): the span from the figure's pack to the planet's far limb has to fit
  between the menu column's edge (~37% of the width) and the right edge; squarer windows open the
  field of view (5:4: 45°) and turn left until the figure clears the menu. Portrait windows use the
  old rule (wider view, turned toward the planet).

## Always moving
All on elapsed time, the same at any frame rate, nothing on a loop the eye can catch:
- Isilthe turns once in ~7 minutes (0.015 rad/s); its haze drifts ahead of the bands.
- The rings shear: each radius turns at its Kepler rate (0.02 rad/s at 2 radii, faster inside);
  spokes drift at their own rate; the light swells a few percent on two unrelated periods.
- Rubble orbits in the ring plane, passing behind the disc and across it.
- Twelve rocks drift in from the left and down across the frame in 32-110 s, dealt new passes once
  out of sight; pebbles tumble and wrap; sparks drift and flare; dust streams past.
- A shooting star about every 10 s (first at 6 s) in the open sky above the planet.
- The astronaut breathes (~4.6 s), looks about slowly, the hands sway, the chest lamp double-blinks.
- The camera drifts a few centimetres and leans toward the pointer (0.06 units and 0.6° at the
  window's edge, on a 0.6 s lag).
- Isilthe's signal (lore: the Choir transmits on a cycle): first at 11 s, then every 18-28 s, a faint
  front runs out through the rings and the corner scope picks it up (a ring swells out of it,
  "Signal // Isilthe" shows for two seconds, a quiet chirp once sound is on).

Reduced motion (Settings or the OS): the camera holds still, no lean, no meteors, the figure sits
still, no button sweeps or scope pulse; the world keeps turning.

## The buttons
Unchanged look. Added: on selection a thin light runs once along the edge, and a soft glint crosses
the lit fill a beat later (both a band in the shapes' own background, slid by background-position);
the Controls and Settings panels draw a thin accent line across their top as they open. Everything
else as before: hover and keyboard focus are one state, Enter/Space pick, arrows/W/S move, Home/End.

## Performance (Intel UHD i5-1035G1, cold profile, interleaved A/B against the live build, on AC)
- Idle: 60 fps, p95 17 ms, no frames over 20 ms, as before.
- Backdrop first frame: 2.81-2.94 s after load vs 2.73-2.85 s for the previous title.
- Draws: sky (3), planet surface, atmosphere, rings, rubble (instanced), figure (1),
  formations (1, ~287k triangles), drifting rocks (1), pebbles (3), sparks, dust, meteor.
- Gotchas found on the way (arrival hitches on this GPU): a transformed pseudo-element inside a
  clip-path (the first sweep design) cost a 0.26 s mask raster when the menu first showed; a
  box-shadow or text-shadow first drawn mid-idle compiles its blur (50-130 ms frames at the signal).
  Both are gone; the signal's elements are drawn at 1/255 from the reveal.

## Testing
`node tools/test-title.mjs <base>`: the ship scene with and without a save (its parts, Kethra
turning); with `?title=isilthe`, Isilthe's parts, Isilthe turning, the rocks drifting, the figure
breathing, the pointer lean; and the menu, panels, button sweep, reduced motion, New game and Continue.
`node tools/capture-title.mjs <label> <base> --sizes=1920x1080,1280x1024 --at=4,14 [--bare]`:
screenshots on this machine's GPU into renders/title/. `node tools/title-bench.mjs` as before.

## New game: the black hole (`singularity/`)
New game on the ship-over-Kethra title no longer fades out. After a beat of silence a black hole is
born in the sky between the moon and the sunrise and eats the picture and the menu; the game loads in
the black it leaves and fades up into the intro. Continue, and New game on the Isilthe backdrop (or
before any backdrop has arrived), leave the old way.

- **One clock** (`timeline.ts`, seconds since the click): hush 0, warn 0.35 (the corner readouts
  lose the signal), implode 0.62 (light converges on the point), birth 1.15 (flash, shockwave), fight
  1.3 (the ship turns to run), shipLost 3.25, capture 3.7 (the camera is turned to face it), plunge
  4.85 (it falls in, a dolly zoom), horizon 6.05 (black, the sound cuts), end 6.75 (hand-over). The
  scene's update drives it, so a slow frame slows everything together. A key or click after the birth
  plays the rest three times as fast.
- **Lens** (`lensPass.ts`): a full-screen pass between the scene and the bloom
  (`Engine.setScreenEffect`). Each pixel's ray is traced past a Schwarzschild hole (leapfrog steps of
  the photon-orbit force inside ~15 Rs, the far-field series outside, blended), so the shadow, the
  photon ring, the Einstein ring of the sun and the planet's limb, and the lensed second image of the
  ship are all real bends of the actual scene. A thin disk (temperature profile, Doppler beaming,
  gravitational redshift) is crossed up to three times per ray, which gives the disk bent over and
  under the shadow. Uniform loop bound (D3D unrolls constant ones). Compiled with `compileAsync` and
  drawn once off screen during the backdrop's preparation, so the effect's first frame compiles nothing.
- **Gravity well** (`gravityWell.ts`): a vertex displacement patched into the rocks', debris', dust's,
  embers' and ship's shaders: radii remapped r' = (r^1.5 - K)^(2/3) (swallowed from the inside out,
  monotonic, with tidal stretching near the hole), a differential swirl about the disk axis and a
  flattening into its plane. The ship has its own well that holds until its engines fail. At K = W = 0
  the shaders take their original path.
- **Menu** (`ui/titleDevour.ts`): the pieces (corner readouts, kicker, wordmark letter by letter,
  orbit halves, tagline, buttons) jolt with the shockwave, tremble, tear loose nearest first and spiral
  in, stretched toward the hole; the pressed button goes last. The letters and the pieces' layers are
  made when the title is built (`prepareDevour`), while it is invisible: done at the click, that
  repainted the whole menu column in one frame of over 200 ms on Intel UHD. Reduced motion: the
  pieces fade in the same order, the camera holds still, no shake, swirl or shockwave, and the event
  runs 1.8 times as fast.
- **Sound** (`audio/singularitySound.ts`): synthesized, driven by the same clock (beds set per frame,
  hits on the cues); its noise and reverb buffers are made when the browser is idle after the title's
  first gesture.
- **The dark** (`UIManager.enterVoid`): the screen is covered in true black before anything is
  removed; the loading screen stays black (its bar only shows after 3.5 s); the next uncover is a 1.6 s
  fade up instead of the scan line. With a save loaded New game still reloads clean: `boot.ts` marks
  the reload in session storage and `index.html` paints the empty page black, so the dark carries on.

Measured on the Intel UHD laptop (production build, 1920x1080, Performance): click to black 6.7-6.9 s,
black to the intro fully up 3.2-3.5 s (1.6 s of it the fade). The event's frames: median 18 ms in a cool
run, 33 ms (a 30 fps cadence) when the machine is warm, with 10-15 frames of 50-120 ms where the disk
fills most of the frame. A first-ever click on the page stalls ~0.8 s while the browser starts the
audio device; the old exit had the same stall (measured with `?title=isilthe`), and here it falls in
the silence before the birth. `node tools/capture-newgame.mjs <label> [base] --beats=1.2,2.4,3.6,4.8`
shoots the event with its clock frozen per still; without `--beats` it reports frame times from the
click to the intro (`--save` takes the reload path, `--reduced` the gentle form).
