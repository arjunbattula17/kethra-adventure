# Explain to the Team

For every major system: what it does, why it's built this way, the three questions a judge is
likely to ask, and plain answers. If you can't explain a system, it's too complex; say so and it
gets simplified.

---

## Adaptive quality (`src/core/Engine.ts`, `src/core/PostProcessing.ts`)
**What:** the game guesses a quality tier (high/medium/low) from the GPU name and CPU cores,
then watches real frame times. It steps the quality down if the game is genuinely slow, but
never while a scene is loading.
**Why:** judges' computers range from gaming PCs to Chromebooks. One setting can't be both pretty
and smooth everywhere.
- *"How do you know the game is slow and not just loading?"* It ignores frames while a scene
  loads and for 4 seconds after. It only drops quality if the slowest 5% of frames are over 33 ms
  AND the average is below 50 fps. One stutter doesn't count.
- *"What gets turned off first?"* Ambient occlusion (the soft contact shadows, the most
  expensive effect), then glow (bloom), then render resolution. Shadows stay, because switching
  them off forces every material to recompile, which froze the game for seconds.
- *"Can the player override it?"* Yes: Settings (O). A manual choice turns the automatic system
  off.

## Loading during the intro (`src/core/GameFlow.ts`, `src/core/BackgroundPrep.ts`, `src/core/prepare.ts`)
**What:** on a new game the intro goes up first (one hull and two starfields, about a second behind
the loading bar). The Wren then builds itself while the intro plays: its geometry and painted
textures while the opening shot holds still (up to 4 s), its shaders and first draws in small pieces
paced to fit between the intro's frames. Whatever is left when the intro ends finishes behind a short
loading bar. The same trick builds the Wren behind MG1's win, and each level behind the cruise.
**Why:** compiling ~93 shader programs on a fresh browser freezes the GPU. All at once during the
intro, that froze it for ~11 s; in small pieces, the work is spread across the intro instead.
- *"Why is the first load slow?"* The GPU compiles every shader the first time; browsers cache
  them afterwards, so the second visit is much faster.
- *"What's a shader?"* A small program the graphics card runs to draw each surface.
- *"How would you make it faster?"* Fewer distinct shaders (BACKLOG B-4).

## The intro and its text (`src/galaxy/IntroScene.ts`, `src/content/strings.ts`)
**What:** a 24-second cinematic. The ship dies under a white sky and reboots, with four lines of
text timed to the pictures.
**Why:** a first-time player needs "where am I, what happened, what do I do" before they
move. Each line stays up 2.5 s + 0.35 s per word (reading pace).
- *"How does the light wave move along the ship?"* The windows are one 3D model, so a small
  shader program compares each pixel's position along the ship to a moving "front" number, and
  lights the pixels behind it.
- *"Can I skip it?"* Any time: hold Space or Enter, or press and hold the hint, for under a second.
- *"Where's the text stored?"* In `src/content/strings.ts`, so it can be edited or translated
  without touching code; the timing updates itself from the word count.

## Texture budget (`tools/texture-audit.mjs`, TEXTURE_AUDIT.md)
**What:** a tool that lists every texture on screen and measures how many texture pixels land on
each metre of surface (texel density), against a standard.
**Why:** textures that are too big waste graphics memory, which low-end machines don't have;
too small looks blurry. Measuring beats guessing.
- *"Why did the game use less memory and not look worse?"* The biggest textures (tree bark,
  planets) had 10–20× more detail than the screen could ever show. We shrank those and made
  the one texture that was too blurry (the ship walls) sharper.
- *"How did you check nothing changed?"* The same camera shots were rendered before and after
  and compared pixel by pixel.
- *"What's still wrong?"* The big rocks on Kethra are stretched, and one ground texture doesn't
  match the art style (both listed in the audit).

## Saving (`src/core/SaveSystem.ts`)
**What:** progress saves to the browser's localStorage automatically at key moments.
**Why:** a judge who reloads shouldn't start over.
- *"What if the browser blocks saving?"* The game plays without saving. This used to crash to a
  black screen; now it's tested by `npm run smoke`.
- *"What about old saves after an update?"* `migrateSave` in `GameState.ts` fills any new field
  with its default, so old saves still load.
- *"Where is it stored?"* In the browser, under the key `kethra_save_v1`; nothing goes to a
  server.

## RPG stats (`src/core/GameState.ts`, `src/rpg/CharacterPanel.ts`, `kethraDialogue.ts`)
**What:**
- Six skills: insight, archaeology, engineering, traversal, persuasion and perception.
- XP and levels, with a skill point each level.
- Dialogue choices that only appear if a skill is high enough.
**Why:** the TSA challenge: stats must be *how* you solve puzzles.
- *"Show me a stat solving a puzzle."* On Kethra: with persuasion 4 the Warden admits the ritual
  is broken, which points you at the true colour order; with perception 3 the Cistern Heart shows
  you its first colour.
- *"How do skills grow?"* By using them: reading an inscription grows archaeology, fixing the
  valve grows engineering.
- *"What's missing?"* Engineering and traversal don't unlock anything yet (BACKLOG B-7).

## Tests and tools (`tools/`)
**What:** ~50 scripts that drive the real game in a browser: `smoke.mjs` (every scene boots
without errors), `test-tutorial-flow.mjs` (36 checks through the opening), `intro-check.mjs`,
`movement-check.mjs`, `collision-check.mjs`, the texture audit.
- *"How do you know a change didn't break anything?"* Run `npm run smoke` and the flow test
  before every commit.
- *"Why test with a browser instead of unit tests?"* Most bugs here are visual or timing bugs,
  and only the real renderer shows them.
- *"How do you know you can't walk through walls?"* `wall-sweep.mjs` drives the real player into
  every wall it can reach, walking, sprinting and jumping, and checks the body and the camera
  against every visible triangle. It found Vessek's drop vents trapping the player and the camera
  passing through the root-tunnel arches on Kethra (D-28).
- *"What can't you test?"* Other browsers and real Chromebooks, until we run them by hand
  (BACKLOG B-5).

## Title screen (`src/ui/TitleScreen.ts`, `src/galaxy/title/`)
**What:** the first screen: Continue / New Game / Chapters / Controls / Settings (the credits roll at the ending). The menu
is plain HTML and CSS, so it appears instantly; behind it, a live 3D scene drawn by the game's own engine: a
capital ship over Kethra at sunrise, Isilthe's rings, a moon, drifting rocks (`src/galaxy/title/TITLE_DESIGN.md`).
**Why:** the rules require a controls screen reachable from a menu; the CC BY assets need visible
credit; browsers won't play sound until the player clicks something; and the title is the first
thing a judge sees.
- *"Is the background a picture?"* No. It is rendered live every frame: the planet turns, the ship
  flies and its engines flicker, the rocks tumble. Nothing in it is an image file except the game's
  own planet and rock textures; the ship, the moon and the rocks are built in code.
- *"How does the menu show instantly if there's 3D behind it?"* The menu goes up first, over a
  stand-in night sky. The engine and the 3D scene get ready in the background (about two to three
  seconds on a school laptop, about one on a gaming PC), and the finished scene fades in once.
  Nothing waits on a timer.
- *"Why is that ship different from the one in the intro?"* The title's ship was designed after
  reference images the team chose for the title; the intro flies the Wren model. A known difference
  (DECISIONS D-27).
- *"How was that ship modelled?"* In code, not in a 3D program: cross-sections are joined into the
  big shapes, every face is cut into panels, and each panel becomes a raised plate, a vent, a bay of
  machinery or a black recess. The fine seams and bolts are a texture the graphics card bakes at
  load, and the markings are painted on a canvas. The whole ship is three draw calls.
- *"How does New Game work if there's a save?"* It reloads with `?newGame=1`, which clears the
  save, then removes that flag from the address bar so a later refresh continues instead of wiping
  progress.
- *"How do the tests skip it?"* They open the game with URL flags (`?skipIntro=1` and so on);
  any of those skip the title.
- *"Where's the text?"* `src/content/strings.ts` (`title.*`, `controls.*`, `credits.*`).

## Navigation map (`src/galaxy/MapController.ts`)
**What:** a solar chart and per-planet surface charts drawn on a canvas, with an HTML dossier
panel beside them. Set Course is how the player travels.
- *"Why canvas plus HTML?"* The chart animates every frame, which canvas is good at; text and
  buttons are easier to read and click as HTML.
- *"Where do the distances come from?"* `NAV` in `src/content/tuning.ts`: the same numbers the
  course-plot puzzle uses, so the two can't disagree.
- *"What bug did this fix?"* Travel had silently stopped working in August. We found it by writing
  a test that plays the level the way a player does.

## Level 3: Vessek Anchorage (`src/planets/vessek/`)
**What:** the Lantern Bay, town hall of a ring of stranded ships. Talk to Harbormaster Varro, and
a "rehearsal" white sky knocks the power out; bring it back before the food freezes, then read
the ledger that shows the pulse came early after you relit Kethra's Heart.
- *"How does the power puzzle work?"* `bus.ts` holds the rules and `busWorld.ts` puts them in the
  rooms: eight circuits on a bus that carries 6 units, each with a physical lever in the room it
  serves. The heaters need the pumps, everything needs the regulator, and two circuits (the dock
  lights and the hall lamps) switch themselves back on. The heaters and scrubbers need exactly 6,
  so those two have to be off and stay off: their lockout boxes are in the ducts. Each lever's tag
  is a note from a different crew, so reading the room solves it.
- *"What happens if you run out of time?"* The frost clock restarts and the bus drops back to the
  regulator. Lockouts already thrown, and everything else, are kept: failing costs seconds, never
  progress.
- *"Where do the stats matter?"* Engineering stamps each lever's load on its tag; perception marks
  the circuits that reset themselves and warns before they do; traversal opens the bent grate into
  the short duct; persuasion, insight or engineering open better bargains with Varro; archaeology
  reads the Kindling plate under the grate.
- *"What is there to find?"* Three things off the path, counted in the level's survey: the scope
  at the east port, Dace's chalk sky in her duct, and the seed book behind the last grow table
  (`src/content/discoveries.ts`).

## Characters (`src/characters/Figure.ts`)
**What:** every person in the game is built in code from simple shapes with few sides and flat
shading, so they match the low-poly model kits. They breathe, sway, and turn their heads to
follow you.
- *"Why do the Aiveth glow?"* LORE.md says the Aiveth speak partly in light. Their veins are an
  emissive texture; the Warden's glow starts dim ("wary") and brightens as she trusts you.
- *"Why not download character models?"* The free models that fit were either creatures or needed
  animation rigs; building them in code kept one style and one licence (our own).

## The style bible and the scan line (`docs/STYLE_BIBLE.md`, `src/style.css`, `UIManager.ts`)
**What:** one written rulebook for colour, type, motion and sound, and one transition used for
every scene change: an amber line sweeps down the screen like the Wren's scanner.
- *"Why is amber used so little?"* It's reserved for "you can act on this": the main button, the
  E key, the focus ring. Sea-green means "you learned something". A colour always means one thing.
- *"Why that body font?"* Atkinson Hyperlegible was designed by the Braille Institute so letters
  that look alike (I, l, 1) can't be confused, which helps on a laptop at arm's length.

## Sound (`src/audio/AudioSystem.ts`)
**What:** every sound is made in code with the Web Audio API: no audio files. UI sounds are soft
tones in one musical scale (A minor pentatonic), so they're always in key with the music, which
is generated live: a slow chord plus notes picked at random, different for each place.
- *"Why generate the music?"* No files to download or license, it never loops audibly, and each
  place can have its own mood from a few numbers (the `BEDS` table).

## Pause, settings, keyboard-only (`src/ui/PauseMenu.ts`, `SettingsPanel.ts`, `src/content/controls.ts`)
- *"How does Esc pause when the browser uses Esc to release the mouse?"* The browser swallows that
  Esc, so the game listens for the mouse being released instead (`InputManager.onUserUnlock`).
- *"Can you play without a mouse?"* Yes: the arrow keys look around while W, A, S and D move,
  number keys pick dialogue options, Enter presses the focused button, Tab moves between buttons
  in menus.
- *"Where do the controls come from?"* One table, `controls.ts`, read by the player code, the
  Controls screen and the how-to-play document, so they can never disagree.

## The first load and the light budget (`ShipInteriorScene.applyLightBudget`)
- *"Why did the first load get faster?"* The graphics card has to compile a small program
  (a shader) for every material, and three.js writes every light into every shader. The Wren had
  41 lights. We kept the 16 that light the most of the room; the screenshots differ by about
  2 out of 255 brightness levels per pixel, and a fresh browser reaches the game about twice as
  fast (docs/PERF_LOG.md has the numbers).

## The motion system (`src/motion`)
**What:** one module for everything that moves: springs and damping for anything that follows a
target, tweens and timelines for anything authored, and a shared set of durations and easing curves
(the tokens) that the CSS uses too. Its conductor can hide the HUD, and it calms the background motion
during a big moment (the Heart waking, the cruise's title).
**Why:** one way to move, so the same kind of movement feels the same on every screen
(docs/DESIGN.md §3).
- *"Why does the jump feel the same on a slow laptop?"* The physics steps are written so the result
  doesn't depend on the frame rate: `tools/test-frame-rates.mjs` jumps at 30, 60 and 144 frames a
  second, and the peak is 1.000 m every time.
- *"What does reduced motion do?"* Settings → Reduced motion: no head bob, camera shake, zooms or
  sweeping camera moves; transitions become short fades.
- *"What does 'nothing animated for its own sake' mean?"* Things that loop are things you can act
  on (a button you can press, a beacon to walk to); the rest moves only when something happens.

## The two Kethra mini-games (`src/planets/kethra/canopy/`, `src/planets/kethra/hush/`)
**What:** MG2, the Canopy: the skiff drops through five layers of boughs in the dark; you steer it
and its lamp, and the lamp wakes the seed pods it touches, which light the boughs around them for a
few seconds (Shift brakes the fall). MG3, the Hush: cross the Heart's chamber without the Wickmoth
seeing your lantern (hood it with F or the right mouse button), then breathe the Rite's three
colours (1, 2, 3) while it looks away. Seen, a gust carries you back to the last lamp.
**Why:** the brief asks for three mini-games that differ in verb, camera and pace: MG1 plans on a
chart, MG2 steers from a chase camera, MG3 sneaks in first person.
- *"Do the stats matter here?"* Yes: in the Hush, Archaeology 3 names the first colour, Insight 3
  marks where the moth lands next, Perception 2 shows where its gaze is heading.
- *"What happens if you fail?"* Each has a fail state and an immediate retry close by: the skiff
  climbs back to the last layer it passed, the gust leaves you at the last lamp. Tested by
  `test-mg2-flow.mjs` and `test-mg3-flow.mjs`.
- *"Where are the rules?"* `canopy/layout.ts` (the boughs) and `hush/sim.ts` (the moth, its sight
  and the Rite), separate from the drawing, so `test-canopy-layout.mjs` and `test-hush-sim.mjs`
  check them without a browser.

## First light and the cruise (`src/ship/FirstLight.ts`, `src/galaxy/CruiseScene.ts`)
**What:** setting the first course starts First light: the cabin drops to emergency light and you
hold Space (or the mouse button) to push the throttle through four ignitions while a wave of power
runs from the stern to the helm; let go and it spools back to the last lit engine. Then the camera
passes out through the viewport into the cruise: the launch, the trip, the planet, and the skiff's
drop into the canopy (Kethra) or the docking (Vessek).
**Why:** the first time the ship flies should be something you do, not a cutscene; and the cruise is
where the next level is built, so there is no loading screen on the way out.
- *"Can I skip the cruise?"* Hold Space or Enter for under a second.
- *"Why 45 seconds?"* It covers the next level's build on a slow laptop; its last shot holds until
  the level is ready.
- *"How does it reach MG2 without a cut?"* The cruise's last shot eases onto MG2's opening framing,
  so the skiff keeps its place and size across the change.

## Fewer draw calls in the Wren (`src/ship/interior/batchStaticGeometry.ts`, `materialMerge.ts`)
**What:** the Wren is built from about 1,800 small meshes (every bolt, cable and light is its own
piece). After the room is built, pieces that look the same are merged into one, and pieces that
differ only in colour, shininess or glow share one material, with those values stored per vertex.
**Why:** each separate piece costs the graphics card a "draw call", and a school laptop runs out of
time for them first. On Performance the Wren went from 246 draw calls to 138 (budget 150), on Quality
from 500 to 334 (350) (DECISIONS D-40).
- *"Does it look different?"* The same 56 views rendered before and after differ about as much as
  the old build differs from itself between runs (0.1–0.2% of pixels), with one faint local
  difference on the big screens (D-40).
- *"What can't be merged?"* Anything that moves or that you interact with (the console's targets,
  the finds), and anything whose look animates on its own (flickering lights, the throttle).
- *"What if shadows are on?"* Merged pieces would share shadow settings, so on a machine drawing
  shadows the pieces are kept apart by their shadow settings as well.

## The seams test (`stress_tests/s15-seams.mjs`)
**What:** the stress scenario for where the two branches' work met (2026-10-25): no look prompt
over MG1's win, a held Enter on Chapters not replacing your save, the first jump after a skip,
chapter snapshots, Kethra's step and loam, the quality switched mid-room, the ` readout, and the
console guide after a failed download.
- *"Why a separate test?"* Its checks for the bugs failed on the build before the fixes and pass
  after, so they keep the bugs from coming back; the rest guard things that already worked.
