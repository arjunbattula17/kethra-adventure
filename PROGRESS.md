# Progress

Newest session first. Each entry: what changed (with its DECISIONS bucket), what was verified,
and what's next.

## 2026-09-25
**Changed**
- **Fix: travel to Kethra.** Level 2 had been unreachable in normal play since Aug 22. The map's
  Set Course button works now (D-18).
- **UPGRADE: navigation map.** Dossier panel, to-scale Kethra chart, course line, legend, and a
  survey list (D-18).
- **Fix: Kethra.**
  - Re-reading an inscription or the carving could farm stats.
  - The carving never showed as found on the map.
  - Level 2 ended in a dead end (D-19).
- **ADD: title screen, controls, credits, audio gate.** Credits carry the CC BY attribution (D-5).
- **Fix:**
  - A hidden panel overlay caught clicks.
  - Closing a panel captured the mouse behind the title screen.
- **LORE.md finished:** the Choir's rules, level-by-level story to the ending, characters,
  places, and a voice guide.

**Verified**
- `npm run smoke` 6/6, now including the title screen.
- Tutorial flow 36/36.
- New `tools/test-kethra-flow.mjs` 18/18.
- Title flows: New Game, Continue, and New Game over a save.

**Next three backlog items**
1. B-7: stats solve puzzles on every level.
2. B-1: level 3 (waiting on D-4).
3. B-27: a player-path test for level 1.

## 2026-09-24 — Session 0
**Changed**
- **UPGRADE: performance.** The quality system no longer mistakes loading for slowness, and no
  longer flips shadows (which caused a recompile freeze). The quality tier holds on fast
  machines.
- **UPGRADE: the intro, "Cold Start".** 24 s, the white-sky event, four exposition lines, and
  loading moved before it (D-14).
- **UPGRADE: textures.** −38% memory with a measured density standard; ship walls made sharper
  (D-14).
- **ADD: lore.** LORE.md; lore in five channels (intro, loading lines, map scanner notes, the
  journal's contract brief, the WREN-01 helm placard).
- **Hard constraints:** fixed a storage-blocked boot crash (D-13) and a machine user path in a
  tool (D-12); replaced the template favicon (D-16).
- **ADD: scaffolding.** `npm run smoke`, `src/content/strings.ts`, `src/content/tuning.ts`, and
  the docs: STATE_OF_PLAY, DECISIONS, DESIGN, BACKLOG, ART_BIBLE, ASSET_LICENSES, AI_USE_LOG,
  EXPLAIN_TO_TEAM, DEPLOY, README.

**Verified**
- Build clean.
- `npm run smoke` 5/5, including storage blocked.
- Tutorial flow 36/36.
- Movement check passes.
- Intro text rules pass, and layout checked at 1024×768, 1280×720, 1440×900, 1920×1080,
  2560×1080 and 3840×2160.
- Chrome on Windows only.

**Waiting on the team**
D-2, D-4, D-7, D-9, D-10, D-11, D-12, D-17 (see DECISIONS.md).

**Next three backlog items**
1. B-2: title screen with controls, credits and audio gate (no decision needed).
2. B-7: stats solve puzzles on every level, starting with an engineering route on the ship.
3. B-1: level 3, as soon as D-4 is answered.
