// Checks that nothing the engine does in the background reaches the frames on screen: for 16 s after
// arriving in each level (the lighting upgrade runs then), it reads the live camera's layer mask on every
// frame. The warm-up draws use a layer of their own; a frame drawn while the live camera was left on it
// is black. Fails on any such frame.
//
//   npm run build && npx vite preview --port 4180 --strictPort   (in another terminal)
//   node tools/live-frames-check.mjs [baseUrl] [--tier=low|high]
import { chromium } from 'playwright';
import { CHROME_ARGS } from './lib/probe.mjs';

const args = process.argv.slice(2);
const BASE = args.find((a) => !a.startsWith('--')) ?? 'http://localhost:4180/kethra-adventure/';
const tier = (args.find((a) => a.startsWith('--tier=')) ?? '--tier=low').slice(7);
const ROUTES = [
  ['wren', '?newGame=1&skipIntro=1'],
  ['kethra', '?newGame=1&skipIntro=1&unlockKethra=1&jump=kethra'],
  ['vessek', '?newGame=1&skipIntro=1&unlockVessek=1&jump=vessek'],
];

const browser = await chromium.launch({ channel: 'chrome', args: CHROME_ARGS });
let failed = 0;
for (const [name, query] of ROUTES) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await page.goto(`${BASE}${query}&tier=${tier}`);
  await page.waitForFunction(() => { const s = window.__DEBUG__?.engine.getCurrentScene(); return s && s.player && !window.__DEBUG__.flow.isTransitioning() && window.__DEBUG__.flow.state !== 'boot'; }, null, { timeout: 240000, polling: 100 });
  const r = await page.evaluate(async () => {
    const engine = window.__DEBUG__.engine;
    const t0 = performance.now();
    let frames = 0;
    const wrong = [];
    while (performance.now() - t0 < 16000) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      frames++;
      const mask = engine.getCurrentScene().camera.layers.mask;
      if (mask !== 1) wrong.push(Math.round(performance.now() - t0));
    }
    return { frames, wrong: wrong.length, from: wrong[0], to: wrong[wrong.length - 1] };
  });
  const ok = r.wrong === 0;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} (${tier}): ${r.frames} frames${ok ? '' : `, ${r.wrong} drawn off the live layer (${r.from}-${r.to} ms)`}`);
  await page.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
