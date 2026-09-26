# Game overhaul brief

> Saved verbatim on 2026-09-26 at the start of the overhaul (branch `overhaul`). The facts marked
> [discover] are resolved in docs/AUDIT.md ("Project facts, resolved"). Working state lives in
> docs/PROGRESS.md; the design in docs/DESIGN.md.

<project_facts>
Fill in what you know. Anything marked [discover] is yours to work out during the audit.

- Engine / framework: [discover]
- How to run it locally: [discover]
- Target platform: [discover, e.g. desktop browsers or a Windows build]
- Reference low-end machine: a laptop with integrated graphics (Intel UHD / Iris Xe class), 8 GB RAM, 1080p display
- Input: keyboard and mouse, plus gamepad if the project already supports it
- Third-party assets: CC0 only, each logged with its source and license in CREDITS.md [or: none, build everything in code]
- Design checkpoint: ON (stop after Phase 2 so I can approve the direction)
- Milestone check-ins: OFF (once the design is approved, keep building without pausing between milestones)
</project_facts>

<context>
You're taking an existing 3D game and turning it into a portfolio piece that works on three levels at once: a polished indie game, a playable motion-design showreel, and a well-crafted UI/UX project. Whoever plays it will judge taste as much as function. In every scene and every state, it should read as "someone with excellent taste designed this on purpose."

For this job you're the whole studio: creative director, game designer, environment artist, technical artist, motion designer, UI/UX designer, VFX artist, and performance engineer. The creative director has the final word on consistency.

The player journey you're building toward:

Opening → opening motion-design sequence → Mini-game 1 (rebuilt as genuinely 3D) → new pre-travel cinematic → planet travel (rebuilt) → Mini-game 2 (new) → Mini-game 3 (new) → Level 2 (substantially expanded) → a designed ending and progression state

During the audit, map the current game onto this journey. Where the existing structure differs, propose how to reconcile it instead of forcing a fit.

This is meant to be ambitious. Wherever going beyond the minimum raises the quality of the result, go beyond it.
</context>

<priorities>
Some of these requirements pull against each other: pushing the graphics versus running on a low-end laptop, going all out versus not adding things for their own sake. When they conflict, resolve them in this order:

1. The game works end to end, with no crashes, soft-locks, broken transitions, or errors in the console or logs.
2. It stays inside the performance budget on the Low preset.
3. Quality is consistent. Raise the floor before the ceiling: one weak scene next to strong ones makes the whole game look unfinished, so fix the weakest area before polishing the best.
4. Gameplay feels good: responsive, readable, fair.
5. Hero moments: cinematics, reveals, signature effects.
6. Additional content.

When you're choosing between adding something and finishing something, finish it. Three excellent mini-games beat ten mediocre ones, one great transition beats five generic ones, and a small, beautifully composed space beats a large empty one.
</priorities>

<workflow>
This job will span several context windows. Work in phases and keep your state on disk so you can pick up cleanly after compaction or in a fresh session. Keep the working documents short and practical; they're tools, not deliverables.

Phase 0: Setup
Save a copy of this brief as docs/BRIEF.md. Initialize git if needed and work on a branch. Get the game running as it is now and capture a baseline: screenshots of every scene (in docs/screenshots/), visible bugs, and per-scene frame time, draw calls, triangle count, and memory. Create docs/PROGRESS.md with a milestone checklist, current status, open issues, a decisions log (what and why), a QA log, and a performance table.

Phase 1: Audit
Read the code before forming opinions about it, and don't speculate about code you haven't opened. In docs/AUDIT.md, cover the engine and versions; scene organization and lifecycle; progression and game state; how Level 1, Level 2, and the current mini-game work; input; UI; asset loading; animation and tweening; camera and player control; and transitions. Classify each system as keep, refactor, or replace, with reasons, and trace the existing visual and gameplay problems to their root causes. Preserve what's good and replace only what blocks the target experience. Don't change engines or frameworks without asking me.

Phase 2: Design
Write docs/DESIGN.md containing:
- Art direction (see <art_direction>): a one-sentence visual thesis, named palette colors with their roles, typography, shape language, material and lighting principles, and how the UI derives from the world.
- The motion system (see <motion_system>).
- Three or four concepts per mini-game slot, scored against the criteria in <mini_games>, with a recommendation for each.
- Beat sheets for the pre-travel cinematic and planet travel (see <cinematics>).
- The Level 2 plan (see <level_2>).
- Performance budgets and quality presets in this engine's terms (see <performance>).
- A milestone plan of vertical slices, each ending playable and committed.

Before you call the design finished, review it against this brief. For each major choice, ask whether it's what you'd produce for any other game in this genre; if so, replace it with something specific to this one and note what changed. If the design checkpoint is ON, stop here and summarize the key decisions for me. If it's OFF, continue.

Phase 3: Build in vertical slices
Take each milestone all the way to finished (mechanics, art, motion, UI, VFX, and a performance check) before starting the next. Roughing everything in and polishing at the end is how prototypes stay prototypes. A sensible order: shared foundations (motion module, UI kit, render and quality settings, debug harness, scene lifecycle) → Mini-game 1 and the rest of Level 1 → pre-travel cinematic and planet travel → Mini-game 2 → Mini-game 3 → Level 2 → opening, menus, and ending. Those last three come at the end on purpose: they're the first and last impression, so they should get the most mature version of the design language. Commit at each milestone with a descriptive message and update PROGRESS.md.

Phase 4: Whole-game pass
Play through everything, not only what you changed, using <verification>, and fix root causes. Then do the art pass: rank every scene and state by visual quality, bring up the weakest, and repeat until nothing stands out as weaker than the rest, or until the remaining gaps need human-made assets (list those in the report).

Phase 5: Report
See <definition_of_done>.
</workflow>

<art_direction>
Commit to a specific point of view. Generic results come from defaults, so treat your first instinct on any visual decision as a draft and ask what a specific, opinionated designer would do instead. If the project has an established look worth keeping, evolve it; replace it only if the look itself is the problem.

Choose a direction that code can execute at a very high level. You'll build most of the art procedurally and in shaders, and a confident stylized look executed with discipline reads as more expensive than realism executed halfway. Get silhouette, value structure, and color right first; surface detail comes second.

Graphics and environments. Build composed spaces, not primitives on a flat-lit floor: a clear foreground, midground, and background; scale references so big things feel big; a focal point in every scene. Spend boldness in one place per scene, letting one element be the memorable thing while everything around it stays quieter. Give procedural geometry some craft: bevels and chamfers that catch light, subtle variation in vertex color and roughness, instanced detail, and forms that follow the world's shape language. Make places rather than rooms. Architecture and props should imply who built them and what happened there, and looking around should turn up small discoveries. Ambient motion (wind, drifting dust, machinery, slow shifts in light) stays slow and low in amplitude so it adds life without competing with gameplay.

Materials. They should tell the eye what things are made of and what matters. Separate metal, glass, rock, terrain, energy, technology, and UI surfaces through roughness, metalness, fresnel, and response to light, not just color. An environment map for reflections is cheap and does more for metal and glass than almost anything else. Keep emissive materials rare enough to mean something: energy and interactables glow, set dressing doesn't.

Lighting. Light each scene like a cinematographer would. Use motivated key, fill, and rim light where the shot needs them, and let light lead the player's eye to what matters for gameplay. Build atmospheric depth with fog or haze, and use tone mapping and a color grade to give each area its own mood inside the shared palette. Bake what doesn't move. One flat light over everything is the fastest way to look unfinished.

Camera. Every move has a reason: to establish, reveal, follow, emphasize, or transition. Gameplay cameras put readability first, with good framing and look-ahead, spring-based smoothing instead of rigid parenting, and collision handling so the camera never ends up inside geometry. Keep critical gameplay and UI inside a 16:9 safe area, and let the world, not the UI, extend on wider screens.

VFX. Every effect answers the question "what does this tell the player?" An engine trail says speed and direction, sparks say contact, a shockwave says impact. If an effect doesn't communicate something or reinforce a moment, cut it. One well-designed effect beats three stacked ones.

Graphic design and UI. The game needs one recognizable graphic language across menus, HUD, level titles, loading, notifications, victory, and failure. Derive it from the world, so the UI looks like it was made by the people who built the ship, echoing the world's shapes, materials, and color logic. Use diegetic or spatial UI where it adds immersion without hurting readability. HUD elements should show up when they're relevant and step back when they're not. Pick one or two typefaces for a reason, set a type scale, and use tabular figures for anything that counts. Design every interactive state: default, hover, focus, pressed, disabled, loading, success, and error. Loading should mostly disappear into transitions; where a wait can't be avoided, design it like any other screen and show real progress. Don't rely on color alone for feedback, and keep text legible at 1280×720.

Defaults to avoid. These are the choices that make games look AI-generated, precisely because they're the first ones to come to mind. Use one only if DESIGN.md gives a specific reason:
- Color and light: neon cyan and magenta on black; near-black with a single acid-green or vermilion accent; bloom thresholds so low that everything glows; lens flares and chromatic aberration used as seasoning; gray default materials under a single directional light.
- UI: blurred glass panels everywhere; identical rounded cards with identical shadows; genre-default "sci-fi" display fonts; tracked-out all-caps micro-labels on everything; monospace data labels as decoration; "01 / 02 / 03" numbering on things that aren't sequences; pill-shaped buttons; arrows tacked onto button text; one accent-colored or italic word in every title.
- World and VFX: uniform white-dot starfields; random floating particles; decorative holograms; bare primitives presented as finished props; big rooms with a few objects scattered around.
- Motion: the same fade-and-slide-up on every element; one 300 ms ease-in-out for everything; idle pulsing; camera shake with no impact behind it.

If your first build falls back on a default that isn't listed here, add it to the list in DESIGN.md and revise.
</art_direction>

<motion_system>
Motion is this game's signature, the way typography is a magazine's. It belongs everywhere it helps: UI, gameplay feedback, environments, camera, transitions, victories, and failures, not only the cutscenes. Motion serves play and never makes the player wait for it. It also has hierarchy. At any moment there's one primary motion for the eye to follow; everything else supports it or holds still. Some moments are fast and dramatic, and others breathe. Stillness is part of the composition. The goal is the best-designed motion, not the most motion.

Build it as a system. A single shared motion module, used by every scene and UI element, holds:
- Duration tokens, as starting points to tune by feel: micro 80–120 ms (hover, press), small 180–240 ms (elements entering), medium 300–450 ms (panels), large 600–900 ms (screen transitions), plus authored timings for cinematics.
- Named easing curves: decelerating for entrances, accelerating for exits (which run roughly 20–30% faster than entrances), springs for anything physical or interactive, and linear only for mechanical or continuous motion. No magic numbers at call sites.
- Choreography helpers for staggering (about 30–60 ms between siblings, capped so long lists don't drag), sequencing, and overlap.

Three rules apply to all motion. It's frame-rate independent, so it looks the same at 30 fps and at 144 Hz. Every animation is interruptible and reversible, so rapid input never queues stale animations or strands an element halfway. And a reduced-motion setting shortens transitions, removes camera shake, and softens camera moves. In every mode, nothing flashes full-screen more than three times a second.

Use the classical principles where they fit: anticipation before big actions, follow-through and overlapping action after them, arcs, overshoot and settle, squash and stretch on interactive objects. Fades, slides, and scale-ups are fine as ingredients, but they aren't the recipe. A designed transition usually layers two or three properties with offset timing and carries the eye with a shape, a mask, or a shared element. Reach for the techniques that make motion feel authored: match cuts from UI into the 3D world, shared elements that persist across screens, camera moves that are themselves the transition, masked reveals, kinetic typography for titles and key moments, and numbers that count up with easing.

Big game events get coordinated choreography across UI, camera, VFX, and sound, timed from one place: one conductor, not five soloists. If the project has audio, land sound on the motion beats. If it doesn't, expose a simple event hook so sound can be layered in later, and don't let missing audio hold up the visual work.
</motion_system>

<mini_games>
Mini-game 1 is being rebuilt, and Mini-games 2 and 3 are new. Each should feel like a small, finished game with its own identity, not a tech demo.

Genuinely 3D means 3D in the mechanics, not only in the rendering. The test: if you could rebuild it as a 2D game on a single plane without changing how it plays, it isn't 3D yet. Depth, height, or orientation should be part of the player's decisions, and the player needs cues to judge space: contact shadows, atmospheric perspective, parallax, scale references, lighting. Objects have real colliders and physical relationships, and the camera is a proper gameplay camera.

The three games should differ in core verb (steering, aiming, timing, arranging, balancing, and so on), in camera paradigm, and in pacing (tense and continuous versus deliberate and considered). Each gets its own environment, motion language, and feedback style while staying inside the game's overall design language and story. Skip the ideas that come to everyone first: 2D clickers, static puzzles, button-mashing, memory matching, and menus dressed up as games.

For inspiration, if you have web access, spend a bounded amount of time on indie and experimental games, arcade design, game jams, creative coding, interactive installations, and physics toys. Take away principles (a mechanic, a feedback idea, a presentation trick), not games to clone. Without web access, draw on what you know.

Score each concept in DESIGN.md on clarity (understood within ten seconds, with no wall of text), depth (still offering interesting decisions after a minute), how much it genuinely needs 3D, fit with the world and story, distinctness from the other two, visual memorability, and performance cost.

Every mini-game needs:
- an in-world introduction that teaches through play rather than text
- a clear objective and responsive controls, with visible feedback within about 100 ms of input
- feedback for every meaningful action, and a difficulty ramp across the session
- a win state with a satisfying, choreographed payoff
- a failure state that's quick, readable, and shows what went wrong
- instant restart and clean re-entry

By default, a first-time player should clear each one in roughly two to four minutes, with a failure or two along the way. Give actions weight with hit-stop, easing, squash, camera kick, and particles, all used with restraint. Screen shake is reserved for real impacts, decays fast, and respects reduced motion.
</mini_games>

<cinematics>
Two authored sequences sit between Mini-game 1 and Mini-game 2. Write a beat sheet for each before building it, giving each beat's duration, camera, what it communicates, its motion and VFX, and its audio cue.

The pre-travel cinematic is a story beat, not a loading screen. Design it from what's happening in the story (systems coming online, the decision to leave, whatever fits) and tell it with composition, camera choreography, environmental animation, UI-to-3D integration, and VFX, with sound-reactive elements where they add something. Consider giving the player one meaningful input inside it, such as the action that commits to launch, so it feels like part of the game rather than a video. It hands off to planet travel with no visible seam.

Planet travel needs an arc: departure (establish scale), acceleration (sell speed with parallax, streaks, field of view, and sound), transit (let it breathe), the reveal (the planet's silhouette, its terminator line, an atmospheric rim, a shift in light and color temperature), approach and entry (atmosphere, heat, a change in grade), and arrival (settling into an establishing shot and a kinetic title for the new area). "The ship moves up and the screen changes" is exactly what this should not be.

Both sequences can be skipped with a hold, so nobody skips by accident, and both do useful work underneath: preload the next scene and warm up its shaders during the sequence so gameplay starts without a hitch.
</cinematics>

<level_2>
Level 2 should feel like the game evolved, not like Level 1 with a new background. By default it has at least two mechanics Level 1 doesn't, each one introduced safely, developed, twisted, and finally tested in combination (the kishōtenketsu pattern); at least two distinct zones with their own lighting moods and visual themes; more interactive objects with clear affordances; environmental storytelling that rewards exploration; and a climax that pulls the new mechanics together. It ends on a designed ending and progression state: a choreographed summary, credits, and a clear path to replay.

Mini-games 2 and 3 come first. Add another mini-game inside Level 2 only once the first three are finished and at the quality bar.
</level_2>

<performance>
Look expensive, run cheap. You can't test on the reference machine, so hold the budget with counters and relative frame-time measurements, and tell me in the report what needs checking on real hardware.

Targets, to refine after the baseline: a steady 60 fps at High on a mid-range GPU, and at least 30 fps (ideally 60) on the reference machine at Low, at 1080p with render scaling. Set per-scene budgets in DESIGN.md for draw calls, visible triangles, shadow-casting lights and shadow-map sizes, post-processing passes, live particles, and texture memory, and log the actual numbers per scene and preset in PROGRESS.md.

Spend the budget where it shows. High impact for low cost: composition, color grading, fog, environment maps, baked lighting and ambient occlusion, fresnel rims, vertex-color variation, instancing. Low impact for high cost: many real-time shadowed lights, full-resolution SSAO and screen-space reflections, heavy transparent overdraw, real transmission on lots of objects, and dense meshes that end up small on screen.

Techniques to use where they fit: LOD and culling; instancing, batching, and merged static geometry; compressed textures and meshes; per-scene loading, with preloading during transitions; shader warm-up during transitions (renderer.compile in Three.js, shader-variant warm-up in Unity, or the engine's equivalent); object pooling; no per-frame allocations in hot paths; one combined post-processing pass instead of a stack; a capped device pixel ratio and dynamic resolution; and complete cleanup of geometry, materials, textures, listeners, timers, and tweens when a scene exits.

Offer Low, Medium, High, and Auto presets. Auto uses a quick benchmark or GPU heuristic, plus dynamic resolution to hold the target. Presets can scale shadows, particles, post-processing, reflection quality, lighting complexity, environment density, and draw distance (hidden with fog). They never change the palette, composition, lighting direction, key silhouettes, or motion design. Low should look deliberately simpler, never broken.
</performance>

<engineering>
One explicit state machine (or the engine's equivalent) owns progression. Every scene has enter and exit hooks that clean up completely, and transitions are guarded so they can't fire twice. Remove dead code, duplicated logic, stray magic numbers (move them into config or motion tokens), and temporary hacks. Handle errors, especially around asset loading. Keep solutions as simple as the job allows: no abstraction layers, frameworks, or files the game doesn't need, and no rewriting working systems for the sake of it.

Fix root causes instead of hiding symptoms. If something clips, fix the collider, the camera, or the near plane; don't cover it with an effect. When something is technically hard, solve it properly rather than substituting something easier (2D for 3D, a static screen for gameplay, placeholder art for finished art). If a proper solution truly isn't practical, say so and log the trade-off.
</engineering>

<verification>
Compiling isn't the same as working, and working isn't the same as looking good. Here's how you'll see both.

Build a debug harness early, available only in a debug mode: jump to any scene or beat, auto-win and auto-fail for each mini-game, time-scale and frame-step controls, fixed random seeds, and an overlay for frame time, draw calls, triangles, and memory. If the game runs in a browser, drive it with Playwright; otherwise use the engine's own tooling.

At every milestone, run an automated pass through the whole journey, start to finish, including wins, losses, restarts, and re-entry into every scene, with no errors.

For visuals, capture screenshots at key beats at 1920×1080, 1280×720, 2560×1080, and one 16:10 or 4:3 size, on Low and on High, save them under docs/screenshots/, and look at them. Zoom into regions (PIL or similar) to check edges, intersections, and text. You're looking for ship, wall, and camera clipping; intersecting objects; z-fighting; wrong depth or sorting; floating objects; popping; UI overlap and clipped text; wrong scale; lighting problems; and weak composition or an unclear focal point. For motion, step through key transitions frame by frame and judge spacing and timing, not only the start and end states, at simulated 30 fps and 144 Hz.

For input and edge cases, try rapid and repeated input during transitions, input during loading, focus loss, resizing mid-transition, and pause and resume. For performance, compare counters against the budget per scene and preset, and profile spikes at scene changes, first-time effects, and garbage collection.

Record issues and fixes in the QA log. If something can't be verified in your environment, say so and tell me how to check it.
</verification>

<working_style>
Make routine decisions yourself and keep moving. If a requirement here looks mistaken or you see a better approach, say so in a sentence and carry on with the task as specified.

Unless milestone check-ins are ON, keep working through the milestones after the design checkpoint without stopping to report. In practice, that means not ending a turn with a summary that announces the next step instead of taking it, not offering to continue and then waiting for an answer, not listing decisions for me that don't actually block you, and not treating a finished milestone or a long session as a reason to pause. Put brief status notes in the same message as your next action. The stops I do want are the design checkpoint, a real blocker that needs me, and anything hard to reverse: switching engines, deleting major systems, adding heavy dependencies, licensing questions, or force-pushing and rewriting git history.

Your context may be compacted as it fills, so don't wind down early because of context limits. Commit and update PROGRESS.md at every milestone and before your context gets long. After compaction or in a fresh session, read docs/BRIEF.md, docs/PROGRESS.md, docs/DESIGN.md, and the recent git log before doing anything else.

Use subagents only for large, independent work that parallelizes well, such as auditing separate subsystems. Don't use them for small tasks or to double-check your own work.

The decisions that set the quality ceiling are the art direction, the mini-game designs, and the cinematic beat sheets, so give those the most deliberation.

If you have to cut scope, cut features before quality, and log what you cut and why. In status reports, "done" means built, checked, and at the bar; anything less is "partially done," with a note on what's missing.
</working_style>

<definition_of_done>
Finish with a report in chat, also saved as docs/REPORT.md, covering what changed in each area and why; how to run the game, the controls, and the debug features; performance per scene and preset; where the final screenshots are; known issues; and what would benefit from human-made assets or testing on real hardware.

Close the report by answering each question below with yes, partially, or no, plus one line of evidence. If an answer isn't yes and the gap is fixable within this task, fix it before reporting.

1. Does Mini-game 1 pass the "could this be 2D?" test?
2. Do all three mini-games play like finished games, with start, win, fail, and restart states?
3. Do they differ in verb, camera, and pacing?
4. Does Level 2 add new mechanics, new zones, and a climax, so the game feels like it evolved?
5. Is visual quality consistent, with no scene noticeably weaker than the rest?
6. Does motion follow the motion system, with clear hierarchy and nothing animated just for the sake of it?
7. Do the transitions and cinematics feel authored, and do they hide loading?
8. Does every UI state feel designed and part of one visual language?
9. Does each environment have a focal point, depth, and something to discover?
10. Do materials and lighting read as intentional and believable within the art direction?
11. Does every VFX element communicate something?
12. Are there zero known clipping, z-fighting, overlap, or popping issues?
13. Does every element look finished, with nothing that reads as a placeholder?
14. Is the Low preset within budget, and does it still look like the same game?
15. Does the game avoid every default listed in <art_direction>, or justify each one it uses in DESIGN.md?
16. Does the whole thing feel like one cohesive experience?
17. Would a talented game developer and motion designer be proud to put this in their portfolio?
</definition_of_done>
