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
    const scene = window.__DEBUG__.engine.getCurrentScene();
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

// Clip 3: environmental puzzle-solving (the Cistern Heart light-sequence).
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
    gameState.setFlag('kethra_grove_dimmed');
  });
  await teleport(page, 0, 1.4, -15.5);
  await page.keyboard.down('KeyE');
  await page.waitForTimeout(120);
  await page.keyboard.up('KeyE');
  await page.waitForTimeout(1200);
  const order = ['Azure', 'Amber', 'Verdant'];
  for (const label of order) {
    await page.waitForTimeout(900);
    await page.evaluate((lbl) => {
      const nodes = Array.from(document.querySelectorAll('.power-node'));
      const target = nodes.find((n) => n.textContent.includes(lbl));
      if (target) target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    }, label);
  }
  await page.waitForTimeout(2500);
});

await browser.close();
console.log('All clips recorded to', outDir);
