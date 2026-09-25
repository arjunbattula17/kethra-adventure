# Style Bible

The contract for every screen, effect and sound. It extends the team's ART_BIBLE.md (materials,
lighting, texel density) and LORE.md (what things are); where they overlap, those files win on
the 3D world and this one wins on UI, motion and sound.

## The one visual idea

> **In a dark, cold system, every living thing announces itself with its own light (amber for
> the Wren, sea-green for Kethra's grove, patchwork lamps on the Anchorage), and the white sky is
> the one light that washes them all out.**

Everything below serves that sentence. Light is the game's story (the Choir calls light home),
its verb (the player *tunes* light), and its danger (the white sky). So colour is never
decoration here: a colour on screen always says *whose* light it is.

## Palette

Seven named colours. Each has one job.

| Name | Hex | Role |
|---|---|---|
| **Void** | `#07080a` | Background: space, the page, the transition. |
| **Hull** | `#12161b` | Midground: every panel and HUD frame (at 92% opacity over the scene). |
| **Steel** | `#5d666f` | Lines only: hairline borders, dividers, disabled controls, chart grids. Never text. |
| **Ink** | `#eae2d0` | Foreground text. Warm, never pure white. **Ink-dim** `#a89e88` for secondary text. |
| **Wren amber** | `#d9a441` | **The accent, reserved for "you can act on this":** the primary button, the E key cap, the focus ring, the objective marker, the crosshair on a target. Nothing decorative is amber. |
| **Grove sea-green** | `#5cd1b0` | **The attention colour (never danger):** something new was learned. A journal entry, a clue, a stat gained, a discovery on the chart. |
| **White sky** | `#f3f0ea` | Reserved for the Choir's light: the intro event, the Anchorage pulse, the level transition's flash. Never used for UI. |

Status colours, used only in their one situation: success `#7cbf7c` ("that worked"), warning
`#d06a5c` ("that failed or is damaged"). No red anywhere else, no purple, no gradients between
hues (a gradient only ever fades one colour into Void).

### Contrast (WCAG, text on its real background)

| Text | Background | Ratio |
|---|---|---|
| Ink | Void | 15.5 : 1 |
| Ink | Hull | 14.1 : 1 |
| Ink-dim | Hull | 6.8 : 1 |
| Wren amber | Hull | 8.1 : 1 |
| Void (button text) | Wren amber | 8.9 : 1 |
| Grove sea-green | Hull | 9.7 : 1 |
| Success | Hull | 8.3 : 1 |
| Warning | Hull | 5.1 : 1 |
| Steel | Hull | 3.1 : 1 (lines and disabled outlines only, which need 3:1) |

Computed with the WCAG relative-luminance formula (the command is in DESIGN_NOTES.md). Panels
over the 3D view use Hull at 92%, so even over the brightest thing in the game (a white-sky
frame) the effective background stays dark enough for Ink-dim to pass.

## Type

Two faces, obviously different: one condensed and engineered, one open and round.

- **Rajdhani** (600/700, OFL): *the Wren's voice.* Headings, key caps, numbers, eyebrow labels.
- **Atkinson Hyperlegible** (400/400 italic/700, OFL): *everything you read.* Body, dialogue,
  buttons, captions. Designed by the Braille Institute so similar letters (I l 1, O 0) can't be
  confused, which suits a game played at arm's length on a laptop.

Scale (1366×768 baseline; the text-size setting multiplies all of it by 1.15 or 1.3):

| Token | Size / weight | Use |
|---|---|---|
| `display` | Rajdhani 700, 64 px, -0.01 em | The title logo only |
| `h1` | Rajdhani 700, 28 px | Panel titles |
| `h2` | Rajdhani 600, 20 px | Section heads, speaker names |
| `eyebrow` | Rajdhani 600, 12 px, +0.14 em, caps | One per panel at most, 1–3 words |
| `body` | Atkinson 400, 16 px / 1.5 | Everything read |
| `small` | Atkinson 400, 14 px / 1.4 | Secondary lines, hints |
| `key` | Rajdhani 700, 13 px | Inside key caps |

**Case:** sentence case everywhere. Capitals only on `eyebrow` labels and key caps.

## Scale and rendering

- The world is real-time 3D with no pixel art, so there are no pixel densities to mix. Texture
  density follows ART_BIBLE.md's tiers.
- **UI rendering:** the canvas renders at the device pixel ratio (capped per quality tier);
  UI is DOM and always renders at native resolution, so text stays sharp when the 3D view is
  rendered at a lower internal resolution.
- **One line style:** 1 px hairline in Steel at 45% opacity. Focus and "selected" swap it to
  Wren amber. No double borders, no glows on panels.
- **One shadow: none.** Panels separate from the world by their Hull fill and backdrop blur, not
  by drop shadows.
- **Corner radius by hierarchy:** 2 px for controls and key caps, 4 px for panels and HUD frames,
  and nothing round. Never a pill.

## Motion

- **Easing:** entrances ease out `cubic-bezier(.2,.8,.2,1)`; exits ease in
  `cubic-bezier(.4,0,1,1)`. Nothing the player watches moves linearly.
- **Durations:** press 90 ms, hover 140 ms, panel in 220 ms, panel out 140 ms, toast in 220 ms,
  number count-up 400 ms.
- **What never moves:** the HUD frames, the objective's position, the crosshair's position, the
  title's type. Nothing animates on page load that the player didn't trigger, except the one
  idle motion on the title (the Wren drifting) and the world itself.
- **Buttons squash on press** (scale .97 for 90 ms) and lift 1 px on hover.
- **Signature transition: the scan line.** A thin amber line sweeps down the screen and the
  world behind it goes to Void (260 ms). The next scene is painted back in by the same line
  sweeping down again (300 ms). It's the Wren's scanner reading a new place, which is the
  game's verb. Total motion 560 ms; the load itself happens behind it with a real progress bar.
  Used for every scene change and nothing else. Reduced motion replaces the sweep with a 120 ms
  cut.
- **Camera shake** is reserved for three moments: the white sky in the intro, the Anchorage
  pulse, and the Cistern Heart waking. Nothing else shakes.

## Sound

Family: **glass and hum.** Sine and triangle tones with soft attacks, tuned to one scale
(A minor pentatonic) so every UI sound is in key with the ambient music. Ambience is low beating
hums; no buzzers, no square-wave beeps.

| Interaction class | Sound |
|---|---|
| Hover | a 30 ms glass tick, very quiet |
| Confirm | two notes rising a fifth |
| Cancel / close | two notes falling a fourth |
| Collect / record | three-note glass arpeggio |
| Success (puzzle solved) | a bloom: triad with a slow shimmer |
| Fail | a soft low dyad, muffled, never harsh |
| Level start | a rising filtered sweep (the scan line) |
| Level end | a resolved four-note cadence |

Music: slow generative pads per place, generated in code. The Wren is a low amber drone with
sparse plucks, Kethra is a brighter open fifth with wind-chime plucks, and the Anchorage is an
uneven, patchwork rhythm of hums at different pitches. Separate music and effects volumes.

## Components

Every screen is built from these, and nothing else:

1. **Button**: primary (amber fill, Void text), secondary (Hull, hairline), quiet (text only).
   States: idle, hover (lift + hairline to amber), pressed (squash), focus (amber ring), disabled
   (Steel outline, Ink-dim text, and the reason on hover).
2. **Panel**: Hull 92%, hairline border, 4 px radius, 32 px padding, `h1` title with an optional
   eyebrow, and a close hint on the panel's own footer (not the screen corner).
3. **Dialogue box**: a panel anchored to the lower third, speaker name in `h2` amber, body in
   Atkinson, options as secondary buttons with the stat tag as a key cap.
4. **HUD frame**: the objective strip (top-left) and the key strip (bottom-right). Both are Hull
   frames that never move.
5. **Toast**: a log line in the lower-left, over the key strip's column and away from the view
   centre, with a coloured left bar that says whose news it is (sea-green for discovery, amber for
   "you can act", warning for failure).
6. **Key cap**: Rajdhani on a 2 px-radius Hull cap with an amber hairline.
7. **Progress bar**: 4 px track in Steel, fill in amber (action) or sea-green (learning).
8. **Caption**: the intro's style for every caption in the game: Atkinson 20 px over a Void
   gradient, with a 48 px amber rule above it.
9. **Transition**: the scan line.

## Review against defaults

After drafting, the first pass was checked against what I'd reach for on any sci-fi game:
- *Near-black with a neon accent:* the first draft was exactly that (Void + amber). **Changed:**
  amber is now reserved for actions only, and a second light (grove sea-green) carries learning.
  The palette is organised by *whose light it is*, which no generic sci-fi palette does.
- *Condensed techno heading font with the system body:* Rajdhani was the team's choice and stays,
  but the system body font was a default. **Changed** to Atkinson Hyperlegible, chosen for a
  reason (legibility at distance) rather than for looking futuristic.
- *A fade to black between scenes:* the default. **Changed** to the scan line, which comes from the
  game's own verb.
- *ALL-CAPS tracked labels on everything:* a sci-fi cliché the old UI leaned on. **Changed** to
  sentence case, with caps kept only for eyebrows and key caps.
- *Rounded glowing cards and pill buttons:* **Changed:** no glow, no pill, and radius tied to
  hierarchy.
