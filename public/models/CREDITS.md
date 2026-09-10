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

`ship/freighter.glb` is **"Colored Freighter" by Jacques Fourie**, licensed
[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/), sourced via the Google Poly archive
mirror at [poly.pizza](https://poly.pizza). Geometry as shipped (47k triangles); its eleven
flat colour-slot materials are reassigned PBR roles at load time in `src/galaxy/shipHull.ts`
(the glTF's UVs are a palette atlas, so texture maps can't be applied through them).

The former `planets/` NASA VTAD glbs were replaced by shader planets driven by the prepared
equirect maps in `public/textures/planets/` — see `public/textures/CREDITS.md` and
`tools/prep-planet-textures.mjs`.
