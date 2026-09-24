// Renders the texture audit table (markdown rows) from a before and an after report written by
// tools/texture-audit.mjs. The standard it judges against lives in TEXTURE_AUDIT.md; the tiers and
// their targets below must match it.
//
//   node tools/texture-audit-md.mjs reports/texture-audit-before.json reports/texture-audit-after.json > rows.md
import { readFileSync } from 'node:fs';

const [beforePath, afterPath] = process.argv.slice(2);
const before = JSON.parse(readFileSync(beforePath, 'utf8'));
const after = JSON.parse(readFileSync(afterPath, 'utf8'));

// Texel-density tiers, texels per world metre (see "The standard" in TEXTURE_AUDIT.md).
const TIERS = {
  hero: { target: 1024, why: 'readable text or close-up interactive surface' },
  interior: { target: 512, why: 'walkable interior, surfaces at 1-3 m' },
  ground: { target: 512, why: 'ground under the player, viewed at 1.7 m' },
  exterior: { target: 256, why: 'outdoor props and plants at 2-6 m' },
  footprint: { target: null, why: 'judged by measured on-screen size, not metres' },
  soft: { target: null, why: 'soft gradient / overlay by design' },
};
const SOFT = /AO|Shadow|Glow|Grime|Dirt|Drip|Streak|Scuff|Wear|Pool|Cone|Backdrop|Nebula|Star|Sheen|Wisp|Diffuser|Fog|Vignette|Halo|Sprite|Smudge|Glare|Soot|Film/i;
const HERO = /consoleTextures|displaysTextures|ShipTextures\.ts:\d+ build(Screen|Console|Label|Stencil|Deck|Panel(?!Grime))|Label|Stencil|Placard|Screen|Readout|ControlFace|Command|T_Decals|metal_plate\//i;

function tierOf(scene, row) {
  const s = row.source;
  if (scene === 'intro' || scene === 'reveal') return 'footprint';
  if (SOFT.test(s)) return 'soft';
  if (scene === 'kethra') {
    if (/lichen_rock/.test(s)) return 'ground';
    if (/metal_plate\//.test(s)) return 'hero';
    return 'exterior';
  }
  if (HERO.test(s)) return 'hero';
  return 'interior';
}

// Hand-written findings for the textures that needed a decision, keyed by a source substring.
const NOTES = [
  ['starfield.jpg', 'Sky equirect. At 11 px/degree it is already softer than the 23 px/degree a 1080p frame shows; kept at 4096 on high (the point starfields carry the sharp stars), 2048 on low.'],
  ['textures/planets/', 'Over-resolved: planets peak at 20-70 px radius on screen during the reveal (sun 84 px), which needs ~440 px of equirect width. Halved; 2x headroom left for 4K.'],
  ['clouds.jpg', 'Over-resolved for the same footprint reason as the planet maps. Halved.'],
  ['_ring.png', 'Over-resolved for the rings\' on-screen size. Halved.'],
  ['Bark_', 'Over-resolved 11-21x (2,800-5,300 texels/m). Stylized low-frequency bark: 512 keeps the normal-map crease lines crisp; 256 would meet the tier exactly but softens them. Documented exception.'],
  ['Leaf_Pine_C', 'Over-resolved alpha cut-out atlas. Halved with straight-alpha resampling (a canvas pass darkened leaf edges; see tools/resize-textures.mjs).'],
  ['Leaves.png', 'Over-resolved alpha cut-out atlas (and the largest download in the grove, 2.5 MB). Halved with straight-alpha resampling.'],
  ['Leaves_', 'Over-resolved alpha cut-out. Halved.'],
  ['Flowers', 'Non-power-of-two (1008x981) and over-resolved. Resampled to 512x512.'],
  ['Rocks_Diffuse', 'UNDER-resolved (85-104 texels/m): big grove rocks stretch one painted atlas. It is an island atlas, not a tiling texture, so repeat cannot fix it; needs re-UV or a detail map. Left as is and listed as open.'],
  ['Grass', 'Measures low (27-49) but is a smooth vertical colour gradient on grass cards: nothing to resolve.'],
  ['lichen_rock', 'Ground. Tried 512: the speckle at the player\'s feet went visibly soft (render diff 3.5/255), so restored to 1024. Style outlier: a photo-scanned rock under a hand-painted grove. Flagged for the team (ART_BIBLE / DECISIONS).'],
  ['metal_plate/', 'Close-up props (valve, console panel, landing pad) at 785-1094 texels/m. Halved to 392-547, inside the hero band.'],
  ['metal_plate_02', 'Shared by the ship and the grove at 925-1216 texels/m. Halved.'],
  ['T_Decals', 'Non-power-of-two (2000x2000) and over-resolved (806-1522). Resampled to 1024x1024.'],
  ['T_Trim_01', 'Least-dense use (276 texels/m) already needs the full 2048. Kept.'],
  ['T_Trim_02', 'On target at 2048 (457-511 texels/m). Kept.'],
  ['buildWallPlateSet', 'UNDER-resolved 4x (109-134 texels/m on the room\'s largest surfaces) and painted 4 times per variant (duplicates). Now painted once per variant, at 2x resolution in the same design space (+25 MB, the one justified increase).'],
  ['heightToNormal', 'Normal map of the wall plate set: follows the set (painted once, 2x).'],
  ['packOrm', 'ORM map of the wall plate set: follows the set (painted once, 2x).'],
];
const noteFor = (s) => NOTES.find(([k]) => s.includes(k))?.[1];

// Stable identity for a texture across the two runs. Line numbers move and memoized builders show
// up as paintX ← memoTexture instead of canvas2d ← buildX, so canvases are keyed by the first
// build*/paint* frame, with paint normalized to build.
const identity = (source) => {
  if (!source.startsWith('canvas')) return source;
  const frames = source.replace(/^canvas: /, '').split(' <- ');
  const pick = frames.find((f) => / (build|paint)\w+$/.test(f)) ?? frames[frames.length - 1];
  return pick.replace(/:\d+/, '').replace(/ paint(\w+)$/, ' build$1');
};
const keyOf = (r) => `${identity(r.source)}|${r.slot}|${r.hash ?? ''}`;
const label = (s) => s.replace(/^canvas: /, 'canvas: ').replace(/ <- /, ' ← ').replace(/^textures\//, 'public/textures/');
const mb = (b) => (b / 1048576).toFixed(2);

const out = [];
out.push('| Scene | Texture (file, or procedural builder) | Slot | Before | After | Format | Mips | GPU MB before → after | Texels/m (min / median) | Tier | Finding |');
out.push('|---|---|---|---|---|---|---|---|---|---|---|');
for (const scene of Object.keys(before)) {
  // Group identical sources (duplicate canvases share a source string and hash) so the table shows
  // "x4" once instead of four identical rows.
  const group = (rows) => {
    const m = new Map();
    for (const r of rows) {
      const k = keyOf(r);
      const g = m.get(k) ?? { ...r, count: 0, total: 0 };
      g.count++;
      g.total += r.bytes;
      m.set(k, g);
    }
    return m;
  };
  const gb = group(before[scene].textures);
  const ga = group(after[scene].textures);
  // Match after-rows to before-rows by source+slot (hash changes when content is re-painted).
  const bySrc = new Map();
  for (const g of ga.values()) {
    const k = `${identity(g.source)}|${g.slot}`;
    (bySrc.get(k) ?? bySrc.set(k, []).get(k)).push(g);
  }
  const rows = [...gb.values()].sort((x, y) => y.total - x.total);
  for (const b of rows) {
    const cands = bySrc.get(`${identity(b.source)}|${b.slot}`) ?? [];
    const same = cands.findIndex((c) => c.hash === b.hash);
    const a = same >= 0 ? cands.splice(same, 1)[0] : cands.shift();
    const tier = tierOf(scene, b);
    const t = TIERS[tier];
    const dens = a?.densityMin != null ? `${a.densityMin} / ${a.densityMedian}` : b.densityMin != null ? `${b.densityMin} / ${b.densityMedian}` : 'n/a';
    let finding = noteFor(b.source);
    if (!finding) {
      const d = a?.densityMin ?? b.densityMin;
      if (tier === 'soft') finding = 'Soft by design; density not a quality axis.';
      else if (tier === 'footprint') finding = 'Background layer; sized by on-screen footprint.';
      else if (d == null) finding = 'No UV area measured (unused slot or degenerate UVs).';
      else if (t.target && d < t.target * 0.5) finding = `Under target (${t.target}) — soft up close. Candidate for a later pass.`;
      else if (t.target && d > t.target * 2 && b.bytes > 1048576) finding = `Over target (${t.target}); small absolute cost, left.`;
      else finding = 'Within the tier band.';
    }
    const dup = b.count > 1 ? ` ×${b.count}` : '';
    const dupAfter = a && a.count > 1 ? ` ×${a.count}` : '';
    const fmt = b.source.startsWith('canvas') ? 'canvas RGBA8' : /\.png|png$/i.test(b.source) ? 'PNG → RGBA8' : b.source.includes('.jpg') ? 'JPEG → RGBA8' : 'glTF image → RGBA8';
    if (b.count > 1 && !finding.includes('painted once') && a && a.count < b.count) finding = `${b.count} pixel-identical copies painted separately; now painted once and shared. ` + finding;
    out.push(
      `| ${scene} | ${label(b.source)}${dup} | ${b.slot} | ${b.w}×${b.h} | ${a ? `${a.w}×${a.h}${dupAfter}` : 'removed'} | ${fmt} | ${b.mips ? 'yes' : 'no'} | ${mb(b.total)} → ${a ? mb(a.total) : '0'} | ${dens} | ${tier} | ${finding} |`,
    );
  }
}
const tb = Object.values(before).reduce((s, x) => s + x.totalBytes, 0);
const ta = Object.values(after).reduce((s, x) => s + x.totalBytes, 0);
out.push('');
out.push(`**Totals (estimated GPU memory, RGBA8 + mips):** ${Object.keys(before).map((s) => `${s} ${(before[s].totalBytes / 1048576).toFixed(1)} → ${(after[s].totalBytes / 1048576).toFixed(1)} MB`).join(' · ')} · **all ${(tb / 1048576).toFixed(1)} → ${(ta / 1048576).toFixed(1)} MB**`);
console.log(out.join('\n'));
