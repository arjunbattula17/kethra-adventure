// What a level holds in memory, by kind: every texture its materials reach (file images, canvases,
// data textures) with an estimate of its GPU bytes (w*h*4, x4/3 with mipmaps), the canvases kept
// alive behind canvas textures, geometry buffer bytes, and Chrome's private memory per process.
//
//   node tools/memory-probe.mjs <label> [baseUrl] [--levels=ship,kethra,vessek] [--tier=low]
//
// One fresh profile per level (installed Chrome, ANGLE D3D11, 1366x768), measured 8 s after the
// level is playable, after a forced garbage collection. Writes docs/perf/<label>/memory.json.
import { chromium } from 'playwright';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (name, d) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? d;
const [LABEL = 'memory', BASE = 'http://127.0.0.1:4193/kethra-adventure/'] = args.filter((a) => !a.startsWith('--'));
const LEVELS = opt('levels', 'ship,kethra,vessek').split(',');
const TIER = opt('tier', 'low');
const OUT = `docs/perf/${LABEL}`;
mkdirSync(OUT, { recursive: true });
const JUMP = { ship: ['ShipInteriorScene', ''], kethra: ['KethraScene', '&unlockKethra=1&jump=kethra'], vessek: ['VessekScene', '&unlockVessek=1&jump=vessek'] };

function chromeMemory(tag) {
  const ps = `$all = Get-CimInstance Win32_Process -Filter "name='chrome.exe'"; $root = $all | Where-Object { $_.CommandLine -match '${tag}' -and $_.CommandLine -notmatch '--type=' } | Select-Object -First 1; if ($root) { foreach ($k in ($all | Where-Object { $_.ProcessId -eq $root.ProcessId -or $_.ParentProcessId -eq $root.ProcessId })) { $t = if ($k.CommandLine -match '--type=([a-z-]+)') { $Matches[1] } else { 'browser' }; "$t $($k.PrivatePageCount)" } }`;
  const r = {};
  for (const line of execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim().split(/\r?\n/)) {
    const [t, p] = line.split(' ');
    r[t] = (r[t] ?? 0) + Math.round(Number(p) / 1048576);
  }
  return r;
}

const results = {};
for (const level of LEVELS) {
  const dir = mkdtempSync(join(tmpdir(), 'kethra-mem-'));
  const ctx = await chromium.launchPersistentContext(dir, {
    channel: 'chrome', headless: true, viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1,
    args: ['--use-angle=d3d11', '--enable-gpu', '--enable-precise-memory-info', '--js-flags=--expose-gc'],
  });
  const page = await ctx.newPage();
  const [kind, jump] = JUMP[level];
  await page.goto(`${BASE}?newGame=1&skipIntro=1&tier=${TIER}&seed=7${jump}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction((k) => window.__DEBUG__?.engine.getCurrentScene()?.kind === k && !window.__DEBUG__.flow.isTransitioning(), kind, { timeout: 300000, polling: 250 });
  await page.waitForTimeout(8000);
  const inPage = await page.evaluate(() => {
    window.gc?.();
    const engine = window.__DEBUG__.engine;
    const scene = engine.getCurrentScene().scene;
    const sources = new Map();
    const canvases = new Set();
    const note = (tex) => {
      if (!tex?.isTexture || !tex.source) return;
      const img = tex.source.data ?? tex.image;
      if (!img || sources.has(tex.source)) return;
      const w = img.width ?? 0;
      const h = img.height ?? 0;
      const depth = img.depth ?? 1;
      const kind = typeof HTMLCanvasElement !== 'undefined' && img instanceof HTMLCanvasElement ? 'canvas'
        : typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap ? 'bitmap'
          : typeof HTMLImageElement !== 'undefined' && img instanceof HTMLImageElement ? 'image'
            : tex.isCubeTexture ? 'cube' : 'data';
      const bpp = tex.type === 1016 /* HalfFloat */ ? 8 : tex.type === 1015 /* Float */ ? 16 : 4;
      const mips = tex.generateMipmaps && tex.minFilter !== 1006 && tex.minFilter !== 1003 ? 4 / 3 : 1;
      sources.set(tex.source, { kind, w, h, bytes: w * h * depth * bpp * mips * (tex.isCubeTexture ? 6 : 1), name: tex.name || '' });
      if (kind === 'canvas') canvases.add(img);
    };
    const geos = new Set();
    scene.traverse((o) => {
      if (o.geometry) geos.add(o.geometry);
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        for (const v of Object.values(m)) note(v);
        if (m.uniforms) for (const u of Object.values(m.uniforms)) note(u?.value);
      }
    });
    note(scene.background);
    note(scene.environment);
    let geoBytes = 0;
    for (const g of geos) {
      for (const a of Object.values(g.attributes)) geoBytes += a.array?.byteLength ?? 0;
      geoBytes += g.index?.array.byteLength ?? 0;
    }
    const byKind = {};
    for (const s of sources.values()) {
      const k = (byKind[s.kind] ??= { count: 0, MB: 0 });
      k.count++;
      k.MB += s.bytes / 1048576;
    }
    for (const k of Object.values(byKind)) k.MB = Math.round(k.MB);
    const top = [...sources.values()].sort((a, b) => b.bytes - a.bytes).slice(0, 12).map((s) => `${s.kind} ${s.w}x${s.h} ${(s.bytes / 1048576).toFixed(1)} MB ${s.name}`);
    let canvasMB = 0;
    for (const c of canvases) canvasMB += (c.width * c.height * 4) / 1048576;
    return {
      tier: engine.getQualityTier(),
      heapMB: Math.round(performance.memory.usedJSHeapSize / 1048576),
      info: { ...engine.renderer.info.memory, programs: engine.renderer.info.programs.length },
      texturesMB: byKind,
      canvasesKeptMB: Math.round(canvasMB),
      geometry: { count: geos.size, MB: Math.round(geoBytes / 1048576) },
      top,
    };
  });
  const tag = dir.split(/[\\/]/).at(-1);
  results[level] = { ...inPage, chromeMB: chromeMemory(tag) };
  // --experiment=free-canvases: what dropping every canvas behind an uploaded texture would give back
  // (shrinks them to 1x1 in place; a texture that re-uploads afterwards shows it in the screenshots).
  if (opt('experiment', '') === 'free-canvases') {
    await page.screenshot({ path: `${OUT}/${level}-before.png` });
    const freed = await page.evaluate(() => {
      const engine = window.__DEBUG__.engine;
      const props = engine.renderer.properties;
      const seen = new Set();
      let n = 0;
      engine.getCurrentScene().scene.traverse((o) => {
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of mats) {
          for (const v of [...Object.values(m), ...Object.values(m.uniforms ?? {}).map((u) => u?.value)]) {
            const img = v?.isTexture ? v.image : null;
            if (img instanceof HTMLCanvasElement && !seen.has(img) && props.get(v).__webglTexture) {
              seen.add(img);
              img.width = 1;
              img.height = 1;
              n++;
            }
          }
        }
      });
      return n;
    });
    await page.waitForTimeout(4000);
    await page.evaluate(() => window.gc?.());
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${OUT}/${level}-after.png` });
    results[level].freeCanvases = { freed, chromeMB: chromeMemory(tag) };
    console.log(`  freed ${freed} canvases: ${JSON.stringify(results[level].freeCanvases.chromeMB)}`);
  }
  console.log(`${level}: ${JSON.stringify(results[level], null, 0)}`);
  await ctx.close();
  rmSync(dir, { recursive: true, force: true });
}
writeFileSync(`${OUT}/memory.json`, JSON.stringify(results, null, 1));
