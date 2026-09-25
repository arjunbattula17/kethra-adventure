# Plan

The working checklist for the three briefs (TSA submission, art direction, performance), in
priority order: non-negotiables, then the double-weight rubric rows, then flow and directions,
then bonus, then polish. Updated as work lands.

## 0 · Non-negotiables
- [ ] **Level 3 exists and is completable** (Vessek Anchorage, per LORE.md and D-4's
      recommendation). Critical path, stat routes, set piece, fail/retry, reversal.
- [ ] **An ending** after level 3 that pays off the story, then credits (team ID only + assets).
- [ ] A full scripted run > 3 minutes, reaching level 3 and the ending, with zero console errors.
- [ ] WebGL unavailable → a clear message, never a black screen. Context loss → recover.
- [ ] Everything local: fonts, models, audio (no CDN, no remote fonts). Verify with the network off.
- [ ] Nothing identifies the team: tab title, metadata, credits, file paths (D-12 remains a
      team action for the repo account itself).

## 1 · Creativity & Artisanship (×2)
- [x] STYLE_AUDIT.md, STYLE_BIBLE.md.
- [ ] Characters: replace the capsule Aiveth with designed figures; human figures for the
      Anchorage.
- [ ] Kethra: the Cistern Heart as a Kindling machine, the Wickmoth as a creature with stained-glass
      wings, the grove's palette brought back to the art bible (sea-green, not autumn red).
- [ ] UI rebuilt from the component list: fonts, sentence case, buttons with four states, one
      caption style, toasts moved off the view centre, no pill.
- [ ] Signature transition (the scan line) replacing the double fade.
- [ ] Title with real art and one idle motion.

## 2 · Technical Skill (×2)
- [ ] Controls defined once (`src/content/controls.ts`) and read by the player, the controls
      screen and the generated how-to-play doc.
- [ ] Level 3 as data-driven content (dialogue trees, puzzle definition, lore) like level 2.
- [ ] Perf: throttled measurements, PERF_AUDIT, a Low tier that looks designed, hidden-tab stop,
      battery cap, context loss.

## 3 · Overall Appeal (×2)
- [ ] Pause menu (Esc): resume, settings, controls, restart level, quit to title.
- [ ] Settings: master, music and effects volume; reduced motion; text size; quality as
      Performance / Balanced / Quality; all persisted and safe with storage blocked.
- [ ] Game feel: coyote time, jump buffer, landing response; one sound per interaction class;
      generative music per place; HUD numbers animate.
- [ ] Fail states are fast, kind and clear (the Anchorage frost clock; falls on Kethra).

## 4 · Storyline & Flow
- [ ] Level transitions carry context (arrival cards with place and purpose).
- [ ] The reversal (the Heart is a relay) lands in level 3; the ending restates the through-line.

## 5 · Game Directions
- [ ] In-game controls screen, CONTROLS_AND_HOW_TO_PLAY.md and bindings agree word for word.

## 6 · Bonus
- [ ] Name the unusual feature and make sure the mechanics carry the message (see AUDIT.md).

## 7 · Documents
- [ ] AUDIT.md, CHANGELOG_FOR_TEAM.md, UI_CHANGELOG_FOR_TEAM.md, DESIGN_NOTES.md,
      AI_AND_ASSET_LOG.md, ASSET_LICENSE_LOG.md, CONTROLS_AND_HOW_TO_PLAY.md,
      STORYBOARD_CHECK.md, DEMO_VIDEO_SHOTLIST.md, INTERVIEW_PREP.md, PLAYTEST_REPORT.md,
      PERF_AUDIT.md, PERF_LOG.md, PERF_REPORT.md, PERF_CHANGELOG_FOR_TEAM.md,
      TESTING_ON_A_REAL_CHROMEBOOK.md, docs/screens/after/, docs/perf/.
