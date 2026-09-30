// Which materials force which shader programs in a scene, what separates programs that are nearly the
// same, and the light rig every lit program is compiled against: the evidence for consolidating
// materials. Installed Chrome on this machine's GPU, pinned tier.
//
//   node tools/program-audit.mjs [baseUrl] [--tier=low] [--scene=ship|intro|reveal|kethra|vessek|ending]
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const [BASE = 'http://localhost:4190/kethra-adventure/'] = args.filter((a) => !a.startsWith('--'));
const TIER = args.find((a) => a.startsWith('--tier='))?.split('=')[1] ?? 'low';
const SCENE = args.find((a) => a.startsWith('--scene='))?.split('=')[1] ?? 'ship';

const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--use-angle=d3d11', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const idle = () => window.__DEBUG__?.flow && !window.__DEBUG__.flow.isTransitioning() && window.__DEBUG__.engine.getCurrentScene() && !document.querySelector('.loading-indicator.visible');
if (SCENE === 'intro') {
  await page.goto(`${BASE}?newGame=1&tier=${TIER}`);
  await page.waitForFunction(() => window.__DEBUG__?.flow.state === 'intro', undefined, { timeout: 600000 });
} else {
  const query = SCENE === 'vessek' ? '?unlockVessek=1&skipIntro=1' : '?newGame=1&unlockKethra=1&skipIntro=1';
  await page.goto(`${BASE}${query}&tier=${TIER}`);
  await page.waitForFunction(idle, undefined, { timeout: 600000, polling: 200 });
  if (SCENE !== 'ship') {
    await page.evaluate((s) => window.__DEBUG__.flow.debugGo(s), SCENE);
    await page.waitForFunction((s) => window.__DEBUG__.flow.state === s && !window.__DEBUG__.flow.isTransitioning(), SCENE, { timeout: 600000, polling: 200 });
  }
}
await page.waitForTimeout(2500);
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
    }
    const obc = m.onBeforeCompile?.toString() ?? '';
    if (obc && !/^\s*onBeforeCompile\s*\(\s*\w*\s*\)\s*\{\s*\}/.test(obc) && !/^\s*\(\s*\)\s*=>\s*\{\s*\}/.test(obc)) f.push('onBeforeCompile');
    if (m.defines && Object.keys(m.defines).length) f.push('defines:' + Object.keys(m.defines).join('+'));
    if (o.isInstancedMesh) f.push(o.instanceColor ? 'instanced+color' : 'instanced');
    if (o.isBatchedMesh) f.push('batched');
    if (o.isSkinnedMesh) f.push('skinned');
    if (o.geometry?.morphAttributes && Object.keys(o.geometry.morphAttributes).length) f.push('morph');
    if (o.geometry?.attributes?.tangent) f.push('tangents');
    if (o.geometry?.attributes?.color && m.vertexColors) f.push(`color${o.geometry.attributes.color.itemSize}`);
    if (o.receiveShadow) f.push('recvShadow');
    return f.join(' ');
  };
  const byProgram = new Map();
  let meshes = 0;
  scene.traverse((o) => {
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    if (mats.length) meshes++;
    for (const m of mats) {
      const p = r.properties.get(m).currentProgram;
      if (!p) continue;
      let entry = byProgram.get(p);
      if (!entry) byProgram.set(p, (entry = { id: p.id, name: p.name, features: new Map(), materials: new Set(), meshes: 0, key: p.cacheKey }));
      entry.meshes++;
      entry.materials.add(m.name || m.type);
      const f = features(m, o);
      entry.features.set(f, (entry.features.get(f) ?? 0) + 1);
    }
  });
  const lights = {};
  scene.traverse((o) => {
    if (!o.isLight) return;
    const k = `${o.type}${o.castShadow && r.shadowMap.enabled ? '+shadow' : ''}${o.visible ? '' : ' (hidden)'}`;
    lights[k] = (lights[k] ?? 0) + 1;
  });
  return {
    tier: e.getQualityTier(),
    shadows: r.shadowMap.enabled,
    totalPrograms: r.info.programs.length,
    meshes,
    lights,
    programs: [...byProgram.values()].map((x) => ({ id: x.id, name: x.name, meshes: x.meshes, materials: [...x.materials].slice(0, 6), features: [...x.features.entries()], keyLen: x.key.length })),
  };
});
report.programs.sort((a, b) => a.features[0][0].localeCompare(b.features[0][0]));
console.log(`${SCENE} @ ${report.tier} (shadows ${report.shadows}): ${report.programs.length} programs used by the scene, ${report.totalPrograms} alive in the renderer; ${report.meshes} drawables`);
console.log('lights:', JSON.stringify(report.lights));
const byType = {};
for (const p of report.programs) byType[p.name] = (byType[p.name] ?? 0) + 1;
console.log('programs by type:', JSON.stringify(byType));
for (const p of report.programs) {
  console.log(`#${p.id} ${p.name} ${p.meshes} meshes  [${p.materials.join(', ')}]`);
  for (const [f, n] of p.features) console.log(`     ${n}x ${f}`);
}
await browser.close();
