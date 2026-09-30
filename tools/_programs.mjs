import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome', headless: false, args: ['--use-angle=d3d11', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
await p.goto('http://localhost:4173/kethra-adventure/?newGame=1&skipIntro=1');
await p.waitForFunction(() => performance.getEntriesByName('ship:playable').length > 0, undefined, { timeout: 300000 });
const r = await p.evaluate(() => {
  const e = window.__DEBUG__.engine; const scene = e.getCurrentScene().scene;
  const progs = e.renderer.info.programs.map((pr) => ({ name: pr.name, key: pr.cacheKey, used: pr.usedTimes }));
  const lights = {}; scene.traverse((o) => { if (o.isLight) lights[o.type] = (lights[o.type] || 0) + 1; });
  const mats = new Map(); scene.traverse((o) => { const m = o.material; if (!m) return; for (const x of Array.isArray(m) ? m : [m]) mats.set(x.uuid, x); });
  const byType = {}; for (const m of mats.values()) byType[m.type] = (byType[m.type] || 0) + 1;
  return { tier: e.getQualityTier(), progs, lights, materials: mats.size, byType };
});
console.log(JSON.stringify({ tier: r.tier, lights: r.lights, materials: r.materials, byType: r.byType }, null, 0));
for (const pr of r.progs) console.log(pr.used, pr.name, pr.key.slice(0, 400).replace(/\s+/g, ' '));
await b.close();
