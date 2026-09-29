// MG1 Intercept, played through with real input (docs/DESIGN.md §4, slot 1, as redesigned): ORION
// hops the Wren to the buoy on its own, the player picks where to meet Kethra (← → or the mouse),
// the matching day locks, Space launches, and the win hands the course to the Wren. Also: Space
// before the days match is refused, ORION's help arrives if the player stalls, insight 2 marks the
// meeting day, and the whole plot fits well inside the 30 s budget.
//
//   npm run build && npx vite preview --port 4180 --strictPort   (in another terminal)
//   node tools/test-mg1-flow.mjs [baseUrl]
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

/** A fresh page on the reveal, skipped (hold Space), and waiting at MG1's hop. */
async function openPlot(before) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  await page.goto(`${BASE}?newGame=1&skipTutorial=1&tier=low&seed=7`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__DEBUG__?.engine.getCurrentScene()?.kind === 'GalaxyRevealScene', null, { timeout: 240000, polling: 200 });
  if (before) await page.evaluate(before);
  await page.waitForSelector('.hold-skip', { timeout: 180000 });
  await page.keyboard.down('Space');
  await page.waitForTimeout(1100);
  await page.keyboard.up('Space');
  await page.waitForFunction(() => !!window.__DEBUG__.engine.getCurrentScene().intercept, null, { timeout: 60000, polling: 50 });
  return page;
}
const stateOf = (page) => page.evaluate(() => window.__DEBUG__.engine.getCurrentScene().intercept.state());
const until = (page, fn, ms, arg) => page.waitForFunction(fn, arg, { timeout: ms, polling: 50 }).then(() => true, () => false);
const phaseIs = (page, ph, ms = 20000) => until(page, (p) => window.__DEBUG__.engine.getCurrentScene().intercept?.state().phase === p, ms, ph);
const status = (page) => page.evaluate(() => {
  const el = document.querySelector('.intercept-status');
  return { cls: el?.className ?? '', text: el?.textContent ?? '' };
});
const readout = (page) => page.evaluate(() => [...document.querySelectorAll('.intercept-readouts .num')].map((n) => n.textContent.trim()));

// ---------------------------------------------------------------- the keyboard path, start to finish
{
  const page = await openPlot(() => {
    const a = window.__DEBUG__.gameState.data.attributes;
    window.__mg1Before = { insight: a.insight, engineering: a.engineering };
  });
  check('MG1 opens on ORION’s hop, with no input asked for', (await stateOf(page)).phase === 'hop');
  const hopStart = Date.now();
  check('the hop hands over to the choice within a few seconds', await phaseIs(page, 'plot', 8000), `${Date.now() - hopStart} ms`);
  const t0 = Date.now();

  let s = await stateOf(page);
  check('the choice starts on Kethra where it is now, which does not match', s.meet === 0 && !s.matched && s.solutionDay === 6, JSON.stringify({ meet: s.meet, matched: s.matched }));
  let st = await status(page);
  check('the plate says why Kethra-now fails, and which way to go', /moved on/.test(st.text) && st.text.includes('→'), st.text);

  await page.keyboard.press('Space');
  await page.waitForTimeout(100);
  s = await stateOf(page);
  st = await status(page);
  check('Space before the days match launches nothing', s.phase === 'plot' && st.cls.includes('flash'), st.cls);
  check('…and brings ORION’s hint forward', s.hinted);

  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
  st = await status(page);
  check('→ steps a day; day 3 is too late, and says to go later', (await stateOf(page)).meet === 3 && /Too late/.test(st.text) && st.text.includes('→'), st.text);
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
  st = await status(page);
  check('day 9 is too early, and says to go sooner', (await stateOf(page)).meet === 9 && /Too early/.test(st.text) && st.text.includes('←'), st.text);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  check('the choice stops at the last day offered', (await stateOf(page)).meet === 10);

  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowLeft');
  check('day 6 matches, and holding it locks the course', await phaseIs(page, 'locked', 3000));
  const figures = await readout(page);
  check('the plate shows the six-day, 48 Mkm intercept', figures[0] === '48 Mkm' && figures[2] === '6.0 days' && figures[3] === 'day 6', JSON.stringify(figures));
  check('Launch is up and focused', await page.evaluate(() => document.activeElement?.classList.contains('intercept-launch') === true));
  await page.keyboard.press('ArrowLeft');
  check('the lock latches: → ← no longer move it', (await stateOf(page)).meet === 6 && (await stateOf(page)).phase === 'locked');

  await page.keyboard.press('Space');
  check('Space launches the run', await phaseIs(page, 'run', 2000));
  check('the run arrives and the plot is won', await phaseIs(page, 'won', 15000));
  const tWon = Date.now() - t0;
  await page.waitForTimeout(1200);
  const win = await page.evaluate(() => [...document.querySelectorAll('.intercept-win .num')].map((n) => n.textContent));
  check('the win counts up six days and four cells', JSON.stringify(win) === '["6","4"]', JSON.stringify(win));
  check('choosing to winning takes well under 30 s', tWon < 20000, `${tWon} ms (scripted input)`);

  check('the Wren again, leaning over the chart', await until(page, () => window.__DEBUG__.engine.getCurrentScene()?.kind === 'ShipInteriorScene' && window.__DEBUG__.engine.getCurrentScene().player.pitch < -0.38, 60000));
  check('control returns once the player stands', await until(page, () => window.__DEBUG__.engine.getCurrentScene().player.enabled === true, 30000));
  // The console guide shows from its first frame with the player free to move.
  const lit = await until(page, () => {
    const scene = window.__DEBUG__.engine.getCurrentScene().scene;
    return scene.getObjectByName('tutorial-beacon-pillar')?.visible === true || scene.getObjectByName('tutorial-beacon-bracket')?.visible === true;
  }, 3000);
  const after = await page.evaluate(() => {
    const scene = window.__DEBUG__.engine.getCurrentScene();
    const d = window.__DEBUG__.gameState.data;
    return {
      course: d.course,
      a: d.attributes,
      before: window.__mg1Before,
      objective: d.objective,
      note: d.objectiveNote,
      shownNote: document.getElementById('objective-note')?.textContent,
      power: scene.power?.stage,
      pillar: scene.scene.getObjectByName('tutorial-beacon-pillar')?.visible === true,
      bracket: scene.scene.getObjectByName('tutorial-beacon-bracket')?.visible === true,
      crosshairHidden: document.getElementById('crosshair')?.classList.contains('hidden'),
    };
  });
  check('the plotted course is saved, figures and all', after.course?.points.length === 9 && after.course.days === 6 && after.course.cells === 4, JSON.stringify({ days: after.course?.days, cells: after.course?.cells, n: after.course?.points.length }));
  check('MG1 awards +1 insight and +1 engineering', after.a.insight === after.before.insight + 1 && after.a.engineering === after.before.engineering + 1);
  check('the objective is Kethra, at the navigation console', /Explore Kethra/.test(after.objective) && /navigation console/.test(after.objective), after.objective);
  check('logs and repairs are the optional second line, on screen', /Optional/.test(after.note) && /travel logs/.test(after.note) && after.shownNote === after.note, after.shownNote);
  check('the console is highlighted', lit, JSON.stringify({ pillar: after.pillar, bracket: after.bracket }));
  check('after the boot and the plot, navigation is online', after.power === 'navigation', after.power);
  check('the crosshair is back', after.crosshairHidden === false);
  // Across the room, the guide is a light column to walk to; setting a course retires it.
  await page.evaluate(() => window.__DEBUG__.engine.getCurrentScene().player.rig.position.set(0, 0, 3));
  check('from across the room, a light column marks the console', await until(page, () => window.__DEBUG__.engine.getCurrentScene().scene.getObjectByName('tutorial-beacon-pillar')?.visible === true, 3000));
  await page.evaluate(() => window.__DEBUG__.bus.emit('galaxy:travel_to', 'kethra'));
  check('setting a course retires the console guide', await page.evaluate(() => {
    const scene = window.__DEBUG__.engine.getCurrentScene().scene;
    return !scene.getObjectByName('tutorial-beacon-pillar') && !scene.getObjectByName('tutorial-beacon-bracket');
  }));
  check('no page or console errors', page.errors.length === 0, page.errors.slice(0, 3).join(' | '));
  await page.close();
}

// ---------------------------------------------------------------- the mouse path: point, don't click
{
  const page = await openPlot();
  await phaseIs(page, 'plot', 10000);
  // Let the camera settle on the plot's framing before reading the tick positions.
  await page.waitForTimeout(1500);
  const six = (await stateOf(page)).ticks.find((t) => t.day === 6);
  await page.mouse.move(six.x + 12, six.y + 8, { steps: 6 });
  check('pointing near a tick selects it, no click needed', (await stateOf(page)).meet === 6);
  check('…and pointing at the match locks the course', await phaseIs(page, 'locked', 3000));
  await page.mouse.click(683, 500);
  check('a click on the chart launches once locked', await phaseIs(page, 'run', 2000));
  check('no page or console errors (mouse)', page.errors.length === 0, page.errors.slice(0, 3).join(' | '));
  await page.close();
}

// ---------------------------------------------------------------- nobody gets stuck
{
  const page = await openPlot();
  await phaseIs(page, 'plot', 10000);
  check('a player who stalls gets ORION’s hint', await until(page, () => window.__DEBUG__.engine.getCurrentScene().intercept.state().hinted, 12000));
  check('…then "Let ORION plot it"', await until(page, () => !!document.querySelector('.intercept-auto'), 15000));
  await page.click('.intercept-auto');
  check('ORION plots it: the course locks for them', (await stateOf(page)).phase === 'locked');
  await page.close();
}

// ---------------------------------------------------------------- stats: insight 2
{
  const page = await openPlot(() => { window.__DEBUG__.gameState.data.attributes.insight = 2; });
  await phaseIs(page, 'plot', 10000);
  const s = await stateOf(page);
  check('insight 2 marks the meeting day from the start', s.hinted, JSON.stringify({ hinted: s.hinted }));
  check('…and says so on the plate', await page.evaluate(() => /Insight 2/.test(document.querySelector('.intercept-stats')?.textContent ?? '')));
  await page.close();
}

await browser.close();
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
