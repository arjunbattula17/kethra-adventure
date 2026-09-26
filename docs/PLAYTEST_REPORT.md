# Playtest Report

The evidence for the definition of done. Every result below comes from a script in `tools/` run
against the production build (`npm run build`, served by `npx vite preview`) on the team's dev PC
(Windows 11, RTX 4060), on 2026-09-25. Nothing here was tested on a Mac, a Chromebook or a phone;
those are listed as open.

## Build and run
- **One command from a fresh clone:** `npm install`, then `npm run play` (builds and opens the
  game). `npm run build` alone type-checks and writes `dist/`.
- **Offline:** `tools/test-offline.mjs` blocks every request that isn't to the local server and
  plays title → new game → the Wren → Kethra → Vessek → the ending: **0 external requests, 0 console
  errors.** Fonts, models, textures and sound are all local.
- **From a local folder:** the game has to be served (browsers refuse to load its modules and
  model files straight from `file://`). With no internet, `npm run play` or any static file server
  pointed at `dist/` works; this is what the semifinal laptop should use.

## Load time
| | Title | Playable (intro) | Source |
|---|---|---|---|
| Desktop, fresh browser | 0.8 s | 32.8 s | docs/perf/final/desktop |
| Desktop, second visit | 0.19 s | **3.9 s** | tools/warm-load.mjs |
| Simulated Chromebook (6× CPU, 10 Mbps), fresh browser, Auto | 1.8 s | 60.1 s | docs/perf/final/chromebook-sim |
| Same, pinned to Performance | 1.3 s | 26.6 s | docs/perf/final/low-tier |

The first visit is dominated by the graphics card compiling shaders, which browsers then keep; the
loading screen shows real progress throughout. **Not met:** "under five seconds on a mid-range
laptop" holds only on a second visit. Open the game once on the presentation laptop beforehand.

## Three levels, timed
Scripted player-path tests, through the real controls (E to interact, number keys and clicks in
panels, the map's Set Course button), with teleports between sites:

| Test | Covers | Checks | Wall time |
|---|---|---|---|
| `test-tutorial-flow.mjs` | title-less new game → intro → the five tutorial steps → galaxy reveal → course plot → returning-player cases | 36/36 | 182 s |
| `test-kethra-flow.mjs` | Set Course → both Aiveth → three inscriptions → valve, shrine → the Wickmoth → the Rite → the carving → home → repairs → the scanner resolves Vessek | 18/18 | 43 s |
| `test-vessek-flow.mjs` | Set Course → Dace → Varro and the stat gates → the pulse → an overload trip → a frost-out retry → the solution → the ledger → the alloy → home → comms → transmit → the ending → credits → keep exploring | 29/29 | 74 s |

Together that is about 5 minutes of machine play with every walk skipped, so a full run is longer
than three minutes even at the fastest possible pace. A first-time human playthrough will be much
longer [unsourced — estimate: 12–20 minutes]; nobody has timed one yet (BACKLOG B-30).

## Non-negotiables
| Rule | Status | Evidence |
|---|---|---|
| Rated E | ✓ | No weapons or combat anywhere; the dangers are darkness, cold and distance. The only fail states are a fall on Kethra (you scramble back) and the frost clock (the backup warmers buy another try). |
| Original or permissively licensed, logged | ✓ | docs/ASSET_LICENSE_LOG.md; both CC BY assets credited in the ending's credits. |
| Plain URL, four browsers, Windows and macOS | ~ | Chromium 151, Edge 153, Firefox 153: every level, 0 errors. WebKit 26.5 (the Windows test build of Safari's engine): every level, 0 errors, but the 3D view stays black while sound plays (also true of the build from before this session). **macOS Safari untested.** docs/perf/browser-matrix.json |
| Offline from a local folder | ✓ | test-offline above. |
| Level 3 reachable and completable | ✓ | test-vessek-flow. |
| Run longer than 3 minutes | ✓ (scripted floor) | above. |
| Nothing identifies the team | ~ | In the game and its files: only "team #____" in the ending's credits. The repository account and commit author names are D-12, a team action. |
| Keeps working through Nationals | ✓ | Static files, no services, no expiring keys; Render/Cloudflare/GitHub Pages all work (DEPLOY.md). |

## Resilience (`tools/test-resilience.mjs`, 8/8)
- WebGL disabled: a clear explanation screen, no errors (docs/screens/after/90-no-webgl.png).
- GPU context lost mid-play: the game keeps running and draws again at full brightness
  (65.0 before, 67.9 after, mean screen brightness).
- Browser storage blocked: settings still apply for the session, no errors.
- Hidden tab: sound suspends; the loop stops with the browser's own frame pausing.

## Browser and OS matrix
| Browser | OS | Every level | Console errors | 3D view |
|---|---|---|---|---|
| Chromium 151 | Windows 11 | ✓ | 0 | ✓ |
| Edge 153 | Windows 11 | ✓ | 0 | ✓ |
| Firefox 153 | Windows 11 | ✓ | 0 | ✓ |
| WebKit 26.5 (Playwright's Windows build) | Windows 11 | ✓ | 0 | ✗ black while sound plays |
| Safari | macOS | not tested | | |
| Chrome | ChromeOS | not tested | | |

## Rubric lines
Justifications, criterion by criterion, are in docs/AUDIT.md with the specific screens and files
each one points at. Summary [opinion]: Creativity & Artisanship and Overall Appeal moved the most
(designed characters, one visual idea across every screen, pause/settings/keyboard play, game
feel); Technical Skill is supported by the tools and the measured performance work; Storyline and
Flow now has a reversal and an ending.

## Controls agree word for word
The Controls screen (title and pause menu) and docs/CONTROLS_AND_HOW_TO_PLAY.md both print
`src/content/controls.ts`, the same table `PlayerController` reads its keys from; the doc is
regenerated by `node tools/gen-controls-doc.mjs`.

## Open before submission
- Time a first-time human playthrough (B-30).
- Run docs/TESTING_ON_A_REAL_CHROMEBOOK.md on a school Chromebook and on a Mac with Safari (B-29).
- The Wren below 30 fps on a slow CPU (B-28); total download above 20 MB (B-32).
- D-12 (names in the repository), D-17 (the title), D-7 (the course plot's typed answers).
