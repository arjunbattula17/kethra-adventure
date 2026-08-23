// Image utilities for the interior review loop, run through a headless Chromium canvas so the
// project needs no native image dependency.
//
//   node tools/imgtool.mjs crop <in.png> <out.png> <x> <y> <w> <h>
//   node tools/imgtool.mjs pair <ours.png> <theirs.png> <outDir> <oursSlot A|B> <keyFile>
//
// `pair` normalises both images onto an identical letterboxed canvas and writes them as A.png /
// B.png, with our render placed in <oursSlot> (see blind-slots.mjs), so a critic reading the pair
// cannot tell which is which from filename, resolution or aspect ratio. The mapping is written to
// <keyFile>, which lives outside the directory the critic is given.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const PAIR_W = 1200;
const PAIR_H = 800;

const dataUrl = (path) => 'data:image/png;base64,' + readFileSync(path).toString('base64');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 100, height: 100 } });
await page.goto('about:blank');

async function render(fn, args) {
  const b64 = await page.evaluate(fn, args);
  return Buffer.from(b64.split(',')[1], 'base64');
}

const cropFn = async ({ src, x, y, w, h }) => {
  const img = new Image();
  img.src = src;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d').drawImage(img, x, y, w, h, 0, 0, w, h);
  return c.toDataURL('image/png');
};

// Letterbox onto a fixed canvas so both sides of a blind pair are pixel-identical in shape.
const fitFn = async ({ src, W, H }) => {
  const img = new Image();
  img.src = src;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#101014';
  ctx.fillRect(0, 0, W, H);
  const s = Math.min(W / img.width, H / img.height);
  const dw = img.width * s;
  const dh = img.height * s;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
  return c.toDataURL('image/png');
};

const [cmd, ...rest] = process.argv.slice(2);

if (cmd === 'crop') {
  const [inPath, outPath, x, y, w, h] = rest;
  writeFileSync(outPath, await render(cropFn, { src: dataUrl(inPath), x: +x, y: +y, w: +w, h: +h }));
  console.log('cropped ->', outPath);
} else if (cmd === 'pair') {
  const [oursPath, theirsPath, outDir, oursSlot, keyFile] = rest;
  if (oursSlot !== 'A' && oursSlot !== 'B') {
    console.error('oursSlot must be A or B, got:', oursSlot);
    process.exit(1);
  }
  mkdirSync(outDir, { recursive: true });
  const ours = await render(fitFn, { src: dataUrl(oursPath), W: PAIR_W, H: PAIR_H });
  const theirs = await render(fitFn, { src: dataUrl(theirsPath), W: PAIR_W, H: PAIR_H });
  const oursIsA = oursSlot === 'A';
  writeFileSync(`${outDir}/A.png`, oursIsA ? ours : theirs);
  writeFileSync(`${outDir}/B.png`, oursIsA ? theirs : ours);
  writeFileSync(keyFile, JSON.stringify({ A: oursIsA ? 'ours' : 'reference', B: oursIsA ? 'reference' : 'ours' }));
  console.log('paired ->', outDir, '(key at', keyFile + ')');
} else {
  console.error('usage: imgtool.mjs crop|pair ...');
  process.exit(1);
}

await browser.close();
