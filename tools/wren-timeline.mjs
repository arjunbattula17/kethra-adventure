// The first minute aboard the Wren as a player on Auto sees it: intervals between draws (vsync on) in 5 s
// windows, with the governor's state (tier, render scale, steady-30 cap, scale trial) and the
// background lighting upgrade's span. The camera turns a full circle every 20 s.
//
//   node tools/wren-timeline.mjs <label> [baseUrl] [--seconds=60] [--query=a=b] [--cold-gpu] [--return=kethra] [--return-seconds=20]
//
// --return: after the first window, go to that level, stay 10 s, come back aboard and record again
// (a return visit, after the governor has judged the Wren once).
//
// Fresh profile per run, installed Chrome, ANGLE D3D11, 1366x768. Writes docs/perf/<label>/timeline.json.
import { chromium } from 'playwright';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, d) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? d;
const [LABEL = 'wren-timeline', BASE = 'http://127.0.0.1:4193/kethra-adventure/'] = args.filter((a) => !a.startsWith('--'));
const SECONDS = Number(opt('seconds', 60));
const QUERY = opt('query', '') ? `&${opt('query', '')}` : '';
const OUT = `docs/perf/${LABEL}`;
mkdirSync(OUT, { recursive: true });

const dir = mkdtempSync(join(tmpdir(), 'kethra-wren-'));
const ctx = await chromium.launchPersistentContext(dir, {
  channel: 'chrome', headless: true, viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1,
  args: ['--use-angle=d3d11', '--enable-gpu', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
const page = await ctx.newPage();
if (args.includes('--cold-gpu')) {
  const nonce = Math.floor(Math.random() * 1e6);
  await page.addInitScript((n) => {
    const orig = WebGL2RenderingContext.prototype.shaderSource;
    WebGL2RenderingContext.prototype.shaderSource = function (s, src) {
      return orig.call(this, s, `${src}\n// cold ${n}\n`);
    };
  }, nonce);
}
await page.goto(`${BASE}?newGame=1&skipIntro=1&seed=7${QUERY}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__DEBUG__?.engine.getCurrentScene()?.kind === 'ShipInteriorScene' && !window.__DEBUG__.flow.isTransitioning() && !document.querySelector('.loading-indicator.visible'), null, { timeout: 300000, polling: 100 });
const measure = (seconds) => page.evaluate(
  (seconds) =>
    new Promise((resolve) => {
      const engine = window.__DEBUG__.engine;
      const scene = engine.getCurrentScene();
      const p = scene.player;
      const yaw0 = p?.yaw ?? 0;
      const frames = [];
      const states = [];
      const start = performance.now();
      let last = start;
      let lastState = -1;
      // Intervals between draws, not animation frames: under the steady-30 cap the loop skips every
      // other animation frame without drawing.
      const post = engine.postFx;
      const render = post.render.bind(post);
      post.render = () => {
        const now = performance.now();
        frames.push([Math.round(now - start), +(now - last).toFixed(1)]);
        last = now;
        render();
      };
      const step = (now) => {
        const t = now - start;
        if (p && p.enabled !== false) {
          p.yaw = yaw0 + (t / 20000) * Math.PI * 2;
          p.rig?.rotation.set(0, p.yaw, 0);
        }
        const sec = Math.floor(t / 1000);
        if (sec !== lastState) {
          lastState = sec;
          states.push([sec, engine.getQualityTier(), engine.renderScale, engine.steadyCap, engine.scaleTrial, engine.preparing]);
        }
        if (t < seconds * 1000) requestAnimationFrame(step);
        else {
          post.render = render;
          const spans = performance.getEntriesByType('measure').filter((m) => /upgrade|ShipInteriorScene/.test(m.name)).map((m) => [m.name, Math.round(m.startTime - start), Math.round(m.duration)]);
          resolve({ frames, states, spans });
        }
      };
      requestAnimationFrame(step);
    }),
  seconds,
);
const settledIn = (kind) => page.waitForFunction((k) => window.__DEBUG__?.engine.getCurrentScene()?.kind === k && !window.__DEBUG__.flow.isTransitioning() && !document.querySelector('.loading-indicator.visible'), kind, { timeout: 300000, polling: 100 });
const result = await measure(SECONDS);
const RETURN = opt('return', '');
let back = null;
if (RETURN) {
  await page.evaluate((l) => window.__DEBUG__.flow.debugGo(l), RETURN);
  await settledIn(RETURN === 'vessek' ? 'VessekScene' : 'KethraScene');
  await page.waitForTimeout(10000);
  await page.evaluate(() => window.__DEBUG__.engine.getCurrentScene().onDepart?.());
  await settledIn('ShipInteriorScene');
  back = await measure(Number(opt('return-seconds', 20)));
}
await ctx.close();
rmSync(dir, { recursive: true, force: true });
writeFileSync(`${OUT}/timeline.json`, JSON.stringify({ ...result, back }));
function report(title, result, seconds, win = 5000) {
console.log(title);
let total50 = 0;
for (let w = 0; w < seconds * 1000; w += win) {
  const f = result.frames.filter(([t]) => t >= w && t < w + win).map(([, d]) => d).sort((a, b) => a - b);
  if (!f.length) continue;
  const p95 = f[Math.floor(f.length * 0.95)];
  const over50 = f.filter((d) => d > 50).length;
  total50 += over50;
  const st = result.states.find(([s]) => s === Math.floor((w + win - 1) / 1000)) ?? result.states.at(-1);
  console.log(`${String(w / 1000).padStart(3)}-${String((w + win) / 1000).padEnd(3)} s  ${(f.length / (win / 1000)).toFixed(1).padStart(5)} fps drawn  p50 ${f[Math.floor(f.length / 2)].toFixed(1).padStart(5)}  p95 ${p95.toFixed(1).padStart(5)}  max ${f.at(-1).toFixed(0).padStart(4)}  >50 ${String(over50).padStart(3)}  | ${st[1]} scale ${st[2]} cap ${st[3]} trial ${st[4]} prep ${st[5]}`);
}
console.log(`frames > 50 ms: ${total50}`);
}
report('first visit', result, SECONDS);
if (back) report('return aboard', back, Number(opt('return-seconds', 20)), 2500);
for (const [n, s, d] of result.spans) if (s > -60000) console.log(`span ${n} at ${(s / 1000).toFixed(1)} s, ${d} ms`);
