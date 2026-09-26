# Design Notes

A running log of what was tried and what was rejected, so nobody circles back to an idea that
already failed. Newest decisions go at the bottom of each section. Contract: `docs/STYLE_BIBLE.md`.

## Defaults found and fixed

These are the "any game would look like this" choices that the first audit (STYLE_AUDIT.md) caught.

| Default | Where | Fix |
|---|---|---|
| Buttons in Arial | Dialogue options: browsers give `<button>` their own font, so they didn't inherit the body font | `button, input, select { font: inherit }` in `src/style.css` |
| ALL-CAPS labels everywhere | Title buttons, panel titles, map buttons, speaker names | Sentence case; caps kept only for small "eyebrow" labels and key caps |
| Pill-shaped glowing button | "Click to look around" | A framed prompt with a key cap; no pulse, since nothing should move that the player didn't trigger |
| Toasts in the centre of the view | Every message | Moved to a lower-left log |
| Three caption styles | Intro, tutorial, galaxy reveal | One caption style for the whole game |
| System body font | Segoe UI on Windows, a different face on Mac | Atkinson Hyperlegible, bundled (OFL) |
| Raw browser checkboxes and radio buttons | Settings | Custom switch and segmented buttons |
| Close hint in the screen corner | Panels weren't `position: relative`, so the hint drifted to the screen edge | Hint moved into each panel's footer |
| Double fade to black (1.2 s out + 1.2 s in) | Every scene change | Scan-line transition, 560 ms of motion |
| Primitive stand-ins left as final art | Capsule people, octahedron Heart, sphere Wickmoth | Designed objects (see below) |
| Autumn-red kit foliage used as it came | Kethra's TwistedTree species | Tinted into the art bible's sea-green (see below) |

## Kethra

- **Capsule NPCs → designed figures.** The Aiveth were a purple capsule with a sphere for a head.
  Replaced with low-poly figures built in code (`src/characters/Figure.ts`) in the Quaternius kits'
  faceted style, with glowing vein lines. The glow is the Aiveth's "speech" from LORE.md: the
  Warden's glow starts drawn in and opens when she trusts you.
- **Aiveth chest hot-spot (rejected).** The first version put each figure's point light inside the
  chest, which read as a glowing lamp in the ribs. Moved above and in front of the head, lower
  intensity; the vein texture does the glowing.
- **Slab collar (rejected).** The first mantle was the trim colour and read as a flat grey box on
  the shoulders. Now garment-coloured with a thin trim edge.
- **Autumn-red foliage.** Swapping the red species (TwistedTree) out was rejected, because the team
  chose those trees and their trunks are landmarks. Instead every leaf material is re-tinted by its
  own brightness into sea-green (`tintByLuminance` in `src/planets/kethra/grove.ts`), which keeps the
  painted leaf detail.
- **Heart stone texture (rejected).** The Cistern Heart's vanes and basin first used the tiled
  `lichen_rock` texture. On extruded shapes the tiling smeared into long stripes and the stone read
  as wooden planks. Now flat-shaded untextured stone.
- **Wickmoth scale and angle.** At first the wings were edge-on at eye level and the moth looked
  small. Scaled up 1.45× and tipped nose-up in flight so the stained-glass wings face the player.
  When dormant it settles at the side of the approach, not at head height in the path.

## Vessek Anchorage: the window view (four passes)

1. **Opaque glass.** The kit's window glass (`M_Glass`) is authored opaque grey. Made transparent and
   dark.
2. **Ring out of frame.** A 140 m ring put every moored ship outside the camera's view from the
   windows. Shrunk to 60 m so the hulls curve across the view 80–140 m out.
3. **Orange donuts.** The freighter's engine rings are emissive; at distance they read as floating
   orange-and-blue rings. Engines switched off (stranded ships have cold engines anyway).
4. **Too-dark hulls.** A big fill light made a glare spot on the window frame and still didn't light
   the hulls. Settled on each hull glowing very faintly in its own ship's lamp colour. That also
   shows the lore line "every ship's grid is different" without text.

Stopped there on purpose (four attempts on one problem is the limit we set). The view reads as the
planet with faint lashed hulls; it's quieter than planned.

## UI

- **Side-stripe toast indicator (rejected).** A coloured bar down the left edge of each toast is a
  common generated-UI pattern, and a project hook blocks it. Replaced with a small square status pip
  plus a tinted border. (STYLE_BIBLE.md's Components section still mentions a "coloured left bar";
  the pip is what shipped.)
- **Title idle motion.** The title had three things moving on their own: drifting stars, a
  breathing glow and a turning planet. Reduced to one, the planet.
- **Pause heading.** "PAUSED" eyebrow above a "Paused" title said the same thing twice; eyebrow
  removed.
- **Credits over the ending.** First version let the 3D ending show through at 72% opacity and the
  last caption linger under the text. Backing raised to 90% and captions hidden when credits open.
- **Settings width.** Four quality options didn't fit a 220 px column ("Quality" was cut off).
  Column widened to 340 px.

## Performance

- **Dropping 25 of the Wren's 41 point lights: kept.** three.js writes every point light into
  every lit shader. Keeping the 16 strongest cut a cold-browser boot from about 65 s to about 30 s on
  the dev PC, with the room within 2.06/255 per pixel on average of the original (0.61% of pixels
  changed by more than 32 levels) across five views. Low tier keeps 8 (about 22 s). Details in
  PERF_LOG.md.
- **Flattening small props on the Low tier: reverted.** Idea: give every small prop a plain
  material in its average colour so the batching pass could merge them. It only cut the room's draw
  calls from 661 to 637, because most of the cost is mid-size props, instanced kit pieces and
  transparent overlays. Not worth the code.
- **Hiding transparent overlay planes on Low: not applied.** Hiding all 70 of them also removed
  the stars in the Wren's window. Only the multiply-blended grime decals (29) were safe to drop,
  which is too small a saving to matter.
- **Open item:** the Wren's remaining ~650 draw calls come from ~350 one-off generated textures. The
  real fix is a texture atlas (many small textures packed into a few big ones) so props can share
  materials. See PERF_AUDIT.md.
