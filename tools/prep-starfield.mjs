// Generates public/textures/space/starfield.jpg — the galaxy reveal's sky.
//
// The old sky was NASA's randomized starmap at its 1024x512 "print" resolution (~38KB): a real
// 2:1 equirect, but so small and so JPEG-crushed that at backgroundIntensity 1.8 the compression
// blotches read as grey mush across every wide shot (see renders/space-audit and the baseline
// beats this session captured). No higher-resolution redistributable of that exact map is in the
// repo, so this generates a sky instead: sharp star dust and a tilted galactic band, authored at
// 4096x2048 where a 60-degree FOV slice still spans ~680 texels — soft only at the level a real
// long-exposure sky photo is, not at the level of visible compression artefacts.
//
// Sharp *point* stars remain the job of the procedural THREE.Points fields in
// GalaxyRevealScene.ts; this texture supplies the deep background those points sit in.
//
// Image work runs in a headless Chromium canvas rather than a native image library, because
// Playwright is already a devDependency here and sharp/jimp are not — same reason
// tools/prep-planet-textures.mjs works this way.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const W = 4096;
const H = 2048;
const OUT = 'public/textures/space/starfield.jpg';

const browser = await chromium.launch();
const page = await browser.newPage();

const dataUrl = await page.evaluate(({ W, H }) => {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Deterministic PRNG so re-running the tool reproduces the shipped texture bit-for-bit-ish
  // (JPEG encoding aside) instead of quietly changing the sky under version control.
  let seed = 0x9e3779b9;
  const rand = () => {
    seed ^= seed << 13; seed >>>= 0;
    seed ^= seed >> 17;
    seed ^= seed << 5; seed >>>= 0;
    return seed / 0xffffffff;
  };
  const gauss = () => {
    const a = Math.max(rand(), 1e-9);
    return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * rand());
  };

  // Base: near-black blue, slightly lighter toward the band so space has a floor gradient.
  ctx.fillStyle = '#04060c';
  ctx.fillRect(0, 0, W, H);

  // The galactic band's centreline. In an equirect a tilted great circle is a sinusoid in u;
  // wavelength = full width so the left and right edges meet seamlessly when wrapped.
  const bandPhase = rand() * Math.PI * 2;
  const bandY = (x) => H * 0.5 + H * 0.075 * Math.sin((x / W) * Math.PI * 2 + bandPhase);

  // drawGlow wraps horizontally: anything painted near an edge is painted again one full width
  // over, so the equirect seam at u=0/1 never shows a cut-off blob.
  const drawGlow = (x, y, r, color, alpha) => {
    for (const ox of [0, -W, W]) {
      const cx = x + ox;
      if (cx + r < 0 || cx - r > W) continue;
      const g = ctx.createRadialGradient(cx, y, 0, cx, y, r);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = alpha;
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
  };

  // 1. Deep nebulosity: large, very faint colour fields, denser near the band.
  ctx.globalCompositeOperation = 'lighter';
  const nebulaHues = ['rgba(70,95,150,1)', 'rgba(60,110,130,1)', 'rgba(105,80,140,1)', 'rgba(150,110,80,1)'];
  for (let i = 0; i < 70; i++) {
    const x = rand() * W;
    const nearBand = rand() < 0.7;
    const y = nearBand ? bandY(x) + gauss() * H * 0.09 : rand() * H;
    drawGlow(x, y, 220 + rand() * 750, nebulaHues[Math.floor(rand() * nebulaHues.length)], 0.015 + rand() * 0.03);
  }

  // 2. The band itself: hundreds of warm-white glows hugging the centreline.
  for (let i = 0; i < 420; i++) {
    const x = rand() * W;
    const y = bandY(x) + gauss() * H * 0.045;
    const warm = rand();
    const color = warm > 0.6 ? 'rgba(255,240,220,1)' : warm > 0.25 ? 'rgba(225,230,245,1)' : 'rgba(190,205,235,1)';
    drawGlow(x, y, 60 + rand() * 190, color, 0.012 + rand() * 0.028);
  }

  // 3. Dust lanes: dark occluding blobs strung along the band core, drawn over the glow.
  ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 260; i++) {
    const x = rand() * W;
    const y = bandY(x) + gauss() * H * 0.018;
    drawGlow(x, y, 35 + rand() * 130, 'rgba(4,5,9,1)', 0.05 + rand() * 0.11);
  }
  ctx.globalCompositeOperation = 'lighter';

  // 4. Star dust: tens of thousands of single-texel stars. Two populations: an all-sky field
  // weighted by sin(pi*v) so density stays uniform per solid angle after the equirect's polar
  // stretch, and a band population. Alpha weighted toward faint so the sky reads as depth.
  const dustColor = (t) => {
    if (t > 0.85) return [255, 235, 210];
    if (t < 0.2) return [190, 210, 255];
    return [235, 238, 245];
  };
  for (let i = 0; i < 52000; i++) {
    let x = rand() * W;
    let y;
    if (rand() < 0.4) {
      y = bandY(x) + gauss() * H * 0.06;
      if (y < 0 || y >= H) continue;
    } else {
      y = rand() * H;
      if (rand() > Math.sin((y / H) * Math.PI)) continue;
    }
    const [r, g, b] = dustColor(rand());
    const a = 0.12 + Math.pow(rand(), 2.6) * 0.75;
    ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
    const s = rand() < 0.06 ? 2 : 1;
    ctx.fillRect(x | 0, y | 0, s, s);
  }

  // 5. Mid and bright stars: soft-profile discs, the brightest few with faint diffraction spikes.
  for (let i = 0; i < 750; i++) {
    const x = rand() * W;
    let y = rand() * H;
    if (rand() > Math.sin((y / H) * Math.PI)) y = bandY(x) + gauss() * H * 0.07;
    const [r, g, b] = dustColor(rand());
    drawGlow(x, y, 1.2 + rand() * 2.4, `rgba(${r},${g},${b},1)`, 0.5 + rand() * 0.5);
  }
  for (let i = 0; i < 90; i++) {
    const x = rand() * W;
    const y = rand() * H * 0.9 + H * 0.05;
    const [r, g, b] = dustColor(rand());
    const radius = 2.5 + rand() * 3.5;
    drawGlow(x, y, radius, `rgba(${r},${g},${b},1)`, 0.85);
    drawGlow(x, y, radius * 4, `rgba(${r},${g},${b},1)`, 0.1);
    if (i < 22) {
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = `rgba(${r},${g},${b},1)`;
      ctx.lineWidth = 1;
      const spike = radius * 5;
      ctx.beginPath();
      ctx.moveTo(x - spike, y); ctx.lineTo(x + spike, y);
      ctx.moveTo(x, y - spike); ctx.lineTo(x, y + spike);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  ctx.globalCompositeOperation = 'source-over';
  return canvas.toDataURL('image/jpeg', 0.9);
}, { W, H });

await browser.close();

mkdirSync('public/textures/space', { recursive: true });
const buffer = Buffer.from(dataUrl.split(',')[1], 'base64');
writeFileSync(OUT, buffer);
console.log(`wrote ${OUT} (${Math.round(buffer.length / 1024)} KB, ${W}x${H})`);
