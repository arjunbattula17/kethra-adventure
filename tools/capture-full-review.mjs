import { chromium } from 'playwright';

const baseUrl = process.argv[2] || 'http://localhost:5180';
const outDir = process.argv[3] || '.';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto(baseUrl + '?skipIntro=1&unlockKethra=1', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__DEBUG__?.gameState, { timeout: 10000 });
await page.waitForTimeout(1000);

// 1. Ship interior — console view.
await page.screenshot({ path: `${outDir}/01_ship_console.png` });

// 2. Ship interior — closeup on console.
await page.evaluate(() => {
  const scene = window.__DEBUG__.engine.getCurrentScene();
  const V = scene.player.rig.position.constructor;
  scene.player.teleport(new V(0, 1.7, -2), 0);
});
await page.waitForTimeout(500);
await page.screenshot({ path: `${outDir}/02_ship_console_closeup.png` });

// 3. Ship interior — airlock.
await page.evaluate(() => {
  const scene = window.__DEBUG__.engine.getCurrentScene();
  const V = scene.player.rig.position.constructor;
  scene.player.teleport(new V(0, 1.7, 2), Math.PI);
});
await page.waitForTimeout(500);
await page.screenshot({ path: `${outDir}/03_ship_airlock.png` });

// 4. Character panel.
await page.keyboard.press('Tab');
await page.waitForTimeout(400);
await page.screenshot({ path: `${outDir}/04_character_panel.png` });
await page.keyboard.press('Tab');
await page.waitForTimeout(300);

// 5. Solar system map.
await page.evaluate(() => window.__DEBUG__.bus.emit('ui:open_galaxy_map'));
await page.waitForTimeout(600);
await page.screenshot({ path: `${outDir}/05_solar_map.png` });

// 6. Kethra planet map (click first hit target).
const clickInfo = await page.evaluate(() => {
  const canvas = document.querySelector('.map-canvas');
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio;
  const target = window.__DEBUG__.mapController['hitTargets'][0];
  return { left: rect.left + target.x / dpr, top: rect.top + target.y / dpr };
});
await page.mouse.click(clickInfo.left, clickInfo.top);
await page.waitForTimeout(300);
const stillSolar = await page.evaluate(() => document.querySelector('.map-title')?.textContent?.includes('Solar'));
if (stillSolar) {
  await page.evaluate(() => {
    const canvas = document.querySelector('.map-canvas');
    const rect = canvas.getBoundingClientRect();
    const target = window.__DEBUG__.mapController['hitTargets'][0];
    const dpr = window.devicePixelRatio;
    canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: rect.left + target.x / dpr, clientY: rect.top + target.y / dpr }));
  });
}
await page.waitForTimeout(600);
await page.screenshot({ path: `${outDir}/06_planet_map.png` });
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

// 7-9. Kethra environment — travel there and grab a few wide shots.
await page.evaluate(() => window.__DEBUG__.flow['travelToPlanet']?.('kethra'));
await page.waitForTimeout(2500);
await page.screenshot({ path: `${outDir}/07_kethra_spawn.png` });

await page.evaluate(() => {
  const scene = window.__DEBUG__.engine.getCurrentScene();
  const V = scene.player.rig.position.constructor;
  scene.player.teleport(new V(-16, 2.2, -2.2), 0.3);
});
await page.waitForTimeout(500);
await page.screenshot({ path: `${outDir}/08_kethra_grove.png` });

await page.evaluate(() => {
  const scene = window.__DEBUG__.engine.getCurrentScene();
  const V = scene.player.rig.position.constructor;
  scene.player.teleport(new V(0, 1.4, -15.5), Math.PI);
});
await page.waitForTimeout(500);
await page.screenshot({ path: `${outDir}/09_kethra_console.png` });

// 10. Galaxy reveal cinematic.
await page.evaluate(() => window.__DEBUG__.flow['transitionToGalaxyReveal']?.());
await page.waitForTimeout(13500);
await page.screenshot({ path: `${outDir}/10_galaxy_reveal.png` });

console.log('done');
await browser.close();
