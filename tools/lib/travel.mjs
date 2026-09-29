// Travels from the Wren as a player would: holds the throttle through First light if offered (first
// departure only), holds to skip the cruise, and waits for the destination scene to be current and
// settled. tools/test-cruise-flow.mjs tests the trip itself.
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
  // The first Kethra arrival runs CanopyScene: finish it with the harness's win hook
  // (tools/test-mg2-flow.mjs plays it for real).
  await page.waitForFunction((k) => {
    const s = window.__DEBUG__.engine.getCurrentScene();
    if (s?.kind === 'CanopyScene' && s.state().phase === 'fly') window.__DEBUG__.miniGame()?.win();
    return s?.kind === k && !window.__DEBUG__.flow.isTransitioning();
  }, kind, { timeout: 240000, polling: 250 });
}
