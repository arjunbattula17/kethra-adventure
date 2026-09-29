// The ring bus's rules under abuse, in Node (no browser): seeded random lever sequences checked
// against the invariants every step, plus the exact sequences behind VES-3 and VES-6.
//   node stress_tests/bus-rules.mjs
import { RingBus, CIRCUITS, CIRCUIT_IDS, CAPACITY } from '../src/planets/vessek/bus.ts';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`); if (!ok) failed++; };
const run = (bus, seconds, dt = 0.05) => { const ev = []; for (let t = 0; t < seconds; t += dt) ev.push(...bus.update(dt)); return ev; };
const AUTO = CIRCUIT_IDS.filter((id) => CIRCUITS[id].autoReset > 0);

// VES-3. The regulator off while an auto-reset's timer runs out must not cancel that reset for good:
// the self-resetting lamps are the crisis's whole problem.
{
  const bus = new RingBus();
  bus.pulse();
  bus.throwLever('regulator', false);
  run(bus, 23);
  bus.throwLever('regulator', true);
  const pending = AUTO.filter((id) => !bus.isOn(id) && !bus.locked.has(id) && !bus.timers.has(id));
  check('VES-3: every auto-reset circuit that is off and not locked still has a timer after the regulator returns', pending.length === 0, pending.length ? `no timer: ${pending.join(', ')}` : '');
  for (const id of ['pumps', 'heaters', 'scrubbers']) bus.throwLever(id, true);
  const ev = run(bus, 30);
  check('VES-3: so pumps, heaters and scrubbers without the lockouts still trip when the lamps come back', ev.some((e) => e.kind === 'trip') || bus.phase !== 'restored', `phase ${bus.phase}, trips ${bus.trips}`);
}

// VES-6. A trip inside update() re-arms every auto-reset; the same update must not then overwrite
// those fresh timers with values from before the trip.
{
  const bus = new RingBus();
  bus.pulse();
  run(bus, 23); // both self-resetting circuits come back on
  bus.throwLever('dock', false);
  bus.throwLever('lamps', false);
  for (const id of ['school', 'fans', 'pumps']) bus.throwLever(id, true); // 6 of 6 units
  const trips = bus.trips;
  let lampsAfterTrip = null;
  for (let t = 0; t < 16 && lampsAfterTrip === null; t += 0.05) {
    bus.update(0.05);
    if (bus.trips > trips) lampsAfterTrip = bus.timers.get('lamps');
  }
  check('VES-6: after the dock trips the bus, the lamps restart their full 22 s count', lampsAfterTrip !== null && lampsAfterTrip > 21.5, `lamps timer ${lampsAfterTrip?.toFixed(2)}`);
}

// Seeded fuzz: random levers, lockouts, pulses and dts; the invariants after every step.
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const broken = new Map();
const note = (what, seed) => { if (!broken.has(what)) broken.set(what, seed); };
for (let seed = 1; seed <= 2000; seed++) {
  const r = mulberry32(seed);
  const bus = new RingBus();
  for (let step = 0; step < 400; step++) {
    const x = r();
    const id = CIRCUIT_IDS[Math.floor(r() * CIRCUIT_IDS.length)];
    if (x < 0.4) bus.throwLever(id, r() < 0.6);
    else if (x < 0.45) bus.lockOut(id);
    else if (x < 0.47 && bus.phase === 'normal') bus.pulse();
    else bus.update([0.016, 0.1, 1, 5][Math.floor(r() * 4)]);
    if (bus.load() > CAPACITY) note('load over capacity', seed);
    for (const on of bus.on) if (CIRCUITS[on].needs.some((n) => !bus.on.has(n))) note(`${on} on without its needs`, seed);
    for (const l of bus.locked) if (bus.timers.has(l)) note('a locked circuit has a timer', seed);
    for (const a of AUTO) if (!bus.on.has(a) && !bus.locked.has(a) && !bus.timers.has(a) && bus.phase !== 'restored') note('an off, unlocked auto-reset has no timer', seed);
    if (!Number.isFinite(bus.frost.remaining) || bus.frost.remaining > bus.frost.total) note('frost out of range', seed);
  }
}
check('fuzz: 2000 seeds x 400 steps keep every invariant', broken.size === 0, [...broken].map(([w, s]) => `${w} (seed ${s})`).join('; '));

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
