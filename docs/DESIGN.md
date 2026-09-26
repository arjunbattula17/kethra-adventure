# Design · the overhaul

The design for docs/BRIEF.md, built on the audit in docs/AUDIT.md (Part A). It evolves the team's
existing look (docs/STYLE_BIBLE.md, ART_BIBLE.md) and canon (LORE.md) rather than replacing them.
The root DESIGN.md is the TSA design and still describes the story; this file describes the
overhaul. Scores are [opinion] unless a number cites a file.

**Status: waiting at the design checkpoint.** Nothing below is built yet. §10 lists the decisions
that need a yes before building starts.

---

## 1 · The journey, reconciled

The brief's journey assumes one planet level. This game must keep **three levels** (TSA rule), so
the slots map by function rather than by name:

| Brief's slot | This game | Place | Replaces |
|---|---|---|---|
| Opening | **The title**: a live 3D shot of the dark Wren drifting, the menu as the ship's console | space | the DOM title over a planet photo |
| Opening motion-design sequence | **Cold Start**: the white sky hits the Wren. The title's camera *is* its first shot (a match cut, no loading screen) | space | same sequence, rebuilt on the new hull, sky and grade |
| *(kept, between)* | Wake, tutorial, sit at the console, **the reveal** (rebuilt: the scanner's ping resolves the system in 3D and becomes MG1's first shot) | the Wren | the poster orrery |
| **Mini-game 1** | **Intercept**: plot the burn to Kethra in the real 3D system | the Wren's nav instrument | the keypad course plot (D-7) |
| *(kept)* | The Wren as hub: logs, repairs, the chart | the Wren | — |
| **Pre-travel cinematic** | **First light**: the player holds the throttle; power travels through the Wren as light and the four engines relight for the first time since the white sky | the Wren → outside | nothing (new) |
| **Planet travel** | **The cruise**: six days in forty seconds, from departure to Kethra's night side | space | the fade and loading bar |
| **Mini-game 2** | **Canopy**: fly the Wren's skiff down through Kethra's dark canopy, waking it with your lamp | Kethra, above | "you appear on the pad" |
| *(TSA level 2)* | **Kethra**: the Aiveth, the inscriptions; the floor raised (ground, sky, props) | Kethra | — |
| **Mini-game 3** | **Hush**: cross the Wickmoth's chamber unseen, then sing the Rite under its gaze | the Cistern Heart | the Rite's DOM panel and the bloom switch |
| **Level 2 (expanded)** | **Vessek Anchorage** (TSA level 3), rebuilt as a multi-zone level with two new mechanics and the pulse as its climax | the Anchorage | the one-room level and the breaker panel |
| Designed ending and progression | **The ledger goes home**, then a summary, credits and a chapter select | space | the ending without a summary or replay path |

Why this shape: MG2 and MG3 both land on Kethra, which fixes the thinnest level with the two new
games. Vessek, the level that leads into the ending and carries the story's reversal, gets the
brief's "Level 2" treatment. The order still reads MG1 → cinematic → travel → MG2 → MG3 → Level 2 →
ending, as the brief asks.

TSA constraints kept: three levels, no combat (nothing is harmed: the skiff scrapes, the Wickmoth
fans you back), rated E, **stats change how every mini-game plays** (§4), browser only.

---

## 2 · Art direction

### Visual thesis
> **Compose in darkness, draw with light: every frame is mostly near-black, and every light in it
> belongs to someone (amber for the Wren, sea-green for Kethra's grove, mismatched tungsten for
> the Anchorage) until the white sky arrives and belongs to no one.**

This sharpens the team's sentence (STYLE_BIBLE.md) into rules code can check:
1. **Value structure first.** About 80% of every frame sits below 15% luminance. The focal light is
   the brightest shape on screen. Check it on a blurred screenshot: squint, and the focal point must
   still win.
2. **Every light has an owner.** No unmotivated fill. If a light can't answer "whose is it?", it goes.
3. **One bold element per scene** (the Heart, the Wren's engines, the white sky). Everything else
   stays at least one value step quieter.
4. **Darkness has texture, never grey.** The Void carries a faint cool gradient and sparse stars.
   The grade must never lift black (the root cause of today's grey space, AUDIT A §visual 1).
5. **Silhouette before surface.** The Wren reads at 20 px (a long spine, four pods); the Aiveth are
   tall and finned; the Anchorage is a lashed patchwork ring.

### Palette
The team's seven colours keep their jobs. The overhaul adds the world's light colours, each with one
owner.

| Name | Hex | Role |
|---|---|---|
| Void | `#07080a` | The canvas: space, deep shadow, the page, transitions. |
| Hull | `#12161b` | Panels, HUD frames, the Wren's dark plating. |
| Steel | `#5d666f` | Hairlines, structure, chart grids, instrument lines in 3D. Never text. |
| Ink / Ink-dim | `#eae2d0` / `#a89e88` | Text. Warm, never pure white. |
| **Wren amber** | `#d9a441` | UI only: "you can act on this". Primary buttons, key caps, focus, the course line. |
| **Wren lamp** *(new)* | `#ffb45a` | The ship's own light in the world: running lights, emergency strips, engine plumes. |
| **Grove sea-green** | `#5cd1b0` | Kethra's living light. In UI: "you learned something". |
| **Anchorage tungsten** *(new)* | `#e8c79a` family (2700–4500 K) | Patchwork lamps, never two alike. The colour of people. |
| **Kindling triad** *(new)* | azure `#6fb6ff`, gold `#f0c24a`, verdant `#7ed48a` | The Rite's three colours. The only fully saturated hues in the game, used only on Kindling machines. Each always paired with its glyph (colour is never the only channel). |
| **White sky** | `#f3f0ea` | The Choir's light. Belongs to no one. Never used for UI. |
| Frost *(new)* | `#bfd9e8` | Vessek's threat: cold creeping over the hydroponics bay. |
| Status | success `#7cbf7c`, warning `#d06a5c` | Only in their one situation. |

### Typography
- **Rajdhani 600/700 is ARK Ltd's stencil face.** It's kept for a reason the current build doesn't
  honour yet: it's the lettering painted on the Wren. From now on the world uses it too. The canvas
  textures move off `Arial Narrow`, `Impact` and `Courier New`, which ChromeOS doesn't have
  (AUDIT A §visual 8). That way the UI literally uses the ship's lettering, on every OS.
  - **Rajdhani is never used for a number that counts:** it has no tabular figures and its digits
    are proportional (checked with fontTools).
  - Uses: titles, the wordmark, placards, key caps.
- **Atkinson Hyperlegible 400/700 is everything read**, including every counter
  (`font-variant-numeric: tabular-nums`; its `tnum` feature is present) and ORION's screen readouts.
  Those replace the monospace screen text, one of the brief's defaults.
- **Scale:** STYLE_BIBLE.md's scale stays. It adds `arrival` (Rajdhani 700, 88 px at 1080p, for
  the kinetic level titles) and `count` (Atkinson 700 with tabular figures).
  - Eyebrows go to sentence case with no tracking.
  - Capitals stay only in key caps and on painted stencils in the world.

### Shape language
- **ARK Ltd (the Wren, and therefore the UI):** rectangles with 45° chamfers, bolted seams, stencil
  numerals. Panels and buttons take the hull plate's chamfer (top-left and bottom-right corners
  cut) instead of rounded corners.
- **Kindling:** circles, arcs and water-worn curves: rings, basins, concentric grooves, lathe
  profiles. No right angles. The Heart, the pillars and the call-stone are rebuilt in this language.
- **Aiveth:** tall, tapering, finned; living vein lines.
- **Anchorage:** patchwork. Mismatched rectangles from twenty-one hulls, diagonal lashing straps,
  weld seams, asymmetry.

### Materials and lighting, per world
| World | Materials | Key | Fill | Rim / accent | Grade (per-scene profile) |
|---|---|---|---|---|---|
| **Space** | The Wren: painted steel (rough dielectric), bare steel at wear points, glass viewport bands, lamp-amber emissives only where the ship is alive | The sun: hard directional, 5800 K | None, except a faint cool bounce | The sun's rim on every silhouette | Black stays black; highlights roll off warm |
| **The Wren (inside)** | Painted steel, rubber, glass screens, amber practicals | **Arc:** emergency strip lights at deck level (lamp amber, low) → navigation online (cool screen fill) → full power after First light (today's rig) | The viewport's starlight | Console screens | Slight warm split tone (kept) |
| **Kethra** | Dark loam, water-worn stone with vertex-colour variation, Kindling metal (verdigris), living tissue (emissive only where alive) | Cold moon, soft shadow | The canopy's bioluminescence from above | The Heart at the far end | Night green, deep blacks, sea-green highlights |
| **Vessek** | Twenty-one liveries of painted hull, frost | Tungsten lamps of different temperatures | The white sky through windows (during the pulse) | Grow lights (green) | Warm mids, frost-blue shadows |

**Grade becomes per-scene.** `PostProcessing` gets a grade profile per scene: exposure, toe,
shoulder, split tone and vignette. The global toe that greys out space goes away.

### How the UI derives from the world
- **Panels are the Wren's plating:** opaque Hull with the plate chamfer and a Steel hairline. There
  is **no backdrop blur**; a scrim vignette behind the panel does the separating instead.
- **Instruments are drawn in the world's own line language.** MG1's orbits, day ticks and course
  are 1 px Steel and amber hairlines in 3D space: the same lines the chart and panels use.
- **Screens show real state.** After MG1 the course line appears on the Wren's desk screen. The
  frost clock is a gauge on the hydroponics wall first, and a HUD meter only when you're away from
  it.
- **The HUD steps back.** The objective strip fades to 35% after six quiet seconds and returns when
  it changes, or on Tab. The key strip shows during level 1, then only while paused.
- **Every interactive state is designed:** default, hover (hairline to amber, 1 px lift), focus
  (amber ring), pressed (spring squash), disabled (Steel outline, with the reason on hover),
  loading (the amber wavefront fills the chamfer), success (sea-green, count-up), error
  (warning colour and a glyph, never colour alone).
- **Legible at 1280×720:** body 16 px minimum.

### Defaults audit
In the current build, and what replaces them:
- Glass panels everywhere → opaque chamfered plates.
- Tracked caps micro-labels on the chart and eyebrows → sentence case.
- Uniform white-dot starfield → a sparse sky with a magnitude and temperature distribution. The
  Kessic Drift *is* sparse (LORE.md), so a darker, emptier sky than most space games is a
  lore-backed choice.
- Idle pulsing on the console glow, floor LEDs and sun corona → removed. Status lights may blink
  only when they report something.
- Monospace readouts → Atkinson with tabular figures.
- The same entry animation on every state change → panels morph their content and don't re-enter.
- Camera shake → kept only at the five real impacts listed in §3.

**Added to the brief's list** (defaults I caught in this project):
- a "LEVEL 2" eyebrow over a centred title card;
- generic radar sweeps and bar charts on screens;
- a loading bar with lore quotes;
- a flat-colour night sky;
- a warp or hyperspace tunnel (and in this canon it would be wrong: the hyperdrive is what the
  Choir catches).

**Defaults used on purpose:**
- Near-black with an amber accent: the palette is organised by who owns each light, not by accent.
- Letterbox bars: the shared element that says "hands off", and they retract when control returns.
- Camera shake: only with an impact behind it.

---

## 3 · The motion system

**Signature: light travels.** When something comes online in this game it never switches on; its
light **travels** from the source along the structure. Examples:
- power running through the Wren's deck toward you at ignition;
- the Heart's light climbing Kethra's terraces;
- the Anchorage's lamps coming back deck by deck;
- the course line drawing outward from the Wren;
- the wordmark lit letter by letter.

This wavefront is the game's one recognisable motion. The scan line (kept) is its UI form.

### Module: `src/motion/`

**Clock.** One clock with two domains:
- `game` pauses with the game.
- `ui` never pauses.

Everything that moves reads one of them: tweens, timelines, particles, camera paths, CSS
variables. This ends today's split across four rAF loops, setTimeout chains and WAAPI
(AUDIT A §anim).

**Durations** (tokens; tune by feel):
- `micro` 100 ms: hover, press.
- `small` 210 ms: elements entering.
- `medium` 380 ms: panels.
- `large` 750 ms: screen transitions.
- **Exits run at 0.75×:** 75 / 160 / 285 / 560 ms.
- Cinematics use authored timings in their own timeline tables.

**Easings** (named; no magic numbers at call sites):
- `decelerate` `(.2,.8,.2,1)`: entrances.
- `accelerate` `(.4,0,1,1)`: exits.
- `standard` `(.65,0,.35,1)`: moves between two on-screen states (shared elements, camera).
- `linear`: mechanical and continuous motion only (a turning fan, a scrolling map).

**Springs** (analytic, frame-rate independent):
- `press`: ζ 1, ω 40.
- `settle`: ζ 0.7, ω 18. Arrivals, with one small overshoot.
- `heavy`: ζ 0.85, ω 8. The skiff, the throttle lever, big physical things.

The same tokens are written into CSS variables at boot. Springs reach CSS as sampled `linear()`
curves, falling back to `decelerate` where `linear()` isn't supported.

**Choreography:**
- `stagger`: 40 ms between siblings, total capped at 240 ms.
- `sequence` and `overlap(offset)`.
- A `Timeline` of cues on the game clock. It replaces the five home-grown timeline systems.

**Camera paths:** `CameraPath` is an arc-length Catmull-Rom path for position and look target,
with an FOV track. It generalises the intro's path (IntroScene.ts:544-550) and replaces
`CinematicSequencer`.

**Damping:** `damp(a, b, λ, dt) = b + (a − b)·e^(−λ·dt)` replaces the ten linearised dampers.

### Rules
- **Frame-rate independent.** All motion runs off dt from the one clock. Noise (shake, flicker) is
  sampled on dt-driven phases, never re-rolled per frame. It's verified by stepping transitions at
  simulated 30 Hz and 144 Hz.
- **Interruptible and reversible.**
  - `tween()` returns a handle.
  - Starting a new tween on a property retargets it from its current value.
  - Every scene and panel owns a `MotionScope`; disposing the scope cancels everything in it.
  - This fixes the stale timers that close the wrong panel and the double solves.
- **Reduced motion.** One source of truth (`motion.reduced`), mirrored to the CSS class. Under it:
  - transitions become ≤150 ms cross-fades;
  - no shake;
  - camera moves become cuts or slow dissolves;
  - no FOV zooms;
  - parallax is halved;
  - the white sky swells to 35%.
- **Flash guard.** A central `flashGuard` allows at most three full-screen luminance flashes per
  second, in every mode. Vessek's 6.4 Hz lamp stutter moves under it.
- **Hierarchy.** At any moment one primary motion leads. The **Conductor** freezes HUD motion
  during a cinematic beat and ducks ambient world motion under a hero moment.
- **Stillness is designed.** While a line of dialogue is on screen, the camera holds. Figures
  gesture once, then breathe.

### The Conductor
One timeline per big event fires UI, camera, VFX and sound at authored offsets. Audio lands on
`motion:beat` events, so there's one clock for sight and sound.

The events: First light's ignitions; MG wins and fails; the Heart waking; the pulse and the
recovery; arrival titles; the ending's transmission.

**The only camera shakes:**
- the four engine ignitions;
- skiff scrapes;
- the pulse;
- the Heart waking.

---

## 4 · Mini-games

**Scoring.** 1–5 on each axis. For **cost**, 5 means cheapest. "3D" means how much the mechanic
needs a third dimension, by the brief's test: could it be rebuilt as a 2D game on one plane without
changing how it plays?

### Slot 1 · the navigator's problem (the Wren, after the reveal)
The reveal's scanner ping has just drawn the system. The Wren is adrift on reserve cells. Kethra is
the one world in range. The educational core (d = v·t, relative motion) has to survive, as an
action instead of a quiz (D-7).

| Concept | The idea | Clarity | Depth | 3D | Fit | Distinct | Memorable | Cost | Total |
|---|---|---|---|---|---|---|---|---|---|
| **1A Intercept** | Aim the burn in 3D; a ghost line shows where you'll be each day; meet Kethra's dot for the same day, over a belt that blocks the flat route | 4 | 4 | 4 | 5 | 5 | 4 | 5 | **31** |
| 1B Sounding | Ping from three drift points; each echo is a sphere shell (time of flight = distance); where the shells cross is the target | 2 | 3 | 5 | 5 | 4 | 4 | 4 | 27 |
| 1C Slingshot | One impulse, the sun's gravity bends the path, thread a gravity assist | 4 | 4 | 3 | 3 | 4 | 4 | 5 | 27 |
| 1D Star sight | From the helm, rotate the ship to line a sextant up on the sun and planets and fix your position | 2 | 3 | 5 | 4 | 4 | 3 | 5 | 26 |

**Recommended: 1A Intercept**, with 1B's idea folded in as its opening: the reveal's ping is a
light shell that resolves the belt in 3D.

**How it plays**
- **Camera:** an orbit camera around the Wren's plot space. That's the real system, drawn through
  the navigation instrument: orbits, day ticks and the course are amber and Steel hairlines in
  space. Drag or WASD to orbit, scroll or +/− to zoom.
- **The burn:**
  - Drag the amber arrow at the Wren to aim it on a sphere (azimuth and elevation). Keyboard: hold
    Shift and use the arrows.
  - `[` `]` set the burn length in reserve cells.
  - A ghost line ticks once per day, 8 Mkm apart: **d = v·t, visible**.
  - Kethra's future positions tick along its inclined orbit in sea-green, numbered the same way.
  - Space runs the plot: a six-second fast-forward of the voyage.
- **Ramp (one session, about two minutes):**
  1. **Clear the drift.** The Wren is inside its own debris from the white sky. Aim at ORION's
     buoy, a static target. Teaches aiming, the ticks and running the plot.
  2. **Lead Kethra.** Aiming at where Kethra *is* misses. The sim stops and labels it: "Kethra was
     here on day 6." The player learns to aim for the matching tick. Kethra's orbit is inclined,
     so elevation already matters.
  3. **Over the belt.** The straight route crosses a dense clump that you only see side-on. Orbit
     the camera, pitch the burn over it, and pay the extra day out of the cell budget (four, or
     five with engineering 2).
- **Fail:** the sim stops at the miss or contact, tracks the camera to it, and labels what went
  wrong and by how much ("Belt contact · day 3"). R rewinds instantly. Failing costs nothing.
- **Win:** the course line draws itself outward from the Wren (the signature wavefront). The day
  count and the cell count count up in tabular figures. ORION says: "Course plotted. Margin
  included. You're welcome." The chart eases to a hero angle and the course appears on the desk
  screen.
- **Stats:**
  - insight 2: Kethra's ghost shows three more days;
  - perception 2: belt density shows as shading;
  - engineering 2: one spare cell.
  - Awards: +1 insight, +1 engineering; Ship's Library entries for navigation, Kepler and belts.
- **Why it's 3D:** Kethra's inclined orbit and the belt's thickness make elevation part of the
  answer. Leg 3 has no solution in the plane, and the top-down view hides the problem.
- **Depth cues and colliders:**
  - Every body and tick drops a Steel hairline to a faint ecliptic grid (the orrery's classic
    height cue). The grid fades with distance.
  - The sun's rim light gives every rock a lit side.
  - Belt clumps are sphere colliders the sim tests against. Hitting one gets a 60 ms hit-stop at
    the contact.

### Slot 2 · arriving at Kethra (after the cruise)
| Concept | The idea | Clarity | Depth | 3D | Fit | Distinct | Memorable | Cost | Total |
|---|---|---|---|---|---|---|---|---|---|
| **2A Canopy** | Fly the skiff down through a dark canopy. Your lamp wakes the pods, the pods light the boughs, and you steer through the gaps you've lit | 5 | 3 | 5 | 5 | 5 | 5 | 3 | **31** |
| 2B Lantern-water | Carry a bowl of the Heart's light-water up the terraces to Oshel's dim grove without spilling; slopes tilt it | 4 | 3 | 4 | 5 | 5 | 4 | 4 | 29 |
| 2C Aqueduct | Rotate Kindling channel segments so water climbs to the dark groves | 3 | 4 | 4 | 4 | 4 | 3 | 4 | 26 |

**Recommended: 2A Canopy.** 2B is a strong reserve: if it's ever built, it's the Oshel payoff
after the Heart wakes.

**How it plays**
- **Camera:** a chase camera behind and above the skiff. It uses spring smoothing, looks ahead
  down the descent, and collides with boughs so it never clips.
- **Controls:**
  - WASD/arrows strafe on the skiff's thrusters.
  - The mouse aims the lamp. Keyboard-only: the lamp follows your heading with a wider cone.
  - Shift brakes. The descent is otherwise continuous.
- **The twist:** darkness is the obstacle. Pods bloom where your lamp touches them and light the
  boughs around them for a few seconds, then fade. You're always lighting ahead while steering,
  two continuous tasks at once.
- **Ramp (five layers, about two minutes):**
  1. A wide gap under a swinging Aiveth lantern: learn to steer.
  2. Pods: learn that you only see what you light.
  3. Swaying boughs: timing.
  4. The Wickmoth crosses below and lights the layer with its wings. It's foreshadowing, and a
     gift.
  5. A narrow final drop into the clearing, where the landing lights wait.
- **Contact:** a scrape. Sparks mark the exact contact point, there's a heavy-spring camera kick,
  and the hull pip drops. Three scrapes and the skiff climbs back to the last lit layer. The bough
  you hit stays marked.
- **Win:** touchdown. The landing gear squashes, a dust ring spreads, and the camera settles into
  the establishing shot. The Aiveth lanterns turn toward you and the kinetic title "Kethra" lights
  letter by letter. The skiff stays on the landing terrace as the level's return pad (it replaces
  the cylinder-and-torus pad).
- **Stats:**
  - traversal 2: less inertia;
  - perception 2: pods stay lit longer;
  - engineering 2: a wider lamp.
  - Awards: +1 traversal.
- **Depth cues and colliders:**
  - The lamp's light pool lands on the next layer down: a contact cue for how far below it is.
  - The skiff casts a blob shadow into that pool.
  - Fog thickens with depth, so far boughs are paler (atmospheric perspective).
  - Pods near and far give parallax.
  - Boughs are capsule colliders.

### Slot 3 · Kethra's climax (the Cistern Heart)
| Concept | The idea | Clarity | Depth | 3D | Fit | Distinct | Memorable | Cost | Total |
|---|---|---|---|---|---|---|---|---|---|
| **3A Hush** | The Wickmoth reads light. Your lantern lets you see and gives you away. Cross its chamber unseen, then sing the Rite under its gaze | 4 | 4 | 4 | 5 | 5 | 5 | 4 | **31** |
| 3B Three Breaths | The Rite as a rhythm-and-aim game on the Heart's breathing | 3 | 3 | 2 | 5 | 3 | 4 | 5 | 25 |
| 3C Mirror terraces | Place resonant crystals on terraces at different heights to bounce the Heart's light to the dim groves | 3 | 4 | 5 | 4 | 3 | 4 | 4 | 27 |
| 3D Lantern-water | As 2B, set after the Heart wakes | 4 | 3 | 4 | 5 | 5 | 4 | 4 | 29 |

**Recommended: 3A Hush.** The dialogue already promises it (kethraDialogue.ts:147, 327), and it
inverts the thesis: to get close to something that reads light, you have to stop announcing
yourself.

**How it plays**
- **Camera:** first person, the game's native view. Crouch finally matters.
- **The chamber is new** (today there is none, AUDIT A): roots and Kindling arches around a basin,
  the Heart at the centre, and perches at three heights.
- **Your light:**
  - Hold right mouse (or F) to hood the lantern. You see less and move slower.
  - Open, you see, but the moth's **gaze** finds you. Its gaze is coloured light cast by the
    eyespots on its stained-glass wings, so what it sees is visible.
  - Glowcaps flare when you brush them.
- **The moth:**
  - Light in its gaze draws it. It lifts off and glides toward the light, with a readable wing-beat
    of anticipation first.
  - If it reaches you it fans its wings, and a gust carries you back to the last lantern post.
  - No harm, and the retry is instant.
- **Ramp (about two to three minutes):**
  1. One glowcap and a distant moth. Brush it, the moth turns, then settles. Teaches that light
     draws it.
  2. Cross the open floor between its sweeps. Timing.
  3. It moves to the high perch and sees over low cover. Use the root tunnels and the basin rim:
     **height matters**.
  4. **The Rite at the call-stone.** Call the three colours in the true order (from the
     inscriptions). Each breath flares through the Heart and draws the moth a step closer, so you
     breathe only while it's turned away. A wrong colour sours the water (visibly) and startles it,
     which sends you back to the stone's post, not the start.
- **Win:** the third breath wakes the Heart. The moth settles on it with its wings open, and its
  stained glass lights the chamber. Then the light **travels** up the terraces, layer by layer,
  into the canopy. That's the set piece LORE.md describes, finally staged.
- **Stats:**
  - perception 2: the gaze reads earlier and brighter;
  - traversal 2: faster when hooded;
  - insight 3: the moth's next perch is previewed;
  - archaeology 3: the first colour (the existing hint).
  - Awards: +2 archaeology and the crystals (as today).
- **Why it's 3D:** line of sight is a 3D volume, the moth works at heights, and cover is under,
  over and behind.
- **Depth cues and colliders:**
  - The moth's shadow moves on the floor under it.
  - Your lantern's pool shows your reach.
  - The gaze cones are volumetric light shafts, so you can see where they end.
  - Line of sight is a raycast against the chamber's collision geometry, not a distance check, so
    cover is real.

### The three side by side
| | MG1 Intercept | MG2 Canopy | MG3 Hush |
|---|---|---|---|
| Verb | aim and plan | steer and illuminate | sneak and time |
| Camera | orbit around a system | chase behind a craft | first person |
| Pacing | deliberate, considered | tense, continuous | tense, then release |
| Environment | open space, instrument lines | a dark forest from above | an enclosed Kindling chamber |
| Motion language | lines drawing, days counting | inertia, springs, sway | stillness, wing-beats, held breath |
| Feedback | the sim shows where and by how much | sparks at the contact point, a camera kick | the gaze made visible, a gust |

All three have an in-world introduction, feedback within 100 ms of input, a readable fail state
with an instant retry, and a choreographed win. First-time target: about two minutes each (see
§10, play length).

---

## 5 · Beat sheets

**Both sequences:**
- **Hold to skip:** hold Space for 0.8 s. A ring fills around the corner hint, and a tap does
  nothing. Skipping cuts to the arrival state, never to black.
- **They preload underneath:** First light builds the cruise scene; the cruise builds and warms
  (compiles and first-draws) the Canopy scene, which builds Kethra.
- If loading isn't finished at the end, the last beat extends seamlessly. There's no loading bar.

### First light (the pre-travel cinematic), about 20 s plus one held input
The story: the Wren has made no light of its own since the white sky. The plot is committed. The
survey lead takes the throttle. First trip only; later departures use an 8 s version (beats 4–5).

| # | Time | Camera | What it says | Motion and VFX | Audio |
|---|---|---|---|---|---|
| 1 | 0–3 s | First person in the helm seat. A slow push toward the viewport; the letterbox rises. | "This is the moment." | Cabin light falls to emergency strips. The desk screen redraws MG1's course line: the shared element. | The drone drops a fifth. ORION: "Plot holds. Four cells." |
| 2 | 3–6 s | Holds on the throttle lever, a physical 3D lever. | The player decides. | After 1 s of stillness the lever's amber rim and a "Hold Space" key cap appear (not immediately). | A sub hum waits. |
| 3 | held, ~3.5 s | First person. One camera kick per ignition, each a real impact. | Systems coming online, one by one. | Four ignitions. Each pod's lamp on the console goes amber to white. **Power travels as light** down the deck toward the player, aft to fore, and each strip ignites as the wave passes. Dust shakes from the ceiling once. Letting go spools the step back down; nothing fails. | Four ignition thuds, rising through the scale. The sub rumble swells with the hold. |
| 4 | +2.5 s | **Match cut through the viewport.** The camera pushes into the glass, the window frame fills the screen as a mask, and on the far side the camera pulls back out of the same window from outside, to the stern. | The Wren is alive. | The plumes bloom from nothing, with one shockwave ring per pod (communicating force). The hull is lit by its own engines for the first time: a warm key from behind. | Outside, sound goes low and muffled. A filtered roar. |
| 5 | +3.5 s | Exterior wide: the Wren small against the sun and the belt. | Scale; leaving. | The Wren slides forward. The camera holds, then turns to follow. **This is the cruise's first shot:** the same scene, no cut. | ORION: "Burn started. Six days." |

### The cruise (planet travel), about 45 s, Wren → Kethra
The story: a sublight cruise of six days (MG1's numbers). No warp: the hyperdrive is what the Choir
catches (LORE.md, rules 2–3).

| # | Beat | Time | Camera | What it says | Motion and VFX | Audio |
|---|---|---|---|---|---|---|
| 1 | Departure | 0–6 s | Locked-off wide from the belt side. The Wren crosses frame, small, with belt rocks in the foreground. | Scale: a small ship in a large system. | Plumes. The sun huge and dim behind haze. | Low roar under a pad chord. |
| 2 | Acceleration | 6–12 s | Chase cam behind and above. FOV widens 50° → 62° (a cut under reduced motion). | Speed. | Belt rocks slide past in parallax. Stars stretch into short streaks in proportion to velocity, then relax. Low engine vibration, not shake. | The roar rises through a filter sweep. |
| 3 | Transit | 12–24 s | A slow orbit around the ship, then stillness. | Time passing. Let it breathe. | **The day counter** counts "Day 1 … Day 6" in tabular figures. MG1's course line runs ahead of the ship. **The sun's light rotates around the hull**: that is how days read. | Sparse plucks. ORION: "Day three. Nothing to report. That's the good kind." |
| 4 | The reveal | 24–32 s | The camera swings past the Wren's nose. Kethra's night side fills frame as a black disc. | A living world. | Silhouette → the terminator line crawls as the camera moves → the atmospheric rim lights up → the night side's bioluminescent patterns show faintly. **The grade shifts from cold sun-white to night green.** | A chord change into Kethra's key. |
| 5 | Approach and entry | 32–40 s | The skiff separates from the Wren's belly; the chase view follows it down. | Commitment; heat. | The leading edge glows (an orange fresnel ramp), a heat-shimmer ring, haze thickening, clouds rushing past. The canopy appears below: dark, with scattered living lights. | Roar → wind. |
| 6 | Handoff and arrival | 40–45 s | The camera settles behind the skiff above the canopy. | Arrival; your turn. | The kinetic title "Kethra" lights letter by letter in sea-green, then its light drops into the first pod below (a shared element). **Control passes to the player: MG2 starts with no cut.** | Title chord. Wind. |

**Variant for Vessek (M5):** the same departure. The reveal is the violet world whose ring of
lights blinks out of sync. The arrival is a slow docking approach through the lashed hulls, with
the title "Vessek Anchorage".

---

## 6 · Level 2: Vessek Anchorage, expanded

Today it's one 16×24 m room with a DOM breaker panel. Rebuilt, it's four zones and two mechanics
the Wren doesn't have, laid out as kishōtenketsu.

**New mechanic A: the ring bus, in the world.**
- The Anchorage's lamps all hang off one bus that carries six units.
- Breakers are physical levers in different compartments. Conduits along the ceilings glow with
  the flow, so you watch power travel.
- A big analogue bus gauge hangs in the hall: a diegetic meter.

**New mechanic B: the ducts.** Crawl (crouch finally matters) through Dace's ducts: tight 3D
routes, ladders, one-way vents, chalk arrows. Ducts are the shortcuts between compartments.

**Zones**, each with its own light:
1. **The Lantern Bay hall.** Varro, the ledger. Warm patchwork tungsten, a different lamp from each
   hull.
2. **The school hold.** Dace, a chalkboard, children's drawings of stars they've never seen. Chalk
   white and lamp amber.
3. **The ducts.** Dark, cool Steel, fan-light strobing slowly (inside the flash guard).
4. **The hydroponics tanker.** Green grow light, frost creeping in during the pulse.

| Step | Beat | What the player does |
|---|---|---|
| Ki (introduce) | Dace's lamp board | Light the school's lamps by switching something else off. Learn the six-unit bus with no timer and no risk. |
| Shō (develop) | Varro's deal | The deal needs the aft junction, reachable only through the ducts. Learn to crawl, climb and use one-way vents. The stat route chosen in the deal changes the path. |
| Ten (twist) | **The rehearsal pulse** | Every grid browns out, deck by deck. Auto-reset circuits (the hall's lamps from twenty-one ships) come back by themselves and trip the bus. The frost clock starts. |
| Ketsu (test in combination) | **Save the hydroponics bay** | Climax: take the ducts to isolated junctions, lock the auto-resets out, and bring up pumps → heaters → scrubbers inside the bus limit before the frost wins. The grow lights come back deck by deck (light travels). Then the ledger, the reversal, the alloy, and the ending. |

**Stats change the route, not whether you can win:**
- **engineering 2** reads the load stamps;
- **perception 2** spots the auto-reset circuits before they trip;
- **traversal 2** opens the short duct;
- **persuasion 3** gets Varro to shut her own hall lamps before the pulse (fewer auto-resets);
- **insight 2** trades what Fen said about the Rite for the aft-junction code.

**Environmental storytelling:** the ledger, the stars drawings, lamps from ships whose names are
stencilled on their fittings, and the Lantern Bay's first-page names.

**Kept:** Varro, Dace, the pulse, the ledger reversal, the kind frost fail with an instant retry.
**Fixed:** the soft-lock (AUDIT A, gameplay 6).

**Ending and progression state** (M6), after the transmission:
- **A summary, choreographed:** days travelled, worlds woken, stats with count-ups, the choices
  made (which deal, whether the moth ever caught you).
- The credits.
- **A chapter select:** replay any mini-game or level from its own start snapshot.
- "Keep exploring" returns to the Wren.

---

## 7 · Performance budgets and presets

The reference machine (Intel UHD/Iris Xe class, 1080p) isn't available. Budgets are held with
counters (draw calls, triangles, textures, heap) plus two proxies measured every milestone:
- 6× CPU throttle at Low;
- unthrottled at High, on this PC's RTX 4060.

The report will list what needs checking on real hardware.

### Presets (what each changes in engine terms)
| | **Low** | **Medium** | **High** |
|---|---|---|---|
| Pixel ratio cap | 1.0 × dynamic scale (1 → 0.85 → 0.7) | 1.5 | 2.0 |
| Anti-aliasing | none | MSAA 4× | MSAA 4× |
| Shadows | off; baked contact shadows and AO in vertex colour and decals | 1 caster, 1024, static where possible | key 2048 + 1 × 1024 |
| Post | **one combined pass**: grade + LiteGlow (quarter-res threshold, two blurs) | the same | UnrealBloom + GTAO (half res) + grade |
| Point lights per scene | ≤ 8 | ≤ 16 | ≤ 16 |
| Live particles | ≤ 1,000 | ≤ 3,000 | ≤ 6,000 |
| Scatter density / draw distance | 50%, fog near | 75% | 100%, fog far |
| Textures | kit 1024, canvases 512 (readable screens 1024) | full kit, canvases 1024 | full |

- **Low keeps a glow.** It's cheap, and without it a game about light goes flat. Presets never
  change palette, composition, lighting direction, silhouettes or motion.
- **Auto** = the GPU-string guess, the start-up benchmark and the runtime governor, plus dynamic
  resolution. All exist today; kept.

### Per-scene budgets (draw calls / visible triangles at 1080p)
| Scene | Low | High | Shadow casters (High) | Particles (High) | Textures | Baseline today (Low → High) |
|---|---|---|---|---|---|---|
| Space: title, intro, reveal + MG1, First light exterior, cruise, ending | 80 / 150k | 160 / 300k | 1 × 2048 (the Wren self-shadows) | 4,000 | ≤ 60 MB | intro 18 / 48k → 31 / 48k |
| The Wren, inside | **150** / 150k | 350 / 300k | 2 × 1024, static | 500 | ≤ 150 MB | **614 / 142k → 942 / 251k** |
| MG2 Canopy | 120 / 250k | 300 / 600k | 1 × 2048 (moon) | 3,000 | ≤ 60 MB | new |
| Kethra | 160 / 320k | 450 / **900k** | 1 × 2048 | 2,000 | ≤ 90 MB | 155 / 310k → 611 / **1.24M** |
| MG3 Hush | 120 / 200k | 300 / 500k | 1 × 1024 | 1,500 | ≤ 60 MB | new |
| Vessek, expanded | 180 / 200k | 400 / 400k | 1 × 1024, static | 1,000 | ≤ 110 MB | 197 / 76k → 405 / 152k |

Baseline figures from docs/perf/overhaul-baseline/*/results.json.

**Frame targets:**
- High: p95 ≤ 17 ms unthrottled.
- Low proxy: p95 ≤ 33 ms at 6× CPU in every scene.
- Today only the Wren misses (p95 49.9 ms).

**Getting the Wren under budget**, in order:
1. Proxy colliders for the interactive furniture.
2. Instanced status LEDs.
3. Expand instanced props into merges.
4. Share identical decal and kit materials.
5. Make the glows single-sided.
6. Only then an atlas for single-use 0–1-UV textures.

The render audit's estimate is 643 → ~300 after the first five steps and 100–150 after the atlas.

**Kethra at High:** LOD or impostors for the background tree belt to get under 900k triangles.

---

## 8 · Engineering changes that everything rests on

- **An explicit flow machine** replaces GameFlow's script:
  - states: `title`, `intro`, `wren`, `reveal`, `mg1`, `firstLight`, `cruise(dest)`, `mg2`,
    `kethra`, `mg3`, `vessek`, `ending`;
  - one `go(next)` with an in-flight lock, so no transition can fire twice;
  - GameState flags stay the save record; the machine decides the scene.
- **Scene lifecycle.**
  - Every scene owns a `MotionScope` and a disposer that frees geometry, materials, textures,
    shadow maps, listeners, timers and tweens.
  - The Wren is kept alive (not rebuilt) across planet trips if memory allows; otherwise it's
    rebuilt behind the cruise.
- **Preload during cinematics:** `Engine.prepareScene()` plus a "ready" gate that the last beat
  waits on.
- **The debug harness** (`?debug=1` only):
  - an overlay: frame time p50/p95, draw calls, triangles, textures, heap;
  - F1 jumps to any state or beat;
  - F2/F3 auto-win and auto-fail the current mini-game;
  - F4 cycles time scale ×0.25 / ×1 / ×4;
  - F5 pauses and F6 steps one frame;
  - `?seed=` fixes every random stream (all layouts move to the seeded RNG).
  - `window.__DEBUG__` stays as a read-only probe for the test tools.
- **Journey test:** one Playwright run plays the whole new flow through player input, including
  one fail and one restart per mini-game and a re-entry into every scene. It runs at every
  milestone alongside `npm run smoke`.

---

## 9 · Milestones (vertical slices; each ends playable, tested and committed)

| # | Milestone | Done when |
|---|---|---|
| **M0** | **Foundations** | The motion module (clock, tokens, springs, timeline, camera path, conductor, flash guard, reduced motion), the flow machine, the debug harness, per-scene grade profiles (black space), the space kit (sky, stars, sun), **the code-built Wren hull**, the UI kit (plates, no blur, panel morph and exit, hold-to-skip, kinetic title, tabular counts), the world's fonts. Also the P1 fixes: Vessek soft-lock, double start, double solve, stale panel close, frozen beacon sweeps. Also the Wren's draw calls, steps 1–5. Journey test green. |
| M1 | Level 1: the reveal and MG1 Intercept | The reveal rebuilt as MG1's opening; MG1 complete with its ramp, win and fail; the Wren's lighting arc; the course on the desk screen; the keypad plot deleted. |
| M2 | First light and the cruise | Both sequences per §5, with hold-to-skip and preloading. The fade-and-loading-bar travel to Kethra deleted. |
| M3 | MG2 Canopy | Complete per §4; the skiff as Kethra's return pad. |
| M4 | MG3 Hush and Kethra's floor | The chamber, the moth, the in-world Rite, the wake travelling up the terraces. Kethra's ground, canopy ceiling, pillars and props raised to the bar. The Rite's DOM panel deleted. |
| M5 | Level 2: Vessek, expanded | Four zones, the bus and the ducts, the pulse climax, the docking variant of the cruise. The breaker panel deleted. |
| M6 | Opening, menus, ending | The live title with a match cut into Cold Start; Cold Start rebuilt on the new kit; menus, pause and settings on the plate kit; the ending with its summary, credits and chapter select. |
| M7 | The whole-game pass | Verification per the brief: four resolutions × Low/High screenshots, frame-stepped transitions at 30/144 Hz, edge-case input, performance per scene. Then the art pass until no scene stands out as weaker. |
| M8 | Report | docs/REPORT.md and the 17 answers. |

**Cut line, if time runs short** (features before quality, in this order):
1. Vessek's four zones → three (the school hold merges into the hall).
2. The Vessek travel variant → the Kethra cruise with a docking arrival shot.
3. Canopy's sway layer.
4. The Wren's lighting arc, three stages → two.

---

## 10 · Decisions for the checkpoint

1. **The journey mapping (§1).** MG2 and MG3 on Kethra; Vessek as the expanded "Level 2".
2. **The three mini-games (§4):** Intercept, Canopy, Hush.
3. **Licensing.** The brief says CC0 only, but the build ships two CC BY assets and two OFL fonts.
   - **Recommended:**
     - Replace the CC BY freighter with a Wren built in code (it's also the weakest-looking
       asset).
     - Keep the CC BY planet maps, credited as now, until procedural planets prove as good.
     - Keep the OFL fonts (the standard licence for type; there's no CC0 equal).
     - Everything new is CC0 or made in code, logged in docs/ASSET_LICENSE_LOG.md. I'd keep that
       file rather than start a CREDITS.md.
4. **Canon additions (the team owns LORE.md, D-1).** Nothing existing changes. New:
   - the Wren's skiff;
   - a real chamber at the Heart;
   - the Wickmoth's gaze as a mechanic;
   - Vessek's school hold, ducts and hydroponics tanker.
5. **Play length versus TSA judging.** Three mini-games of about two minutes each add roughly six
   minutes. That breaks the team's "competent player reaches level 3 in under 10 minutes" target.
   - **Recommended:**
     - tune each mini-game to 90–150 s for a first-timer (shorter than the brief's 2–4 min
       default);
     - make every cinematic hold-to-skip;
     - add the chapter select, so a judge can jump to any level (it would also settle D-6).
6. **The soft-lock is in the TSA build on master.** Hotfix master now (a small, isolated fix plus
   a regression test), or leave master alone until the overhaul merges?
7. **Merge policy.** The overhaul stays on `overhaul` until the whole journey passes. Master
   remains the safe submission.

### Review against the brief
For each major choice I asked whether I'd make it for any other game in the genre, and changed it
if so:

| Choice | First draft | Changed to | Why |
|---|---|---|---|
| MG1 | Space golf with gravity | Intercept with day ticks | Carries this game's own maths (d = v·t), and the belt makes the third dimension necessary. |
| MG2 | Fly through gaps | The canopy is dark; your lamp wakes it | "Every living thing announces itself with its own light" becomes the mechanic. |
| MG3 | Sneak past a guard | A guardian that reads light, with a visible coloured gaze; the Rite sung under it | The thesis inverted: to get close, stop announcing yourself. |
| Pre-travel cinematic | Engines ignite, the ship flies off | Power travels through the Wren as light while you hold the throttle; a pull-through the viewport | The first light the ship has made since the white sky; the player commits. |
| Travel | Hyperspace streaks | A sublight cruise where days read as the sun turning around the hull | A warp tunnel would contradict the canon. |
| Title | A planet image and a button column | The live dark Wren, cut straight into the intro | The first impression is the game itself. |
| Type | Swap Rajdhani for something "less sci-fi" | Keep it as the ship's actual stencil face, move it into the world, take counting numbers away from it | A reason from the world, plus a measured flaw fixed. |
| Starfield | A denser, prettier sky | A sparser, darker one | The Kessic Drift is sparse by canon. |
