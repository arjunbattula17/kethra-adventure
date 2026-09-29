// Kethra, attacked where the audit pointed: flying wide around the Canopy course (BUG-013) and
// touching down off the pad (BUG-019); the grove's dimming outside the chamber (BUG-017); the
// Hush's timers (BUG-016); jumping onto a mound (BUG-018).
import { launch, openPage, check, known, clean, failures, settled, until, press, teleport, throttle } from './lib.mjs';

const browser = await launch();
const ONLY = process.argv[2];

// BUG-013, BUG-019: the first arrival flies MG2. Hold D (strafe) for 7 s, then let go and fall.
if (!ONLY || ONLY === 'canopy') {
  const { page, context, errors } = await openPage(browser, '?newGame=1&skipIntro=1&unlockKethra=1&tier=low&seed=7');
  await settled(page, 'ShipInteriorScene');
  await page.evaluate(() => window.__DEBUG__.flow.tutorial?.skip?.());
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.__DEBUG__.bus.emit('galaxy:travel_to', 'kethra'));
  await throttle(page);
  await until(page, () => window.__DEBUG__.engine.getCurrentScene()?.kind === 'CruiseScene', 60000);
  await page.waitForSelector('.hold-skip', { timeout: 30000 });
  await press(page, 'Space', 1100);
  await until(page, () => { const s = window.__DEBUG__.engine.getCurrentScene(); return s?.kind === 'CanopyScene' && s.state().phase === 'fly'; }, 240000);
  await page.evaluate(() => {
    window.__WIDE__ = 0;
    const tick = () => { const s = window.__DEBUG__.engine.getCurrentScene(); if (s?.kind !== 'CanopyScene') return; const p = s.state().pos; window.__WIDE__ = Math.max(window.__WIDE__, Math.hypot(p.x, p.z)); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(7000);
  await page.keyboard.up('KeyD');
  await until(page, () => { const s = window.__DEBUG__.engine.getCurrentScene(); return s?.kind !== 'CanopyScene' || s.state().phase !== 'fly'; }, 150000);
  const end = await page.evaluate(() => { const s = window.__DEBUG__.engine.getCurrentScene(); return s.kind === 'CanopyScene' ? { ...s.state(), wide: window.__WIDE__ } : { kind: s.kind, wide: window.__WIDE__ }; });
  const landed = end.phase === 'landed' || end.kind === 'KethraScene';
  const off = end.pos ? Math.hypot(end.pos.x, end.pos.z) : null;
  // Left open as a design question (where the canopy's edge should be): see BUGS.md DQ-10.
  known('BUG-013: flying wide of the boughs does not bypass the course to a landing', !(landed && end.wide > 45), `max ${end.wide.toFixed(1)} m out, ${JSON.stringify({ phase: end.phase, passed: end.passed, pips: end.pips })}`);
  check('BUG-019: the skiff only touches down on the pad', !landed || off === null || off <= 3.2 + 1, `touched down ${off?.toFixed(1)} m from the pad`);
  await clean(page, errors, 'Canopy flown wide');
  await context.close();
}

// BUG-017, BUG-016, BUG-018 on Kethra's floor.
if (!ONLY || ONLY === 'floor') {
  const { page, context, errors } = await openPage(browser, '?newGame=1&skipIntro=1&unlockKethra=1&jump=kethra&tier=low&seed=7');
  await settled(page, 'KethraScene');
  await page.waitForTimeout(4000);
  const inside = [];
  for (const [x, y, z] of [[0, 0.4, 18], [0, 0.4, 8], [0, 0.4, 1]]) {
    await teleport(page, x, y, z, 0);
    await page.waitForTimeout(400);
    inside.push(+(await page.evaluate(() => window.__DEBUG__.engine.getCurrentScene().hush.inside)).toFixed(2));
  }
  check('BUG-017: outside the chamber the grove is not dimmed (inside = 0)', inside.every((v) => v < 0.02), `inside at landing, terrace, plaza: ${inside.join(', ')}`);
  const dt = await page.evaluate(() => new Promise((res) => { const t0 = window.__DEBUG__.motion.gameTime; window.__DEBUG__.engine.getCurrentScene().hush.fx.after(1, () => res(window.__DEBUG__.motion.gameTime - t0)); }));
  check('BUG-016: a 1 s Hush timer takes 1 s of game time', Math.abs(dt - 1) < 0.1, `took ${dt.toFixed(2)} s`);
  // Where a sprint-jump at the south mound lands (the audit's simulation): inside the mound.
  await teleport(page, 3.6, 1.6, -31.21, 0);
  await page.waitForTimeout(700);
  const pos = () => page.evaluate(() => { const p = window.__DEBUG__.engine.getCurrentScene().player.rig.position; return { x: p.x, y: p.y, z: p.z }; });
  const landedAt = await pos();
  let moved = 0;
  for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) { const a = await pos(); await press(page, k, 600); const b = await pos(); moved = Math.max(moved, Math.hypot(b.x - a.x, b.z - a.z)); }
  check('BUG-018 (= BUG-010): landing inside a mound, the player can walk out', moved > 0.3, `landed (${landedAt.x.toFixed(2)}, ${landedAt.y.toFixed(2)}, ${landedAt.z.toFixed(2)}), moved ${moved.toFixed(2)} m`);
  await clean(page, errors, 'Kethra floor');
  await context.close();
}

await browser.close();
console.log(failures() ? `\n${failures()} failed` : '\nall passed');
process.exit(failures() ? 1 : 0);
