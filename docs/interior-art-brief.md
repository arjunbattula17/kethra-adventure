# Ship interior — art direction brief

The bar is `reference/bar.png` (a shipped AAA sci-fi interior). Every builder working on a piece
of `src/ship/interior/` follows this brief so nine independently-edited modules still read as one
room. Per-piece reference crops are in `reference/crops/<piece>.png`.

## Palette

The reference is **not** brown and navy. It is cool grey steel, bone-white paint, and warm
practicals, with saturated colour reserved for small accents. Ours currently reads rust-orange and
royal blue, which is the single largest whole-room deviation.

| Role | Hex | Where |
| --- | --- | --- |
| Painted deck / large floor areas | `#c9c2b4` – `#ddd6c6` | the biggest, brightest surface in frame |
| Bare deck plate / walkway inserts | `#6e737c` – `#8a8f98` | inset panels, grates, hatch covers |
| Wall steel, upper structure | `#5d666f` – `#7c858f` | most wall area, cool desaturated grey-blue |
| Wall steel, shadowed | `#2b3138` – `#3d444c` | corners, undersides, recesses |
| Ceiling structure | `#39424c` – `#525c68` | beams, corrugated panels, ducts |
| Warm practical light | `#ffd9a0` | strip fixtures, ceiling lamps, door pools |
| Screen / holo cyan | `#4fd8f0` – `#a8f0ff` | monitors, the focal display, LED strips |
| Hazard yellow | `#d8a63a` | floor stripes, lane markings, kick strips |
| Alarm red-orange | `#e0552f` – `#ff3a2a` | door trim, LED banks, indicator dots |
| Copper / brass pipe | `#a8703a` | flex conduit only — an accent, never a large surface |

Saturated brown/rust is an **accent for small worn areas**, not a base colour. If a surface larger
than about one square metre is rust-orange, it is wrong.

## Value structure

- The floor is the **brightest** large surface. Light bounces up off it; the room reads open.
- The walls sit in the mid range and fall off hard into near-black in corners and behind props.
- One clear cool focal point (the screen bank) is the brightest thing in frame.
- Warm and cool are separated by **fixture type**, not blended: overhead practicals are warm,
  every screen and LED strip is cool. Pools of each overlap only at their edges.

## Detail language

Everything is assembled from bolted plates. The reference has no untreated surface:

1. **Seams and rivets everywhere.** Panels are 0.5–1.5 m, each with a visible edge, and bolt heads
   at the corners. Real geometry (a 2–4 cm raised rib) reads better than a texture at this scale.
2. **Secondary element on every surface.** Any flat area bigger than about a metre gets a vent, a
   conduit run, a junction box, a bracket, a placard, or a wear decal.
3. **Chamfers, not sharp boxes.** Prop silhouettes are broken up — bevelled corners, recessed
   faces, added flanges and end caps.
4. **Depth layering.** Foreground props, mid-ground structure, background structure. Nothing sits
   flush against a wall with nothing in front of it.
5. **Prop density.** In the reference no floor or wall region a metre across is empty.

## Wear

Wear is **localised and motivated**, never a uniform tint: scuffs along walking lanes, corrosion at
joints and drip lines under pipes, paint chipped at corners and edges, grime pooling where surfaces
meet. Uniform rust across a whole wall is the opposite of what the reference does.

## Hard constraints

- Only ever edit **your own piece's module** under `src/ship/interior/`, plus a new
  `src/ship/interior/<piece>Textures.ts` if you need new procedural textures.
- `src/ship/ShipTextures.ts` and `src/ship/interior/ctx.ts` are **shared and read-only.**
- Keep every existing `ctx.interaction.register(...)` call working — they drive gameplay.
- Keep player collision honest: nothing new that blocks the walk from spawn `(0, 1.7, 4)` to the
  console at `z = -3.6`, or that clips through the player at eye height 1.7 in open floor.
- Register per-frame animation through `ctx.animated.push((elapsed, dt) => …)`, never by editing
  `ShipInteriorScene.ts`.
- Room is 9 wide (X), 12 deep (Z), 4 tall (Y). Console at `-Z`, airlock at `+Z`.
- Budget: keep added draw calls reasonable — share materials and geometries across repeated props
  rather than allocating one per instance.
- `npx tsc --noEmit` must be clean for your file before you finish.
