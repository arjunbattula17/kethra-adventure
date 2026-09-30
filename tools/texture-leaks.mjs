// Which GPU textures outlive the scene that made them. Hooks WebGL in the page to follow every texture
// from creation to deletion, tagged with the leg of the trip it was created in, then goes aboard the
// Wren, to Kethra, back, to Vessek, back, and to Kethra and back again (debugGo, no cruises). After each
// return it lists the textures still alive that were made on a planet leg, with their size and source.
//
//   npx vite preview --port 4190 --strictPort   (in another terminal)
//   node tools/texture-leaks.mjs [baseUrl] [--tier=low]
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const [BASE = 'http://localhost:4190/kethra-adventure/'] = args.filter((a) => !a.startsWith('--'));
const TIER = args.find((a) => a.startsWith('--tier='))?.split('=')[1] ?? 'low';

const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--use-angle=d3d11', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`));
await page.addInitScript(() => {
  const live = new Map();
  window.__tex = { live, epoch: 'boot' };
  const P = WebGL2RenderingContext.prototype;
  let unit = 0;
  const bound = new Map();
  const BPP = { 0x8058: 4, 0x8c43: 4, 0x881a: 8, 0x8814: 16, 0x8229: 1, 0x822b: 2, 0x88f0: 4, 0x81a6: 4, 0x8cac: 4, 0x1908: 4, 0x1907: 4, 0x8051: 4, 0x8c41: 4, 0x822f: 4, 0x8230: 8 };
  const wrap = (name, fn) => {
    const orig = P[name];
    P[name] = function (...a) {
      const r = orig.apply(this, a);
      try {
        fn.call(this, a, r);
      } catch {}
      return r;
    };
  };
  wrap('createTexture', (_, t) => live.set(t, { epoch: window.__tex.epoch, w: 0, h: 0, bytes: 0, src: '', mips: false }));
  wrap('deleteTexture', ([t]) => live.delete(t));
  wrap('activeTexture', ([u]) => (unit = u));
  wrap('bindTexture', ([target, t]) => bound.set(`${unit}:${target}`, t));
  const describe = (s) => {
    if (!s || typeof s !== 'object' || ArrayBuffer.isView(s)) return s ? 'data' : 'empty';
    const kind = s.constructor?.name ?? 'object';
    const src = s.currentSrc || s.src || '';
    return src ? `${kind} ${src.split('/').pop()}` : kind;
  };
  const record = (target, level, fmt, w, h, depth, source) => {
    const t = bound.get(`${unit}:${target}`);
    const e = t && live.get(t);
    if (!e || level !== 0) return;
    e.w = w;
    e.h = h;
    e.fmt = fmt;
    e.bytes = w * h * (depth || 1) * (BPP[fmt] ?? 4) * (target === 0x8513 || (target >= 0x8515 && target <= 0x851a) ? 6 : 1);
    if (source !== undefined) e.src = describe(source);
  };
  wrap('texStorage2D', ([target, levels, fmt, w, h]) => {
    record(target, 0, fmt, w, h, 1);
    const e = live.get(bound.get(`${unit}:${target}`));
    if (e && levels > 1) e.mips = true;
  });
  wrap('texStorage3D', ([target, , fmt, w, h, d]) => record(target, 0, fmt, w, h, d));
  wrap('texImage2D', (a) => {
    if (a.length >= 9) record(a[0], a[1], a[2], a[3], a[4], 1, a[8]);
    else {
      const s = a[5];
      record(a[0], a[1], a[2], s?.width ?? s?.videoWidth ?? 0, s?.height ?? s?.videoHeight ?? 0, 1, s);
    }
  });
  wrap('texSubImage2D', (a) => {
    // three.js allocates with texStorage2D, then fills with texSubImage2D: the source is here.
    const t = bound.get(`${unit}:${a[0]}`);
    const e = t && live.get(t);
    if (!e || a[1] !== 0 || e.src) return;
    e.src = describe(a.length >= 9 ? a[8] : a[6]);
  });
  wrap('generateMipmap', ([target]) => {
    const e = live.get(bound.get(`${unit}:${target}`));
    if (e) e.mips = true;
  });
});

const idle = () =>
  page.waitForFunction(() => window.__DEBUG__?.flow && !window.__DEBUG__.flow.isTransitioning() && window.__DEBUG__.engine.getCurrentScene() && !document.querySelector('.loading-indicator.visible'), null, { timeout: 600000, polling: 250 });
const go = async (epoch, target, kind) => {
  await page.evaluate((e) => (window.__tex.epoch = e), epoch);
  await page.evaluate((t) => window.__DEBUG__.flow.debugGo(t), target);
  await page.waitForFunction((k) => window.__DEBUG__.engine.getCurrentScene()?.kind === k, kind, { timeout: 600000, polling: 250 });
  await idle();
  await page.waitForTimeout(2500);
};
const report = async (title) => {
  const r = await page.evaluate(() => {
    const byEpoch = {};
    const rows = [];
    for (const e of window.__tex.live.values()) {
      const mb = (e.bytes * (e.mips ? 4 / 3 : 1)) / 1048576;
      const g = (byEpoch[e.epoch] ??= { count: 0, mb: 0 });
      g.count++;
      g.mb += mb;
      rows.push({ ...e, mb });
    }
    const info = window.__DEBUG__.engine.renderer.info.memory;
    return { byEpoch, rows, info, scene: window.__DEBUG__.engine.getCurrentScene()?.kind };
  });
  const total = Object.values(r.byEpoch).reduce((s, g) => s + g.mb, 0);
  console.log(`\n== ${title} (${r.scene}): ${r.rows.length} GL textures, ${total.toFixed(0)} MB; three.js counts ${r.info.textures} textures, ${r.info.geometries} geometries`);
  for (const [epoch, g] of Object.entries(r.byEpoch)) console.log(`   made during ${epoch.padEnd(10)} ${String(g.count).padStart(4)} textures ${g.mb.toFixed(1).padStart(7)} MB`);
  return r;
};
const leftovers = (r, epochs) => {
  const rows = r.rows.filter((x) => epochs.includes(x.epoch)).sort((a, b) => b.mb - a.mb);
  const groups = new Map();
  for (const x of rows) {
    const k = `${x.epoch} ${x.w}x${x.h} ${x.src}`;
    const g = groups.get(k) ?? { n: 0, mb: 0 };
    g.n++;
    g.mb += x.mb;
    groups.set(k, g);
  }
  for (const [k, g] of [...groups].sort((a, b) => b[1].mb - a[1].mb).slice(0, 30)) console.log(`     ${g.mb.toFixed(1).padStart(6)} MB  x${g.n}  ${k}`);
};

await page.goto(`${BASE}?newGame=1&unlockVessek=1&skipIntro=1&tier=${TIER}`);
await idle();
await page.waitForTimeout(2500);
await report('aboard');
await go('kethra', 'kethra', 'KethraScene');
await report('on Kethra');
await go('ship2', 'wren', 'ShipInteriorScene');
let r = await report('back from Kethra');
console.log('   made on Kethra and still alive:');
leftovers(r, ['kethra']);
await go('vessek', 'vessek', 'VessekScene');
await report('on Vessek');
await go('ship3', 'wren', 'ShipInteriorScene');
r = await report('back from Vessek');
console.log('   made on Vessek and still alive:');
leftovers(r, ['vessek']);
await go('kethra2', 'kethra', 'KethraScene');
await go('ship4', 'wren', 'ShipInteriorScene');
r = await report('back from Kethra again');
console.log('   made on the second Kethra visit and still alive:');
leftovers(r, ['kethra2']);
await browser.close();
