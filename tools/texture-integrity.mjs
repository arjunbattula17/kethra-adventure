// Counts textures a scene's materials reference but that never got image data, and samples the
// renderer warning that results. A texture whose image is missing renders as untextured while the
// renderer logs "Texture marked for update but no image data found" on every frame it is drawn, so
// this is both a visual defect and a continuous per-frame cost.
// Usage: node tools/texture-integrity.mjs [ship|kethra]
import { chromium } from 'playwright';

const scene = process.argv.includes('kethra') ? 'kethra' : 'ship';
const baseUrl = process.env.BASE_URL || 'http://localhost:5180/kethra-adventure/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
let noImageWarnings = 0;
page.on('console', (m) => { if (m.text().includes('no image data found')) noImageWarnings++; });
await page.goto(`${baseUrl}?skipIntro=1&newGame=1&unlockKethra=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.__DEBUG__?.gameState, undefined, { timeout: 120000 });
await page.waitForFunction(() => !!window.__DEBUG__.engine.getCurrentScene?.(), undefined, { timeout: 120000 });
if (scene === 'kethra') await page.evaluate(() => window.__DEBUG__.bus.emit('galaxy:travel_to', 'kethra'));
const want = scene === 'kethra' ? 'KethraScene' : 'ShipInteriorScene';
await page.waitForFunction((w) => {
  const s = window.__DEBUG__.engine.getCurrentScene?.();
  return !!(s && s.player && (s.kind ?? s.constructor.name) === w);
}, want, { timeout: 120000 });
await page.waitForTimeout(4000);
const warnStart = noImageWarnings;
const t0 = Date.now();
await page.waitForTimeout(3000);
const perSec = ((noImageWarnings - warnStart) / ((Date.now() - t0) / 1000)).toFixed(1);

const out = await page.evaluate(() => {
  const sc = window.__DEBUG__.engine.getCurrentScene();
  const SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap'];
  const broken = [];
  let slotsChecked = 0;
  const seen = new Set();
  sc.scene.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m || seen.has(m.uuid)) continue;
      seen.add(m.uuid);
      for (const slot of SLOTS) {
        const t = m[slot];
        if (!t) continue;
        slotsChecked++;
        const img = t.image;
        const ok = !!img && ((img.width > 0 && img.height > 0) || img instanceof ImageBitmap);
        if (!ok) broken.push(`${m.name || m.type}.${slot}`);
      }
    }
  });
  return { broken, slotsChecked, materials: seen.size };
});
console.log(`${scene}: ${out.broken.length} broken of ${out.slotsChecked} texture slots across ${out.materials} materials`);
console.log(`  renderer "no image data" warnings: ${perSec}/sec`);
if (out.broken.length) {
  const counts = new Map();
  for (const b of out.broken) counts.set(b, (counts.get(b) || 0) + 1);
  [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([k, v]) => console.log(`    x${v}  ${k}`));
}
await browser.close();
