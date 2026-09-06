# Ship interior — measured room contract

Every number here was measured, not guessed: kit-piece bounds come from
`node tools/kit-bounds.mjs <Category>/<Piece>` (raw glTF POSITION accessors), and placed-object
bounds come from `node tools/interior-audit.mjs reports/interior-nobatch.json` (world AABB of every
mesh in the live scene, with `?nobatch=1` so batching doesn't fuse them).

## Room shell (after the walls.ts corner/end-wall fix)

Room is `ROOM_W=12` (X), `ROOM_D=16` (Z), `ROOM_H=5` (Y), centred on the origin. The deck is at
y=0, the ceiling structure starts around y=4.4.

The **room-facing wall surfaces** — the planes props must sit in front of, never behind:

**The wall is stepped at y = 3.** The lower bay (`WallAstra_Straight`, y 0–3.02) and the upper cap
(`TopAstra_Straight` / `TopCables_Corner_Square_Inner`, y 3–5) are different pieces with different
face offsets, so there is a 0.35 m recess above waist height. Mount against the surface for the
height you are actually at:

| Wall | Lower surface (y 0–3.02) | Upper surface (y 3–5) | Hull side |
| --- | --- | --- | --- |
| left (-X) | `x = -5.565` | `x = -5.914` | out to `x = -6.77` |
| right (+X) | `x = +5.565` | `x = +5.914` | out to `x = +6.77` |
| console (-Z) | `z = -7.565` | `z = -7.914` | out to `z = -8.77` |
| airlock (+Z) | `z = +7.565` | `z = +7.914` | out to `z = +8.77` |

Anything at `|x| > 5.565` or `|z| > 7.565` **below y = 3** is inside the solid wall bay and will not
be visible at all. Above y = 3 the same coordinate is in the recess and is fine down to 5.914.
This is the trap that catches fixtures placed against `HALF_W = 6` / `HALF_D = 8`: mounting at
`|x| = 5.88` puts a fixture 0.03 proud of the upper wall but 0.32 *buried inside* the lower one, so
it reads as a fixture that vanishes below chest height. A wall-mounted prop of depth `d` sits
centred at `surface - d/2` on the room side of whichever surface its height selects.

Columns (`Column_Astra`) stand proud of the side walls at `x = ±5.45`, occupying
`x ∈ [-6.29, -5.08]` / `[5.08, 6.29]` at `z = ±2`. They are the only structure that legitimately
crosses the wall line; props must not overlap their `±0.48` protrusion.

Airlock opening: the door frame (`Door_Frame_Square`) spans `x ∈ [-2.43, 2.43]`, `y ∈ [0, 5]`,
`z ∈ [7.75, 8.25]`. The clear opening is roughly `|x| < 2.1`, `y < 4.05`.

## Ceiling / floor

- Deck slab: `y ∈ [-0.2, 0]`, walkable surface `y = 0`.
- Ceiling slab: `y ∈ [4.88, 5.0]`. Beams, ducts and conduits hang below it.
- A prop taller than `y = 4.4` in open floor will hit ceiling structure.

## Player constraints (do not break these)

- Spawn `(0, 1.7, 4)`; the console is at `z ≈ -4.8`. Eye height is 1.7.
- Nothing new may block the walk from spawn to the console, and nothing may occupy eye height
  (`y ≈ 1.4–2.0`) over open floor along that lane.
- Keep every `ctx.interaction.register(...)` call working.

## Kit piece authoring convention

Kit wall pieces are authored in the **-X/-Z quadrant** of their tile, not centred:

    WallAstra_Straight             x [-2.774, -1.565]  z [-2, 2]      y [0, 3.02]
    TopAstra_Straight              x [-2.000, -1.914]  z [-2, 2]      y [3, 5]
    WallAstra_Corner_Square_Inner  x [-4.774,  0]      z [-4.774, 0]  y [0, 3.02]
    TopCables_Corner_Square_Inner  x [-4.169,  0]      z [-4.169, 0]  y [3, 5]
    Door_Frame_Square              x [-2.427, 2.427]   z [-0.253, 0.253]  y [0, 5]
    Door_DarkMetal                 x [-2.106,  0]      z [-0.102, 0.102]  y [0, 4.05]

So an unrotated straight bay is a **-X wall** (face at local `x = -1.565`) and an unrotated square
inner corner is the **-X/-Z corner**. `Door_DarkMetal` is a **single leaf covering half the
opening** — one placement leaves the other half of the doorway empty.

Yaw for a piece of this family is *not* `atan2(nx, nz)`: that spins the piece's local +Z, which is
its 4-unit length axis, not its face normal. Use the axis-aligned quarter turns in `walls.ts`.

## Tools

    node tools/kit-bounds.mjs Walls/WallAstra_Straight     # raw glTF bounds, per material
    node tools/interior-audit.mjs reports/interior-nobatch.json
    node tools/probe-pixel.mjs "<camX,camZ,yaw,pitch>" "<px,py>"   # what is at this screen pixel
    node tools/capture-room-sweep.mjs renders/<dir>        # yaw sweep from 6 standing spots
    node tools/imgtool.mjs crop <in.png> <out.png> <x> <y> <w> <h>

The dev server must be running on `http://localhost:5180/kethra-adventure/` for the browser tools.
