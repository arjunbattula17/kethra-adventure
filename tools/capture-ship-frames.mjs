// Deterministic frames of the Wren for before/after image diffs: installed Chrome on this machine's
// GPU, a pinned quality tier, and every frame drawn with the engine paused at a fixed scene clock, so
// two builds can be compared pixel for pixel (animation phase no longer differs between runs).
//
//   npx vite preview --port 4173   (and the other build on another port)
//   node tools/capture-ship-frames.mjs <baseUrl> <outDir> [--tier=low]
//   node tools/compare-renders.mjs <outDirA> <outDirB>
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const [BASE, OUT] = args.filter((a) => !a.startsWith('--'));
const TIER = args.find((a) => a.startsWith('--tier='))?.split('=')[1] ?? 'low';
mkdirSync(OUT, { recursive: true });

// [x, z, yaw, pitch]: spawn toward the console, the console close up, the airlock, both side walls,
// the ceiling, the floor, the viewport bay.
const VIEWS = {
  spawn: [0, 4, 0, 0],
  console: [0, -2, 0, -0.15],
  airlock: [0, 2, Math.PI, 0],
  port: [0, 0, Math.PI / 2, 0],
  starboard: [0, 0, -Math.PI / 2, 0],
  ceiling: [0, 1, 0.4, 0.9],
  floor: [0, 1, 0.3, -0.9],
  corner: [3.5, 5.5, 2.4, -0.05],
};

const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--use-angle=d3d11', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
await page.goto(`${BASE}?newGame=1&skipIntro=1&tier=${TIER}`);
await page.waitForFunction(() => performance.getEntriesByName('ship:playable').length > 0, undefined, { timeout: 300000 });
await page.waitForTimeout(2500);
await page.evaluate(() => {
  const e = window.__DEBUG__.engine;
  e.setPaused(true);
  document.querySelectorAll('.toast, .hud-prompt, .crosshair, .tut-card, .tutorial-hud').forEach((el) => (el.style.visibility = 'hidden'));
});
for (const [name, [x, z, yaw, pitch]] of Object.entries(VIEWS)) {
  await page.evaluate(([x, z, yaw, pitch]) => {
    const e = window.__DEBUG__.engine;
    const s = e.getCurrentScene();
    s.player.teleport(new s.player.rig.position.constructor(x, 1.7, z), yaw);
    s.player.pitch = pitch;
    s.camera.rotation.set(pitch, 0, 0);
    s.update(1 / 60, 12.5);
    s.player.pitch = pitch;
    s.camera.rotation.set(pitch, 0, 0);
    s.scene.updateMatrixWorld();
    e.renderer.shadowMap.needsUpdate = true;
    e.postFx.render();
  }, [x, z, yaw, pitch]);
  await page.waitForTimeout(150);
  await page.locator('canvas').first().screenshot({ path: `${OUT}/${name}.png` });
}
await browser.close();
console.log(`wrote ${Object.keys(VIEWS).length} frames to ${OUT}`);
