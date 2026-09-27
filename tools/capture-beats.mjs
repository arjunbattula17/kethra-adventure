// Screenshots of scenes at exact beats, at several resolutions and quality tiers: the verification
// matrix in docs/BRIEF.md (<verification>). Each shot waits for the scene's own clock to reach the
// beat, freezes the game clock through the debug harness, shoots, and unfreezes, so a beat is the
// same frame on a fast or slow run.
//
//   npm run build && npx vite preview --port 4180 --strictPort   (in another terminal)
//   node tools/capture-beats.mjs <outDir> [baseUrl] [--only=intro,reveal] [--sizes=1920x1080,1280x720]
//                                [--tiers=high,low] [--format=png|jpg]
//
// Files: <outDir>/<scene>-<beat>s-<tier>-<w>x<h>.<ext>
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (name, d) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? d;
const [OUT = 'renders/beats', BASE = 'http://localhost:4180/kethra-adventure/'] = args.filter((a) => !a.startsWith('--'));
const SIZES = opt('sizes', '1920x1080').split(',').map((s) => s.split('x').map(Number));
const TIERS = opt('tiers', 'high').split(',');
const ONLY = opt('only', '').split(',').filter(Boolean);
const FORMAT = opt('format', 'png');
mkdirSync(OUT, { recursive: true });

// clock: the scene's own seconds, read in the page. `sceneTime` is game time since the scene
// became current (tracked by this tool); scenes with a private clock say so.
const SCENES = [
  { name: 'intro', query: '?newGame=1', kind: 'IntroScene', clock: 's.elapsed', beats: [2, 7.0, 14, 19] },
  { name: 'reveal', query: '?newGame=1&skipTutorial=1', kind: 'GalaxyRevealScene', clock: 'sceneTime', beats: [1.5, 5.8, 8.2, 13] },
  {
    name: 'ship', query: '?newGame=1&skipIntro=1', kind: 'ShipInteriorScene', clock: 'sceneTime', beats: [3],
    // Named views, [x, y, z, yaw, pitch] (feet position): shot after the beats, 0.6 s after each teleport.
    views: [['console', 0, 0, -2, 0, -0.1], ['airlock', 0, 0, 2, Math.PI, 0], ['repair', 2.2, 0, 1.6, -Math.PI / 2, -0.15], ['window-bay', -1.5, 0, -3.2, 0.5, 0.05]],
  },
  { name: 'kethra', query: '?newGame=1&skipIntro=1&unlockKethra=1&jump=kethra', kind: 'KethraScene', clock: 'sceneTime', beats: [3] },
  { name: 'vessek', query: '?newGame=1&skipIntro=1&unlockVessek=1&jump=vessek', kind: 'VessekScene', clock: 'sceneTime', beats: [3] },
  { name: 'ending', query: '?newGame=1&skipIntro=1&unlockVessek=1&jump=ending', kind: 'EndingScene', clock: 'sceneTime', beats: [3, 10, 20] },
].filter((s) => !ONLY.length || ONLY.includes(s.name));

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
const errors = [];
let shots = 0;
for (const tier of TIERS) {
  for (const [w, h] of SIZES) {
    for (const sc of SCENES) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      page.on('pageerror', (e) => errors.push(`${sc.name}: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(`${sc.name}: ${m.text()}`); });
      const sep = sc.query.includes('?') ? '&' : '?';
      await page.goto(`${BASE}${sc.query}${sep}debug=1&seed=7&tier=${tier}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction((k) => window.__DEBUG__?.engine.getCurrentScene()?.kind === k, sc.kind, { timeout: 240000, polling: 250 });
      // Hide the harness overlay from the shot.
      await page.addStyleTag({ content: '.debug-overlay, .debug-menu { display: none !important; }' });
      await page.evaluate(() => { window.__beatStart = window.__DEBUG__.motion.gameTime; });
      for (const beat of sc.beats) {
        await page.waitForFunction(
          ({ clock, beat }) => {
            const s = window.__DEBUG__.engine.getCurrentScene();
            const sceneTime = window.__DEBUG__.motion.gameTime - window.__beatStart;
            const t = clock === 'sceneTime' ? sceneTime : s.elapsed;
            if (t >= beat) {
              window.__DEBUG__.motion.frozen = true;
              return true;
            }
            return false;
          },
          { clock: sc.clock, beat },
          { timeout: 120000, polling: 'raf' },
        );
        // Two frames so the frozen frame (and its UI) is what's on screen.
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        const file = `${OUT}/${sc.name}-${String(beat).padStart(4, '0')}s-${tier}-${w}x${h}.${FORMAT}`;
        await page.screenshot({ path: file, ...(FORMAT === 'jpg' ? { type: 'jpeg', quality: 90 } : {}) });
        shots++;
        console.log('  ', file);
        await page.evaluate(() => { window.__DEBUG__.motion.frozen = false; });
      }
      for (const [view, x, y, z, yaw, pitch] of sc.views ?? []) {
        await page.evaluate(({ x, y, z, yaw, pitch }) => {
          const s = window.__DEBUG__.engine.getCurrentScene();
          s.player.teleport(new s.player.rig.position.constructor(x, y, z), yaw);
          s.player.pitch = pitch;
        }, { x, y, z, yaw, pitch });
        await page.waitForTimeout(600);
        const file = `${OUT}/${sc.name}-view-${view}-${tier}-${w}x${h}.${FORMAT}`;
        await page.screenshot({ path: file, ...(FORMAT === 'jpg' ? { type: 'jpeg', quality: 90 } : {}) });
        shots++;
        console.log('  ', file);
      }
      await page.close();
    }
  }
}
await browser.close();
console.log(`${shots} shots, ${errors.length} page/console errors`);
if (errors.length) console.log([...new Set(errors)].slice(0, 10).join('\n'));
process.exit(errors.length ? 1 : 0);
