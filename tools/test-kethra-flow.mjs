// Level 2 end to end, through the real player-facing controls: the map's Set Course button, E to
// interact, clicks in the puzzle and repair panels. Movement between sites uses teleport (walking
// is covered by tools/movement-check.mjs and tools/collision-check.mjs). Each step asserts.
//
//   npx vite preview   (in another terminal)
//   node tools/test-kethra-flow.mjs [baseUrl]
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:4173/kethra-adventure/';
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};
const sceneKind = () => page.evaluate(() => window.__DEBUG__.engine.getCurrentScene()?.kind);
const waitScene = (kind) => page.waitForFunction((k) => window.__DEBUG__.engine.getCurrentScene()?.kind === k, kind, { timeout: 240000, polling: 500 });
const state = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__DEBUG__.gameState.data)));
async function teleport(x, y, z) {
  await page.evaluate(({ x, y, z }) => {
    const s = window.__DEBUG__.engine.getCurrentScene();
    s.player.teleport(new s.player.rig.position.constructor(x, y, z), 0);
  }, { x, y, z });
  await page.waitForTimeout(400);
}
async function pressE() {
  await page.keyboard.down('KeyE');
  await page.waitForTimeout(120);
  await page.keyboard.up('KeyE');
  await page.waitForTimeout(400);
}
async function closePanel() {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

// Start as a player who has calibrated the chart (the opening is covered by test-tutorial-flow).
await page.goto(`${BASE}?skipIntro=1&unlockKethra=1&newGame=1&tier=low`, { waitUntil: 'domcontentloaded' });
await waitScene('ShipInteriorScene');
await page.waitForTimeout(1000);

// 1. Travel through the map, the way a player does.
await page.evaluate(() => window.__DEBUG__.bus.emit('ui:open_galaxy_map'));
await page.waitForSelector('.map-btn.primary', { timeout: 10000 });
check('map opens with Kethra selected', (await page.textContent('.map-dossier-name')) === 'Kethra');
await page.click('.map-btn.primary');
await waitScene('KethraScene');
await page.waitForTimeout(1500);
check('Set Course lands on Kethra', (await sceneKind()) === 'KethraScene');

// 2. Both conversations open.
await teleport(3, 2, 5.5);
await pressE();
check('Fen Larkspur talks', (await page.textContent('#dialogue-speaker').catch(() => null)) === 'Fen Larkspur');
await closePanel();
await teleport(-3, 2, 4.5);
await pressE();
check('Warden Corvenna talks', (await page.textContent('#dialogue-speaker').catch(() => null)) === 'Warden Corvenna');
await closePanel();

// 3. The three inscriptions, and re-reading grants nothing more.
for (const [x, y, z] of [[-16, 2.4, -2.2], [16, 2.4, -2.2], [-20, 4.2, -7.2]]) {
  await teleport(x, y, z);
  await pressE();
}
let s = await state();
check('all three inscriptions recorded', ['kethra_fragment_1_read', 'kethra_fragment_2_read', 'kethra_fragment_3_read'].every((f) => s.flags.includes(f)));
const archaeology = s.attributes.archaeology;
await pressE();
await pressE();
s = await state();
check('re-reading an inscription grants no more archaeology', s.attributes.archaeology === archaeology, `${archaeology} -> ${s.attributes.archaeology}`);

// 4. Valve and shrine.
await teleport(2.5, 1.8, 8.5);
await pressE();
await teleport(-1.5, 1.7, 5.5);
await pressE();
s = await state();
check('valve realigned', s.flags.includes('kethra_helped_with_valve'));
check('shrine record in the journal', s.journalLogs.some((l) => l.id === 'kethra_ritual_record' && l.unlocked));

// 5. The Heart is guarded until the grove is dimmed. The call-stone stands at z -14.9, facing the
// approach; the player sings the Rite from in front of it.
await teleport(0, 1.4, -12.8);
await pressE();
check('Cistern Heart refused while the guardian is alert', !(await page.$('#power-puzzle-panel')));
await teleport(-4, 2.4, -9);
await pressE();
check('grove dimmed', (await state()).flags.includes('kethra_grove_dimmed'));

// 6. Solve the Heart with the true order read from the inscriptions.
await teleport(0, 1.4, -12.8);
await pressE();
check('Cistern Heart panel opens', !!(await page.$('#power-puzzle-panel')));
for (const label of ['Azure', 'Amber', 'Verdant']) {
  await page.evaluate((lbl) => [...document.querySelectorAll('.rite-node')].find((n) => n.textContent.includes(lbl))?.click(), label);
  await page.waitForTimeout(300);
}
await page.waitForTimeout(600);
s = await state();
check('Heart solved and crystals awarded', s.flags.includes('kethra_mechanism_solved') && s.shipSystems.navigation.haveAmount === 3);
await closePanel();

// 7. The last carving, marked on the map's survey.
await teleport(-2.6, 1.8, -15.6); // in front of the carving, facing it
await pressE();
const insight = (await state()).attributes.insight;
await pressE();
s = await state();
check('carving deciphered (map survey flag set)', s.flags.includes('kethra_kindling_record'));
check('re-reading the carving grants no more insight', s.attributes.insight === insight);

// 8. Home, and the crystals go into the ship.
await teleport(0, 2, 18);
await pressE();
await waitScene('ShipInteriorScene');
await page.waitForTimeout(1500);
check('Return to Ship lands on the Wren', (await sceneKind()) === 'ShipInteriorScene');
await page.evaluate(() => window.__DEBUG__.bus.emit('ui:open_repair'));
await page.waitForSelector('#repair-panel', { timeout: 5000 }).catch(() => {});
const repaired = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('#repair-panel .repair-row')];
  const done = [];
  for (const row of rows) {
    const btn = row.querySelector('button');
    if (btn && !btn.disabled) { btn.click(); done.push(row.querySelector('.name').textContent); }
  }
  return done;
});
s = await state();
check('navigation and scanner repaired with Kethra crystals', s.shipSystems.navigation.repaired && s.shipSystems.scanner.repaired, repaired.join(', '));
check('repairing the scanner resolves the next world', s.planetsUnlocked.includes('vessek'));

check('no page or console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
