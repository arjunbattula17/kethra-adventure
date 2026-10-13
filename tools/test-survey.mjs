// The survey (src/content/discoveries.ts): every optional find can be obtained, pays its reward
// once, and shows its text. Each find is approached by standing where a player would stand and
// looking at it, then pressing E; whether a player can walk to that spot is tools/collision-check.mjs's
// job, and Kethra's stepping stones are crossed here with real jumps.
//
//   npm run build && npx vite preview --port 4180 --strictPort   (in another terminal)
//   node tools/test-survey.mjs [baseUrl] [wren|kethra|vessek ...]
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const BASE = args.find((a) => a.startsWith('http')) ?? 'http://localhost:4180/kethra-adventure/';
const ONLY = args.filter((a) => !a.startsWith('http'));
const wants = (level) => ONLY.length === 0 || ONLY.includes(level);
const EYE = 1.7;

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
const hasFlag = (f) => page.evaluate((f) => window.__DEBUG__.gameState.data.flags.includes(f), f);
const attr = (k) => page.evaluate((k) => window.__DEBUG__.gameState.data.attributes[k], k);
const prompt = () => page.evaluate(() => (document.querySelector('#interact-prompt.visible')?.textContent ?? '').replace(/^E/, ''));
const docTitle = () => page.evaluate(() => document.querySelector('.doc-panel h2')?.textContent ?? '');
const toasts = () => page.evaluate(() => [...document.querySelectorAll('.toast')].map((t) => t.textContent).join(' | '));
async function press(code, hold = 120) {
  await page.keyboard.down(code);
  await page.waitForTimeout(hold);
  await page.keyboard.up(code);
  await page.waitForTimeout(450);
}
/** Stands at `feet` looking at `at`, as a player facing the thing would. */
async function lookAt(feet, at) {
  await page.evaluate(({ feet, at, eye }) => {
    const s = window.__DEBUG__.engine.getCurrentScene();
    const dx = at[0] - feet[0];
    const dz = at[2] - feet[2];
    s.player.enabled = true;
    s.player.teleport(new s.player.rig.position.constructor(feet[0], feet[1], feet[2]), Math.atan2(-dx, -dz));
    s.player.pitch = Math.atan2(at[1] - (feet[1] + eye), Math.hypot(dx, dz));
  }, { feet, at, eye: EYE });
  await page.waitForTimeout(600);
}
/** Reads a find: the prompt, E, the document, Esc. Returns what was on screen. */
async function read(feet, at) {
  await lookAt(feet, at);
  const label = await prompt();
  await press('KeyE');
  const title = await docTitle();
  if (title) await press('Escape');
  return { label, title };
}
const survey = (level) => page.evaluate((level) => {
  const flags = window.__DEBUG__.gameState.data.flags;
  return window.__DEBUG__.survey.filter((d) => d.level === level).map((d) => ({ id: d.id, found: flags.includes(d.flag) }));
}, level);

// ------------------------------------------------------------------ the Wren
if (wants('wren')) {
  console.log('\n— the Wren');
  await page.goto(`${BASE}?newGame=1&skipIntro=1&unlockKethra=1&tier=low&seed=7`, { waitUntil: 'domcontentloaded' });
  await waitScene('ShipInteriorScene');
  await page.waitForTimeout(2500);

  let r = await read([-4.2, 0, -2.12], [-4.95, 0.95, -2.12]);
  check('the bench note is offered and opens', /note taped to the bench/.test(r.label) && /workbench/.test(r.title), `${r.label} / ${r.title}`);
  check('reading it counts toward the survey', await hasFlag('wren_found_bench_note'));

  await lookAt([4.3, 0, -1.88], [4.99, 1.56, -1.88]);
  check('the locker says it is locked before the key', /locked locker/.test(await prompt()), await prompt());
  await press('KeyE');
  check('E on the locked locker opens nothing', !(await hasFlag('wren_found_locker')) && !(await docTitle()), await toasts());

  await lookAt([-2.6, 0, -1.62], [-3.5, 0.02, -1.62]);
  check('the hatch lip is offered', /hatch/.test(await prompt()), await prompt());
  await press('KeyE');
  check('the key is found under the hatch', await hasFlag('wren_carrow_key'));
  await page.waitForTimeout(300);
  check('the hatch is not offered again', !/hatch/.test(await prompt()), await prompt());

  const perception = await attr('perception');
  const corruptedBefore = await page.evaluate(() => window.__DEBUG__.gameState.data.journalLogs.find((l) => l.id === 'log_signal')?.corrupted);
  r = await read([4.3, 0, -1.88], [4.99, 1.56, -1.88]);
  check('with the key the locker opens', /Unlock Carrow/.test(r.label) && /Locker A-1/.test(r.title), `${r.label} / ${r.title}`);
  check('the locker pays perception +1', (await attr('perception')) === perception + 1);
  const signal = await page.evaluate(() => window.__DEBUG__.gameState.data.journalLogs.find((l) => l.id === 'log_signal'));
  check('the day-22 log is restored', corruptedBefore === true && signal.corrupted === false && !signal.body.includes('▓'), signal.body.slice(0, 60));
  await read([4.3, 0, -1.88], [4.99, 1.56, -1.88]);
  check('a second look pays nothing more', (await attr('perception')) === perception + 1);

  const persuasion = await attr('persuasion');
  r = await read([-2.77, 0, 6.2], [-2.77, 1.34, 6.955]);
  check('the letter is offered and opens', /letter in the suit locker/.test(r.label) && /Mbeki/.test(r.title), `${r.label} / ${r.title}`);
  check('the letter pays persuasion +1', (await attr('persuasion')) === persuasion + 1);

  // ?unlockKethra leaves engineering at 1 (it is MG1 that raises it), so the gate can be seen shut.
  await lookAt([4.2, 0, -5.05], [4.872, 0.845, -5.05]);
  check('at engineering 1 the relay rack names the stat', /engineering 2/.test(await prompt()), await prompt());
  await press('KeyE');
  check('and refuses', !(await hasFlag('wren_found_relay')));
  await page.evaluate(() => window.__DEBUG__.gameState.addAttributeXp('engineering', 1));
  const insight = await attr('insight');
  r = await read([4.2, 0, -5.05], [4.872, 0.845, -5.05]);
  check('at engineering 2 the dead relay can be traced', /Trace the dead relay/.test(r.label) && /Relay rack/.test(r.title), `${r.label} / ${r.title}`);
  check('the relay pays insight +1', (await attr('insight')) === insight + 1);

  const wren = await survey('wren');
  check('the Wren’s survey is complete', wren.length === 4 && wren.every((d) => d.found), JSON.stringify(wren));

  // Nothing is offered during the opening.
  await page.goto(`${BASE}?newGame=1&skipIntro=1&tier=low&seed=7`, { waitUntil: 'domcontentloaded' });
  await waitScene('ShipInteriorScene');
  await page.waitForTimeout(2500);
  await lookAt([-4.2, 0, -2.12], [-4.95, 0.95, -2.12]);
  check('before the course is plotted the note is not offered', !/note/.test(await prompt()), await prompt());
}

// ------------------------------------------------------------------ Kethra
if (wants('kethra')) {
  console.log('\n— Kethra');
  const WALK = 3.2; // tuning.ts WALK_SPEED
  const feet = () => page.evaluate(() => {
    const p = window.__DEBUG__.engine.getCurrentScene().player.rig.position;
    return [p.x, p.y, p.z];
  });
  // dressing.ts STEPPING_STONES: [x, z, top, radius]. The terrace's edge is the hop's first "stone".
  const STONES = [[16.9, 4.2, 0.82, 0.75], [19.26, 5.41, 0.66, 0.75], [21.62, 6.62, 0.5, 0.75], [24.3, 8.0, 0.36, 1.2]];
  const turnTo = (x, z) => page.evaluate(({ x, z }) => {
    const pl = window.__DEBUG__.engine.getCurrentScene().player;
    pl.yaw = Math.atan2(-(x - pl.rig.position.x), -(z - pl.rig.position.z));
    pl.rig.rotation.set(0, pl.yaw, 0);
  }, { x, z });
  /** One walking jump toward (x, z): walk `run` metres, jump, let go on landing. */
  async function hop(x, z, run) {
    await turnTo(x, z);
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(Math.max(0, (run / WALK) * 1000));
    await page.keyboard.down('Space');
    await page.waitForTimeout(80);
    await page.keyboard.up('Space');
    await page.waitForTimeout(640);
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(500);
  }
  const on = async ([sx, sz, top, r]) => {
    const [x, y, z] = await feet();
    return { ok: Math.hypot(x - sx, z - sz) < r && Math.abs(y - top) < 0.08, at: `${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}` };
  };

  await page.goto(`${BASE}?newGame=1&skipIntro=1&unlockKethra=1&jump=kethra&tier=low&seed=7`, { waitUntil: 'domcontentloaded' });
  await waitScene('KethraScene');
  await page.waitForTimeout(2500);
  await page.mouse.click(683, 384);
  await page.waitForTimeout(900);

  // The landing to the plaza, straight ahead from the spawn: this used to fall in the pool.
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(3600);
  await page.keyboard.up('KeyW');
  let [, y0, z0] = await feet();
  check('walking straight from the spawn reaches the plaza', z0 < 8 && Math.abs(y0 - 0.38) < 0.05, `z ${z0.toFixed(2)}, y ${y0.toFixed(2)}; ${await toasts()}`);

  // The stepping stones, with real jumps: the terrace's north edge (z = 2.2) to the first.
  await lookAt([16.9, 0.98, 1.2], [16.9, 0.9, 4.2]);
  await hop(16.9, 4.2, 0.85);
  let where = await on(STONES[0]);
  check('a jump from the terrace’s edge lands on the first stone', where.ok, where.at);
  for (let i = 1; i < STONES.length; i++) {
    const [px, , pz] = await feet();
    const [cx, cz, , r] = STONES[i - 1];
    const [nx, nz] = STONES[i];
    const d = Math.hypot(nx - px, nz - pz);
    // Metres to the take-off point: just short of this stone's edge along the heading.
    const along = ((px - cx) * (nx - px) + (pz - cz) * (nz - pz)) / d;
    await hop(nx, nz, Math.max(0, r * 0.9 - along - 0.15));
    where = await on(STONES[i]);
    check(`a walking jump lands on ${i === STONES.length - 1 ? 'the slab under the tree' : `stone ${i + 1}`}`, where.ok, where.at);
  }

  const persuasion = await attr('persuasion');
  let r = await read([23.7, 0.36, 7.9], [25.0, 1.6, 8.1]);
  check('Oshel’s lantern is offered and opens', /child’s lantern/.test(r.label) && /Oshel/.test(r.title), `${r.label} / ${r.title}`);
  check('Oshel’s grove pays persuasion +1', (await attr('persuasion')) === persuasion + 1);

  // A fall from the stones wades back to the terrace's edge, not the landing.
  await lookAt([19.26, 0.66, 5.41], [19.26, 0.6, 9]);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(600);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(1400);
  const [fx, , fz] = await feet();
  check('falling off a stone returns to the east terrace', Math.hypot(fx - 16.9, fz - 1.0) < 0.6 && /slip off the stone/.test(await toasts()), `${fx.toFixed(2)}, ${fz.toFixed(2)}; ${await toasts()}`);

  await lookAt([-4.2, 1.48, -29.0], [-5.2, 6.88, -31.9]);
  check('the perch is not offered while the moth keeps the chamber', !/perch/.test(await prompt()), await prompt());

  // Reading an inscription puts its text on screen (it used to show only a one-line toast).
  const archaeology = await attr('archaeology');
  r = await read([-16, 0.98, -1.4], [-16, 1.8, -3]);
  check('an inscription opens as a document', /Read Inscription 1/.test(r.label) && /First Breath/.test(r.title), `${r.label} / ${r.title}`);
  check('and pays archaeology +1 once', (await attr('archaeology')) === archaeology + 1);
  await read([-16, 0.98, -1.4], [-16, 1.8, -3]);
  check('a second read pays nothing', (await attr('archaeology')) === archaeology + 1);

  // The Heart awake: the moth has left its perch, and Oshel's lantern reads differently.
  await page.goto(`${BASE}?newGame=1&skipIntro=1&unlockKethra=1&tier=low&seed=7`, { waitUntil: 'domcontentloaded' });
  await waitScene('ShipInteriorScene');
  await page.evaluate(() => window.__DEBUG__.gameState.setFlag('kethra_mechanism_solved'));
  await page.evaluate(() => window.__DEBUG__.flow.debugGo('kethra'));
  await waitScene('KethraScene');
  await page.waitForTimeout(2500);
  await page.mouse.click(683, 384);
  await page.waitForTimeout(900);
  check('the objective on a return visit is the awake one', /The Heart is awake/.test(await page.evaluate(() => document.getElementById('objective-text')?.textContent ?? '')));

  const perception = await attr('perception');
  r = await read([-4.2, 1.48, -29.0], [-5.2, 6.88, -31.9]);
  check('the empty perch is offered and opens', /empty perch/.test(r.label) && /Wickmoth/.test(r.title), `${r.label} / ${r.title}`);
  check('the perch pays perception +1', (await attr('perception')) === perception + 1);

  await lookAt([23.7, 0.36, 7.9], [25.0, 1.6, 8.1]);
  await press('KeyE');
  const body = await page.evaluate(() => document.querySelector('.doc-body')?.textContent ?? '');
  check('awake, Oshel’s lantern is lit', /lantern on the lowest bough is lit/.test(body), body.slice(0, 70));
  await press('Escape');

  for (const [name, at, look] of [
    ['inscription 1', [-16, 0.98, -1.4], [-16, 1.8, -3]],
    ['inscription 2', [16, 0.98, -1.4], [16, 1.8, -3]],
    ['inscription 3', [-20, 2.78, -7.0], [-20, 3.6, -8]],
    ['the shrine', [-1.5, 0.38, 6.6], [-1.5, 1.3, 5]],
    ['the carving', [-3.5, 1.48, -11.7], [-4.07, 2.5, -10.12]],
  ]) {
    r = await read(at, look);
    check(`${name} opens as a document`, !!r.title, `${r.label} / ${r.title}`);
  }
  // The valve's wheel is a flat ring: aim at its bracket, not through the hole.
  await lookAt([2.5, 0.38, 9.3], [2.5, 0.7, 8.25]);
  await press('KeyE');
  const kethra = await survey('kethra');
  check('Kethra’s survey is complete', kethra.length === 8 && kethra.every((d) => d.found), JSON.stringify(kethra.filter((d) => !d.found)));
}

// ------------------------------------------------------------------ Vessek Anchorage
if (wants('vessek')) {
  console.log('\n— Vessek Anchorage');
  await page.goto(`${BASE}?newGame=1&skipIntro=1&unlockVessek=1&jump=vessek&tier=low&seed=7`, { waitUntil: 'domcontentloaded' });
  await waitScene('VessekScene');
  await page.waitForTimeout(2500);
  const feet = () => page.evaluate(() => {
    const p = window.__DEBUG__.engine.getCurrentScene().player.rig.position;
    return [p.x, p.y, p.z];
  });

  const insight = await attr('insight');
  let r = await read([5.6, 0, 2.6], [6.54, 1.28, 2]);
  check('the scope is offered and opens', /Look through the scope/.test(r.label) && /scope/.test(r.title), `${r.label} / ${r.title}`);
  check('the scope pays insight +1', (await attr('insight')) === insight + 1);

  const engineering = await attr('engineering');
  r = await read([2, 0, -34.5], [2, 1.4, -35.5]);
  check('the seed book is offered and opens', /book on the nail/.test(r.label) && /seed book/.test(r.title), `${r.label} / ${r.title}`);
  check('the seed book pays engineering +1', (await attr('engineering')) === engineering + 1);

  // Dace's chalk sky is in her duct, which the fans block while their circuit runs. Crawl it with
  // real keys: fans off at their lever, in at the school's north wall, up the ladder, north.
  await lookAt([-12.2, 0, 4.4], [-12.9, 1.3, 4.4]);
  check('the fans lever is offered', /fans/i.test(await prompt()), await prompt());
  await press('KeyE');
  await lookAt([-18, 0, 1.6], [-18, 0.6, -4]);
  await page.keyboard.down('ControlLeft');
  await page.keyboard.down('KeyW');
  // In at the mouth, 4.4 m of duct to the ladder, 2.5 m up it (W climbs), then north along the top.
  const reached = await page.waitForFunction(() => {
    const p = window.__DEBUG__.engine.getCurrentScene().player.rig.position;
    return p.y > 2.4 && p.z < -14.2;
  }, null, { timeout: 40000, polling: 100 }).then(() => true, () => false);
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ControlLeft');
  const [dx, dy, dz] = await feet();
  check('crawling in from the school reaches the duct’s upper run', reached, `${dx.toFixed(2)}, ${dy.toFixed(2)}, ${dz.toFixed(2)}`);
  const perception = await attr('perception');
  await page.evaluate(() => {
    const pl = window.__DEBUG__.engine.getCurrentScene().player;
    pl.yaw = Math.atan2(0.64, 1.0);
    pl.rig.rotation.set(0, pl.yaw, 0);
    pl.pitch = 0.3;
  });
  await page.waitForTimeout(500);
  const label = await prompt();
  await press('KeyE');
  const title = await docTitle();
  check('the chalk sky is offered from inside the duct and opens', /chalk on the wall/.test(label) && /Chalk/.test(title), `${label} / ${title}`);
  if (title) await press('Escape');
  check('the chalk sky pays perception +1', (await attr('perception')) === perception + 1);

  // Dace's own question, which the dialogue fix made reachable: met on the first talk, asked on the second.
  await lookAt([-15.6, 0, 6.5], [-17, 1.5, 6.5]);
  await press('KeyE');
  check('Dace introduces herself', /I’m Dace/.test(await page.textContent('#dialogue-text').catch(() => '') ?? ''));
  await press('Escape');
  check('talking to her records the meeting', await hasFlag('vessek_dace_met'));
  await page.evaluate(() => window.__DEBUG__.gameState.setFlag('vessek_school_lit'));
  await page.waitForTimeout(900);
  await lookAt([-15.6, 0, 6.5], [-17, 1.5, 6.5]);
  await press('KeyE');
  const asks = (await page.textContent('#dialogue-text').catch(() => '')) ?? '';
  check('on a later talk she asks about other stars', /other stars are different colours/.test(asks), asks.slice(0, 60));
  const persuasion = await attr('persuasion');
  await press('Digit1');
  check('answering pays persuasion +1', (await attr('persuasion')) === persuasion + 1 && (await hasFlag('vessek_dace_stars')));
  await press('Escape');

  const vessek = await survey('vessek');
  const open = vessek.filter((d) => !d.found).map((d) => d.id);
  // The ring plate needs archaeology 2 and the bent grate traversal 2: both are in tools/test-vessek-flow.mjs.
  check('every find without a stat gate is found', open.every((id) => id === 'vessek_plate' || id === 'vessek_grate') && vessek.length === 6, JSON.stringify(open));
}

check('no page or console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall passed');
process.exit(failed ? 1 : 0);
