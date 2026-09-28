import { chromium } from 'playwright';
import fs from 'node:fs';

const baseUrl = process.argv[2] || 'http://localhost:5180';
const outDir = process.argv[3] || '.';
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();

async function record(name, fn) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: outDir, size: { width: 1280, height: 720 } },
  });
  const page = await context.newPage();
  await fn(page);
  await context.close();
  // Playwright names videos by internal id; rename the newest .webm to our label.
  const files = fs.readdirSync(outDir).filter((f) => f.endsWith('.webm'));
  const withTime = files.map((f) => ({ f, t: fs.statSync(`${outDir}/${f}`).mtimeMs }));
  withTime.sort((a, b) => b.t - a.t);
  if (withTime[0]) fs.renameSync(`${outDir}/${withTime[0].f}`, `${outDir}/${name}.webm`);
  console.log('recorded', name);
}

async function teleport(page, x, y, z) {
  await page.evaluate(({ x, y, z }) => {
    const scene = window.__DEBUG__?.engine.getCurrentScene();
    const V = scene.player.rig.position.constructor;
    scene.player.teleport(new V(x, y, z), 0);
  }, { x, y, z });
  await page.waitForTimeout(400);
}

async function walk(page, ms) {
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(ms);
  await page.keyboard.up('KeyW');
}

// Clip 1: the galaxy reveal cinematic (camera pull-back set piece).
await record('01_galaxy_reveal', async (page) => {
  await page.goto(baseUrl + '?skipIntro=1&unlockKethra=1', { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__DEBUG__?.gameState, { timeout: 10000 });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    window.__DEBUG__.gameState.data.flags = window.__DEBUG__.gameState.data.flags.filter((f) => f !== 'galaxy_revealed');
  });
  // Directly trigger the reveal cinematic the way the real opening does.
  await page.evaluate(() => {
    const flow = window.__DEBUG__.flow;
    flow['transitionToGalaxyReveal']?.();
  });
  await page.waitForTimeout(14500);
});

// Clip 2: traversal through Kethra's terraces, canopy, and ruins.
await record('02_traversal', async (page) => {
  await page.goto(baseUrl + '?skipIntro=1&unlockKethra=1', { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__DEBUG__?.gameState, { timeout: 10000 });
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__DEBUG__.bus.emit('galaxy:travel_to', 'kethra'));
  await page.waitForTimeout(2200);
  await walk(page, 3500);
  await page.waitForTimeout(300);
  await teleport(page, -14, 2.4, -4);
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(1800);
  await page.keyboard.up('KeyD');
  await page.waitForTimeout(300);
  await walk(page, 2500);
  await page.waitForTimeout(600);
});

// Clip 3: environmental puzzle-solving (MG3 Hush: the Rite at the call-stone, and the wake).
await record('03_puzzle_solving', async (page) => {
  await page.goto(baseUrl + '?skipIntro=1&unlockKethra=1', { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__DEBUG__?.gameState, { timeout: 10000 });
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__DEBUG__.bus.emit('galaxy:travel_to', 'kethra'));
  await page.waitForTimeout(2200);
  await page.evaluate(() => {
    const { gameState } = window.__DEBUG__;
    gameState.setFlag('kethra_fragment_1_read');
    gameState.setFlag('kethra_fragment_2_read');
    gameState.setFlag('kethra_fragment_3_read');
  });
  // At the call-stone, lantern hooded; the Rite is sung through the harness hook (tools/test-mg3-flow.mjs
  // plays it breath by breath) so the clip is the wake: the Heart, the moth, the light up the terraces.
  await teleport(page, 0, 1.6, -29.45);
  await page.keyboard.down('KeyF');
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__DEBUG__.miniGame()?.win());
  await page.waitForTimeout(12500);
  await page.keyboard.up('KeyF');
});

await browser.close();
console.log('All clips recorded to', outDir);
