import { chromium } from 'playwright';

const baseUrl = process.argv[2] || 'http://localhost:5180';
const url = baseUrl + '?skipIntro=1&unlockKethra=1';
const outDir = process.argv[3] || '.';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('console', (msg) => { if (msg.type() === 'error') errors.push('CONSOLE ' + msg.text()); });
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__DEBUG__?.gameState, { timeout: 10000 });
await page.waitForTimeout(500);
await page.evaluate(() => window.__DEBUG__.bus.emit('galaxy:travel_to', 'kethra'));
await page.waitForTimeout(2500);

async function teleport(x, y, z) {
  const ok = await page.evaluate(({ x, y, z }) => {
    const scene = window.__DEBUG__.engine.getCurrentScene();
    if (!scene || !scene.player) return false;
    const V = scene.player.rig.position.constructor;
    scene.player.teleport(new V(x, y, z), 0);
    return true;
  }, { x, y, z });
  await page.waitForTimeout(500);
  return ok;
}

async function pos() {
  return page.evaluate(() => window.__DEBUG__.engine.getCurrentScene().player.rig.position.toArray());
}

async function pressE() {
  await page.keyboard.down('KeyE');
  await page.waitForTimeout(120);
  await page.keyboard.up('KeyE');
  await page.waitForTimeout(400);
}

async function flags() {
  return page.evaluate(() => window.__DEBUG__.gameState.data.flags);
}

// 1. Talk to the Archivist (open, friendly NPC at ~3,0.6,4)
console.log('teleport ok:', await teleport(3, 2, 5.5));
await pressE();
const archivistSpeaker = await page.$eval('#dialogue-speaker', (el) => el.textContent).catch(() => null);
console.log('Archivist dialogue speaker:', archivistSpeaker);
const archivistText = await page.$eval('#dialogue-text', (el) => el.textContent).catch(() => null);
console.log('Archivist opening line:', archivistText?.slice(0, 60));
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// 2. Talk to the Warden (gatekeeper NPC at ~-3,0.6,3)
await teleport(-3, 2, 4.5);
await pressE();
const wardenSpeaker = await page.$eval('#dialogue-speaker', (el) => el.textContent).catch(() => null);
console.log('Warden dialogue speaker:', wardenSpeaker);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// 3. Read the three inscription fragments.
await teleport(-16, 2.4, -2.2);
console.log('pos at fragment1:', await pos());
await pressE();
console.log('flags now:', (await flags()).filter((f) => f.startsWith('kethra_fragment')));
await teleport(16, 2.4, -2.2);
console.log('pos at fragment2:', await pos());
await pressE();
console.log('flags now:', (await flags()).filter((f) => f.startsWith('kethra_fragment')));
await teleport(-20, 4.2, -7.2);
console.log('pos at fragment3:', await pos());
await pressE();
console.log('Flags after reading fragments:', (await flags()).filter((f) => f.startsWith('kethra_fragment')));

// 4. Valve + shrine side content.
await teleport(2.5, 1.8, 8.5);
await pressE();
await teleport(-1.5, 1.7, 5.5);
await pressE();
console.log('Flags after valve+shrine:', (await flags()).filter((f) => f.includes('valve')));

// 5. Try the mechanism before dimming the grove (should be blocked).
await teleport(0, 1.4, -15.5);
await pressE();
const blockedToast = await page.$('.toast');
console.log('Console blocked before dimming grove (toast present):', !!blockedToast);
await page.waitForTimeout(500);

// 6. Dim the grove to make the guardian dormant.
await teleport(-4, 2.4, -9);
await pressE();
console.log('Flags after dimming grove:', (await flags()).filter((f) => f.includes('dimmed')));

// 7. Open and solve the mechanism puzzle using the known true sequence.
await teleport(0, 1.4, -15.5);
console.log('pos at console:', await pos());
await pressE();
await page.waitForTimeout(300);
const sequence = await page.evaluate(() => window.__DEBUG__.KETHRA_TRUE_SEQUENCE || null);
console.log('Puzzle panel present:', !!(await page.$('#power-puzzle-panel')));

const colorOrder = ['azure', 'amber', 'verdant']; // known from agent report
for (const color of colorOrder) {
  const label = color[0].toUpperCase() + color.slice(1);
  await page.evaluate((lbl) => {
    const nodes = Array.from(document.querySelectorAll('.power-node'));
    const target = nodes.find((n) => n.textContent.includes(lbl));
    if (target) target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  }, label);
  await page.waitForTimeout(300);
}
await page.waitForTimeout(500);
await page.screenshot({ path: `${outDir}/kethra_after_solve.png` });

const gameStateAfter = await page.evaluate(() => ({
  solved: window.__DEBUG__.gameState.hasFlag('kethra_mechanism_solved'),
  resonantCrystal: window.__DEBUG__.gameState.data.shipSystems.navigation.haveAmount,
  archaeology: window.__DEBUG__.gameState.data.attributes.archaeology,
}));
console.log('After solve:', JSON.stringify(gameStateAfter));

// 8. Read the Kindling carving (deeper mystery).
await teleport(-2.6, 1.8, -17.8);
await pressE();
console.log('Flags after carving:', (await flags()).filter((f) => f.includes('kindling') || f.includes('fragment_3')));

// 9. Return to ship.
await teleport(0, 2, 18);
await pressE();
await page.waitForTimeout(2500);
const objectiveAfter = await page.$eval('#objective-text', (el) => el.textContent).catch(() => null);
console.log('Objective after returning to ship:', objectiveAfter);
await page.screenshot({ path: `${outDir}/kethra_return.png` });

console.log('Errors so far:', errors.length ? errors.join('\\n') : 'none');
await browser.close();
