# Assets · everything in the build that was not made here, and its licence

Audited 2026-10-13 (release pass, Phase 1). This file is the verdict against the project's rule;
`docs/ASSET_LICENSE_LOG.md` stays the row-per-asset log with URLs, and the `CREDITS.md` in each
`public/` folder says what was re-encoded or rebuilt.

**The rule.** docs/BRIEF.md: third-party assets are CC0 only. docs/DESIGN.md §10.3 (approved
2026-09-27) keeps two exceptions on purpose: the planet maps and the two fonts.

## Verdict

| | |
|---|---|
| CC0, or made in this repository | Everything in the build except the two rows below |
| **Approved exception: CC BY 4.0** | The planet, sun, cloud and ring maps (`public/textures/planets/`) |
| **Approved exception: SIL OFL 1.1** | The two typefaces (`public/fonts/`) |
| Removed in this pass | Kethra's column, crystal cluster and moth, three CC BY 4.0 models. They are now built in code (DECISIONS D-30) and their files and credit line are gone |
| **Needs a person** | One image in the repository, never in the build, that the project has no licence for: `reference/bar.png` and its crops. See "In the repository, not in the build" |

So the build holds **no CC BY model and no unlicensed file**. It is not "CC0 only" in the strict
sense, and will not be until the team either accepts the two exceptions in writing or replaces them.
What replacing them would take is at the end.

## Third-party files in the build

"Checked" is what this audit did on 2026-10-13, not what an earlier log said.

| What | Where | From | Licence | CC0 | Credited in the game | Checked |
|---|---|---|---|---|---|---|
| Modular Sci-Fi MegaKit (Standard): the Wren's and the Anchorage's walls, trims and props | `public/models/quaternius/` | Quaternius, quaternius.com/packs/modularscifimegakit.html | CC0 1.0 | Yes | Yes (`credits.kits`), though not required | The pack's page states "CC0 License" for the pack, free tier included |
| Stylized Nature MegaKit (Standard): Kethra's trees, plants and rocks | `public/models/quaternius-nature/` | Quaternius, quaternius.com/packs/stylizednaturemegakit.html | CC0 1.0 | Yes | Yes (`credits.kits`) | The pack's page states "License: CC0". `public/models/CREDITS.md` also records the archive's own `License_Standard.txt` |
| Seven texture sets in use: `metal_plate`, `metal_plate_02`, `lichen_rock`, `bark_willow`, `ship_wall` (rusty_metal_04), `forest_ground` (forest_ground_06), `grass_ground` | `public/textures/` | Poly Haven, polyhaven.com/a/<name> | CC0 1.0 | Yes | Yes (`credits.textures`) | polyhaven.com/license: every asset on the site is CC0, no attribution required. Each set is loaded by code (`applyPbr` / `loadColour` calls in `src/`) |
| Three texture sets loaded by nothing: `ship_floor` (metal_grate_rusty), `ship_console` (worn_shutter), `ship_trim` (blue_metal_plate) | `public/textures/` | Poly Haven | CC0 1.0 | Yes | Covered by `credits.textures` | Same licence page. No code names them outside the type list in `src/core/TextureLibrary.ts`. 19.7 MB that ships for nothing (D-10) |
| Jacaranda Tree and Tree Small 02, rebuilt low-poly | `public/models/kethra/jacaranda.glb`, `tree_small.glb` | Poly Haven, polyhaven.com/a/jacaranda_tree and /a/tree_small_02 | CC0 1.0 | Yes | Yes (`credits.textures`) | Same licence page |
| **Planet, sun, cloud and ring maps**, remapped to this game's palettes (12 files) | `public/textures/planets/` | Solar System Scope, solarsystemscope.com/textures | **CC BY 4.0** | **No** | **Yes, and required** (`credits.planets`); `tools/test-vessek-flow.mjs` fails if the line stops rolling | The page states CC BY 4.0 and that the maps are based on NASA elevation and imagery data |
| **Rajdhani** 600 and 700; **Atkinson Hyperlegible** 400, 400 italic and 700 | `public/fonts/*.woff2` | Indian Type Foundry (via Google Fonts); Braille Institute of America (via the @fontsource package) | **SIL OFL 1.1** | **No** | Yes (`credits.font`). The licence asks that its text travel with the fonts: `public/fonts/OFL-Rajdhani.txt`, `OFL-AtkinsonHyperlegible.txt` | Both licence files read; both name OFL 1.1 and the right copyright holder |
| three.js 0.185.1, the rendering library, compiled into the bundle | `dist/assets/three-*.js` | threejs.org | MIT | Code, not an asset | Yes (`credits.three`) | `node_modules/three/package.json` says MIT. **Found:** the built bundle had lost the library's licence notice, which MIT asks to travel with copies. The licence text now ships as `public/licenses/three.js-LICENSE.txt` |

There are no audio files. Every sound and all the music is synthesised at run time
(`src/audio/AudioSystem.ts`).

## Made in this repository

No third-party licence applies to these. Most of the code that makes them was written with an AI
coding assistant; docs/AI_AND_ASSET_LOG.md is the record of that for the honor statement.
- **New in this pass:** Kethra's colonnade, its resting moths and the crystal in the Heart's basin,
  as geometry built in `src/planets/kethra/dressing.ts` (`columnGeometry`, `mothGeometry`,
  `crystalGeometry`).
- The Wren's hull and the Anchorage's moored ships (`src/galaxy/shipHull.ts`), the space sky, the
  characters, the Wickmoth, the Cistern Heart, every painted sign, screen and decal, the stepping
  stones, the water and the mist, all sound, and all writing. The list with file names is in
  docs/ASSET_LICENSE_LOG.md, "Made in this repo".

## In the repository, not in the build

Nothing here is served to a player: none of it is under `public/` and no code loads it. It matters
only where the repository itself is seen, and the repository is public on GitHub today (checked
with `gh repo view` on 2026-10-13; see D-12).

| What | Where | Status |
|---|---|---|
| **A promotional image of a commercial game's interior, with the studio's and the game's logos on it, and ten crops of it** | `reference/bar.png`, `reference/crops/*.png` | **Not licensed to this project.** It was the visual target for the ship-interior review in August (docs/interior-art-brief.md) and nothing was copied from it into the game. In the repository since 2026-08-23 and already on `origin/master`. Left in place by this pass: removing it changes a review tool the team may still use, and deleting it now would not take it out of the history that is already published. **The team should remove it before the repository is shown to anyone**, and decide with the advisor whether the history needs the fresh-repository fix D-12 already recommends |
| Three preview images of the Quaternius sci-fi kit | `reference/quaternius-preview-*.png` | The kit is CC0. Whether its preview pictures are covered by that was not checked |
| Screenshots and measurements of this game | `docs/screens/`, `docs/screenshots/`, `docs/perf/`, `reports/` | The project's own |
| Build and test tools | `node_modules/` (not committed) | vite and gh-pages MIT, typescript and playwright Apache-2.0, @types/three MIT, read from each `package.json`. None is in the build |

## Weight that ships for nothing

Not a licensing matter, but found by the same audit. The build is 98.0 MB.
- `public/textures/ship_floor`, `ship_console`, `ship_trim`: 19.7 MB, loaded by nothing.
- `public/models/quaternius-nature/glTF/*.png` (20 files): 37.1 MB. The loader asks for their `.jpg`
  copies in `Textures/` instead (`src/planets/kethra/kit.ts`).

D-10 proposed archiving these and is still the team's to approve. **D-10 is out of date on two
points:** `ship_wall` is used by the Anchorage (`VessekScene.ts`) and `bark_willow` by the Heart's
chamber (`hush/chamber.ts`). Removing either would break a level.

## What this audit did not verify

- **That each file is the file its row names.** The licences were read at their sources and the
  folders match the rows, but nothing proves the bytes came from those pages.
- **TSA's own wording.** Whether the competition accepts CC BY and OFL material with credit is for
  the team and the advisor to read in this year's rules. Nothing here is advice on that.
- **Photographs inside the kits.** The Poly Haven sets are photo scans published as CC0 by their
  makers; that is taken on Poly Haven's word.

## If the team wants strictly CC0

- **Planet maps.** DESIGN §10.3 keeps them "until procedural planets prove as good". Nobody has
  built procedural planets to compare. The maps feed `src/galaxy/planetShader.ts`.
- **Fonts.** DESIGN §10.3 records that no CC0 face was found to equal them. A replacement would have
  to pass what docs/DESIGN.md §2 ("Typography") asks of the two faces.
