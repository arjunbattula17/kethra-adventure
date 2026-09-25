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
