// Raycasts from a camera pose through given screen pixels and reports what each ray hits:
// geometry, material state, world bounds. Turns "that grey box in the screenshot" into a
// concrete object without guessing at projection math.
// Usage: node tools/probe-pixel.mjs "<x,z,yaw,pitch>" "<px,py>" ["<px,py>" ...]
import { chromium } from 'playwright';

const baseUrl = process.env.BASE_URL || 'http://localhost:5180/kethra-adventure/';
const [px, pz, pyaw, ppitch] = process.argv[2].split(',').map(Number);
const pixels = process.argv.slice(3).map((s) => s.split(',').map(Number));
const W = Number(process.env.W || 1600), H = Number(process.env.H || 900);

const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.goto(baseUrl + '?skipIntro=1&newGame=1&nobatch=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForFunction(() => !!window.__DEBUG__?.gameState, undefined, { timeout: 90000 });
await page.waitForFunction(() => {
  const s = window.__DEBUG__.engine.getCurrentScene?.();
  return !!(s && s.player && s.constructor.name === 'ShipInteriorScene');
}, undefined, { timeout: 90000 });
await page.waitForTimeout(3500);

const out = await page.evaluate(({ px, pz, pyaw, ppitch, pixels, W, H }) => {
  const sc = window.__DEBUG__.engine.getCurrentScene();
  sc.player.enabled = false;
  sc.player.rig.position.set(px, 0, pz);
  sc.player.rig.rotation.set(0, pyaw, 0);
  sc.camera.position.set(0, 1.7, 0);
  sc.camera.rotation.set(ppitch, 0, 0);
  sc.camera.fov = 70;
  sc.camera.updateProjectionMatrix();
  sc.scene.updateMatrixWorld(true);

  const V = sc.player.rig.position.constructor;
  const ray = new (Object.getPrototypeOf(sc.interaction).constructor === Object ? null : Object)();
  // Build a raycaster from the three instance already on the scene's objects.
  const three = sc.camera.constructor;
  const Raycaster = window.__RC__ || null;
  const results = [];
  for (const [x, y] of pixels) {
    const ndc = { x: (x / W) * 2 - 1, y: -(y / H) * 2 + 1 };
    // Manual ray: unproject two points along the frustum.
    const near = new V(ndc.x, ndc.y, -1).unproject(sc.camera);
    const far = new V(ndc.x, ndc.y, 1).unproject(sc.camera);
    const dir = far.clone().sub(near).normalize();
    const origin = near;
    // Brute-force triangle-free test: use per-mesh bounding-box ray intersection, nearest first.
    let best = null;
    sc.scene.traverse((o) => {
      if (!o.isMesh || !o.visible || !o.geometry) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
      // slab test
      let t0 = -Infinity, t1 = Infinity;
      for (const ax of ['x', 'y', 'z']) {
        const inv = 1 / (dir[ax] || 1e-12);
        let ta = (bb.min[ax] - origin[ax]) * inv, tb = (bb.max[ax] - origin[ax]) * inv;
        if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      }
      if (t1 < Math.max(t0, 0)) return;
      const t = t0 > 0 ? t0 : t1;
      if (best && best.t <= t) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      best = {
        t,
        geom: o.geometry.type,
        name: o.name,
        min: [bb.min.x, bb.min.y, bb.min.z].map((v) => +v.toFixed(3)),
        max: [bb.max.x, bb.max.y, bb.max.z].map((v) => +v.toFixed(3)),
        mat: {
          type: m.type, name: m.name || '',
          color: m.color ? '#' + m.color.getHexString() : null,
          emissive: m.emissive ? '#' + m.emissive.getHexString() : null,
          emissiveIntensity: m.emissiveIntensity ?? null,
          hasMap: !!m.map, transparent: !!m.transparent, opacity: m.opacity,
        },
      };
    });
    results.push({ pixel: [x, y], hit: best });
  }
  return results;
}, { px, pz, pyaw, ppitch, pixels, W, H });

for (const r of out) console.log(JSON.stringify(r));
await browser.close();
