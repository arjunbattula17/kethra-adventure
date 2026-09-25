# Style Audit (before)

Screenshots: `docs/screens/before/`, captured by `tools/capture-screens.mjs before` at 1366×768
with the low quality tier and a software renderer. Kethra was also checked on a real GPU at the
high tier (the problems below are the same there, just better lit). Scores are [opinion].

## Screen by screen

| # | Screen | What reads as unfinished or generated |
|---|---|---|
| 01 | Title | Every button label in spaced ALL CAPS. The planet is a flat texture with no motion. Nothing on the screen is from *this* game's story except the word "Kethra"; the Wren, the white sky and the amber light are absent. The four buttons are identical rectangles with the primary one filled amber, a generic launcher layout. |
| 02 | Controls | Readable, but the key caps are small amber-on-grey pills and the row labels are the system font (Segoe UI on Windows, a different face on a Mac). "Everything is taught in the first minute" is a claim, not a help. |
| 03 | Credits | Same panel as every other screen. |
| 04 | Settings | Raw browser radio buttons and checkboxes. Only graphics options: no volume, no reduced motion, no text size. "Low / Medium / High" says nothing a player can act on. The close hint sits in the far bottom-right corner, far from the panel. |
| 05 | Loading | A spinner and "LOADING…" with no progress. The intro's first frame bleeds through the overlay, so the letterbox and a faint ship are visible behind the text. |
| 06–07 | Intro | Strong: the exposition line has a proper rule and margin. The SPACE/SKIP chip is in a different style from every other key cap. |
| 08 | Tutorial | The caption "Emergency reboot complete…" is plain white system text with a shadow, floating with no frame, unlike the intro's styled line one second earlier. |
| 09 | Ship HUD | Three competing HUD blocks: the objective card (top-left), three key badges (top-right) and a centred **pill-shaped "CLICK TO LOOK AROUND" button with a glow**, the look the brief lists as a default. Toasts stack in the middle of the view, over the play space. "LV 1" and "TAB — Character" float as badges with no frame hierarchy. |
| 10 | Interact prompt | Good idea (E key cap + label), but it sits directly over the thing you are looking at. |
| 11 | Character sheet | "EXPLORER — LEVEL 1" in caps; the stat descriptions promise things that don't happen yet ("on the evidence board"). No XP bar, just "0 / 100 XP". Save/Load buttons are debug-looking outline buttons. |
| 12 | Journal | The tab row mixes an underlined link style (active) with a bordered button (inactive). The list cards are the same rounded card as every other panel. |
| 13 | Repair | Seven identical rows, each ending in a grey "Repair" button that is enabled-looking even when it can't work. The one repaired row uses a different button label ("Repaired") in the same slot. |
| 14–15 | Map | The most finished screen. Minor: its labels are all caps; "UNRESOLVED CONTACT" three times. |
| 17 | Transition | A plain 1.2 s fade to black, used between every scene, twice per change (out and in): 2.4 s of black per travel. |
| 18 | Galaxy reveal | Good composition. The caption is plain system text with no frame, a third caption style. |
| 19 | Course plot | A keypad quiz (known, D-7). The numeric keypad is a calculator. |
| 20 | Kethra arrival | **The worst screen in the game.** Red and yellow autumn foliage under a "bioluminescent" canopy that the art bible says is teal-green; a brown mud ground; purple octahedron crystals floating in the grass; the return pad is a purple pyramid on a box. |
| 21 | Dialogue | **The Aiveth are a purple capsule with a pink sphere for a head.** The options are the browser's default Arial (buttons don't inherit the body font). The speaker name is in caps. |
| 22 | Cistern Heart | The Heart, the climax of level 2, is a flat purple octahedron. The Wickmoth is a glowing green sphere. The toast covers the object you are trying to use. |

Missing states and screens (no screenshot possible, because they don't exist): a **pause menu**,
a **level-complete** beat, a **level 3**, an **ending**, a **fail/retry** state (the only failure
is falling off Kethra, which is a toast), and **hover/pressed/disabled** states on the repair
and dialogue buttons.

## The five questions

**What is the one visual idea this game has right now?**
Warm amber light in a cold dark ship. The interior's emergency amber against blue steel, the
amber UI accent and the amber exposition rule in the intro all say "this light is alive, and
it's yours". It is a real idea, but only the Wren has it; Kethra, the UI and the title each
speak a different language.

**What is the single worst screen a judge will see?**
Kethra's arrival and the first conversation (20–22). A judge meets the game's first other
people and they are untextured capsules; the level's climax is a primitive shape. Everything
the ship gets right (motivated light, material, story in props), Kethra's actors and puzzle
objects get wrong, and it's the second thing every judge sees.

**Where does the game feel best to control, and where worst?**
Best: the console sit-down (a bezier glide with a weighted drop into the chair and a contact
thud); it's the one moment where movement has anticipation and settle. Worst: jumping and
landing on Kethra's terraces. There is no coyote time, no input buffer and no landing
response, so ledge jumps feel like they fail at random, and there's no sound or camera
reaction to anything except footsteps.

**Scores today** [opinion, on the 1–10 row scale]
- Creativity & Artisanship: **6**. The ship interior and intro are genuinely crafted, which
  would be an 8. The capsule NPCs, primitive puzzle objects, off-palette Kethra and four
  different caption styles pull it to the middle band.
- Overall Appeal: **5**. The first minute is good; then the HUD crowds the view, there's no
  pause, settings are graphics-only, and the game stops after level 2 with no ending.

## Defaults found in the first pass (added to the avoid-list)
- **Buttons that don't inherit the body font** (browser Arial in dialogue options).
- **The same caption drawn three different ways** (intro, tutorial, reveal).
- **Toasts in the centre of the play view.**
- **A double fade (out 1.2 s + in 1.2 s) as the only transition.**
- **Primitive stand-ins (capsule, sphere, octahedron) left in as final art.**
- **Autumn-red kit foliage used as-is** because it came with the pack.
