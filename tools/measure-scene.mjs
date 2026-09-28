// Quick counters for one scene: draw calls and triangles per frame (all post passes counted), frame
// time, textures, geometries and programs, plus the scene's console log lines. For iterating on a
// budget without the full tools/perf-run.mjs loop.
//
//   npm run build && npx vite preview --port 4180 --strictPort   (in another terminal)
//   node tools/measure-scene.mjs <ship|kethra|hush|vessek|reveal|intro|ending> [baseUrl] [--tier=low|medium|high] [--cpu=1]
//
// `hush` is Kethra from just inside the Heart's chamber door, looking in (MG3's budget, DESIGN.md §8).
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const opt = (name, d) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? d;
const [SCENE = 'ship', BASE = 'http://localhost:4180/kethra-adventure/'] = args.filter((a) => !a.startsWith('--'));
const TIER = opt('tier', 'low');
const CPU = Number(opt('cpu', 1));
const SCENES = {
  ship: ['?newGame=1&skipIntro=1', 'ShipInteriorScene'],
  kethra: ['?newGame=1&skipIntro=1&unlockKethra=1&jump=kethra', 'KethraScene'],
  hush: ['?newGame=1&skipIntro=1&unlockKethra=1&jump=kethra', 'KethraScene', { x: 0, y: 1.6, z: -11.4, yaw: 0 }],
  vessek: ['?newGame=1&skipIntro=1&unlockVessek=1&jump=vessek', 'VessekScene'],
  reveal: ['?newGame=1&skipTutorial=1', 'GalaxyRevealScene'],
  intro: ['?newGame=1', 'IntroScene'],
  ending: ['?newGame=1&skipIntro=1&unlockVessek=1&jump=ending', 'EndingScene'],
};
const [query, kind, pose] = SCENES[SCENE];

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
if (CPU > 1) await (await page.context().newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: CPU });
await page.goto(`${BASE}${query}&tier=${TIER}&seed=7`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction((k) => window.__DEBUG__?.engine.getCurrentScene()?.kind === k, kind, { timeout: 240000, polling: 250 });
await page.waitForTimeout(4000);
if (pose) {
  await page.evaluate((p) => {
    const s = window.__DEBUG__.engine.getCurrentScene();
    s.player.teleport(new s.player.rig.position.constructor(p.x, p.y, p.z), p.yaw);
  }, pose);
  await page.waitForTimeout(2000);
}
const r = await page.evaluate(async () => {
  const engine = window.__DEBUG__.engine;
  const info = engine.renderer.info;
  info.autoReset = false;
  info.reset();
  let calls = 0;
  let tris = 0;
  const deltas = [];
  let last = performance.now();
  for (let f = 0; f < 120; f++) {
    await new Promise((res) => requestAnimationFrame(res));
    const now = performance.now();
    deltas.push(now - last);
    last = now;
    calls += info.render.calls;
    tris += info.render.triangles;
    info.reset();
  }
  info.autoReset = true;
  deltas.sort((a, b) => a - b);
  return {
    calls: Math.round(calls / 120),
    tris: Math.round(tris / 120),
    p50: +deltas[60].toFixed(1),
    p95: +deltas[114].toFixed(1),
    textures: info.memory.textures,
    geometries: info.memory.geometries,
    programs: info.programs?.length ?? null,
  };
});
console.log(`${SCENE} tier=${TIER} cpu=${CPU}x: ${r.calls} calls, ${(r.tris / 1000).toFixed(0)}k tris, p50 ${r.p50} / p95 ${r.p95} ms, ${r.textures} textures, ${r.geometries} geometries, ${r.programs} programs`);
for (const l of logs.filter((l) => /batch|error|warn/i.test(l)).slice(0, 12)) console.log('  ', l);
await browser.close();
