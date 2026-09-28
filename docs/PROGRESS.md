# Progress · the overhaul

Working state for docs/BRIEF.md. Branch `overhaul` (from master 9daf513). After compaction or in a
fresh session, read docs/BRIEF.md, this file, docs/DESIGN.md and `git log --oneline -15` first.
(The root PROGRESS.md is the TSA session log; this file is the overhaul's.)

## Status
**2026-09-27: M4 done; starting M5.** Milestone check-ins are OFF, so work continues milestone
to milestone without stopping.

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
- [ ] M5 Level 2: Vessek expanded ← next
- [ ] M6 Opening, menus, ending
- [ ] M7 Whole-game pass and art pass
- [ ] M8 Report

## Open issues
| # | Sev | Issue | Where | Plan |
|---|---|---|---|---|
| 1 | ~~P1~~ | **Fixed (ea28978)**: Esc on Varro's closing line meant the pulse never fired | DialogueSystem.ts | Regression test fails before and passes after |
| 2 | ~~P1~~ | **Fixed (131f3a3)**: double start from the title | flow machine + title guard | |
| 3 | ~~P1~~ | **Fixed (131f3a3)**: breaker double solve | BreakerPuzzle.ts | |
| 4 | ~~P2~~ | **Fixed (131f3a3)**: stale timers closing the wrong panel (`close(id)`) | PanelManager.ts | |
| 5 | ~~P2~~ | **Fixed (131f3a3)**: replaced panels now close properly | PanelManager.ts | |
| 6 | ~~P2~~ | **Fixed (131f3a3)**: beacon sweeps registered noMerge | lighting.ts | |
| 7 | P2 | The Wren is still over its Low budget: 256 calls against 150 (was 614). Its scene pass is 30–50% cheaper than the baseline's in a controlled A/B (below), but perf-run's Low p95 at 6× still misses 33 ms in the Wren, Kethra and Vessek | ship/interior/*, all scenes | M7: the remaining calls are unique-parameter materials; measure with the steadier method in issue 16 |
| 8 | ~~P2~~ | **Fixed (131f3a3)**: per-scene grades; space grade has no toe lift | GradeGlowPass.ts | |
| 9 | ~~P2~~ | **Fixed (131f3a3)**: world text on bundled faces; counters on Atkinson tabular | *Textures.ts, style.css | |
| 10 | P2 | Reduced motion: glides and FOV now handled; the intro dolly and the white-sky swell still ignore it | IntroScene | M6 (intro rebuild) |
| 11 | ~~P3~~ | **Fixed (131f3a3)**: reveal frees its resources; Kethra's timer is scene-owned | | |
| 12 | P3 | Floor textures: one canvas wrapped by several CanvasTextures (per-texture `.repeat`), so the same image uploads more than once. The Low downscale's reach is now moot for the Wren: its small canvases live in atlas pages, which the downscale deliberately skips so Low keeps each canvas's own resolution | floorTextures.ts:21-47 | M7 (bake the repeat into UVs so the textures can share) |
| 13 | ~~P3~~ | **Fixed (M4)**: the pillars stand on the terraces; the Heart sits in its own chamber | | |
| 14 | ~~P3~~ | **Fixed (131f3a3)**: the reveal's engine embers removed; the ports glow emergency amber | | |
| 15 | ~~P3~~ | **Fixed (ca4357a)**: the reveal is rebuilt at plot scale as MG1's opening | GalaxyRevealScene.ts | |
| 16 | P2 | perf-run's Low numbers at 6× CPU are too noisy to rank builds on this PC: identical runs differ by about ±10 ms at p50, and throttling from page load vs after arrival changed the Wren's scene pass from ~10 ms to ~30 ms | tools/perf-run.mjs | M7: repeat runs, report the median of medians, and add main-thread CPU per frame from a trace |
| 17 | P3 | Every return to the Wren redraws a rebuilt ship, and its warm-up frame (programs, texture uploads) freezes the loading screen for ~5.2 s on High | GameFlow.returnFromPlanet, Engine.setScene | M7: keep the ship's programs alive across planet visits, or prewarm it while the planet plays |
| 18 | ~~P3~~ | **Fixed (M4)**: the three materials were the moth's wings and the two haze sheets. three.js draws transparent double-sided materials in two passes and marks them for update on each; `forceSinglePass` | grove.ts, KethraScene.buildAtmosphere | |
| 19 | P2 | Vessek's JS heap went 52 → 79 MB (Low) and 53 → 105 MB (High) with the eight code-built hull variants | shipHull.ts, VessekScene.ts | M5: share geometry across variants or drop the CPU-side arrays after upload |
| 20 | P3 | The Wren's power stage is set when the room is built; nothing animates between stages yet | ShipInteriorScene, power.ts | M2: First light animates emergency → full as the power wave |
| 21 | P3 | In MG1 the Kethra and Wren tick numerals can overlap where the two ghosts cross | InterceptGame.drawLabels | M7 art pass: offset labels by side of the line |
| 22 | P2 | Arriving on Kethra with a cold shader cache stalls one frame for 9.8 s (Low, 1×; M3 7.9 s): the first render waits on the driver to link ~160 programs (`getProgramParameter`), though `compileAsync` ran first. Kethra's `init` is no longer the problem: split into tasks, it is 0.4 s. Under the cruise and MG2 this lands on the handover to Kethra | Engine.prepareScene/setScene, every scene | M7: find why the prepared programs aren't ready (the parallel-compile extension, or keys that differ at the first draw), warm them across frames under the held shots, and cut the program count (the kit's variants, per-terrace materials) |
| 23 | P3 | The cruise's Kethra entry (cloud sprites, canopy lights, a wedge skiff) is interim until MG2 takes over the arrival; Vessek's cruise holds on the planet until its docking (M5) | CruiseScene, cruise/pieces.ts | M3, M5 |
| 24 | P3 | Kethra's night side reads strong rather than "faint" (DESIGN §5, beat 4): the night map's bioluminescence is bright | planetShader night term | M7 art pass |
| 25 | P3 | After the cruise the arrival card repeats the planet's name the kinetic title just gave | GameFlow.cruiseTo | M6 (the card's redesign) |
| 26 | P3 | MG2's foliage reads as stylized blobs where it's lit; the limbs are plain tapered cylinders | canopy/CanopyScene.ts | M7 art pass |
| 27 | P3 | A naive autopilot steering straight at each gap scraped 11 times in one descent (132 s): the short limbs hugging each gap leave about 2 m of margin | canopy/layout.ts | Playtest; widen the hugging ring if players find it punishing |
| 28 | P2 | Kethra on Low is over budget: 229 draw calls against 160 (baseline 155). Toggled one at a time: the kit's instanced foliage and scatter are 69 calls, the chamber 11, the canopy 4; the other 145 aren't broken down yet | KethraScene | M7: break the rest down by object, then merge static props per material (as the Wren's batchStaticGeometry does) |
| 29 | P3 | The Hush's view on High draws 669k triangles against 500k: the background tree belt behind the chamber's walls is still drawn | KethraScene filler trees | M7: the design's LOD or impostors for the belt |
| 30 | P3 | tools/record-gameplay.mjs still travels by the pre-M2 fade (it emits `galaxy:travel_to` and waits 2.2 s); its Hush clip is updated, but the trip needs tools/lib/travel.mjs | tools/record-gameplay.mjs | M8, before the video is recorded |
| 31 | P3 | MG2's Wickmoth now flies its layer-4 path: the old patrol overwrote its position every frame, so it had never been on screen | canopy/CanopyScene.ts | M7 art pass: look at layer 4 with it there |

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
