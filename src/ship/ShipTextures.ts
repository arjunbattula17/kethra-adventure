import * as THREE from 'three';

import { mulberry32, hashStr } from '../core/rng';


export function buildHazardStripeTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#14120a';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#d9a441';
  const stripeW = size / 4;
  for (let i = -1; i < 5; i++) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, size, size);
    ctx.clip();
    ctx.translate(i * stripeW * 2, 0);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-size, -size, stripeW, size * 4);
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function buildNavScreen(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#061a22';
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(120,220,235,0.18)';
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 16) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  const cx = 64;
  const cy = h / 2;
  ctx.strokeStyle = 'rgba(120,220,235,0.55)';
  ctx.lineWidth = 1.5;
  for (const r of [16, 32, 48]) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Faint sweep wedge behind the sweep line so the radar reads as actively scanning,
  // not just a static compass rose.
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, 48, -Math.PI / 8, Math.PI / 8);
  ctx.closePath();
  ctx.fillStyle = 'rgba(217,164,65,0.16)';
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = 'rgba(217,164,65,0.85)';
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + 44, cy - 20);
  ctx.stroke();
  ctx.fillStyle = 'rgba(120,220,235,0.9)';
  ctx.beginPath();
  ctx.arc(cx + 18, cy + 10, 2.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(120,220,235,0.4)';
  for (let i = 0; i < 8; i++) {
    const bh = 6 + ((i * 37) % 40);
    ctx.fillRect(150 + i * 14, h - 14 - bh, 8, bh);
  }
  ctx.strokeStyle = 'rgba(217,164,65,0.4)';
  ctx.lineWidth = 1;
  ctx.strokeRect(146, 20, 8 * 14 + 8, h - 34);

  ctx.fillStyle = 'rgba(217,164,65,0.85)';
  ctx.font = 'bold 12px monospace';
  ctx.fillText('NAV // OFFLINE', 150, 22);
  ctx.fillStyle = 'rgba(120,220,235,0.5)';
  ctx.font = '9px monospace';
  ctx.fillText('SCN 04.1', 150, 36);

  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
}

function buildStatusScreen(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#180d04';
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = 'rgba(255,159,66,0.85)';
  ctx.font = 'bold 20px monospace';
  ctx.fillText('LOGIN REQUIRED', 18, 32);

  ctx.strokeStyle = 'rgba(255,159,66,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(18, 42);
  ctx.lineTo(w - 18, 42);
  ctx.stroke();

  const readouts: [string, string][] = [
    ['PWR', '84%'],
    ['O2', '100%'],
  ];
  ctx.font = '14px monospace';
  readouts.forEach(([label, value], i) => {
    const x = 18 + i * 180;
    ctx.fillStyle = 'rgba(255,201,140,0.6)';
    ctx.fillText(label, x, 70);
    ctx.fillStyle = 'rgba(255,159,66,0.95)';
    ctx.font = 'bold 22px monospace';
    ctx.fillText(value, x, 96);
    ctx.font = '14px monospace';

    // Small horizontal gauge under each readout, filled proportional to its percentage.
    const pct = parseInt(value, 10) / 100;
    ctx.strokeStyle = 'rgba(255,159,66,0.4)';
    ctx.strokeRect(x, 104, 140, 8);
    ctx.fillStyle = 'rgba(255,159,66,0.75)';
    ctx.fillRect(x, 104, 140 * pct, 8);
  });

  ctx.fillStyle = 'rgba(255,159,66,0.4)';
  ctx.font = '9px monospace';
  ctx.fillText('ARK LTD // ORION INTERFACES', w - 210, h - 8);

  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
}

function buildCommsScreen(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#050f16';
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(120,220,235,0.85)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  const midY = h * 0.42;
  ctx.moveTo(20, midY);
  for (let x = 20; x < w - 20; x += 4) {
    const t = x * 0.09;
    const y = midY + Math.sin(t) * 14 * Math.exp(-((x - w / 2) ** 2) / (2 * 160 ** 2)) + Math.sin(t * 3.7) * 4;
    ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.fillStyle = 'rgba(217,164,65,0.85)';
  ctx.font = 'bold 13px monospace';
  ctx.fillText('COMMS LINK // ACTIVE', 20, 22);
  ctx.fillStyle = 'rgba(120,220,235,0.5)';
  ctx.font = '9px monospace';
  ctx.fillText('FREQ 118.2 MHZ', 20, 36);

  // Signal-strength bar cluster.
  ctx.fillStyle = 'rgba(120,220,235,0.55)';
  for (let i = 0; i < 10; i++) {
    const bh = 4 + i * 3.5;
    ctx.fillRect(20 + i * 12, h - 14 - bh, 8, bh);
  }
  ctx.strokeStyle = 'rgba(217,164,65,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(w - 170, 46, 150, h - 66);
  ctx.fillStyle = 'rgba(217,164,65,0.7)';
  ctx.font = '9px monospace';
  ctx.fillText('CHANNEL', w - 164, 60);
  ctx.font = 'bold 16px monospace';
  ctx.fillStyle = 'rgba(120,220,235,0.85)';
  ctx.fillText('CH-07', w - 164, 82);

  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
}

export function buildConsoleScreenTexture(variant: 'nav' | 'status' | 'comms'): THREE.CanvasTexture {
  const w = 512;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  if (variant === 'nav') buildNavScreen(ctx, w, h);
  else if (variant === 'status') buildStatusScreen(ctx, w, h);
  else buildCommsScreen(ctx, w, h);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Large square dual-panel circular radar readout, meant for the suspended command display hung
// above the console — distinct from buildConsoleScreenTexture's wide rectangular desk-monitor
// format. Fills most of the square canvas with concentric range rings and a sweep wedge so it
// reads clearly as the room's focal point from across the floor, not just up close.
export function buildRadarPanelTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#04141c';
  ctx.fillRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;
  const maxR = size * 0.42;

  ctx.strokeStyle = 'rgba(120,220,235,0.35)';
  ctx.lineWidth = 1;
  for (let i = 1; i <= 4; i++) {
    ctx.beginPath();
    ctx.arc(cx, cy, (maxR * i) / 4, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(cx - maxR, cy);
  ctx.lineTo(cx + maxR, cy);
  ctx.moveTo(cx, cy - maxR);
  ctx.lineTo(cx, cy + maxR);
  ctx.stroke();

  // Sweep wedge.
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, maxR, -Math.PI / 3, -Math.PI / 12);
  ctx.closePath();
  ctx.fillStyle = 'rgba(120,220,235,0.22)';
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = 'rgba(120,220,235,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(-Math.PI / 12) * maxR, cy + Math.sin(-Math.PI / 12) * maxR);
  ctx.stroke();

  // A few contact blips scattered inside the range rings.
  ctx.fillStyle = 'rgba(217,164,65,0.9)';
  const blips: [number, number][] = [
    [0.55, -0.2],
    [-0.3, 0.5],
    [0.15, 0.65],
  ];
  for (const [bx, by] of blips) {
    ctx.beginPath();
    ctx.arc(cx + bx * maxR, cy + by * maxR, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = 'rgba(120,220,235,0.85)';
  ctx.font = 'bold 13px monospace';
  ctx.fillText('SECTOR SCAN', 10, 18);
  ctx.fillStyle = 'rgba(217,164,65,0.6)';
  ctx.font = '9px monospace';
  ctx.fillText('RANGE 40KM', 10, size - 10);

  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  for (let y = 0; y < size; y += 3) ctx.fillRect(0, y, size, 1);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildStencilPlacardTexture(id: string, sublabel?: string): THREE.CanvasTexture {
  const rng = mulberry32(0x5701 ^ hashStr(id + (sublabel ?? '')));
  const w = 256;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#2a2823');
  grad.addColorStop(1, '#1c1a17');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, w - 4, h - 4);

  ctx.fillStyle = 'rgba(214,208,196,0.88)';
  ctx.font = 'bold 40px monospace';
  ctx.textBaseline = 'middle';
  const idY = sublabel ? h * 0.4 : h * 0.5;
  drawLetterSpaced(ctx, id, w / 2, idY, 4);

  if (sublabel) {
    ctx.font = 'bold 16px monospace';
    ctx.fillStyle = 'rgba(214,208,196,0.65)';
    drawLetterSpaced(ctx, sublabel, w / 2, h * 0.72, 3);
  }

  // Spray-stencil edges: scatter small dark specks over the text region so glyph edges
  // read as imperfect paint rather than a vector-clean font render.
  const imgData = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < imgData.data.length; i += 4) {
    if (imgData.data[i + 3] === 0) continue;
    if (rng() < 0.06) {
      const a = imgData.data[i + 3];
      imgData.data[i + 3] = Math.max(0, a - rng() * 140);
    }
  }
  ctx.putImageData(imgData, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function drawLetterSpaced(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, spacing: number): void {
  const widths = [...text].map((ch) => ctx.measureText(ch).width);
  const totalWidth = widths.reduce((a, b) => a + b, 0) + spacing * (text.length - 1);
  let x = cx - totalWidth / 2;
  ctx.textAlign = 'left';
  for (let i = 0; i < text.length; i++) {
    ctx.fillText(text[i], x, cy);
    x += widths[i] + spacing;
  }
  ctx.textAlign = 'start';
}

export function buildFirstAidTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#7a1414';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.strokeRect(6, 6, size - 12, size - 12);

  const cx = size / 2;
  const cy = size / 2;
  const barLen = 68;
  const barW = 22;
  ctx.fillRect(cx - barW / 2, cy - barLen / 2, barW, barLen);
  ctx.fillRect(cx - barLen / 2, cy - barW / 2, barLen, barW);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildWarningStripeTexture(color: 'amber' | 'red'): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#14120a';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = color === 'amber' ? '#d9a441' : '#c23a2f';
  const stripeW = size / 4;
  for (let i = -1; i < 5; i++) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, size, size);
    ctx.clip();
    ctx.translate(i * stripeW * 2, 0);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-size, -size, stripeW, size * 4);
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Large bold stencilled deck-number/callsign marking meant for wall mounting — big enough to
// read from across a room, as opposed to buildStencilPlacardTexture's small ID plate. Painted
// directly onto a transparent background (no plate backing) so it reads as stencilled straight
// onto the wall panel, echoing the oversized "06"-style numerals seen on real station corridors.
export function buildLargeDeckNumberTexture(text: string, sublabel?: string): THREE.CanvasTexture {
  const rng = mulberry32(0x5702 ^ hashStr(text + (sublabel ?? '')));
  const w = 400;
  const h = 560;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);

  // Double-frame stencil border, scaled up from buildStencilPlacardTexture's plate outline.
  ctx.strokeStyle = 'rgba(214,208,196,0.35)';
  ctx.lineWidth = 6;
  ctx.strokeRect(18, 18, w - 36, h - 36);
  ctx.strokeStyle = 'rgba(214,208,196,0.18)';
  ctx.lineWidth = 2;
  ctx.strokeRect(32, 32, w - 64, h - 64);

  ctx.fillStyle = 'rgba(214,208,196,0.85)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fontSize = text.length <= 1 ? Math.floor(w * 0.85) : Math.floor(w * 0.6);
  ctx.font = `bold ${fontSize}px monospace`;
  ctx.fillText(text, w / 2, h * 0.42);

  if (sublabel) {
    ctx.font = 'bold 26px monospace';
    ctx.fillStyle = 'rgba(214,208,196,0.55)';
    drawLetterSpaced(ctx, sublabel, w / 2, h * 0.78, 5);
  }
  ctx.textAlign = 'start';

  // Worn spray-stencil edges, same speckling approach as the other stencil textures in this
  // file, so the paint reads as scuffed by years of foot traffic rather than a crisp vector print.
  const imgData = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < imgData.data.length; i += 4) {
    if (imgData.data[i + 3] === 0) continue;
    if (rng() < 0.1) {
      const a = imgData.data[i + 3];
      imgData.data[i + 3] = Math.max(0, a - rng() * 150);
    }
  }
  ctx.putImageData(imgData, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Small worn/faded stencil marking meant to be painted flat onto the floor (transparent
// background so the underlying diamond-plate texture still shows through around the glyph),
// as opposed to buildStencilPlacardTexture's opaque wall-mounted plate.
export function buildFloorStencilTexture(label: string): THREE.CanvasTexture {
  const rng = mulberry32(0x5703 ^ hashStr(label));
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);

  ctx.strokeStyle = 'rgba(214,208,196,0.5)';
  ctx.lineWidth = 6;
  ctx.strokeRect(14, 14, size - 28, size - 28);

  ctx.fillStyle = 'rgba(214,208,196,0.55)';
  ctx.font = 'bold 44px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, size / 2, size / 2);
  ctx.textAlign = 'start';

  // Worn spray-stencil edges, same speckling approach as buildStencilPlacardTexture, so the
  // paint reads as scuffed by foot traffic rather than a crisp vector print.
  const imgData = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < imgData.data.length; i += 4) {
    if (imgData.data[i + 3] === 0) continue;
    if (rng() < 0.15) {
      const a = imgData.data[i + 3];
      imgData.data[i + 3] = Math.max(0, a - rng() * 170);
    }
  }
  ctx.putImageData(imgData, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Small irregular oil/scorch stain meant to be laid flat on the floor with multiply blending —
// a soaked-in blotch of use/wear, distinct from buildFloorStencilTexture's painted lettering.
export function buildFloorStainTexture(variant: 'oil' | 'scorch'): THREE.CanvasTexture {
  const rng = mulberry32(0x5704 ^ hashStr(variant));
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);

  const base: [number, number, number] = variant === 'oil' ? [8, 8, 9] : [28, 15, 8];
  const cx = size / 2;
  const cy = size / 2;
  const blobCount = 5;
  for (let i = 0; i < blobCount; i++) {
    const ox = cx + (rng() - 0.5) * size * 0.4;
    const oy = cy + (rng() - 0.5) * size * 0.4;
    const r = size * (0.14 + rng() * 0.16);
    const grad = ctx.createRadialGradient(ox, oy, 0, ox, oy, r);
    const alpha = 0.32 + rng() * 0.28;
    grad.addColorStop(0, `rgba(${base[0]},${base[1]},${base[2]},${alpha})`);
    grad.addColorStop(0.65, `rgba(${base[0]},${base[1]},${base[2]},${alpha * 0.4})`);
    grad.addColorStop(1, `rgba(${base[0]},${base[1]},${base[2]},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(ox, oy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Mottled edge speckling so the blotch reads as soaked into the deck plate rather than an
  // airbrushed vector shape, matching the worn-decal treatment used elsewhere in this file.
  const imgData = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < imgData.data.length; i += 4) {
    if (imgData.data[i + 3] === 0) continue;
    if (rng() < 0.12) {
      const a = imgData.data[i + 3];
      imgData.data[i + 3] = Math.max(0, a - rng() * 130);
    }
  }
  ctx.putImageData(imgData, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Large non-repeating dirt/grime pass, meant to be mapped 1:1 across a single wall/floor
// surface (UV 0..1) and multiply-blended over a tiled PBR material — RepeatWrapping would
// make the streaks themselves repeat and reintroduce the tiling artifact this is meant to hide.
export function buildPanelGrimeTexture(): THREE.CanvasTexture {
  const rng = mulberry32(0x5705);
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);

  const blotchCount = 14;
  for (let i = 0; i < blotchCount; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const r = 30 + rng() * 90;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    const alpha = 0.1 + rng() * 0.15;
    grad.addColorStop(0, `rgba(20,16,12,${alpha})`);
    grad.addColorStop(1, 'rgba(20,16,12,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const streakCount = 10;
  for (let i = 0; i < streakCount; i++) {
    const x = rng() * size;
    const topY = rng() * size * 0.4;
    const len = 80 + rng() * 220;
    const w = 3 + rng() * 7;
    const grad = ctx.createLinearGradient(x, topY, x, topY + len);
    const alpha = 0.12 + rng() * 0.13;
    grad.addColorStop(0, `rgba(15,12,9,${alpha})`);
    grad.addColorStop(1, 'rgba(15,12,9,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - w / 2, topY, w, len);
  }

  for (const [cx, cy] of [[0, 0], [size, 0], [0, size], [size, size]] as [number, number][]) {
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.45);
    grad.addColorStop(0, 'rgba(10,8,6,0.3)');
    grad.addColorStop(1, 'rgba(10,8,6,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
