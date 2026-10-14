import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome', headless: false, args: ['--use-angle=d3d11', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
await p.goto('http://localhost:4173/kethra-adventure/?newGame=1&skipIntro=1&tier=high');
await p.waitForFunction(() => performance.getEntriesByName('ship:playable').length > 0, undefined, { timeout: 300000 });
const r = await p.evaluate(() => {
  const scene = window.__DEBUG__.engine.getCurrentScene().scene;
  const seen = new Map();
  scene.traverse((o) => { const m = o.material; if (!m) return; for (const x of Array.isArray(m) ? m : [m]) for (const k of ['map','normalMap','roughnessMap','metalnessMap','emissiveMap','aoMap','alphaMap']) { const t = x[k]; if (t && t.image && t.image.width) seen.set(t.image, (t.image.constructor.name)); } });
  const sizes = {}; let px = 0, over = 0, overPx = 0;
  for (const [img, kind] of seen) { const k = `${kind} ${img.width}x${img.height}`; sizes[k] = (sizes[k] || 0) + 1; px += img.width * img.height; if (img.width > 1024 || img.height > 1024) { over++; overPx += img.width * img.height; } }
  return { unique: seen.size, sizes, totalMpx: +(px / 1e6).toFixed(1), over1024: over, over1024Mpx: +(overPx / 1e6).toFixed(1) };
});
console.log(JSON.stringify(r, null, 1));
await b.close();
