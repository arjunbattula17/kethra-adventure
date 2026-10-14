// CPU profile of the page's main thread around one scene cut, split into its long tasks: each run of
// busy samples over 50 ms is listed with the functions it spent its time in. For freezes at a cut
// that the journey profile shows as a long task but can't name. Run it against the Vite dev server,
// whose modules keep their function names.
//
//   npx vite --port 5210 --strictPort   (in another terminal)
//   node tools/cpu-profile-cut.mjs [baseUrl] [--cut=canopy|kethra|vessek|wren]
//
// canopy: the cruise's cut to MG2 (profiled from once Kethra has finished preparing).
// kethra: MG2's cut to Kethra. vessek: the docking cruise's cut to the Anchorage.
// wren: the return aboard from Kethra. vessek-trip: the whole docking cruise, Vessek preparing during it.
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const [BASE = 'http://localhost:5210/kethra-adventure/'] = args.filter((a) => !a.startsWith('--'));
const CUT = args.find((a) => a.startsWith('--cut='))?.split('=')[1] ?? 'canopy';
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--use-angle=d3d11', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log(`console.${m.type()}: ${m.text().slice(0, 300)}`);
});
page.on('crash', () => console.log('!! page crashed'));
// Program queries that block (the program's first use waits for its compile): which program, and what
// it is drawn for, looked up among the current scene's materials.
await page.addInitScript(() => {
  window.__slowPrograms = [];
  const P = WebGL2RenderingContext.prototype;
  for (const name of ['getProgramInfoLog', 'getProgramParameter']) {
    const orig = P[name];
    P[name] = function (program, ...rest) {
      const t = performance.now();
      const r = orig.call(this, program, ...rest);
      const ms = performance.now() - t;
      if (ms > 30) {
        const d = window.__DEBUG__;
        const three = d?.engine.renderer.info.programs.find((p) => p.program === program);
        let user = '';
        d?.engine.getCurrentScene()?.scene.traverse((o) => {
          if (user) return;
          for (const m of o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []) {
            if (d.engine.renderer.properties.get(m).currentProgram !== three) continue;
            const path = [];
            for (let p = o; p; p = p.parent) path.push(p.name || p.type);
            user = `${path.reverse().join(' > ')} / ${m.type} ${m.name || '-'}`;
          }
        });
        // What separates it from the nearest program of the same shader that already existed.
        let nearest = '';
        if (three) {
          const key = three.cacheKey.split(',');
          let best = null;
          for (const q of d.engine.renderer.info.programs) {
            if (q === three || q.name !== three.name || q.id > three.id) continue;
            const k = q.cacheKey.split(',');
            const diff = [];
            for (let i = 0; i < Math.max(k.length, key.length); i++) if (k[i] !== key[i]) diff.push(`[${i}] ${String(k[i]).slice(0, 30)} -> ${String(key[i]).slice(0, 30)}`);
            if (!best || diff.length < best.length) best = diff;
          }
          nearest = best ? best.slice(0, 6).join(' | ') : 'first of its shader';
        }
        window.__slowPrograms.push({ at: Math.round(t), ms: Math.round(ms), name: three?.name ?? '?', id: three?.id, scene: d?.engine.getCurrentScene()?.kind, user, nearest });
      }
      return r;
    };
  }
});
// The scene being current, not the flow being idle: a trip is one transition from the helm to the level.
const kindIs = (k, timeout = 600000) => page.waitForFunction((k) => window.__DEBUG__?.engine.getCurrentScene()?.kind === k && !document.querySelector('.loading-indicator.visible'), k, { timeout, polling: 100 });
const measured = (name) => page.waitForFunction((n) => performance.getEntriesByType('measure').some((m) => m.name === n), name, { timeout: 600000, polling: 250 });

const query = CUT.startsWith('vessek') ? '?newGame=1&unlockVessek=1&skipIntro=1' : '?newGame=1&unlockKethra=1&skipIntro=1';
await page.goto(`${BASE}${query}`);
await page.waitForFunction(() => window.__DEBUG__?.flow.state === 'wren' && !window.__DEBUG__.flow.isTransitioning(), null, { timeout: 600000, polling: 250 });
await page.evaluate((cut) => {
  window.__DEBUG__.gameState.setFlag('first_light');
  if (cut !== 'canopy' && cut !== 'kethra') window.__DEBUG__.gameState.setFlag('canopy_flown');
}, CUT);
await page.waitForTimeout(2000);

const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable');
// Coarser for a whole trip: a minute of samples at 250 us is a lot of memory for the page.
await cdp.send('Profiler.setSamplingInterval', { interval: CUT.endsWith('-trip') ? 1000 : 250 });
const NOPROF = args.includes('--no-profile');
// The programs that exist when profiling starts; any made after are listed with what separates them.
const snapshotPrograms = () => page.evaluate(() => (window.__progsBefore = new Set(window.__DEBUG__.engine.renderer.info.programs)).size);
const start = async () => {
  await snapshotPrograms();
  if (!NOPROF) await cdp.send('Profiler.start');
};
const newPrograms = () =>
  page.evaluate(() => {
    const r = window.__DEBUG__.engine.renderer;
    const before = [...window.__progsBefore];
    const users = new Map();
    window.__DEBUG__.engine.getCurrentScene()?.scene.traverse((o) => {
      for (const m of o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []) {
        const p = r.properties.get(m).currentProgram;
        if (p && !users.has(p)) users.set(p, `${o.type} ${o.name || '-'} / ${m.type} ${m.name || '-'}`);
      }
    });
    return r.info.programs.filter((p) => !window.__progsBefore.has(p)).map((p) => {
      const key = p.cacheKey.split(',');
      let best = null;
      for (const q of before) {
        if (q.name !== p.name) continue;
        const k = q.cacheKey.split(',');
        const diff = [];
        for (let i = 0; i < Math.max(k.length, key.length); i++) if (k[i] !== key[i]) diff.push(`[${i}] ${String(k[i]).slice(0, 40)} -> ${String(key[i]).slice(0, 40)}`);
        if (!best || diff.length < best.length) best = diff;
      }
      return { name: p.name, id: p.id, user: users.get(p) ?? '(not in the current scene)', nearest: best ?? ['no program of this name before'] };
    });
  });
if (CUT === 'wren') {
  await page.evaluate(() => window.__DEBUG__.flow.debugGo('kethra'));
  await kindIs('KethraScene');
  await page.waitForTimeout(3000);
  await start();
  await page.evaluate(() => window.__DEBUG__.engine.getCurrentScene().onDepart?.());
  await kindIs('ShipInteriorScene');
} else {
  await page.evaluate((to) => window.__DEBUG__.bus.emit('galaxy:travel_to', to), CUT.startsWith('vessek') ? 'vessek' : 'kethra');
  await page.waitForFunction(() => window.__DEBUG__.engine.getCurrentScene()?.kind === 'CruiseScene', null, { timeout: 120000, polling: 100 });
  if (CUT === 'canopy') {
    await measured('KethraScene:firstDraw');
    await start();
    await kindIs('CanopyScene');
  } else if (CUT === 'kethra') {
    await kindIs('CanopyScene');
    await page.waitForFunction(() => window.__DEBUG__.engine.getCurrentScene()?.state?.().phase === 'fly', null, { timeout: 120000, polling: 100 });
    await start();
    await page.evaluate(() => window.__DEBUG__.miniGame()?.win());
    await kindIs('KethraScene');
  } else if (CUT === 'vessek-trip') {
    // The whole docking cruise, with Vessek preparing during it.
    await start();
    await kindIs('VessekScene');
  } else {
    await measured('VessekScene:firstDraw');
    await start();
    await kindIs('VessekScene');
  }
}
await page.waitForTimeout(3000);
for (const s of await page.evaluate(() => window.__slowPrograms)) console.log(`slow program query ${s.ms} ms at ${s.at}: program ${s.id} ${s.name} in ${s.scene}: ${s.user || "(no user in the current scene)"}
    vs nearest: ${s.nearest}`);
for (const p of await newPrograms()) console.log(`new program ${p.id} ${p.name}: ${p.user}\n    differs from the nearest earlier one in ${p.nearest.slice(0, 8).join(' | ')}`);
if (NOPROF) {
  await browser.close();
  process.exit(0);
}
const { profile } = await cdp.send('Profiler.stop');
await browser.close();

const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const label = (n) => {
  const f = n.callFrame;
  const file = f.url.split('/').pop()?.split('?')[0] ?? '';
  return `${f.functionName || '(anonymous)'} ${file}:${f.lineNumber + 1}`;
};
const idle = (id) => /^\((idle|program)\)/.test(byId.get(id).callFrame.functionName);
// Busy runs: consecutive non-idle samples, allowing gaps under 2 ms (a task boundary is longer).
const runs = [];
let t = 0;
let cur = null;
for (let i = 0; i < profile.samples.length; i++) {
  t += profile.timeDeltas[i] / 1000;
  const id = profile.samples[i];
  if (idle(id)) {
    if (cur && t - cur.last > 2) {
      runs.push(cur);
      cur = null;
    }
    continue;
  }
  if (!cur) cur = { from: t, last: t, samples: [] };
  cur.last = t;
  cur.samples.push([id, profile.timeDeltas[i] / 1000]);
}
if (cur) runs.push(cur);
const long = runs.filter((r) => r.last - r.from > 50).sort((a, b) => b.last - b.from - (a.last - a.from));
console.log(`${CUT}: ${long.length} busy runs over 50 ms in ${(t / 1000).toFixed(1)} s`);
for (const r of long.slice(0, 6)) {
  const total = new Map();
  const self = new Map();
  for (const [id, ms] of r.samples) {
    self.set(label(byId.get(id)), (self.get(label(byId.get(id))) ?? 0) + ms);
    const seen = new Set();
    for (let c = id; c != null; c = parent.get(c)) {
      const l = label(byId.get(c));
      if (seen.has(l)) continue;
      seen.add(l);
      total.set(l, (total.get(l) ?? 0) + ms);
    }
  }
  console.log(`\n== ${(r.last - r.from).toFixed(0)} ms at ${(r.from / 1000).toFixed(2)} s`);
  const skip = /^\((root|garbage collector)\)/;
  console.log('  total:');
  for (const [l, ms] of [...total].filter(([l]) => !skip.test(l)).sort((a, b) => b[1] - a[1]).slice(0, 28)) console.log(`   ${ms.toFixed(0).padStart(6)}  ${l}`);
  console.log('  self:');
  for (const [l, ms] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`   ${ms.toFixed(0).padStart(6)}  ${l}`);
}
