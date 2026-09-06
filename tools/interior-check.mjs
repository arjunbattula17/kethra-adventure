// Checks a scene dump from tools/interior-audit.mjs against the measured room contract in
// docs/interior-room-contract.md. Reports geometry that escapes the room shell, sinks through the
// deck or ceiling, deeply interpenetrates another solid, or reads as a large untextured panel.
// Usage: node tools/interior-check.mjs [reports/interior-nobatch.json]
import { readFileSync } from 'node:fs';

const d = JSON.parse(readFileSync(process.argv[2] || 'reports/interior-nobatch.json', 'utf8'));

const FACE_X = 5.565, FACE_Z = 7.565, HULL_X = 6.77, HULL_Z = 8.77, DECK_Y = 0, CEIL_Y = 5.0;
const TOL = 0.02;

// The hull shell itself legitimately lives outside the wall surfaces: kit wall/corner/door pieces
// (MI_*/M_Decal_* materials) and the deck and ceiling slabs the room is built on.
const isShell = (m) => m.mats.some((x) => /^(MI_|M_Decal)/.test(x.name)) || m.size[0] > 11 || m.size[2] > 15;
const vol = (m) => Math.max(m.size[0], 1e-4) * Math.max(m.size[1], 1e-4) * Math.max(m.size[2], 1e-4);
// Decals and glows are flat, alpha-blended and deliberately co-planar with what they sit on.
const isDecal = (m) => m.size.some((v) => v < 0.012) || m.mats.every((x) => x.transparent || x.type === 'MeshBasicMaterial');
const mid = (m, k) => (m.min[k] + m.max[k]) / 2;

const out = { escapes: [], sunk: [], overlaps: [], untextured: [] };

for (const m of d.meshes) {
  // An InstancedMesh's geometry bounding box is the single base shape sitting at the origin; the
  // real placements live in instanceMatrix, which this dump does not read. Its AABB is meaningless.
  if (!m.visible || m.instanced) continue;
  if (!isShell(m)) {
    // Two genuinely broken cases, as opposed to the normal one where a wall-mounted prop's back
    // face is tucked a few cm behind the wall surface: the piece is centred on the wrong side of
    // the surface (so most of it is buried in the wall), or it reaches past the hull entirely.
    // The airlock's centre bay is not wall — it is the door frame, whose room-facing face sits at
    // 7.747. Dressing bolted to the frame is correctly past the 7.565 wall line.
    const facePosZ = Math.abs(mid(m, 0)) < 2.45 ? 7.747 : FACE_Z;
    const buried = [
      ['-X', -FACE_X - mid(m, 0)], ['+X', mid(m, 0) - FACE_X],
      ['-Z', -FACE_Z - mid(m, 2)], ['+Z', mid(m, 2) - facePosZ],
    ].filter(([, v]) => v > TOL);
    const throughHull = [
      ['-X', -HULL_X - m.min[0]], ['+X', m.max[0] - HULL_X],
      ['-Z', -HULL_Z - m.min[2]], ['+Z', m.max[2] - HULL_Z],
    ].filter(([, v]) => v > TOL);
    if (buried.length || throughHull.length) {
      out.escapes.push({ m, by: throughHull.length ? throughHull : buried, kind: throughHull.length ? 'through hull' : 'centre buried in wall' });
    }
    if (m.min[1] < DECK_Y - 0.05) out.sunk.push({ m, side: 'deck', by: +(DECK_Y - m.min[1]).toFixed(3) });
    if (m.max[1] > CEIL_Y + TOL) out.sunk.push({ m, side: 'ceiling', by: +(m.max[1] - CEIL_Y).toFixed(3) });
  }
  // A large surface carrying no albedo map anywhere reads as a blank painted panel.
  const twoBig = m.size.filter((v) => v > 0.8).length >= 2;
  if (twoBig && m.mats.every((x) => !x.hasMap) && !m.mats.every((x) => x.transparent)) out.untextured.push(m);
}

// Partial interpenetration between two solids. Fully-nested pairs (>90% of the smaller inside the
// larger) are excluded: that is the normal insert pattern — a screen inside its bezel, a lamp lens
// inside its housing — not a clipping bug. Decals, glows and anything thin are excluded too.
const solids = d.meshes.filter((m) => m.visible && !m.instanced && !isDecal(m) && vol(m) > 0.02 && !isShell(m));
for (let i = 0; i < solids.length; i++) {
  for (let j = i + 1; j < solids.length; j++) {
    const a = solids[i], b = solids[j];
    let ov = 1;
    for (let k = 0; k < 3; k++) {
      const w = Math.min(a.max[k], b.max[k]) - Math.max(a.min[k], b.min[k]);
      if (w <= 0) { ov = 0; break; }
      ov *= w;
    }
    if (!ov) continue;
    const frac = ov / Math.min(vol(a), vol(b));
    if (frac > 0.45 && frac < 0.9) out.overlaps.push({ a, b, frac: +frac.toFixed(2) });
  }
}

const fmt = (m) => `#${String(m.rootIdx).padStart(4)} ${m.geom.padEnd(15)} ${m.size.map((v) => v.toFixed(2)).join('x').padEnd(19)} min=[${m.min.map((v) => v.toFixed(2)).join(',')}] ${(m.mats[0]?.name || m.mats[0]?.type || '').padEnd(20)} col=${m.mats[0]?.color}`;

console.log(`=== escapes the room shell (${out.escapes.length}) ===`);
out.escapes.sort((p, q) => Math.max(...q.by.map((x) => x[1])) - Math.max(...p.by.map((x) => x[1])))
  .slice(0, 40).forEach(({ m, by, kind }) => console.log(`  ${kind}: ${by.map(([s, v]) => `${s}+${v.toFixed(2)}`).join(' ')}  ${fmt(m)}`));
console.log(`\n=== through deck / ceiling (${out.sunk.length}) ===`);
out.sunk.sort((p, q) => q.by - p.by).slice(0, 30).forEach(({ m, side, by }) => console.log(`  ${side} by ${by}  ${fmt(m)}`));
console.log(`\n=== deep interpenetration (${out.overlaps.length}) ===`);
out.overlaps.sort((p, q) => q.frac - p.frac).slice(0, 40).forEach(({ a, b, frac }) => console.log(`  ${frac}\n    A ${fmt(a)}\n    B ${fmt(b)}`));
console.log(`\n=== large untextured surfaces (${out.untextured.length}) ===`);
out.untextured.sort((p, q) => (q.size[0] * q.size[1] + q.size[1] * q.size[2] + q.size[0] * q.size[2]) - (p.size[0] * p.size[1] + p.size[1] * p.size[2] + p.size[0] * p.size[2]))
  .slice(0, 40).forEach((m) => console.log(`  ${fmt(m)}`));
console.log(`\nTOTALS escapes=${out.escapes.length} sunk=${out.sunk.length} overlaps=${out.overlaps.length} untextured=${out.untextured.length}`);
