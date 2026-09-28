// MG3 Hush's chamber and rules against the design (docs/DESIGN.md §4, slot 3): light draws the
// moth, hooding hides you, cover is real (line of sight, not distance), height matters, crossing
// the open floor is timing, and the Rite can only be breathed while it looks away. Loads the
// TypeScript module straight into Node; no browser.
//
//   node tools/test-hush-sim.mjs
import * as h from '../src/planets/kethra/hush/sim.ts';

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
  if (!ok) failed++;
}

const blocks = h.chamberBlocks();
const P = h.PERCHES;
const RADIUS = 0.35; // the player's (src/content/tuning.ts)
const at = (x, z) => ({ x, y: h.FLOOR_Y, z });
/** Over one full sweep of `perch`, how many moments see a light of `strength` at `p`? */
function seenMoments(perch, p, strength) {
  let seen = 0;
  const n = 120;
  for (let i = 0; i < n; i++) if (h.sees(h.gazeFrom(perch, (i / n) * perch.period), p, strength, blocks)) seen++;
  return { seen, n, some: seen > 0 && seen < n, never: seen === 0 };
}
/** Feet pressed against `block` on its far side from `from`, as close as the player's body allows. */
function behind(block, from, gap = RADIUS + 0.01) {
  const dx = block.x - from.x;
  const dz = block.z - from.z;
  const d = Math.hypot(dx, dz);
  for (let t = 0; t < 6; t += 0.01) {
    const p = at(block.x + (dx / d) * t, block.z + (dz / d) * t);
    if (!h.insideFootprint(p, block, gap)) return p;
  }
  throw new Error('no far side');
}
const blockAt = (kind, x, z) => blocks.filter((b) => b.kind === kind).sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0];
const clear = (p, margin) => !blocks.some((b) => b.kind !== 'roof' && h.insideFootprint(p, b, margin));

// --- The chamber ------------------------------------------------------------------------------
check('the door is open: from the approach ramp into the chamber there is line of sight', h.lineOfSight({ x: 0, y: 3, z: -8 }, { x: 0, y: 3, z: -13 }, blocks));
let sealed = true;
for (let i = 0; i < 72; i++) {
  const a = (i / 72) * Math.PI * 2;
  const gap = Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2)));
  if (gap < h.DOOR_HALF_ANGLE + 0.12) continue;
  const out = { x: h.CENTER.x + Math.cos(a) * (h.RADIUS + 2), y: h.FLOOR_Y + 1, z: h.CENTER.z + Math.sin(a) * (h.RADIUS + 2) };
  if (h.lineOfSight({ x: h.CENTER.x + Math.cos(a) * (h.RADIUS - 0.5), y: h.FLOOR_Y + 1, z: h.CENTER.z + Math.sin(a) * (h.RADIUS - 0.5) }, out, blocks)) sealed = false;
}
check('the wall ring is closed everywhere but the door', sealed);
for (const post of h.POSTS) check(`the ${post.id} post leaves room to stand`, clear(post.at, RADIUS));
check('the singer’s place leaves room to stand', clear(h.SINGER, RADIUS));
for (const [i, g] of h.GLOWCAPS.entries()) check(`glowcap ${i + 1} is on open floor`, clear(g, 0.2));
for (const p of Object.values(P)) {
  const d = Math.hypot(p.at.x - h.CENTER.x, p.at.z - h.CENTER.z);
  check(`the ${p.id} perch is inside the chamber, above the floor`, d < h.RADIUS + 0.5 && p.at.y > h.FLOOR_Y);
}
const roof = blocks.find((b) => b.kind === 'roof');
check('the tunnels are walked through standing: headroom over the player’s 1.8', roof.y0 - h.FLOOR_Y >= 1.85, `${(roof.y0 - h.FLOOR_Y).toFixed(2)}`);
check('a tunnel’s middle is open floor', clear(at(roof.x, roof.z), RADIUS));
// The rim is open north, east and west: walk through each gap.
for (const [name, a] of [['north', Math.PI / 2], ['east', 0], ['west', Math.PI]]) {
  const p = at(h.CENTER.x + Math.cos(a) * h.RIM_RADIUS, h.CENTER.z + Math.sin(a) * h.RIM_RADIUS);
  check(`the rim’s ${name} gap can be walked through`, clear(p, RADIUS));
}

// --- 1. "One glowcap and a distant moth. Brush it, the moth turns, then settles." -------------
const g0 = { ...h.GLOWCAPS[0], y: h.FLOOR_Y + 0.3 };
check('the first glowcap is in the far moth’s sight and range, so a flare turns it', h.lineOfSight(P.arch.at, g0, blocks) && Math.hypot(g0.x - P.arch.at.x, g0.y - P.arch.at.y, g0.z - P.arch.at.z) < P.arch.range);
const pathIn = h.lanternAt(at(1.2, -12.2), false);
let r = seenMoments(P.arch, pathIn, h.LIGHT.open);
check('an open lantern on the path in is seen for part of the sweep', r.some, `${r.seen}/${r.n}`);
check('the same lantern hooded is never seen', seenMoments(P.arch, pathIn, h.LIGHT.hooded).never);

// --- 2. "Cross the open floor between its sweeps. Timing." -----------------------------------
r = seenMoments(P.arch, h.lanternAt(at(5.2, -13.2), false), h.LIGHT.open);
check('the open floor is swept: seen some of the time, not all', r.some, `${r.seen}/${r.n}`);
// "Crouch finally matters": against a root mound, crouched you are hidden from the arch; standing, not.
for (const [x, z] of h.MOUNDS.slice(0, 2)) {
  const feet = behind(blockAt('mound', x, z), P.arch.at);
  check(`crouched behind the mound at (${x}, ${z}), the arch cannot see you`, seenMoments(P.arch, h.lanternAt(feet, true), h.LIGHT.open).never);
  check(`standing there, it can`, seenMoments(P.arch, h.lanternAt(feet, false), h.LIGHT.open).seen > 0);
}

// --- 3. "It moves to the high perch and sees over low cover. Use the root tunnels and the basin
//        rim: height matters." ---------------------------------------------------------------
for (const z of [-16, -19.5, -23]) {
  const tunnel = h.lanternAt(at(roof.x, z), false);
  check(`inside a root tunnel (z ${z}), standing with the lantern open, the ledge cannot see you`, seenMoments(P.ledge, tunnel, h.LIGHT.open).never);
}
for (const [x, z] of h.MOUNDS.slice(2)) {
  const feet = behind(blockAt('mound', x, z), P.ledge.at);
  r = seenMoments(P.ledge, h.lanternAt(feet, true), h.LIGHT.open);
  check(`crouched behind the south mound at (${x}, ${z}), the ledge still sees you`, r.seen > 0, `${r.seen}/${r.n}`);
}
for (const a of [-Math.PI / 2 - 0.62, -Math.PI / 2 + 0.62, -Math.PI / 2 - 1.0]) {
  const piece = blockAt('rim', h.CENTER.x + Math.cos(a) * h.RIM_RADIUS, h.CENTER.z + Math.sin(a) * h.RIM_RADIUS);
  const feet = behind(piece, P.ledge.at);
  check(`crouched against the rim’s far side at (${feet.x.toFixed(1)}, ${feet.z.toFixed(1)}), the ledge cannot see you`, seenMoments(P.ledge, h.lanternAt(feet, true), h.LIGHT.open).never);
}
r = seenMoments(P.ledge, h.lanternAt(at(1.2, -25.5), true), h.LIGHT.open);
check('inside the rim there is no hiding from the ledge', r.seen > 0, `${r.seen}/${r.n}`);

// --- 4. "The Rite at the call-stone ... you breathe only while it's turned away." -------------
for (const id of h.RITE_PERCHES) {
  r = seenMoments(P[id], h.BREATH_AT, h.LIGHT.breath);
  check(`from the ${id} perch, a breath at the stone is seen some of the time, not all`, r.some, `${r.seen}/${r.n}`);
}
check('each breath draws it a step closer', h.RITE_PERCHES.every((id, i, a) => i === 0 || Math.hypot(P[id].at.x - h.SINGER.x, P[id].at.z - h.SINGER.z) < Math.hypot(P[a[i - 1]].at.x - h.SINGER.x, P[a[i - 1]].at.z - h.SINGER.z)));

// --- The moth ---------------------------------------------------------------------------------
const DT = 1 / 30;
function run(moth, seconds, sense, onFrame) {
  const log = [];
  for (let t = 0; t < seconds; t += DT) {
    const s = typeof sense === 'function' ? sense(t, moth) : sense;
    const ev = moth.update(DT, s);
    if (log[log.length - 1]?.mode !== moth.mode) log.push({ t, mode: moth.mode });
    if (ev) log.push({ t, mode: ev });
    if (onFrame?.(t, moth, ev)) break;
  }
  return log;
}
const feetA = at(1.2, -12.2);
const openAt = (feet) => ({ lantern: h.lanternAt(feet, false), strength: h.LIGHT.open, feet, flares: [] });

// "Light in its gaze draws it ... with a readable wing-beat of anticipation first. If it reaches
// you it fans its wings, and a gust carries you back."
let moth = new h.Moth(P.arch, blocks);
let log = run(moth, 30, openAt(feetA), (t, m, ev) => ev === 'gust');
const modes = log.map((e) => e.mode);
check('an open lantern left in its gaze brings it: notice, then glide, then a gust', modes.indexOf('notice') >= 0 && modes.indexOf('notice') < modes.indexOf('glide') && modes.includes('gust'), modes.join(' > '));
const lift = log.find((e) => e.mode === 'glide');
const notice = log.find((e) => e.mode === 'notice');
check('the wing-beat of anticipation lasts about half a second', lift && notice && Math.abs(lift.t - notice.t - h.NOTICE_TIME) < 0.1);

// Hood and move once it lifts off: it misses, searches, and goes home.
moth = new h.Moth(P.arch, blocks);
let hoodedAt = null;
let feet = { ...feetA };
log = run(moth, 30, (t, m) => {
  if (!hoodedAt && m.mode === 'glide') hoodedAt = t;
  if (hoodedAt) feet = at(feetA.x + Math.min(3.4, (t - hoodedAt) * 1.7), feetA.z);
  return { lantern: h.lanternAt(feet, false), strength: hoodedAt ? h.LIGHT.hooded : h.LIGHT.open, feet, flares: [] };
});
check('hood and step aside once it lifts off: no gust', !log.some((e) => e.mode === 'gust'), log.map((e) => e.mode).join(' > '));
check('it searches where it last saw the light, then flies home to its perch', log.some((e) => e.mode === 'search') && moth.mode === 'perched' && Math.hypot(moth.pos.x - P.arch.at.x, moth.pos.z - P.arch.at.z) < 0.01);

// A flare turns it; with your lantern hooded, it settles.
moth = new h.Moth(P.arch, blocks);
const hooded = { lantern: h.lanternAt(feetA, false), strength: h.LIGHT.hooded, feet: feetA, flares: [] };
let turned = false;
log = run(moth, 12, (t) => (Math.abs(t - 1) < DT / 2 ? { ...hooded, flares: [{ at: g0, strength: h.LIGHT.flare }] } : hooded), (t, m) => {
  if (t > 1 && t < 1 + h.ATTENTION_TIME) {
    const d = m.gaze().dir;
    const to = { x: g0.x - m.pos.x, y: g0.y - m.pos.y, z: g0.z - m.pos.z };
    const len = Math.hypot(to.x, to.y, to.z);
    if ((d.x * to.x + d.y * to.y + d.z * to.z) / len > Math.cos(0.1)) turned = true;
  }
});
check('brushing a glowcap turns its gaze onto the flare', turned);
check('with your lantern hooded it settles: it never lifts off', log.every((e) => e.mode === 'perched') && moth.attention === null);

// "Each breath flares through the Heart ... so you breathe only while it's turned away."
const breath = [{ at: h.BREATH_AT, strength: h.LIGHT.breath, breath: true }];
const stoneSense = { lantern: h.lanternAt(h.SINGER, false), strength: h.LIGHT.hooded, feet: h.SINGER, flares: [] };
for (const want of [true, false]) {
  moth = new h.Moth(P.rim, blocks);
  run(moth, 20, stoneSense, (t, m) => h.sees(m.gaze(), h.BREATH_AT, h.LIGHT.breath, blocks) === want);
  moth.update(DT, { ...stoneSense, flares: breath });
  check(want ? 'a breath while it looks at the stone startles it straight into a glide' : 'a breath while it looks away goes unseen', want ? moth.mode === 'glide' : moth.mode === 'perched');
}

// Moving between perches is a flight, not a jump.
moth = new h.Moth(P.arch, blocks);
moth.moveTo(P.ledge);
const start = { ...moth.pos };
run(moth, 1, hooded);
const mid = { ...moth.pos };
run(moth, 20, hooded, (t, m) => m.mode === 'perched');
check('sent to the ledge it flies there, arriving perched', moth.mode === 'perched' && Math.hypot(moth.pos.x - P.ledge.at.x, moth.pos.y - P.ledge.at.y, moth.pos.z - P.ledge.at.z) < 0.01 && Math.hypot(mid.x - start.x, mid.z - start.z) > 0.2);

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
