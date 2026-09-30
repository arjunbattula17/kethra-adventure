// Browser test of the Hush minigame (MG3) with real input: hooding the lantern, being gusted back
// to a lamp, the glowcap, the perch change, and the Rite at the call-stone through to the chapter
// card. The moth's rules are covered by tools/test-hush-sim.mjs.
//
//   npm run build && npx vite preview --port 4180 --strictPort   (in another terminal)
//   node tools/test-mg3-flow.mjs [baseUrl]
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:4180/kethra-adventure/';
let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
  if (!ok) failed++;
}

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const until = (fn, ms, arg) => page.waitForFunction(fn, arg, { timeout: ms, polling: 50 }).then(() => true, () => false);
const hush = () => page.evaluate(() => window.__DEBUG__.engine.getCurrentScene().hush.state());
const feet = () => page.evaluate(() => { const p = window.__DEBUG__.engine.getCurrentScene().player.rig.position; return { x: p.x, y: p.y, z: p.z }; });
async function place(x, z, yaw = 0) {
  await page.evaluate(({ x, z, yaw }) => {
    const s = window.__DEBUG__.engine.getCurrentScene();
    s.player.teleport(new s.player.rig.position.constructor(x, 1.6, z), yaw);
  }, { x, z, yaw });
  await page.waitForTimeout(300);
}
/** Walks forward for `ms` and returns how far the player went. */
async function walk(ms) {
  const a = await feet();
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(ms);
  await page.keyboard.up('KeyW');
  const b = await feet();
  return Math.hypot(b.x - a.x, b.z - a.z);
}

await page.goto(`${BASE}?newGame=1&skipIntro=1&unlockKethra=1&tier=low&seed=7`, { waitUntil: 'domcontentloaded' });
await until(() => window.__DEBUG__?.engine.getCurrentScene()?.kind === 'ShipInteriorScene' && !window.__DEBUG__.flow.isTransitioning(), 240000);
await page.evaluate(() => window.__DEBUG__.flow.debugGo('kethra'));
await until(() => window.__DEBUG__.engine.getCurrentScene()?.kind === 'KethraScene' && !window.__DEBUG__.flow.isTransitioning(), 240000);
// Mark one inscription as read; reading them for real is covered by test-kethra-flow.
await page.evaluate(() => window.__DEBUG__.gameState.setFlag('kethra_fragment_1_read'));
await page.waitForTimeout(1500);

// Walk up the ramp and through the chamber door.
await place(0, -7.5, 0);
check('outside the chamber, the Hush has not begun', (await hush()).phase === 'outside' && !(await page.$('.hush-panel')));
await walk(1400);
check('walking through the door begins the Hush: its plate and the lantern lesson', await until(() => !!document.querySelector('.hush-panel') && /hood the lantern/i.test(document.querySelector('.cinematic-caption')?.textContent ?? ''), 5000));
check('and the moth watches from the far arch', (await hush()).perch === 'arch');

await place(0, -11.4, 0);
const open = await walk(1000);
await page.keyboard.down('KeyF');
await page.waitForTimeout(150);
check('holding F hoods the lantern', (await hush()).hooded);
await place(0, -11.4, 0);
const hoodedDist = await walk(1000);
await page.keyboard.up('KeyF');
check('hooded, you move slower', hoodedDist < open * 0.7, `${hoodedDist.toFixed(2)} m vs ${open.toFixed(2)} m in a second`);
await page.mouse.move(640, 360);
await page.mouse.down({ button: 'right' });
await page.waitForTimeout(150);
check('holding the right mouse button hoods it too', (await hush()).hooded);
await page.mouse.up({ button: 'right' });
await page.waitForTimeout(150);
check('letting go opens it', !(await hush()).hooded);
await page.evaluate(() => { window.__DEBUG__.gameState.data.attributes.traversal = 2; });
await place(0, -11.4, 0);
await page.keyboard.down('KeyF');
const trained = await walk(1000);
await page.keyboard.up('KeyF');
check('traversal 2: quicker with the lantern hooded', trained > hoodedDist * 1.2, `${trained.toFixed(2)} m vs ${hoodedDist.toFixed(2)} m`);

await place(1.2, -12.4, 0);
check('an open lantern in its sweep draws it, and it fans you back', await until(() => window.__DEBUG__.engine.getCurrentScene().hush.state().gusts >= 1, 40000));
check('the retry is instant: you are set down at the door’s lamp, in control', await until(() => {
  const s = window.__DEBUG__.engine.getCurrentScene();
  const p = s.player.rig.position;
  return s.player.enabled && Math.hypot(p.x - 0, p.z - -11.1) < 0.4;
}, 3000));
await place(1.2, -12.4, 0);
await page.keyboard.down('KeyF');
await until(() => window.__DEBUG__.engine.getCurrentScene().hush.state().mode === 'perched', 20000);
const gustsBefore = (await hush()).gusts;
await page.waitForTimeout(10000);
const after = await hush();
check('hooded, it looks straight past you for a whole sweep', after.gusts === gustsBefore && after.alert === 0, `alert ${after.alert.toFixed(2)}`);

await place(1.6, -12.5, 0);
await walk(500);
check('brushing the glowcap turns its gaze to the flare', await until(() => window.__DEBUG__.engine.getCurrentScene().hush.state().attention, 3000));
check('and with the lantern hooded, it settles again', await until(() => { const s = window.__DEBUG__.engine.getCurrentScene().hush.state(); return !s.attention && s.mode === 'perched'; }, 8000));
await page.keyboard.up('KeyF');

// Reaching the root tunnel's lamp moves the moth up to the gate perch.
await place(-9.2, -15.8, 0);
check('reaching the tunnel’s lamp lights it', (await hush()).post === 'west');
check('and the moth flies up to the gate arch', await until(() => { const s = window.__DEBUG__.engine.getCurrentScene().hush.state(); return s.perch === 'ledge' && s.mode === 'perched'; }, 20000));

// The Rite at the call-stone: three breaths in order, each while the moth looks away.
await page.keyboard.down('KeyF');
await place(0, -29.45, Math.PI);
check('at the call-stone the Rite begins and its keys are shown', (await hush()).phase === 'rite' && !!(await page.$('.hush-rite')) && (await hush()).post === 'stone');
const stateNow = () => window.__DEBUG__.engine.getCurrentScene().hush.state();
async function whenLooking(away) {
  if (!away) return until(() => { const s = window.__DEBUG__.engine.getCurrentScene().hush.state(); return s.mode === 'perched' && s.stoneMargin < -0.12; }, 40000);
  // Looking away: the cone's edge clear of the stone and still moving away, so it stays clear
  // until the key is handled even at a low frame rate. Wait 1.5 s after landing first: the moth
  // turns onto its sweep at up to 2.2 rad/s.
  await until(() => window.__DEBUG__.engine.getCurrentScene().hush.state().mode === 'perched', 40000);
  await page.waitForTimeout(1500);
  const deadline = Date.now() + 40000;
  while (Date.now() < deadline) {
    const before = (await hush()).stoneMargin;
    await page.waitForTimeout(120);
    const s = await hush();
    if (s.mode === 'perched' && s.stoneMargin > 0.06 && s.stoneMargin > before) return true;
  }
  return false;
}
await whenLooking(false);
let gusts = (await hush()).gusts;
await page.keyboard.press('Digit1');
check('a breath while it looks at the stone brings it down on you', await until((g) => window.__DEBUG__.engine.getCurrentScene().hush.state().gusts > g, 15000, gusts));
check('back to the stone’s lamp, the Rite from the start', (await hush()).step === 0 && (await hush()).post === 'stone');
await until(() => window.__DEBUG__.engine.getCurrentScene().hush.state().mode === 'perched', 20000);
await place(0, -29.45, Math.PI);
await whenLooking(true);
gusts = (await hush()).gusts;
await page.keyboard.press('Digit3');
check('a wrong colour startles it: a gust back to the stone’s lamp', await until((g) => window.__DEBUG__.engine.getCurrentScene().hush.state().gusts > g, 8000, gusts));
// The correct order is azure, amber, verdant: keys 1, 2, 3, each while the moth looks away.
await place(0, -29.45, Math.PI);
for (const [i, key] of ['Digit1', 'Digit2', 'Digit3'].entries()) {
  await whenLooking(true);
  await page.keyboard.press(key);
  const ok = await until((n) => { const s = window.__DEBUG__.engine.getCurrentScene().hush.state(); return s.step > n || s.phase === 'won' || s.phase === 'done'; }, 3000, i);
  // The step lands one frame before the moth is sent on to its next perch: wait for that frame.
  const closer = i >= 2 || (await until((want) => window.__DEBUG__.engine.getCurrentScene().hush.state().perch === want, 2000, ['vane', 'rim'][i]));
  const s = await hush();
  check(`breath ${i + 1} held while it looked away${i < 2 ? ', and it comes a step closer' : ''}`, ok && closer, `step ${s.step}, perch ${s.perch}`);
}
await page.keyboard.up('KeyF');

check('the third breath wakes the Heart: the scene takes the camera', await until(() => document.body.classList.contains('conducting') && window.__DEBUG__.engine.getCurrentScene().hush.state().phase === 'won', 5000));
let s0 = await page.evaluate(() => JSON.parse(JSON.stringify(window.__DEBUG__.gameState.data)));
check('the Heart’s reward: the flag, three resonant crystals', s0.flags.includes('kethra_mechanism_solved') && s0.shipSystems.navigation.haveAmount === 3);
await page.waitForTimeout(2000);
await page.keyboard.down('Space');
await page.waitForTimeout(1100);
await page.keyboard.up('Space');
check('holding to skip ends the wake on the awake grove, back in your own eyes', await until(() => window.__DEBUG__.engine.getCurrentScene().hush.state().phase === 'done' && window.__DEBUG__.engine.getCurrentScene().player.enabled, 5000));
check('the chapter card: The Heart wakes', await until(() => document.querySelector('.chapter-card.visible .chapter-title')?.getAttribute('aria-label') === 'The Heart wakes', 5000));
check('the Hush’s plate is gone', !(await page.$('.hush-panel')));

check('no page or console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
