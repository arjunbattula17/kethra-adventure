// Lists every frame gap and long task in a startup-profile run, against the span it fell inside.
//   node tools/startup-gaps.mjs <label> [run index] [--min=100]
import { readFileSync } from 'node:fs';
const args = process.argv.slice(2);
const [label, idx = '0'] = args.filter((a) => !a.startsWith('--'));
const min = Number(args.find((a) => a.startsWith('--min='))?.split('=')[1] ?? 100);
const r = JSON.parse(readFileSync(`docs/perf/${label}/startup.json`, 'utf8')).runs[Number(idx)];
const click = r.marks['title:newGame'] ?? r.marks['title:continue'] ?? 0;
const spans = Object.entries(r.spans).map(([n, s]) => [s.at, s.at + s.ms, n]);
const inside = (t) => spans.filter(([a, b]) => t >= a && t <= b).map((s) => s[2]).join(', ') || '-';
console.log('marks (ms after click):', Object.entries(r.marks).map(([k, v]) => `${k} ${v - click}`).join(' | '));
for (const [a, b, n] of spans.sort((x, y) => x[0] - y[0])) console.log(`  span ${String(a - click).padStart(7)} .. ${String(b - click).padStart(7)}  ${n}`);
if (r.gaps) for (const [t, d] of r.gaps.filter((g) => g[1] >= min)) console.log(`  frame gap ${String(Math.round(t - d - click)).padStart(7)} +${Math.round(d)} ms   during ${inside(t - d / 2)}`);
if (r.long) for (const [t, d] of r.long.filter((g) => g[1] >= min)) console.log(`  long task ${String(Math.round(t - click)).padStart(7)} +${Math.round(d)} ms   during ${inside(t + d / 2)}`);
