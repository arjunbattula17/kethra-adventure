// The performance "bar": a real per-frame timing trace on a defined, reproducible bad-laptop
// profile — not an FPS average, which hides the stutters that actually feel like lag. Reports
// p50/p95/p99 frame time in milliseconds, plus dropped-frame rate against a 16.7ms (60fps) and
// 33.3ms (30fps) budget.
//
//   node tools/frame-trace.mjs <presetName> [outFile] [--good]
//
// Presets are defined in PRESETS below — one per judgeable "piece" of the app. Each preset is a
// page.evaluate() callback that drives the game into the piece's state (teleport, open a panel,
// travel to a scene) using the same window.__DEBUG__ hooks the existing capture tools use.
//
// The bad-laptop profile (BAD_LAPTOP below) is deliberately concrete and reproducible: Chrome
// DevTools Protocol CPU throttling at 4x slowdown (the same rate Lighthouse uses to simulate a
// mid-tier low-end device) plus a hardwareConcurrency override to 2 (a genuinely weak dual-core
// machine, not the 8-16 logical cores a real dev machine reports). --good runs unthrottled instead,
// so a piece's own before/after or good-vs-bad delta is directly comparable.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5180';
const SAMPLE_FRAMES = 300; // 5s at 60fps, or a lot more wall-clock at 4x slowdown — plenty for stable percentiles
const BAD_LAPTOP = { cpuRate: 4, hardwareConcurrency: 2 };

const PRESETS = {
  'ship-hero': async (page) => {
    await gotoReady(page);
    await setShipView(page, [0, 1.62, 5.3], 0, -0.045, 70);
  },
  'ship-console': async (page) => {
    await gotoReady(page);
    await setShipView(page, [0, 1.6, -1.5], 0, -0.1, 62);
  },
  'ship-walk': async (page) => {
    // Movement is the case static-frame views can't catch: held input every frame for the whole
    // sample window, not just a static camera looking at static geometry.
    await gotoReady(page);
    // Same wait setShipView uses below: ShipInteriorScene.init() doesn't resolve (and doesn't
    // become window.__DEBUG__'s current scene) until the room's async kit-piece loading is fully
    // done, so without this poll a throttled run can start driving the player and sampling frames
    // while __DEBUG__.engine.getCurrentScene() is still the *previous* scene, or while this scene
    // is still mid-construction — capturing one-time load cost as if it were steady-state jank.
    await page.waitForFunction(
      () => (window.__DEBUG__.engine.getCurrentScene?.()?.kind ?? window.__DEBUG__.engine.getCurrentScene?.()?.constructor.name) === 'ShipInteriorScene',
      undefined,
      { timeout: 60000 },
    );
    await page.evaluate(() => {
      const s = window.__DEBUG__.engine.getCurrentScene();
      s.player.enabled = true;
      s.player.rig.position.set(0, 0, 5);
      s.player.rig.rotation.set(0, 0.6, 0);
    });
    await page.keyboard.down('KeyW');
  },
  'kethra-spawn': async (page) => {
    await gotoReady(page, '?skipIntro=1&unlockKethra=1');
    await page.evaluate(() => window.__DEBUG__.flow['travelToPlanet']?.('kethra'));
    await page.waitForTimeout(2500);
  },
  'character-panel': async (page) => {
    await gotoReady(page);
    // Same guard ship-hero/ship-console/ship-walk use: without it, a throttled run can still be
    // mid-way through ShipInteriorScene's async construction (buildWalls/buildAirlock/
    // buildDetailProps + batchStaticGeometry) and Engine.setScene's compileAsync warm-up when Tab
    // is pressed, landing that one-time load cost as a multi-second single frame in the trace.
    await page.waitForFunction(
      () => (window.__DEBUG__.engine.getCurrentScene?.()?.kind ?? window.__DEBUG__.engine.getCurrentScene?.()?.constructor.name) === 'ShipInteriorScene',
      undefined,
      { timeout: 60000 },
    );
    await page.keyboard.press('Tab');
    await page.waitForTimeout(400);
  },
  'solar-map': async (page) => {
    await gotoReady(page, '?skipIntro=1&unlockKethra=1');
    await page.evaluate(() => window.__DEBUG__.bus.emit('ui:open_galaxy_map'));
    await page.waitForTimeout(600);
  },
  'galaxy-reveal': async (page) => {
    await gotoReady(page);
    await page.evaluate(() => window.__DEBUG__.flow['transitionToGalaxyReveal']?.());
    // transitionToGalaxyReveal() is async and doesn't resolve until its own fade-to-black, scene
    // init (real GLTF loading for the kitbashed ship hull), and fade-from-black are all done, so a
    // fixed wait from here can land at very different points in the cinematic depending on how long
    // that load took -- corrupting this preset's frame-time sample with whatever keyframe it happens
    // to catch. Anchor to the ship actually existing, then take a short fixed settle from there.
    await page.waitForFunction(
      () => {
        const s = window.__DEBUG__.engine.getCurrentScene();
        return !!s?.ship;
      },
      undefined,
      { timeout: 30000 },
    );
    await page.waitForTimeout(1500);
  },
};

async function gotoReady(page, query = '?skipIntro=1&newGame=1') {
  await page.goto(BASE_URL + query, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForFunction(() => !!window.__DEBUG__?.gameState, undefined, { timeout: 45000 });
  await page.waitForTimeout(1500);
}

async function setShipView(page, pos, yaw, pitch, fov) {
  // Generous timeout: under CPU throttling, the room's ~100 async glTF kit-piece fetches/parses
  // (walls, floor, columns) run visibly slower — this is scene *construction*, not yet the traced
  // steady-state frame loop below, so a long one-time wait here doesn't affect the trace itself.
  await page.waitForFunction(
    () => (window.__DEBUG__.engine.getCurrentScene?.()?.kind ?? window.__DEBUG__.engine.getCurrentScene?.()?.constructor.name) === 'ShipInteriorScene',
    undefined,
    { timeout: 60000 },
  );
  await page.evaluate(
    ({ pos, yaw, pitch, fov }) => {
      const s = window.__DEBUG__.engine.getCurrentScene();
      s.player.enabled = false;
      s.player.rig.position.set(pos[0], 0, pos[2]);
      s.player.rig.rotation.set(0, yaw, 0);
      s.camera.position.set(0, pos[1], 0);
      s.camera.rotation.set(pitch, 0, 0);
      s.camera.fov = fov;
      s.camera.updateProjectionMatrix();
    },
    { pos, yaw, pitch, fov },
  );
  await page.waitForTimeout(400);
}

function percentile(sorted, p) {
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

async function trace(presetName, throttle) {
  const preset = PRESETS[presetName];
  if (!preset) throw new Error(`unknown preset "${presetName}" — known: ${Object.keys(PRESETS).join(', ')}`);

  const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  const cdp = await page.context().newCDPSession(page);
  if (throttle) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: BAD_LAPTOP.cpuRate });
    await cdp.send('Emulation.setHardwareConcurrencyOverride', { hardwareConcurrency: BAD_LAPTOP.hardwareConcurrency });
  }

  await preset(page);

  const frameTimes = await page.evaluate(async (n) => {
    const times = [];
    let last = performance.now();
    await new Promise((resolve) => {
      let count = 0;
      function tick() {
        const now = performance.now();
        times.push(now - last);
        last = now;
        count++;
        if (count < n) requestAnimationFrame(tick);
        else resolve();
      }
      requestAnimationFrame(tick);
    });
    return times;
  }, SAMPLE_FRAMES);
  frameTimes.shift(); // first delta is bogus (time since a pre-sample frame)

  await page.keyboard.up('KeyW').catch(() => {});
  await browser.close();

  const sorted = [...frameTimes].sort((a, b) => a - b);
  const n = sorted.length;
  const drop60 = (sorted.filter((t) => t > 16.7).length / n) * 100;
  const drop30 = (sorted.filter((t) => t > 33.3).length / n) * 100;

  return {
    preset: presetName,
    throttled: throttle,
    throttle: throttle ? BAD_LAPTOP : null,
    samples: n,
    p50: +percentile(sorted, 0.5).toFixed(2),
    p95: +percentile(sorted, 0.95).toFixed(2),
    p99: +percentile(sorted, 0.99).toFixed(2),
    max: +sorted[n - 1].toFixed(2),
    dropRate60fps: +drop60.toFixed(1),
    dropRate30fps: +drop30.toFixed(1),
    pageErrors: [...new Set(pageErrors)],
  };
}

const [presetName, outFile] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const good = process.argv.includes('--good');
if (!presetName) {
  console.error(`usage: node tools/frame-trace.mjs <preset> [outFile] [--good]\nknown presets: ${Object.keys(PRESETS).join(', ')}`);
  process.exit(1);
}

const result = await trace(presetName, !good);
console.log(JSON.stringify(result, null, 2));
if (outFile) writeFileSync(outFile, JSON.stringify(result, null, 2));
