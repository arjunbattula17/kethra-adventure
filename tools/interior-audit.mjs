// Dumps every mesh in the ship interior with its world AABB + material state to JSON, so
// clipping/untextured-surface analysis runs on measured numbers instead of eyeballed screenshots.
// Usage: node tools/interior-audit.mjs [outFile]
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const out = process.argv[2] || 'reports/interior-audit.json';
const baseUrl = process.env.BASE_URL || 'http://localhost:5180/kethra-adventure/';

const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
const failedRequests = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('requestfailed', (r) => failedRequests.push(`${r.url()} :: ${r.failure()?.errorText}`));
page.on('response', (r) => { if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.url()}`); });

await page.goto(baseUrl + '?skipIntro=1&newGame=1&nobatch=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForFunction(() => !!window.__DEBUG__?.gameState, undefined, { timeout: 90000 });
await page.waitForFunction(() => {
  const s = window.__DEBUG__.engine.getCurrentScene?.();
  return !!(s && s.player && s.constructor.name === 'ShipInteriorScene');
}, undefined, { timeout: 90000 });
await page.waitForTimeout(4000);

const data = await page.evaluate(() => {
  const scene = window.__DEBUG__.engine.getCurrentScene().scene;
  const meshes = [];
  const roots = [];
  scene.updateMatrixWorld(true);

  const rootOf = (obj) => {
    let o = obj, last = obj;
    while (o.parent && o.parent !== scene) { o = o.parent; last = o; }
    return o.parent === scene ? o : last;
  };
  const rootIndex = new Map();
  scene.children.forEach((c, i) => rootIndex.set(c, i));

  scene.traverse((obj) => {
    if (!obj.isMesh) return;
    const g = obj.geometry;
    if (!g) return;
    if (!g.boundingBox) g.computeBoundingBox();
    const bb = g.boundingBox.clone().applyMatrix4(obj.matrixWorld);
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    const r = rootOf(obj);
    const texState = (m) => ({
      name: m.name || '',
      type: m.type,
      hasMap: !!m.map,
      mapReady: !!(m.map && m.map.image && m.map.image.width > 0),
      hasNormal: !!m.normalMap,
      hasRough: !!m.roughnessMap,
      color: m.color ? '#' + m.color.getHexString() : null,
      emissive: m.emissive ? '#' + m.emissive.getHexString() : null,
      emissiveIntensity: m.emissiveIntensity ?? null,
      rough: m.roughness ?? null,
      metal: m.metalness ?? null,
      transparent: !!m.transparent,
      opacity: m.opacity,
      side: m.side,
    });
    const size = [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z];
    meshes.push({
      id: obj.id,
      name: obj.name || '',
      rootName: r?.name || '',
      rootIdx: rootIndex.has(r) ? rootIndex.get(r) : -1,
      rootType: r?.type || '',
      geom: g.type,
      tris: g.index ? g.index.count / 3 : (g.attributes.position?.count ?? 0) / 3,
      min: [bb.min.x, bb.min.y, bb.min.z],
      max: [bb.max.x, bb.max.y, bb.max.z],
      size,
      visible: obj.visible,
      renderOrder: obj.renderOrder,
      mats: mats.filter(Boolean).map(texState),
    });
  });

  scene.children.forEach((c, i) => roots.push({ i, name: c.name || '', type: c.type, pos: [c.position.x, c.position.y, c.position.z] }));
  return { meshes, roots, childCount: scene.children.length };
});

writeFileSync(out, JSON.stringify({ ...data, errors: [...new Set(errors)], failedRequests: [...new Set(failedRequests)] }, null, 1));
console.log(`meshes=${data.meshes.length} roots=${data.childCount} errors=${new Set(errors).size} failedReq=${new Set(failedRequests).size}`);
console.log('wrote', out);
await browser.close();
