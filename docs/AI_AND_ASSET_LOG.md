# AI and Asset Log

Kept current every session. It feeds the Resources and AI Reflection form and the honor statement.
Every third-party and generated asset, with source and licence, is in docs/ASSET_LICENSE_LOG.md;
this file is the record of *who did what*.
Be specific: what the AI produced, what was changed, what the team decided, and what the team
must be able to explain in the interview.

**Overall, from the git history:** 81 of the project's 88 commits (2026-08-22 → 2026-09-24)
carry a "Co-Authored-By: Claude" line, meaning an AI coding assistant (Claude Code) wrote or
co-wrote that change. The team should be ready to say which ideas, art choices and decisions
were theirs, and to explain every system in EXPLAIN_TO_TEAM.md in their own words.

---

## Session 2026-10-16 to 17 (Claude Code, model Claude Opus 5.5)

**Asked for by the team:** a cinematic title screen from a reference image; after seeing it, no
ship, no tagline and no corner text. Later, a new reference image and a detailed brief: a ship like
the reference's, a visibly turning planet, slowly drifting asteroids that don't react to the mouse,
no awkward late pop-ins, nothing broken; then commit, merge into overhaul and master, and deploy.

**What the AI generated or changed**
- `src/galaxy/title/` (the 3D backdrop: planet, rocks, sky, effects) and `titleShip.ts` (the
  cruiser, built in code); `src/ui/TitleScreen.ts` and the title CSS; the start-up order in
  `src/boot.ts`; `tools/test-title.mjs` (39 checks); TITLE_DESIGN.md, DECISIONS D-27, PERF_LOG.

**What the AI found**
- The late pop-ins were timers, not slowness: the scene built itself up in eight staggered fades
  after a 3-4 s wait. Measured, two real slowdowns: the environment map doubled the title's
  preparation, and loading the Wren's assets with the scene on screen dropped 5-6 frames.

**Mistakes the AI made and caught this session**
- Its first ship was a long thin hull seen side-on; a side-by-side with the reference showed it.
- It blamed blocky coastlines on the small planet map; zooming in showed a cut in the bump shading.
- Moving the asset loading after the scene appeared made the arrival stutter; measured, reverted.
- A script's line endings silently made a timing experiment run the same order six times; caught
  because the numbers didn't move.

**What the team must be able to explain**
- Why the title no longer pops in (the scene is complete before it shows and fades in once), and
  why the title's ship differs from the intro's Wren.

---

## Session 2026-10-04 (Claude Code, model Claude Opus 5.5)

**Asked for by the team:** A and D should move you left and right, not look; the mouse should be
the way to look, with the arrow keys as an option for up, down, left and right; and Space should
visibly jump. Earlier in the same session: an analysis-only inventory of every visual element on
Kethra, for replacing art one asset at a time (no files changed).

**What the AI generated or changed**
- `src/content/controls.ts`: the arrow keys are four look bindings; ↑ and ↓ no longer move.
- `src/player/PlayerController.ts`: arrow-key look up and down, and a working jump (D-26).
- The tutorial's first card, README, EXPLAIN_TO_TEAM, CHANGELOG_FOR_TEAM's controls and movement
  entries, DECISIONS D-26, the regenerated CONTROLS_AND_HOW_TO_PLAY.md, and
  `tools/test-controls.mjs`.

**What the AI found**
- A and D already stepped sideways in the live build (measured: D moved the player 2.56 m right
  and turned them 0°). The turning came from ← and →, while ↑ and ↓ moved, so arrow-key players
  read the left and right keys as "look".
- The jump had never worked: it rose 9.5 cm for one frame. No test checked jump height, so the
  new test does.

**Mistakes the AI made and caught this session**
- Its Kethra inventory quoted a code comment's 2.6 m Wickmoth wingspan; measured on the live
  model it is 3.8 m spread (2.1–2.7 m perched), and it corrected the figure.

**What the team must be able to explain**
- Why Space did nothing before (the stair-following floor snap pulled the player back down) and
  why a jump now can't carry you inside an object (colliders block from the take-off height).

**Later the same session — asked for by the team:** fix the bugs found, "like going through
walls", then commit and push without waiting for review.

**What the AI generated or changed**
- `tools/wall-sweep.mjs` (new): walks, sprints and jumps the real player into every wall in the
  three walkable places and checks the body and camera against every visible triangle, then tries
  to walk or jump back from anywhere walking can't reach.
- `src/player/PlayerController.ts`: a move out of a collider the player is already inside is
  always allowed; the crouched eye 10 cm lower; no jump without room to stand; a public
  `overlaps()` for doors.
- Vessek: a lip at each drop vent (`rooms.ts`), grow-table tops as floors, stool and reset-panel
  colliders (`dressing.ts`), colliders for Varro, Dace, the crate, the barrel and the whole pipe
  holder, and the keypad door waiting for the player (`VessekScene.ts`).
- Kethra: the root-tunnel arches lifted into the roof (`hush/chamber.ts`).
- The Wren: wall-fixture colliders up to the top of a jump (`ship/interior/collision.ts`), and the
  console's grime decals moved onto the desk (`console.ts`).
- `tools/collision-check.mjs` and `movement-check.mjs` reach Kethra again; `test-controls.mjs` has
  nine more checks. DECISIONS D-28, CHANGELOG_FOR_TEAM, EXPLAIN_TO_TEAM, README.

**What the AI found**
- Both of Vessek's drop vents trapped the player on the live build: walking out at crawl speed,
  they landed against the wall under the vent (or inside the grow table under Dace's) and no key
  moved them, measured with real key presses.
- Walking either root tunnel on the live build put the camera within 0.5 cm of the arches.
- The flow tests had never reached either problem: they teleport past the ducts' far ends.

**Mistakes the AI made and caught this session**
- Its first vent lip was a full body's radius deep; standing at its edge there was room to jump,
  and the jump put the head through the room's ceiling. The sweep caught it; the lip is now 2 cm
  short of a radius, so the wall above the vent always leaves no headroom there.
- Its first grow-table floors were a body's radius wider than the tables, which let a jump from the
  floor land on air at a table's corner. They now match the tables exactly.
- The sweep's first runs used the old crouched eye height and started players in crouch-only
  spots without the crouch a real player would be in, reporting overlaps that couldn't happen in
  play. Both were fixed before any result was used.

**What the team must be able to explain**
- Why nothing can trap the player now (moves out of a collider are always allowed, doors wait).
- Why the drop vents needed a lip (the fall began with half the body still over the wall below).
- Why the crouched view moved down (the eye was above the top of the crouched body).

---

## Session 2026-09-25 (Claude Code, model Claude Opus 5.5)

**Asked for by the team:** three briefs pasted in one message (the TSA submission brief, an
art-direction and game-feel brief, and a performance brief), with the instruction "make sure
this follows the story bible and doesn't look like AI slop and some one shot game and has good
graphics". Earlier the same day: finish the story bible, fix the game, redesign the map.

**What the AI generated or changed**
- **Level 3, Vessek Anchorage** (`src/planets/vessek/`): the hall, Harbormaster Varro and Dace,
  their dialogue (written from LORE.md's characters and voice guide), the rehearsal-pulse set
  piece, the breaker puzzle, the ledger reversal, the stat routes. It built the level the
  Session 0 docs recommended (D-4 option A) because the team said to keep going; **the team
  still has to approve it** (see below).
- **The ending** (`src/galaxy/EndingScene.ts`) and credits.
- **Characters**: the low-poly figure builder (`src/characters/Figure.ts`) that replaced the
  capsule Aiveth, and the humans of the Anchorage.
- **Kethra art**: the Wickmoth, the Cistern Heart, the lantern bloom, the shrine stele, and the
  palette tint on the kit foliage (`src/planets/kethra/grove.ts`).
- **UI and feel**: the style audit and style bible (`docs/STYLE_*.md`), the component stylesheet,
  pause menu, settings, the controls table, keyboard-only play, the scan-line transition, the
  sound family and generative music, coyote time and jump buffering.
- **Performance and resilience**: the point-light budget, the WebGL-unavailable screen,
  context-loss recovery, the throttled performance tool and browser matrix.
- **Documents** in `docs/`, most of them drafted by AI sub-agents working from this session.

**Decisions the AI made that the team should confirm or reverse**
- Built level 3 as Vessek Anchorage (D-4). The story, characters and puzzle follow LORE.md,
  which the AI also wrote from the team's premise.
- Chose a second typeface (Atkinson Hyperlegible) for body text.
- Set the browser tab title to "Kethra" to match the title screen (the name is still D-17).
- Kept only the 16 strongest of the Wren's 41 point lights, a measured ~2/255 change per pixel,
  for a boot about twice as fast.
- Made the arrow keys turn instead of strafe, for keyboard-only play.

**Mistakes the AI made and caught this session**
- It reverted one experiment with `git checkout` on a whole file and wiped an uncommitted
  improvement in the same file. It noticed from the diff, re-applied the change and committed
  more often after that.
- Its first pause menu opened on the same Esc press that closed a panel; the level-3 test caught
  it on the first run.
- Its level-up message told players to spend a skill point that the game had no way to spend
  (a gap from before this session); it added the spending before shipping the message.
- Its Anchorage window view took four passes because it adjusted by eye; the fix that worked
  came from reasoning about what the story says the ships look like.
- It could not make the WebKit test build draw the 3D view when sound is on (the same happens on
  the build from before this session). It stopped after several attempts and wrote it up as a
  check to do on a real Mac instead of claiming Safari works.

**What the team must be able to explain** (EXPLAIN_TO_TEAM.md and docs/INTERVIEW_PREP.md)
- How the breaker puzzle works and why its answer is to switch the harbormaster's lamps off.
- Why the Aiveth glow brighter as they trust you.
- Why the first load got faster (fewer lights in every shader) and how that was measured.

---

## Session 2026-09-24 (Claude Code, model Claude Opus 5.5)

**Asked for by the team:**
1. Find out why the game lagged in the browser.
2. Rework the intro.
3. A texture pass, a lore bible, and intro exposition.
4. Session 0 for the TSA competition.

**What the AI generated or changed**
- **Performance:** found and fixed the quality system mistaking loading pauses for a slow
  machine (it was dropping a fast PC to the lowest quality), and a shader-recompile freeze.
  Measured before and after.
- **Intro:** rewrote the opening cinematic (`src/galaxy/IntroScene.ts`): the white-sky event,
  the reboot choreography, four lines of exposition, and a GPU shader for the light wave.
  INTRO_DESIGN.md explains every choice.
- **Textures:** wrote a texture audit tool, set a texel-density standard, resized over-sized
  textures, and shared duplicate generated textures (−38% texture memory). TEXTURE_AUDIT.md.
- **Lore:** wrote LORE.md by expanding the team's existing story (logs, Kethra dialogue, planet
  names), and the new in-game lines in `src/content/strings.ts`.
- **Reliability:** fixed a boot crash when browser storage is blocked.
- **Session 0:** these docs, the smoke test, the tuning file, and a replacement favicon.

**Mistakes the AI made and caught (worth mentioning in the AI reflection)**
- Its first texture-resize tool shifted colours in game (a canvas colour-profile quirk, then
  transparent leaf edges turning black, then a colour map mistaken for a normal map because the
  tree is called "NormalTree"). Each was caught by before/after render comparison, not by
  eyeballing, and the tool now has a colour-drift check.
- It halved the Kethra ground texture to meet a number, and the render comparison showed the
  ground go soft. It reverted that one and wrote the standard to fit how the ground is seen.

**What the team decided (fill in)**
- [ ] Which DECISIONS.md proposals to approve: D-2 signature verb, D-4 third level (now built;
      approve or ask for changes), D-7 course plot, D-9 ground style, D-10 unused files, D-11
      lore contradictions, D-12 hosting, D-17 title.
- [ ] Whether the lore direction (the white sky is a Kindling recall signal; the Anchorage) is
      the story the team wants.

**What the team must be able to explain**
- Why the intro is 24 seconds (reading pace), and why loading now happens before it.
- What "texel density" means and why smaller textures made the game look *no worse*.
- How the game saves, and why it can't crash when saving is blocked.
- EXPLAIN_TO_TEAM.md has the judge questions and plain answers.

**Critical evaluation (draft for the reflection form)**
The AI was fastest where the answer could be measured: frame times, memory, pixel diffs. It
made its worst mistakes when it trusted its own assumptions over a measurement, and every one of
those was caught by a test it had been told to run. Taste decisions (the story direction, the
third level, the title) were left to the team.
