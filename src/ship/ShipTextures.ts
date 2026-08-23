import * as THREE from 'three';

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

export function buildConsoleScreenTexture(variant: 'nav' | 'status'): THREE.CanvasTexture {
  const w = 512;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  if (variant === 'nav') buildNavScreen(ctx, w, h);
  else buildStatusScreen(ctx, w, h);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildStencilPlacardTexture(id: string, sublabel?: string): THREE.CanvasTexture {
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
    if (Math.random() < 0.06) {
      const a = imgData.data[i + 3];
      imgData.data[i + 3] = Math.max(0, a - Math.random() * 140);
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

// Large non-repeating dirt/grime pass, meant to be mapped 1:1 across a single wall/floor
// surface (UV 0..1) and multiply-blended over a tiled PBR material — RepeatWrapping would
// make the streaks themselves repeat and reintroduce the tiling artifact this is meant to hide.
export function buildPanelGrimeTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);

  const blotchCount = 14;
  for (let i = 0; i < blotchCount; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 30 + Math.random() * 90;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    const alpha = 0.1 + Math.random() * 0.15;
    grad.addColorStop(0, `rgba(20,16,12,${alpha})`);
    grad.addColorStop(1, 'rgba(20,16,12,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const streakCount = 10;
  for (let i = 0; i < streakCount; i++) {
    const x = Math.random() * size;
    const topY = Math.random() * size * 0.4;
    const len = 80 + Math.random() * 220;
    const w = 3 + Math.random() * 7;
    const grad = ctx.createLinearGradient(x, topY, x, topY + len);
    const alpha = 0.12 + Math.random() * 0.13;
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
