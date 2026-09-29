// The galaxy reveal must start when it is on screen, not while it is still compiling behind the
// loading cover (BUG-032): its hold-to-skip (created as the reveal starts) must never exist before
// the reveal scene is current.
import { launch, openPage, check, clean, failures, until } from './lib.mjs';

const browser = await launch();
const watch = {
  fn: () => {
    window.__EARLY__ = null;
    const tick = () => {
      const D = window.__DEBUG__;
      if (document.querySelector('.hold-skip') && window.__EARLY__ === null) {
        window.__EARLY__ = { current: D?.engine.getCurrentScene()?.kind ?? null, loading: !!document.querySelector('.loading-indicator.visible') };
      }
      if (window.__EARLY__ === null) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },
  arg: null,
};
const { page, context, errors } = await openPage(browser, '?newGame=1&skipTutorial=1&tier=low&seed=7', { init: watch });
await until(page, () => window.__EARLY__ !== null, 240000);
const early = await page.evaluate(() => window.__EARLY__);
check('BUG-032: the reveal\'s skip hint first appears with the reveal on screen, not under the loading cover', early?.current === 'GalaxyRevealScene' && !early.loading, JSON.stringify(early));
await until(page, () => window.__DEBUG__.engine.getCurrentScene()?.intercept?.state().phase === 'plot', 120000).then(async (ok) => { if (!ok) return; });
await clean(page, errors, 'the reveal');
await context.close();
await browser.close();
console.log(failures() ? `\n${failures()} failed` : '\nall passed');
process.exit(failures() ? 1 : 0);
