// The whole stress suite, one scenario at a time (each launches its own browser; memory is tight).
// Exits non-zero if any scenario fails. KNOWN lines are open design questions, not failures.
//
//   npm run build && npx vite preview --port 4180 --strictPort   (in another terminal)
//   node stress_tests/run.mjs
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCENARIOS = ['bus-rules', 's01-saves', 's02-input', 's05-travel', 's06-vessek', 's07-flow', 's08-kethra', 's09-failures', 's10-reveal', 's11-firstlight', 's12-governor', 's14-small', 's15-seams', 's04-endurance'];

const results = [];
for (const name of SCENARIOS) {
  const started = Date.now();
  const run = spawnSync(process.execPath, [fileURLToPath(new URL(`./${name}.mjs`, import.meta.url))], { encoding: 'utf8', env: process.env });
  const seconds = ((Date.now() - started) / 1000).toFixed(0);
  const ok = run.status === 0;
  results.push({ name, ok });
  const out = `${run.stdout}\n${run.stderr}`.split('\n');
  const known = out.filter((l) => /^(KNOWN|FIXED\?)/.test(l));
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${seconds} s)${known.length ? `  [${known.length} known]` : ''}`);
  for (const line of out.filter((l) => (!ok && /^FAIL|Error|Timeout/.test(l)) || /^(KNOWN|FIXED\?)/.test(l)).slice(0, 8)) console.log(`      ${line}`);
}
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\n${failed.length} of ${results.length} scenarios failed` : `\nall ${results.length} scenarios passed`);
process.exit(failed.length ? 1 : 0);
