// Which materials force which shader programs in a scene, and what separates programs that are
// nearly the same: the evidence for consolidating materials (BACKLOG B-4). Installed Chrome, pinned tier.
//
//   node tools/program-audit.mjs [baseUrl] [--tier=low] [--scene=ship|kethra|vessek]
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const [BASE = 'http://localhost:4173/kethra-adventure/'] = args.filter((a) => !a.startsWith('--'));
const TIER = args.find((a) => a.startsWith('--tier='))?.split('=')[1] ?? 'low';
const SCENE = args.find((a) => a.startsWith('--scene='))?.split('=')[1] ?? 'ship';

const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--use-angle=d3d11', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const query = SCENE === 'ship' ? '?newGame=1&skipIntro=1' : SCENE === 'kethra' ? '?unlockKethra=1&skipIntro=1' : '?unlockVessek=1&skipIntro=1';
await page.goto(`${BASE}${query}&tier=${TIER}`);
await page.waitForFunction(() => performance.getEntriesByName('ship:playable').length > 0, undefined, { timeout: 300000 });
if (SCENE !== 'ship') {
  await page.evaluate((l) => window.__DEBUG__.flow.travelToPlanet(l), SCENE);
  await page.waitForFunction((k) => window.__DEBUG__.engine.getCurrentScene()?.kind === k, SCENE === 'kethra' ? 'KethraScene' : 'VessekScene', { timeout: 300000 });
}
await page.waitForTimeout(1500);
const report = await page.evaluate(() => {
  const e = window.__DEBUG__.engine;
  const r = e.renderer;
  const scene = e.getCurrentScene().scene;
  const SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap', 'bumpMap', 'lightMap', 'envMap'];
  const features = (m, o) => {
    const f = [m.type];
    for (const s of SLOTS) if (m[s]) f.push(s);
    if (m.side === 2) f.push('double');
    if (m.side === 1) f.push('back');
    if (m.transparent) f.push('transparent');
    if (m.alphaTest > 0) f.push('alphaTest');
    if (m.vertexColors) f.push('vertexColors');
    if (m.flatShading) f.push('flat');
    if (m.fog === false) f.push('noFog');
    if (m.toneMapped === false) f.push('noToneMap');
    if (m.isMeshPhysicalMaterial) {
      for (const k of ['clearcoat', 'transmission', 'sheen', 'iridescence', 'anisotropy', 'dispersion', 'thickness']) if (m[k] > 0) f.push(`${k}=${m[k]}`);
      if (m.ior !== 1.5) f.push(`ior=${m.ior}`);
      if (m.specularIntensity !== 1) f.push(`specInt=${m.specularIntensity}`);
      if (m.specularColor && m.specularColor.getHex() !== 0xffffff) f.push('specColor');
      if (m.specularColorMap || m.specularIntensityMap) f.push('specMaps');
    }
    if (m.onBeforeCompile && m.onBeforeCompile.toString() !== 'onBeforeCompile(){}' && !/^\s*onBeforeCompile\s*\(\s*\)\s*\{\s*\}/.test(m.onBeforeCompile.toString())) f.push('onBeforeCompile');
    if (m.defines && Object.keys(m.defines).length) f.push('defines:' + Object.keys(m.defines).join('+'));
    if (o.isInstancedMesh) f.push(o.instanceColor ? 'instanced+color' : 'instanced');
    if (o.geometry?.attributes?.tangent) f.push('tangents');
    if (o.geometry?.attributes?.color && m.vertexColors) f.push(`color${o.geometry.attributes.color.itemSize}`);
    return f.join(' ');
  };
  const byProgram = new Map();
  scene.traverse((o) => {
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) {
      const p = r.properties.get(m).currentProgram;
      if (!p) continue;
      let entry = byProgram.get(p);
      if (!entry) byProgram.set(p, (entry = { id: p.id, name: p.name, features: new Map(), materials: new Set(), meshes: 0 }));
      entry.meshes++;
      entry.materials.add(m.name || m.type);
      const f = features(m, o);
      entry.features.set(f, (entry.features.get(f) ?? 0) + 1);
    }
  });
  return [...byProgram.values()].map((e) => ({ id: e.id, name: e.name, meshes: e.meshes, materials: [...e.materials].slice(0, 6), features: [...e.features.entries()] }));
});
report.sort((a, b) => a.features[0][0].localeCompare(b.features[0][0]));
console.log(`${report.length} programs in use (${SCENE}, ${TIER})`);
for (const p of report) {
  console.log(`#${p.id} ${p.meshes} meshes  [${p.materials.join(', ')}]`);
  for (const [f, n] of p.features) console.log(`     ${n}x ${f}`);
}
await browser.close();
