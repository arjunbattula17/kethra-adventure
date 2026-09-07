// End-to-end check of the opening: game loads -> tutorial -> guided to the desk -> interact with
// the console monitor -> first game starts. Fails loudly if the battle can start any earlier.
//
// Everything except the look step is driven through real input: keydown/keyup on the page, a real
// walk across the room, a real E-press resolved by InteractionSystem. The look step nudges
// PlayerController.yaw directly, because headless Chromium will not grant pointer lock and
// mouse-look is the only input path that needs it — the gate it clears (accumulated yaw + pitch) is
// still the real one.
//
// Every wait here polls for a condition rather than sleeping a fixed time. Under this harness's
// software renderer the scene boots in ~20s where real hardware takes ~2s, and the tutorial only
// advances on frames, so fixed delays tuned on one machine mean nothing on another.
//
// Usage: node tools/test-tutorial-flow.mjs [baseUrl] [outDir]
import { chromium } from 'playwright';
import fs from 'node:fs';

const baseUrl = process.argv[2] || 'http://localhost:5180';
const outDir = process.argv[3] || 'renders/tutorial-flow';
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  args: [
    '--use-gl=angle',
    '--enable-unsafe-swiftshader',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
  ],
});
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push('CONSOLE ' + msg.text());
});

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
}

const shot = (name) => page.screenshot({ path: `${outDir}/${name}.png` });
const cardTitle = () => page.$eval('.tut-card.visible .tut-title', (el) => el.textContent).catch(() => null);
const promptText = () => page.$eval('#interact-prompt.visible', (el) => el.textContent).catch(() => null);

async function until(fn, timeout = 45000) {
  const started = Date.now();
  for (;;) {
    if (await fn()) return true;
    if (Date.now() - started > timeout) return false;
    await page.waitForTimeout(200);
  }
}
const waitForCard = (title, timeout) => until(async () => (await cardTitle()) === title, timeout);

async function setPlayer(x, z, yaw) {
  await page.evaluate(
    ([px, pz, pyaw]) => {
      const { player } = window.__DEBUG__.engine.getCurrentScene();
      player.rig.position.set(px, 1.7, pz);
      player.velocityY = 0;
      player.yaw = pyaw;
    },
    [x, z, yaw],
  );
}

await page.goto(baseUrl + '/?newGame=1', { waitUntil: 'load' });
await page.waitForFunction(() => window.__DEBUG__?.flow?.tutorial != null, { timeout: 120000 });
// Software rasterisation makes the default tier a slideshow; the flow under test is unaffected.
await page.evaluate(() => window.__DEBUG__.engine.setManualQualityTier('low'));

// 1. Nothing starts on its own. The old flow had the puzzle on screen ~9s after load; here the
//    first thing the player ever sees is the tutorial.
check('tutorial reaches its first step', await until(async () => (await cardTitle()) !== null, 120000));
check('tutorial card is the first thing shown', (await cardTitle()) === 'Take the Helm', (await cardTitle()) ?? 'no card');
check('first game does not auto-start on load', !(await page.$('#power-puzzle-panel')));
await shot('01_step_look');

// 2. Look step. First, press Tab well before the tutorial asks for it: the HUD advertises
//    "TAB — Character" from the very first frame, so a player trying it early is ordinary, and it
//    must not pre-satisfy the step whose whole job is to teach the character sheet.
await page.keyboard.press('Tab');
await until(async () => !!(await page.$('.panel-overlay.visible')), 15000);
await page.keyboard.press('Tab');
await until(async () => !(await page.$('.panel-overlay.visible')), 15000);

for (let i = 0; i < 8; i++) {
  await page.evaluate(() => {
    window.__DEBUG__.engine.getCurrentScene().player.yaw += 0.35;
  });
  await page.waitForTimeout(120);
}
check('look step clears once the player has looked around', await waitForCard('Find Your Footing'));
await shot('02_step_move');

// 3. The console must refuse to boot before the tutorial gets there.
await setPlayer(0, -3.3, 0);
await until(async () => (await promptText()) !== null, 15000);
const lockedPrompt = await promptText();
check('console reads as offline before the tutorial unlocks it', (lockedPrompt ?? '').includes('offline'), lockedPrompt ?? 'no prompt');
await page.keyboard.press('KeyE');
const toastShown = await until(async () => !!(await page.$('.toast')), 10000);
const toast = await page.$eval('.toast', (el) => el.textContent).catch(() => null);
check('early E on the console does not start the first game', !(await page.$('#battle-briefing')) && !(await page.$('#power-puzzle-panel')));
check('early E explains why, rather than doing nothing', toastShown && (toast ?? '').includes('still rebooting'), toast ?? 'no toast');
await shot('03_console_locked');
// Back to spawn facing the console: the look step left the camera pointing off to one side, and
// step 6 below walks the room for real.
await setPlayer(0, 4, 0);

// 4. Move step, on real key presses.
for (const key of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'Space']) {
  await page.keyboard.down(key);
  await page.waitForTimeout(200);
  await page.keyboard.up(key);
  await page.waitForTimeout(120);
}
check('move step clears on W/A/S/D', await waitForCard('Know Your Skills'));
const sheetStepLabel = await page.$eval('.tut-card.visible .tut-step', (el) => el.textContent).catch(() => null);
check('character-sheet step is not pre-completed by the earlier Tab', sheetStepLabel === 'Step 3 / 5', sheetStepLabel ?? 'no step label');
await shot('04_step_sheet');

// 5. Character sheet step, on the real panel.
await page.keyboard.press('Tab');
check('Tab opens the character sheet', await until(async () => !!(await page.$('.panel-overlay.visible')), 10000));
await page.waitForTimeout(600); // the overlay fades in over 0.25s — shoot it settled, not mid-fade
await shot('05_character_sheet');
await page.keyboard.press('Tab');
check('character-sheet step clears once it is closed again', await waitForCard('Reach the Console'));
await shot('06_step_approach');

// 6. Walk to the desk for real. Spawn faces the console, so holding W is the whole journey.
check('waypoint marker is guiding the player', !!(await page.$('.tut-waypoint.visible')));

// Turned directly away from the marker, the off-screen arrow clamps to the bottom of the viewport
// — which is where the instruction card lives. It must not end up sitting on the card's own text.
await page.evaluate(() => {
  window.__DEBUG__.engine.getCurrentScene().player.yaw = Math.PI;
});
await page.waitForTimeout(800);
const markerOverlapsCard = await page.evaluate(() => {
  const card = document.querySelector('.tut-card.visible')?.getBoundingClientRect();
  const marker = document.querySelector('.tut-waypoint.visible')?.getBoundingClientRect();
  if (!card || !marker) return 'missing element';
  const clear = marker.right < card.left || marker.left > card.right || marker.bottom < card.top || marker.top > card.bottom;
  return clear ? false : `card ${JSON.stringify(card)} marker ${JSON.stringify(marker)}`;
});
check('waypoint marker never covers the instruction card', markerOverlapsCard === false, String(markerOverlapsCard));
await shot('06b_marker_behind_player');
await page.evaluate(() => {
  window.__DEBUG__.engine.getCurrentScene().player.yaw = 0;
});
await page.waitForTimeout(400);

await page.keyboard.down('KeyW');
const arrived = await waitForCard('Bring It Online', 30000);
await page.keyboard.up('KeyW');
check('reaching the desk clears the approach step', arrived);
await shot('07_step_boot');

// 7. The monitor is the start point, and E on it is the handover.
await until(async () => (await promptText())?.includes('Boot Navigation Console'), 15000);
const bootPrompt = await promptText();
check('monitor offers the boot prompt at the desk', (bootPrompt ?? '').includes('Boot Navigation Console'), bootPrompt ?? 'no prompt');
await page.keyboard.press('KeyE');
await page.waitForTimeout(1500);
await shot('08_boot_cinematic');
check('booting the console leads into the first game briefing', await until(async () => !!(await page.$('#battle-briefing')), 30000));
await shot('09_briefing');

// The tutorial has to leave nothing behind — DOM, body class, or scene objects.
const leftovers = await page.evaluate(() => {
  const scene = window.__DEBUG__.engine.getCurrentScene().scene;
  return {
    dom: !!document.querySelector('.tut-root'),
    bodyClass: document.body.classList.contains('tutorial-active'),
    pillar: !!scene.getObjectByName('tutorial-beacon-pillar'),
    bracket: !!scene.getObjectByName('tutorial-beacon-bracket'),
  };
});
check('tutorial cleans itself up at the handover', !Object.values(leftovers).some(Boolean), JSON.stringify(leftovers));

// 8. And the briefing hands over to the puzzle itself.
await page.click('#battle-briefing button');
check('first game starts after the briefing', await until(async () => !!(await page.$('#power-puzzle-panel')), 30000));
await page.waitForTimeout(1500);
await shot('10_first_game');

// 9. A player who has already been through the opening never sees it again.
await page.goto(baseUrl + '/?skipIntro=1&newGame=1', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__DEBUG__?.engine?.getCurrentScene?.(), { timeout: 120000 });
await page.waitForTimeout(3000);
check('a returning player gets no tutorial', !(await page.$('.tut-card')) && !(await page.evaluate(() => !!window.__DEBUG__.flow.tutorial)));
check('a returning player gets no auto-started puzzle either', !(await page.$('#power-puzzle-panel')));

check('no page or console errors during the opening', errors.length === 0, errors.join(' | '));

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots in ${outDir}/`);
await browser.close();
process.exit(failed.length === 0 ? 0 : 1);
