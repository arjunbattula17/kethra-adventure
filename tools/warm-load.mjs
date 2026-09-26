// First visit vs second visit. Browsers keep compiled shaders in a disk cache inside the profile,
// so the long first load (shader compilation) should mostly disappear on a reload. This uses one
// persistent profile and times New game -> intro playable twice.
//
//   npx vite preview   (in another terminal)
//   node tools/warm-load.mjs [baseUrl]
import { chromium } from 'playwright';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.argv[2] || 'http://localhost:4173/kethra-adventure/';
const dir = mkdtempSync(join(tmpdir(), 'kethra-profile-'));
const context = await chromium.launchPersistentContext(dir, {
  viewport: { width: 1366, height: 768 },
  args: ['--use-gl=angle', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
for (const visit of ['first visit (cold)', 'second visit (warm)']) {
  const page = await context.newPage();
  const t0 = Date.now();
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.title-btn');
  const title = Date.now() - t0;
  await page.getByRole('button', { name: /New game|Continue/ }).first().click();
  await page.waitForFunction(() => window.__DEBUG__?.engine.getCurrentScene()?.kind && !document.querySelector('.loading-indicator.visible'), undefined, { timeout: 900000, polling: 200 });
  console.log(`${visit}: title ${title} ms, playable ${Date.now() - t0} ms`);
  await page.close();
}
await context.close();
rmSync(dir, { recursive: true, force: true });
