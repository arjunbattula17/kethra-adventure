# AI Use Log

Kept current every session. It feeds the Resources and AI Reflection form and the honor statement.
Be specific: what the AI produced, what was changed, what the team decided, and what the team
must be able to explain in the interview.

**Overall, from the git history:** 81 of the project's 88 commits (2026-08-22 → 2026-09-24)
carry a "Co-Authored-By: Claude" line, meaning an AI coding assistant (Claude Code) wrote or
co-wrote that change. The team should be ready to say which ideas, art choices and decisions
were theirs, and to explain every system in EXPLAIN_TO_TEAM.md in their own words.

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
- [ ] Which DECISIONS.md proposals to approve: D-2 signature verb, D-4 third level, D-7 course
      plot, D-9 ground style, D-10 unused files, D-11 lore contradictions, D-12 hosting, D-17
      title.
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
