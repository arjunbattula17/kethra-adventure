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
  return !!(s && s.player && (s.kind ?? s.constructor.name) === 'ShipInteriorScene');
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

  // Borrow the live THREE.Raycaster the interaction system already owns rather than reconstructing
  // one: it does real triangle intersection and, unlike an AABB test against geometry.boundingBox,
  // it resolves InstancedMesh hits to the specific instance instead of the base shape at the origin.
  const rc = sc.interaction.raycaster;
  const results = [];
  for (const [x, y] of pixels) {
    rc.setFromCamera({ x: (x / W) * 2 - 1, y: -(y / H) * 2 + 1 }, sc.camera);
    rc.far = 200;
    const hits = rc.intersectObjects(sc.scene.children, true).filter((h) => {
      const m = Array.isArray(h.object.material) ? h.object.material[0] : h.object.material;
      return h.object.visible && !(m && m.transparent && m.opacity < 0.2);
    });
    const h = hits[0];
    if (!h) { results.push({ pixel: [x, y], hit: null }); continue; }
    const o = h.object;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    const box = o.geometry.boundingBox ? o.geometry.boundingBox.clone() : null;
    let world = null;
    if (box) {
      const mat = o.matrixWorld.clone();
      if (o.isInstancedMesh && h.instanceId !== undefined) {
        const im = new o.matrixWorld.constructor();
        o.getMatrixAt(h.instanceId, im);
        mat.multiply(im);
      }
      box.applyMatrix4(mat);
      world = { min: [box.min.x, box.min.y, box.min.z].map((v) => +v.toFixed(3)), max: [box.max.x, box.max.y, box.max.z].map((v) => +v.toFixed(3)) };
    }
    results.push({
      pixel: [x, y],
      hit: {
        dist: +h.distance.toFixed(3),
        point: [h.point.x, h.point.y, h.point.z].map((v) => +v.toFixed(3)),
        geom: o.geometry.type,
        name: o.name,
        instanced: !!o.isInstancedMesh,
        instanceId: h.instanceId ?? null,
        world,
        mat: {
          type: m.type, name: m.name || '',
          color: m.color ? '#' + m.color.getHexString() : null,
          emissive: m.emissive ? '#' + m.emissive.getHexString() : null,
          emissiveIntensity: m.emissiveIntensity ?? null,
          hasMap: !!m.map, transparent: !!m.transparent, opacity: m.opacity,
        },
      },
    });
  }
  return results;
}, { px, pz, pyaw, ppitch, pixels, W, H });

for (const r of out) console.log(JSON.stringify(r));
await browser.close();
