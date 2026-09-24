// Inventories every texture each first-hour scene actually binds, with its resolution, source,
// mip status, estimated GPU memory and MEASURED texel density (texels per world metre, from the
// real geometry and UVs of every mesh that uses it). The density is what the texture pass is judged
// against: see TEXTURE_AUDIT.md for the standard. Writes a JSON report; tools/texture-audit-md.mjs
// turns one or two of them into the audit table.
//
//   npm run dev   (in another terminal; the dev server keeps real file names in stack traces,
//                  which is how procedural canvas textures get traced back to their builder)
//   node tools/texture-audit.mjs [baseUrl] [out.json]
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const BASE = process.argv[2] || 'http://localhost:5173/kethra-adventure/';
const OUT = process.argv[3] || 'reports/texture-audit.json';

const SCENES = [
  { id: 'intro', query: '?newGame=1&tier=high', kind: 'IntroScene' },
  { id: 'ship', query: '?skipIntro=1&newGame=1&tier=high', kind: 'ShipInteriorScene' },
  { id: 'reveal', query: '?skipIntro=1&newGame=1&tier=high', kind: 'GalaxyRevealScene', go: 'transitionToGalaxyReveal' },
  { id: 'kethra', query: '?skipIntro=1&unlockKethra=1&newGame=1&tier=high', kind: 'KethraScene', go: 'kethra' },
];

const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});

const report = {};
for (const sc of SCENES) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  // Tag every canvas with the first project source frame that created it, so a procedural texture
  // in the report names its builder instead of reading as an anonymous "canvas".
  await page.addInitScript(() => {
    const orig = Document.prototype.createElement;
    Document.prototype.createElement = function (tag, ...rest) {
      const el = orig.call(this, tag, ...rest);
      if (String(tag).toLowerCase() === 'canvas') {
        // Two project frames: the first is often a shared canvas helper, the second the builder.
        const frames = (new Error().stack || '').split('\n').filter((l) => l.includes('/src/')).slice(0, 2);
        el.__origin =
          frames
            .map((f) => {
              const m = f.match(/\/src\/([^?:)]+)[^:]*:(\d+)/);
              const fn = f.match(/at (\S+) \(/);
              return m ? `${m[1]}:${m[2]}${fn ? ' ' + fn[1] : ''}` : '';
            })
            .join(' <- ') || 'canvas';
      }
      return el;
    };
  });
  await page.goto(BASE + sc.query, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__DEBUG__?.engine.getCurrentScene(), undefined, { timeout: 240000, polling: 250 });
  if (sc.go === 'transitionToGalaxyReveal') {
    await page.waitForFunction(() => window.__DEBUG__.engine.getCurrentScene()?.kind === 'ShipInteriorScene', undefined, { timeout: 240000, polling: 250 });
    await page.evaluate(() => window.__DEBUG__.flow.transitionToGalaxyReveal());
  } else if (sc.go === 'kethra') {
    await page.evaluate(() => window.__DEBUG__.flow.travelToPlanet('kethra'));
  }
  await page.waitForFunction(
    (kind) => {
      const s = window.__DEBUG__.engine.getCurrentScene();
      return (s?.kind ?? s?.constructor.name) === kind || (kind === 'GalaxyRevealScene' && !!s?.ship && !s.player);
    },
    sc.kind,
    { timeout: 240000, polling: 250 },
  );
  // Async texture loads (the intro's sky, kit maps) settle after the scene reports ready.
  await page.waitForTimeout(4000);

  report[sc.id] = await page.evaluate(() => {
    const scene = window.__DEBUG__.engine.getCurrentScene().scene;
    scene.updateMatrixWorld(true);
    const SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'lightMap', 'displacementMap'];
    const rows = new Map();
    const srcOf = (t) => {
      const img = t.image;
      if (!img) return 'none';
      if (img.__origin) return 'canvas: ' + img.__origin;
      if (img.src) return decodeURIComponent(img.src.replace(/^.*\/kethra-adventure\//, '').replace(/^blob:.*/, 'glb-embedded'));
      if (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap) return t.userData?.url || t.name || 'imagebitmap (glTF)';
      if (img.data) return 'data texture';
      return t.name || img.constructor?.name || '?';
    };
    const a = { x: 0, y: 0, z: 0 };
    const v0 = new (scene.position.constructor)(), v1 = v0.clone(), v2 = v0.clone(), e1 = v0.clone(), e2 = v0.clone();
    const measure = (mesh, t, row) => {
      const g = mesh.geometry;
      const pos = g?.attributes?.position, uv = g?.attributes?.uv;
      if (!pos || !uv) return;
      const idx = g.index;
      const tri = idx ? idx.count / 3 : pos.count / 3;
      const step = Math.max(1, Math.floor(tri / 40000)); // sample huge meshes
      let world = 0, uvA = 0;
      const mw = mesh.matrixWorld.clone();
      if (mesh.isInstancedMesh && mesh.count > 0) {
        const im = mw.clone(); mesh.getMatrixAt(0, im); mw.multiply(im);
      }
      const rx = t.repeat?.x ?? 1, ry = t.repeat?.y ?? 1;
      for (let i = 0; i < tri; i += step) {
        const i0 = idx ? idx.getX(i * 3) : i * 3, i1 = idx ? idx.getX(i * 3 + 1) : i * 3 + 1, i2 = idx ? idx.getX(i * 3 + 2) : i * 3 + 2;
        v0.fromBufferAttribute(pos, i0).applyMatrix4(mw); v1.fromBufferAttribute(pos, i1).applyMatrix4(mw); v2.fromBufferAttribute(pos, i2).applyMatrix4(mw);
        world += e1.subVectors(v1, v0).cross(e2.subVectors(v2, v0)).length() / 2;
        const u0 = uv.getX(i0) * rx, w0 = uv.getY(i0) * ry, u1 = uv.getX(i1) * rx, w1 = uv.getY(i1) * ry, u2 = uv.getX(i2) * rx, w2 = uv.getY(i2) * ry;
        uvA += Math.abs((u1 - u0) * (w2 - w0) - (u2 - u0) * (w1 - w0)) / 2;
      }
      if (world < 1e-6 || uvA < 1e-9) return;
      const w = t.image?.width || 0, h = t.image?.height || 0;
      const density = Math.sqrt((uvA * w * h) / world);
      row.densities.push(density);
      row.worldArea += world * step;
      a.x++;
    };
    // Content hash for canvas textures, so pixel-identical canvases built once per placement show
    // up as duplicates (each one is a separate GPU upload).
    const hashOf = (t) => {
      const img = t.image;
      if (!img?.getContext) return null;
      try {
        const d = img.getContext('2d').getImageData(0, 0, img.width, img.height).data;
        let h = 2166136261;
        for (let i = 0; i < d.length; i += 7) h = Math.imul(h ^ d[i], 16777619);
        return (h >>> 0).toString(16) + '-' + img.width + 'x' + img.height;
      } catch {
        return null;
      }
    };
    const record = (t, obj, mat, slot) => {
      // Keyed by the image source, not the Texture: clones (every glTF material clone makes one)
      // share a Source, and three.js uploads a Source to the GPU once.
      const key = t.source?.uuid ?? t.uuid;
      let row = rows.get(key);
      if (!row) {
        const w = t.image?.width || 0, h = t.image?.height || 0;
        const mips = t.generateMipmaps !== false && t.minFilter !== 1006 && t.minFilter !== 1003; // Linear/Nearest = no mips
        row = {
          source: srcOf(t), w, h, slot, mips, hash: hashOf(t), anisotropy: t.anisotropy, colorSpace: t.colorSpace,
          bytes: Math.round(w * h * 4 * (mips ? 4 / 3 : 1)),
          users: new Set(), densities: [], worldArea: 0, visibleUse: false,
        };
        rows.set(key, row);
      }
      row.users.add((obj.name || obj.type) + (mat.name ? `/${mat.name}` : ''));
      if (obj.visible && mat.visible !== false) row.visibleUse = true;
      if (obj.isMesh) measure(obj, t, row);
    };
    scene.traverse((o) => {
      if (!o.material) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        for (const s of SLOTS) if (m[s]?.isTexture) record(m[s], o, m, s);
        if (m.uniforms) for (const [k, u] of Object.entries(m.uniforms)) if (u?.value?.isTexture) record(u.value, o, m, 'uniform:' + k);
      }
    });
    if (scene.background?.isTexture) record(scene.background, { name: 'scene.background', type: 'Scene', visible: true }, { name: '' }, 'background');
    const out = [...rows.values()].map((r) => {
      const d = r.densities.sort((x, y) => x - y);
      return {
        source: r.source, hash: r.hash, w: r.w, h: r.h, slot: r.slot, mips: r.mips, anisotropy: r.anisotropy, colorSpace: r.colorSpace,
        bytes: r.bytes, users: [...r.users].slice(0, 4), userCount: r.users.size, visibleUse: r.visibleUse,
        densityMin: d.length ? Math.round(d[0]) : null, densityMedian: d.length ? Math.round(d[Math.floor(d.length / 2)]) : null,
      };
    });
    const info = window.__DEBUG__.engine.renderer.info.memory;
    return { textures: out, rendererTextures: info.textures, totalBytes: out.reduce((s, r) => s + r.bytes, 0) };
  });
  console.log(sc.id, report[sc.id].textures.length, 'textures', (report[sc.id].totalBytes / 1048576).toFixed(1), 'MB est.');
  await page.close();
}
await browser.close();
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(report, null, 1));
console.log('wrote', OUT);
