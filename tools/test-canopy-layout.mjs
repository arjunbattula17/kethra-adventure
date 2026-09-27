// MG2 Canopy's layout against its design (docs/DESIGN.md §4, slot 2): each layer is a floor with
// one way through, the swaying layer's way opens and closes, pods light every layer, and the final
// drop lands on the pad. Loads the TypeScript module straight into Node; no browser.
//
//   node tools/test-canopy-layout.mjs
import * as c from '../src/planets/kethra/canopy/layout.ts';

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
  if (!ok) failed++;
}

const boughs = c.buildBoughs();
const R = c.SKIFF_RADIUS;
/** Does a vertical drop through (x, z) across the layer at `layer.y` touch a bough at `time`? */
const blocked = (x, z, layer, time) => {
  for (let y = layer.y + 6; y >= layer.y - 6; y -= 0.25) if (c.collide({ x, y, z }, R, boughs, time)) return true;
  return false;
};

for (const layer of c.LAYERS) {
  const { x, z, r } = layer.gap;
  if (layer.kind === 'sway') {
    // "Swaying boughs: timing." The gap is open at some moments and closed at others.
    let open = 0;
    let closed = 0;
    for (let t = 0; t < 12; t += 0.25) blocked(x, z, layer, t) ? closed++ : open++;
    check(`layer ${layer.index + 1} (${layer.kind}): the gap opens and closes as the boughs sway`, open > 0 && closed > 0, `${open} open, ${closed} closed of ${open + closed} moments`);
  } else {
    check(`layer ${layer.index + 1} (${layer.kind}): the gap is open`, !blocked(x, z, layer, 0));
  }
  // Everywhere else the layer is a floor: most drops away from the gap meet a bough.
  let hits = 0;
  let tries = 0;
  for (let k = 0; k < 60; k++) {
    const ang = (k / 60) * Math.PI * 2;
    const d = r + 3 + (k % 5) * 3;
    tries++;
    if (blocked(x + Math.cos(ang) * d, z + Math.sin(ang) * d, layer, 0)) hits++;
  }
  check(`layer ${layer.index + 1}: away from the gap it is a floor`, hits / tries >= 0.6, `${hits} of ${tries} drops hit a bough`);
  const pods = c.podsFor(boughs).filter((p) => p.layer === layer.index).length;
  check(`layer ${layer.index + 1}: pods to light`, pods >= 10, `${pods} pods`);
}

// Between layers the way is open: from one gap to the next is a strafe the skiff can make in the
// time the descent gives it (2.4 m/s down, 7 m/s across at full thrust).
for (let i = 1; i < c.LAYERS.length; i++) {
  const a = c.LAYERS[i - 1];
  const b = c.LAYERS[i];
  const across = Math.hypot(b.gap.x - a.gap.x, b.gap.z - a.gap.z);
  const seconds = (a.y - b.y) / 2.4;
  check(`layer ${i} → ${i + 1}: the next gap is reachable in the descent`, across / seconds < 7 * 0.5, `${across.toFixed(1)} m across in ${seconds.toFixed(0)} s`);
}

// "A narrow final drop into the clearing, where the landing lights wait."
const last = c.LAYERS[c.LAYERS.length - 1];
check('the final drop is the narrowest gap', c.LAYERS.every((l) => l.gap.r >= last.gap.r));
check('the final drop is over the landing pad', Math.hypot(last.gap.x, last.gap.z) < c.LANDING.r);
check('the first layer is the widest', c.LAYERS.every((l) => l.gap.r <= c.LAYERS[0].gap.r));

// A climb back returns above the gap of the layer it names, clear of boughs.
for (let i = 0; i < c.LAYERS.length; i++) {
  const p = c.checkpointFor(i);
  check(`checkpoint above layer ${i + 1} is clear`, !c.collide(p, R, boughs, 0));
}

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
