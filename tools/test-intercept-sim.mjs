// MG1 Intercept's model against its design (docs/DESIGN.md §4, slot 1): every leg has an answer,
// the ramp teaches what it says it teaches, and leg 3 really needs the third dimension. Loads the
// TypeScript module straight into Node (type stripping, Node 23.6+); no browser.
//
//   node tools/test-intercept-sim.mjs
import * as s from '../src/galaxy/intercept/sim.ts';

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
  if (!ok) failed++;
}

const wall = s.beltWall();
const [leg1, leg2, leg3] = s.legs(1);
const cellsOf = (plan) => plan.reduce((n, b) => n + b.cells, 0);

// "d = v·t, visible": one tick a day, 8 Mkm apart.
{
  const plan = [{ dir: s.direction(0.3, 0.1), cells: 2 }];
  const a = s.wrenAt(leg1, plan, 1).at;
  const b = s.wrenAt(leg1, plan, 2).at;
  check('ticks are one day and 8 Mkm apart', Math.abs(s.dist(a, b) - 8) < 1e-9, s.dist(a, b).toFixed(3));
}

// Leg 1, "Clear the drift. Aim at ORION's buoy, a static target."
{
  const plan = s.solution(leg1);
  const o = s.simulate(leg1, plan, wall);
  check('leg 1: the buoy can be reached', o.kind === 'arrive', `${o.kind} on day ${o.day.toFixed(2)}, ${cellsOf(plan)} cell`);
}

// Leg 2, "Aiming at where Kethra is misses. The sim stops and labels it."
{
  const naive = [{ dir: s.norm(s.sub(s.orbitAt(s.KETHRA, leg2.startDay), leg2.start)), cells: leg2.budget }];
  const o = s.simulate(leg2, naive, wall);
  check('leg 2: aiming at where Kethra is now misses', o.kind === 'miss' && o.distance > 3 * s.CAPTURE, `${o.kind}, ${o.distance?.toFixed(1)} Mkm off`);
  const plan = s.solution(leg2);
  const hit = s.simulate(leg2, plan, wall);
  check('leg 2: leading Kethra meets it', hit.kind === 'arrive', `day ${hit.day.toFixed(2)}, ${cellsOf(plan)} cells`);
  check('leg 2: the lead is the six-day, 48 Mkm transfer the chart quotes', Math.abs(s.leadTo(leg2.start, leg2.startDay).day - leg2.startDay - 6) < 0.1);
  // "Kethra's orbit is inclined, so elevation already matters."
  const flat = { dir: s.norm({ ...plan[0].dir, y: 0 }), cells: plan[0].cells };
  check('leg 2: the same aim flattened into the plane misses', s.simulate(leg2, [flat], wall).kind !== 'arrive');
}

// Leg 3, "The straight route crosses a dense clump that you only see side-on."
{
  const straight = s.solution(leg2);
  const o = s.simulate(leg3, straight, wall);
  check("leg 3: leg 2's straight route runs into the belt", o.kind === 'contact', `${o.kind} on day ${o.day.toFixed(2)}`);
  // One burn has one lead; with it blocked, no single burn gets there. Sampled across the sphere.
  let single = 0;
  for (let i = 0; i < 1500; i++) {
    const az = (i * 2.399963) % (Math.PI * 2);
    const el = Math.asin(1 - (2 * (i + 0.5)) / 1500);
    for (let cells = 1; cells <= leg3.budget; cells++) if (s.simulate(leg3, [{ dir: s.direction(az, el), cells }], wall).kind === 'arrive') single++;
  }
  check('leg 3: no single burn arrives (1,500 directions × every cell count)', single === 0, `${single} found`);
  // "Leg 3 has no solution in the plane": every crossing of the belt at y = 0 is inside a clump.
  let gaps = 0;
  for (let i = 0; i < 3600; i++) {
    const a = (i / 3600) * Math.PI * 2;
    for (const r of [s.BELT_RADIUS - 1, s.BELT_RADIUS, s.BELT_RADIUS + 1]) {
      const p = { x: r * Math.cos(a), y: 0, z: r * Math.sin(a) };
      if (!wall.some((c) => s.dist(p, c.c) < c.r)) gaps++;
    }
  }
  check('leg 3: the belt has no gap in the plane', gaps === 0, `${gaps} open points`);
  // "Pitch the burn over it, and pay the extra day out of the cell budget (four, or five with
  // engineering 2)."
  const plan = s.solution(leg3);
  const hit = s.simulate(leg3, plan, wall);
  check('leg 3: a hop over the belt, then the lead, arrives', hit.kind === 'arrive', `day ${hit.day.toFixed(2)}, cells ${plan.map((b) => b.cells).join('+')}`);
  check('leg 3: a plain climb over costs one more cell than the straight lead', cellsOf(plan) === cellsOf(straight) + 1);
  check('leg 3: that fits the base budget of four', cellsOf(plan) <= 4 && leg3.budget === 4);
  // Under is not an answer: Kethra is above the plane, so a dive has to climb back through the belt.
  const toward = s.anglesOf(s.sub(s.orbitAt(s.KETHRA, leg3.startDay + 7), leg3.start));
  let under = 0;
  for (let e = -70; e <= -5; e += 5) {
    const hop = { dir: s.direction(toward.azimuth, (e * Math.PI) / 180), cells: 1 };
    const top = s.add(leg3.start, s.scale(hop.dir, s.SPEED * s.DAYS_PER_CELL));
    const lead = s.leadTo(top, leg3.startDay + s.DAYS_PER_CELL).dir;
    for (let cells = 1; cells <= leg3.budget - 1; cells++) if (s.simulate(leg3, [hop, { dir: lead, cells }], wall).kind === 'arrive') under++;
  }
  check('leg 3: "pitch the burn over it": diving under never arrives', under === 0, `${under} found`);
  const over = s.wrenAt(leg3, plan, leg3.startDay + s.DAYS_PER_CELL).at;
  check('leg 3: the reference goes over, not around', over.y > 3, `top of the hop at y = ${over.y.toFixed(1)}`);
}

// Stats: "engineering 2: one spare cell".
check('engineering 2 adds a spare cell', s.legs(2)[2].budget === 5 && s.legs(1)[2].budget === 4);

// "Fail: the sim stops at the miss or contact ... and labels what went wrong and by how much."
{
  const o = s.simulate(leg3, s.solution(leg2), wall);
  check('a contact reports the day it happened', o.kind === 'contact' && o.day > leg3.startDay && o.day < s.endDay(leg3, s.solution(leg2)));
}

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
