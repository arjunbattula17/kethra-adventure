// Chrome trace of New game -> intro, on a fresh browser profile and this machine's GPU, summarised per
// thread: which work ran on the GPU process's main thread (where it stops every tab from drawing),
// which ran on the shader-compile workers, and which on the page's main thread.
//
//   npx vite preview   (in another terminal)
//   node tools/startup-trace.mjs <label> [baseUrl] [--cold-gpu] [--from=<mark>] [--to=<mark>]
//
// Writes docs/perf/<label>/trace-summary.json (and the raw trace to the OS temp folder).
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, d) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? d;
const [LABEL = 'trace', BASE = 'http://localhost:4173/kethra-adventure/'] = args.filter((a) => !a.startsWith('--'));
const FROM = opt('from', 'title:newGame');
const TO = opt('to', 'intro:uncovered');
const OUT = `docs/perf/${LABEL}`;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--use-angle=d3d11', '--enable-gpu', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
const page = await context.newPage();
if (args.includes('--cold-gpu')) {
  const nonce = Math.floor(Math.random() * 1e6);
  await page.addInitScript((nonce) => {
    for (const proto of [WebGL2RenderingContext.prototype, WebGLRenderingContext.prototype]) {
      const orig = proto.shaderSource;
      proto.shaderSource = function (shader, src) {
        const m = /void\s+main\s*\(\s*(?:void)?\s*\)\s*\{/.exec(src);
        if (!m) return orig.call(this, shader, src);
        const k = `${1000000 + nonce}.5`;
        let tail = null;
        if (/gl_Position\s*=/.test(src)) tail = `void main() { kethra_nonce_main(); gl_Position.x += step(${k}, gl_Position.y) * 1e-20; }`;
        else {
          const out = /#version\s+300\s+es/.test(src) ? /\bout\s+(?:highp\s+|mediump\s+|lowp\s+)?vec4\s+(\w+)\s*;/.exec(src)?.[1] : 'gl_FragColor';
          if (out) tail = `void main() { kethra_nonce_main(); ${out}.a += step(${k}, gl_FragCoord.x) * 1e-20; }`;
        }
        if (!tail) return orig.call(this, shader, src);
        return orig.call(this, shader, `${src.slice(0, m.index)}void kethra_nonce_main() {${src.slice(m.index + m[0].length)}\n${tail}\n`);
      };
    }
  }, nonce);
}
const cdp = await browser.newBrowserCDPSession();
const categories = [
  'toplevel', 'blink.user_timing', 'devtools.timeline', 'disabled-by-default-devtools.timeline', 'v8.execute',
  'gpu', 'gpu.angle', 'gpu.service', 'disabled-by-default-gpu.service', 'disabled-by-default-gpu.decoder', 'viz', 'cc', 'gpu.capture',
];
await page.goto(BASE, { waitUntil: 'commit' });
await page.waitForSelector('.title-btn', { timeout: 120000 });
if (!args.includes('--idle')) await page.waitForTimeout(1000);
await cdp.send('Tracing.start', { transferMode: 'ReturnAsStream', traceConfig: { includedCategories: categories, recordMode: 'recordContinuously' } });
await page.waitForTimeout(300);
// --idle: trace the title screen sitting idle (no click) for 4 s.
if (args.includes('--idle')) {
  await page.waitForTimeout(4000);
} else {
  await page.getByRole('button', { name: /New game/ }).click();
  await page.waitForFunction((to) => performance.getEntriesByName(to.replace(/^span(-end)?:/, '')).length > 0, TO, { timeout: 600000, polling: 200 });
}
await page.waitForTimeout(500);
const done = new Promise((resolve) => cdp.once('Tracing.tracingComplete', resolve));
await cdp.send('Tracing.end');
const { stream } = await done;
const rawPath = join(tmpdir(), `kethra-trace-${LABEL}.json`);
const file = createWriteStream(rawPath);
for (;;) {
  const { data, eof, base64Encoded } = await cdp.send('IO.read', { handle: stream, size: 1 << 20 });
  file.write(base64Encoded ? Buffer.from(data, 'base64') : data);
  if (eof) break;
}
await new Promise((r) => file.end(r));
await cdp.send('IO.close', { handle: stream });
await browser.close();

// ---- summarise ----
const { readFileSync } = await import('node:fs');
const raw = JSON.parse(readFileSync(rawPath, 'utf8'));
const events = raw.traceEvents ?? raw;
const threadName = new Map();
const procName = new Map();
for (const e of events) {
  if (e.ph === 'M' && e.name === 'thread_name') threadName.set(`${e.pid}:${e.tid}`, e.args.name);
  if (e.ph === 'M' && e.name === 'process_name') procName.set(e.pid, e.args.name);
}
// The window, from the game's own marks (User Timing events carry the mark name).
// A mark, or a span (User Timing measure) by name: 'span:<name>' / 'span-end:<name>'.
const markTs = (name) => {
  const [kind, span] = name.startsWith('span:') ? ['b', name.slice(5)] : name.startsWith('span-end:') ? ['e', name.slice(9)] : [null, name];
  if (kind) return events.find((e) => e.cat?.includes('blink.user_timing') && e.name === span && e.ph === kind)?.ts;
  return events.find((e) => e.cat?.includes('blink.user_timing') && e.name === name)?.ts;
};
const t0 = markTs(FROM);
const t1 = markTs(TO);
if (!t0 || !t1) {
  console.log('marks not found in trace; window = whole trace');
}
const inWin = (e) => (!t0 || e.ts >= t0) && (!t1 || e.ts <= t1);
// Complete events only (ph X), top level per thread: total busy time by name.
const perThread = new Map();
for (const e of events) {
  if (e.ph !== 'X' || !inWin(e) || !e.dur) continue;
  const key = `${e.pid}:${e.tid}`;
  let t = perThread.get(key);
  if (!t) perThread.set(key, (t = { name: `${procName.get(e.pid) ?? e.pid} / ${threadName.get(key) ?? e.tid}`, byName: new Map(), spans: [] }));
  t.byName.set(e.name, (t.byName.get(e.name) ?? 0) + e.dur / 1000);
  t.spans.push([e.ts, e.ts + e.dur]);
}
// Busy time = union of top-level intervals.
const busy = (spans) => {
  spans.sort((a, b) => a[0] - b[0]);
  let total = 0;
  let [s, e] = [-1, -1];
  for (const [a, b] of spans) {
    if (a > e) {
      if (e > s) total += e - s;
      [s, e] = [a, b];
    } else if (b > e) e = b;
  }
  if (e > s) total += e - s;
  return total / 1000;
};
const summary = { label: LABEL, windowMs: t0 && t1 ? Math.round((t1 - t0) / 1000) : null, threads: [] };
for (const t of perThread.values()) {
  const top = [...t.byName.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([n, ms]) => [n, Math.round(ms)]);
  summary.threads.push({ thread: t.name, busyMs: Math.round(busy(t.spans)), top });
}
summary.threads.sort((a, b) => b.busyMs - a.busyMs);
writeFileSync(`${OUT}/trace-summary.json`, JSON.stringify(summary, null, 1));
console.log(`window ${FROM} -> ${TO}: ${summary.windowMs} ms; raw trace ${rawPath}`);
for (const t of summary.threads.slice(0, 12)) {
  console.log(`${String(t.busyMs).padStart(7)} ms busy  ${t.thread}`);
  for (const [n, ms] of t.top.slice(0, 8)) console.log(`           ${String(ms).padStart(7)}  ${n}`);
}
