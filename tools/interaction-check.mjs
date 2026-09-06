// Drives the real InteractionSystem in the running game and confirms every registered target can
// actually be obtained: walks the player to a spot beside each one, aims at it with real yaw and
// pitch, and reads back the prompt the game raised.
//
// This exists because tools/collision-check.mjs can only MODEL the range test. It measures distance
// to geometry, while InteractionSystem tries a crosshair raycast first and falls back to camera-to-
// object-ORIGIN — which for an object whose group origin sits away from its meshes is a completely
// different number. An earlier version of the model certified Kethra's valve as reachable while the
// real proximity zone sat 8.6 m away at the plaza origin. This tool cannot make that mistake.
//
// Usage: node tools/interaction-check.mjs [ship|kethra]
import { chromium } from 'playwright';

const scene = process.argv.includes('kethra') ? 'kethra' : 'ship';
const baseUrl = process.env.BASE_URL || 'http://localhost:5180/kethra-adventure/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
await page.goto(`${baseUrl}?skipIntro=1&newGame=1&unlockKethra=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForFunction(() => !!window.__DEBUG__?.gameState, undefined, { timeout: 90000 });
await page.waitForFunction(() => !!window.__DEBUG__.engine.getCurrentScene?.(), undefined, { timeout: 90000 });
if (scene === 'kethra') await page.evaluate(() => window.__DEBUG__.bus.emit('galaxy:travel_to', 'kethra'));
const wantClass = scene === 'kethra' ? 'KethraScene' : 'ShipInteriorScene';
try {
  await page.waitForFunction((cls) => {
    const s = window.__DEBUG__.engine.getCurrentScene?.();
    return !!(s && s.player && (s.kind ?? s.constructor.name) === cls);
  }, wantClass, { timeout: 90000 });
} catch {
  // Say what actually loaded rather than just timing out. This used to be a silent 90-second wait
  // whenever the identity check failed — which it did for every production build, because
  // constructor.name is mangled there and nothing said so.
  const found = await page.evaluate(() => {
    const s = window.__DEBUG__?.engine?.getCurrentScene?.();
    return s ? { kind: s.kind ?? null, ctor: s.constructor.name, hasPlayer: !!s.player } : null;
  });
  console.error(`Timed out waiting for scene "${wantClass}". Current scene: ${JSON.stringify(found)}`);
  console.error('If `kind` is null, the scene class is missing its `readonly kind` identity property.');
  await browser.close();
  process.exit(1);
}
await page.waitForTimeout(4000);

const out = await page.evaluate(async () => {
  const sc = window.__DEBUG__.engine.getCurrentScene();
  const V = sc.player.rig.position.constructor;
  const B3 = sc.player.colliders[0].box.constructor;
  const res = [];
  for (const it of sc.interaction.interactables) {
    const label = typeof it.label === 'function' ? it.label() : it.label;
    const c = new B3().setFromObject(it.object).getCenter(new V());
    let got = null, from = null;
    // Try a ring of approach spots — a target may be against a wall or hard up against a prop.
    for (const [ox, oz] of [[1.4, 0], [-1.4, 0], [0, 1.4], [0, -1.4], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const px = c.x + ox, pz = c.z + oz;
      sc.player.teleport(new V(px, c.y + 2, pz), 0);
      for (let i = 0; i < 30; i++) { sc.player.update(1 / 60); await new Promise((r) => setTimeout(r, 3)); }
      const eyeY = sc.player.rig.position.y + 1.7;
      // PlayerController's forward is (-sin(yaw), 0, -cos(yaw)); pitch is negative looking down.
      sc.player.yaw = Math.atan2(-(c.x - px), -(c.z - pz));
      sc.player.pitch = Math.atan2(c.y - eyeY, Math.hypot(c.x - px, c.z - pz));
      for (let i = 0; i < 6; i++) { sc.player.update(1 / 60); sc.interaction.update(sc.camera); await new Promise((r) => setTimeout(r, 3)); }
      got = sc.interaction.currentLabel;
      if (got === label) { from = [+px.toFixed(2), +pz.toFixed(2)]; break; }
    }
    res.push({ label, got, from });
  }
  return res;
});

let fails = 0;
for (const r of out) {
  const ok = r.got === r.label;
  if (!ok) fails++;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${JSON.stringify(r.label)}${ok ? `  obtained from ${JSON.stringify(r.from)}` : `  got ${JSON.stringify(r.got)} from every approach`}`);
}
console.log(fails ? `${fails} of ${out.length} targets NOT obtainable` : `all ${out.length} targets obtainable in-game`);
await browser.close();
if (fails) process.exitCode = 1;
