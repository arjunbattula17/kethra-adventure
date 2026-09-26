# Backlog

Ordered by rubric weight and risk: hard constraints and browser playability first, then the core
mechanic and levels 1–3, then polish, then later levels, then portfolio support. Each item has a
done-condition a student can check. **[blocked: D-n]** means it waits on a team decision in
DECISIONS.md.

## 1 · Hard constraints and playability
- **B-1 · Third level: Vessek Anchorage** *(built 2026-09-25; tools/test-vessek-flow.mjs 29/29; team to approve D-4)*
  *Done when:* a first-time player can walk from level 2's return to the Wren, travel to the
  Anchorage, solve its critical path, and see a level-complete beat. Total play from new game to
  the end of level 3 is under 10 minutes for a competent player.
- **B-2 · Title screen, controls screen, credits, audio gate (D-5)** *(done 2026-09-25; still to add: OFL.txt next to the font files)*
  *Done when:* the game opens on a title screen with Continue / New Game / Controls / Credits /
  Settings. The controls list matches the code (WASD/arrows, mouse after clicking, Shift, Space,
  C/Ctrl, E, Tab, O, Esc). Credits name every CC BY asset. The first click or key starts audio.
- **B-3 · Hosting without names (D-12)**
  *Done when:* the live link contains no personal names and loads from a browser profile that
  has never visited it.
- **B-4 · Cut first-load shader compilation**
  *Done when:* a cold-cache boot on the dev machine reaches the tutorial in under 25 s (now
  ~55–70 s), measured with `tools/boot-profile.mjs`. Route: normalize the interior's material
  features so its ~93 programs collapse to far fewer.
- **B-5 · Browser matrix**
  *Done when:* `npm run smoke` passes on Chrome, Edge and Firefox; Safari (macOS) and a
  Chromebook each play through level 1 with no console errors. Results recorded in PROGRESS.md.
- **B-6 · Level select (D-6)**
  *Done when:* reloading after reaching level 2 offers a jump straight to level 2 from the title
  screen.

## 2 · Core mechanic, levels 1–3
- **B-7 · Stats solve puzzles on every level (D-3)**
  *Done when:* each level's critical-path puzzle has a stat-gated route, and every one of the
  six stats opens something by the end of level 3.
- **B-8 · Traversal feel** *(done 2026-09-25: coyote time, jump buffer, landing dip and thud)*
  *Done when:* coyote time (~0.1 s), jump input buffering (~0.1 s) and landing feedback exist,
  tuned in `src/content/tuning.ts`, and `tools/movement-check.mjs` plus
  `tools/collision-check.mjs` still pass.
- **B-9 · Course plot as a chart mechanic [blocked: D-7]**
  *Done when:* the same three calculations are performed by acting on the nav chart (no keypad),
  on a branch, and the team has played it end to end.
- **B-10 · Repairs as engineering puzzles [blocked on D-8 approval]**
  *Done when:* at least one repair is a routing puzzle with an engineering-stat shortcut.
- **B-11 · Colour puzzle second channel (accessibility)** *(done 2026-09-25: a glyph per colour)*
  *Done when:* each Cistern Heart colour also has a distinct glyph, and the puzzle is solvable
  in grayscale (check with a grayscale screenshot).
- **B-12 · Signature verb through levels 1–3 [blocked: D-2]**
  *Done when:* the scanner-tuning verb appears in all three levels as introduce → develop →
  twist.
- **B-13 · One set piece per level** *(done: the Anchorage pulse is level 3's)*
  *Done when:* level 1 (the reveal) ✓, level 2 (the Heart waking) ✓, and level 3 (the white sky
  on the ring) all play.

- **B-27 · Tests that play the way a player does**
  *Done when:* every level has an assertion test that reaches it through player-facing controls,
  not debug hooks. Travel to Kethra was broken for six weeks because every test jumped straight
  there. Level 2 now has one (`tools/test-kethra-flow.mjs`); level 1 still needs one.

## 3 · Polish
- **B-14 · Music per level and stingers** *(done 2026-09-25: generative beds per place, level start/end stingers, music volume)*
  *Done when:* each level has an original loop (or a logged licensed one), key moments have
  stingers, and a volume/mute control is in Settings.
- **B-15 · Reduced-motion option** *(done 2026-09-25)*
  *Done when:* a Settings toggle disables camera shake, the intro's dust drift and the white-sky
  swell, and respects the OS `prefers-reduced-motion`.
- **B-16 · Kethra ground style [blocked: D-9]**
  *Done when:* the ground matches the stylized plants, and the original is archived.
- **B-17 · Remove unused files from the build [blocked: D-10]**
  *Done when:* the build shrinks by ~70 MB and `npm run smoke` still passes.
- **B-18 · Move the remaining text into the string table**
  *Done when:* tutorial cards, dialogue trees, journal logs and toasts read from
  `src/content/strings.ts` (or per-area tables it indexes).
- **B-19 · Texture follow-ups**
  *Done when:* the grove rocks meet their density tier (re-UV or a detail map), and KTX2
  compression is evaluated with a measured memory result (see TEXTURE_AUDIT.md).
- **B-20 · Skip hint scales at 4K**
  *Done when:* the corner skip hint is legible at 3840×2160 with no display scaling.

## 4 · Later levels
- **B-21 · Orrun's Reach**
- **B-22 · Isilthe and the ending**

## 5 · Portfolio support (final two weeks)
- **B-23** Draft the purpose / description / audience / how-to-play page.
- **B-24** Shot list for the hand-drawn storyboard (students draw it).
- **B-25** Demo video outline under five minutes: tutorial, one level, a tour of the code and
  tools.
- **B-26** Verify the live link from a clean device the week before and again on submission day.

## Added 2026-09-25
- **B-28 · The Wren at 30 fps on a slow CPU**
  *Done when:* the ship interior holds 30 fps under 6x CPU throttle at the Performance tier (now
  ~23; docs/PERF_AUDIT.md). Route: pack the room's ~350 generated prop textures into a few atlas
  pages so batchStaticGeometry can merge them (target under 250 draw calls, now ~650).
- **B-29 · Real Safari and a real Chromebook**
  *Done when:* docs/TESTING_ON_A_REAL_CHROMEBOOK.md has been run on a school Chromebook and on a
  Mac with Safari, results in PROGRESS.md. The WebKit test build stops showing the 3D view when
  sound is on (it did before this session too); only a real Mac can say whether Safari does.
- **B-30 · A timed first-time playthrough by someone outside the team**
  *Done when:* a new player's time from the first image to the credits is recorded (the scripted
  run is a floor, not an estimate of real play), with where they got stuck.
- **B-31 · Level 1 player-path test through the map** (part of B-27): the tutorial flow test covers
  the opening; add the ship's repairs and the travel to Kethra through real controls.
- **B-32 · Download under 20 MB**
  *Done when:* a full loop with the cache off transfers under 20 MB (now ~29 MB with duplicates,
  24.6 MB unique; docs/PERF_REPORT.md). Route: compress the GLB models (meshopt, decoder bundled
  locally) and the kit textures (KTX2), starting with the 2.9 MB freighter used in four scenes.
