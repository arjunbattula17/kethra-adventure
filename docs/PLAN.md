# Plan

The working checklist for the three briefs (TSA submission, art direction, performance), in
priority order: non-negotiables, then the double-weight rubric rows, then flow and directions,
then bonus, then polish. Updated as work lands; the open items at the bottom carry into BACKLOG.md.

## 0 · Non-negotiables
- [x] **Level 3 exists and is completable** (Vessek Anchorage): critical path, stat routes, set
      piece, fail/retry, reversal. `tools/test-vessek-flow.mjs` plays it through real controls.
- [x] **An ending** after level 3, then credits naming only the team ID and the licensed assets.
- [~] A full run longer than 3 minutes: every level is covered by a scripted player-path test and
      the intro alone is 24 s, but no human has timed a first playthrough yet (B-30).
- [x] WebGL unavailable → a clear message. Context loss → recovers (`tools/test-resilience.mjs`).
- [x] Everything local: fonts, models, audio; no CDN or remote fonts (the build requests only its
      own origin; see docs/PLAYTEST_REPORT.md).
- [~] Nothing identifies the team in the game or its files; the repository account and commit
      history are still D-12 (a team action).

## 1 · Creativity & Artisanship (×2)
- [x] STYLE_AUDIT.md, STYLE_BIBLE.md, DESIGN_NOTES.md.
- [x] Designed characters for the Aiveth and the Anchorage.
- [x] Kethra: the Cistern Heart, the Wickmoth, the lantern bloom, the stele; the palette.
- [x] UI rebuilt from one component set; sentence case; no pills; toasts off the view centre.
- [x] Signature transition (the scan line).
- [x] Title with the logo treatment and one idle motion.

## 2 · Technical Skill (×2)
- [x] Controls defined once (`src/content/controls.ts`) and read by the player, the Controls
      screen and the generated how-to-play doc.
- [x] Level 3 as data (dialogue trees, puzzle definition, lore) like level 2.
- [x] Perf: throttled measurements, PERF_AUDIT, tiers side by side, hidden-tab audio, battery cap,
      context loss.
- [ ] The Wren at 30 fps on a 6x-throttled CPU (B-28).

## 3 · Overall Appeal (×2)
- [x] Pause menu with resume, settings, controls, restart level, quit to title.
- [x] Settings: master, music, effects; reduced motion; text size; sensitivity; quality as
      Auto / Performance / Balanced / Quality; persisted and safe with storage blocked.
- [x] Game feel: coyote time, jump buffer, landing response; a sound per interaction class;
      generative music per place; HUD numbers animate.
- [x] Fail states are fast, kind and clear (the frost clock; falls on Kethra).
- [x] Keyboard-only play.

## 4 · Storyline & Flow
- [x] Arrival and completion cards for each level.
- [x] The reversal (the Heart is a relay) lands in level 3; the ending restates the through-line.

## 5 · Game Directions
- [x] In-game Controls screen, CONTROLS_AND_HOW_TO_PLAY.md and the bindings agree word for word.

## 6 · Bonus
- [x] Named in docs/AUDIT.md: glow-speech characters, the breaker puzzle's kind answer, stats that
      change what you can see, the Ship's Library.

## 7 · Documents
- [x] AUDIT, CHANGELOG_FOR_TEAM, UI_CHANGELOG_FOR_TEAM, DESIGN_NOTES, AI_AND_ASSET_LOG,
      ASSET_LICENSE_LOG, CONTROLS_AND_HOW_TO_PLAY, STORYBOARD_CHECK, DEMO_VIDEO_SHOTLIST,
      INTERVIEW_PREP, PLAYTEST_REPORT, PERF_AUDIT, PERF_LOG, PERF_REPORT,
      PERF_CHANGELOG_FOR_TEAM, TESTING_ON_A_REAL_CHROMEBOOK, screens/before and after, perf/.

## Open (carried into BACKLOG.md)
- B-28 the Wren's draw calls; B-29 real Safari and Chromebook; B-30 a timed human playthrough;
  D-12 names in the repository; D-17 the title; D-7 the course plot's typed answers.
