// The title screen's frames while the shared environment map is made behind it (Environment.ts), for
// builds compared run by run: installed Chrome on this machine's real GPU, a brand-new browser profile
// per run, builds interleaved (A B, then B A, ...), since the laptop drifts between batches.
//
//   npx vite preview --outDir <dist> --port <port> --strictPort   (one per build, in other terminals)
//   node tools/env-map-frames.mjs <label> <name>=<baseUrl> [<name>=<baseUrl> ...] [--runs=3] [--after=10]
//
// Per run: the 'engine:environment' span and the backdrop's first frame ('title:backdrop'); every
// requestAnimationFrame interval, counted over 34 and 50 ms inside the span, in the 10 s after the
// backdrop's first frame, and over the whole wait (menu up to 10 s after the backdrop); each long frame
// in the span with the generator's step drawn last before it (the cube, the blur, a GGX level) and
// each step's GPU time (EXT_disjoint_timer_query_webgl2); long tasks; program queries that blocked;
// and a hash of every texel of the finished map, read back as floats, to show two builds make the
// same map. A build that doesn't make the map while the title waits reports only the whole wait.
// Writes docs/perf/<label>/env.json.
import { chromium } from 'playwright';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CHROME_ARGS } from './lib/probe.mjs';

const args = process.argv.slice(2);
const opt = (name, d) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? d;
const [LABEL = 'env-map', ...builds] = args.filter((a) => !a.startsWith('--'));
const RUNS = Number(opt('runs', 3));
const AFTER = Number(opt('after', 10));
const OUT = `docs/perf/${LABEL}`;
const variants = builds.map((b) => ({ name: b.slice(0, b.indexOf('=')), base: b.slice(b.indexOf('=') + 1) }));
if (!variants.length) throw new Error('usage: node tools/env-map-frames.mjs <label> <name>=<baseUrl> ...');
mkdirSync(OUT, { recursive: true });

function probe() {
  const P = (window.__envFrames = { frames: [], long: [], renders: [], waits: [] });
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) P.long.push([e.startTime, e.duration]);
    }).observe({ type: 'longtask', buffered: true });
  } catch {}
  let last = performance.now();
  const tick = (now) => {
    P.frames.push([now, now - last]);
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  // A program query that blocks is the page waiting for a compile.
  const G = WebGL2RenderingContext.prototype;
  for (const name of ['getProgramParameter', 'getShaderParameter', 'getProgramInfoLog', 'getUniformLocation', 'getAttribLocation']) {
    const orig = G[name];
    G[name] = function (...a) {
      const t = performance.now();
      const r = orig.apply(this, a);
      const d = performance.now() - t;
      if (d > 4) {
        const three = window.__DEBUG__?.engine?.renderer.info.programs.find((q) => q.program === a[0]);
        P.waits.push([t, d, three ? `${three.id} ${three.name}` : '?']);
      }
      return r;
    };
  }
  // The generator's draws, as boot.ts hands the engine to the debug probe: each timed on the GPU.
  const watch = (engine) => {
    const r = engine.renderer;
    const gl = r.getContext();
    const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const render = r.render;
    r.render = function (scene, camera) {
      const target = r.getRenderTarget();
      if (target?.texture?.name !== 'PMREM.cubeUv') return render.call(this, scene, camera);
      if (scene.isScene) P.map = target;
      const u = scene.material?.uniforms;
      const label = scene.isScene ? 'room' : `${scene.material?.name || scene.material?.type} mip=${u?.mipInt?.value}`;
      const q = timer ? gl.createQuery() : null;
      if (q) gl.beginQuery(timer.TIME_ELAPSED_EXT, q);
      const t = performance.now();
      try {
        return render.call(this, scene, camera);
      } finally {
        P.renders.push({ t, d: performance.now() - t, label, q });
        if (q) gl.endQuery(timer.TIME_ELAPSED_EXT);
      }
    };
    P.finish = () => {
      let map = null;
      if (P.map) {
        const previous = r.getRenderTarget();
        r.setRenderTarget(P.map);
        const px = new Float32Array(P.map.width * P.map.height * 4);
        gl.readPixels(0, 0, P.map.width, P.map.height, gl.RGBA, gl.FLOAT, px);
        r.setRenderTarget(previous);
        const words = new Uint32Array(px.buffer);
        let h = 2166136261;
        for (let i = 0; i < words.length; i++) h = Math.imul(h ^ words[i], 16777619) >>> 0;
        map = `${P.map.width}x${P.map.height} ${h.toString(16).padStart(8, '0')}`;
      }
      const done = (q) => q && gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) && !gl.getParameter(timer.GPU_DISJOINT_EXT);
      return { map, renders: P.renders.map(({ q, ...rest }) => ({ ...rest, gpu: done(q) ? gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6 : null })) };
    };
  };
  let debug;
  Object.defineProperty(window, '__DEBUG__', {
    configurable: true,
    get: () => debug,
    set: (v) => {
      debug = v;
      if (v?.engine) watch(v.engine);
    },
  });
}

const r1 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);

async function run(v, round) {
  const dir = mkdtempSync(join(tmpdir(), 'kethra-env-'));
  const context = await chromium.launchPersistentContext(dir, { channel: 'chrome', headless: !args.includes('--headed'), args: CHROME_ARGS, viewport: { width: 1366, height: 768 } });
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)));
    await page.addInitScript(probe);
    await page.goto(v.base);
    await page.waitForFunction(() => performance.getEntriesByName('title:backdrop').length > 0, null, { timeout: 120000, polling: 200 });
    const until = async (msLeft) => {
      const wait = await page.evaluate(msLeft, AFTER);
      if (wait > 0) await page.waitForTimeout(wait + 250);
    };
    // 10 s after the backdrop's first frame, and a second after the map is done.
    await until((after) => performance.getEntriesByName('title:backdrop')[0].startTime + after * 1000 - performance.now());
    await until(() => {
      const e = performance.getEntriesByName('engine:environment')[0];
      return e ? e.startTime + e.duration + 1000 - performance.now() : 0;
    });
    const d = await page.evaluate(() => {
      const env = performance.getEntriesByName('engine:environment')[0];
      const at = (n) => performance.getEntriesByName(n)[0]?.startTime ?? null;
      const P = window.__envFrames;
      return { env: env ? [env.startTime, env.startTime + env.duration] : null, backdrop: at('title:backdrop'), shown: at('title:shown'), frames: P.frames, long: P.long, waits: P.waits, ...(P.finish?.() ?? { map: null, renders: [] }) };
    });
    const [s, e] = d.env ?? [Infinity, Infinity];
    const inSpan = d.frames.filter((f) => f[0] > s && f[0] - f[1] < e);
    const after = d.frames.filter((f) => f[0] > d.backdrop && f[0] <= d.backdrop + AFTER * 1000);
    const wait = d.frames.filter((f) => f[0] > d.shown && f[0] <= d.backdrop + AFTER * 1000);
    // The generator's steps: the draws issued together, between two of its pauses.
    const steps = [];
    for (const r of d.renders) {
      const step = steps[steps.length - 1];
      if (step && r.t - step.end < 3) {
        step.end = r.t + r.d;
        step.gpu = step.gpu == null || r.gpu == null ? null : step.gpu + r.gpu;
        step.labels.push(r.label);
      } else steps.push({ t: r.t, end: r.t + r.d, gpu: r.gpu, labels: [r.label] });
    }
    for (const step of steps) step.name = step.labels.includes('room') ? 'cube' : step.labels[0].startsWith('SphericalGaussianBlur') ? 'blur' : `ggx ${step.labels[0].replace(/^.* /, '')}`;
    const over = (list, ms) => list.filter((f) => f[1] > ms).length;
    const result = {
      build: v.name,
      round,
      map: d.map,
      envStartMs: r1(s),
      envMs: r1(e - s),
      backdropMs: r1(d.backdrop),
      envDoneBeforeBackdrop: d.env ? e < d.backdrop : null,
      envOver34: over(inSpan, 34),
      envOver50: over(inSpan, 50),
      envMaxMs: r1(Math.max(0, ...inSpan.map((f) => f[1]))),
      afterOver34: over(after, 34),
      afterOver50: over(after, 50),
      waitOver34: over(wait, 34),
      waitOver50: over(wait, 50),
      waitOver100: over(wait, 100),
      envLongFrames: inSpan.filter((f) => f[1] > 34).map((f) => {
        const last = steps.filter((st) => st.t < f[0]).pop();
        return { ms: r1(f[1]), atEnvMs: r1(f[0] - s), afterStep: last ? `${last.name} +${r1(f[0] - last.t)} ms` : 'before the first step', backdropUp: f[0] - f[1] > d.backdrop };
      }),
      steps: steps.map((st) => ({ name: st.name, atEnvMs: r1(st.t - s), gpuMs: r1(st.gpu) })),
      envLongTasks: d.long.filter(([t, dur]) => t < e && t + dur > s).map(([t, dur]) => [r1(t - s), r1(dur)]),
      envProgramWaits: d.waits.filter(([t]) => t > s && t < e).map(([t, dur, p]) => [r1(t - s), r1(dur), p]),
      errors,
    };
    return result;
  } finally {
    await context.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

const results = [];
for (let round = 0; round < RUNS; round++) {
  for (const v of round % 2 ? [...variants].reverse() : variants) {
    const r = await run(v, round);
    results.push(r);
    const { envLongFrames, steps, envLongTasks, envProgramWaits, ...head } = r;
    console.log(JSON.stringify(head));
    for (const f of envLongFrames) console.log(`   ${f.ms} ms frame at env+${f.atEnvMs} ms, after ${f.afterStep}${f.backdropUp ? ', backdrop up' : ''}`);
    if (steps.length) console.log(`   steps: ${steps.map((st) => `${st.name} @${st.atEnvMs} gpu ${st.gpuMs}`).join(' | ')}`);
  }
}
const median = (xs) => {
  const v = xs.filter((x) => typeof x === 'number').sort((a, b) => a - b);
  return v.length ? v[Math.floor((v.length - 1) / 2)] : null;
};
const summary = {};
for (const v of variants) {
  const rs = results.filter((r) => r.build === v.name);
  const total = (k) => rs.reduce((a, r) => a + r[k], 0);
  summary[v.name] = { runs: rs.length, maps: [...new Set(rs.map((r) => r.map))], envMsMedian: median(rs.map((r) => r.envMs)), envOver34: total('envOver34'), envOver50: total('envOver50'), afterOver50: total('afterOver50'), waitOver50: total('waitOver50'), waitOver100: total('waitOver100'), backdropMsMedian: median(rs.map((r) => r.backdropMs)) };
  console.log(`${v.name} ${JSON.stringify(summary[v.name])}`);
}
writeFileSync(`${OUT}/env.json`, JSON.stringify({ label: LABEL, builds: variants, after: AFTER, summary, results }, null, 2));
