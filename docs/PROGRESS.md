# Progress · the overhaul

Working state for docs/BRIEF.md. Branch `overhaul` (from master 9daf513). After compaction or in a
fresh session, read docs/BRIEF.md, this file, docs/DESIGN.md and `git log --oneline -15` first.
(The root PROGRESS.md is the TSA session log; this file is the overhaul's.)

## Status
**2026-10-25, second pass: the seams between the two branches.** Asked to make this branch's work
flow with the team's, the pass first ran every one of the team's own tests on the final build (title,
controls, load failure, level caches, texture leaks, offline, resilience: all pass), then had four
reviewers read everything this branch adds on top of the team's last commit (f624308), area by area.
What held up when checked is issues 50–64: thirteen fixed, one left as the trade the team already
made for the same case (63), one for the team to listen to (64). The eight a player can meet were
each seen on the build before the fix, seven of them in a new stress scenario,
`stress_tests/s15-seams.mjs` (8 of its 24 checks fail on the old build; all pass on the new). The visible ones: "Click to look
around" over MG1's win, a held Enter on Chapters replacing the saved journey, Kethra's shallows
painted mirror-image, and an invisible step near the landing. After: journey 16/16, stress 14/14,
console clean on every tier, no NaN anywhere, the team's tests all green, the wall sweep unchanged.

**2026-10-25: the Wren inside both draw-call budgets, and the frame target met.** Yesterday's "the
Wren is inside its Low budget at 123" was a measuring error: on Low the engine draws at 30 fps while
the lighting upgrade runs, and `tools/measure-scene.mjs` averaged over animation frames, half of which
drew nothing. It drew 246. The tool now counts per frame drawn and can sample once the arrival work
is done (`--settled`); `tools/draw-list.mjs` lists every draw in a frame. With that list, four changes
to the Wren's batching (134bbd8) took it to **138 on Low (budget 150) and 334 on High (350)**, with
room sweeps matching the old build within its own run-to-run noise. Low at 6× CPU, settled, p95 is now
24–28 ms in the Wren, 23–25 in Vessek and 24–35 in Kethra (target 33; one Kethra run over). Journey
16/16. The four-size matrix is looked at and committed (docs/screenshots/overhaul-final), and
docs/REPORT.md is the final report, with the brief's seventeen questions answered.

**2026-10-24: both branches integrated.** The remote's fifteen commits (D-32) were merged on
2026-10-14 with the team's choice of a failed trip ending aboard (D-34; jumping fixed on the way,
D-35). By today the remote had 35 more (the live 3D title, arrow keys look and Space jumps, the wall
sweep, low-end texture and memory work: D-36 to D-38, renumbered from its D-26 to D-28). Both are
merged into `overhaul` (53 commits ahead of `origin/overhaul`, none behind; not pushed), with every
suite green and the wall sweep clean in all three levels after three collision fixes it found
(QA log). The draw-call work (D-31) is on it too, journey finished: every level is inside its
Low draw-call budget, the Wren for the first time (*corrected 2026-10-25: not the Wren, whose 123
was a halved count of 246; inside since 134bbd8*). The console is clean on every route and tier
(new `tools/console-scan.mjs`), and nothing visible comes inside the camera's near plane in any level
(wall sweep). Next: M6 and M7.

**2026-10-13: the release pass** (docs/REPORT_2.md, written phase by phase). Phase 0 audited the
finishing pass and corrected four things in it. Phase 1 took the three CC BY models out of the build
and wrote the licence audit (docs/ASSETS.md) and the canon review sheet (docs/CANON_REVIEW.md).
Phase 2 brought Kethra, the Heart's chamber and the Anchorage inside their draw-call budgets on both
presets; **the Wren is still over** (246 against 150 on Low), so the pass stopped there and Phases 3
and 4 (WebKit, the throttled playthrough, the screenshot matrix, the live title) were not started
(DECISIONS D-31). **Phase 2's code is on the local branch `overhaul-phase2-unverified`, not on
`overhaul`:** its journey run was cut off at 9 of 16 when the machine ran out of memory. And the
remote branch has fifteen commits this one lacks, which have to be merged before anything is pushed
(D-32).

**2026-10-13: the finishing pass.** M5's verification is closed. M6 is built except the live 3D
title: the ending has its summary and a chapter select. Every level has a survey of things to find
(DECISIONS D-26, D-27). A whole-game pass found and fixed six bugs on the player's path (QA log).
docs/REPORT.md is the report. What is left is in "Open issues" and in the report's next steps: the
live title, a timed human playthrough, and real hardware.

## Milestones
- [x] Phase 0: brief saved, branch, baseline (screens, perf, journey test)
- [x] Phase 1: audit (docs/AUDIT.md, Part A)
- [x] Phase 2: design (docs/DESIGN.md)
- [x] Checkpoint: design approved 2026-09-27, all recommendations taken
- [x] **M0 Foundations**
  - [x] Vessek soft-lock fixed on master (ea28978) and merged; regression test tools/test-dialogue-esc.mjs
  - [x] Motion module (src/motion), flow state machine, ?debug harness, per-scene grades + LiteGlow, space sky, code-built Wren (freighter removed), world fonts, panel lifecycle and bug fixes (131f3a3)
  - [x] UI kit pass: chamfered plates, sentence-case labels, hold-to-skip, kinetic title, tabular counts, HUD steps back (1e9c53a)
  - [x] Wren draw calls, steps 1–6 (docs/DESIGN.md §7): Low 614 → 256, High 942 → 520 (1e9c53a)
  - [x] The Conductor (HUD holds during cinematic beats, ambient motion ducks under hero moments), the space kit's sun, panel morphs, `npm run journey`, perf re-measure, M0 screenshots
- [x] **M1 Level 1: the reveal and MG1 Intercept**
  - [x] The reveal rebuilt at plot scale as MG1's opening: the hero pass, the ping resolving the system, one continuous move onto the plot (ca4357a)
  - [x] MG1 Intercept: three legs, readable fails with instant rewind, the amber wavefront win, stats that change the play; keyboard, mouse or both (ca4357a)
  - [x] The course on the desk chart (real state), the player leaning over it after the win (ca4357a)
  - [x] The keypad plot deleted (ca4357a)
  - [x] The Wren's lighting arc: emergency → navigation → full (power.ts); full stands on `left_wren` until First light exists (M2)
  - [x] **2026-09-28: MG1 redesigned for first-time players** (docs/DESIGN.md §4, slot 1, "Redesigned"): ORION's automatic hop, then one choice (where to meet Kethra, ← → or the mouse), lock on the match, Space to launch; ORION's hint and "Let ORION plot it" so nobody stalls. Back aboard: "Explore Kethra" with logs and repairs as an optional second line, the console lit by the tutorial's markers (src/ship/ConsoleGuide.ts). tools/test-intercept-sim.mjs and tools/test-mg1-flow.mjs rewritten for it
  - [x] **2026-09-29: MG1 is a hands-on charter again** (docs/DESIGN.md §4, slot 1, "Redesigned again"): drag the gold handle onto Kethra's blue day markers (or ← →), two checks (on the path, same day) say what is already right, Launch lights only when both are; the belt leg stays cut. One meaning per colour on a flat SVG chart layer (src/galaxy/intercept/overlay.ts). A click no longer captures the mouse during the chart (InputManager.captureAllowed), so every drag works
- [x] **M2 First light and the cruise**
  - [x] First light at the helm: the cabin falls to emergency, the desk chart redraws the course, the throttle offered after a beat of stillness, four held ignitions with a kick each, power travelling stern to helm as light, strip by strip (per-pixel on the merged strips); letting go spools back (src/ship/FirstLight.ts, throttle.ts, power.ts)
  - [x] The match cut out through the viewport into the cruise, prepared underneath, no spinner (Engine.setScene `quiet`, GameScene.onEnter)
  - [x] The cruise (src/galaxy/CruiseScene.ts): plumes and shockwaves, the locked-off departure through the belt, the chase with star streaks and FOV 50°→62°, the transit with the day counter and the sun turning around the hull, Kethra's night side and the grade into night green, the skiff's entry through cloud to the canopy, the kinetic title; hold to skip lands on the arrival
  - [x] The fade-and-loading-bar trip deleted from the player's path (enterPlanet stays for the debug jumps and "Restart this level"); later departures take the short version
- [x] **M3 MG2 Canopy**
  - [x] The descent (src/planets/kethra/canopy): five layers per the ramp (the swinging lantern over a wide gap, pods, swaying limbs, the Wickmoth crossing below, the narrow drop to the landing lights); WASD steer with inertia, Shift brakes, the mouse aims the lamp (keyboard-only: it follows the heading, wider); pods the lamp touches wake and light the limbs around them
  - [x] Scrapes: sparks at the contact, a heavy-spring kick, a hull pip lost, the bough marked; three climb back to the last layer passed
  - [x] Depth cues: the lamp's pool on the layer below, a blob shadow in it, haze thickening with depth, pods near and far; limbs are capsule colliders; the camera pulls in rather than pass through one
  - [x] Touchdown: gear squash, a dust ring, the establishing shot, the Aiveth lanterns turning to the skiff; Kethra builds under that held shot
  - [x] Stats: traversal 2 less inertia, perception 2 pods lit longer, engineering 2 a wider lamp; +1 traversal
  - [x] The skiff (src/galaxy/skiff.ts) parks on the landing terrace as the return pad, replacing the cylinder-and-torus
- [x] **M4 MG3 Hush and Kethra's floor**
  - [x] The Heart's chamber (src/planets/kethra/hush): a walled ring about the Heart, now at its centre, with root tunnels, a Kindling rim, low root mounds, lantern posts, glowcaps, the far arch and the gate arch. One set of blocks (sim.ts) is what renders, what you collide with and what the moth's sight is tested against
  - [x] The moth (sim.ts `Moth`): it watches from a perch with a sweeping gaze; light in the gaze fills its alert; a wing-beat, then it glides at the light; if you are still there it fans you back to the last lamp; hood and step aside and it searches, then goes home. A brushed glowcap turns its gaze. It moves to the gate arch once you reach a tunnel's lamp or the south of the chamber
  - [x] The gaze made visible on every tier: rays cast through the cone against the same blocks draw the shaft and the pool, so cover casts a gaze-shadow; Medium and High add a shadowed spot for the light itself. Teal, warming to amber as it notices you
  - [x] The lantern (hold F or the right mouse button to hood it): raised as you reach the chamber, slower hooded (traversal 2 less so), crouch lowers it behind cover; the chamber's light falls away inside
  - [x] The in-world Rite at the moved call-stone: 1/2/3, each breath lighting its glyph and running along the floor to its vane; unseen breaths are held and draw the moth a step closer (gate arch, vane, rim); a breath in its gaze brings it down on you; a wrong colour sours the water and startles it. Archaeology 3 names the first colour; insight 3 marks its next perch; perception 2 shows where its sweep is heading
  - [x] The win: the Heart wakes, the moth settles on it with its wings open, and the wake travels out of the chamber, up the terraces and into the canopy (wake.ts), filmed on the player's own camera, hold to skip
  - [x] The Rite's DOM panel and the lantern bloom deleted; MG2's moth no longer overwritten by the old patrol
  - [x] Kethra's floor: a still pool the terraces stand in (the fall reset at its surface), the lantern-tree canopy overhead with the skiff's hole in it, the pillars grounded, the chamber on foundations, the build split into tasks
- [x] **M5 Level 2: Vessek expanded**
  - [x] Four compartments joined by tubes, each lashed hull with its own light: the Lantern Bay hall, the school hold, the hydroponics tanker and the aft junction (src/planets/vessek/layout.ts, rooms.ts, dressing.ts)
  - [x] The ring bus in the world (bus.ts, busWorld.ts): six units across eight circuits, each lever in the room it serves, conduits that glow with the flow, gauges in the hall, the school and the junction; the dock lights and hall lamps switch themselves back on. Engineering 2 stamps each lever's load, perception 2 marks the self-resetting ones and warns before they come back
  - [x] Dace's ducts: crawl-only (crouch now lowers the player to 1.1 m and holds wherever standing would collide), ladders, one-way drops, chalk arrows, and fans that block a duct while their circuit runs
  - [x] Kishōtenketsu. Ki: light the school's lamps by switching something else off. Shō: Varro's deal sends you through the hall duct to the aft junction. Ten: the rehearsal pulse seals the tanker hatch, starts the frost clock, and the self-resetting lamps trip the bus whenever it's loaded. Ketsu: lock them out at their boxes in the ducts, bring up pumps, heaters and scrubbers inside six units, and the grow lights come back row by row
  - [x] Stats change the route, not whether you can win: persuasion 3's deal throws the hall lamps' lockout for you, insight 2 (after the Heart) trades for the junction's keypad code, traversal 2 fits the short duct from the tanker
  - [x] The docking variant of the cruise: the Anchorage's broken ring in front of the violet world, its lamps blinking out of sync; the Wren slows in between the moored hulls to the Lantern Bay's collar under the title "Vessek Anchorage" (src/planets/vessek/anchorage.ts)
  - [x] The breaker panel deleted (BreakerPuzzle.ts and its CSS)
  - [x] The Anchorage with its twenty moored hulls, looked at (2026-10-13): the broken ring, the hulls along its arc and the Wren coming in to the Lantern Bay's collar all read, on Low and High, with no page errors
  - [x] M5 screenshots, 1920×1080 Low + High: the docking approach at five moments (2026-10-13, inspected from scratch, not committed; the level's interior shots are with the finds below)
  - [x] `npm run journey` (2026-10-12 and again 2026-10-13)
  - [x] Vessek's own perf row (2026-10-13): over on draw calls on both presets, inside on triangles (Performance, below)
- [~] **M6 Opening, menus, ending** (2026-10-13; the live title is not built)
  - [x] The ending's summary: days in flight, survey finds and level counting up, the six skills, the survey world by world, the choices the save recorded (src/ui/JourneySummary.ts)
  - [x] A chapter select on the title and after the credits: any level from the player's own arrival, or from a stand-in with a first playthrough's skills (src/core/chapters.ts, src/ui/ChapterSelect.ts)
  - [x] The intro respects reduced motion (issue 10)
  - [ ] The live 3D title with a match cut into the intro (issue 37)
  - [x] The arrival card's redesign (issue 25): folded into the arrival title (2026-10-24)
  - [x] The live 3D title: built on the remote (D-37); black on High until 69463fc
  - [x] Menus, pause and settings re-checked against the plate kit (2026-10-25: Character, Settings and Pause at four sizes in the final matrix; chamfered plates, one gold primary, the same foot line)
- [x] **M7 Whole-game pass and art pass** (2026-10-13; the matrix and frame-rate checks 2026-10-24 to 25)
  - [x] The survey: 4 finds aboard the Wren, 8 on Kethra, 6 at the Anchorage (src/content/discoveries.ts)
  - [x] Every suite on the final build, and six bugs on the player's path fixed (QA log)
  - [x] Four resolutions × Low/High screenshots of every beat (496, looked at; 148 committed in docs/screenshots/overhaul-final); the motion integrators stepped at 30, 60 and 144 Hz (`tools/test-frame-rates.mjs`)
- [x] **M8 Report** (docs/REPORT.md)

## Open issues
| # | Sev | Issue | Where | Plan |
|---|---|---|---|---|
| 1 | ~~P1~~ | **Fixed (ea28978)**: Esc on Varro's closing line meant the pulse never fired | DialogueSystem.ts | Regression test fails before and passes after |
| 2 | ~~P1~~ | **Fixed (131f3a3)**: double start from the title | flow machine + title guard | |
| 3 | ~~P1~~ | **Fixed (131f3a3)**: breaker double solve (the panel itself is deleted in M5) | BreakerPuzzle.ts | |
| 4 | ~~P2~~ | **Fixed (131f3a3)**: stale timers closing the wrong panel (`close(id)`) | PanelManager.ts | |
| 5 | ~~P2~~ | **Fixed (131f3a3)**: replaced panels now close properly | PanelManager.ts | |
| 6 | ~~P2~~ | **Fixed (131f3a3)**: beacon sweeps registered noMerge | lighting.ts | |
| 7 | ~~P2~~ | **Fixed (134bbd8, 2026-10-25, journey 16/16)**: 138 on Low and 334 on High, inside both budgets (D-40). *2026-10-24: "Low is inside: 123 against 150" was a halved count (Low draws at 30 fps during the lighting upgrade, and the tool averaged over animation frames); it was 246.* *2026-10-13: 246 on Low and 500 on High on the branch `overhaul-phase2-unverified` (budgets 150 and 350); what the remaining draws are is in DECISIONS D-31.* The Wren is still over its Low budget: 256 calls against 150 (was 614). Its scene pass is 30–50% cheaper than the baseline's in a controlled A/B (below), but perf-run's Low p95 at 6× still misses 33 ms in the Wren, Kethra and Vessek | ship/interior/*, all scenes | M7: the remaining calls are unique-parameter materials; measure with the steadier method in issue 16 |
| 8 | ~~P2~~ | **Fixed (131f3a3)**: per-scene grades; space grade has no toe lift | GradeGlowPass.ts | |
| 9 | ~~P2~~ | **Fixed (131f3a3)**: world text on bundled faces; counters on Atkinson tabular | *Textures.ts, style.css | |
| 10 | ~~P2~~ | **Fixed (2026-10-13)**: with reduced motion the intro holds one framing and the white sky swells to 40% | IntroScene | |
| 11 | ~~P3~~ | **Fixed (131f3a3)**: reveal frees its resources; Kethra's timer is scene-owned | | |
| 12 | P3 | Floor textures: one canvas wrapped by several CanvasTextures (per-texture `.repeat`), so the same image uploads more than once. The Low downscale's reach is now moot for the Wren: its small canvases live in atlas pages, which the downscale deliberately skips so Low keeps each canvas's own resolution | floorTextures.ts:21-47 | M7 (bake the repeat into UVs so the textures can share) |
| 13 | ~~P3~~ | **Fixed (M4)**: the pillars stand on the terraces; the Heart sits in its own chamber | | |
| 14 | ~~P3~~ | **Fixed (131f3a3)**: the reveal's engine embers removed; the ports glow emergency amber | | |
| 15 | ~~P3~~ | **Fixed (ca4357a)**: the reveal is rebuilt at plot scale as MG1's opening | GalaxyRevealScene.ts | |
| 16 | P3 | perf-run's Low numbers at 6× CPU are too noisy to rank builds on this PC: identical runs differ by about ±10 ms at p50, and throttling from page load vs after arrival changed the Wren's scene pass from ~10 ms to ~30 ms. *2026-10-25:* part of the spread was sampling during the arrival work; `measure-scene --settled`, alternating builds, put three runs of one build within 3.5 ms at p95 in the Wren and Vessek (Kethra 10 ms) | tools/perf-run.mjs | Use `measure-scene --settled`, alternating builds; perf-run still samples early |
| 17 | P3 | Every return to the Wren redraws a rebuilt ship, and its warm-up frame (programs, texture uploads) freezes the loading screen for ~5.2 s on High | GameFlow.returnFromPlanet, Engine.setScene | M7: keep the ship's programs alive across planet visits, or prewarm it while the planet plays |
| 18 | ~~P3~~ | **Fixed (M4)**: the three materials were the moth's wings and the two haze sheets. three.js draws transparent double-sided materials in two passes and marks them for update on each; `forceSinglePass` | grove.ts, KethraScene.buildAtmosphere | |
| 19 | P2 | Vessek's JS heap went 52 → 79 MB (Low) and 53 → 105 MB (High) with the eight code-built hull variants | shipHull.ts, VessekScene.ts | M5: share geometry across variants or drop the CPU-side arrays after upload |
| 20 | P3 | The Wren's power stage is set when the room is built; nothing animates between stages yet | ShipInteriorScene, power.ts | M2: First light animates emergency → full as the power wave |
| 21 | ~~P3~~ | **Fixed (charter, 2026-09-29)**: only Kethra's markers carry numbers; our day is one chip beside the handle, on the other side of the path | overlay.ts | |
| 22 | P2 | Arriving on Kethra with a cold shader cache stalls one frame for 9.8 s (Low, 1×; M3 7.9 s): the first render waits on the driver to link ~160 programs (`getProgramParameter`), though `compileAsync` ran first. Kethra's `init` is no longer the problem: split into tasks, it is 0.4 s. Under the cruise and MG2 this lands on the handover to Kethra | Engine.prepareScene/setScene, every scene | M7: find why the prepared programs aren't ready (the parallel-compile extension, or keys that differ at the first draw), warm them across frames under the held shots, and cut the program count (the kit's variants, per-terrace materials) |
| 23 | ~~P3~~ | **Fixed (M3, M5)**: MG2 takes over Kethra's arrival; Vessek's cruise docks at the Anchorage | CruiseScene, anchorage.ts | |
| 24 | ~~P3~~ | **Fixed (5fefe8a)**: the cruise uses the title's planet with a faint night glow and a lit crescent (D-39). Was: Kethra's night side reads strong rather than "faint" (DESIGN §5, beat 4): the night map's bioluminescence is bright | planetShader night term | |
| 25 | ~~P3~~ | **Fixed (M6)**: the arrival title carries the level's number and line; no card repeats it, except after MG2, where a whole game separates them. Was: After the cruise the arrival card repeats the planet's name the kinetic title just gave | GameFlow.cruiseTo | |
| 26 | ~~P3~~ | **Fixed (b7547d3)**: faceted leaf clumps, the moon, bark (D-39). Was: MG2's foliage reads as stylized blobs where it's lit; the limbs are plain tapered cylinders | canopy/CanopyScene.ts | |
| 27 | P3 | A naive autopilot steering straight at each gap scraped 11 times in one descent (132 s): the short limbs hugging each gap leave about 2 m of margin | canopy/layout.ts | Playtest; widen the hugging ring if players find it punishing |
| 28 | ~~P2~~ | **Fixed (3a23313, 2026-10-24, journey 16/16)**: 122 on Low and 253 on High, inside both budgets (D-31). Was: Kethra on Low is over budget: 229 draw calls against 160 (baseline 155). Toggled one at a time: the kit's instanced foliage and scatter are 69 calls, the chamber 11, the canopy 4; the other 145 aren't broken down yet | KethraScene | M7: break the rest down by object, then merge static props per material (as the Wren's batchStaticGeometry does) |
| 29 | P3 | The Hush's view on High draws 504k triangles against 500k, 0.8% over (7c45ab8; was 669k, then 820k with the dressing): the belts behind the chamber's walls are culled by region now, but High keeps every tree | KethraScene filler trees | The design's LOD or impostors for the belt, or High keeping Low's thinner belt |
| 30 | P3 | tools/record-gameplay.mjs still travels by the pre-M2 fade (it emits `galaxy:travel_to` and waits 2.2 s); its Hush clip is updated, but the trip needs tools/lib/travel.mjs | tools/record-gameplay.mjs | M8, before the video is recorded |
| 31 | P3 | MG2's Wickmoth now flies its layer-4 path: the old patrol overwrote its position every frame, so it had never been on screen | canopy/CanopyScene.ts | M7 art pass: look at layer 4 with it there |
| 32 | P3 | **Mostly fixed (2026-10-13)**: the four team docs no longer point at `BreakerPuzzle.ts` or the keypad plot, and describe the ring bus, the survey, Chapters and the summary. docs/STORYBOARD_CHECK.md still predates MG2, MG3, First light and the cruise in places | docs/STORYBOARD_CHECK.md | Re-walk the storyboard against a playthrough |
| 33 | P2 | The Kethra dressing (D-25) takes the scene further over budget: High 467 draw calls against 450, Low 361k triangles against 320k, the Hush view 872k against 500k on High, and 102.5 MB of textures against 90 MB (the scene was about 96 MB before it). *2026-10-13:* its three CC BY models are rebuilt in code (D-30), which took Low to 349k and the Hush view on High to 819k; the draw calls are unchanged | planets/kethra/dressing.ts | Team decision on D-25; if it stays, the understory trees and the landmark's leaf cards are the first things to thin |
| 34 | ~~P3~~ | **Fixed (2026-10-13)**: the tool travels by `flow.debugGo('kethra')`, and marks the one target reached by jumping (Oshel's lantern, which tools/test-survey.mjs jumps to) | tools/collision-check.mjs | |
| 35 | ~~P3~~ | **Fixed (2026-10-13)**: the flake was the test's. A breath sends the moth a step closer and no breath counts while it flies there (the HUD says "Let it settle first"); the test read its perch, and breathed again, the moment the breath counted. It now waits for the moth to arrive. 5 of 5 runs passed on the final build | tools/test-mg3-flow.mjs | |
| 36 | ~~P3~~ | **Fixed (e3ba2af, 2026-10-24)**: the warm-up renders ran before any shadow map existed, and three.js r185 binds an un-uploaded stand-in for a missing map; one empty shadow pass first gives every light its map. Was: Kethra on Medium and High logs about 200 WebGL warnings on arrival ("Mismatch between texture format and sampler type"): a shadow sampler bound before its map has been drawn. Not on Low, not aboard the Wren. Present at 0e1a526 with the same counts (101, 72 and 33 by draw type), so not from the finishing pass. Nothing visible was traced to it | KethraScene (the moon's one-time shadow and the gaze's shadow pass) | Find which light's map is sampled before its first render; it may be the cause of part of issue 22's stall |
| 37 | P2 | The live 3D title with a match cut into the intro (DESIGN §1, M6) is not built: the title is still the DOM screen over a planet image | boot.ts, GameFlow.bootIntro, TitleScreen | docs/REPORT.md, next steps: hold the intro's first frame behind the DOM title first, then prepare the ship while the title is up, and measure a cold cache before removing the loading screen |
| 38 | P3 | The evidence board's only connection is made automatically by Fen's dialogue, so the board's own "select two clues" action always answers "already connected" or "no clear connection" | JournalSystem.CONNECTION_INSIGHTS | Give the board pairs of its own to find (the survey's texts are candidates), or drop the action |
| 39 | P3 | Three of the Wren's seven systems (navigation, shields, power distribution) can be repaired to no effect | GameFlow's `ship:repaired` handlers | Give each a consequence or remove it from the panel |
| 40 | P1 | `reference/bar.png` and its ten crops are a commercial game's promotional image with its logos, in a repository that is public. Not in the build; nothing was copied from it | `reference/`, docs/interior-art-brief.md, the interior review tools | **Team:** remove it before the repository is shown to anyone, and decide with the advisor whether the published history needs D-12's fresh-repository fix (docs/ASSETS.md) |
| 41 | ~~P3~~ | **Fixed (e3ba2af)**: the tutorial beacon's glow passed `map: undefined`. Was: Arriving at Kethra logs "THREE.Material: parameter 'map' has value of undefined" once, on every tier. In the build before the release pass too | Not traced; a material built with a `map` key that is undefined | Find the constructor and drop the key |
| 42 | P3 | **Met once a level has settled (2026-10-25)**: Low at 6× CPU, three runs each after the arrival work (`measure-scene --settled`): the Wren 24.1–27.6 ms, Vessek 22.6–25.3, Kethra 24.0–34.6 (one run over). In the Wren's first ~20 s on Low the lighting upgrade runs and the engine holds 30 fps by design, so no frame is under 33 ms then. Was: met in none of the three levels: Kethra 37–39 ms, the Anchorage 34–42 ms, the Wren 50–71 ms (three runs each, 2026-10-13, measured from 4 s after arrival) | every level | A real Chromebook; 6× throttling on this PC is a stand-in |
| 43 | P3 | Kethra holds 22.7 MB of vertex data on Low where it held 11.9: the merged kit gives every tree its own copy of its vertices | kit.ts `mergeKit` | Free the CPU-side copies after upload, or use three's BatchedMesh where the multi-draw extension exists |
| 44 | P3 | The Anchorage is inside its Low draw-call budget by 4 (176 of 180) at the view it opens on; other views were not counted. *2026-10-25:* 166–175 depending on the moment (175 settled) | VessekScene | The lever plates (7 draws) and the lamps (one material each, 34 draws) are the next things to fold; the Wren's `surfaces` batching option (D-40) would fold the lamps, once every material Vessek changes after the build is registered as animated |
| 45 | ~~P2~~ | **Fixed (503fbfb)**: the far arch's pillars had no collider; a rising head now stops 3 cm under a roof and the tunnel arches clear it. Was: The camera comes within 0–8 cm of stone in the Heart's chamber: jumping by its west wall near (-6.5, -31) brings the eye to overhead stone, and walking the east root tunnel over a rise near (10, -20.5) leaves it 8 cm under the roof. On the remote's build too (wall sweep, 2026-10-24) | hush/chamber.ts, roofAbove | Find the overhead piece; the collider's underside must sit at or below the visible stone |
| 47 | ~~P3~~ | **Improved (match cut)**: the cruise's last follow eases onto MG2's opening framing, so the skiff holds its place and size across the change; the letterbox and the surroundings still change. Was: The cut from the cruise's last shot to MG2's first frame shows: the cruise frames the skiff from behind at a shallow angle, MG2 from above. DESIGN §5 asks for no cut | CruiseScene.updateCamera, CanopyScene.placeCamera | Ease the cruise's last 2 s onto MG2's opening offset |
| 48 | P3 | Back aboard from a planet still shows the loading screen (issue 17's other half). Kept on purpose (D-39): building the Wren under the planet would hold both levels' textures at once | GameFlow.returnFromPlanet | A departure beat on the planet if real hardware shows the memory to spare |
| 49 | P2 | Texture memory on Low is over DESIGN §7's budget in two scenes (2026-10-25, estimated as TEXTURE_AUDIT.md does: width × height × 4 × 4/3, shared images once): **the Wren 210 MB against 150** (atlas pages 50, canvas colour 48, canvas roughness 33 and normal 32, kit files 41), **Vessek 165 against 110** (kit files 99, canvases 57); Kethra 84 against 90 is inside. Nothing has failed for it on the Intel UHD laptop the remote measured on. Tried: canvas bump and roughness maps at 256 px on Low (the Wren 167 MB, Vessek 143): it visibly softened prop bevels at the Wren's close range, still missed both budgets, and was reverted. Capping colour canvases at 512 as DESIGN's Low row says would blur signage | ship/interior/*Textures.ts, VessekScene, the kits | Bake the painted surfaces offline and ship them GPU-compressed (KTX2/Basis: about a quarter of the memory with no visible loss), or decide the budget was set too low for a room this detailed |
| 46 | P3 | The wall sweep's body-in-mesh list: wall fixtures 1–2 cm proud of the Wren's walls are inside the 0.35 m body when hugging a wall; the stepping stones' flared feet touch a body falling past into the pool. Neither is seen in first person | ship/interior, dressing.ts | Leave unless the body is ever drawn |
| 50 | ~~P2~~ | **Fixed (72372c3)**: "Click to look around" showed over MG1's win hold (186 frames): the Wren built behind it turned the prompt on in its init, and MG1 has no letterbox. Now in the Wren's onEnter, as the team's Kethra and Vessek do | ShipInteriorScene | s15 A |
| 51 | ~~P1~~ | **Fixed (72372c3)**: with a saved journey, Enter held on the title's Chapters opened the list, then its repeats armed and confirmed "The Wren", replacing the save | ChapterSelect | s15 C |
| 52 | ~~P2~~ | **Fixed (72372c3)**: a chapter's "From your own arrival" was the latest arrival, so after a revisit it opened on a finished level. Finished levels' arrivals aren't recorded | GameFlow.cruiseTo | s15 D |
| 53 | ~~P3~~ | **Fixed (72372c3)**: after a hold-to-skip, the skip's swallowed key-up never reached InputManager; Space stayed held and the next press didn't jump | HoldToSkip, InputManager.release | s15 B |
| 54 | ~~P3~~ | **Fixed (72372c3)**: a first trip that failed before leaving came back without the team's console guide (it disposes itself when the course is set) | GameFlow.guideToConsole | s15 G |
| 55 | ~~P2~~ | **Fixed (b7c0cea)**: Kethra's shallows were mirrored about z = -8 (canvas textures flip by default; the mask is drawn and sampled the same way round). Checked from above: they now ring the chamber, the terraces and the stones | kethra/water.ts | Top-down render, both ways |
| 56 | ~~P2~~ | **Fixed (b7c0cea)**: the teal glow motes, merged into one mesh, boxed as one 7.3 m collider at shin height near the landing, 0.24 m high (an invisible step) | KethraScene, collision.ts | s15 E |
| 57 | ~~P3~~ | **Fixed (b7c0cea)**: a step off the last stepping stone onto the landmark's loam sank the feet 0.5 m into it before the reset (the loam is not a floor; the tree's leaves hang 0.9 m over it). The reset by the stones is above the loam | KethraScene STONES_FALL_Y | s15 E |
| 58 | ~~P2~~ | **Fixed (b7c0cea)**: the two tree models were the only level files without the team's retry; one dropped request ended the trip | kethra/props.ts | |
| 59 | ~~P3~~ | **Fixed (b7c0cea)**: shadows coming on in the frame the trees were hidden recorded the moon's map as drawn with them, and leaving the chamber didn't repaint it | KethraScene.update | |
| 60 | ~~P3~~ | **Fixed (dd209d6)**: the Wren batched by the tier's name, but the player can switch shadows on at Performance; batches mixing casters and non-casters then all cast and received. Now Engine.willDrawShadows() | ShipInteriorScene, Engine | Counts unchanged on the default tiers |
| 61 | ~~P3~~ | **Fixed (dd209d6)**: under the low-battery and steady-30 caps together, the steady cap's budget was doubled again (relief only past p95 80 ms) | Engine.recordFrameForQuality | |
| 62 | ~~P3~~ | **Fixed (dd679b3)**: pow() of 1 - dot(unit, unit), which can round below zero, NaN on Direct3D; the cruise frames Kethra's whole disc. Clamped in the planet and the title's ship, rocks, Isilthe and astronaut; never seen, nan-scan clean before and after. Vessek's scope collider stopped 0.22 m short of its eyepiece | title/*.ts, VessekScene | |
| 63 | P3 | When the start-up benchmark steps a machine down to Performance after the Wren was built for Balanced, the room keeps Balanced's batching (more draw calls). The same trade the team made for its canvases and lights (adaptToTier): the next visit is built for the new tier | GameFlow.fitShipToMachine | Rebuild behind the bar if real hardware shows it matters |
| 64 | P3 | Not changed, for the team to listen to: the Wren's music and hum start while it is built behind the intro and behind MG1's win, a few seconds before the player is aboard. A lead-in, or a leak? Kethra and Vessek start theirs on arrival | ShipInteriorScene.init | Move both lines into onEnter if it reads as a leak |

## Decisions log
| Date | Decision | Why |
|---|---|---|
| 2026-09-26 | Working docs live in docs/ per the brief; the root DESIGN/PROGRESS stay as the TSA records | The team's workflow uses the root files; the brief's resume steps read docs/ |
| 2026-09-26 | Treat the design checkpoint as not yet passed | The brief's "Design approved" line still had its `[your notes]` placeholder, and no overhaul design existed on disk (checked every branch, stash and path) |
| 2026-09-26 | Journey mapping: MG2 and MG3 on Kethra, Vessek as the expanded "Level 2" (proposed) | TSA needs three levels; keeps the brief's order; the two new games fix the thinnest level (DESIGN §1) |
| 2026-09-26 | Keep Rajdhani as the ship's stencil face, move every counter to Atkinson tabular figures (proposed) | A reason from the world, and Rajdhani has no `tnum` (fontTools check) |
| 2026-09-26 | Screenshots are committed as JPEG q90 (4:4:4); lossless PNGs stay outside the repo for zoomed inspection | 30 PNGs at 1080p were 27 MB, and the brief's verification matrix multiplies that per milestone; as JPEG they're 6.9 MB |
| 2026-09-27 | Low keeps a glow: the grade pass's quarter-res LiteGlow (UnrealBloom stays High-only) | Low must look simpler, never broken (brief); without glow every screen and lamp reads flat. Measured: toggling it on Kethra at 6× CPU moved frame times less than run-to-run noise |
| 2026-09-27 | The freighter GLB (CC BY 3.0) is deleted; Vessek's twenty-one hulls use `buildShipHull({ variant })` | Approved at the checkpoint; one ship language, one fewer licence to carry |
| 2026-09-27 | Milestone screenshots commit at 1920×1080, Low and High; the other three sizes of the brief's matrix are inspected from scratch and committed at M7 | The full matrix is ~200 images per milestone; M7 is where the design puts the four-size verification |
| 2026-09-27 | Atlas pages are exempt from the Low canvas downscale | An atlas page is 2048 px only because it packs small canvases that were already within budget; halving it halved every placard's text on Low |
| 2026-09-27 | Tools wait for the flow to go idle, not just for the scene to become current | The scene is current ~5 s before its transition finishes; perf-run's next jump was being ignored |
| 2026-09-27 | MG1 leg 3 is two burns (a hop over the belt, then the lead); the belt is a full ring of clumps | At a fixed cruise speed a single straight burn has one intercept day, so "pay the extra day" can't happen in one burn. Details in DESIGN §4 slot 1 |
| 2026-09-27 | The reveal's system is at plot scale (1 unit = 1 Mkm) and matches the galaxy map's NAV figures | What the ping resolves is exactly what the player plots against; the old poster orrery had the Wren outside Kethra's orbit |
| 2026-09-27 | The desk chart draws real state: the belt band, Kethra's orbit, the buoy and the player's own course | DESIGN §2 "Screens show real state"; it replaced invented waypoints and telemetry |
| 2026-09-27 | The level builds when the cruise's title goes up, not while it flies | Its first build is one long task; landing it on a held title is better than a frozen mid-flight shot. The design's "the cruise warms Canopy" returns when M3 exists and M4 chunks the build |
| 2026-09-27 | A scene prepared ahead starts its timelines and input in `onEnter`, not `init` | The cruise is prepared during First light; its init had started its captions, title and hold-to-skip under the throttle hold (holding Space for the drive skipped the cruise) |
| 2026-09-27 | Trips keep the "Level N" arrival card after the cruise until M6 | TSA's three levels are named on arrival; the cruise's title carries only the name |
| 2026-09-29 | MG1 is a drag-and-connect charter; the belt leg stays cut | The one-choice version (hover picks, the course locks itself) left the player watching; the belt leg was the precision layer first-time players stalled on. Details in DESIGN §4 slot 1, "Redesigned again" |
| 2026-09-29 | On MG1's chart Kethra is blue, not Grove sea-green | Sea-green and the success green read as one colour, so "Kethra" and "correct" blurred together |
| 2026-09-27 | The Wren's full power follows `first_light`, or `left_wren` for the debug jumps that leave without it | First light is now the first departure |
| 2026-09-27 | MG2 is its own scene, prepared under the cruise and handed the skiff at the cruise's last shot; Kethra builds under MG2's establishing shot | A long build mid-descent would freeze play. MG2 plays on the first arrival only |
| 2026-09-27 | The kinetic title "Kethra" plays at the cruise's handoff; after touchdown the level's arrival card | One title per arrival; the card keeps the level number (issue 25) |
| 2026-09-27 | The Heart's chamber is a ring of 12.5 m about the Heart, which moves to its centre (0, −21.8); the door is at the approach ramp's top | The ramp already tops out at z −9.3, and the design's four beats need about 25 m of room |
| 2026-09-27 | The high perch is the gate arch over the door, looking south; the call-stone stands outside the rim's south arc | "Sees over low cover" and "the rim hides you" pull opposite ways: over the mounds the perch must look steeply down, over the rim shallowly. Sight maps of every perch (tools/test-hush-sim.mjs checks the result) put the south mounds 14–20 m below the gate and the rim between it and the stone |
| 2026-09-27 | One set of blocks is the chamber's geometry, its collision and the moth's line of sight | What looks like cover is cover, with no second model to drift |
| 2026-09-27 | The root tunnels are roofed at 1.95 m and walked through standing | The player's collider is a fixed 1.8 m tall; crouching does not shorten it |
| 2026-09-27 | The gaze is drawn from rays against those blocks, not from a shadow map | Low has no shadows, so a shadowed spot would light the floor behind cover and contradict the rules there; the rays agree with the sight test on every tier |
| 2026-09-27 | A flare turns the moth's gaze; only the lantern fills its alert | "Brush it, the moth turns, then settles": a brief light draws its look, not the moth |
| 2026-09-27 | Breaths count only while the moth is settled on a perch | Each breath sends it a step closer; breathing during that flight would skip the timing the Rite is about |
| 2026-09-27 | The held lantern is unlit | Its own flame, centimetres away, lit the brass cage white under bloom |
| 2026-09-27 | The wake replaces the canopy's bright/dim switch: a front travelling out from the Heart that leaves a residual glow; the awake glow is half the old bright | One system for the chamber, terraces, flora, pool and canopy; the full old bright read as neon once everything carried it |
| 2026-09-27 | Kethra stands in a still pool, with the fall reset at its surface | The terraces stood over a void; the lore has water climbing the terraces when the Heart wakes |
| 2026-09-27 | The moon's shadow renders once; in the frames it is not repainted, only the chamber casts in the gaze's shadow pass | Measured at High: the moon's pass was 286 calls and ~595k triangles a frame, the gaze's 153 and ~590k; together that took Kethra from 892 to 455 calls |
| 2026-09-27 | Crouch lowers the player to 1.1 m, and stays down wherever standing up would collide | The ducts are where crouch finally matters (DESIGN §6); letting go of C under a duct's roof must not wedge you into it. Kethra's root tunnels (1.95 m) are still walked standing |
| 2026-09-27 | Every circuit's lever is in the room it serves; the two self-resetting circuits' lockout boxes are in the ducts | "Breakers are physical levers in different compartments" (DESIGN §6): the crisis becomes a route through the ship, and the ducts are how you reach the lockouts |
| 2026-09-27 | The ducts' shell is rasterised from their runs (5 cm cells), open at the mouths and over the ladder shafts | One closed tube with exact openings at corners, mouths and shafts, where boxes per run left seams and doubled walls. `tools/test-vessek-layout.mjs` walks each mouth from inside its room |
| 2026-09-27 | The docking arrival's Anchorage is its own model (src/planets/vessek/anchorage.ts), the moored hulls and the Lantern Bay merged by material | Twenty moored hulls and the Bay (the ring's twenty-one) share five draw calls. With thirteen, the docked shot measured 31 calls on Low against the space budget's 80; more hulls add triangles, not calls |
| 2026-09-27 | At Vessek the planet stays put beyond the Anchorage while the Wren slows in; over Kethra it still rides ahead of the ship | A planet that moved with the ship slid across the sky behind the fixed approach camera; standing still, it grows as she comes in |
| 2026-10-25 | Frame time and draw calls are measured per frame drawn, after the arrival work (`measure-scene --settled`) | Sampled 4 s in on Low, half the frames drew nothing (the 30 fps hold during the lighting upgrade) and the upgrade's compiling sat in the sample |
| 2026-10-25 | The Wren's batching ignores shadow flags on Low and folds surfaces into vertex attributes (D-40) | 108 fewer draws on Low with the room matching within run-to-run noise; the cost is 10 more shader programs and a faint change in how two transparent layers blend on the big screens |

## QA log
| Date | What | Result |
|---|---|---|
| 2026-09-26 | Build | clean (`tsc && vite build`) |
| 2026-09-26 | `npm run smoke` (preview build) | 6/6 |
| 2026-09-26 | Journey: tutorial flow / Kethra flow / Vessek flow | 36/36 / 18/18 / all passed, zero console errors |
| 2026-09-26 | Baseline screenshots, 1920×1080, every screen and state (`tools/capture-screens.mjs`) | 30 shots in docs/screenshots/baseline-1920x1080/, zero console errors. Ranked by visual quality: the Wren interior > solar chart > title > Kethra > Vessek > reveal > intro > ending |
| 2026-09-26 | Vessek soft-lock repro (E, number keys, Esc; then a second full talk) | Reproduced: `vessek_pulse` never set |
| 2026-09-27 | `npm run journey` (smoke, tutorial, dialogue Esc, Kethra, Vessek) on the M0 build | 5/5 |
| 2026-09-27 | Tutorial flow flaked on its 30 s wait for the intro's skip | The intro offers the skip only after the ship builds under the loading screen: 29.3–30.1 s before M0's draw-call work, 30.5–31.1 s after, under the software rasteriser. Waits raised to 180 s, as for the intro's arrival |
| 2026-09-27 | Panel morph: Character (560×700) → Settings | The frame eases through 12 frames to 600×733; no re-entry, no errors |
| 2026-09-27 | Controlled A/B against the baseline build (same day, 6× CPU after arrival, seed 7) | Wren scene pass 10.0–14.9 ms vs 18.3–20.1 ms; Kethra 28.6–33.5 ms vs 28.3–28.7 ms |
| 2026-09-27 | M0 screenshots: 1920×1080 Low + High committed (docs/screenshots/m0, 36 JPEGs); 1280×720, 2560×1080 and 1440×900 inspected from scratch (108 PNGs) | Zero console errors. Fixed: atlased text on Low was half-resolution; the arrival card came within 4 px of a two-line objective at 1280×720 (now `top: max(14vh, 140px)`). Noted for M6: the centred "Level N" card is still the default the design replaces |
| 2026-09-27 | MG1 model: `tools/test-intercept-sim.mjs` | 17/17: each leg solvable; aiming at Kethra now misses by 19 Mkm; a flattened lead misses; the straight route hits the belt; no single burn (1,500 directions × every cell count) and no dive arrives; the belt has no gap in the plane; a plain climb costs the fourth cell |
| 2026-09-27 | MG1 played with real input: `tools/test-mg1-flow.mjs` | All passed: Shift + arrow aiming, [ ], 1/2, Space, R, the plate's buttons by mouse; the miss and contact labels; the budget refused past four; the counted win; the saved course; +1 insight and engineering; engineering 2 → five cells |
| 2026-09-27 | `npm run journey` (now seven tests) | 7/7; the tutorial flow is 39/39 with the MG1 and lighting-arc checks |
| 2026-09-27 | M1 screenshots: 1920×1080 Low + High (docs/screenshots/m1, 32 JPEGs): reveal beats, MG1's legs and win, the desk chart, the three power stages | Zero console errors. Fixed on the way: the reveal's line shader (reversed smoothstep showed the grid before the ping), a ping that washed the screen gold, the sun filling leg 1, near-side belt rocks cluttering leg 3, a white win line, the desk chart seen as a sliver from the seat, interaction prompts over the scripted poses |
| 2026-09-27 | The reveal + MG1 at 1366×768 (`measure-scene`) | Low (6× CPU) 30 calls, 14k tris, p50 16.7 / p95 24.3 ms; High 40 calls, p50 16.6 / p95 25.9 ms. Budget 80 / 160 |
| 2026-09-27 | First light and the cruise: `tools/test-cruise-flow.mjs` | 15/15: the throttle offered with its hold hint on emergency power; a half hold spools back and fails nothing; four ignitions bring full power; the cut lands in the cruise with no loading screen; the day counter; hold to skip lands on the arrival title, then Kethra; back aboard at full power; the next trip skips the throttle |
| 2026-09-27 | `npm run journey` (eight tests; the Kethra, Vessek and dialogue flows now fly their trips through First light and the cruise via tools/lib/travel.mjs) | 8/8 |
| 2026-09-27 | M2 screenshots, 1920×1080 Low + High (docs/screenshots/m2, 22 JPEGs): First light's four moments and seven cruise beats | Zero console errors |
| 2026-09-27 | MG2 layout: `tools/test-canopy-layout.mjs` | 27/27: every gap open, every layer 83–97% floor elsewhere, the sway layer's gap open 71% of the time and closed the rest, pods on every layer, each next gap reachable in the descent, the final drop narrowest and over the pad, every climb-back point clear |
| 2026-09-27 | MG2 flown: `tools/test-mg2-flow.mjs` | 16/16: strafe, brake (0.9 vs 2.4 m/s), the lamp waking pods, a real bough scrape costing a pip, three scrapes climbing back with the hull restored, a full descent flown to touchdown by steering at each gap, Kethra with the skiff parked, +1 traversal, a later arrival skipping MG2, engineering 2 widening the lamp |
| 2026-09-27 | A black frame on High in the cruise | UnrealBloom smearing a NaN from the plumes' shader (MSAA sampled a varying past its clamp; `pow` of a negative). Fixed by clamping in the fragment shader, here and in the three other new shaders that did the same |
| 2026-09-27 | MG3's rules: `tools/test-hush-sim.mjs` | 54/54: the door open and the ring closed; posts, glowcaps and the singer's place clear; the tunnels walked through standing; the rim's three gaps; the far arch sees the lesson glowcap and the path in (40/120 of its sweep open, never hooded); the open floor swept part of the time; crouched against either north mound the arch can't see you, standing it can; inside a tunnel the ledge never sees you; behind each south mound it does; against the rim's far side it doesn't; inside the rim it does; each Rite perch sees the stone part of the time and each is closer; the moth's notice, glide and gust; hood and step aside, and it searches and goes home; a flare turns its gaze and it settles; a breath seen or unseen |
| 2026-09-27 | MG3 played with real input: `tools/test-mg3-flow.mjs` | 28/28: into the chamber through the door, F and the right mouse button hood the lantern, hooded 1.70 m/s against 3.25 (traversal 2: 2.45), an open lantern in the sweep gusts you back to the door's lamp in control, hooded the same spot is safe for a whole sweep, the glowcap turns its gaze and it settles, the tunnel's lamp sends it to the gate arch, a breath in its gaze and a wrong colour each gust you back to the stone's lamp, three breaths while it looks away bring it vane → rim → Heart, the reward, hold to skip the wake, the card |
| 2026-09-27 | `tools/test-kethra-flow.mjs` with the chamber | 16/16 (the Heart through the harness hook; the carving on the gate) |
| 2026-09-27 | `npm run journey` (twelve tests) | 11/12, then the tutorial flow alone 39/39. It had failed on 404s because I rebuilt `dist` while it ran; the other eleven loaded fresh pages |
| 2026-09-27 | M4 screenshots, 1920×1080 Low + High (docs/screenshots/m4, 42 JPEGs): Kethra's floor, the Hush's beats, the Rite, the wake | Zero console errors. Fixed on the way: the lantern's body blown white by its own flame (now unlit), its open hood hanging over it, the gaze's hull drawn as hard sheets (now brightest edge-on) and poking over the walls (rays stop at the ring), the moon's glint on the pool a white block under bloom (rougher water), the awake grove neon (half the old bright), the rim washed flat by a square-law lantern pressed against it (decay 1.2) |
| 2026-09-27 | Kethra's arrival on a cold shader cache (`debugGo`, Low, 1×; the M3 commit built alongside for comparison) | `init` 0.4 s now it is split into tasks. The stall is the first render linking programs: M3 7.9 s (130 programs), M4 at first 10.1 s + 9.6 s (187). The second round was the lantern's light, hidden inside its lowered group: three.js leaves hidden lights out of the count, so every program rebuilt once the first frame hid it. Fixed: 9.8 s, 160 programs |
| 2026-09-27 | Issue 18 traced with a trap on `material.version` | three.js draws transparent double-sided materials back-then-front and marks them for update each time: the moth's four wings (+8 a frame) and the two haze sheets (+2 each). `forceSinglePass` on them: nothing bumps now |
| 2026-09-27 | Vessek's bus and plan for M5: `tools/test-bus-sim.mjs`, `tools/test-vessek-layout.mjs` | 21/21 and 39/39 (M5 work, committed with M5) |
| 2026-09-27 | `tools/test-vessek-flow.mjs` with the docking arrival (thirteen-hull build) | 49/49: the cruise lands on the title "Vessek Anchorage" and the Wren comes to rest at her berth before the cut; Ki, Shō through the hall duct and ladder, the pulse, the self-resetting lamps tripping the bus, the lockouts, the bay saved, the ledger, the ending; zero console errors |
| 2026-09-27 | The docking shot's flare | A white blob on the Lantern Bay was a GGX glint: the sun behind at a grazing angle on glossy canopy glass, then on the panel roughness map's glossy texels, spread by the bloom. The Anchorage's hulls are now matte (roughness ≥ 0.8, no roughness map; windows fully matte). A floodlight near the hull was a false lead |
| 2026-09-27 | Journey run (fourteen tests), stopped | The five model tests and smoke passed. The tutorial flow failed because I passed the site root as the base URL: it builds `baseUrl + '/?newGame=1'`, which needs the default `/kethra-adventure/`. The run was then stopped for low system memory before the other browser tests. To rerun |
| 2026-09-29 | MG1 charter: `tools/test-intercept-sim.mjs`, `tools/test-mg1-flow.mjs` | 18/18 and 54/54: one marker agrees in whole days (day 6), every marker on Kethra's orbital plane; the handle starts unplugged, → plugs into Kethra-now, 3 is too late, 9 too early, 6 lights both checks and Launch; early Launch refused with the failing check flashed; drag, second drag, free drop and press-on-marker by mouse with no pointer lock; hint, pulse and "Let ORION connect it" (no auto-launch); insight 2; charting to the win 3.2 s scripted; zero console errors |
| 2026-09-29 | `tools/test-mg3-flow.mjs` fixed | Failing before the charter work (breaths 2 and 3 seen, the Rite reset): the test pressed as soon as the gaze was 0.06 rad clear of the stone, including while the moth was still turning onto its sweep after landing, and read the new perch a frame before the game sets it. It now waits for the moth to settle and for the gaze to be moving away. 28/28 |
| 2026-09-29 | `npm run journey` (fourteen tests) on the charter build | 14/14. Baseline before the change: 12/14 (test-mg3-flow as above; test-kethra-flow timed out while the PC slept, 16/16 when rerun) |
| 2026-10-12 | Build after the Kethra dressing (D-25) | clean (`tsc && vite build`) |
| 2026-10-12 | `tools/test-hush-sim.mjs`, `tools/test-canopy-layout.mjs` | all passed |
| 2026-10-12 | `tools/test-kethra-flow.mjs` on the preview build | all checks passed, no page or console errors |
| 2026-10-12 | `tools/test-mg3-flow.mjs` on the preview build, five runs | four runs 28/28; the first run failed 7 checks from breath 2 on (issue 35) |
| 2026-10-12 | Reachability on Kethra (the collision check's flood fill, travelling by `debugGo`; issue 34) | 242 colliders, spawn clear, 9/9 interaction targets reachable |
| 2026-10-12 | Trees hidden inside the Heart's chamber (a probe that teleports plaza, door, call-stone, plaza) | shown, shown, hidden, shown; no page errors |
| 2026-10-12 | Looked at, High, 1366×768: arrival, plaza, both terraces, the gate ramp, the chamber asleep and awake, each moth perch | Kept after four passes; what was thrown out is in docs/DESIGN_NOTES.md |
| 2026-10-12 | Looked at, Low, 1366×768: arrival, plaza, east and west terraces, the gate ramp, the chamber | As designed: six columns, two crystal clusters, no understory, mist or moths; the landmark's crown at half its cards is thinner but even |
| 2026-10-12 | `tools/run-journey.mjs` on the preview build | 14/14 |
| 2026-10-12 | `stress_tests/run.mjs` on the preview build | 13/13 scenarios (s08-kethra with its one KNOWN, BUG-013) |
| 2026-10-12 | `tools/test-mg3-flow.mjs`, five runs each on e4f525e and the working tree, alternating | e4f525e 3/5, working tree 4/5 (issue 35) |
| 2026-10-12 | Tree maps right-sized after the audit (leaves 1024 → 512 and 512 → 256, bark 512 → 256) | Same triangle counts, Khronos validator clean, no difference in the closest views; Kethra's textures 109.5 → 102.5 MB. The suites above ran before this last change, which is texture data only; build, `test-kethra-flow` and the screenshots were repeated after it |
| 2026-10-12 | Not done | No real Chromebook |
| 2026-10-13 | A script holding W from Kethra's spawn, 7 s (walk straight ahead, as a player does) | Before: into the pool three times (2.2 s, 4.6 s, 6.8 s). After the span from the landing: across it and on over the plaza, no fall |
| 2026-10-13 | Reading an inscription on Kethra | Before: a one-line toast; the text only in the journal aboard the Wren. After: the text on screen, for the three inscriptions, the shrine and the last carving |
| 2026-10-13 | `tools/test-survey.mjs` (new): every find, its reward once, its text | The Wren 20/20 (the note, key and locker chain; the day-22 log restored). Kethra 23/23 (the stones crossed with real walking jumps, a fall returning to the terrace, the perch hidden until the moth leaves it). Vessek 14/14 (Dace's duct crawled with real keys; her star question reachable) |
| 2026-10-13 | `tools/test-ending.mjs` (new) | 24/24: Chapters on the title; a chapter boots straight into its level with a first playthrough's skills; a saved journey is replaced only on the second press; the pause menu's survey line; the summary's figures (17 days in flight), skills, survey by world and choices; Chapters from the ending |
| 2026-10-13 | The stepping stones, first layout | Thrown out twice. Laid from the terrace's east edge they started behind a boulder's collision box and ended under a bough at head height (found by listing the scene's objects and mapping the tree's limbs). With a short first gap, the same jump overshot the first stone. Final: from the north edge, every gap the same |
| 2026-10-13 | WebGL warnings on Kethra (issue 36) | Built 0e1a526 alongside: identical counts there, so not from this pass |
| 2026-10-13 | `tools/test-mg3-flow.mjs` after its fix, five runs on the final build | 5 of 5 (issue 35) |
| 2026-10-13 | `tools/collision-check.mjs` after its fix | The Wren: 1,757 of 1,757 open cells reachable, 9/9 targets on foot (the five new ones among them). Kethra: 10 targets on foot, and Oshel’s lantern marked as reached by jumping; the 237 cells not walkable from the spawn are the stepping stones and the slab |
| 2026-10-13 | `tools/run-journey.mjs` on the final build (now sixteen tests) | 16/16 |
| 2026-10-13 | `stress_tests/run.mjs` on the final build | 12 of 13 scenarios on the full run (s08-kethra with its one KNOWN, BUG-013). The thirteenth, s07-flow, failed its double-click check: the Warden now opens on her topics once met, so its two conversations began on different lines. With the scenario corrected it passes on its own, 15/15 |
| 2026-10-13 | Looked at, 1366×768: each new find from where a player stands; the title, the chapter list, the pause menu and the ending's summary at 1366×768 and 1280×720 | Kept. Changed on the way: the bench note moved out of the task lamp's hot spot; Mbeki's letter made plain paper (the amber tape is Carrow's); the seed book rebuilt as covers and pages with a label |
| 2026-10-13 | Not done | A real Chromebook; a human playthrough; the four-size screenshot matrix |
| 2026-10-13 | Release pass, Phase 0: the four player-path fixes run again by a script written without the finishing pass's tests (another tier and seed, the real trip in, levers thrown by hand) | 22 of 22 |
| 2026-10-13 | Release pass, Phase 0: the cruise to the Anchorage, two frames 0.38 s apart in transit | The hull lit, then dark: eleven laps of the sun in ten seconds. Capped at six (D-28) |
| 2026-10-13 | Release pass, Phase 0: a chapter whose level file is refused | Before: a black screen. After: aboard the Wren with the chapter's progress (`tools/test-ending.mjs`, now 25 checks) |
| 2026-10-13 | The test machine slept, 08:29:35 to 09:14:34 (power log), one second into a chamber-test run | That run discarded. The chamber test passed five other runs, three in a row after the wake. A keep-awake request was held for the rest of the pass's runs |
| 2026-10-13 | `tools/run-journey.mjs` on c53e322, checked out and built on its own | 16/16 |
| 2026-10-13 | Release pass, Phase 1: every third-party file's licence read at its source | docs/ASSETS.md. Found: three.js's licence notice missing from the bundle (the text now ships); two textures logged as unused that two levels load; a font credit for a file that is not there; one unlicensed reference image in the repository (issue 40) |
| 2026-10-13 | Phase 1: the column, crystal and moth built in code, looked at beside the models from the same cameras (High: plaza, landing, chamber asleep and awake, each moth perch; Low: plaza, chamber) | The first version thrown out: columns like a picket fence with a saw-tooth top, crystals pale and without facets, the moth four white triangles. Redone; pairs in docs/screenshots/release/ |
| 2026-10-13 | Phase 1: `tools/test-ending.mjs` (with the chapter gate), `tools/test-survey.mjs kethra`, `tools/collision-check.mjs kethra` | 28/28, 23/23, 11 targets with none failing |
| 2026-10-13 | Release pass, Phase 2: every view `tools/measure-scene.mjs` reaches, both presets, before any change | Over on draw calls: the Wren, Kethra, the Heart's chamber, the Anchorage. Inside: intro, reveal, cruise, MG2, the docking shot, the ending (table under Performance) |
| 2026-10-13 | Phase 2: one frame's draws recorded and grouped by material (a script hooking `renderBufferDirect`) | Kethra: 68 draws were the kit's species, 24 the terraces, about 24 each character. High draws every mesh a second time for ambient occlusion |
| 2026-10-13 | Phase 2: the same fixed cameras before and after, compared pixel by pixel | Mean difference per channel, of 255: the Wren 0.00–0.19 (7 cameras), the Anchorage 0.01–0.49 (6), Kethra 0.01–1.31 (21, High). One Low frame of the chamber differs by 10.5: the moth's gaze mid-sweep |
| 2026-10-13 | Phase 2: Low at 6× CPU, three runs of each build in turn | Kethra's median frame 29–31 ms → 20–22 ms. The Anchorage about 2 ms better. The Wren no different |
| 2026-10-13 | Phase 2: Kethra, chamber, Anchorage, survey and dialogue tests; both collision checks | All passed. Kethra's colliders 242 → 230 (pillars, valve and carving are one box each); 17 fewer walkable cells beside them; every target still reached |
| 2026-10-13 | Phase 2: `tools/run-journey.mjs` on the build that was committed | Cut off at 9 of 16, all nine passing, when the machine ran out of memory. The code stays on its own branch until all 16 pass |
| 2026-10-13 | Phase 2: `stress_tests/run.mjs` on the same build | Not run: the machine was out of memory |
| 2026-10-13 | Not done (the pass stopped after Phase 2) | The journey under WebKit; a throttled playthrough; the four-size screenshot matrix; the live title; a real Chromebook; a human playthrough |
| 2026-10-13 | Phase 1: `tools/run-journey.mjs` on the build that was committed | 16/16 (10:20 to 10:41); no source file changed between that build and the commit |
| 2026-10-14 | Merge A (D-34) validated on `integration/A-validation` | journey 16/16, test-load-failure 6/6, stress 13/13 |
| 2026-10-24 | Merge of the remote's 35 new commits (`integration/C-20261024`, 3a2cd0b) | Nine files conflicted, each kept both sides (commit message). Build clean; journey 16/16 |
| 2026-10-24 | The remote's own suites on the merge | test-controls, test-load-failure, test-level-caches passed. test-title failed on what our side adds: the Chapters button (now a sixth button checked: Enter opens it, focus returns), and a save without galaxy_revealed resuming at the reveal (BUG-006; the test's save now has the flag) |
| 2026-10-24 | Stress suite on the merge | 13/13 after three test fixes: the title's backdrop is an engine scene, so "Continue reaches a scene" passed on the title itself (`lib.leftTitle` waits for the flow to leave boot); Continue is shown disabled for an unreadable save (D-37); the menu is inert until revealed (D-37). s08 keeps its KNOWN BUG-013 |
| 2026-10-24 | The remote's wall sweep on the merge, and on the remote's own build for a baseline | Merge: Kethra and Vessek "inside a collider". Remote: Vessek the same, Kethra clean. Causes and fixes in 2542465: the secret ledge walked into from the banks (now a collider), the gate's columns jumped through (colliders), a fall past an edge landing the body in its side (it slides off). After: inside a collider never, in all three |
| 2026-10-24 | After the collision fixes | journey 16/16, test-title, test-controls, s06, s08, both collision checks. test-kethra-flow's valve spot stood inside the valve's collider; it now looks down at it from the front |
| 2026-10-24 | D-31 (Phase 2) re-applied on the merged code (3a23313) | journey 16/16, test-controls, s06, s08, wall sweep in all three. mergeKit now keeps solid kit apart from ground cover and marks it, or the sweep counted merged grass as walls |
| 2026-10-24 | WebGL warnings on High, traced with gl.getError() after each draw | 208–256 per arrival, every level, all from warm-up renders before any shadow map existed (issue 36). Fixed; `tools/console-scan.mjs` (title, intro, Wren, reveal, Kethra, Vessek, ending) clean on Low, Medium and High. Journey 16/16 after |
| 2026-10-24 | Whole journey on the real GPU, High, 1920×1080 (`tools/capture-journey.mjs`, 62 shots), ranked | Weakest first: the title (black on High: NaN under MSAA, fixed), MG2's canopy, the cruise's Kethra and arrival title, First light, the Hush lantern, the loading screen after MG1. Each fixed and looked at again (D-39). nan-scan clean in every scene; test-mg2, test-mg3, test-cruise, test-vessek, test-mg1, test-tutorial, s01, s10, s11 pass |
| 2026-10-24 | The wall sweep's eye check, each case looked at in place | Seven cases fixed (503fbfb): the chamber's far-arch pillars (no collider), the root tunnels' roof (a jump left the camera 10 cm from an arch), the bent grate's bars lying across the crawl, the duct fans crawled through when off (they now fold against the wall on a hinge, screenshots checked), the reset lever's arm, the dock lockout box hanging over a corner, a coyote jump off a vent lip through the tanker's ceiling. After: nothing within 8 cm of the eye in any level |
| 2026-10-24 | The screenshot matrix (four sizes × Low and High, 62 shots each), looked at | Found and fixed: a view of the Anchorage black under the arrival card in six of eight runs, the live camera left on the warm-up layer while the lighting upgrade drew (b1570e5; 14 frames, ~0.23 s, at Vessek on this PC); the duct mouths' pale outlines (0f310bd). Also fixed: the HUD at the screen's far edges at 2560×1080 (5e34c42, a 16:9 safe area), the last credit hidden at 1280×720 (679eadd, the credits roll) |
| 2026-10-24 | `tools/live-frames-check.mjs` (new): the live camera's layers read every frame for 16 s after arriving | 0 wrong frames in the Wren, Kethra and Vessek, Low and High (was 14 at Vessek) |
| 2026-10-24 | `tools/test-frame-rates.mjs` (new): the motion integrators stepped at 30, 60 and 144 Hz | Springs and damping agree to 1e-6. The player's jump peaked at 0.900 / 0.950 / 0.979 m against tuning.ts's 1 m; exact step for constant gravity (b25fbbb): 1.000 m at all three. test-controls, test-survey and the wall sweep pass |
| 2026-10-24 | Kethra on Low over its triangle budget (7c45ab8) | 349k → 186k (320k); the chamber view 347k → 163k (200k). High 798k → 597k (900k); the chamber view 820k → 504k, 0.8% over 500k. test-kethra-flow, test-mg3-flow, the Kethra survey, the wall sweep, nan-scan pass |
| 2026-10-25 | The frame target re-measured, `measure-scene --settled` (new) | The Wren read 246 calls settled against yesterday's 123: on Low the engine holds 30 fps during the lighting upgrade and the tool averaged over animation frames. Tool fixed (7ded32c): per frame drawn, the cap reported |
| 2026-10-25 | The Wren's batching (134bbd8): `tools/draw-list.mjs` before and after | Low 246 → 138 (150), High 500 → 334 (350); triangles at the spawn view 148.3k → 149.5k (150k), elsewhere 122–125k → 141k (merged batches cull less finely) |
| 2026-10-25 | The same, room sweeps (7 spots × 8 yaws) against the old build | Pixels differing by more than 8/255: Low full power 0.10%, Low emergency 0.02%, High 0.16%. The old build against itself: 0.14% (High), 0.97% (Low). One local difference: on the big screens a faint brightening under the bezel glint, where transparent layers now blend in another order (D-40) |
| 2026-10-25 | The same, suites | Journey 16/16; console-scan clean on Low, Medium and High; the Wren's wall sweep identical to the old build's (never inside a collider; the same 13 and 2); live-frames-check, nan-scan pass. Texture memory unchanged (208 → 210 MB estimated); vertex data 8.6 → 13.6 MB; programs 72 → 82 |
| 2026-10-25 | The four-size matrix on the final build (8 runs × 62 shots), looked at as contact sheets and full size where anything looked off | 0 console errors or warnings in every run. Found and fixed: the cloud the skiff drops through showed square edges (3763abc: its puffs ran past the texture's edge, and the canopy's ground cut the low ones off). Found to be the tool's, fixed in it: the cruise's title shots showed no title (the scene's timeline clock isn't moved by jumping its time), the shot after MG1 caught the scan-line wipe, the pause shot showed no menu (a script's Esc doesn't free the mouse as a player's does) |
| 2026-10-25 | After the cloud fix | test-cruise-flow, test-mg2-flow, nan-scan pass; stress 13/13 on the build before it (s08 with its KNOWN BUG-013) |
| 2026-10-25 | Every view at once with the outer trees on and off, from inside the Heart's chamber (3 spots × 8 directions, and 5 steps in from the door looking back) | Through the door a tree beyond it vanished as the player crossed into the chamber (1.3% of the frame 2 m in). Fixed (197a575): hidden only with the door out of the camera's view; test-kethra-flow, test-mg3-flow pass |
| 2026-10-25 | Frame time on High, vsync off, installed Chrome (`tools/perf-frames.mjs`, docs/perf/final-20261025) | p95 3.9–6.9 ms in the Wren, Kethra and Vessek against 17. measure-scene's headless p95 of 29–33 ms on High is its frame scheduling, not the game |
| 2026-10-25 | The final build (b44446f's code): `tools/run-journey.mjs` in four chunks, console-scan on every tier, stress s05, s08, s14 (the scenarios the last two fixes touch; the other ten passed on 134bbd8) | 16/16; clean on Low, Medium and High; 3/3 (s08 with its KNOWN BUG-013) |
| 2026-10-25 | Texture memory per scene on Low, against DESIGN §7 (issue 49) | The Wren 210 MB (150), Vessek 165 (110), Kethra 84 (90). Canvas bump and roughness maps at 256 px tried: 167 and 143 MB, a visible softening of bevels in the room sweep (2.1% of pixels differ by more than 8/255), still over; reverted |
| 2026-10-25 | Low at 6× CPU, settled, three runs of each build in turn | The Wren p95 32.4–45.2 ms → 27.2–29.4 ms. Then all three levels on the final build: the Wren 24.1–27.6, Vessek 22.6–25.3, Kethra 24.0–34.6 (issue 42) |
| 2026-10-25 | The team's own tests on the final build (1a369cd): test-title, test-controls, test-load-failure, test-level-caches (its revisit screenshots compared), texture-leaks, test-offline, test-resilience; and the older test-uis, test-save-load, test-evidence-board, test-repair-after-kethra, test-kethra | All pass: 52/52 title checks, 22/22 controls, 6/6 load failure; revisits within 0.9% of pixels (moving motes and figures); no planet texture alive back aboard; 0 requests off the local server. test-movement crashed and test-map expected the old map: both written for the game before the title screen, both updated (1bf5726) |
| 2026-10-25 | The quality tier switched by hand mid-Wren, both ways, against rooms built on each tier | No errors. Switched up, the room keeps Performance's 8 lights and halved canvases until the next visit (the team's documented trade); no shadow faults seen |
| 2026-10-25 | Four reviewers on `git diff f624308 overhaul` (render and perf core; flow, UI and input; Kethra; space, title and Vessek), every finding checked in the code and, where it shows, in the game | Issues 50–64. Not adopted: a toast at a stand-in chapter's boot (harmless; it shows over the loading screen) |
| 2026-10-25 | s15-seams against the build before the fixes (a worktree of 1a369cd) and after | Before: 8 of its 24 checks fail (the prompt over MG1's win 186 frames; no jump, peak 0.00 m; the save replaced; the finished level's snapshot replaced; 1 mote collider; feet 0.58 m down before the reset; no console guide after the failed trip). The tier switches and the readout (F) pass on both: they guard what already worked. After: 24/24. Issues 58–62 were found in the code and not reproduced |
| 2026-10-25 | Kethra's shallows from above, the pool alone, tinted red, the mask flipped both ways | Unflipped (the fix), the shallows ring the chamber, the terraces, the stones and the banks; flipped (before), the chamber's ring sits over open water south of the plaza |
| 2026-10-25 | The fixed build: journey in four chunks, stress (now 14 scenarios), the endurance soak at 15 laps, console-scan on every tier, nan-scan, live-frames-check, test-frame-rates, the wall sweep in all three levels, the team's tests again, the Wren's counts | 16/16; 14/14 (s08 with its KNOWN BUG-013); heap 17.8 → 19.3 MB over 13 laps with GPU objects, listeners and DOM flat; clean on Low, Medium and High; no NaN in any scene (title-isilthe included); pass; pass; never inside a collider, near-eye cases unchanged (the Wren's 13 and 2; Vessek's door frames at 10–11 cm); all pass; 138 / 150k on Low, 334 / 299k on High, unchanged |

## Performance
Baseline on this PC (RTX 4060) at 1366×768, DPR 1. Low = pinned Low tier with 6× CPU throttle;
High = pinned High tier, unthrottled. Source: docs/perf/overhaul-baseline/{low-cpu6,high-cpu1}/results.json.

| Scene | Preset | fps | p50 / p95 ms | Draw calls | Triangles | Textures | Heap MB | Budget (calls / tris) |
|---|---|---|---|---|---|---|---|---|
| Intro | Low | 60 | 16.7 / 16.7 | 18 | 47.6k | 224 | 48.4 | 80 / 150k |
| Intro | High | 60 | 16.7 / 16.7 | 31 | 47.7k | 245 | 26.6 | 160 / 300k |
| The Wren | Low | **30.3** | 33.3 / **49.9** | **614** | 142k | 231 | 25.9 | 150 / 150k |
| The Wren | High | 60 | 16.7 / 16.7 | **942** | 251k | 267 | 27.1 | 350 / 300k |
| Kethra | Low | 60 | 16.7 / 16.8 | 155 | 311k | 50 | 46.5 | 160 / 320k |
| Kethra | High | 60 | 16.7 / 16.7 | **611** | **1.24M** | 69 | 41.1 | 450 / 900k |
| Vessek | Low | 59.3 | 16.7 / 16.8 | 197 | 76k | 65 | 52.3 | 180 / 200k |
| Vessek | High | 60 | 16.7 / 16.7 | 405 | 152k | 84 | 53.3 | 400 / 400k |

- **Loading:** title 0.7–1.3 s; intro playable 16.3–16.6 s from a cold browser; 24.6 MB total.
- **Memory:** heap loop-to-loop +0.7% (Low) and +1.8% (High), so no leak shows.

### M0 (2026-09-27)
Same presets. Source: docs/perf/m0/{low-cpu6,high-cpu1}/results.json; the reveal and ending rows
are from `tools/measure-scene.mjs` (spawn view, no pan), since perf-run doesn't visit them.

| Scene | Preset | fps | p50 / p95 ms | Draw calls | Triangles | Textures | Heap MB |
|---|---|---|---|---|---|---|---|
| Intro | Low | 59.8 | 16.7 / 16.7 | 17 | 6k | 204 | 25.4 |
| Intro | High | 60 | 16.7 / 16.7 | 27 | 6k | 224 | 26.0 |
| The Wren | Low | 24.5 | 49.9 / 66.7 | **251** | 147k | 205 | 25.8 |
| The Wren | High | 60 | 16.7 / 16.8 | **422** | 278k | 236 | 26.8 |
| Kethra | Low | 40.1 | 16.7 / 50.0 | 187 | 312k | 55 | 39.0 |
| Kethra | High | 59.8 | 16.7 / 16.7 | 612 | 1.24M | 73 | 40.1 |
| Vessek | Low | 29.8 | 33.3 / 66.6 | 256 | 72k | 71 | **79.1** |
| Vessek | High | 59.8 | 16.7 / 16.8 | 404 | 117k | 89 | **105.1** |
| Reveal | Low | – | 16.5 / 18.9 | 25 | 25k | 34 | – |
| Reveal | High | – | 16.7 / 18.6 | 35 | 25k | 46 | – |
| Ending | Low | – | 16.6 / 18.7 | 24 | 7k | 22 | – |
| Ending | High | – | 16.6 / 18.0 | 34 | 7k | 34 | – |

- **Read the Low rows with issue 16 in mind.** Re-running the baseline build the same day gave the
  Wren 33.4 / 99.9 ms and Vessek 16.7 / 50.0 ms, and identical runs of one build differ by about
  ±10 ms at p50. The controlled A/B in the QA log is the comparison to trust: the Wren's scene pass
  is 30–50% cheaper than the baseline's.
- **Loading:** intro playable 28.3 s (Low, 6×) and 37.0 s (High). This PC ran about 2× slower
  today: the baseline build re-run on Low gave 31.5 s where it had given 16.6 s. A same-day High
  baseline wasn't taken.
- **Memory:** loop-to-loop +1.2% (Low) and +1.5% (High). Vessek's heap is new: the twenty-one
  hulls are now code-built (issue 19).
- The Wren's draw calls at the spawn view (`measure-scene`): Low 614 → 256, High 942 → 520.

### M4 (2026-09-27)
`tools/measure-scene.mjs` at 1366×768, spawn view, one run each (read p95 with issue 16 in mind).
"Hush" is Kethra from just inside the chamber's door, looking in.

| Scene | Preset | p50 / p95 ms | Draw calls | Triangles | Programs | Budget (calls / tris) |
|---|---|---|---|---|---|---|
| Kethra | Low (6× CPU) | 16.5 / 24.2 | 223 | 324k | 158 | 160 / 320k |
| Kethra | High | 15.8 / 35.1 | **449** | **649k** | 181 | 450 / 900k |
| Hush | Low | 17.0 / 23.8 | 135 | 322k | 158 | 120 / 200k |
| Hush | High | 17.0 / 29.2 | 283 | 669k | 182 | 300 / 500k |

- **High:** 892 → 449 calls and 1.83M → 649k triangles at the spawn view, from drawing the moon's
  shadow once and keeping the gaze's shadow to the chamber (decisions log). That is under the
  baseline's 611 / 1.24M and inside Kethra's budget.
- **Low:** 223 against 160 (issue 28). The Hush view is over on both counts on Low and on
  triangles on High (issue 29).
- **Arrival, cold shader cache:** 9.8 s linking programs on the first render (issue 22).

### M5 (2026-09-27, partial)
`tools/measure-scene.mjs dock` at 1366×768: the cruise to Vessek at its last shot, the Wren docked.
Measured with thirteen moored hulls; the twenty-hull Anchorage has the same draw calls and more
triangles, still to measure. Vessek's own row is still to take.

| Scene | Preset | p50 / p95 ms | Draw calls | Triangles | Programs | Budget (calls / tris) |
|---|---|---|---|---|---|---|
| Docking shot | Low (6× CPU) | 16.7 / 21.0 | 31 | 76k | 117 | 80 / 150k |
| Docking shot | High | 16.6 / 26.4 | 41 | 76k | 134 | 160 / 300k |

### Kethra dressing (2026-10-12)
`tools/measure-scene.mjs` at 1366×768, production builds of the commit before (e4f525e) and the
working tree after, served side by side, one run each for the counts (the after rows are from
the final build). See DECISIONS D-25.

| Scene | Preset | Draw calls | Triangles | Textures | Programs | Budget (calls / tris) |
|---|---|---|---|---|---|---|
| Kethra | High, before | 449 | 649k | 77 | 183 | 450 / 900k |
| Kethra | High, after | **467** | 842k | 86 | 199 | 450 / 900k |
| Kethra | Low, before | 223 | 324k | 57 | 160 | 160 / 320k |
| Kethra | Low, after | 229 | **361k** | 63 | 172 | 160 / 320k |
| Hush | High, before | 282 | 669k | 77 | 184 | 300 / 500k |
| Hush | High, after | **302** | **872k** | 86 | 200 | 300 / 500k |
| Hush | Low, before | 135 | 322k | 57 | 160 | 120 / 200k |
| Hush | Low, after | 141 | 359k | 63 | 172 | 120 / 200k |

- **What it cost.** About 97k triangles of new geometry on High (drawn twice there, for the
  ambient-occlusion pass) and 37k on Low; 18 draw calls on High and 6 on Low; 9 textures on High
  and 6 on Low; 16 shader programs on High and 12 on Low. Kethra on High is now 17 calls over its
  budget; Low,
  already over on calls, is now 13% over on triangles (was 1%). The Hush rows were over before and
  are further over.
- **The Hush rows overstate it.** That pose is 10.4 m from the Heart, just inside the door, where
  the new trees can still be seen through the gate. From 10 m in, the scene stops drawing them:
  64k triangles of trees, counted twice on High. A probe that teleports in and out confirmed the
  switch (off by the call-stone, back on at the plaza).
- **Frame time: no difference measured.** Kethra on Low at 6× CPU, four runs each: before, p50
  16.8 to 41 ms and p95 36 to 86 ms; after, p50 17.5 to 27 ms and p95 40 to 59 ms. The spread
  between runs of one build is wider than the gap between the builds, so this neither shows a cost
  nor rules one out. It does show that single 6× runs cannot rank two builds.
- **Download.** 2.0 MB of new files, fetched on arrival at Kethra, on top of a build already over
  its 20 MB target (docs/PERF_AUDIT.md).
- **Texture memory** (`tools/texture-audit.mjs`, TEXTURE_AUDIT.md): Kethra is at 102.5 MB against
  90 MB. 6.7 MB of that is this change's eight maps; the pool's 512 px shallows mask (1.3 MB
  more) is not seen by the audit. The scene was therefore about 96 MB before it.
- **Not measured:** a real Chromebook, and the cold-cache shader link on arrival (issue 22), which
  the extra programs will lengthen.

### Finishing pass (2026-10-13)
`tools/measure-scene.mjs` at 1366×768, production builds, one run each; Low at 6× CPU. "Before" is
0e1a526: for Kethra and the Hush the table above, for the Wren and Vessek that commit built and
measured the same day (Vessek's own row had never been taken).

| Scene | Preset | Draw calls | Triangles | Budget (calls / tris) |
|---|---|---|---|---|
| The Wren | Low, before → after | 269 → **271** | 148k → 148k | 150 / 150k |
| The Wren | High, before → after | 546 → **550** | 296k → 296k | 350 / 300k |
| Kethra | Low, before → after | 229 → **231** | 361k → **362k** | 160 / 320k |
| Kethra | High, before → after | 467 → **471** | 842k → 843k | 450 / 900k |
| Hush | Low, before → after | 141 → **138** | 359k → **359k** | 120 / 200k |
| Hush | High, before → after | 302 → **302** | 872k → **872k** | 300 / 500k |
| Vessek | Low, before → after | 218 → **221** | 186k → 187k | 180 / 200k |
| Vessek | High, before → after | 444 → **450** | 373k → 373k | 400 / 400k |

- **What the finds cost:** two to six draw calls a scene and about a thousand triangles. The Wren +2 / +4
  (Low / High), Kethra +2 / +4, Vessek +3 / +6. Kethra's stepping stones are in the ruins mesh and cost
  no call of their own; its four are the span from the landing and Oshel's lantern and crook.
- **The Hush view** reads 141 → 138 on Low. That pose's count moves by a few with where the moth's
  gaze is in its sweep; nothing in this pass draws less.
- **All four scenes are over their draw-call budgets on both presets**, as they were before this
  pass. None of that is new and none of it was reduced. Frame times were not compared (issue 16).

### Release pass, Phase 1 (2026-10-13)
`tools/measure-scene.mjs` at 1366×768, one run each, unthrottled (the counts do not depend on the
throttle). "Before" is the table above. The three code-built pieces (D-30) replace 2,200, 2,157 and
900 triangles with 810, 216 and 80, and one 512 px texture with none.

| Scene | Preset | Draw calls | Triangles | Textures | Budget (calls / tris) |
|---|---|---|---|---|---|
| Kethra | Low, before → after | 231 → 231 | 362k → **349k** | 63 → 62 | 160 / 320k |
| Kethra | High, before → after | 471 → 471 | 843k → **798k** | 86 → 85 | 450 / 900k |
| Hush | Low, before → after | 138 → 141 | 359k → **347k** | 63 → 62 | 120 / 200k |
| Hush | High, before → after | 302 → 301 | 872k → **819k** | 86 → 85 | 300 / 500k |

The build is 98.0 MB (was 98.2).

### Integrated (2026-10-24)
`tools/measure-scene.mjs` at 1366×768, the view each scene opens on, unthrottled (counts do not
depend on the throttle). Both branches merged and D-31 re-applied (3a23313).

| View | Low: calls / tris (budget) | High: calls / tris (budget) |
|---|---|---|
| The Wren | **123** / 74k (150 / 150k) | **500** / 297k (350 / 300k) |
| Kethra | 122 / **349k** (160 / 320k) | 253 / 798k (450 / 900k) |
| Hush | 91 / **347k** (120 / 200k) | 202 / **820k** (300 / 500k) |
| Vessek | 162 / 173k (180 / 200k) | 346 / 362k (400 / 400k) |

- **Over:** the Wren's calls on High; triangles in Kethra and the Hush view on Low, and the Hush view on High.
- **Later the same day:** MG2 (the canopy) 34 / 198k on Low and 44 / 198k on High, inside both budgets
  for the first time (b7547d3). The Vessek vent surrounds (0f310bd) took Vessek to **166 / 177k** on Low
  and **360 / 375k** on High, inside both; that commit's message says its draw calls were unchanged,
  which was wrong (+4 Low, +14 High: High draws each mesh again for shadows and ambient occlusion).
- ~~The Wren on Low went from 246 to 123~~ *Corrected 2026-10-25:* the Wren's Low row was measured
  while the engine held 30 fps for the lighting upgrade, and the tool averaged over animation frames,
  half of which drew nothing. It was 246 / 148k. Kethra, the Hush view and Vessek are not held, so
  their rows stand.

### The Wren inside both budgets (2026-10-25)
`tools/measure-scene.mjs --settled` (per frame drawn, after the arrival work), 1366×768, spawn view.

| View | Low: calls / tris (budget) | High: calls / tris (budget) |
|---|---|---|
| The Wren, before (7c45ab8) | **246** / 148k (150 / 150k) | **500** / 297k (350 / 300k) |
| The Wren, after (134bbd8) | 138 / 150k (150 / 150k) | 334 / 299k (350 / 300k) |
| Vessek, settled | 175 / 186k (180 / 200k) | |

- **What the Wren's draws were** (`tools/draw-list.mjs`, Low): 26 were a material split by shadow
  flags that Low doesn't draw (134bbd8's message says 29; three of those are the throttle's moving
  parts, which stay apart); 58 untextured surfaces and glows with a material each (plus the
  throttle's 10 and the deck strip); about 75 single canvases that the atlas kept apart because
  their tint, opacity or roughness differed.
- **Triangles:** 149.5k at the spawn view against 150k on Low, 298.9k against 300k on High; the other
  views went from 122–125k to 141k on Low and from 245–250k to 271–277k on High, because a merged
  batch is culled as one. Both presets are inside, with little to spare.
- **Frame time, Low at 6× CPU, settled, three runs of each build in turn** (p95, ms): before 45.2,
  34.5, 32.4; after 29.4, 27.4, 27.2. Then the final build, all three levels: the Wren 27.6, 24.1,
  26.6; Kethra 28.5, 24.0, 34.6; Vessek 25.3, 22.6, 25.1.

### Release pass, Phase 2 (2026-10-13)
`tools/measure-scene.mjs` at 1366×768, the view each scene opens on, one run each for the counts.
Draw calls a frame, budget in brackets. "Before" is the Phase 1 build, which is what `overhaul`
holds; "after" is the branch `overhaul-phase2-unverified`.

| View | Low: before → after | High: before → after |
|---|---|---|
| Intro | 19 (80) | 32 (160) |
| The Wren | 271 → **246** (150) | 550 → **500** (350) |
| Reveal and MG1 | 29 (80) | 39 (160) |
| Cruise | 22 (80) | 32 (160) |
| MG2 Canopy | 30 (120) | 40 (300) |
| Kethra | 231 → **122** (160) | 471 → **253** (450) |
| Hush | 141 → **91** (120) | 301 → **202** (300) |
| Docking shot | 31 (80) | 41 (160) |
| Vessek | 221 → **176** (180) | 450 → **360** (400) |
| Ending | 24 (80) | 34 (160) |

- **Inside now:** Kethra, the Hush view and Vessek, on both presets. **Still over:** the Wren.
- **Triangles** did not change. Still over on Low: Kethra 349k against 320k, the Hush view 347k
  against 200k, MG2 271k against 250k; on High the Hush view 820k against 500k.
- **Frame time, Low at 6× CPU, three runs of each build in turn** (median / p95, ms). Kethra:
  28.8 / 47.6, 29.0 / 52.2, 30.6 / 52.1 before; 21.5 / 38.5, 21.6 / 36.9, 20.0 / 38.4 after. Vessek:
  23.0 / 38.0, 22.5 / 40.1, 20.0 / 38.6 before; 20.6 / 33.8, 21.1 / 41.8, 18.2 / 34.8 after. The
  Wren: 32.9 / 53.1, 33.6 / 54.7, 34.7 / 52.1 before; 33.0 / 50.5, 31.5 / 60.1, 35.3 / 71.2 after.
  Alternating the builds made the runs of one build agree to within 2 ms at the median, which
  single runs never did (issue 16).
- **Memory:** vertex data on Low, Kethra 11.9 → 22.7 MB, Vessek 10.1 → 10.1, the Wren 8.2 → 8.6.
- **Not measured:** a real Chromebook; views other than the one each scene opens on.
