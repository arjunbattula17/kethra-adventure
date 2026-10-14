// Every texture a scene's materials use, by source: size, bytes it will cost to upload, and for canvases
// whether Chrome keeps them on the GPU (the default) or in ordinary memory (willReadFrequently). A GPU
// canvas is rasterised by the GPU process when it is first uploaded, which is where a painter's draw
// calls are actually paid. Installed Chrome, this machine's GPU.
//
//   node tools/texture-sources.mjs [baseUrl] [--tier=low] [--scene=ship|kethra|vessek|reveal]
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const [BASE = 'http://localhost:4190/kethra-adventure/'] = args.filter((a) => !a.startsWith('--'));
const TIER = args.find((a) => a.startsWith('--tier='))?.split('=')[1] ?? 'low';
const SCENE = args.find((a) => a.startsWith('--scene='))?.split('=')[1] ?? 'ship';

const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--use-angle=d3d11', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
// Record each canvas's context options as it is created.
await page.addInitScript(() => {
  const get = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, opts) {
    if (type === '2d' && !this.__opts) this.__opts = { willReadFrequently: !!opts?.willReadFrequently };
    return get.call(this, type, opts);
  };
});
const query = SCENE === 'vessek' ? '?unlockVessek=1&skipIntro=1' : '?newGame=1&unlockKethra=1&skipIntro=1';
await page.goto(`${BASE}${query}&tier=${TIER}`);
await page.waitForFunction(() => window.__DEBUG__?.flow && !window.__DEBUG__.flow.isTransitioning() && window.__DEBUG__.engine.getCurrentScene() && !document.querySelector('.loading-indicator.visible'), undefined, { timeout: 600000, polling: 200 });
if (SCENE !== 'ship') {
  await page.evaluate((s) => window.__DEBUG__.flow.debugGo(s), SCENE);
  await page.waitForFunction((s) => window.__DEBUG__.flow.state === s && !window.__DEBUG__.flow.isTransitioning(), SCENE, { timeout: 600000, polling: 200 });
}
await page.waitForTimeout(1500);
const rows = await page.evaluate(() => {
  const scene = window.__DEBUG__.engine.getCurrentScene().scene;
  const SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'lightMap', 'envMap'];
  const found = new Map();
  const add = (t, where) => {
    if (!t?.isTexture) return;
    const e = found.get(t) ?? { where: new Set() };
    e.where.add(where);
    found.set(t, e);
  };
  add(scene.background, 'background');
  scene.traverse((o) => {
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) {
      for (const s of SLOTS) add(m[s], `${m.name || m.type}.${s}`);
      if (m.uniforms) for (const [k, u] of Object.entries(m.uniforms)) add(u?.value, `${m.type}.${k}`);
    }
  });
  const out = [];
  // Clones of one texture share its image, and three.js uploads a shared image once per distinct set
  // of sampler settings: count GL textures, not Texture objects.
  const props = window.__DEBUG__.engine.renderer.properties;
  const seen = new Set();
  for (const [t, e] of found) {
    const gl = props.get(t).__webglTexture;
    if (gl) {
      if (seen.has(gl)) continue;
      seen.add(gl);
    }
    const img = t.image;
    let kind = img?.constructor?.name ?? 'none';
    let w = img?.width ?? 0;
    let h = img?.height ?? 0;
    if (t.isDataTexture) kind = 'DataTexture';
    if (t.isCubeTexture) kind = 'CubeTexture';
    let backing = '';
    if (img instanceof HTMLCanvasElement) backing = img.__opts?.willReadFrequently ? 'cpu' : 'gpu';
    const mips = t.generateMipmaps && t.minFilter !== 1006 && t.minFilter !== 1003 ? 4 / 3 : 1;
    out.push({ kind, backing, w, h, mb: +((w * h * 4 * mips) / 1048576).toFixed(2), name: t.name || img?.src?.split('/').pop() || '', where: [...e.where].slice(0, 3).join(', '), uses: e.where.size });
  }
  return out;
});
const sum = (list) => list.reduce((s, r) => s + r.mb, 0).toFixed(1);
const groups = {};
for (const r of rows) {
  const k = `${r.kind}${r.backing ? `/${r.backing}` : ''}`;
  (groups[k] ??= []).push(r);
}
console.log(`${SCENE} @ ${TIER}: ${rows.length} textures, ${sum(rows)} MB to upload`);
for (const [k, list] of Object.entries(groups)) console.log(`  ${k.padEnd(28)} ${String(list.length).padStart(4)} textures  ${sum(list).padStart(7)} MB`);
console.log('largest:');
for (const r of [...rows].sort((a, b) => b.mb - a.mb).slice(0, 25)) console.log(`  ${String(r.mb).padStart(6)} MB  ${r.w}x${r.h}  ${r.kind}${r.backing ? `/${r.backing}` : ''}  ${r.name}  [${r.where}]`);
await browser.close();
