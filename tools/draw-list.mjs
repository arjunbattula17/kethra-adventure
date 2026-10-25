// Every draw call in one frame of a level, with what it draws: for finding which draws a budget can
// lose. Wraps the renderer's per-object draw for one frame once the level has settled (the lighting
// upgrade done), then prints the draws grouped by render pass and by kind of material, and writes
// the full list as JSON.
//
//   npm run build && npx vite preview --port 4180 --strictPort   (in another terminal)
//   node tools/draw-list.mjs <ship|kethra|vessek> [baseUrl] [--tier=low|high] [--out=file.json]
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { CHROME_ARGS } from './lib/probe.mjs';

const args = process.argv.slice(2);
const opt = (name, d) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? d;
const [LEVEL = 'ship', BASE = 'http://localhost:4180/kethra-adventure/'] = args.filter((a) => !a.startsWith('--'));
const TIER = opt('tier', 'low');
const OUT = opt('out', null);
const [query, kind] = {
  ship: ['?newGame=1&skipIntro=1', 'ShipInteriorScene'],
  kethra: ['?newGame=1&skipIntro=1&unlockKethra=1&jump=kethra', 'KethraScene'],
  vessek: ['?newGame=1&skipIntro=1&unlockVessek=1&jump=vessek', 'VessekScene'],
}[LEVEL];

const browser = await chromium.launch({ channel: 'chrome', args: CHROME_ARGS });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
await page.goto(`${BASE}${query}&tier=${TIER}&seed=7`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction((k) => window.__DEBUG__?.engine.getCurrentScene()?.kind === k && !window.__DEBUG__.flow.isTransitioning(), kind, { timeout: 240000, polling: 250 });
await page.waitForTimeout(6000);
await page.waitForFunction(() => window.__DEBUG__.engine.preparing === 0, null, { timeout: 600000, polling: 500 });
await page.waitForTimeout(1000);

const draws = await page.evaluate(async () => {
  const renderer = window.__DEBUG__.engine.renderer;
  const original = renderer.renderBufferDirect;
  const out = [];
  const path = (o) => {
    const names = [];
    for (let p = o; p && names.length < 4; p = p.parent) if (p.name) names.push(p.name);
    return names.join(' < ');
  };
  renderer.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
    const target = renderer.getRenderTarget();
    const maps = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap', 'aoMap'].filter((k) => material[k]);
    out.push({
      pass: target ? target.texture?.name || `${target.width}x${target.height}` : 'screen',
      camera: camera.type,
      object: path(object) || object.type,
      objectType: object.type,
      instances: object.isInstancedMesh ? object.count : 1,
      material: material.name || '',
      materialType: material.type,
      maps,
      canvasMap: !!material.map?.isCanvasTexture,
      transparent: material.transparent,
      emissive: material.emissive ? material.emissive.getHex() !== 0 && material.emissiveIntensity > 0 : false,
      vertexColors: material.vertexColors,
      color: material.color?.getHexString(),
      emissiveHex: material.emissive?.getHexString(),
      emissiveIntensity: material.emissiveIntensity,
      roughness: material.roughness,
      metalness: material.metalness,
      opacity: material.opacity,
      side: material.side,
      blending: material.blending,
      depthWrite: material.depthWrite,
      flatShading: material.flatShading,
      customShader: material.onBeforeCompile.toString().length > 20 || material.type === 'ShaderMaterial',
      shadows: `${object.castShadow ? 'c' : '-'}${object.receiveShadow ? 'r' : '-'}`,
      renderOrder: object.renderOrder,
      mapInfo: material.map ? `${material.map.image?.width}x${material.map.image?.height} wrap${material.map.wrapS} rep${material.map.repeat.x.toFixed(2)},${material.map.repeat.y.toFixed(2)}` : null,
      materialId: material.uuid.slice(0, 8),
      attributes: Object.keys(geometry.attributes).join(","),
      rest: [material.envMapIntensity, material.polygonOffset && `po${material.polygonOffsetFactor},${material.polygonOffsetUnits}`, material.fog, material.toneMapped, material.alphaTest, material.depthTest, material.dithering].join("/"),
      triangles: Math.round((geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3) * (object.isInstancedMesh ? object.count : 1),
    });
    return original.apply(this, arguments);
  };
  // Two frames: the first wrapped draw can fall mid-frame.
  await new Promise((r) => requestAnimationFrame(r));
  out.length = 0;
  await new Promise((r) => requestAnimationFrame(r));
  await new Promise((r) => requestAnimationFrame(r));
  renderer.renderBufferDirect = original;
  return out;
});
await browser.close();

// The two frames' lists are the same length when nothing changes between them; keep the last.
const half = draws.length / 2;
const frame = Number.isInteger(half) ? draws.slice(half) : draws;
console.log(`${LEVEL} (${TIER}): ${frame.length} draws in a frame`);
const count = (keyOf, list) => {
  const m = new Map();
  for (const d of list) m.set(keyOf(d), (m.get(keyOf(d)) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1]);
};
console.log('\nby pass:');
for (const [k, n] of count((d) => `${d.pass} (${d.camera})`, frame)) console.log(`  ${String(n).padStart(4)}  ${k}`);
const scenePass = frame.filter((d) => d.camera === 'PerspectiveCamera');
const kindOf = (d) => {
  if (d.objectType === 'InstancedMesh') return 'instanced';
  if (d.canvasMap) return d.transparent ? 'canvas-painted, transparent' : 'canvas-painted';
  if (d.maps.length) return d.transparent ? 'file-textured, transparent' : 'file-textured';
  if (d.vertexColors) return 'vertex-coloured';
  return `untextured${d.transparent ? ', transparent' : ''}${d.emissive ? ', glowing' : ''}`;
};
console.log('\nperspective draws by kind:');
for (const [k, n] of count(kindOf, scenePass)) console.log(`  ${String(n).padStart(4)}  ${k}`);
console.log('\nperspective draws by material type:');
for (const [k, n] of count((d) => d.materialType, scenePass)) console.log(`  ${String(n).padStart(4)}  ${k}`);
if (OUT) {
  writeFileSync(OUT, JSON.stringify(frame, null, 1));
  console.log(`\nfull list: ${OUT}`);
}
