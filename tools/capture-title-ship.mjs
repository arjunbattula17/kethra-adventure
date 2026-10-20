// The title ship from every side, for looking it over: the live title scene in installed Chrome on this
// machine's GPU, the menu hidden, the rocks and dust put away, the clock stopped, and the camera moved
// round the ship where it floats (the lighting stays the scene's own, so the far side is in shade the
// way it would be). Also the title itself, as a player sees it once the ship has arrived.
//
//   npx vite --port 4191 --strictPort     (in another terminal)
//   node tools/capture-title-ship.mjs <label> [baseUrl] [--w=1600] [--h=900] [--thrust=0] [--views=a,b]
//
// Writes renders/title-ship/<label>/<view>.png and a contact sheet, sheet.png.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { CHROME_ARGS } from './lib/probe.mjs';

const args = process.argv.slice(2);
const opt = (name, d) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? d;
const [LABEL = 'ship', BASE = 'http://localhost:4191/kethra-adventure/'] = args.filter((a) => !a.startsWith('--'));
const W = Number(opt('w', 1600));
const H = Number(opt('h', 900));
const THRUST = Number(opt('thrust', 0));
const OUT = `renders/title-ship/${LABEL}`;
mkdirSync(OUT, { recursive: true });

// Where the camera sits, in ship axes (+X nose, +Y dorsal, +Z starboard), as a direction and a distance
// in ship lengths; what it looks at (ship units); its field of view.
const VIEWS = {
  front: { dir: [1, 0.02, 0], dist: 1.3 },
  rear: { dir: [-1, 0.02, 0], dist: 1.3 },
  left: { dir: [0, 0.02, -1], dist: 1.25 },
  right: { dir: [0, 0.02, 1], dist: 1.25 },
  top: { dir: [0, 1, 0], dist: 1.7, up: [1, 0, 0] },
  bottom: { dir: [0, -1, 0], dist: 1.7, up: [1, 0, 0] },
  'front-left': { dir: [1, 0.35, -0.9], dist: 1.25 },
  'front-right': { dir: [1, 0.35, 0.9], dist: 1.25 },
  'rear-left': { dir: [-1, 0.4, -0.9], dist: 1.25 },
  'rear-right': { dir: [-1, 0.4, 0.9], dist: 1.25 },
  'nose-close': { dir: [1, 0.25, -0.55], dist: 0.62, at: [4.2, 0.1, 0], fov: 34 },
  'rear-close': { dir: [-1, 0.22, -0.45], dist: 0.6, at: [-5.2, 0, 0], fov: 34 },
  'under-close': { dir: [0.25, -1, -0.5], dist: 0.62, at: [-0.5, -0.6, 0], fov: 34 },
  'low-front': { dir: [1, -0.3, -0.6], dist: 1.25 },
};
const only = opt('views', '');
const names = only ? only.split(',') : [...Object.keys(VIEWS), 'title'];

const browser = await chromium.launch({ channel: 'chrome', headless: !args.includes('--headed'), args: CHROME_ARGS });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(BASE, { waitUntil: 'load' });
await page.waitForFunction(() => window.__DEBUG__?.engine?.getCurrentScene()?.kind === 'TitleScene' && window.__DEBUG__.engine.getCurrentScene().ship, null, { timeout: 120000, polling: 250 });
// The entrance: 2 s wait, ~1 s flight, the plumes out by ~4 s.
await page.waitForTimeout(6500);

const shots = [];
for (const name of names) {
  if (name === 'title') {
    await page.evaluate(() => {
      const s = window.__DEBUG__.engine.getCurrentScene();
      if (s.__orig) s.update = s.__orig;
      for (const o of [s.rocks.mesh, s.debris.group, s.fx.group]) o.visible = true;
      document.querySelector('.title-screen').style.visibility = '';
    });
    await page.waitForTimeout(600);
  } else {
    const view = VIEWS[name];
    await page.evaluate(
      ([view, thrust]) => {
        const s = window.__DEBUG__.engine.getCurrentScene();
        const THREE = { V: s.camera.position.constructor };
        if (!s.__orig) s.__orig = s.update;
        const orig = s.__orig;
        for (const o of [s.rocks.mesh, s.debris.group, s.fx.group]) o.visible = false;
        document.querySelector('.title-screen').style.visibility = 'hidden';
        s.update = function () {
          orig.call(this, 0);
          const g = this.ship.group;
          this.ship.update(this.elapsed, thrust);
          g.updateMatrixWorld(true);
          const len = 12 * g.scale.x;
          const d = new THREE.V(...view.dir).normalize();
          const at = new THREE.V(...(view.at ?? [0, 0, 0])).applyMatrix4(g.matrixWorld);
          const dirW = d.applyQuaternion(g.quaternion);
          this.camera.position.copy(at).addScaledVector(dirW, view.dist * len);
          this.camera.up.copy(new THREE.V(...(view.up ?? [0, 1, 0])).applyQuaternion(g.quaternion));
          this.camera.fov = view.fov ?? 40;
          this.camera.updateProjectionMatrix();
          this.camera.lookAt(at);
          this.camera.up.set(0, 1, 0);
        };
      },
      [view, THRUST],
    );
    await page.waitForTimeout(500);
  }
  const png = await page.screenshot();
  writeFileSync(`${OUT}/${name}.png`, png);
  shots.push([name, png.toString('base64')]);
  console.log('captured', name);
}

// A contact sheet: three across.
const sheet = await browser.newPage({ viewport: { width: 1800, height: 400 } });
await sheet.setContent(
  `<body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(3,600px);font:14px sans-serif;color:#ccc">` +
    shots.map(([n, b]) => `<div style="position:relative"><img style="width:600px;display:block" src="data:image/png;base64,${b}"><span style="position:absolute;left:6px;top:4px">${n}</span></div>`).join('') +
    `</body>`,
);
await sheet.screenshot({ path: `${OUT}/sheet.png`, fullPage: true });
if (errors.length) console.log('page errors:\n' + [...new Set(errors)].slice(0, 20).join('\n'));
await browser.close();
