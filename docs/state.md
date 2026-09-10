# Active plan — opening rework: remove battle puzzle, polish galaxy reveal (2026-09-09)

## Context
User request: remove the initial "Threat Response" puzzle cleanly, and make the galaxy-reveal
cutscene look sharp/cinematic without regressing performance. (Prompt was written in Godot terms;
this project is three.js/Vite — mapped to the equivalents here.)

Baseline captures: scratchpad `baseline/beat*.png` (dev server, DPR 1, tier high).
The uncommitted WIP (freighter GLB + texture planets) is already in and builds green.

## Diagnosed defects (not assumptions)
1. `EffectComposer` captures pixel ratio at construction (node_modules EffectComposer.js:61);
   `PostProcessing` is built before `Engine.applyTier()` raises renderer pixel ratio, and nothing
   ever calls `composer.setPixelRatio` → whole game renders at 1× and is upscaled on any DPR>1
   display. Systemic blur on real hardware.
2. Composer render target has no `samples` → zero anti-aliasing (canvas MSAA is bypassed by the
   composer path). Aliased hull edges visible in beat1 capture.
3. `public/textures/space/starmap.jpg` is 1024×512 / 38 KB, heavily JPEG-compressed, drawn at
   backgroundIntensity 1.8 → blotchy grey mush across every wide shot.
4. Beat1 camera sits aft of the ship: the four engine bells (uniform emissive 2.4) fill the frame
   as flat cream hexagons; hull itself underlit (env intensity 0.12, weak point key).
5. Asteroid belt reads as black specks against the corona (backlit, dark albedo).

## Plan
### Phase A — remove BattlePuzzle (clean)
- GameFlow: `beginFirstGame()` → caption, set `tutorial_battle_complete`, straight to
  `transitionToGalaxyReveal()`. Drop `startBattle()`, briefing import, "Contact" caption,
  "Answer the contact." objective. `?skipTutorial` → flag + reveal directly.
  Restore crosshair in `finishReveal()` (was done in the puzzle's onWin).
- Delete `src/ship/BattlePuzzle.ts`, `src/tutorial/BattleBriefing.ts`; remove their CSS blocks
  in style.css; keep flag name `tutorial_battle_complete` (saves/migration depend on it).
- Tools: delete `debug-battle.mjs`; update `play-through-opening.mjs` and
  `test-tutorial-flow.mjs` to the new flow (console boot → reveal, no battle).

### Phase B — visual polish
- Engine/PostProcessing: propagate pixel ratio to composer on tier change; MSAA samples on the
  composer RT (4 on high/medium guess, 0 on low).
- New `tools/prep-starfield.mjs` → generated 4096×2048 `public/textures/space/starfield.jpg`
  (sharp star dust + galactic band, no JPEG mush); replaces starmap.jpg in GalaxyRevealScene.
- Ship: stronger sun-side directional key + env intensity up; engine bell emissive down;
  camera keyframe 1 moved to a nose-side hero angle. Iterate via capture tool.
- Asteroid belt albedo up so rocks rim-light instead of silhouetting.
- Planet texture anisotropy 4 → 8.

### Phase C — verify
- Fresh captures DPR1/DPR2 (sharpness proof), frame-trace p95 dev + built preview,
  full opening playthrough (updated harness), `npm run build` green.

## Status — completed 2026-09-09
- [x] Phase A — puzzle removed; flow now tutorial → console boot → caption → galaxy reveal.
      Two extra defects found and fixed along the way: `InteractionSystem.clear()` left the
      interaction prompt DOM stuck over the next scene, and the crosshair restore raced the
      scene swap.
- [x] Phase B — composer pixel-ratio propagation + 4x MSAA (samples 0 on low tier);
      generated 4096x2048 sky (tools/prep-starfield.mjs) replacing the 1024x512 starmap;
      directional sun key + env 0.3; mat13 hex panels tamed (the real "cream discs" culprit,
      not mat1); asteroid albedo up; beat-1 camera moved to the sunlit nose quarter.
- [x] Phase C — verified: `npm run build` green; tools/test-tutorial-flow.mjs 24/24 (real
      inputs, fresh launch → tutorial → reveal → interior, no page errors); save-check and
      qa-pass clean on the production build; frame-trace galaxy-reveal p50 16.6ms / p95 22.2ms
      on the 4x-throttled bad-laptop profile and p50 16.5 / p95 25.7 unthrottled with MSAA
      (all under SwiftShader software rendering); DPR-2 production capture confirms a true
      2560x1440 composer buffer. All uncommitted — this session's changes sit on top of the
      prior session's planet-texture WIP.
