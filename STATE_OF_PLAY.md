# State of Play — Session 0 (2026-09-24)

> Superseded on 2026-09-25 by docs/AUDIT.md, which scores the game after level 3, the ending and
> the art and performance passes. Kept as the "before" picture.

**Headline:** the game fits the TSA theme unusually well (a deep-space RPG where progress comes
from puzzles, dialogue and stats, with no combat anywhere), and it runs in a browser at 60 fps
on real hardware. The biggest problem is structural: **there are two levels, and the rules
require at least three**, with judges playing through level 3. Nothing in the game is a banned
pattern outright, but one puzzle (the course plot) is close enough to a quiz to cost points.
Neither blocker is an engine limitation; both are content work.

Engine: three.js (WebGL) + TypeScript, built with Vite into a static site. Deploys to Render
(`render.yaml`), and the Vite config also supports Cloudflare Pages and GitHub Pages.

---

## Biggest risks, in order

1. **Only two levels exist (hard constraint: at least three).** Level 1 is the Wren (the ship
   interior: tutorial, galaxy reveal, course plot, repairs). Level 2 is Kethra (dialogue,
   inscriptions, the Wickmoth, the Cistern Heart). Vessek, Orrun's Reach and Isilthe exist only as
   map entries that say "charts not compiled". A third complete level is the top priority.
2. **First load on a cold browser is very long.** On an RTX 4060 desktop, a fresh browser takes
   about 55–70 s to reach the tutorial, mostly shader compilation for the ship's ~93 shader
   programs. It is honest now (a loading screen with lore lines, then an uninterrupted intro),
   but on a Chromebook it could be several minutes, and a judge may give up. Cutting the program
   count is the fix (BACKLOG B-4).
3. **The course plot reads like a quiz.** Three typed arithmetic answers on a keypad. The
   rules say educational value must live in the mechanic, never in a quiz. The math is right for
   the game; the delivery needs to become something the player does to the chart. (DECISIONS D-7,
   needs the team's yes.)
4. **The RPG stats aren't yet how puzzles get solved everywhere.** On Kethra they are: persuasion,
   archaeology and insight gate dialogue, and perception reveals a puzzle hint. On the ship, no
   stat changes anything, **engineering is earned but never checked, and traversal does nothing
   at all**. The TSA challenge text makes this central. (DECISIONS D-3.)
5. **No title screen, no controls screen, no credits screen.** The rules require a controls screen
   reachable from the menu. Two assets are CC BY and need visible attribution in the game. Audio
   also needs a click/key gate before it can play. (BACKLOG B-2.)
6. **The live link may carry a student's name.** The repository lives under a personal GitHub
   account, so a GitHub Pages link would include that username, and every commit's author name is
   in the history. Hosting through Render/Cloudflare with a team-number project name avoids the
   link problem; the history is a team decision. (DECISIONS D-12.)
7. **Browser matrix unverified.** Verified: Chrome on Windows (desktop GPU). Not yet tested:
   Firefox, Safari, Edge, Chromebook, integrated graphics. (BACKLOG B-5.)

## Hard constraints

| Constraint | Status | Evidence |
|---|---|---|
| Browser only, no download or login | **Pass** (Chrome) / **untested** elsewhere | Static site, no accounts; `npm run smoke` boots every scene with zero console errors |
| Rated E | **Pass** | No weapons or combat anywhere. The Wickmoth guards a chamber and only blocks access. The fall fail state is "you lose your footing and scramble back". |
| Theme central to mechanic and story | **Strong, with gaps** | Deep space, puzzles, stats, dialogue, no combat. Gaps: risk 4 above |
| At least three levels, >3 min play, first three strongest | **Fail** | Two levels. Play time through both is well over three minutes. |
| In-game teaching + controls screen from menu | **Partial** | A five-step tutorial teaches every control in the first minute. No menu and no controls screen. |
| Originality and licensing logged | **Partial → fixed today** | Credits existed per folder; now consolidated in docs/ASSET_LICENSE_LOG.md. CC BY attribution still needs an in-game credits screen. |
| Stability, no external runtime calls | **Pass, one bug fixed today** | All assets are local. Fixed: a blocked `localStorage` threw at boot and left a black screen (private modes, managed Chromebooks); now covered by the smoke test. |
| No team or school names | **At risk** | Fixed today: a machine user path in `tools/interior-round.workflow.mjs`. Open: repo owner and commit author (risk 6). |

## Rubric rows

**Creativity & Artisanship (double weight).**
- *Strong:* a distinctive, specific world (the Kindling, the Aiveth's glow-speech, the white
  sky), an art direction with real intent (amber-on-steel interior, stylized grove), a
  cinematic opening that now shows the disaster instead of describing it.
- *Weak:* Kethra mixes a photo-scanned ground texture with hand-painted plants (TEXTURE_AUDIT.md),
  and two levels leave the world's best ideas (the Anchorage, the Choir) off screen.

**Technical Skill (double weight).**
- *Strong:* a custom three.js engine with adaptive quality tiers, a frame-time governor,
  scene pre-warming, procedural textures, GPU-driven intro effects, save migration, and ~50 test
  and audit tools. Texture memory was cut 38% this session with a measured density standard.
- *Weak:* cold-cache load time (risk 2); the browser matrix is unverified.

**Overall Appeal (double weight).**
- *Strong:* the opening sells the premise in 24 seconds. Kethra's characters have real voices.
- *Weak:* no title screen, so the game starts cold. Movement is functional but has no juice
  (coyote time, input buffering and landing feedback are absent; BACKLOG B-8). No music, only
  procedural tones.

**Storyline & Flow (single weight).**
- *Strong:* a coherent arc from the logs to the reveal to Kethra's mystery, now written down in
  LORE.md with a mid-game reversal planned.
- *Weak:* the arc stops at level 2; the reversal and ending don't exist yet.

**Bonus ("outstanding and unique").**
- *Strongest candidate:* the Ship's Library (real science, earned by using it) combined with
  puzzles that *are* the science (spectroscopy, Doppler, light).
- *Needs:* the course plot rebuilt so the education lives in the mechanic, and one signature
  verb carried through all three levels (DECISIONS D-2).

## What is already strong and should be protected
- The premise and its canon: the travel logs, the Kindling, Corvenna and Fen, the Rite of Three
  Breaths, the four worlds' taglines.
- The stat-gated dialogue on Kethra: exactly what the TSA challenge asks for.
- The Cistern Heart puzzle: read the world, spot that the ritual drifted, fix the order.
- The ship interior's art direction and the quality-tier system.
- The Ship's Library idea.
- The test and audit tooling (it is why regressions get caught).

## Verified this session
- Build clean; `npm run smoke` 5/5 (intro, ship, reveal, Kethra, storage blocked).
- `tools/test-tutorial-flow.mjs` 36/36; `tools/movement-check.mjs ship` passes.
- Intro: low tier with 4x CPU throttle p50 16.7 ms / p99 32.7 ms; exposition rules checked by
  `tools/intro-check.mjs`.
- Not verified: Firefox, Safari, Edge, Chromebook, integrated GPU.
