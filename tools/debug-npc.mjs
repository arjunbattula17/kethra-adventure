import { chromium } from 'playwright';

const baseUrl = process.argv[2] || 'http://localhost:5180';
const url = baseUrl + '?skipIntro=1&unlockKethra=1';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (msg) => { if (msg.type() === 'error') console.log('[console error]', msg.text()); });
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__DEBUG__?.gameState, { timeout: 10000 });
await page.waitForTimeout(500);
await page.evaluate(() => window.__DEBUG__.bus.emit('galaxy:travel_to', 'kethra'));
await page.waitForTimeout(3000);

const info = await page.evaluate(() => {
  const scene = window.__DEBUG__.engine.getCurrentScene();
  const inter = scene.interaction;
  const count = inter ? inter['interactables']?.length : 'NO_INTERACTION';
  const player = scene.player;
  const camPos = new player.camera.position.constructor();
  scene.camera.getWorldPosition(camPos);
  return {
    interactableCount: count,
    labels: inter['interactables']?.map((i) => (typeof i.label === 'function' ? i.label() : i.label)) ?? [],
    rigPos: player.rig.position.toArray(),
    camWorldPos: camPos.toArray(),
    yaw: player.yaw,
    pitch: player.pitch,
    enabled: player.enabled,
  };
});
console.log(JSON.stringify(info, null, 2));

await page.evaluate(() => {
  const scene = window.__DEBUG__.engine.getCurrentScene();
  const V = scene.player.rig.position.constructor;
  scene.player.teleport(new V(3, 2, 5.5), 0);
});
await page.waitForTimeout(500);

const info2 = await page.evaluate(() => {
  const scene = window.__DEBUG__.engine.getCurrentScene();
  const camPos = new scene.player.camera.position.constructor();
  scene.camera.getWorldPosition(camPos);
  return { rigPos: scene.player.rig.position.toArray(), camWorldPos: camPos.toArray() };
});
console.log('after teleport:', JSON.stringify(info2));

await page.keyboard.down('KeyE');
await page.waitForTimeout(150);
await page.keyboard.up('KeyE');
await page.waitForTimeout(400);

const speaker1 = await page.$eval('#dialogue-speaker', (el) => el.textContent).catch(() => null);
console.log('Archivist speaker:', speaker1);
await page.keyboard.press('Escape');
await page.waitForTimeout(500);

await page.evaluate(() => {
  const scene = window.__DEBUG__.engine.getCurrentScene();
  const V = scene.player.rig.position.constructor;
  scene.player.teleport(new V(-3, 2, 4.5), 0);
});
await page.waitForTimeout(800);
const promptBeforeWarden = await page.evaluate(() => document.getElementById('interact-prompt')?.textContent);
const promptVisibleBeforeWarden = await page.evaluate(() => document.getElementById('interact-prompt')?.classList.contains('visible'));
console.log('prompt before warden E-press:', promptBeforeWarden, 'visible:', promptVisibleBeforeWarden);
const dialogueActive = await page.evaluate(() => document.querySelectorAll('.panel-overlay.visible').length);
console.log('visible overlays before warden press:', dialogueActive);
await page.keyboard.down('KeyE');
await page.waitForTimeout(150);
await page.keyboard.up('KeyE');
await page.waitForTimeout(500);
const speaker2 = await page.$eval('#dialogue-speaker', (el) => el.textContent).catch(() => null);
console.log('Warden speaker:', speaker2);

await browser.close();
