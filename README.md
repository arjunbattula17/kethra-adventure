# TSA Video Game Design entry — team #____

A deep-space puzzle RPG that runs in the browser. A survey ship goes dark past the edge of the
charts; you wake it up, and to get home you have to read a dead civilization's light. No combat:
progress comes from puzzles, conversation and your character's skills.

## Play locally
```
npm install
npm run play        # builds and opens the production version
```
Development with live reload: `npm run dev`.

## Controls
Every key is defined once in `src/content/controls.ts`; the in-game Controls screen and
docs/CONTROLS_AND_HOW_TO_PLAY.md (regenerate with `node tools/gen-controls-doc.mjs`) print from it.
Mouse to look (arrow keys turn without a mouse), W/S or ↑/↓ to move, A/D to step, E to interact,
Tab for the character sheet, O for settings, Esc to pause.

## Checks
```
npm run build       # type-check + production build
npx vite preview    # serve the build (keep running)
npm run smoke       # every scene boots with no console errors
```
Player-path tests (run against the preview): `node tools/test-tutorial-flow.mjs <url>` (the
opening), `test-kethra-flow.mjs` (level 2), `test-vessek-flow.mjs` (level 3 and the ending),
`test-resilience.mjs` (no WebGL, context loss, blocked storage). Measurement: `perf-run.mjs`
(throttled profile), `browser-matrix.mjs` (Chromium, Edge, Firefox, WebKit),
`capture-screens.mjs` (every screen), `capture-tiers.mjs` (quality tiers side by side).

## Project map
| Path | What's there |
|---|---|
| `src/core/` | engine, game flow, save system, quality tiers |
| `src/content/` | **string table** (`strings.ts`) and **tuning file** (`tuning.ts`) |
| `src/galaxy/` | intro cinematic, galaxy reveal, map, planets |
| `src/ship/` | the Wren's interior (level 1) |
| `src/planets/kethra/` | Kethra (level 2) |
| `src/planets/vessek/` | Vessek Anchorage (level 3) |
| `src/characters/` | the low-poly figure builder (Aiveth and humans) |
| `src/ui/` | title, pause, settings, HUD, panels |
| `src/rpg/`, `src/dialogue/`, `src/journal/` | stats, dialogue trees, logs and evidence board |
| `public/` | models, textures, fonts (see docs/ASSET_LICENSE_LOG.md) |
| `tools/` | tests, audits, capture scripts |
| `docs/` | the submission documents (below), screenshots, performance data |

## Documents
- STATE_OF_PLAY.md: honest assessment against the rubric
- DECISIONS.md: every significant change and its bucket
- DESIGN.md: the finished game
- BACKLOG.md: ordered work
- PROGRESS.md: session log
- LORE.md: story source
- ART_BIBLE.md: look
- TEXTURE_AUDIT.md: texture standard and audit
- docs/ASSET_LICENSE_LOG.md: licenses
- docs/AI_AND_ASSET_LOG.md: AI use record
- EXPLAIN_TO_TEAM.md: interview prep
- DEPLOY.md: deploy checklist

Submission documents in `docs/`: AUDIT, PLAN, CHANGELOG_FOR_TEAM, CONTROLS_AND_HOW_TO_PLAY,
STORYBOARD_CHECK, DEMO_VIDEO_SHOTLIST, INTERVIEW_PREP, PLAYTEST_REPORT; art direction:
STYLE_AUDIT, STYLE_BIBLE, DESIGN_NOTES, UI_CHANGELOG_FOR_TEAM, screens/before and screens/after;
performance: PERF_AUDIT, PERF_LOG, PERF_REPORT, PERF_CHANGELOG_FOR_TEAM,
TESTING_ON_A_REAL_CHROMEBOOK, perf/.
