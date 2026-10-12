# Model credits

All models in `quaternius/` are the **Modular Sci-Fi MegaKit (Standard)** by
[Quaternius](https://quaternius.com), licensed
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (public domain — no
attribution legally required, credited here as good practice).

- https://quaternius.com/packs/modularscifimegakit.html
- https://quaternius.itch.io/modular-sci-fi-megakit

glTF format, PBR textures (base color / normal / ORM / emissive) included as shipped.

Sixteen of the twenty-one shared maps in `quaternius/Textures/` shipped as lossless 2048x2048
PNGs — 27MB in total, with the three ORM maps alone accounting for 9.9MB — and the ship interior
is the first scene the game loads, so that weight was paid on every first load. Re-encoded to
`.jpg` by `tools/recompress-textures.mjs`, which picks a quality per file against a measured
mean-error budget and refuses any file JPEG would make larger (27MB -> 6.5MB). The five left as
PNG are the decal sheet, the two detail masks and the two emissive maps: all small and
high-contrast, and all bigger as JPEG than as PNG. `src/ship/interior/kit.ts`'s URL modifier
redirects the glTFs' original bare `.png` filename requests to the `.jpg` siblings, the same way
the nature kit's does.

All models in `quaternius-nature/` are the **Stylized Nature MegaKit (Standard)** by
[Quaternius](https://quaternius.com), licensed
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (public domain — no
attribution legally required, credited here as good practice; confirmed directly in the
archive's own `License_Standard.txt`, not just the marketplace listing).

- https://quaternius.com/packs/stylizednaturemegakit.html
- https://quaternius.itch.io/stylized-nature-megakit

68 pieces (trees, bushes, ferns, flowers, grass, mushrooms, rocks, rock paths). glTF format,
PBR textures included as shipped. Ruin/architecture pieces are hand-built procedurally rather
than sourced from a kit — the only CC0 ruins pack found in research (Quaternius's Ultimate
Modular Ruins Pack) ships FBX/OBJ/Blend only, no glTF, which would need a conversion pass this
project's pipeline doesn't have.

The ten bark/rock/mushroom diffuse and normal maps in `quaternius-nature/Textures/` shipped as
lossless PNG with no alpha channel in use — several were 4-6MB apiece for no visual gain over a
quality-85 JPEG. Re-encoded to `.jpg`; `src/planets/kethra/kit.ts`'s URL modifier redirects the
glTFs' original bare `.png` filename requests to the `.jpg` siblings.

The Wren's hull is built in code (`src/galaxy/shipHull.ts`). It replaced "Colored Freighter" by
Jacques Fourie (CC BY 3.0) on 2026-09-27; that model is no longer in the build.

The former `planets/` NASA VTAD glbs were replaced by shader planets driven by the prepared
equirect maps in `public/textures/planets/` — see `public/textures/CREDITS.md` and
`tools/prep-planet-textures.mjs`.

## `kethra/`: Kethra's set dressing

Five models rebuilt for Kethra from sourced originals. None is used as downloaded: each was reduced
and restyled to sit beside the Stylized Nature kit (ART_BIBLE.md, "one style per scene"), and the
game then tints them into the grove's palette at load (`src/planets/kethra/dressing.ts`).

| File | Source | Author | License |
|---|---|---|---|
| `column.glb` | "Column, old Roman" - https://sketchfab.com/3d-models/column-old-roman-b1345f1ef29848ed8e1a0a3649fbca22 | aluxado | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `crystal.glb` | "Crystal Cluster 2 (Free)" - https://sketchfab.com/3d-models/crystal-cluster-2-free-b1bed3164820477894d4f76307a26a13 | chrismartin1337 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `moth.glb` | "Moth" - https://sketchfab.com/3d-models/moth-9d1facf05aad4c1ea420f3c90cb9d2f9 | Peter Farell | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `jacaranda.glb` | Jacaranda Tree - https://polyhaven.com/a/jacaranda_tree | Rob Tuytel, Rico Cilliers (Poly Haven) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `tree_small.glb` | Tree Small 02 - https://polyhaven.com/a/tree_small_02 | Rico Cilliers (Poly Haven) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |

The three CC BY models are credited in the end credits (`credits.models` in
`src/content/strings.ts`), which is what that licence requires. All five were modified:

- **`column.glb`** - a photo scan of 999,844 triangles with an 8192 px photo texture. Vertices were
  merged by position, the mesh reduced to 2,200 triangles, and the photo's light and moss sampled
  into vertex colour as a multiplier on the game's own cut-stone colour. No texture ships. The game
  sinks the square plinth under the water and stretches the fluted shaft to make taller columns.
- **`moth.glb`** - a photo scan of a moth resting on a rock slab (37,821 triangles, 4096 px
  texture). The slab was cut away, the moth reduced to 900 triangles, and its wing pattern kept as
  vertex colour in value only. No texture ships. It is used at real moth size (about 0.2 m).
- **`crystal.glb`** - 36,746 triangles and two 2048 px textures reduced to 2,157 triangles and one
  512 px colour map; a stray line object in the original was removed.
- **`jacaranda.glb`** and **`tree_small.glb`** - film-quality trees of 3,863,832 and 2,062,487
  triangles. The trunk and main limbs were reduced and the twigs dropped; the leaves, which are
  textured cards, were thinned to an even subset and each rebuilt as one quad (7,244 and 1,600
  cards), stored in shuffled order so the low quality tier can draw half of them. Final sizes are
  24,386 and 4,974 triangles. Each ships one 256 px bark map and one leaf map with the cut-out in
  its alpha channel (512 px WebP and 256 px PNG): the sizes the texture audit's standard asks for
  on trees that stand at least 6 m from any path.
