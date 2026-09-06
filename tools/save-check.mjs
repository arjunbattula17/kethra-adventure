// Exercises save loading against shapes the game will actually meet: a save written before fields
// were added, a corrupt one, and an XP grant crossing two level thresholds. loadFrom used to assign
// parsed JSON straight onto the state, so an old save left new fields undefined and the first read
// of one threw — the kind of break that only shows up on a returning player's machine.
// Usage: node tools/save-check.mjs
import { chromium } from 'playwright';

const baseUrl = process.env.BASE_URL || 'http://localhost:5180/kethra-adventure/';
const KEY = 'kethra_save_v1';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
let fails = 0;

async function boot(seed) {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  // Toasts remove themselves after 3.2s, so sampling the DOM once races the scene load. Record
  // every one as it is added instead.
  await page.addInitScript(() => {
    window.__TOASTS__ = [];
    new MutationObserver((records) => {
      for (const r of records) {
        for (const n of r.addedNodes) {
          if (n.nodeType === 1 && n.classList?.contains('toast')) window.__TOASTS__.push(n.textContent);
        }
      }
    }).observe(document, { childList: true, subtree: true }); // addInitScript runs before documentElement exists
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  page.on('console', (m) => { if (m.type() === 'error' && !/mergeGeometries|no image data/.test(m.text())) errors.push(m.text()); });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, seed]);
  await page.goto(`${baseUrl}?skipIntro=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => !!window.__DEBUG__?.gameState, undefined, { timeout: 120000 });
  await page.waitForTimeout(2500);
  const toasts = await page.evaluate(() => window.__TOASTS__ || []);
  return { page, errors, toasts };
}

function check(name, ok, detail) {
  if (!ok) fails++;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? `  — ${detail}` : ''}`);
}

// A save from before playerPosition, clueConnections, planetsUnlocked and one attribute existed,
// and missing a ship system entirely.
const legacy = JSON.stringify({
  scene: 'ship_interior',
  flags: ['tutorial_battle_complete'],
  attributes: { insight: 3, archaeology: 1 },
  xp: 40,
  level: 2,
  unspentPoints: 1,
  shipSystems: { navigation: { damaged: true, repaired: false, progress: 50, requiredResource: 'resonant_crystal', requiredAmount: 3, haveAmount: 2 } },
  inventory: ['scanner'],
  journalLogs: [],
  clues: [],
  objective: 'Old objective',
});

{
  const { page, errors, toasts } = await boot(legacy);
  const state = await page.evaluate(() => {
    const d = window.__DEBUG__.gameState.data;
    return {
      attrKeys: Object.keys(d.attributes).length,
      perception: d.attributes.perception,
      insight: d.attributes.insight,
      systems: Object.keys(d.shipSystems).length,
      navProgress: d.shipSystems.navigation.progress,
      navLabel: d.shipSystems.navigation.label,
      shields: !!d.shipSystems.shields,
      planets: Array.isArray(d.planetsUnlocked),
      connections: Array.isArray(d.clueConnections),
      pos: d.playerPosition,
      level: d.level,
    };
  });
  console.log('legacy save (missing fields, missing a ship system):');
  check('no page errors', errors.length === 0, errors[0]);
  check('kept player progress', state.insight === 3 && state.navProgress === 50 && state.level === 2);
  // Attributes default to 1, not 0 (defaultAttributes in GameState.ts).
  check('backfilled the missing attribute', state.perception === 1 && state.attrKeys === 6);
  check('backfilled the missing ship systems', state.systems === 7 && state.shields === true);
  check('backfilled absent arrays', state.planets && state.connections);
  check('backfilled playerPosition to null', state.pos === null);
  check('took label from current code', state.navLabel === 'Navigation Array');
  check('reported success to the player', toasts.some((t) => /Continuing/.test(t)), JSON.stringify(toasts));
  await page.close();
}

{
  const { page, errors, toasts } = await boot('{ not json at all');
  console.log('corrupt save:');
  check('no page errors', errors.length === 0, errors[0]);
  check('told the player it could not be read', toasts.some((t) => /could not be read/.test(t)), JSON.stringify(toasts));
  check('still booted a playable scene', await page.evaluate(() => !!window.__DEBUG__.engine.getCurrentScene?.()));
  await page.close();
}

{
  const { page } = await boot(JSON.stringify({ level: 1, xp: 0 }));
  const r = await page.evaluate(() => {
    const gs = window.__DEBUG__.gameState;
    gs.data.level = 1; gs.data.xp = 0; gs.data.unspentPoints = 0;
    gs.gainXp(350); // crosses the level-2 (100) and level-3 (200) thresholds in one grant
    return { level: gs.data.level, xp: gs.data.xp, points: gs.data.unspentPoints };
  });
  console.log('XP grant crossing two thresholds:');
  check('levelled twice', r.level === 3, `level ${r.level}, xp ${r.xp}, points ${r.points}`);
  check('awarded two points', r.points === 2);
  await page.close();
}

console.log(fails ? `${fails} save check(s) failed` : 'all save checks passed');
await browser.close();
if (fails) process.exitCode = 1;
