# TSA Video Game Design entry — team #____

A deep-space puzzle RPG that runs in the browser. A survey ship goes dark past the edge of the
charts; you wake it up, and to get home you have to read a dead civilization's light. No combat:
progress comes from puzzles, conversation and your character's skills.

## Play locally
```
npm install
npm run play        # builds and opens the production version
```
Development with live reload: `npm run dev`.

## Controls
| Action | Key |
|---|---|
| Look around | Mouse (click the game first; Esc releases the mouse) |
| Move | W A S D or arrow keys |
| Sprint / Jump / Crouch | Shift / Space / C or Ctrl |
| Interact | E |
| Character sheet | Tab |
| Settings | O |
| Close a panel | Esc |
| Skip a cinematic | Space, Enter, or click |

## Checks
```
npm run build       # type-check + production build
npx vite preview    # serve the build (keep running)
npm run smoke       # every scene boots with no console errors
```
More in `tools/`: `test-tutorial-flow.mjs` (full opening), `intro-check.mjs`,
`movement-check.mjs`, `collision-check.mjs`, `texture-audit.mjs`.

## Project map
| Path | What's there |
|---|---|
| `src/core/` | engine, game flow, save system, quality tiers |
| `src/content/` | **string table** (`strings.ts`) and **tuning file** (`tuning.ts`) |
| `src/galaxy/` | intro cinematic, galaxy reveal, map, planets |
| `src/ship/` | the Wren's interior (level 1) |
| `src/planets/kethra/` | Kethra (level 2) |
| `src/rpg/`, `src/dialogue/`, `src/journal/` | stats, dialogue trees, logs and evidence board |
| `public/` | models, textures, fonts (see ASSET_LICENSES.md) |
| `tools/` | tests, audits, capture scripts |
| `docs/` | earlier design notes and learnings |

## Documents
- STATE_OF_PLAY.md: honest assessment against the rubric
- DECISIONS.md: every significant change and its bucket
- DESIGN.md: the finished game
- BACKLOG.md: ordered work
- PROGRESS.md: session log
- LORE.md: story source
- ART_BIBLE.md: look
- TEXTURE_AUDIT.md: texture standard and audit
- ASSET_LICENSES.md: licenses
- AI_USE_LOG.md: AI use record
- EXPLAIN_TO_TEAM.md: interview prep
- DEPLOY.md: deploy checklist
