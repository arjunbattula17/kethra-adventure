# Interview prep

The questions judges are most likely to ask, each answered from what is actually in the
repository. Say the answers in your own words. Where only the team knows the answer, there is a
blank marked **[team: fill in]**; fill every one before the interview. The detailed explanations
of each system are in EXPLAIN_TO_TEAM.md and docs/CHANGELOG_FOR_TEAM.md.

## Design process

**1. What is the game, in one sentence?**
A deep-space survey pilot wakes their stranded ship and gets it home by reading the light of a
vanished civilisation. There is no combat: you progress by puzzles, conversation and stats.

**2. How does it fit the TSA theme and challenge?**
- **Deep space:** a stranded ship in an uncharted system.
- **RPG:** six stats, XP and levels, skill points, and stat-gated branching dialogue.
- **Progression by puzzles:** the Rite of Three Breaths on Kethra, the breaker bus on the
  Anchorage, the course plot.
- **No combat:** the Wickmoth guardian is calmed by dimming a light, never fought.

**3. Where did the idea come from?**
[team: fill in — the original premise, the Wren, the Kindling and the Aiveth were the team's].
LORE.md expands the team's existing logs and dialogue; its opening section says so.

**4. How did you plan the levels?**
- Each level teaches, develops or twists one idea: reading light (DESIGN.md).
- Level 1 teaches the controls and the console.
- Level 2 has you read inscriptions and call colours in order.
- Level 3 turns it around: the light you restored on Kethra made the signal worse.
- LORE.md, "Level by level", has the beats.

**5. What did you change after testing?**
- The first visual audit (docs/STYLE_AUDIT.md) found placeholder capsules for characters, three
  different caption styles and toasts covering the view; all three were rebuilt.
- Automated play-throughs found real bugs: Set Course had stopped travelling to Kethra, and skill
  points couldn't be spent. Both are fixed; see docs/CHANGELOG_FOR_TEAM.md.

**6. Who is it for?**
Ages 10 and up who like exploring and puzzles. No reflexes are needed, and every failure can be
retried at once (docs/CONTROLS_AND_HOW_TO_PLAY.md).

**7. How do you make sure a first-time player isn't lost?**
- A five-step tutorial that teaches by doing, with at most two sentences on screen.
- An objective that is always visible.
- Chapter cards naming each level.
- A map that preselects where to go next.

**8. Why does the game look the way it does?**
- docs/STYLE_BIBLE.md: "every living thing announces itself with its own light".
- Amber means "you can act here".
- Sea-green means "you learned something".
- White is reserved for the white sky.

## Technology and code

**9. What did you build it with?**
- three.js (a WebGL 3D library, version 0.185), TypeScript and Vite (a build tool) (package.json).
- It builds to a static website, so there is nothing to install.

**10. Why the browser and not a game engine?**
[team: fill in the original reason]. What it gives us now: the game runs from a plain link on any
modern browser, which is how judges play.

**11. How is a level built?**
- The scene code builds the space: `src/planets/vessek/VessekScene.ts`.
- Everything a writer would change is data in separate files: dialogue (`vessekDialogue.ts`),
  documents (`vessekLore.ts`) and the puzzle's rules (`BreakerPuzzle.ts`).

**12. Walk us through one puzzle's code.**
`BreakerPuzzle.toggle()` in `src/planets/vessek/BreakerPuzzle.ts` makes three checks:
- **Dependencies:** does this circuit need another one on first?
- **Capacity:** would it push the bus over 6 units? If so it trips, and the auto-reset lights come
  back on.
- **The goal:** are the heaters and scrubbers running?

**13. How do the stats actually matter?**
- Dialogue options carry `requires: { attribute, min }` (`DialogueSystem.ts`).
- World objects check stats too: the ring plate needs archaeology 2, and the duct needs
  traversal 2.
- Stats also change what you see: engineering 2 shows breaker loads, perception 2 marks the
  circuits that switched themselves back on.
- Every puzzle can still be solved at starting stats.

**14. How are the characters made?**
`src/characters/Figure.ts` builds each figure from lathes (shapes spun around an axis) and tapered
cylinders with flat shading. It animates breathing and sway, turns the head toward the player, and
fades the Aiveth's glow to show mood.

**15. How does sound work without audio files?**
- `src/audio/AudioSystem.ts` creates every tone with the Web Audio API (the browser's built-in
  synthesizer), all in A minor pentatonic.
- `startMusic()` plays a slowly breathing chord plus random plucks, so it never repeats exactly.

**16. How do you know the game runs on a weak computer?**
- `tools/perf-run.mjs` slows the CPU 6× and records frame times and load times.
- At the Performance setting, Kethra ran at 47.6 fps and the Anchorage at 50.3 fps; the Wren
  interior is the weak spot at 23.3 fps (docs/perf/final/low-tier/results.json).
- We measured, changed one thing, and measured again (PERF_LOG).

**17. What was the biggest technical problem?**
- On a fresh browser the first load spent over a minute compiling shaders (programs that run on
  the graphics card).
- The cause was 41 small lights, each written into every shader.
- Keeping the 16 strongest changed the picture by about 2/255 per pixel. In the throttled test it
  cut New game to a playable intro from 65.0 s to 21.8 s (docs/perf/baseline/low-tier and docs/perf/final/low-tier,
  `introFromNewGameMs`).

**18. How do you test it?**
- Scripts in `tools/` drive the real game in a browser: the tutorial (36 checks), Kethra (18) and
  the Anchorage through the ending (29).
- There is a smoke test that boots every scene, a resilience test (no WebGL, graphics reset,
  blocked storage), and a four-browser run.

**19. What happens if something goes wrong on a judge's computer?**
- No WebGL 2: a screen explains what to try.
- A graphics reset: the game recovers.
- Blocked storage: it plays without saving.
- A hidden tab: sound stops.
- Low battery: it caps at 30 fps.

**20. What would you do next?**
- Build levels 4–5 (Orrun's Reach, Isilthe).
- Replace the course plot's typed answers with actions on the chart (D-7).
- Atlas the Wren's textures so it runs faster on Chromebooks.
- Test on a real Mac and a real Chromebook.

## How we used AI (be exact; this feeds the scored Resources and AI Reflection form)

**A1. Did you use AI?**
Yes. 90 of the repository's 97 commits carry a "Co-Authored-By: Claude" line, meaning an AI
coding assistant (Claude Code) wrote or co-wrote that change (git log). docs/AI_AND_ASSET_LOG.md
records what it did each session.

**A2. What was yours and what was the AI's?**
[team: fill in — the premise, characters, planets, art choices and decisions the team made; which
systems you asked for; what you rejected or changed]. The AI wrote most of the code and the
documents in docs/, and expanded the team's lore into LORE.md.

**A3. How did you check the AI's work?**
- Automated tests that play every level through real controls.
- Before/after screenshots compared pixel by pixel.
- Throttled performance runs.
- Several AI mistakes were caught this way: a texture tool that shifted colours, and a revert that
  undid a change it wanted to keep.
- [team: fill in what you checked by playing].

**A4. Can you explain the code without the AI?**
Practise with EXPLAIN_TO_TEAM.md and the two-sentence explanations in docs/CHANGELOG_FOR_TEAM.md
until you can. [team: fill in who explains which system].

**A5. Where did AI shape a design decision?**
- It proposed options for the level 3 choice, the title and the course-plot rework (DECISIONS.md).
- It made some routine calls itself, such as the body font and the light budget; those are logged
  as reversible.
- [team: fill in which recommendations you accepted, changed or rejected, and why].
