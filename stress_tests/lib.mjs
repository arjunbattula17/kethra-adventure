// Shared harness for the stress suite: one Chromium at a time (memory is tight on this machine),
// every page instrumented with error capture and a per-frame invariant monitor.
import { chromium } from 'playwright';

export const BASE = process.env.STRESS_BASE ?? 'http://localhost:4180/kethra-adventure/';

let failed = 0;
export function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
  if (!ok) failed++;
  return ok;
}
export const failures = () => failed;
/** A finding left open on purpose (a design question): reported, but not a suite failure. */
export function known(name, ok, detail = '') {
  console.log(`${ok ? 'FIXED?' : 'KNOWN'}  ${name}${detail ? `  -- ${detail}` : ''}`);
}

export async function launch() {
  // GL and the anti-backgrounding flags: without them headless rAF crawls and timers stall.
  return chromium.launch({
    args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  });
}

/**
 * A page with its console errors and uncaught exceptions collected, and the invariant monitor
 * installed before any game code runs. `init` runs in the page before boot (for storage setup).
 */
export async function openPage(browser, query = '', { viewport = { width: 1280, height: 720 }, init } = {}) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  if (init) await page.addInitScript(init.fn, init.arg);
  await page.addInitScript(installMonitor);
  await page.goto(`${BASE}${query}`, { waitUntil: 'domcontentloaded' });
  return { page, context, errors };
}

/** Runs in the page: checks the invariants every frame and records the first violations. */
function installMonitor() {
  const S = (window.__STRESS__ = { violations: [], frames: 0, maxDt: 0, last: performance.now() });
  const note = (what) => {
    if (S.violations.length < 40 && !S.violations.some((v) => v.what === what)) S.violations.push({ what, frame: S.frames, t: +(performance.now() / 1000).toFixed(2) });
  };
  const finite = (v) => v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
  const tick = () => {
    requestAnimationFrame(tick);
    S.frames++;
    const now = performance.now();
    S.maxDt = Math.max(S.maxDt, now - S.last);
    S.last = now;
    const D = window.__DEBUG__;
    if (!D) return;
    const scene = D.engine.getCurrentScene?.();
    if (!scene) return;
    const cam = scene.camera;
    if (cam && !finite(cam.position)) note(`${scene.kind}: camera position not finite`);
    if (cam && cam.quaternion && ![cam.quaternion.x, cam.quaternion.y, cam.quaternion.z, cam.quaternion.w].every(Number.isFinite)) note(`${scene.kind}: camera rotation not finite`);
    const p = scene.player?.rig?.position;
    if (p) {
      if (!finite(p)) note(`${scene.kind}: player position not finite`);
      else if (p.y < -60) note(`${scene.kind}: player fell below y=-60 (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`);
    }
    const d = D.gameState?.data;
    if (d) {
      for (const k of ['xp', 'level', 'unspentPoints']) if (!Number.isFinite(d[k]) || d[k] < 0) note(`gameState.${k} = ${d[k]}`);
      for (const [k, v] of Object.entries(d.attributes ?? {})) if (!Number.isFinite(v) || v < 0) note(`attribute ${k} = ${v}`);
    }
  };
  requestAnimationFrame(tick);
}

export const kind = (page) => page.evaluate(() => window.__DEBUG__?.engine.getCurrentScene()?.kind ?? null);
export async function settled(page, k, timeout = 240000) {
  await page.waitForFunction((k) => window.__DEBUG__?.engine.getCurrentScene()?.kind === k && !window.__DEBUG__.flow.isTransitioning(), k, { timeout, polling: 250 });
}
export const until = (page, fn, timeout = 30000, arg) => page.waitForFunction(fn, arg, { timeout, polling: 100 }).then(() => true, () => false);
export const violations = (page) => page.evaluate(() => window.__STRESS__?.violations ?? []);
export async function teleport(page, x, y, z, yaw = 0) {
  await page.evaluate(([x, y, z, yaw]) => {
    const s = window.__DEBUG__.engine.getCurrentScene();
    s.player.teleport(new s.player.rig.position.constructor(x, y, z), yaw);
  }, [x, y, z, yaw]);
}
export async function press(page, code, hold = 90) {
  await page.keyboard.down(code);
  await page.waitForTimeout(hold);
  await page.keyboard.up(code);
}
/** Blocks the page's main thread for `ms`, as a stalled laptop or a backgrounded tab would. */
export const stall = (page, ms) => page.evaluate((ms) => { const end = performance.now() + ms; while (performance.now() < end) { /* busy */ } }, ms);
/** The first-trip throttle: hold Space through First light's ignitions. */
export async function throttle(page) {
  await page.waitForSelector('.first-light-hint', { timeout: 60000 });
  await page.keyboard.down('Space');
  await page.waitForFunction(() => window.__DEBUG__.engine.getCurrentScene()?.power?.stage === 'full', null, { timeout: 30000, polling: 100 });
  await page.keyboard.up('Space');
}
/** Summarises the page's errors and invariant violations as one check. */
export async function clean(page, errors, label) {
  const v = await violations(page).catch(() => []);
  const problems = [...errors, ...v.map((x) => `invariant: ${x.what} (frame ${x.frame})`)];
  return check(`${label}: no errors or invariant violations`, problems.length === 0, problems.slice(0, 4).join(' | '));
}
