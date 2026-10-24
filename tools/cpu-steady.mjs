// Where the main thread's time goes in a level's steady play, on the real GPU: a CDP CPU profile of
// N seconds while the camera turns, top functions by self time (and their file:line), GC share, and
// the main thread's busy share. Point it at an unminified build for readable names:
//   npx vite build --minify false --outDir <dir>; node tools/serve-like-pages.mjs 4195 <dir>
//
//   node tools/cpu-steady.mjs <ship|kethra|vessek> [baseUrl] [--seconds=10] [--settle=30] [--tier=low]
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const opt = (name, d) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? d;
const [LEVEL = 'ship', BASE = 'http://127.0.0.1:4195/kethra-adventure/'] = args.filter((a) => !a.startsWith('--'));
const SECONDS = Number(opt('seconds', 10));
const SETTLE = Number(opt('settle', 30));
const TIER = opt('tier', 'low');
const KIND = { ship: ['ShipInteriorScene', ''], kethra: ['KethraScene', '&unlockKethra=1&jump=kethra'], vessek: ['VessekScene', '&unlockVessek=1&jump=vessek'] }[LEVEL];

const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
await page.goto(`${BASE}?newGame=1&skipIntro=1&seed=7&tier=${TIER}${KIND[1]}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction((k) => window.__DEBUG__?.engine.getCurrentScene()?.kind === k && !window.__DEBUG__.flow.isTransitioning(), KIND[0], { timeout: 300000, polling: 250 });
await page.waitForTimeout(SETTLE * 1000);
const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
await page.evaluate((ms) => {
  const s = window.__DEBUG__.engine.getCurrentScene();
  const p = s.player;
  const start = performance.now();
  const yaw0 = p?.yaw ?? 0;
  const step = (now) => {
    const k = (now - start) / ms;
    if (p) {
      p.yaw = yaw0 + k * Math.PI * 2;
      p.rig?.rotation.set(0, p.yaw, 0);
    }
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}, SECONDS * 1000);
await cdp.send('Profiler.start');
await page.waitForTimeout(SECONDS * 1000);
const { profile } = await cdp.send('Profiler.stop');
await browser.close();

const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const self = new Map();
const dt = profile.timeDeltas;
let total = 0;
for (let i = 0; i < profile.samples.length; i++) {
  const n = byId.get(profile.samples[i]);
  const ms = (dt[i] ?? 0) / 1000;
  total += ms;
  const cf = n.callFrame;
  const key = `${cf.functionName || '(anon)'} ${cf.url.split('/').pop()}:${cf.lineNumber + 1}`;
  self.set(key, (self.get(key) ?? 0) + ms);
}
const idle = [...self].filter(([k]) => k.startsWith('(idle)') || k.startsWith('(program)')).reduce((a, [, v]) => a + v, 0);
const gc = [...self].filter(([k]) => k.startsWith('(garbage collector)')).reduce((a, [, v]) => a + v, 0);
const busy = total - idle;
console.log(`${LEVEL}: ${SECONDS} s, main thread busy ${(busy / SECONDS).toFixed(0)} ms/s (${((busy / total) * 100).toFixed(0)}%), GC ${(gc / SECONDS).toFixed(1)} ms/s`);
for (const [k, v] of [...self].filter(([k]) => !/^\((idle|program)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${(v / SECONDS).toFixed(2).padStart(6)} ms/s  ${k}`);
