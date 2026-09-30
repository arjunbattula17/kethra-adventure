import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome', headless: false, args: ['--use-angle=d3d11', '--enable-gpu'] });
const p = await b.newPage();
p.on('console', (m) => { if (m.text().startsWith('KEY')) console.log(m.text()); });
await p.goto('http://localhost:4176/kethra-adventure/');
await p.waitForFunction(() => performance.getEntriesByName('engine:environment').length > 0, undefined, { timeout: 120000 });
await b.close();
