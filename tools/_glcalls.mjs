// Scratch probe: which shader programs get compiled between two marks, and by whom.
import { chromium } from 'playwright';
const [FROM = 'intro:uncovered', TO = 'intro:clock'] = process.argv.slice(2);
const b = await chromium.launch({ channel: 'chrome', headless: false, args: ['--use-angle=d3d11', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
await p.addInitScript(() => {
  window.__src = [];
  const proto = WebGL2RenderingContext.prototype;
  const ss = proto.shaderSource;
  proto.shaderSource = function (sh, src) {
    const name = /#define SHADER_NAME (\S+)/.exec(src)?.[1] || '';
    const defs = (src.match(/#define (USE_\w+|NUM_\w+ \d+|TONE_MAPPING|FLIP_SIDED|DOUBLE_SIDED|DEPTH_PACKING \d+)/g) || []).map((d) => d.slice(8)).join(',');
    window.__src.push({ t: performance.now(), name, len: src.length, defs, stack: new Error().stack.split('\n').slice(2, 9).map((l) => l.trim()).join(' < ') });
    return ss.call(this, sh, src);
  };
});
await p.goto('http://localhost:4176/kethra-adventure/');
await p.waitForSelector('.title-btn');
if (FROM === 'title') {
  await p.waitForFunction(() => performance.getEntriesByName('engine:environment').length > 0, undefined, { timeout: 120000 });
} else {
  await p.waitForTimeout(1500);
  await p.getByRole('button', { name: /New game/ }).click();
  await p.waitForFunction((to) => performance.getEntriesByName(to).length > 0, TO, { timeout: 120000 });
}
const r = await p.evaluate(([from, to]) => {
  const a = from === 'title' ? 0 : performance.getEntriesByName(from)[0].startTime;
  const z = from === 'title' ? 1e12 : performance.getEntriesByName(to)[0].startTime;
  return window.__src.filter((c) => c.t >= a && c.t <= z).map((c) => `${Math.round(c.t - a)} ms  ${c.name || '(unnamed)'} len=${c.len} ${c.defs}\n      ${c.stack}`);
}, [FROM, TO]);
console.log(r.join('\n'));
await b.close();
