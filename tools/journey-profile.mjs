// Frame times and preparation cost across the whole game, in the order a player meets it, on this
// machine's GPU in installed Chrome with a fresh profile: the reveal and MG1 (won by the harness hook
// after the reveal has played), back aboard, First light with the cruise preparing behind it, the
// cruise (the canopy preparing), MG2 (won), Kethra's arrival, back aboard, the docking cruise to
// Vessek, back aboard, and the ending. Each scene is held a few seconds while the camera turns a full
// circle, so first-look work shows up too.
//
//   npx vite preview --port 4190 --strictPort   (in another terminal)
//   node tools/journey-profile.mjs <label> [baseUrl] [--cold-gpu] [--skip-cruise] [--hold=4]
//
// Each segment (one current scene) reports frame times while the view was visible and while a cover
// hid it, long tasks, programs linked, and the time from its transition starting to the scene being
// current and uncovered. Writes docs/perf/<label>/journey.json.
import { chromium } from 'playwright';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pageProbe, stats, longStats, CHROME_ARGS } from './lib/probe.mjs';

const args = process.argv.slice(2);
const opt = (name, d) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? d;
const flag = (name) => args.includes(`--${name}`);
const [LABEL = 'journey', BASE = 'http://localhost:4190/kethra-adventure/'] = args.filter((a) => !a.startsWith('--'));
const HOLD = Number(opt('hold', 4)) * 1000;
const OUT = `docs/perf/${LABEL}`;
mkdirSync(OUT, { recursive: true });

const dir = mkdtempSync(join(tmpdir(), 'kethra-journey-'));
const context = await chromium.launchPersistentContext(dir, { channel: 'chrome', headless: false, viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1, args: CHROME_ARGS });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('crash', () => errors.push('PAGE CRASHED'));
await page.addInitScript(pageProbe, [flag('cold-gpu') ? Math.floor(Math.random() * 1e6) : 0]);

const log = (msg) => console.log(`${new Date().toISOString().slice(11, 19)}  ${msg}`);
const kindIs = (k) => page.waitForFunction((k) => window.__DEBUG__?.engine.getCurrentScene()?.kind === k && !window.__DEBUG__.flow.isTransitioning() && !document.querySelector('.loading-indicator.visible'), k, { timeout: 600000, polling: 100 });
/** Holds the scene while the camera turns a full circle, as a player looking around would. */
const lookAround = () =>
  page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        const s = window.__DEBUG__.engine.getCurrentScene();
        const p = s.player;
        const start = performance.now();
        const yaw0 = p?.yaw ?? 0;
        const step = (now) => {
          const k = Math.min(1, (now - start) / ms);
          if (p && p.enabled !== false) {
            p.yaw = yaw0 + k * Math.PI * 2;
            p.rig?.rotation.set(0, p.yaw, 0);
          }
          if (k < 1) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      }),
    HOLD,
  );
const mark = (name) => page.evaluate((n) => window.__prof.events.push([n, performance.now()]), name);

// The Wren, then straight to the reveal (the tutorial's own flow is tools/test-tutorial-flow.mjs).
log('boot: ?skipTutorial');
await page.goto(`${BASE}?newGame=1&skipTutorial=1`, { waitUntil: 'commit' });
await kindIs('GalaxyRevealScene');
log('reveal playing; waiting for MG1');
await page.waitForFunction(() => !!window.__DEBUG__.engine.getCurrentScene()?.intercept, null, { timeout: 180000, polling: 100 });
await page.waitForTimeout(HOLD);
await mark('act:win-mg1');
await page.evaluate(() => window.__DEBUG__.miniGame()?.win());
log('MG1 won; back aboard');
await kindIs('ShipInteriorScene');
await page.waitForFunction(() => window.__DEBUG__.flow.state === 'wren' && !window.__DEBUG__.flow.isTransitioning() && window.__DEBUG__.engine.getCurrentScene()?.player?.enabled, null, { timeout: 120000, polling: 100 });
await mark('act:look-wren');
await lookAround();

// Kethra: First light, the cruise, MG2, the arrival.
await mark('act:travel-kethra');
log('travel to Kethra');
await page.evaluate(() => window.__DEBUG__.bus.emit('galaxy:travel_to', 'kethra'));
await page.waitForSelector('.first-light-hint', { timeout: 120000 });
await mark('act:throttle');
await page.keyboard.down('Space');
await page.waitForFunction(() => window.__DEBUG__.engine.getCurrentScene()?.power?.stage === 'full', null, { timeout: 60000, polling: 100 });
await page.keyboard.up('Space');
await page.waitForFunction(() => window.__DEBUG__.engine.getCurrentScene()?.kind === 'CruiseScene', null, { timeout: 120000, polling: 100 });
log('cruise');
if (flag('skip-cruise')) {
  await page.waitForSelector('.hold-skip', { timeout: 30000 });
  await page.keyboard.down('Space');
  await page.waitForTimeout(1100);
  await page.keyboard.up('Space');
}
await page.waitForFunction(() => window.__DEBUG__.engine.getCurrentScene()?.kind === 'CanopyScene', null, { timeout: 240000, polling: 100 });
log('canopy (MG2)');
await page.waitForFunction(() => window.__DEBUG__.engine.getCurrentScene()?.state?.().phase === 'fly', null, { timeout: 120000, polling: 100 });
await page.waitForTimeout(HOLD);
await mark('act:win-mg2');
await page.evaluate(() => window.__DEBUG__.miniGame()?.win());
await kindIs('KethraScene');
log('Kethra');
await mark('act:look-kethra');
await lookAround();

// Back aboard, then Vessek by the docking cruise.
await mark('act:depart-kethra');
await page.evaluate(() => window.__DEBUG__.engine.getCurrentScene().onDepart?.());
await kindIs('ShipInteriorScene');
log('back aboard');
await mark('act:look-wren');
await lookAround();
await page.evaluate(() => {
  const g = window.__DEBUG__.gameState;
  for (const f of ['kethra_mechanism_solved', 'kethra_warden_met']) g.setFlag(f);
  if (!g.data.planetsUnlocked.includes('vessek')) g.data.planetsUnlocked.push('vessek');
});
await mark('act:travel-vessek');
log('travel to Vessek');
await page.evaluate(() => window.__DEBUG__.bus.emit('galaxy:travel_to', 'vessek'));
await page.waitForFunction(() => window.__DEBUG__.engine.getCurrentScene()?.kind === 'CruiseScene', null, { timeout: 120000, polling: 100 });
if (flag('skip-cruise')) {
  await page.waitForSelector('.hold-skip', { timeout: 30000 });
  await page.keyboard.down('Space');
  await page.waitForTimeout(1100);
  await page.keyboard.up('Space');
}
await kindIs('VessekScene');
log('Vessek');
await mark('act:look-vessek');
await lookAround();
await mark('act:depart-vessek');
await page.evaluate(() => window.__DEBUG__.engine.getCurrentScene().onDepart?.());
await kindIs('ShipInteriorScene');
log('back aboard');
await mark('act:look-wren');
await lookAround();

// The ending, and back aboard after it.
await mark('act:ending');
log('ending');
await page.evaluate(() => window.__DEBUG__.flow.debugGo('ending'));
await page.waitForFunction(() => window.__DEBUG__.engine.getCurrentScene()?.kind === 'EndingScene', null, { timeout: 120000, polling: 100 });
await page.waitForFunction(() => window.__DEBUG__.engine.getCurrentScene()?.kind === 'ShipInteriorScene' && !window.__DEBUG__.flow.isTransitioning(), null, { timeout: 300000, polling: 250 });
await page.waitForTimeout(2000);
log('done');

const dump = await page.evaluate(() => ({
  events: window.__prof.events,
  frames: window.__prof.frames,
  long: window.__prof.long,
  heap: window.__prof.heap,
  gl: window.__prof.gl,
  spans: [...performance.getEntriesByType('measure').map((m) => [m.name, m.startTime, m.duration]), ...window.__prof.spans],
  tier: window.__DEBUG__.engine.getQualityTier(),
  programs: window.__DEBUG__.engine.renderer.info.programs?.length,
  memory: window.__DEBUG__.engine.renderer.info.memory,
}));
await context.close();
rmSync(dir, { recursive: true, force: true });

// Segments: one per current scene, from the moment it became current to the next change.
const sceneEvents = dump.events.filter(([n]) => n.startsWith('scene:') && n !== 'scene:none');
const end = dump.frames.at(-1)[0];
const segments = [];
const counts = {};
for (let i = 0; i < sceneEvents.length; i++) {
  const [name, at] = sceneEvents[i];
  const until = sceneEvents[i + 1]?.[1] ?? end;
  const kind = name.slice(6);
  counts[kind] = (counts[kind] ?? 0) + 1;
  // The transition that brought this scene: from the flow going busy before it to its uncovering.
  const busyAt = [...dump.events].reverse().find(([n, t]) => n.endsWith('*') && n.startsWith('state:') && t <= at)?.[1] ?? null;
  const uncoveredAt = dump.frames.find((f) => f[0] >= at && f[2] === 0)?.[0] ?? null;
  const inSeg = (x) => x[0] >= at && x[0] < until;
  const frames = dump.frames.filter(inSeg);
  segments.push({
    scene: `${kind}#${counts[kind]}`,
    at: Math.round(at),
    ms: Math.round(until - at),
    transitionMs: busyAt != null && uncoveredAt != null ? Math.round(uncoveredAt - busyAt) : null,
    visible: stats(frames.filter((f) => f[2] === 0)),
    covered: stats(frames.filter((f) => f[2] === 1)),
    long: longStats(dump.long.filter(inSeg)),
    links: dump.gl.links.filter((t) => t >= at && t < until).length,
    spans: dump.spans.filter(([, s]) => s >= at && s < until).map(([n, s, d]) => [n, Math.round(s - at), Math.round(d)]),
  });
}
const out = { label: LABEL, base: BASE, coldGpu: flag('cold-gpu'), tier: dump.tier, programsAlive: dump.programs, memory: dump.memory, heapMaxMB: Math.max(...dump.heap.map((h) => h[1])), heapEndMB: dump.heap.at(-1)?.[1], errors: [...new Set(errors)].slice(0, 10), segments, events: dump.events.map(([n, t]) => [Math.round(t), n]), long: dump.long.map(([t, d]) => [Math.round(t), Math.round(d)]), gaps: dump.frames.filter((f) => f[1] > 50).map((f) => [Math.round(f[0]), Math.round(f[1]), f[2]]) };
writeFileSync(`${OUT}/journey.json`, JSON.stringify(out, null, 1));

console.log(`\ntier ${out.tier} | programs alive ${out.programsAlive} | heap max ${out.heapMaxMB} MB, end ${out.heapEndMB} MB | textures ${dump.memory.textures} geometries ${dump.memory.geometries} | errors ${out.errors.length}`);
for (const s of segments) {
  const v = s.visible;
  const c = s.covered;
  const t = s.transitionMs == null ? '' : `transition ${(s.transitionMs / 1000).toFixed(1)} s | `;
  console.log(`${s.scene.padEnd(16)} ${(s.ms / 1000).toFixed(1).padStart(6)} s | ${t}links ${s.links} | long ${s.long.count} (${s.long.totalMs} ms, max ${s.long.max})`);
  if (v) console.log(`${''.padEnd(16)}   visible ${String(v.fps).padStart(5)} fps p50 ${v.p50} p95 ${v.p95} p99 ${v.p99} max ${v.max} | >50 ${v.over50} >100 ${v.over100} >250 ${v.over250} >1s ${v.over1000}`);
  if (c) console.log(`${''.padEnd(16)}   covered ${c.frames} frames, max ${c.max} ms`);
  const big = s.spans.filter(([n, , d]) => d > 300 && !/^renderer\./.test(n));
  if (big.length) console.log(`${''.padEnd(16)}   spans: ${big.map(([n, a, d]) => `${n}@${(a / 1000).toFixed(1)}s ${d}`).join(' | ')}`);
}
if (out.errors.length) console.log('errors: ' + out.errors.join(' || ').slice(0, 800));
console.log(`wrote ${OUT}/journey.json`);
