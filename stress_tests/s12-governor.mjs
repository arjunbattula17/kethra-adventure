// The quality governor under the low-battery 30 fps cap (BUG-030): capped frames last ~33 ms on
// purpose and must not read as a struggling machine. Compares a capped run with an uncapped one.
import { launch, openPage, check, clean, failures, settled } from './lib.mjs';

const browser = await launch();
const lowBattery = { fn: () => { navigator.getBattery = () => Promise.resolve({ level: 0.1, charging: false, addEventListener() {} }); }, arg: null };
async function run(label, init) {
  // No tier= here: a pinned tier turns the governor off.
  const { page, context, errors } = await openPage(browser, '?newGame=1&skipIntro=1&seed=7', init ? { init } : {});
  await settled(page, 'ShipInteriorScene');
  await page.evaluate(() => window.__DEBUG__.flow.tutorial?.skip?.());
  await page.waitForTimeout(3000);
  const q = () => page.evaluate(() => { const e = window.__DEBUG__.engine; return { tier: e.getQualityTier(), scale: e.renderScale, capped: e.capTo30 }; });
  const before = await q();
  await page.waitForTimeout(30000);
  const after = await q();
  console.log(`  ${label}: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
  await clean(page, errors, label);
  await context.close();
  return { before, after };
}
const rank = (s) => ['low', 'medium', 'high'].indexOf(s.tier) * 10 + s.scale;
const control = await run('uncapped', null);
const capped = await run('low battery (30 fps cap)', lowBattery);
check('the low-battery run is actually capped', capped.after.capped === true);
check('BUG-030: the 30 fps cap alone does not walk quality down', rank(capped.before) - rank(capped.after) <= rank(control.before) - rank(control.after), `capped ${JSON.stringify(capped.before)} -> ${JSON.stringify(capped.after)}; uncapped ${JSON.stringify(control.before)} -> ${JSON.stringify(control.after)}`);
await browser.close();
console.log(failures() ? `\n${failures()} failed` : '\nall passed');
process.exit(failures() ? 1 : 0);
