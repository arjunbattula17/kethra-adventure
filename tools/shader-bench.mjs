// Shader compile micro-benchmark: how long one lit material takes the browser to compile, per
// formulation of three.js's light loop, on this machine's GPU in installed Chrome.
//
//   npx vite --port 5199   (in another terminal: the bench page is served by the dev server)
//   node tools/shader-bench.mjs [--reps=2] [--kinds=full,plain] [--chunks=stock,patched,...] [--points=8]
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const opt = (name, d) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? d;
const REPS = Number(opt('reps', 2));
const KINDS = opt('kinds', 'full,plain').split(',');
const POINTS = Number(opt('points', 8));
const OPTS = JSON.parse(opt('opts', '{}'));
const URL = opt('url', 'http://localhost:5199/kethra-adventure/tools/shader-bench/index.html');

const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--use-angle=d3d11', '--enable-gpu', '--disable-gpu-vsync'] });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('page error:', m.text().slice(0, 300)); });
await page.goto(URL);
await page.waitForFunction(() => document.title === 'ready', undefined, { timeout: 60000 });
const chunks = opt('chunks', null)?.split(',') ?? (await page.evaluate(() => window.chunks));
console.log('parallel compile:', await page.evaluate(() => window.parallel));
// Warm-up compile (first program pays one-off costs).
await page.evaluate(() => window.bench('stock', 'basic', 1));
for (const kind of KINDS) {
  for (const chunk of chunks) {
    const rows = [];
    for (let r = 0; r < REPS; r++) rows.push(await page.evaluate(([c, k, p, o]) => window.bench(c, k, p, o), [chunk, kind, POINTS, OPTS]));
    const med = (f) => rows.map((x) => x[f]).sort((a, b) => a - b)[Math.floor(rows.length / 2)];
    console.log(`${kind.padEnd(6)} ${chunk.padEnd(18)} compile ${rows.map((x) => x.compileMs).join('/')} ms   first draw ${rows.map((x) => x.firstDrawMs).join('/')} ms   frame ${med('frameMs')} ms`);
  }
}
await browser.close();
