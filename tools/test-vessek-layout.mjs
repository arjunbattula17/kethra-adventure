// Vessek Anchorage's plan (docs/DESIGN.md §6) against the design: four compartments joined by tubes,
// Dace's ducts as crawl-only shortcuts with ladders and one-way vents, the bus's levers and
// lockouts where the routes reach them, and no way to be shut in a room. Loads the TypeScript module
// straight into Node; no browser.
//
//   node tools/test-vessek-layout.mjs
import * as L from '../src/planets/vessek/layout.ts';
import { PLAYER } from '../src/content/tuning.ts';

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
  if (!ok) failed++;
}

const shell = L.ductShell();
const solid = shell.filter((b) => b.kind !== 'floor');
const inBox = (p, b) => p.x > b.min.x && p.x < b.max.x && p.y > b.min.y && p.y < b.max.y && p.z > b.min.z && p.z < b.max.z;
const crouched = PLAYER.CROUCH_HEIGHT ?? 1.1;

// "Crawl (crouch finally matters) through Dace's ducts."
check('the ducts are too low to stand in', L.DUCT_HEIGHT < PLAYER.PLAYER_HEIGHT, `${L.DUCT_HEIGHT} < ${PLAYER.PLAYER_HEIGHT}`);
check('and high enough to crawl', L.DUCT_HEIGHT > crouched, `${L.DUCT_HEIGHT} > ${crouched}`);
check('and wide enough for the player', L.DUCT_WIDTH > PLAYER.PLAYER_RADIUS * 2 + 0.3);

// Nothing stands across a duct's way, corners included; and its sides are closed.
for (const d of L.DUCTS) {
  let blocked = null;
  let open = null;
  for (const r of d.runs) {
    const len = Math.hypot(r.to.x - r.from.x, r.to.z - r.from.z);
    const ux = (r.to.x - r.from.x) / len;
    const uz = (r.to.z - r.from.z) / len;
    for (let s = 0; s <= len; s += 0.1) {
      const c = { x: r.from.x + ux * s, z: r.from.z + uz * s };
      for (const off of [-PLAYER.PLAYER_RADIUS, 0, PLAYER.PLAYER_RADIUS]) {
        for (const hgt of [0.2, crouched - 0.05]) {
          const p = { x: c.x - uz * off, y: r.from.y + hgt, z: c.z + ux * off };
          if (!blocked && solid.some((b) => inBox(p, b))) blocked = p;
        }
      }
      // A little outside each side, at mid-height, there should be wall (away from the ends).
      if (s > L.DUCT_WIDTH && s < len - L.DUCT_WIDTH) {
        for (const side of [-1, 1]) {
          const q = { x: c.x - uz * side * (L.DUCT_WIDTH / 2 + L.DUCT_WALL / 2), y: r.from.y + 0.6, z: c.z + ux * side * (L.DUCT_WIDTH / 2 + L.DUCT_WALL / 2) };
          if (!open && !solid.some((b) => inBox(q, b))) open = q;
        }
      }
    }
  }
  check(`the ${d.id} duct is clear all the way through, corners included`, !blocked, blocked ? JSON.stringify(blocked) : '');
  // And in through each mouth from the room: from 0.6 m inside the room to 0.6 m into the duct.
  for (const m of d.mouths) {
    const r = d.runs.find((run) => [run.from, run.to].some((p) => L.bayPoint(m.bay).x === p.x || L.bayPoint(m.bay).z === p.z) && run.from.y === m.y);
    const face = L.bayPoint(m.bay);
    const inward = { north: [0, 1], south: [0, -1], west: [1, 0], east: [-1, 0] }[m.bay.wall];
    let wall = null;
    for (let s = -0.6; s <= 0.6; s += 0.05) {
      for (const hgt of [0.2, crouched - 0.05]) {
        const p = { x: (m.bay.wall === 'north' || m.bay.wall === 'south' ? m.bay.at : face.x) - inward[0] * s, y: m.y + hgt, z: (m.bay.wall === 'north' || m.bay.wall === 'south' ? face.z : m.bay.at) - inward[1] * s };
        if (!wall && solid.some((b) => inBox(p, b))) wall = p;
      }
    }
    check(`nothing across the ${d.id} duct's ${m.bay.room} mouth`, !wall && !!r, wall ? JSON.stringify(wall) : '');
  }
  check(`the ${d.id} duct's sides are closed`, !open, open ? JSON.stringify(open) : '');
  for (const m of d.mouths) {
    check(`the ${d.id} duct opens through a plain wall bay of the ${m.bay.room} (${m.bay.wall} ${m.bay.at})`, !L.isCornerBay(m.bay));
    if (m.drop) check(`its ${m.bay.room} end is a drop you can't climb back up (${L.UPPER} m)`, m.y > PLAYER.MAX_STEP_UP && m.y > (PLAYER.JUMP_SPEED ** 2) / (2 * Math.abs(PLAYER.GRAVITY)));
  }
  for (const l of d.ladders) {
    const lower = d.runs.some((r) => r.from.y === 0 && [r.from, r.to].some((p) => Math.abs(p.x - l.x) < 1e-6 && Math.abs(p.z - l.z) < 1e-6));
    const upper = d.runs.some((r) => r.from.y === L.UPPER && Math.abs(r.from.x - l.x) < 1e-6 && Math.abs(r.from.z - l.z) < 1e-6);
    check(`the ${d.id} duct's ladder joins its lower run to its upper one`, lower && upper);
  }
}
for (const t of L.TUBES) check(`the ${t.id} tube joins plain wall bays`, !L.isCornerBay(t.a) && !L.isCornerBay(t.b));
const bays = [...L.TUBES.flatMap((t) => [t.a, t.b]), ...L.DUCTS.flatMap((d) => d.mouths.map((m) => m.bay))];
check('no bay carries two openings', new Set(bays.map((b) => `${b.room}/${b.wall}/${b.at}`)).size === bays.length);

// The bus in the world: every lever inside its room, clear of the walls; each lockout in its duct.
for (const [id, lv] of Object.entries(L.LEVERS)) {
  const f = L.faces(L.ROOMS[lv.room]);
  const r = PLAYER.PLAYER_RADIUS;
  check(`the ${id} lever has room to stand at, inside the ${lv.room}`, lv.at.x > f.x0 + r && lv.at.x < f.x1 - r && lv.at.z > f.z0 + r && lv.at.z < f.z1 - r);
}
for (const lo of L.LOCKOUTS) {
  const d = L.DUCTS.find((x) => x.id === lo.duct);
  const on = d.runs.some((r) => r.from.y === lo.at.y && Math.min(r.from.x, r.to.x) - 0.7 <= lo.at.x && lo.at.x <= Math.max(r.from.x, r.to.x) + 0.7 && Math.min(r.from.z, r.to.z) - 0.7 <= lo.at.z && lo.at.z <= Math.max(r.from.z, r.to.z) + 0.7);
  check(`the ${lo.id} lockout box is in the ${lo.duct} duct`, on);
}

// Routes. Tubes: the tanker hatch seals from the hall's side in the pulse but cranks open from the
// tanker's; the junction's keypad needs the code from the tanker's side and opens from inside.
// Ducts: a drop mouth is one-way out; the short duct is a squeeze (traversal 2).
/** Every place reachable from `from` in a state; `avoid` is a place the route may not pass through. */
function reachable(from, { pulse, code, traversal }, avoid = null) {
  const edges = [];
  for (const t of L.TUBES) {
    const a = t.a.room;
    const b = t.b.room;
    if (t.seal === 'none') edges.push([a, b], [b, a]);
    if (t.seal === 'pulse') { if (!pulse) edges.push([a, b]); edges.push([b, a]); }
    if (t.seal === 'keypad') { if (code) edges.push([a, b]); edges.push([b, a]); }
  }
  for (const d of L.DUCTS) {
    if (d.squeeze && !traversal) continue;
    const [m0, m1] = d.mouths;
    const node = `duct:${d.id}`;
    if (!m0.drop) edges.push([m0.bay.room, node]);
    if (!m1.drop) edges.push([m1.bay.room, node]);
    edges.push([node, m0.bay.room], [node, m1.bay.room]);
  }
  const seen = new Set([from]);
  const todo = [from];
  while (todo.length) {
    const n = todo.pop();
    for (const [a, b] of edges) if (a === n && b !== avoid && !seen.has(b)) { seen.add(b); todo.push(b); }
  }
  return seen;
}
const none = { pulse: false, code: false, traversal: false };
check('Shō: before the pulse, the junction is reachable from the hall with no stats, through the ducts', reachable('hall', none).has('junction'));
const crisis = { ...none, pulse: true };
const r = reachable('hall', crisis);
const places = [...Object.values(L.LEVERS).map((l) => l.room), ...L.LOCKOUTS.map((l) => `duct:${l.duct}`)];
check('Ketsu: in the pulse, every lever and both lockouts are reachable from the hall with no stats', places.every((p) => r.has(p)), [...r].join(', '));
const deadEnds = [];
for (const room of Object.keys(L.ROOMS)) {
  for (const stats of [crisis, { ...crisis, code: true, traversal: true }, none]) {
    if (!reachable(room, stats).has('hall')) deadEnds.push(`${room} ${JSON.stringify(stats)}`);
  }
}
check('no room is a dead end: from each, in every state, there is a way back to the hall', deadEnds.length === 0, deadEnds.join('; '));
// "Stats change the route, not whether you can win": traversal 2 opens the short duct, insight 2
// trades for the aft junction's code. Without either, the way from the tanker to the junction runs
// back through the hall; with either, it doesn't.
check('with no stats, the tanker reaches the junction only back through the hall', !reachable('tanker', crisis, 'hall').has('junction'));
check('traversal 2 opens a way from the tanker to the junction that skips the hall', reachable('tanker', { ...crisis, traversal: true }, 'hall').has('junction'));
check('so does the junction code (insight 2)', reachable('tanker', { ...crisis, code: true }, 'hall').has('junction'));

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
