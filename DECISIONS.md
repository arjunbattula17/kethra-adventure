# Decisions

Every significant change is sorted into one bucket and recorded here with its reasoning.
- **KEEP:** leave it alone or polish lightly.
- **UPGRADE:** right idea, execution needs work; improve in place.
- **ADD:** missing and needed.
- **CUT/REPLACE:** needs the team's explicit approval before any action, except for
  hard-constraint violations, which are fixed immediately and reported.

**Status:** *Done*, *Proposed* (waiting on the team), *Approved*, or *Rejected*. Items marked
**Team decision** are taste calls. Each one lists options with a recommendation, and work
continues on everything that doesn't depend on the answer.

---

### D-1 · KEEP · The premise, world and characters — *Done*
The stranded survey ship, the Kindling, the Aiveth, Corvenna and Fen, the four worlds. This is
the team's work and the game's identity. LORE.md was written as an expansion of it: no name,
line or fact was changed. Three contradictions in existing text are listed in LORE.md's open
questions for the team to settle (D-11).

### D-2 · UPGRADE · A signature verb carried through levels 1–3 — *Proposed, team decision*
The game's recurring idea is already *reading light*: the scan, the course plot's Doppler speed,
the spectroscopy clue, the Cistern Heart's colours, the white sky. There is no single verb the
player carries between levels yet. **Option A (recommended): "tune".** The Wren's Deep Scanner
reads and emits light frequencies. Level 1 *introduces* it (calibrate the scan to find Kethra),
level 2 *develops* it (call the Heart's three colours in order), and level 3 *twists* it (at the
Anchorage, counter-tune a white sky so a ship doesn't lose power). Stats change what the scanner
can do (D-3). **Option B:** keep separate puzzle types per level, which is simpler but less
memorable to judges. A is recommended because it turns the theme into one verb a judge can name
after playing.

### D-3 · UPGRADE · Stats are how puzzles get solved, on every level — *Proposed*
The TSA challenge requires the RPG system to be *how* puzzles are solved. Kethra already does
this (persuasion, archaeology and insight gate dialogue; perception reveals a hint). The ship
does not, engineering is never checked, and traversal does nothing. Proposal: every level's
critical-path puzzle has at least two solutions, one of them stat-gated (for example,
engineering 2 re-routes power around a dead panel; traversal 2 reaches a vantage point that
reveals the answer). Every stat opens something by the end of level 3. This follows the pattern
the team already built on Kethra, extended rather than replaced.

### D-4 · ADD · A third level: Vessek Anchorage — *Built 2026-09-25 (option A), team to approve*
The rules require three levels, and judges play through level 3. **Option A (recommended):
Vessek Anchorage.** A ring of stranded ships; a social level where persuasion and insight shine,
Harbormaster Varro bargains for the Wren's core, and the set piece is a white sky hitting the
ring mid-level (lights die deck by deck; the player restores power in the right order). It
reuses the ship-interior kit the game already has, which makes it the cheapest level to build
well. **Option B:** Orrun's Reach (a desert with buried machines; a traversal level). It needs a
new outdoor kit and weather, so it's more expensive. Option A is recommended for cost and because
it delivers the story's mid-game reversal (LORE.md).

### D-5 · ADD · Title screen with a start gate, controls screen, credits — *Done 2026-09-25*
Required by the rules (a controls screen from the menu), by licensing (CC BY attribution for the
freighter model and the planet maps), and by browsers (audio can't play before the first
click or key). A title screen with *Continue / New Game / Controls / Credits / Settings*, in the
existing panel style.

### D-6 · ADD · Level select unlocked by progress — *Proposed (pause menu's "Restart this level" covers part of it)*
Judges reload. Saves already persist (localStorage, now safe when storage is blocked). A level
select on the title screen lets a judge jump back to any level they've reached.

### D-7 · CUT/REPLACE · The course plot's typed answers — *Proposed, needs team approval*
The course plot is good maths in the wrong shape: three typed answers on a keypad read as a quiz,
which the rules exclude from counting as educational value. **Proposal:** keep the same three
calculations, but make them actions on the nav chart. Drag the Wren's course to measure the
distance, set the cruise speed and watch the day counter, then pick the arrival window on the
chart grid. The chart shows the result instead of marking an answer right or wrong. Nothing is
deleted until the new version is playable end to end on a branch and the team has tried it.

### D-8 · UPGRADE · Repairs are "collect N of X" — *Proposed*
Ship repair is currently collect-the-resource, then press repair. The rules single out
"collect ten of X to open the door" with no twist. **Proposal:** each repair becomes a small
engineering puzzle (route power through a damaged bus without overloading it), with the resource
as the entry ticket and the engineering stat unlocking shortcuts (D-3).

### D-9 · UPGRADE · Kethra's ground texture is a style outlier — *Proposed, team decision*
The grove's ground and ruins use a photo-scanned rock material (Poly Haven `lichen_rock`) under
hand-painted stylized plants. **Option A (recommended):** replace it with a stylized ground
painted to match the Quaternius plants, originals archived. **Option B:** keep the photo scan
and push the plants toward it. A is recommended: the plants are 90% of what's on screen.

### D-10 · CUT · Unused files in the build — *Proposed, needs team approval*
`public/models/quaternius-nature/glTF/*.png` (20 files, 38 MB) are copies of textures the loader
never requests, and `public/textures/ship_*` plus `bark_willow` (32 MB) are loaded by nothing.
Together that is ~70 MB of a 108 MB build. They are third-party kit files, not student-made, and
would be archived rather than deleted.

### D-11 · Team decision · Lore contradictions
Listed in LORE.md, "Conflicts in existing text". The main one: are there crew asleep aboard the
Wren (the chosen reading, which keeps "the only one aboard awake" and the log's "we") or is the
player alone? Recommendation: keep the sleepers. They give the ending a payoff.

### D-12 · Hard constraint · Names in the submission — *Partly done*
*Fixed today:* a machine user path in `tools/interior-round.workflow.mjs`. *Open, team action:*
the repository is under a personal GitHub account, and commit history carries the author name.
Recommendation: deploy through Render or Cloudflare under a project name with the team number,
and ask the advisor whether the repo itself will be shared (if so, a fresh repository without
history is the clean fix; rewriting history is destructive and needs the team's approval).

### D-13 · Hard constraint · Blocked browser storage crashed the game at boot — *Done*
Reading `localStorage` throws where a browser blocks storage. `SaveSystem.hasSave()` and the
settings panel did that unguarded at boot, leaving a black screen. Guarded; the game now plays
without saving there. Covered by `npm run smoke`.

### D-14 · UPGRADE · Texture pass, intro exposition, lore bible — *Done*
See TEXTURE_AUDIT.md, INTRO_DESIGN.md and LORE.md. Texture memory is down 38%, the intro
shows the disaster and ends on the goal, and lore now appears in five in-game places.

### D-15 · ADD · Scaffolding — *Done*
Smoke test (`npm run smoke`), string table (`src/content/strings.ts`), tuning file
(`src/content/tuning.ts`), and the docs in this folder. Build and deploy were already scripted
(`npm run build`, `render.yaml`); DEPLOY.md adds the checklist.

### D-16 · Hard constraint (originality) · Template favicon — *Done*
`public/favicon.svg` was the Vite starter template's logo, not the team's art. Replaced with an
original mark in the game's palette: an amber ring with a beacon dot. Easy to redraw; it's the
team's to change.

### D-17 · Team decision · The game's title
The browser tab still reads "tsaproject", the npm package name, and the repository is
"kethra-adventure". Judges see the tab title first. The team should pick a title; the options
depend on how the team pitches the game. The obvious candidates come from the canon: something
around the white sky, the Wren, or "Cold Start".

### D-18 · UPGRADE · Navigation map redesign, and travel restored — *Done 2026-09-25*
Clicking a planet stopped starting the trip on Aug 22 (commit 8c0f886) and nothing replaced it, so
Kethra was unreachable in normal play. The redesigned map puts travel on a Set Course button in a
dossier panel, draws Kethra's terraces to scale, and adds a survey checklist. It follows
ART_BIBLE.md, so it's an upgrade in place, not a new style.

### D-19 · ADD · The scanner repair resolves the next world — *Done, reversible*
Repairing the Deep Scanner after Kethra resolves the ring of ships at Vessek on the chart (no
landing charts yet), so level 2 no longer ends in a dead end. It anticipates D-4's recommended
third level; if the team picks Orrun instead, it's one planet id in GameFlow and one string.

### D-20 · UPGRADE · Art direction written down and applied to every screen — *Done 2026-09-25*
docs/STYLE_AUDIT.md lists what read as unfinished; docs/STYLE_BIBLE.md is the contract that
fixed it: one visual idea ("every living thing announces itself with its own light"), seven named
colours with one job each, a second typeface (Atkinson Hyperlegible) for reading, sentence case,
one component set, the scan-line transition. It extends ART_BIBLE.md rather than replacing it.

### D-21 · UPGRADE · Designed characters and set pieces replace primitive stand-ins — *Done, reversible*
The Aiveth were capsules and the Cistern Heart was an octahedron: the worst thing on screen
(STYLE_AUDIT.md). Now low-poly figures built in code (`src/characters/Figure.ts`) whose glow shows
mood, a stained-glass Wickmoth, the Heart as a Kindling machine, and Kethra's foliage tinted into
the art bible's palette. The team's models and layout are unchanged.

### D-22 · UPGRADE · Point-light budget for a faster first load — *Done, reversible (one constant)*
The Wren's 41 point lights were compiled into every shader. Keeping the 16 strongest cut a
fresh-browser boot roughly in half with the room within ~2/255 per pixel of before (docs/PERF_LOG.md).
`POINT_LIGHT_BUDGET` in `src/ship/ShipInteriorScene.ts` restores all of them if the team prefers.

### D-23 · ADD · Pause menu, fuller settings, keyboard-only play — *Done*
Esc pauses (resume, settings, controls, restart level, quit). Settings add master/music/effects
volume, reduced motion, text size and mouse sensitivity. The arrow keys now turn (A/D still step
sideways) so the whole game plays without a mouse; every key comes from `src/content/controls.ts`.

### D-24 · ADD · The ending of part one — *Done, wording is the team's*
Repairing comms with the Anchorage's alloy offers the transmission of the ledger; the ending shows
the Wren's light leaving for home, names Isilthe as next, and rolls credits (team ID and every
licensed asset only).

### D-25 · UPGRADE · Performance pass measured on a real Intel UHD laptop — *Done 2026-09-27, reversible*
Measured on an i5-1035G1 laptop with Intel UHD graphics, the class of machine the game has to run
on (docs/PERF_REPORT.md, "2026-09-27"). Most changes leave the picture identical (image diff at the
noise floor); two change it slightly and are the team's to reverse:
- **Balanced uses FXAA instead of 4x MSAA.** Multisampling was 36% of a Balanced frame on this GPU.
  Edges and the smallest screen text are a touch softer (mean 1.6/255 per pixel). Quality keeps MSAA.
  Revert: `Engine.samplesFor` and the `fxaaPass` line in `PostProcessing.setQuality`.
- **Kethra paints its shadow map once** (as Vessek and the Wren already did). The two Aiveth's
  shadows no longer follow their breathing and head turns, which the map could barely resolve.
  Revert: remove `staticShadows` from `KethraScene`.
Automatic behaviour that changed, all under Settings → Quality → Auto only: Intel UHD/HD and ARM
Chromebook graphics start on Performance; the start-up benchmark re-measures after stepping down and
can lower the render resolution before the first frame; and on Performance a scene that averages
under ~45 fps is held at a steady 30 fps (judged per scene). Choosing a tier by hand turns all of it
off, as before.

### D-26 · UPGRADE · The arrow keys look, W/A/S/D move, and Space jumps — *Done 2026-10-04*
Asked for by the team. The mouse looks; the arrow keys are its keyboard stand-in (← → turn, ↑ ↓
look up and down) and no longer move the player, so ↑ and ↓ stop duplicating W and S. A and D
already stepped sideways. Space never left the ground: the floor snap that keeps the player on
stairs caught a jump on its second frame and set it back down, so the jump was one 10 cm frame. A
jump now rises the 1 m the tuning file always assumed and lands with the existing dip and thud.
Overhead colliders (Vessek's ducts, Kethra's root tunnels) stop the head, and anything that blocks
walking still blocks mid-jump, so a jump can't carry the player over a waist-high object and set
them down inside it. Floors up to 1.45 m above the take-off become reachable by jumping, which
nothing on the critical path depends on. Covered by `tools/test-controls.mjs`.

### D-27 · UPGRADE · A cinematic title screen with a live 3D backdrop — *Done 2026-10-16, reversible*
The title is now a heavy capital ship over Kethra's day side at sunrise, rendered live
behind the menu, with a new wordmark and glowing hexagonal buttons; the menu is up at once and the
backdrop arrives complete, in one dissolve (src/galaxy/title/TITLE_DESIGN.md). Choices the team can
reverse:
- **The title has its own palette.** Deep-space blues with cyan marking what can be picked, instead
  of the game's amber and sea-green; Controls and Settings take it while the title is up. Revert: the
  token block at the top of the Title screen section of `src/style.css` and the
  `body.title-open .panel-overlay` rule.
- **Continue is shown disabled, with the reason, when there is no usable save** (it used to be
  hidden), so the menu always has the same four rows. Revert: skip the `add('title.continue', …)`
  call in `TitleScreen.show` when `opts.hasSave` is false.
- **A ship, the tagline and corner labels, after a new reference** (2026-10-16, second pass, at the
  user's request; an earlier pass that day had taken all three out). The ship is a new model built
  for the title to match the reference (`titleShip.ts`), not the Wren hull the intro flies, so the
  two ships differ. Rebuilt 2026-10-19 after the team's reference images: heavier, dark gunmetal
  with cyan light, a door and small boosters at the stern.
  The kicker reads "A deep-space survey" and the tagline "Your ship went dark past
  the edge of the charts. Wake it up." (`title.kicker`, `title.tagline`). The corner labels are
  decoration in the game's own terms ("Beyond the Kessic Drift / Uncharted system" where the
  reference had a made-up station and sector; `title.hud*`). Revert: drop `buildTitleShip` from
  `TitleScene.init`; empty `.ts-tagline`; remove the `.ts-hud` block from `TitleScreen.show`.
- **The world keeps its own time.** Nothing in the backdrop follows the pointer or the menu (the
  camera used to lean toward the pointer and the sunrise to swell on each selection), nothing on the
  menu loops, and there is no staged opening: the menu fades in as one piece and the backdrop arrives
  whole. Reduced motion holds the camera still and stops the meteors.
The backdrop can be switched off entirely by not calling `TitleScreen.startBackdrop` in `boot.ts`:
the menu then runs over its CSS starfield, as it does on any machine where the 3D fails to build.

### D-28 · UPGRADE · Nothing to walk through, nowhere to get stuck — *Done 2026-10-04*
`tools/wall-sweep.mjs` drives the real player into every wall it can reach in the Wren, on Kethra
and on Vessek (walking, sprinting and jumping, at 60 fps and at the engine's 10 fps floor) and
checks the body and the camera against every visible triangle. What it found, now fixed:
- **Vessek's drop vents trapped the player** (live build). Crawling out of either one left them
  wedged against the wall under the vent, or inside the grow table under Dace's vent, and no key
  moved them; the tanker is reached that way during the crisis. Each drop vent has an unseen lip,
  so the fall starts clear of the wall, and the grow tables' tops are floors to land on.
- **Nothing can hold the player inside a collider any more.** Whatever leaves them overlapping one
  (a door, a fall), a move that takes them out of it is always allowed. The junction's keypad door
  also waits while someone stands in it instead of shutting on them.
- **The camera went through the root-tunnel arches** in the Heart's chamber: they hung at head
  height, and walking a tunnel passed through each one. They're lifted into the roof and show as
  braces where they meet the walls; the tunnels' size and the Wickmoth's sight lines are unchanged.
- **The Wren's wall fixtures above 2.1 m had no collision**, which a jump reached; colliders now
  cover everything up to the top of a jump.
- **Crouched, the eye sat above the top of the body**, so a crouched jump under a duct roof put
  the camera in the roof. The crouched view is 10 cm lower (1.0 m, still above the stealth mounds'
  0.82 m), and there's no jumping where there's no room to stand.
- **Vessek pieces with no collision:** Varro and Dace, the crate and barrel by the desk, the
  4 m pipe holder (only its middle 0.8 m was solid), the school stools and the junction's reset
  panel.
- **Two grime decals on the Wren's console** still sat where the old, smaller room had its desk,
  and hung in the air 1.2 m in front of it.
Covered by `tools/test-controls.mjs` (22 checks) and the sweep.
