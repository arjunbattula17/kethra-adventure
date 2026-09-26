# Art Bible

Documents the look the team has already established, then tightens it. New art matches this
file; if this file is wrong, change it here first (as an UPGRADE in DECISIONS.md), then the art.

## Palette
- **Dominant tone: cool steel.** Grey-blue steel and blue-black space.
  - Interior wall steel `#5d666f`–`#7c858f`, recesses `#2b3138`–`#3d444c` (from
    `src/ship/interior/wallsTextures.ts`).
  - Space and sky `#010208` / `#07080a` (the `--void` token).
- **One accent: amber.** `--accent #d9a441` (UI), `#ffb45a` (emergency light), `#ffc27a` (warm
  crew glow). Amber means *attention, life, the thing to look at*.
- **Warning:** `--corrupt #a05555`, lifted to `#d06a5c` for small text. Used only for failure and
  damage.
- **Status:** `--success #7cbf7c`. Used only for "that worked".
- **Kethra's own palette:** bioluminescent greens and teals under a night sky, with the Rite's
  three colours (azure, amber, verdant) as its only saturated hues.
- **Not used:** purple-to-blue gradients, flat single-colour backgrounds, pure black
  (shadows keep material; see the interior brief).

## Light
- Interiors are lit by motivated practicals (strip lights, screens, the pendant tube), with an
  environment map for metal response and static shadows from one key light.
- Space is lit by an unseen distant star as a cool rim, plus a faint fill. Emissives carry the
  story: a system is "on" when it glows.
- Bloom is reserved for genuinely hot sources. Nothing blooms to fake polish; no lens flares.

## Materials and texture density
- PBR throughout: colour, normal and roughness/metalness maps. Paint is dielectric and rough;
  bare steel is metallic and polished at wear points.
- Texel density standard, measured by `tools/texture-audit.mjs` (TEXTURE_AUDIT.md):
  - hero 1024 texels/m (readable screens, labels, close props)
  - interior 512
  - ground 512
  - exterior 256
- **One style per scene.** The ship is grounded sci-fi (kitbashed Quaternius sci-fi kit plus
  procedural steel). Kethra is stylized (Quaternius nature kit); its photo-scanned ground is a
  known outlier (DECISIONS D-9).

## Resolution and density
- Everything renders in real time at the device's pixel ratio (up to 2× on high, 1× on low),
  with 4× MSAA on the medium and high tiers.
- No pixel art, so there are no mixed pixel densities to police. Keep procedural canvases
  within the density standard.

## Typography
- **Display: Rajdhani** 600/700 (SIL OFL, self-hosted) for headings, readouts, the intro's
  exposition and the loading screen's lore lines.
- **Body:** the system UI sans (Segoe UI on Windows) at 13–17 px for readable panel text.
- Stencilled signage aboard the ship is painted into textures in a condensed stencil face,
  uppercase, wide tracking.
- Not used: Arial, Inter, default engine fonts.

## UI
- Dark translucent panels `rgba(12,14,16,0.86)` with a thin amber border, amber headings, warm
  off-white ink `#eae2d0`. Not the generic white rounded-card look.
- Motion: ease-out entrances, ease-in exits, short (0.3–0.9 s). Letterbox bars for cinematics.

## Depth
- Space shots layer the equirect sky, point starfields, near dust (parallax), then the subject.
- Interiors layer foreground props against lit wall bays and a viewport to space.

## Checklist for new art
1. Does its palette sit in the dominant tone, with amber only where attention belongs?
2. Is its texture density inside its tier (run `tools/texture-audit.mjs`)?
3. Is it in the same style as the scene it joins?
4. Is its source logged in docs/ASSET_LICENSE_LOG.md?
