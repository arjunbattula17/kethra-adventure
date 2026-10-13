// The ending's summary, the chapter list (from the title and from the ending) and the pause menu's
// survey line: docs/DESIGN.md §6, "Ending and progression state".
//
//   npm run build && npx vite preview --port 4180 --strictPort   (in another terminal)
//   node tools/test-ending.mjs [baseUrl]
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:4180/kethra-adventure/';
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};
const waitScene = (k) => page.waitForFunction((k) => window.__DEBUG__?.engine.getCurrentScene()?.kind === k && !window.__DEBUG__.flow.isTransitioning(), k, { timeout: 240000, polling: 500 });
const state = () => page.evaluate(() => window.__DEBUG__.gameState.data);
const rows = () => page.evaluate(() => [...document.querySelectorAll('.chapter-row')].map((r) => ({ name: r.querySelector('.chapter-name')?.textContent, from: r.querySelector('.chapter-from')?.textContent, armed: r.classList.contains('armed') })));
const titleButtons = () => page.evaluate(() => [...document.querySelectorAll('.title-btn')].map((b) => b.textContent));

// ------------------------------------------------------------------ the title's chapter list, no save
console.log('— the title');
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.title-screen', { timeout: 60000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.title-btn', { timeout: 60000 });
check('the title offers Chapters', (await titleButtons()).includes('Chapters'), (await titleButtons()).join(', '));
await page.click('.title-btn:has-text("Chapters")');
await page.waitForSelector('.chapter-row', { timeout: 10000 });
let list = await rows();
check('three chapters are listed', list.length === 3 && list[0].name === 'The Wren' && list[1].name === 'Kethra' && list[2].name === 'Vessek Anchorage', JSON.stringify(list));
check('with no journey played, the levels start from a stand-in', /first playthrough/.test(list[1].from) && /first playthrough/.test(list[2].from), `${list[1].from} | ${list[2].from}`);

// ------------------------------------------------------------------ a chapter boots into its level
console.log('\n— starting at a chapter');
await page.click('.chapter-row:has-text("Vessek Anchorage")');
await waitScene('VessekScene');
let d = await state();
check('choosing the Anchorage boots into it', (await page.evaluate(() => window.__DEBUG__.flow.state)) === 'vessek');
check('the address bar drops the chapter flag', !(await page.evaluate(() => location.search)).includes('chapter'));
check('the stand-in has a first playthrough’s skills', d.attributes.insight === 2 && d.attributes.engineering === 2 && d.attributes.traversal === 2 && d.attributes.archaeology === 4, JSON.stringify(d.attributes));
check('and its progress', d.flags.includes('kethra_mechanism_solved') && d.planetsUnlocked.includes('vessek') && d.shipSystems.scanner.repaired && d.shipSystems.navigation.haveAmount === 3);
check('the chapter start is saved as the journey', await page.evaluate(() => !!localStorage.getItem('kethra_save_v1')));

// ------------------------------------------------------------------ with a journey saved, a row arms first
console.log('\n— with a saved journey');
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.title-btn', { timeout: 60000 });
check('the title offers Continue', (await titleButtons()).includes('Continue'), (await titleButtons()).join(', '));
await page.click('.title-btn:has-text("Chapters")');
await page.waitForSelector('.chapter-row', { timeout: 10000 });
check('the list warns that a chapter replaces the journey', /replaces your saved journey/.test(await page.textContent('.chapter-select .subtitle')));
await page.click('.chapter-row:has-text("Kethra")');
await page.waitForTimeout(400);
list = await rows();
check('the first press only arms the row', list[1].armed && /Press again/.test(list[1].from) && (await page.$('.title-screen')) !== null, JSON.stringify(list[1]));
await page.click('.chapter-row:has-text("Kethra")');
await waitScene('KethraScene');
d = await state();
check('the second press starts Kethra', d.attributes.traversal === 2 && d.flags.includes('canopy_flown') && !d.flags.includes('kethra_mechanism_solved'), JSON.stringify(d.attributes));

// ------------------------------------------------------------------ the pause menu's survey line
console.log('\n— the pause menu');
await page.waitForTimeout(6500); // the arrival card's hold
await page.keyboard.press('Escape');
await page.waitForSelector('#pause-panel', { timeout: 10000 });
const surveyLine = (await page.textContent('#pause-panel .pause-survey').catch(() => '')) ?? '';
check('the pause menu shows the survey for this level', /Survey: 0 of 8 found here/.test(surveyLine), surveyLine);
await page.keyboard.press('Escape');

// ------------------------------------------------------------------ the ending
console.log('\n— the ending');
await page.goto(`${BASE}?newGame=1&skipIntro=1&unlockVessek=1&tier=low&seed=7`, { waitUntil: 'domcontentloaded' });
await waitScene('ShipInteriorScene');
await page.evaluate(() => {
  const g = window.__DEBUG__.gameState;
  for (const f of ['canopy_flown', 'vessek_alloy_given', 'vessek_deal_message', 'kethra_moth_caught', 'wren_found_locker', 'wren_found_bench_note', 'kethra_fragment_1_read']) g.setFlag(f);
  g.addAttributeXp('persuasion', 2);
  void window.__DEBUG__.flow.debugGo('ending');
});
await waitScene('EndingScene');
await page.waitForSelector('.hold-skip', { timeout: 30000 });
await page.keyboard.down('Space');
await page.waitForTimeout(1200);
await page.keyboard.up('Space');
await page.waitForSelector('.credits-roll.visible', { timeout: 20000 });
await page.waitForTimeout(3000);
const summary = await page.evaluate(() => ({
  figures: [...document.querySelectorAll('.summary-figure')].map((f) => `${f.querySelector('.eyebrow')?.textContent}=${f.querySelector('.summary-value')?.textContent}`),
  stats: [...document.querySelectorAll('.summary-stat')].map((s) => s.textContent),
  worlds: [...document.querySelectorAll('.summary-world')].map((w) => w.textContent),
  choices: [...document.querySelectorAll('.summary-choice')].map((c) => c.textContent),
  buttons: [...document.querySelectorAll('.credits-actions .btn')].map((b) => b.textContent),
  credits: document.querySelectorAll('.credits-list p').length,
}));
check('the figures have counted up: 6 days to Kethra and 11 to the Anchorage', summary.figures[0] === 'Days in flight=17', summary.figures.join(' | '));
check('the survey figure counts finds across all three levels', summary.figures[1] === 'Survey finds=3 of 18', summary.figures[1]);
check('all six skills are shown', summary.stats.length === 6 && summary.stats.includes('Persuasion3'), summary.stats.join(', '));
check('the survey is given world by world', summary.worlds.join(' | ') === 'The Wren: 2 of 4 | Kethra: 1 of 8 | Vessek Anchorage: 0 of 6', summary.worlds.join(' | '));
check('the choices made are told', summary.choices.some((c) => /promised Varro/.test(c)) && summary.choices.some((c) => /caught your light/.test(c)) && summary.choices.some((c) => /day-22 log/.test(c)), summary.choices.join(' / '));
check('the credits still follow', summary.credits >= 6);
check('the ending offers Keep exploring, Chapters and the title', summary.buttons.join(', ') === 'Keep exploring, Chapters, Title screen', summary.buttons.join(', '));

await page.click('.credits-actions .btn:has-text("Chapters")');
await page.waitForSelector('.title-screen .title-btn', { timeout: 60000 });
await page.waitForSelector('.chapter-row', { timeout: 10000 });
check('Chapters from the ending opens the list on the title', (await rows()).length === 3);
check('the ending was recorded before leaving', await page.evaluate(() => JSON.parse(localStorage.getItem('kethra_save_v1') ?? '{}').flags?.includes('ending_seen') ?? false));
check('the hash is cleared', (await page.evaluate(() => location.hash)) === '');

check('no page or console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall passed');
process.exit(failed ? 1 : 0);
