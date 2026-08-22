import { chromium } from 'playwright';

const url = process.argv[2] || 'http://localhost:5180';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(2000);

const info = await page.evaluate(() => {
  const d = window.__DEBUG__;
  if (!d) return { error: 'no debug hook' };
  const scene = d.flow.shipScene;
  const cam = scene.camera;
  const e = cam.matrixWorld.elements;
  return {
    rigPos: scene.player.rig.position.toArray(),
    rigInScene: scene.scene.children.includes(scene.player.rig),
    camLocalPos: cam.position.toArray(),
    camMatrixWorldPos: [e[12], e[13], e[14]],
    yaw: scene.player.yaw,
    onGround: scene.player.onGround,
    sceneChildrenCount: scene.scene.children.length,
    fog: !!scene.scene.fog,
    bg: scene.scene.background ? scene.scene.background.getHexString?.() : null,
  };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
