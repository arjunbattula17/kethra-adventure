# Changelog for the team

Every meaningful change from the level 3 / art direction / performance session. Each entry lists
what changed, why, the rubric line it serves, and what to say to a judge in two sentences.
Measured numbers cite their files; the rest is description.

---

## Story and levels

### Level 3: Vessek Anchorage
- **What:** a new level in the Lantern Bay, the oldest ship in a ring of stranded hulls.
  - Dace and Harbormaster Varro.
  - A white-sky "rehearsal pulse" that blacks out the ring deck by deck.
  - The breaker puzzle, the ledger and the conduit alloy.
  - Files: `src/planets/vessek/`.
- **Why:** the rules require three levels and judges play through level 3. LORE.md had already
  planned this one, with the story's reversal in it.
- **Rubric:** hard constraint; Storyline & Flow; Creativity.
- **Say:** "Level 3 is a stranded community where a power failure forces a choice about whose
  lights stay on. It's also where you learn that fixing Kethra's Heart made the signal worse."

### The ending
- **What:**
  - Repairing long-range comms offers "Send the ledger home?".
  - The closing cinematic shows the transmission as a ring of the Wren's amber light, then credits
    (`src/galaxy/EndingScene.ts`).
- **Why:** the story needed a payoff, and the credits must name the licensed assets.
- **Rubric:** Storyline & Flow; Overall Appeal.
- **Say:** "The last thing the player does is choose to transmit, so the ending is an action, not a
  cutscene. The light of the message is the same amber as every button you can press in the game."

### Chapter cards
- **What:** a card names each level on arrival ("Level 3 · Vessek Anchorage") and marks it complete
  with what the player gained.
- **Why:** transitions should carry context instead of just resetting.
- **Rubric:** Storyline & Flow.
- **Say:** "Between levels the game tells you where you are and what you achieved. Judges asked for
  context in transitions, and this is it."

---

## Art direction

### Designed characters instead of capsules
- **What:** `src/characters/Figure.ts` builds faceted low-poly people in the style of the Quaternius
  kits, with breathing, sway and heads that turn toward the player.
  - The Aiveth are tall, with glowing veins.
  - Varro has a work coat and her ledger.
  - Dace has a headlamp and tool pouches.
- **Why:** the audit found the Aiveth were a capsule with a sphere head. That was the screen most
  likely to read as placeholder art.
- **Rubric:** Creativity & Artisanship.
- **Say:** "Every character is built in code from a few shapes and animated so they breathe and
  look at you. The Warden's light starts dim and brightens as she trusts you, which is how the
  Aiveth 'talk' in our story."

### Kethra's set pieces and palette
- **What:** four primitive stand-ins replaced, and the grove recoloured (`src/planets/kethra/grove.ts`).
  - The Wickmoth is a moth with stained-glass wings.
  - The Cistern Heart is a Kindling machine: a basin, three colour vanes and a glass core.
  - The lantern bloom is the light you close to calm the Wickmoth.
  - A carved stele is the shrine.
  - Red autumn leaves were tinted to the art bible's sea-greens.
- **Why:** the art bible says Kethra is bioluminescent green and teal. The kit's red trees and
  purple octahedrons broke that.
- **Rubric:** Creativity & Artisanship.
- **Say:** "The grove's only strong colours are the three colours of the Rite, so your eye goes to
  the puzzle. We tinted the downloaded trees by brightness so they keep their painted detail but
  match our palette."

### Style bible and style audit
- **What:** `docs/STYLE_AUDIT.md` lists what looked unfinished on every screen. `docs/STYLE_BIBLE.md`
  sets:
  - one visual idea ("every living thing announces itself with its own light");
  - seven colours, with contrast ratios checked;
  - two fonts;
  - motion timings and the sound family;
  - the component list.
- **Why:** consistency across screens matters more than any one screen.
- **Rubric:** Creativity & Artisanship.
- **Say:** "We wrote our rules down before changing anything: amber means 'you can act here', and
  sea-green means 'you learned something'. Every screen was rebuilt to follow them."

---

## Interface

### One UI component set
- **What:**
  - Atkinson Hyperlegible for all reading text (a font designed by the Braille Institute for
    legibility) and Rajdhani for headings.
  - Sentence case, and buttons with hover, press, focus and disabled states.
  - One caption style, and toasts moved to the lower left with a coloured pip.
  - No pill shapes (`src/style.css`, `src/ui/UIManager.ts`).
- **Why:** the audit found three caption styles, Arial on buttons, and toasts covering the middle
  of the view.
- **Rubric:** Creativity & Artisanship; Overall Appeal.
- **Say:** "Every panel, button and message is built from the same small set of pieces, so the game
  looks like one thing. We picked a font made for readability, because judges play on laptops at
  arm's length."

### Scan-line transition
- **What:** scene changes use a thin amber line that sweeps down the screen (260 ms out, 300 ms in),
  replacing a 1.2 s fade out plus a 1.2 s fade in.
- **Why:** the signature transition should come from the game's own idea (the Wren's scanner reading
  a new place). It is also faster.
- **Rubric:** Creativity; Overall Appeal.
- **Say:** "When you travel, the ship's scanner line paints the new place in. It's under 600
  milliseconds, so it never makes you wait."

### Pause menu, settings, controls table
- **What:**
  - Esc opens the pause menu: resume, settings, controls, restart this level, and save and quit.
  - Settings has master, music and effects volume, and quality (Auto, Performance, Balanced,
    Quality, each explained in one line). It also has reduced motion, text size and mouse
    sensitivity. All of it is saved, and it still works where storage is blocked.
  - Every key is defined once in `src/content/controls.ts`.
- **Why:** the rubric asks for pause, volume, restart, and directions that match the real controls.
- **Rubric:** Overall Appeal; Game Directions & Controls.
- **Say:** "The controls screen and our how-to-play document are printed from the same table the
  player code reads its keys from, so they can't disagree. Settings covers comfort as well as
  graphics: reduced motion turns off head bob, shake and sweeping transitions."

### Keyboard-only play
- **What:**
  - Arrow keys turn; A and D step sideways.
  - Number keys choose dialogue options and Rite colours.
  - Tab and Enter work every menu.
  - The map preselects the next destination, and the arrow keys change it.
- **Why:** some players can't use a mouse, and the brief requires a keyboard-only path.
- **Rubric:** Overall Appeal.
- **Say:** "You can finish the whole game without touching the mouse. We tested it by driving the
  levels with key presses only."

### Character sheet: spendable skill points
- **What:** levelling up gave points that nothing let you spend. The sheet now has a +1 button per
  stat, an XP bar, and stat descriptions that say where each stat matters.
- **Why:** it was a broken RPG promise; the TSA challenge centres on stats.
- **Rubric:** Technical Skill; theme.
- **Say:** "Skills grow when you use them, and each level also gives a point you choose where to
  spend. The sheet tells you exactly what each skill opens, so the choice means something."

### Journal, map, document reader
- **What:**
  - The journal's tabs now match the settings controls.
  - The map knows about Vessek and has its deck plan.
  - Inscriptions and the ledger open as readable documents on the spot.
- **Why:** the text a player finds should be readable when they find it, and every screen should
  use the same pieces.
- **Rubric:** Overall Appeal.
- **Say:** "When you read the Anchorage ledger, the page opens right there. It also goes into your
  journal for later."

---

## Game feel

### Movement and feedback
- **What:**
  - Coyote time (a jump still works 0.1 s after you step off a ledge) and a jump buffer (a press
    0.12 s early still counts).
  - A landing dip with a thud, and a slight lean when strafing (`src/player/PlayerController.ts`,
    values in `src/content/tuning.ts`).
- **Why:** ledge jumps on Kethra felt like they failed at random.
- **Rubric:** Overall Appeal.
- **Say:** "The game forgives a jump pressed a moment too late or too early, the way most modern
  platformers do. The jump height didn't change, so the levels still fit."

### Sound and music
- **What:**
  - One sound per kind of action (hover, confirm, cancel, collect, success, fail, level start,
    level end), all in A minor pentatonic.
  - Generative music for the Wren, Kethra, the Anchorage, the title and the ending
    (`src/audio/AudioSystem.ts`).
  - No audio files.
- **Why:** there was no music, and every action needs feedback.
- **Rubric:** Overall Appeal; Technical Skill.
- **Say:** "All our sound is made by code as it plays, tuned to one scale, so the buttons are in
  key with the music. Each place has its own music that never loops the same way twice."

### Kind, fast failure
- **What:**
  - In the breaker puzzle, an overload says exactly what happened ("asked for 8 units, the bus
    carries 6").
  - If the frost clock runs out, backup warmers give another try at once.
- **Why:** failure should be clear and cheap.
- **Rubric:** Overall Appeal.
- **Say:** "When you fail, the game tells you why in one sentence and lets you try again
  immediately. Nobody is ever hurt; the worst that happens is the plants get cold."

---

## Performance and reliability

### Point-light budget
- **What:** the Wren's interior had 41 point lights, and each one is written into every shader.
  - It now keeps the 16 strongest (8 on Performance).
  - The room's look changed by an average of 2 out of 255 per pixel across five views.
  - Throttled, New game to a playable intro dropped from 65.0 s to 21.8 s
    (`introFromNewGameMs` in docs/perf/baseline/low-tier and docs/perf/final/low-tier).
- **Why:** a judge on a fresh browser was waiting over a minute.
- **Rubric:** Technical Skill; Overall Appeal.
- **Say:** "We measured where the first load went and found 41 small lights making every shader
  huge. Keeping the 16 that matter made the first load about three times faster, and you can't
  see the difference."

### Resilience
- **What:**
  - A clear screen where WebGL 2 is switched off, instead of a black page.
  - Recovery if the browser resets the graphics card, including rebuilding the reflection map.
  - Sound stops in hidden tabs, and switching away pauses the game.
  - A 30 fps cap on a laptop below 20% battery.
  - Real loading progress, and no per-frame allocation in the governor or player controller.
- **Why:** school Chromebooks often have graphics locked, and a silent black screen is the worst
  outcome.
- **Rubric:** Technical Skill; hard constraints.
- **Say:** "If your computer can't run WebGL, the game tells you what to try instead of showing a
  black page. We test that, and a graphics reset, with an automated script."

### Tests and tools
- **What:**
  - `test-vessek-flow.mjs`: 29 checks through level 3 and the ending.
  - `test-resilience.mjs`, `browser-matrix.mjs` (four browsers), `perf-run.mjs` (a throttled
    weak-laptop profile), and `capture-screens.mjs` (before/after screenshots).
  - The Kethra flow test was updated for the new call-stone.
- **Why:** so every claim in these documents is something we measured.
- **Rubric:** Technical Skill.
- **Say:** "Scripts play each level the way a player would and fail if anything breaks. We ran them
  before every commit."
