// Looks for NaN and infinite pixels in every scene, rendered with 4x MSAA into a float target. One NaN
// is enough to black out a whole frame on High: the bloom's blur spreads it everywhere. The usual
// cause is MSAA sampling a varying past its range and pow() of a negative on Direct3D. Each scene is
// sampled once a second for a while (shooting stars, plumes and moths come and go); a dirty sample is
// broken down by mesh.
//
//   npm run build && npx vite preview --port 4180 --strictPort   (in another terminal)
//   node tools/nan-scan.mjs [baseUrl] [--samples=8]
import { chromium } from 'playwright';
import { CHROME_ARGS } from './lib/probe.mjs';

const args = process.argv.slice(2);
const BASE = args.find((a) => !a.startsWith('--')) ?? 'http://localhost:4180/kethra-adventure/';
const SAMPLES = Number((args.find((a) => a.startsWith('--samples=')) ?? '--samples=8').slice(10));
const settled = (state) => `window.__DEBUG__?.flow.state === '${state}' && !window.__DEBUG__.flow.isTransitioning()`;
const ROUTES = [
  ['title', '', 'window.__DEBUG__?.engine.getCurrentScene()?.kind === "TitleScene"'],
  ['title-isilthe', '?title=isilthe', 'window.__DEBUG__?.engine.getCurrentScene()?.kind === "TitleScene"'],
  ['intro', '?newGame=1', settled('intro')],
  ['wren', '?skipIntro=1&newGame=1', settled('wren')],
  ['reveal', '?newGame=1&skipTutorial=1', settled('reveal')],
  ['cruise', '?skipIntro=1&newGame=1&unlockKethra=1', settled('wren'), async (page) => {
    await page.evaluate(() => { window.__DEBUG__.flow.tutorial?.skip?.(); window.__DEBUG__.gameState.setFlag('first_light'); window.__DEBUG__.bus.emit('galaxy:travel_to', 'kethra'); });
    await page.waitForFunction(() => window.__DEBUG__.engine.getCurrentScene()?.kind === 'CruiseScene', null, { timeout: 60000 });
    // The reveal: Kethra and its atmosphere fill the frame.
    await page.evaluate(() => { window.__DEBUG__.engine.getCurrentScene().time = 31; });
  }],
  ['kethra', '?skipIntro=1&newGame=1&unlockKethra=1&jump=kethra', settled('kethra')],
  ['hush', '?skipIntro=1&newGame=1&unlockKethra=1&jump=kethra', settled('kethra'), async (page) => {
    await page.evaluate(() => { const p = window.__DEBUG__.engine.getCurrentScene().player; p.teleport(new p.rig.position.constructor(0, 1.6, -11.4), 0); });
  }],
  ['vessek', '?skipIntro=1&newGame=1&unlockVessek=1&jump=vessek', settled('vessek')],
  ['ending', '?skipIntro=1&newGame=1&jump=ending', settled('ending')],
];

const browser = await chromium.launch({ channel: 'chrome', args: CHROME_ARGS });
let dirty = 0;
for (const [name, query, ready, then] of ROUTES) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const sep = query ? '&' : '?';
  await page.goto(`${BASE}${query}${sep}tier=high&seed=7`);
  const ok = await page.waitForFunction(ready, null, { timeout: 240000 }).then(() => true, () => false);
  if (ok && then) await then(page);
  await page.waitForTimeout(2000);
  const found = [];
  for (let i = 0; ok && i < SAMPLES; i++) {
    await page.waitForTimeout(1000);
    const r = await page.evaluate(() => {
      const e = window.__DEBUG__.engine;
      const renderer = e.renderer;
      const s = e.getCurrentScene();
      const w = 683, h = 384;
      const rt = new e.postFx.composer.renderTarget1.constructor(w, h, { type: 1015, samples: 4 });
      const buf = new Float32Array(w * h * 4);
      const count = () => {
        renderer.setRenderTarget(rt);
        renderer.clear();
        renderer.render(s.scene, s.camera);
        renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf);
        let bad = 0;
        for (let k = 0; k < buf.length; k++) if (!Number.isFinite(buf[k])) bad++;
        return bad;
      };
      const all = count();
      const by = [];
      if (all) {
        const meshes = [];
        s.scene.traverse((o) => (o.isMesh || o.isPoints || o.isLine) && o.visible && meshes.push(o));
        for (const m of meshes) {
          meshes.forEach((x) => (x.visible = x === m));
          const n = count();
          if (n) by.push(`${m.name || m.parent?.name || m.type} (${m.material?.type}) ${n}`);
        }
        // Only visible meshes were gathered, so all of them go back to visible.
        meshes.forEach((x) => (x.visible = true));
      }
      renderer.setRenderTarget(null);
      rt.dispose();
      return { all, by };
    });
    if (r.all) found.push(r);
  }
  const clean = ok && found.length === 0;
  if (!clean) dirty++;
  console.log(`${clean ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  did not settle'}${found.length ? `  ${found.length}/${SAMPLES} samples with NaN or Inf` : ''}`);
  for (const line of [...new Set(found.flatMap((f) => f.by))].slice(0, 6)) console.log(`      ${line}`);
  await page.close();
}
await browser.close();
console.log(dirty ? `\n${dirty} scene(s) not clean` : '\nno NaN or Inf in any scene');
process.exit(dirty ? 1 : 0);
