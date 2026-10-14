// Unit test of the Intercept model (src/galaxy/intercept/sim.ts): the chart offers Kethra's next ten
// days as markers, exactly one is a real intercept, the whole-day numbers the chart compares agree
// only there, and the likely first try (Kethra's current position) misses. Loads the TypeScript
// module straight into Node (type stripping, Node 23.6+); no browser.
//
//   node tools/test-intercept-sim.mjs
import * as s from '../src/galaxy/intercept/sim.ts';

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
  if (!ok) failed++;
}

// One tick per day, 8 Mkm apart.
{
  const dir = s.norm(s.sub(s.kethraAt(6), s.TRANSFER_START));
  const a = s.transferAt(dir, 1);
  const b = s.transferAt(dir, 2);
  check('ticks are one day and 8 Mkm apart', Math.abs(s.dist(a, b) - 8) < 1e-9, s.dist(a, b).toFixed(3));
}

// ORION's hop: out of the drift to the buoy, one cell, two days.
check('the hop reaches the buoy in two days (16 Mkm at cruise)', s.dist(s.hopAt(s.HOP_DAYS), s.BUOY) < 1e-9 && Math.abs(s.dist(s.WREN_START, s.BUOY) - s.SPEED * s.HOP_DAYS) < 1e-9);

const all = s.meetings();
check('the chart offers Kethra now plus ten days', all.length === s.MAX_MEET_DAY + 1 && all[0].day === 0 && all.at(-1).day === 10);

// The natural first try: Kethra where it is now.
{
  const now = all[0];
  check('Kethra-now is not a match', !s.matches(now), `we need ${now.wrenDays.toFixed(2)} days`);
  const o = s.fly(now.at, now.wrenDays);
  check('flying at Kethra-now misses it by a wide margin', o.kind === 'miss' && o.distance > 5 * s.CAPTURE, `${o.kind}, ${o.distance.toFixed(1)} Mkm off`);
}

// Exactly one answer, and it's the 48 Mkm, six-day transfer the galaxy map and the cruise quote.
{
  const hits = all.filter(s.matches);
  check('exactly one meeting day matches', hits.length === 1, hits.map((m) => m.day).join(','));
  const m = hits[0];
  check('the match is day 6, 48 Mkm', m?.day === 6 && Math.abs(m.distance - 48) < 0.5, m ? `day ${m.day}, ${m.distance.toFixed(2)} Mkm, ${m.wrenDays.toFixed(3)} days` : 'none');
  const nearest = Math.min(...all.filter((x) => x !== m).map((x) => Math.abs(x.wrenDays - x.day)));
  check('every other day is clearly off (> 0.5 day)', nearest > 0.5, `closest miss ${nearest.toFixed(2)} days`);
  // Later ticks are always further along the orbit than the Wren can make up: early and late are
  // on either side of the match, so the plate's "sooner" and "later" nudges always point the right way.
  check('before the match the Wren is late, after it early', all.every((x) => x.day === m.day || (x.day < m.day ? x.wrenDays > x.day : x.wrenDays < x.day)));
}

// The chart's two numbers: our arrival day (whole days, d = v·t) and Kethra's day at the marker.
{
  const agree = all.filter((m) => s.arrivalDay(m.wrenDays) === m.day).map((m) => m.day);
  check('the chart’s whole-day numbers agree only on the match', agree.length === 1 && agree[0] === 6, agree.join(','));
  const ours = [...new Set(all.map((m) => s.arrivalDay(m.wrenDays)))];
  check('our arrival day barely moves along the path (5 to 7)', Math.min(...ours) >= 5 && Math.max(...ours) <= 7, ours.join(','));
  const n = s.orbitNormal(s.KETHRA);
  const off = Math.max(...all.map((m) => Math.abs(m.at.x * n.x + m.at.y * n.y + m.at.z * n.z)));
  check('every marker lies on Kethra’s orbital plane, where the free handle slides', off < 1e-9 && Math.abs(Math.hypot(n.x, n.y, n.z) - 1) < 1e-9, off.toExponential(1));
  check('every marker is within the handle’s reach', all.every((m) => m.distance > s.MIN_REACH && m.distance < s.MAX_REACH));
  check('arrivalDays is distance over cruise speed', Math.abs(s.arrivalDays(all[6].at) - all[6].distance / s.SPEED) < 1e-12);
}

// The committed course really arrives.
{
  const i = s.intercept();
  check('the exact intercept is the six-day transfer', Math.abs(i.days - 6) < 0.05, i.days.toFixed(3));
  const o = s.fly(i.at, i.days + 0.5);
  check('flying the intercept meets Kethra', o.kind === 'arrive', `${o.kind} on day ${o.day.toFixed(2)}`);
  check('the whole plot spends four cells (one hop, three for the transfer)', s.cellsFor(Math.round(i.days)) === 4, String(s.cellsFor(Math.round(i.days))));
  // Kethra's orbit is inclined: the course climbs out of the ecliptic on its way there.
  check('the course climbs above the ecliptic', i.at.y > 1, `ends ${i.at.y.toFixed(2)} Mkm above the plane`);
}

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
