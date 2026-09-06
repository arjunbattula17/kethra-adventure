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

All models in `planets/` are NASA Visualization Technology Applications and Development (VTAD)
3D models, public domain U.S. government works. Re-encoded from the originals by
`tools/prep-planet-models.mjs`, which downscales/recompresses each embedded texture to a JPEG
(the source PNGs are 4096x3072, far more resolution than these planets — small on screen for
nearly this whole cinematic, see planetShader.ts — ever need) and splices it back into the glTF
binary; geometry is untouched. Used as stand-ins for this game's own fictional planets (Kethra,
Vessek Anchorage, Orrun's Reach, Isilthe — see src/galaxy/planetData.ts), tinted toward each
planet's established color, not as literal Saturn/Venus/Jupiter/Earth.

- `saturn.glb` — https://science.nasa.gov/resource/saturn-3d-model/
- `venus.glb` — https://science.nasa.gov/resource/venus-3d-model/
- `jupiter.glb` — https://science.nasa.gov/resource/jupiter-3d-model/
- `earth.glb` — https://science.nasa.gov/resource/earth-3d-model/
