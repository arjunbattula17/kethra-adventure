# Stress-test bug ledger

Running log for the stress pass on branch `overhaul`. Every finding goes here, minor and uncertain
ones included. Severity: Critical = crash, freeze, soft-lock or data loss; High = breaks gameplay or
the rules; Medium = wrong but playable; Low = cosmetic. "Source" names the scenario or audit that
found it (audit IDs: CORE, UI, SHIP, KETH, VES).

Run the suite: `npm run build && npx vite preview --port 4180 --strictPort` in one terminal, then
`node stress_tests/run.mjs`. One scenario: `node stress_tests/<file>.mjs`.

## Ledger
| ID | Sev | Status | Source | Summary | Root cause |
|---|---|---|---|---|---|
| BUG-001 | High | reproduced | s01-saves | A save with a null/garbage journal entry crashes the journal (and Kethra's init reads the same list) | GameState.ts:146-161 `migrateSave` keeps any array without checking elements |
| BUG-002 | Low | reproduced | s01-saves | A negative attribute in a save loads as-is | GameState.ts:175-178 attributes not clamped |
| BUG-003 | Medium | reproduced | s04-endurance | Every Kethra visit leaks 5 GPU geometries | KethraScene.ts:1188 skips all InstancedMeshes; canopyCeiling/chamber build their own |
| BUG-004 | High | reproduced (Node) | VES-3, bus-rules | Regulator off for 22 s cancels the auto-resets for good: the crisis is won with no lockouts | bus.ts:146-148 drops an expired timer whose needs are unmet |
| BUG-005 | Medium | reproduced (Node) | VES-6, bus-rules | A trip inside `update()` has its fresh timers overwritten by stale ones (lamps back after 8 s, not 22) | bus.ts:140-151 loops over a pre-trip snapshot |
| BUG-006 | Critical | suspected | CORE-1, SHIP-1 | Save and quit during MG1 or the chart lean leaves a save that can never unlock Kethra | GameFlow.ts:385 sets `tutorial_battle_complete` before :457-460 set `galaxy_revealed` |
| BUG-007 | Critical | reproduced | VES-1, s06-vessek | The junction door closes on a player in the doorway: they can't move; only the keypad (code) is in reach | VessekScene.ts:1115-1123 auto-close has no occupancy check |
| BUG-008 | Critical | suspected | CORE-2, SHIP-3, UI-1 | An asset or chunk load failure mid-trip hangs or strands the player; kit caches keep the rejection so retries fail | CruiseScene.ts:259 no rejection path; Engine.setScene disposes first; kit.ts caches rejected promises |
| BUG-009 | Critical | suspected | CORE-3, SHIP-2 | The reveal's import-failure fallback is refused by the transition it runs in | GameFlow.ts:389-404 calls go('wren') inside go('reveal') |
| BUG-010 | High | reproduced | VES-2, s06-vessek | The duct drop into the tanker lands the player inside a grow table, unable to walk | dressing.ts:171-178 table row under layout.ts drop at (-7.565, -26) |
| BUG-011 | High | reproduced | VES-4, s06-vessek | The sealed tanker hatch cranks open from the hall side | InteractionSystem range ignores walls; VessekScene.ts:779-790 |
| BUG-012 | High | reproduced | VES-5, s06-vessek | The junction's inside button works from the tanker, skipping the code and the grate | VessekScene.ts:769-777, dressing.ts:241-243 |
| BUG-013 | High | suspected (Node) | KETH-1 | The Canopy course is skipped by flying wide around the boughs | CanopyScene.ts:318-363 no lateral bound; layers pass by height |
| BUG-014 | High | suspected | UI-2, CORE-4 | Clicking the canvas (or closing a panel) captures the mouse in MG1/MG2, freezing cursor aim | InputManager.ts:25-27, PanelManager.ts:128 |
| BUG-015 | High | suspected | CORE-5 | "Save and quit" reloads even when the save failed; toast says "full" for blocked storage | boot.ts:103-106 ignores save()'s result; UIManager.ts:120 |
| BUG-016 | Medium | suspected (Node) | KETH-2, CORE-8 | The Hush's own timers run at double speed (gust carry 0.53 s) | HushGame.ts:65 + :146 advance a 'game' scope twice |
| BUG-017 | Medium | suspected (Node) | KETH-3 | The grove is dimmed across all of Kethra, not just inside the chamber | HushGame.ts:129 smoothstep with its bounds reversed |
| BUG-018 | Medium | suspected (Node) | KETH-4 | Jumping onto a mound or the call-stone lands you inside it, stuck | PlayerController.ts:133 skips low boxes; no vertical collision |
| BUG-019 | Medium | suspected (Node) | KETH-5 | The skiff touches down anywhere, off the pad and off the ground disc | CanopyScene.ts:361 ignores LANDING.r |
| BUG-020 | Medium | suspected | SHIP-4 | The crosshair stays hidden after the first departure, for the rest of the session | GameFlow.ts:619 hides it; nothing re-shows it |
| BUG-021 | Medium | suspected | SHIP-5, CORE-15 | The Wren's hull (7 geometries, 9 materials, a 1 MiB texture) leaks on every cruise and reveal | CruiseScene.ts:440-447, GalaxyRevealScene.ts:277-278 remove it before disposing |
| BUG-022 | Medium | suspected | SHIP-6 | First light's push-in faces the right-hand wall; an unwrapped yaw spins the camera n turns | FirstLight.ts:68; GameFlow.ts:627-648 |
| BUG-023 | Medium | suspected | UI-4, SHIP-7 | Re-opening the map during departure re-enables the player mid-cinematic | MapController.ts:106-112,171 restores a stale `enabled` |
| BUG-024 | Medium | reproduced | UI-7, VES-18, s06-vessek | On Kethra and Vessek, E still works (and prompts show) during cutscenes | VessekScene.ts:1040, KethraScene.ts:1149 update interaction while disabled |
| BUG-025 | Medium | suspected | UI-8 | Hold-to-skip's key swallower outlives the skip if the key-up is lost; Space/Enter dead | HoldToSkip.ts:85-109 |
| BUG-026 | Medium | suspected | UI-9 | In dialogue a double-click or held Enter also picks the next line's option | PanelManager.ts:84-88, DialogueSystem.ts:129-147 |
| BUG-027 | Medium | suspected | UI-5, CORE-12 | Mouse movement accumulates while the player is disabled, then snaps the view | InputManager.ts:49-54, PlayerController.ts:168-170 |
| BUG-028 | Medium | suspected | UI-6 | Keyboard-only players can't spend skill points: Tab closes the sheet, nothing focusable | CharacterPanel.ts:30-41,120-121 |
| BUG-029 | Medium | suspected (Node) | CORE-6 | One throwing timer freezes the whole game for good | motion/core.ts:143-151 |
| BUG-030 | Medium | suspected | CORE-7 | The 30 fps battery cap trips the quality governor down to its lowest | Engine.ts:485 vs :240 thresholds |
| BUG-031 | Medium | suspected | CORE-9 | Journal/library backfill runs before the save loads; old saves never get them | boot.ts:51-52 before :71 |
| BUG-032 | Medium | suspected | CORE-10, SHIP-8 | The reveal starts in init(), so it plays behind the loading cover on slow machines | GalaxyRevealScene.ts:156 |
| BUG-033 | Medium | suspected | CORE-11 | A deferred quality preset applies on an uncovered cut, freezing mid-departure | Engine.ts:292 |
| BUG-034 | Medium | suspected | VES-7 | Lever tags don't update when a stat rises during the level | busWorld.ts:132-135 |
| BUG-035 | Low | suspected | CORE-13 | A crafted save with a huge xp hangs gainXp (1e20 - 100 === 1e20) | GameState.ts:233 |
| BUG-036 | Low | suspected | VES-9 | Varro's persuasion lockout doesn't flip the box handle or set its flag | VessekScene.ts:704 |
| BUG-037 | Low | suspected | VES-10, KETH-4 | Jumping in a duct or tunnel puts the camera through the roof | PlayerController.ts:247-253,312 |
| BUG-038 | Low | suspected | VES-12 | The pulse's camera shake plays at 6.2 s, not 0.5 s | PlayerController.ts:168 |
| BUG-039 | Low | suspected | VES-13 | Door colliders switch instantly while the door takes 0.6 s to slide | rooms.ts:336-345 |
| BUG-040 | Low | suspected | VES-15 | The dock lockout box floats past its wall | busWorld.ts:251-256 |
| BUG-041 | Low | suspected | VES-16 | After a mid-crisis reload the ring's ship lamps are lit | VessekScene.ts:970-977 |
| BUG-042 | Low | suspected | VES-17 | The heaters' note says "NO FLOW = TRIP"; the bus refuses instead | vessekLore.ts:42 |
| BUG-043 | Low | suspected | VES-19 | Dependents dropped by switching off pumps/regulator get no feedback | bus.ts:76-82 |
| BUG-044 | Low | suspected | SHIP-9 | Skipping the reveal mid-ping re-runs the ping over MG1 | GalaxyRevealScene.ts:185-223 |
| BUG-045 | Low | suspected | SHIP-10 | After a cruise skip its captions still play over the title | CruiseScene.ts:271-277 |
| BUG-046 | Low | suspected | SHIP-11 | Interior shadow-floor emissive dims further on each rebuild | walls.ts:40-47, power.ts:118-125 |
| BUG-047 | Low | suspected | SHIP-12 | Isilthe never appears in the reveal (beyond PING_REACH) | GalaxyRevealScene.ts:33,219-222 |
| BUG-048 | Low | suspected | SHIP-13, UI-14 | Hold-to-skip takes Space/Enter even over an open panel | HoldToSkip.ts:20-24 |
| BUG-049 | Low | suspected | SHIP-14, UI-13 | The console guide is disposed by any travel request, even a failed one | ConsoleGuide.ts:28 |
| BUG-050 | Low | suspected | SHIP-15 | Intro and ending leak their GPU resources once per session | IntroScene.ts:526-531, EndingScene.ts:251-262 |
| BUG-051 | Low | suspected | KETH-7 | The door post's lamp never lights | HushGame.ts:66, 245-249 |
| BUG-052 | Low | suspected | KETH-8 | Skipping the wake quickly leaves the moth frozen mid-air | HushGame.ts:194, KethraScene.ts:864-878 |
| BUG-053 | Low | suspected (Node) | KETH-9 | The lantern jerks (19° roll) after a gust past ±π yaw | HushGame.ts:273-289 |
| BUG-054 | Low | suspected (Node) | KETH-10 | The moth can end up inside a tunnel roof | sim.ts:470 |
| BUG-055 | Low | suspected | KETH-11 | The Hush objective goes stale after leaving or winning | HushGame.ts:230 |
| BUG-056 | Low | suspected | KETH-12 | Third scrape and a layer pass on one frame disagree on the climb target | CanopyScene.ts:355-396 |
| BUG-057 | Low | suspected | KETH-13 | Debug `win()` during a gust or climb breaks the cutscene state (harness only) | HushGame.ts:290, CanopyScene.ts:406-410 |
| BUG-058 | Low | suspected | UI-10 | Keys pressed before the loop starts replay on its first frame | InputManager.ts:16-19,74-76 |
| BUG-059 | Low | suspected | UI-11 | Focus isn't kept inside open panels (Tab reaches the title's buttons) | TitleScreen.ts:78 |
| BUG-060 | Low | suspected | UI-12 | Holding O or Esc repeats: Settings flickers, Pause re-opens | SettingsPanel.ts:110-117, PanelManager.ts:29-35 |
| BUG-061 | Low | suspected | CORE-14 | The tutorial cold open runs on wall-clock timers under panels | TutorialSequence.ts:258-270 |
| BUG-062 | Low | suspected | CORE-16 | `?jump=` without skipIntro leaves the letterbox up (harness trap) | IntroScene.ts:250,526-531 |
| BUG-063 | Low | unreachable | VES-14 | bus.update with negative or NaN dt misbehaves; the engine never passes one | bus.ts:141,158 |

## Design questions (not bugs; left alone)
| ID | Source | Question | Recommendation |
|---|---|---|---|
| DQ-1 | UI-3, KETH-6 | Crouch is bound to Ctrl; Ctrl+W closes the tab and pages can't block it | Keep C, drop Ctrl from crouch; save on `pagehide` |
| DQ-2 | VES-8 | A lockout doesn't switch off a circuit that's already on | Have the lockout open the circuit (lockout-tagout de-energises) |
| DQ-3 | VES-11 | Ladders: letting go of W drops you; the top landing window is 0.07 m | Hold position on the ladder when no key is held |
| DQ-4 | SHIP-16 | A pickup credits every system that uses that resource at once | Decide whether resources are shared or spent per repair |
| DQ-5 | SHIP-17 | Belt rocks are built and compiled but never shown since the MG1 redesign | Remove them or show them |
| DQ-6 | UI-15 | Pause → Settings replaces the pause menu; Esc drops into play | Return to Pause |
| DQ-7 | UI-16 | O or Esc mid-conversation still runs its completion (can start the pulse) | Keep for Esc (intended, documented); decide for O |
| DQ-8 | KETH | A climb-back returns above the layer already passed; any one fragment unlocks the Rite; `miniGame().win()` ships in production | Owner's call |
| DQ-9 | CORE | canPause during transitions; Continue always starts on the Wren; Restart after completing a level undoes it | Block pause while `flow.isTransitioning()` |

## Details
Reproduction steps and evidence for each fixed bug are in its regression test (named in the
Status column once fixed) and in the commit message.
