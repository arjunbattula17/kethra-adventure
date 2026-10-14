// Browser test of the Intercept minigame (MG1) with real input: ORION flies the hop, then the player
// drags the course's handle onto Kethra's path (or steps it with ← →), fixes the day using the two
// checks, and launches; the win returns to the Wren with the course saved. Also covers: Launch
// refused until both checks pass, no pointer lock on click (so repeated drags work), the timed hints
// and "Let ORION connect it" (which never launches for the player), insight 2, and the 30 s budget.
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
/** The plate's two checks, as { path, day } → { cls, text }, and the Launch button. */
const plate = (page) => page.evaluate(() => {
  const row = (k) => {
    const el = document.querySelector(`.charter-checks [data-check="${k}"]`);
    return { cls: el?.className ?? '', text: el?.textContent ?? '' };
  };
  const launch = document.querySelector('.charter-launch');
  return { path: row('path'), day: row('day'), launch: { ready: launch?.classList.contains('ready') ?? false, text: launch?.textContent ?? '' } };
});
/** The chart's chips, as drawn on the next frame (the chart redraws every frame, not on input). */
const chips = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))).then(() => page.evaluate(() => [...document.querySelectorAll('.chart-chip')].filter((c) => c.style.display !== 'none').map((c) => ({ text: c.textContent, cls: c.className }))));
/** Drags with the left button from one screen point to another, in small steps like a hand would. */
async function drag(page, from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
}

// ---------------------------------------------------------------- the keyboard path, start to finish
{
  const page = await openPlot(() => {
    const a = window.__DEBUG__.gameState.data.attributes;
    window.__mg1Before = { insight: a.insight, engineering: a.engineering };
  });
  check('MG1 opens on ORION’s hop, with no input asked for', (await stateOf(page)).phase === 'hop');
  const hopStart = Date.now();
  check('the hop hands over to the charter within a few seconds', await phaseIs(page, 'plot', 8000), `${Date.now() - hopStart} ms`);
  const t0 = Date.now();

  let s = await stateOf(page);
  check('the course starts short of Kethra’s path, unplugged', s.socket === null && !s.ready && !s.touched && s.solutionDay === 6, JSON.stringify({ socket: s.socket, ready: s.ready }));
  let p = await plate(page);
  check('neither check is green, and Launch says why', /bad/.test(p.path.cls) && /todo/.test(p.day.cls) && !p.launch.ready && /needs two/.test(p.launch.text), JSON.stringify(p));
  let c = await chips(page);
  check('the handle says “Drag me”', c.some((x) => /cta/.test(x.cls) && /Drag me/i.test(x.text)), JSON.stringify(c.map((x) => x.text)));
  check('Kethra’s markers are numbered 1 to 10, plus “Kethra now”', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].every((d) => c.some((x) => /num/.test(x.cls) && x.text === String(d))) && c.some((x) => x.text === 'Kethra now'));

  await page.keyboard.press('Space');
  await page.waitForTimeout(100);
  s = await stateOf(page);
  p = await plate(page);
  check('Launch before connecting flies nothing, and flashes the missing check', s.phase === 'plot' && /flash/.test(p.path.cls), p.path.cls);
  check('…and ORION says what to do', s.hinted && /blue markers/.test(await page.evaluate(() => document.getElementById('cinematic-caption')?.textContent ?? '')));

  await page.keyboard.press('ArrowRight');
  s = await stateOf(page);
  p = await plate(page);
  check('→ plugs the course into Kethra-now: on the path, wrong day', s.socket === 0 && /ok/.test(p.path.cls) && /bad/.test(p.day.cls), JSON.stringify({ socket: s.socket, path: p.path.cls, day: p.day.cls }));
  check('the plate says Kethra will have moved on, and to try later', /moved on/.test(p.day.text) && /later/.test(p.day.text) && p.day.text.includes('→'), p.day.text);
  c = await chips(page);
  check('the marker and the handle both read out their day, in red and gold', c.some((x) => /bad/.test(x.cls) && /Kethra: now/.test(x.text)) && c.some((x) => /you/.test(x.cls) && /We arrive: day 5/.test(x.text)), JSON.stringify(c.filter((x) => /big/.test(x.cls)).map((x) => x.text)));

  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
  p = await plate(page);
  check('day 3 is too late', (await stateOf(page)).socket === 3 && /Too late/.test(p.day.text) && /arrive day 5/.test(p.day.text), p.day.text);
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
  p = await plate(page);
  check('day 9 is too early, and says to try earlier', (await stateOf(page)).socket === 9 && /Too early/.test(p.day.text) && p.day.text.includes('←'), p.day.text);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  check('the handle stops at the last day offered', (await stateOf(page)).socket === 10);

  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowLeft');
  s = await stateOf(page);
  p = await plate(page);
  check('day 6: both checks green, Launch ready', s.socket === 6 && s.ready && /ok/.test(p.path.cls) && /ok/.test(p.day.cls) && p.launch.ready && /Launch/.test(p.launch.text), JSON.stringify(p));
  c = await chips(page);
  check('the chart agrees in green: “Kethra: day 6”, “We arrive: day 6”', c.some((x) => /good/.test(x.cls) && /✓ Kethra: day 6/.test(x.text)) && c.some((x) => /good/.test(x.cls) && /✓ We arrive: day 6/.test(x.text)), JSON.stringify(c.filter((x) => /big/.test(x.cls)).map((x) => x.text)));
  await page.keyboard.press('ArrowLeft');
  check('nothing latches: the course can still be changed', (await stateOf(page)).socket === 5 && !(await stateOf(page)).ready);
  await page.keyboard.press('ArrowRight');

  await page.keyboard.press('Space');
  check('Space launches the run', await phaseIs(page, 'run', 2000));
  check('the run arrives and the plot is won', await phaseIs(page, 'won', 15000));
  const tWon = Date.now() - t0;
  await page.waitForTimeout(1200);
  const win = await page.evaluate(() => [...document.querySelectorAll('.intercept-win .num')].map((n) => n.textContent));
  check('the win counts up six days and four cells', JSON.stringify(win) === '["6","4"]', JSON.stringify(win));
  check('charting to winning takes well under 30 s', tWon < 20000, `${tWon} ms (scripted input)`);
  check('the chart layer is gone at the win', await page.evaluate(() => !document.querySelector('.chart-overlay')?.classList.contains('shown')));

  check('the Wren again, leaning over the chart', await until(page, () => window.__DEBUG__.engine.getCurrentScene()?.kind === 'ShipInteriorScene' && window.__DEBUG__.engine.getCurrentScene().player.pitch < -0.38, 60000));
  check('the chart layer is removed with the scene', await page.evaluate(() => !document.querySelector('.chart-overlay') && !document.querySelector('.intercept-panel')));
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

// ---------------------------------------------------------------- the mouse path: drag, drop, fix, launch
{
  const page = await openPlot();
  await phaseIs(page, 'plot', 10000);
  // Let the camera settle on the chart's framing before reading positions.
  await page.waitForTimeout(1500);
  let s = await stateOf(page);
  const at = (d) => s.sockets.find((t) => t.day === d);
  await drag(page, s.handle, { x: at(0).x + 8, y: at(0).y + 6 });
  s = await stateOf(page);
  check('dragging the handle onto Kethra plugs it in, with a little slack', s.socket === 0 && s.touched, JSON.stringify({ socket: s.socket }));
  check('a click never captures the mouse', await page.evaluate(() => !document.pointerLockElement));
  await drag(page, s.handle, { x: at(3).x - 5, y: at(3).y - 7 });
  s = await stateOf(page);
  check('a second drag moves it along the path (day 3)', s.socket === 3, JSON.stringify({ socket: s.socket, handle: s.handle }));
  const mid = { x: (at(3).x + s.wren.x) / 2 + 40, y: (at(3).y + s.wren.y) / 2 + 30 };
  await drag(page, s.handle, mid);
  s = await stateOf(page);
  const p = await plate(page);
  check('dropped in open space, it floats free: off the path again', s.socket === null && /bad/.test(p.path.cls) && Math.hypot(s.handle.x - mid.x, s.handle.y - mid.y) < 3, JSON.stringify({ socket: s.socket, handle: s.handle, mid }));
  // No need to grab the handle exactly: pressing on a marker brings the course to it.
  await page.mouse.click(at(6).x + 4, at(6).y - 4);
  s = await stateOf(page);
  check('pressing on a marker connects the course to it; day 6 is the one', s.socket === 6 && s.ready, JSON.stringify({ socket: s.socket, ready: s.ready }));
  check('the cursor offers to grab over the chart', await page.evaluate(() => /grab/.test(window.__DEBUG__.engine.renderer.domElement.style.cursor)));
  await page.click('.charter-launch');
  check('clicking Launch flies it', await phaseIs(page, 'run', 2000));
  check('no page or console errors (mouse)', page.errors.length === 0, page.errors.slice(0, 3).join(' | '));
  await page.close();
}

// ---------------------------------------------------------------- nobody gets stuck, and nobody is played for
{
  const page = await openPlot();
  await phaseIs(page, 'plot', 10000);
  check('a player who stalls gets ORION’s hint', await until(page, () => window.__DEBUG__.engine.getCurrentScene().intercept.state().hinted, 12000));
  check('…then the meeting day’s marker lights up', await until(page, () => window.__DEBUG__.engine.getCurrentScene().intercept.state().pulsing && !!document.querySelector('.chart-socket.hint'), 10000));
  check('…then “Let ORION connect it”', await until(page, () => !!document.querySelector('.intercept-auto'), 12000));
  await page.click('.intercept-auto');
  check('ORION connects it: the course plugs into day 6', await until(page, () => window.__DEBUG__.engine.getCurrentScene().intercept.state().ready, 3000));
  check('…but doesn’t launch: that’s still the player’s', (await stateOf(page)).phase === 'plot');
  check('…and Launch has the focus', await page.evaluate(() => document.activeElement?.classList.contains('charter-launch') === true));
  await page.keyboard.press('Enter');
  check('Enter launches from there', await phaseIs(page, 'run', 2000));
  await page.close();
}

// ---------------------------------------------------------------- stats: insight 2
{
  const page = await openPlot(() => { window.__DEBUG__.gameState.data.attributes.insight = 2; });
  await phaseIs(page, 'plot', 10000);
  await page.waitForTimeout(300);
  const s = await stateOf(page);
  check('insight 2 marks the meeting day from the start', s.pulsing && (await page.evaluate(() => !!document.querySelector('.chart-socket.hint'))), JSON.stringify({ pulsing: s.pulsing }));
  check('…and says so on the plate', await page.evaluate(() => /Insight 2/.test(document.querySelector('.intercept-stats')?.textContent ?? '')));
  await page.close();
}

await browser.close();
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
