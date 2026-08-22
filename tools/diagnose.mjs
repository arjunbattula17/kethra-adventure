import { chromium } from 'playwright';

const url = process.argv[2] || 'http://localhost:5180';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (msg) => console.log('[console]', msg.type(), msg.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(2000);

const info = await page.evaluate(() => {
  const canvas = document.querySelector('#app canvas');
  if (!canvas) return { error: 'no canvas found' };
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  return {
    width: canvas.width,
    height: canvas.height,
    clientWidth: canvas.clientWidth,
    clientHeight: canvas.clientHeight,
    hasGL: !!gl,
    glError: gl ? gl.getError() : null,
  };
});
console.log('CANVAS INFO:', JSON.stringify(info, null, 2));
await browser.close();
