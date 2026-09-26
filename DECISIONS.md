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
