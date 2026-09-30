// CPU profile of the page's main thread over one trip from the Wren (the departure, the cruise and the
// destination's preparation), summarised by function: where the long tasks in a trip come from. Run it
// against the Vite dev server, whose modules keep their function names.
//
//   npx vite --port 5199   (in another terminal)
//   node tools/cpu-profile-trip.mjs [baseUrl] [--to=vessek|kethra]
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const [BASE = 'http://localhost:5199/kethra-adventure/'] = args.filter((a) => !a.startsWith('--'));
const TO = args.find((a) => a.startsWith('--to='))?.split('=')[1] ?? 'vessek';
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--use-angle=d3d11', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const query = TO === 'vessek' ? '?newGame=1&unlockVessek=1&skipIntro=1' : '?newGame=1&unlockKethra=1&skipIntro=1';
await page.goto(`${BASE}${query}`);
await page.waitForFunction(() => window.__DEBUG__?.flow.state === 'wren' && !window.__DEBUG__.flow.isTransitioning(), null, { timeout: 600000, polling: 250 });
await page.evaluate(() => {
  window.__DEBUG__.gameState.setFlag('first_light');
  window.__DEBUG__.gameState.setFlag('canopy_flown');
});
await page.waitForTimeout(3000);
const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 250 });
await cdp.send('Profiler.start');
const t0 = Date.now();
await page.evaluate((to) => window.__DEBUG__.bus.emit('galaxy:travel_to', to), TO);
const kind = TO === 'vessek' ? 'VessekScene' : 'KethraScene';
// The destination is prepared during the cruise; stop once its preparation is done.
await page.waitForFunction((k) => {
  const spans = performance.getEntriesByType('measure').map((m) => m.name);
  return spans.includes(`${k}:firstDraw`);
}, kind, { timeout: 600000, polling: 250 });
const { profile } = await cdp.send('Profiler.stop');
console.log(`profiled ${((Date.now() - t0) / 1000).toFixed(1)} s`);
await browser.close();

// Self time per node, then rolled up the tree for total time per function.
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const self = new Map();
const dt = profile.timeDeltas;
for (let i = 0; i < profile.samples.length; i++) self.set(profile.samples[i], (self.get(profile.samples[i]) ?? 0) + (dt[i] ?? 0) / 1000);
const label = (n) => {
  const f = n.callFrame;
  const file = f.url.split('/').pop()?.split('?')[0] ?? '';
  return `${f.functionName || '(anonymous)'} ${file}:${f.lineNumber + 1}`;
};
const selfBy = new Map();
const totalBy = new Map();
for (const [id, ms] of self) {
  const n = byId.get(id);
  selfBy.set(label(n), (selfBy.get(label(n)) ?? 0) + ms);
  // Total: every distinct ancestor function gets this sample once.
  const seen = new Set();
  for (let cur = id; cur != null; cur = parent.get(cur)) {
    const l = label(byId.get(cur));
    if (seen.has(l)) continue;
    seen.add(l);
    totalBy.set(l, (totalBy.get(l) ?? 0) + ms);
  }
}
const top = (m, k) => [...m.entries()].filter(([l]) => !/^\((idle|program|garbage collector|root)\)/.test(l)).sort((a, b) => b[1] - a[1]).slice(0, k);
console.log('\nself time (ms):');
for (const [l, ms] of top(selfBy, 25)) console.log(`${ms.toFixed(0).padStart(7)}  ${l}`);
console.log('\ntotal time, game code (ms):');
for (const [l, ms] of top(totalBy, 400).filter(([l]) => !/three\.module|three\.core|node_modules|chunk-/.test(l)).slice(0, 45)) console.log(`${ms.toFixed(0).padStart(7)}  ${l}`);
mkdirSync('docs/perf/cpu-trip', { recursive: true });
writeFileSync(`docs/perf/cpu-trip/${TO}.json`, JSON.stringify({ self: top(selfBy, 60), total: top(totalBy, 200) }, null, 1));
