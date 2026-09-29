// Endurance: many round trips Wren -> planet -> Wren (debug jumps, the same guarded transitions the
// game uses) and restarts of a level, measuring what should come back to the same level each lap:
// JS heap, GPU geometries/textures/programs, event-bus listeners, window listeners, DOM nodes.
//   node stress_tests/s04-endurance.mjs [laps]
import { launch, openPage, check, clean, failures, settled } from './lib.mjs';

const LAPS = Number(process.argv[2] ?? 6);
/** 'both' alternates Kethra and Vessek; 'kethra' or 'vessek' repeats one planet. */
const ONLY = process.argv[3] ?? 'both';
const browser = await launch();
const { page, context, errors } = await openPage(browser, '?newGame=1&skipIntro=1&unlockVessek=1&tier=low&seed=11', {
  init: {
    // Counts window/document listeners as they are added and removed.
    fn: () => {
      const live = (window.__LISTENERS__ = { n: 0 });
      for (const T of [Window.prototype, Document.prototype]) {
        const add = T.addEventListener;
        const rem = T.removeEventListener;
        const seen = new WeakMap();
        T.addEventListener = function (type, fn, opts) {
          if (fn && !(seen.get(fn)?.has(type))) { live.n++; if (!seen.has(fn)) seen.set(fn, new Set()); seen.get(fn).add(type); }
          return add.call(this, type, fn, opts);
        };
        T.removeEventListener = function (type, fn, opts) {
          if (fn && seen.get(fn)?.has(type)) { live.n--; seen.get(fn).delete(type); }
          return rem.call(this, type, fn, opts);
        };
      }
    },
    arg: null,
  },
});
await settled(page, 'ShipInteriorScene');
await page.evaluate(() => window.__DEBUG__.flow.tutorial?.skip?.());
await page.waitForTimeout(2000);

const cdp = await context.newCDPSession(page);
async function sample(label) {
  await cdp.send('HeapProfiler.collectGarbage');
  await page.waitForTimeout(500);
  // performance.memory is bucketed in Chromium without a flag; the CDP figure is exact.
  const { usedSize } = await cdp.send('Runtime.getHeapUsage');
  const s = await page.evaluate((used) => {
    const D = window.__DEBUG__;
    const info = D.engine.renderer.info;
    let bus = 0;
    for (const set of D.bus.listeners.values()) bus += set.size;
    return {
      heapMB: +(used / 1048576).toFixed(1),
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs?.length ?? 0,
      bus,
      winListeners: window.__LISTENERS__.n,
      dom: document.getElementsByTagName('*').length,
    };
  }, usedSize);
  console.log(`  ${label.padEnd(18)} ${JSON.stringify(s)}`);
  return s;
}

const go = async (target, k) => {
  const ok = await page.evaluate((t) => window.__DEBUG__.flow.debugGo(t), target);
  await settled(page, k);
  await page.waitForTimeout(2500);
  return ok;
};
const laps = [];
laps.push(await sample('start (Wren)'));
for (let i = 1; i <= LAPS; i++) {
  const planet = ONLY === 'both' ? (i % 2 ? 'kethra' : 'vessek') : ONLY;
  await go(planet, planet === 'kethra' ? 'KethraScene' : 'VessekScene');
  if (i === 3) {
    // A level restart mid-lap, as the pause menu offers it.
    await page.evaluate(() => window.__DEBUG__.flow.restartLevel());
    await page.waitForTimeout(1000);
    await settled(page, planet === 'kethra' ? 'KethraScene' : 'VessekScene');
    await page.waitForTimeout(2000);
  }
  await go('wren', 'ShipInteriorScene');
  laps.push(await sample(`lap ${i} (Wren)`));
}

// Compare the Wren after the second lap with the Wren after the last: steady state, not warm-up.
const a = laps[2];
const b = laps[laps.length - 1];
const grew = (k, slack) => b[k] - a[k] > slack;
check('heap does not keep growing across trips', !grew('heapMB', 15), `${a.heapMB} -> ${b.heapMB} MB`);
check('GPU geometries do not keep growing', !grew('geometries', 20), `${a.geometries} -> ${b.geometries}`);
check('GPU textures do not keep growing', !grew('textures', 10), `${a.textures} -> ${b.textures}`);
check('shader programs do not keep growing', !grew('programs', 10), `${a.programs} -> ${b.programs}`);
check('event-bus listeners do not keep growing', !grew('bus', 0), `${a.bus} -> ${b.bus}`);
check('window/document listeners do not keep growing', !grew('winListeners', 0), `${a.winListeners} -> ${b.winListeners}`);
check('DOM nodes do not keep growing', !grew('dom', 30), `${a.dom} -> ${b.dom}`);
await clean(page, errors, `${LAPS} round trips and a restart`);
await context.close();
await browser.close();
console.log(failures() ? `\n${failures()} failed` : '\nall passed');
process.exit(failures() ? 1 : 0);
