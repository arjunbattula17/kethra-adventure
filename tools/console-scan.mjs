// Visits every place in the game on one quality tier, on the real GPU, and fails on any console
// warning or error and any page error: the brief's "no errors in the console", checked rather than
// assumed. WebGL validation messages (ANGLE's "GL_INVALID_OPERATION ...") arrive as warnings.
//
//   npm run build && npx vite preview --port 4180 --strictPort   (in another terminal)
//   node tools/console-scan.mjs [baseUrl] [--tier=low|medium|high]
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const BASE = args.find((a) => !a.startsWith('--')) ?? 'http://localhost:4180/kethra-adventure/';
const tier = (args.find((a) => a.startsWith('--tier=')) ?? '--tier=high').slice(7);
const ROUTES = [
  ['title', '', () => !!document.querySelector('.title-screen.backdrop-live')],
  ['intro', '?newGame=1', () => window.__DEBUG__?.flow.state === 'intro' && !window.__DEBUG__.flow.isTransitioning()],
  ['wren', '?skipIntro=1&newGame=1', () => window.__DEBUG__?.flow.state === 'wren' && !window.__DEBUG__.flow.isTransitioning()],
  ['reveal', '?newGame=1&skipTutorial=1', () => window.__DEBUG__?.flow.state === 'reveal' && !window.__DEBUG__.flow.isTransitioning()],
  ['kethra', '?skipIntro=1&newGame=1&unlockKethra=1&jump=kethra', () => window.__DEBUG__?.flow.state === 'kethra' && !window.__DEBUG__.flow.isTransitioning()],
  ['vessek', '?skipIntro=1&newGame=1&unlockVessek=1&jump=vessek', () => window.__DEBUG__?.flow.state === 'vessek' && !window.__DEBUG__.flow.isTransitioning()],
  ['ending', '?skipIntro=1&newGame=1&jump=ending', () => window.__DEBUG__?.flow.state === 'ending' && !window.__DEBUG__.flow.isTransitioning()],
];

const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
let failed = 0;
for (const [name, query, settled] of ROUTES) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const seen = [];
  page.on('console', (m) => (m.type() === 'warning' || m.type() === 'error') && seen.push(`${m.type()}: ${m.text().slice(0, 300)}`));
  page.on('pageerror', (e) => seen.push(`pageerror: ${e.message}`));
  const sep = query ? '&' : '?';
  await page.goto(`${BASE}${query}${sep}tier=${tier}`);
  const ok = await page.waitForFunction(settled, null, { timeout: 240000 }).then(() => true, () => false);
  await page.waitForTimeout(5000);
  const counts = new Map();
  for (const s of seen) counts.set(s, (counts.get(s) ?? 0) + 1);
  const clean = ok && counts.size === 0;
  if (!clean) failed++;
  console.log(`${clean ? 'PASS' : 'FAIL'}  ${name} (${tier})${ok ? '' : '  did not settle'}`);
  for (const [line, n] of counts) console.log(`      ${n} x ${line}`);
  await page.close();
}
await browser.close();
console.log(failed ? `\n${failed} route(s) not clean` : '\nall routes clean');
process.exit(failed ? 1 : 0);
