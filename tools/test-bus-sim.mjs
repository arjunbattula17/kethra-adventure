// Tests the ring bus rules in src/planets/vessek/bus.ts: capacity and trips, dependencies,
// auto-resets and lockouts, and the frost clock. Loads the TypeScript module into Node; no browser.
//
//   node tools/test-bus-sim.mjs
import * as B from '../src/planets/vessek/bus.ts';

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
  if (!ok) failed++;
}
const run = (bus, seconds, step = 0.1) => {
  const events = [];
  for (let t = 0; t < seconds; t += step) events.push(...bus.update(step));
  return events;
};

// Before the pulse.
let bus = new B.RingBus();
check('before the pulse the ring runs at 5 of 6 units', bus.load() === 5, `${bus.load()}`);
let e = bus.throwLever('school', true);
check('the school lamps (2) overload it: a trip, everything but the regulator drops', e.kind === 'trip' && bus.load() === 1 && bus.isOn('regulator'));
check('no frost before the pulse: a trip costs nothing', bus.frost.remaining === B.FROST_SECONDS);
run(bus, 30);
check('the auto-reset circuits come back by themselves after a trip', bus.isOn('dock') && bus.isOn('lamps'));
bus = new B.RingBus();
bus.throwLever('fans', false);
e = bus.throwLever('school', true);
check('switch the duct fans off and the school lamps fit: 6 of 6', e.kind === 'on' && bus.load() === 6);
run(bus, 40);
check('with nothing auto-resetting off, the bus holds', bus.isOn('school') && bus.load() === 6 && bus.trips === 0);

// Dependencies.
bus = new B.RingBus();
bus.pulse();
e = bus.throwLever('heaters', true);
check('the heaters refuse without the pumps', e.kind === 'refused' && e.missing.includes('pumps'));
bus.throwLever('pumps', true);
bus.throwLever('heaters', true);
bus.throwLever('pumps', false);
check('switching off the pumps drops the heaters with them', !bus.isOn('heaters'));

// The pulse, and auto-resets tripping the bus.
bus = new B.RingBus();
bus.pulse();
check('the pulse leaves only the regulator', bus.load() === 1 && bus.phase === 'crisis');
// Within 25 s the dock lights and hall lamps reset themselves: 4 units.
let events = run(bus, 25);
check('left alone, the dock lights and hall lamps relight themselves', bus.isOn('dock') && bus.isOn('lamps') && bus.load() === 4, events.map((x) => x.kind + ':' + (x.id ?? '')).join(' '));
bus.throwLever('pumps', true);
const before = bus.frost.remaining;
e = bus.throwLever('heaters', true);
check('so the pumps fit but the heaters trip the bus', e.kind === 'trip' && bus.load() === 1);
check('a trip during the crisis costs the bay warmth', Math.abs(bus.frost.remaining - (before - B.TRIP_PENALTY)) < 1e-6);

// The solution: lock out the auto-resets, then bring up pumps, heaters and scrubbers.
bus = new B.RingBus();
bus.pulse();
bus.lockOut('dock');
bus.lockOut('lamps');
bus.throwLever('pumps', true);
bus.throwLever('heaters', true);
events = run(bus, 40);
check('with both locked out, nothing comes back', !bus.isOn('dock') && !bus.isOn('lamps') && !events.some((x) => x.kind === 'trip'));
bus.throwLever('scrubbers', true);
events = run(bus, 0.5);
check('pumps, heaters and scrubbers in the limit save the bay: exactly 6', events.some((x) => x.kind === 'restored') && bus.load() === 6 && bus.phase === 'restored');
check('and the frost stops', (() => { const r = bus.frost.remaining; run(bus, 10); return bus.frost.remaining === r; })());
// Persuasion 3: the hall lamps are locked out and off before the pulse.
bus = new B.RingBus();
bus.lockOut('lamps');
bus.throwLever('lamps', false);
bus.pulse();
bus.lockOut('dock');
for (const id of ['pumps', 'heaters', 'scrubbers']) bus.throwLever(id, true);
events = run(bus, 1);
check('with the hall lamps locked before the pulse, one lockout and the essentials do it', bus.phase === 'restored' && !bus.isOn('lamps'));
// An auto-reset circuit switched off by hand still resets itself.
bus = new B.RingBus();
bus.pulse();
run(bus, 15);
check('after the pulse the dock lights relight themselves', bus.isOn('dock'));
bus.throwLever('dock', false);
run(bus, 10);
check('switched off by hand, they are back again in a while', !bus.isOn('dock') && (run(bus, 5), bus.isOn('dock')));

// The frost clock and its retry.
bus = new B.RingBus();
bus.pulse();
bus.lockOut('dock');
events = run(bus, B.FROST_SECONDS + 1);
check('when the frost wins, the backup warmers buy another try', events.some((x) => x.kind === 'frostOut') && bus.phase === 'crisis' && bus.frost.remaining > B.FROST_SECONDS - 2);
check('the retry keeps the lockouts already thrown', bus.locked.has('dock'));
check('the goal needs exactly the capacity', B.GOAL.concat(['regulator', 'pumps']).reduce((s, id, i, a) => (a.indexOf(id) === i ? s + B.CIRCUITS[id].load : s), 0) === B.CAPACITY);

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
