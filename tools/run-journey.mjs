// The whole journey in one command: every flow test, in the order a player meets them, against one
// build. Exits non-zero if any fails. Each test launches its own browser, so they run one at a time.
//
//   npm run build && npx vite preview --port 4180 --strictPort   (in another terminal)
//   node tools/run-journey.mjs [baseUrl]
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BASE = process.argv[2] ?? 'http://localhost:4180/kethra-adventure/';
const TESTS = ['test-intercept-sim', 'test-canopy-layout', 'smoke', 'test-tutorial-flow', 'test-mg1-flow', 'test-cruise-flow', 'test-mg2-flow', 'test-dialogue-esc', 'test-kethra-flow', 'test-vessek-flow'];

const results = [];
for (const name of TESTS) {
  const started = Date.now();
  const run = spawnSync(process.execPath, [fileURLToPath(new URL(`./${name}.mjs`, import.meta.url)), BASE], { encoding: 'utf8' });
  const seconds = ((Date.now() - started) / 1000).toFixed(0);
  const ok = run.status === 0;
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${seconds} s)`);
  if (!ok) {
    const out = `${run.stdout}\n${run.stderr}`.trim().split('\n');
    for (const line of out.filter((l) => /FAIL|Error|Timeout/.test(l)).slice(0, 8)) console.log(`      ${line}`);
  }
}
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\n${failed.length} of ${results.length} failed` : `\nall ${results.length} passed`);
process.exit(failed.length ? 1 : 0);
