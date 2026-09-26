# UI and Game-Feel Changelog (for the team)

Every screen and every game-feel change from the art-direction pass: what changed, why, which
rubric line it serves, and two sentences you can say to a judge. The rules behind all of it are in
`docs/STYLE_BIBLE.md`; the before/after screenshots are in `docs/screens/before/` and
`docs/screens/after/`.

Rubric shorthand: **C&A** = Creativity and Artisanship (×2), **Appeal** = Overall Appeal (×2),
**Tech** = Technical Skill (×2), **Story** = Storyline and Flow, **Directions** = Game Directions
and Control Functions.

---

## Screens

### Title screen and logo
- **What changed:** the name "Kethra" is now a logo made of type. The Wren's amber scan line cuts
  through the letters; above the line they are ink, below it they take the grove's sea-green. Only
  one thing moves by itself (the planet slowly turning). Buttons are sentence case in the body font.
- **Why:** the old title was a generic launcher layout. The scan line is the game's verb (reading
  light), so the logo says what the game is about before anyone presses a key.
- **Rubric:** C&A, Appeal.
- **Say it:** "Our logo is the game's main action drawn in type: the ship's scanner line passes
  through the name and the letters below it light up green like Kethra's forest. We kept exactly one
  thing moving on the title so it feels alive without being busy."

### HUD: objective, meter and key strip
- **What changed:** the objective sits in a framed strip top-left and flashes amber for a moment
  when it changes. When there's a timer (the Anchorage's frost clock) it stacks directly under the
  objective in the same column. Bottom-right is the key strip: your level with an XP bar that slides
  when you earn XP, then Tab / O / Esc.
- **Why:** the old HUD had three competing blocks and floating badges. Now each thing has one home
  and never moves.
- **Rubric:** Appeal, Directions.
- **Say it:** "Everything the player needs mid-game lives in two fixed frames, so the eye always
  knows where to look. Numbers that change, like XP, animate instead of jumping, so you notice you
  earned something."

### Toasts (short news messages)
- **What changed:** moved from the middle of the screen to a log in the lower-left. Each one has a
  small coloured square (a "status pip"): sea-green for something learned, amber for something you
  can now act on, red-orange for a failure, grey for plain information. At most four at once.
- **Why:** toasts in the centre covered the thing you were trying to use.
- **Rubric:** Appeal, C&A.
- **Say it:** "Game news appears in the corner, not over what you're looking at. The colour of the
  little square tells you whose news it is before you read a word."

### Captions
- **What changed:** every caption in the game (intro, tutorial, galaxy reveal, the Anchorage pulse)
  now uses one style: body font over a soft dark gradient, with a short amber line above it.
- **Why:** there used to be three different caption styles within the first two minutes.
- **Rubric:** C&A.
- **Say it:** "The game speaks in one voice on screen: every caption looks the same. That
  consistency is what makes it feel finished."

### Dialogue
- **What changed:** the dialogue box sits in the lower third so the character stays visible above
  it. Options are numbered; number keys 1–9 pick them, and focus starts on the first one. Stat-gated
  options show the stat as a small sea-green tag; locked ones say which stat and level they need.
  Options now use the body font (they were falling back to the browser's Arial).
- **Why:** keyboard-only play, and so the TSA challenge (stats change conversations) is visible.
- **Rubric:** Appeal, Directions, Tech.
- **Say it:** "You can hold a whole conversation with the number keys. When an option needs a skill
  you don't have yet, it tells you exactly which one, so stats clearly matter."

### Pause menu (new)
- **What changed:** Esc during play opens Paused, with your current objective, Resume, Settings,
  Controls, Restart this level (inside a level) and Save and quit to title.
- **Why:** there was no pause menu or restart option; the TSA brief asks for both.
- **Rubric:** Appeal.
- **Say it:** "Pressing Esc pauses the game and reminds you what you were doing. You can restart the
  level you're in from the moment you arrived."

### Settings
- **What changed:** three sections. Sound: master, music and effects volume. Graphics: Auto /
  Performance / Balanced / Quality with one plain sentence each, plus individual effects. Comfort
  and access: reduced motion, text size (Default / Large / Larger) and mouse sensitivity. Custom
  switches and segmented buttons replace the browser's raw checkboxes. Everything is saved, and
  still works for the session if the browser blocks saving.
- **Why:** the old panel only had graphics options in technical words (Low/Medium/High).
- **Rubric:** Appeal, Tech.
- **Say it:** "Settings speak the player's language: 'Performance' says what it's for, where 'Low'
  sounds like a worse version. Text size and reduced motion are there because not every judge plays
  the same way."

### Controls screen
- **What changed:** built from one table in the code (`src/content/controls.ts`) that the player
  controller also reads its keys from. Keys are shown as key caps.
- **Why:** the written controls can never disagree with the real ones.
- **Rubric:** Directions, Tech.
- **Say it:** "The controls screen and the code read the same list, so if we change a key, the
  screen changes with it. The instructions can't go out of date."

### Character sheet
- **What changed:** level and an XP bar at the top, each stat with a one-line description of where
  it actually matters in the levels, and "+1" buttons when you have skill points.
- **Why:** levelling up gave skill points that could not be spent anywhere. That's fixed.
- **Rubric:** Tech (RPG system), Appeal.
- **Say it:** "Each stat tells you where it's used, like 'reads Kindling script'. Skill points from
  levelling are spent here, and using a skill also raises it."

### Journal
- **What changed:** one tab control (Travel logs / Evidence board) instead of a mix of an underlined
  link and a bordered button; the close hint moved into the panel's footer.
- **Rubric:** C&A.
- **Say it:** "We made the journal use the same controls as every other screen. Small, but judges
  notice when two buttons on one panel look different."

### Repair station
- **What changed:** Repair buttons are amber only when the repair is possible; otherwise they show
  as disabled and say what's missing when you hover. Repairing plays the success sound. After the
  Anchorage, a Transmit button appears here.
- **Rubric:** Appeal.
- **Say it:** "A button only looks pressable when pressing it will work. The repair station is also
  where the ending starts, so the last action of the story is yours."

### Navigation map
- **What changed:** Vessek Anchorage has its own deck-plan chart. The map opens on the story's next
  destination with Set Course focused, and Left/Right cycle worlds. Buttons and labels moved to
  sentence case; status badges lost their pill shape.
- **Rubric:** Directions, Appeal.
- **Say it:** "The map opens on where you should go next, so a keyboard player can press Enter to
  travel. Every world you can visit has its own chart."

### Breaker panel (level 3 puzzle)
- **What changed (new):** six breakers, each with a note written by a different ship's crew, a
  six-cell bus-load meter, the frost clock, and a message line that explains every trip or refusal
  in plain words. State is shown as text and a square lamp, never colour alone.
- **Rubric:** Tech, Appeal, C&A.
- **Say it:** "Every failure tells you why it failed, like 'that asked for 8 units and the bus
  carries 6'. The clues are written in six different crews' handwriting, which is the Anchorage's
  story told through a puzzle."

### Rite panel (Kethra's Cistern Heart)
- **What changed:** each colour now has its own glyph shape (a wave, a rayed sun, a branching leaf),
  drawn by the same code that carves them into the Heart's stone vanes. Number keys pick colours, and
  a row of bars shows how many breaths are held.
- **Why:** the puzzle used to depend on telling colours apart (backlog B-11).
- **Rubric:** Appeal (accessibility), C&A.
- **Say it:** "You can solve the colour puzzle without seeing colour, because every colour has a
  shape. The same shapes are carved on the machine in the world, so the screen and the level match."

### Document reader (new)
- **What changed:** reading an inscription, the ledger or the ring plate opens the text on screen at
  once.
- **Why:** before, the text only went into a journal you could open only on the ship.
- **Rubric:** Story, Appeal.
- **Say it:** "When you find a piece of the story, you read it right there. The journal keeps it for
  later."

### Chapter cards (new)
- **What changed:** a card in the upper third names each level when you arrive ("Level 3 · Vessek
  Anchorage") and marks it complete, with one line of what you achieved. Any key dismisses it early.
- **Rubric:** Story (transitions carry context).
- **Say it:** "Every level starts and ends with a card that says where you are and what you did. The
  story doesn't reset between levels; it's summed up."

### Loading bar
- **What changed:** a real progress bar with what's happening ("Waking the Wren", "Warming up the
  graphics card") and a line of lore, instead of a spinner.
- **Rubric:** Appeal, Tech.
- **Say it:** "The loading screen tells the truth about what it's doing. While you wait, it teaches
  you a line about the world."

### Scan-line transition (signature transition)
- **What changed:** a thin amber line sweeps down the screen and the world goes dark behind it
  (260 ms); the next place is painted back in by the same line (300 ms). It replaces a 1.2 s fade
  out plus a 1.2 s fade in.
- **Rubric:** C&A, Appeal.
- **Say it:** "Our transition is the Wren's scanner reading a new place, the same line as the logo.
  It takes about half a second instead of two and a half."

### Ending and credits (new)
- **What changed:** after comms are repaired, you choose to transmit the ledger. The Wren sends it
  as rings of its own amber light; Kethra answers green in the distance; four lines close part one.
  Then credits: the team number and every licensed asset, with "Keep exploring" or "Title screen".
- **Rubric:** Story, C&A.
- **Say it:** "The story ends on the same idea it started with: light. The ship that went dark at the
  start sends a message home as light at the end."

### "Graphics unavailable" screen (new)
- **What changed:** if the browser has WebGL 2 switched off (some school Chromebooks), the game shows
  a clear explanation with three things to try, instead of a black page.
- **Rubric:** Tech, Appeal.
- **Say it:** "If a school computer blocks 3D graphics, the game says so and explains how to fix it.
  A black screen would lose us the judge; a clear message doesn't."

---

## Game feel

### Coyote time
- **What:** a jump still works for 0.1 s after you walk off a ledge (`COYOTE_TIME` in
  `src/content/tuning.ts`). Named after cartoon characters who run off cliffs and only fall when they
  look down.
- **Rubric:** Appeal.
- **Say it:** "Platform games give you a tiny grace window after a ledge, because players press jump
  a moment late. Ours is a tenth of a second, and it doesn't change how high or far you jump."

### Jump buffer
- **What:** pressing jump up to 0.12 s before landing still jumps on touchdown (`JUMP_BUFFER`).
- **Rubric:** Appeal.
- **Say it:** "If you press jump just before you land, the game remembers it. It makes jumping feel
  like it listens to you."

### Landing dip and thud
- **What:** on a hard landing the camera dips and springs back, and a low thud plays, both scaled by
  how far you fell.
- **Rubric:** Appeal, C&A.
- **Say it:** "Landing has weight: the view dips and you hear it. A small fall barely registers; a
  big one does."

### Strafe lean
- **What:** the camera rolls very slightly into sideways steps.
- **Rubric:** Appeal.
- **Say it:** "Stepping sideways tilts the view a little, the way your head does. You feel it more
  than you see it."

### Button hover and squash
- **What:** every button lifts 1 px on hover and squashes to 97% when pressed, with a focus ring for
  keyboard players.
- **Rubric:** C&A, Appeal.
- **Say it:** "Every button reacts to you in three ways: hover, press and keyboard focus. It's the
  difference between a web form and a game menu."

### Sounds per interaction class
- **What:** one sound family ("glass and hum"), all tuned to A minor pentatonic so nothing clashes:
  hover tick, confirm (rising fifth), cancel (falling fourth), collect (three-note arpeggio), success
  (a soft chord), fail (a muffled low pair, never harsh), level start (a rising sweep), level end (a
  four-note cadence). All made in code with the Web Audio API; no sound files.
- **Rubric:** C&A, Tech.
- **Say it:** "Every kind of action has its own sound, and they're all in the same musical key, so
  the game sounds like one thing. We generate them in code, so there are no audio files to license."

### Generative music per place
- **What:** each place has a music bed built in code: a slowly breathing chord and sparse plucks at
  random intervals, so it never loops audibly. The Wren is a low drone, Kethra an open fifth with
  wind-chime plucks, the Anchorage uneven hums like ships on different power grids. Music and effects
  have separate volumes.
- **Rubric:** C&A, Tech.
- **Say it:** "The music is written by the code while you play, so it never repeats the same way.
  Each place has its own sound that matches how it looks."

### Camera shake, reserved for three moments
- **What:** shake is used only for the white sky in the intro, the Anchorage's rehearsal pulse and
  the Cistern Heart waking.
- **Rubric:** C&A.
- **Say it:** "The screen only shakes three times in the whole game, at the three biggest moments.
  Shake that happens all the time stops meaning anything."

### Reduced motion
- **What:** one switch in Settings (on by default if the computer's own setting asks for it). It
  turns off head bob, landing dip, strafe lean and camera shake, replaces the scan-line sweep with a
  quick cut, dims the white flash, and stops the title planet turning.
- **Rubric:** Appeal.
- **Say it:** "Some players get motion-sick or distracted by movement, so one switch turns all of it
  off. The game plays exactly the same either way."

---

## How to talk about our art direction

1. "Our one visual idea is: *In a dark, cold system, every living thing announces itself with its
   own light (amber for the Wren, sea-green for Kethra's grove, patchwork lamps on the Anchorage),
   and the white sky is the one light that washes them all out.*"
2. "Colour in our game always says whose light it is: amber means the player's ship and things you
   can act on, sea-green means something you learned, and white is the danger."
3. "We wrote a style bible first (seven named colours, two typefaces, one line style, one
   transition) and rebuilt every screen from the same small set of pieces."
4. "Our signature transition and our logo are both the ship's scan line, because reading light is
   what the player does all game."
5. "We checked every text colour for contrast and every screen at laptop size, and we added reduced
   motion, text size and full keyboard play so more judges can play it the way they need to."
