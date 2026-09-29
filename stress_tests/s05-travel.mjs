// The trip: First light's throttle and the cruise, abused. Tap-spam and half holds at the throttle,
// Space held straight through the cut, skip spam, a stalled main thread mid-cruise, and a skip on
// the Vessek docking. The arrival must happen exactly once and land in the right scene.
import { launch, openPage, check, clean, failures, settled, until, press, stall } from './lib.mjs';

const browser = await launch();

// A. Kethra, first trip: throttle abuse, then Space held across the cut into the cruise.
{
  const { page, context, errors } = await openPage(browser, '?newGame=1&skipIntro=1&unlockKethra=1&seed=13');
  await settled(page, 'ShipInteriorScene');
  await page.evaluate(() => window.__DEBUG__.flow.tutorial?.skip?.());
  await page.waitForTimeout(800);
  await page.evaluate(() => window.__DEBUG__.bus.emit('galaxy:travel_to', 'kethra'));
  await page.waitForSelector('.first-light-hint', { timeout: 60000 });
  for (let i = 0; i < 30; i++) await press(page, 'Space', 15 + (i % 5) * 30);
  for (let i = 0; i < 4; i++) { await press(page, 'Space', 600); await page.waitForTimeout(300); }
  const stage = await page.evaluate(() => window.__DEBUG__.engine.getCurrentScene().power?.stage);
  check('tap spam and half holds never reach full power', stage !== 'full' && (await page.evaluate(() => window.__DEBUG__.engine.getCurrentScene().kind)) === 'ShipInteriorScene', stage);
  // Hold through the ignitions and keep holding across the cut into the cruise.
  await page.keyboard.down('Space');
  await until(page, () => window.__DEBUG__.engine.getCurrentScene()?.kind === 'CruiseScene', 60000);
  await page.waitForTimeout(3000);
  const t = await page.evaluate(() => window.__DEBUG__.engine.getCurrentScene().time);
  await page.keyboard.up('Space');
  check('Space held across the cut does not skip the cruise', t < 20, `cruise time ${t?.toFixed(1)} s`);
  // A stalled main thread mid-cruise, then skip spam.
  await stall(page, 2500);
  await page.waitForTimeout(500);
  let arrivals = 0;
  await page.exposeFunction('__arrived', () => { arrivals++; });
  await page.evaluate(() => {
    const s = window.__DEBUG__.engine.getCurrentScene();
    const prev = s.onArrive;
    s.onArrive = () => { window.__arrived(); prev?.(); };
  });
  await page.waitForSelector('.hold-skip', { timeout: 30000 }).catch(() => {});
  for (let i = 0; i < 6; i++) { await press(page, 'Space', 1100); await press(page, 'Space', 40); }
  const reached = await until(page, () => ['CanopyScene', 'KethraScene'].includes(window.__DEBUG__.engine.getCurrentScene()?.kind), 180000);
  await page.waitForTimeout(3000);
  check('skip spam still arrives, exactly once', reached && arrivals === 1, `reached ${reached}, onArrive x${arrivals}`);
  await clean(page, errors, 'Kethra trip abuse');
  await context.close();
}

// B. Vessek: skip mid-docking, Escape and E spam over the title, then the level.
{
  const { page, context, errors } = await openPage(browser, '?newGame=1&skipIntro=1&unlockVessek=1&seed=13');
  await settled(page, 'ShipInteriorScene');
  await page.evaluate(() => window.__DEBUG__.flow.tutorial?.skip?.());
  await page.waitForTimeout(800);
  await page.evaluate(() => window.__DEBUG__.bus.emit('galaxy:travel_to', 'vessek'));
  await page.waitForSelector('.first-light-hint', { timeout: 60000 });
  await page.keyboard.down('Space');
  await until(page, () => window.__DEBUG__.engine.getCurrentScene()?.power?.stage === 'full', 30000);
  await page.keyboard.up('Space');
  await until(page, () => window.__DEBUG__.engine.getCurrentScene()?.kind === 'CruiseScene', 60000);
  await page.evaluate(() => { window.__DEBUG__.engine.getCurrentScene().time = 41; });
  await page.waitForTimeout(400);
  await press(page, 'Space', 1100);
  for (let i = 0; i < 20; i++) { await press(page, i % 2 ? 'Escape' : 'KeyE', 20); }
  await settled(page, 'VessekScene', 180000);
  await page.waitForTimeout(2500);
  const s = await page.evaluate(() => { const sc = window.__DEBUG__.engine.getCurrentScene(); const p = sc.player.rig.position; return { y: +p.y.toFixed(2), load: sc.bus.load(), phase: sc.bus.phase }; });
  check('skipping the docking lands in a normal Vessek', s.phase === 'normal' && s.load === 5 && s.y > -1, JSON.stringify(s));
  await clean(page, errors, 'Vessek docking skip');
  await context.close();
}

await browser.close();
console.log(failures() ? `\n${failures()} failed` : '\nall passed');
process.exit(failures() ? 1 : 0);
