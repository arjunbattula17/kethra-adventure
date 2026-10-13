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

## Session 2026-10-13 (Claude Code, model Claude Opus 5.5)

**Asked for by the team:** a general "finish my unfinished game" prompt, pasted with its blanks
unfilled: analyse the project first, keep its feel, end with exactly three fully playable levels
that reward exploration, and ask no questions. The AI read it against the project instead of
taking it literally: the game already had three levels and an ending, so the work became closing
what the overhaul's own log left open and adding things to find.

**What the AI generated or changed**
- **Bugs found by reading and then running the game** (docs/PROGRESS.md, QA log): walking straight
  ahead from Kethra's landing fell into the pool; Kethra's inscriptions never showed their text;
  Dace's later conversation could not be reached; the trip to the Anchorage was announced with
  Kethra's day count; the intro ignored the reduced-motion setting; a mouse-capture error.
- **The survey** (DECISIONS D-26): ten new things to find, all of their text written by the AI
  from LORE.md, in `src/content/discoveries.ts`. Nothing was downloaded: the stepping stones, the
  scope, the chalk sky, the notes and the seed book are all built or drawn in code.
- **The ending's summary and the chapter select** (DECISIONS D-27).
- **Tests:** `tools/test-survey.mjs` and `tools/test-ending.mjs`; `tools/collision-check.mjs` and
  `tools/test-kethra-flow.mjs` brought up to date.
- **The team's documents** corrected where they still described the deleted breaker panel and
  keypad plot (EXPLAIN_TO_TEAM, INTERVIEW_PREP, DEMO_VIDEO_SHOTLIST, STORYBOARD_CHECK).
- **Decisions the AI made and the team should review:** every line of new story text and the
  canon it implies (listed in D-26); which skill each find pays; that chapters are open from the
  first launch; that the live 3D title was not built.

**What the team must be able to explain**
- Why exploring raises skills, and one route it opens (Mbeki's letter and Oshel's grove together
  reach the persuasion Varro's message deal asks for).
- How a find is made: one entry of data, one placement in its level.
- How the fall on Kethra was found (a script that held W from the spawn) and fixed (a span of stone).
- Why the stepping stones are all the same jump apart: a short first gap was tried, and the same
  jump overshot it.
- What a chapter starts from: your own arrival if you have played there, a stand-in if not.

---

## Session 2026-10-12 (Claude Code, model Claude Opus 5.5)

**Asked for by the team:** a list of assets for Kethra (two Poly Haven trees, two Poly Haven ground
textures, three Sketchfab models: a column, a crystal cluster and a moth; a Godot water shader and
Godot's volumetric fog page as references), then a written brief to work them into the level's
existing look, with the instruction "use all the models you downloaded". The team downloaded the
three Sketchfab files themselves (they need a login) and chose every asset on the list.

**What the AI generated or changed**
- **Asset rebuilding** (scripts kept outside the repo): the column and moth scans reduced to
  low-poly, vertex-coloured models; the crystal reduced; both trees rebuilt from millions of
  triangles to 24,386 and 4,974. What was done to each is in public/models/CREDITS.md.
- **Kethra dressing** (`src/planets/kethra/dressing.ts`, `props.ts`): the colonnade in the pool,
  loam banks under the tree belts, moss on the terraces, resonant crystal in the Cistern Heart's
  basin, a landmark jacaranda and eight understory trees, four resting moths, mist on the water.
- **Pool water** (`src/planets/kethra/water.ts`): written for this scene. The Godot shader on the
  list was read as a reference for technique only; none of its code or textures is used.
- **Decisions the AI made and the team should review:** where every piece stands; that the Heart
  and the Wickmoth were left as designed; using the three CC BY models although docs/BRIEF.md says
  CC0 only (DECISIONS D-25); what each quality tier drops.

**What the team must be able to explain**
- Why none of the models looks like its download page: one style per scene (ART_BIBLE.md).
- Why a million-triangle scan became 2,200 triangles and still reads as the same column.
- Why the columns stand outside the chamber, not in it (cover has to be real cover).
- What CC BY asks for and where the game gives it (the end credits).
- That this cost performance, and how much (docs/PROGRESS.md, Performance).

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
