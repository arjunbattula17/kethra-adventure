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

## Loading before the intro (`src/core/GameFlow.ts`, `Engine.prewarmScene`)
**What:** on a new game, the ship interior is built, its shaders compiled, and one frame drawn
invisibly, all under the loading screen, before the intro starts.
**Why:** compiling ~93 shader programs on a fresh browser freezes the GPU. Done during the intro,
that froze the intro's first frame for ~11 s. Same total wait, but now it happens behind a
loading screen.
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
- *"Can I skip it?"* Any time: Space, Enter, or click.
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
- *"What can't you test?"* Other browsers and real Chromebooks, until we run them by hand
  (BACKLOG B-5).

## Title screen (`src/ui/TitleScreen.ts`)
**What:** the first screen: Continue / New Game / Controls / Credits / Settings. Plain HTML and
CSS, so it appears instantly.
**Why:** the rules require a controls screen reachable from a menu; the CC BY assets need visible
credit; and browsers won't play sound until the player clicks something.
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
- *"How does the breaker puzzle work?"* `BreakerPuzzle.ts`: six circuits, a bus that carries 6
  units. The heaters need the pumps, everything needs the regulator, and two circuits switch
  themselves back on. The heaters and scrubbers need exactly 6, so the answer is to switch *off*
  the dock lights and the harbormaster's own hall lamps first. Each breaker's label is a note from
  a different crew: reading the room solves it.
- *"What happens if you run out of time?"* The seedlings frost, Dace's backup warmers buy another
  try, and the breakers reset at once. Failing costs seconds, never progress.
- *"Where do the stats matter?"* Engineering shows the load on each breaker; perception notices
  which circuits came back on by themselves; traversal gets you through Dace's duct for extra
  time; persuasion, insight or engineering open better bargains with Varro; archaeology reads the
  Kindling plate under the grate.

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
- *"Can you play without a mouse?"* Yes: the arrow keys turn, number keys pick dialogue options,
  Enter presses the focused button, Tab moves between buttons in menus.
- *"Where do the controls come from?"* One table, `controls.ts`, read by the player code, the
  Controls screen and the how-to-play document, so they can never disagree.

## The first load and the light budget (`ShipInteriorScene.applyLightBudget`)
- *"Why did the first load get faster?"* The graphics card has to compile a small program
  (a shader) for every material, and three.js writes every light into every shader. The Wren had
  41 lights. We kept the 16 that light the most of the room; the screenshots differ by about
  2 out of 255 brightness levels per pixel, and a fresh browser reaches the game about twice as
  fast (docs/PERF_LOG.md has the numbers).
