import { chromium } from 'playwright';

const url = process.argv[2] || 'http://localhost:5180';
const outDir = process.argv[3] || '.';
const browser = await chromium.launch({
  // Software GL, and Chromium throttles timers and rAF in a headless page nothing interacts with, which
  // stretches the puzzle's own setTimeout-driven pacing out to minutes. These keep the page
  // running at a real rate so the waits below mean what they say.
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push('CONSOLE ' + msg.text());
  if (msg.text().startsWith('[battle]')) console.log(msg.text());
});
// ?skipTutorial: this harness tests the threat-response puzzle, not the opening that now leads
// into it. tools/test-tutorial-flow.mjs covers the tutorial -> desk -> console -> puzzle route.
await page.goto(url + '/?skipTutorial=1&newGame=1', { waitUntil: 'load' });

const HINT_TO_LABEL = {
  'Brace against a direct hit.': 'Shields',
  'Read the weak point in their targeting array.': 'Scanner',
  'Slip out of their firing arc.': 'Thrusters',
};

async function clickNodeByLabel(label) {
  const clicked = await page.evaluate((lbl) => {
    const nodes = Array.from(document.querySelectorAll('.power-node'));
    const target = nodes.find((n) => n.textContent.includes(lbl));
    if (target) {
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      return true;
    }
    return false;
  }, label);
  return clicked;
}

// Wait for the battle panel. With ?skipTutorial it is the first thing on screen.
// Generous: software rasterisation makes this scene take ~20s to boot where real hardware takes
// ~2s, and none of that has anything to do with what this tool is checking.
await page.waitForSelector('#power-puzzle-panel', { timeout: 90000 });
console.log('Battle puzzle appeared.');

let rounds = 0;
let safety = 0;
while (rounds < 3 && safety < 60) {
  safety++;
  const hintEl = await page.$('#power-puzzle-panel .subtitle');
  const roundHeading = await page.$eval('#power-puzzle-panel h2', (el) => el.textContent).catch(() => null);
  const hasNodes = await page.$('#power-nodes');
  if (!hasNodes) {
    // telegraph phase, just wait
    await page.waitForTimeout(400);
    continue;
  }
  const hint = hintEl ? (await hintEl.textContent()).trim() : '';
  const label = HINT_TO_LABEL[hint];
  if (!label) {
    await page.waitForTimeout(300);
    continue;
  }
  await clickNodeByLabel(label);
  await page.waitForTimeout(250);
  const stillPresent = await page.$('#power-puzzle-panel');
  if (!stillPresent) break;
  const newHeading = await page.$eval('#power-puzzle-panel h2', (el) => el.textContent).catch(() => null);
  if (newHeading && newHeading !== roundHeading) rounds++;
}

console.log('Rounds completed (approx):', rounds);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${outDir}/battle_result.png` });

const puzzleGone = !(await page.$('#power-puzzle-panel'));
console.log('Battle panel closed:', puzzleGone);

// Wait for galaxy reveal scene camera sequence + continue prompt.
await page.waitForTimeout(14000);
await page.screenshot({ path: `${outDir}/galaxy_reveal.png` });

await page.mouse.click(640, 360);
await page.waitForTimeout(2500);
await page.screenshot({ path: `${outDir}/back_to_ship.png` });

console.log('Errors so far:', errors.length ? errors.join('\\n') : 'none');

await browser.close();
