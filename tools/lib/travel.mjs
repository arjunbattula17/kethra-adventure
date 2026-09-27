// A trip from the Wren the way a player makes it (docs/DESIGN.md §5): hold the throttle through
// First light if it is offered (the first departure only), then hold to skip the cruise, and wait
// for the destination to be current and settled. For tests whose subject is the level, not the trip;
// tools/test-cruise-flow.mjs checks the trip itself.
export async function completeTrip(page, kind) {
  const offered = await page
    .waitForFunction(() => !!document.querySelector('.first-light-hint') || window.__DEBUG__.engine.getCurrentScene()?.kind === 'CruiseScene', null, { timeout: 60000, polling: 100 })
    .then(() => page.evaluate(() => !!document.querySelector('.first-light-hint')));
  if (offered) {
    await page.keyboard.down('Space');
    await page.waitForFunction(() => window.__DEBUG__.engine.getCurrentScene()?.power?.stage === 'full', null, { timeout: 30000, polling: 100 });
    await page.keyboard.up('Space');
  }
  await page.waitForFunction(() => window.__DEBUG__.engine.getCurrentScene()?.kind === 'CruiseScene', null, { timeout: 60000, polling: 100 });
  await page.waitForSelector('.hold-skip', { timeout: 30000 });
  await page.keyboard.down('Space');
  await page.waitForTimeout(1100);
  await page.keyboard.up('Space');
  await page.waitForFunction((k) => window.__DEBUG__.engine.getCurrentScene()?.kind === k && !window.__DEBUG__.flow.isTransitioning(), kind, { timeout: 240000, polling: 250 });
}
