import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome', headless: false, args: ['--use-angle=d3d11', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
await p.goto('http://localhost:5199/kethra-adventure/tools/shader-bench/index.html');
await p.waitForFunction(() => document.title === 'ready', undefined, { timeout: 60000 });
const r = await p.evaluate(async () => {
  const THREE = await import('/kethra-adventure/node_modules/.vite/deps/three.js').catch(() => null);
  return !!THREE;
});
console.log('three import via deps', r);
await b.close();
