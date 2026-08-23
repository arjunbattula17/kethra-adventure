import * as THREE from 'three';

// Procedural canvas art for the suspended command display. The reference's screen bank is a
// single continuous holo composition broken across a 3x2 grid of physical panes -- the concentric
// reticle crosses the mullions rather than each pane carrying its own separate little widget. So
// this module draws ONE wide canvas for the whole array; the display module UV-maps each pane to
// its own sub-rect of it.

const CYAN = '#7fe6f7';
const CYAN_SOFT = 'rgba(96,200,224,0.55)';
// Deliberately NOT pure white. The array is the room's focal point, but a 4 px ring of #ffffff on
// an emissive map lands well over the bloom threshold and veils the whole upper third of frame.
// The hottest ink on the canvas tops out here and the emissive multiplier carries the rest.
const HOT = '#c8ecf7';
const CORAL = '#ef8462';
const RED = '#e8503a';
const AMBER = '#d8a63a';
const GREEN = '#7fd48c';

const ARRAY_W = 1536;
const ARRAY_H = 768;
const COLS = 3;
const ROWS = 2;

/** Deterministic small PRNG so the panel art is identical every run. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function roundRectPath(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + rr, y);
  c.lineTo(x + w - rr, y);
  c.arcTo(x + w, y, x + w, y + rr, rr);
  c.lineTo(x + w, y + h - rr);
  c.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  c.lineTo(x + rr, y + h);
  c.arcTo(x, y + h, x, y + h - rr, rr);
  c.lineTo(x, y + rr);
  c.arcTo(x, y, x + rr, y, rr);
  c.closePath();
}

/** Word-shaped blocks standing in for body text too small to letter individually. */
function fakeText(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  alpha: number,
  rand: () => number,
): void {
  c.save();
  c.globalAlpha = alpha;
  c.fillStyle = color;
  let cursor = x;
  for (let guard = 0; guard < 24; guard++) {
    const wordW = 9 + Math.floor(rand() * 30);
    if (cursor + wordW > x + w) break;
    c.fillRect(cursor, y, wordW, h);
    cursor += wordW + 5 + Math.floor(rand() * 5);
  }
  c.restore();
}

function label(c: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, alpha = 0.9): void {
  c.save();
  c.globalAlpha = alpha;
  c.fillStyle = color;
  c.font = `bold ${size}px "Courier New", monospace`;
  c.fillText(text, x, y);
  c.restore();
}

function ring(c: CanvasRenderingContext2D, cx: number, cy: number, r: number, lw: number, color: string, alpha: number, from = 0, to = Math.PI * 2): void {
  c.save();
  c.globalAlpha = alpha;
  c.strokeStyle = color;
  c.lineWidth = lw;
  c.beginPath();
  c.arc(cx, cy, r, from, to);
  c.stroke();
  c.restore();
}

/** The central reticle -- the piece of art that has to survive being crossed by two mullions. */
function drawReticle(c: CanvasRenderingContext2D, cx: number, cy: number, R: number): void {
  const rand = rng(20260823);

  // Bloom pad behind everything so the rings sit in a haze instead of on flat black.
  const glow = c.createRadialGradient(cx, cy, R * 0.05, cx, cy, R * 1.35);
  glow.addColorStop(0, 'rgba(120,236,255,0.46)');
  glow.addColorStop(0.3, 'rgba(79,216,240,0.30)');
  glow.addColorStop(0.6, 'rgba(58,168,200,0.16)');
  glow.addColorStop(1, 'rgba(20,80,110,0)');
  c.fillStyle = glow;
  c.beginPath();
  c.arc(cx, cy, R * 1.35, 0, Math.PI * 2);
  c.fill();

  // Outer graduated bezel: fine ticks all round, long ticks + bearing numbers every 30 degrees.
  c.save();
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    const major = i % 8 === 0;
    const len = major ? 22 : 9;
    c.globalAlpha = major ? 0.85 : 0.4;
    c.strokeStyle = major ? HOT : CYAN;
    c.lineWidth = major ? 2.5 : 1.2;
    c.beginPath();
    c.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    c.lineTo(cx + Math.cos(a) * (R - len), cy + Math.sin(a) * (R - len));
    c.stroke();
  }
  c.restore();
  ring(c, cx, cy, R, 1.5, CYAN, 0.7);

  // Warm ring -- the reference's one non-cyan accent inside the holo, broken into three arcs.
  for (let i = 0; i < 3; i++) {
    const a0 = (i / 3) * Math.PI * 2 + 0.16;
    ring(c, cx, cy, R * 0.905, 20, CORAL, 0.22, a0, a0 + Math.PI * 0.55);
    ring(c, cx, cy, R * 0.905, 8, CORAL, 0.85, a0, a0 + Math.PI * 0.55);
    ring(c, cx, cy, R * 0.905, 2, '#ffe6d6', 0.85, a0, a0 + Math.PI * 0.55);
  }
  ring(c, cx, cy, R * 0.94, 1.2, CYAN, 0.45);

  // Hot white band -- the brightest thing in the whole room, on a wide cyan halo.
  ring(c, cx, cy, R * 0.845, 26, '#9be8ff', 0.17);
  ring(c, cx, cy, R * 0.845, 11, '#bff4ff', 0.34);
  ring(c, cx, cy, R * 0.845, 4, HOT, 1);
  ring(c, cx, cy, R * 0.79, 1.2, CYAN, 0.5);

  // Segmented data annulus.
  for (let i = 0; i < 6; i++) {
    const a0 = (i / 6) * Math.PI * 2 + 0.1;
    ring(c, cx, cy, R * 0.735, 22, CYAN, 0.2, a0, a0 + Math.PI / 4);
    ring(c, cx, cy, R * 0.735, 13, CYAN, 0.62, a0, a0 + Math.PI / 4);
    ring(c, cx, cy, R * 0.735, 13, HOT, 0.9, a0, a0 + 0.09);
  }
  ring(c, cx, cy, R * 0.685, 1.5, CYAN, 0.4);

  // Dashed range ring plus a fine inner graticule.
  c.save();
  c.setLineDash([7, 11]);
  ring(c, cx, cy, R * 0.635, 2.5, CYAN, 0.75);
  c.setLineDash([3, 9]);
  ring(c, cx, cy, R * 0.585, 1.5, CYAN, 0.45);
  c.setLineDash([]);
  c.restore();

  // Scan wedge baked in, so the array still reads as live where the animated overlay is occluded.
  c.save();
  c.beginPath();
  c.moveTo(cx, cy);
  c.arc(cx, cy, R * 0.98, -0.62, -0.06);
  c.closePath();
  const wg = c.createRadialGradient(cx, cy, 0, cx, cy, R);
  wg.addColorStop(0, 'rgba(150,240,255,0.02)');
  wg.addColorStop(1, 'rgba(150,240,255,0.22)');
  c.fillStyle = wg;
  c.fill();
  c.restore();

  ring(c, cx, cy, R * 0.52, 16, '#8fe4ff', 0.16);
  ring(c, cx, cy, R * 0.52, 3, HOT, 0.9);

  // Inner mechanism: four heavy jaw blocks on the cardinals and four light ones on the diagonals.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    c.save();
    c.translate(cx + Math.cos(a) * R * 0.31, cy + Math.sin(a) * R * 0.31);
    c.rotate(a + Math.PI / 2);
    const bw = R * 0.30;
    const bh = R * 0.155;
    roundRectPath(c, -bw / 2, -bh / 2, bw, bh, 5);
    c.globalAlpha = 0.68;
    c.fillStyle = '#5ad8f2';
    c.fill();
    c.globalAlpha = 1;
    c.strokeStyle = HOT;
    c.lineWidth = 3;
    c.stroke();
    c.fillStyle = HOT;
    c.fillRect(-bw / 2 + 6, -bh / 2 + 5, bw - 12, 3.5);
    c.globalAlpha = 0.6;
    c.fillRect(-bw / 2 + 6, bh / 2 - 8, bw - 12, 2);
    c.restore();
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    c.save();
    c.translate(cx + Math.cos(a) * R * 0.40, cy + Math.sin(a) * R * 0.40);
    c.rotate(a + Math.PI / 2);
    roundRectPath(c, -R * 0.055, -R * 0.05, R * 0.11, R * 0.10, 3);
    c.globalAlpha = 0.75;
    c.strokeStyle = CYAN;
    c.lineWidth = 2;
    c.stroke();
    c.restore();
  }

  // Hub -- the hot core the rest of the composition falls away from.
  const hub = c.createRadialGradient(cx, cy, 0, cx, cy, R * 0.145);
  hub.addColorStop(0, 'rgba(206,238,250,0.92)');
  hub.addColorStop(0.55, 'rgba(140,214,236,0.5)');
  hub.addColorStop(1, 'rgba(90,200,235,0)');
  c.fillStyle = hub;
  c.beginPath();
  c.arc(cx, cy, R * 0.145, 0, Math.PI * 2);
  c.fill();
  ring(c, cx, cy, R * 0.115, 2.5, HOT, 1);
  ring(c, cx, cy, R * 0.165, 1.2, CYAN, 0.55);
  c.save();
  c.globalAlpha = 0.8;
  c.strokeStyle = HOT;
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(cx - R * 0.19, cy);
  c.lineTo(cx + R * 0.19, cy);
  c.moveTo(cx, cy - R * 0.19);
  c.lineTo(cx, cy + R * 0.19);
  c.stroke();
  c.restore();

  // Radial spokes tying the inner mechanism out to the graduated bezel.
  c.save();
  c.globalAlpha = 0.28;
  c.strokeStyle = CYAN;
  c.lineWidth = 2;
  for (const deg of [35, 145, 215, 325]) {
    const a = (deg * Math.PI) / 180;
    c.beginPath();
    c.moveTo(cx + Math.cos(a) * R * 0.53, cy + Math.sin(a) * R * 0.53);
    c.lineTo(cx + Math.cos(a) * R * 0.99, cy + Math.sin(a) * R * 0.99);
    c.stroke();
  }
  c.restore();

  // Bearing numerals around the outside.
  c.save();
  c.font = 'bold 15px "Courier New", monospace';
  c.textAlign = 'center';
  c.globalAlpha = 0.7;
  c.fillStyle = CYAN;
  for (let i = 0; i < 12; i++) {
    // 000 and 180 sit exactly where the array's header/footer runners are -- skip them.
    if (i === 0 || i === 6) continue;
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const deg = (i * 30).toString().padStart(3, '0');
    c.fillText(deg, cx + Math.cos(a) * (R + 22), cy + Math.sin(a) * (R + 22) + 5);
  }
  c.restore();
  c.textAlign = 'left';

  // Tracked contacts with leader lines out to callout boxes.
  const contacts: [number, number, string][] = [
    [-0.62, -0.34, 'TK-118'],
    [0.55, 0.42, 'TK-207'],
    [0.30, -0.66, 'TK-044'],
  ];
  for (const [fx, fy, id] of contacts) {
    const px = cx + fx * R;
    const py = cy + fy * R;
    c.save();
    c.globalAlpha = 0.95;
    c.fillStyle = AMBER;
    c.beginPath();
    c.arc(px, py, 4.5, 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = 0.45;
    c.strokeStyle = AMBER;
    c.lineWidth = 1;
    c.beginPath();
    c.arc(px, py, 12 + rand() * 6, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.moveTo(px, py);
    c.lineTo(px + 34, py - 22);
    c.lineTo(px + 78, py - 22);
    c.stroke();
    c.restore();
    label(c, id, px + 38, py - 27, 12, AMBER, 0.8);
  }
}

/** Left-hand column content: identity block, log text, bar readouts. */
function drawLeftColumn(c: CanvasRenderingContext2D): void {
  const rand = rng(77401);

  // Upper: big ident glyph plate + log lines.
  c.save();
  c.globalAlpha = 0.30;
  c.fillStyle = '#0d3d4e';
  c.fillRect(26, 26, 96, 74);
  c.restore();
  c.save();
  c.globalAlpha = 0.75;
  c.strokeStyle = CYAN;
  c.lineWidth = 2;
  c.strokeRect(26, 26, 96, 74);
  c.restore();
  label(c, 'N/A', 38, 78, 40, HOT, 0.9);
  label(c, 'INBOUND', 134, 48, 15, CYAN, 0.85);
  label(c, 'ROSTER', 134, 68, 15, CYAN, 0.6);
  label(c, 'LNK 0.94', 134, 90, 13, GREEN, 0.75);

  for (let i = 0; i < 9; i++) {
    fakeText(c, 28, 122 + i * 17, 380, 5, i % 4 === 2 ? AMBER : CYAN, i % 4 === 2 ? 0.5 : 0.34, rand);
  }

  // Waveform box.
  c.save();
  c.globalAlpha = 0.5;
  c.strokeStyle = CYAN_SOFT;
  c.lineWidth = 1.5;
  c.strokeRect(28, 288, 380, 66);
  c.restore();
  label(c, 'CARRIER', 34, 284, 12, CYAN, 0.65);
  c.save();
  c.globalAlpha = 0.85;
  c.strokeStyle = HOT;
  c.lineWidth = 1.8;
  c.beginPath();
  for (let x = 0; x <= 380; x += 4) {
    const t = x / 380;
    const y = 321 + Math.sin(t * 22) * 14 * Math.sin(t * 3.1) + (rand() - 0.5) * 5;
    if (x === 0) c.moveTo(28 + x, y);
    else c.lineTo(28 + x, y);
  }
  c.stroke();
  c.restore();

  // Lower: bar chart + a dense little table.
  label(c, 'REACTOR BUS', 30, 428, 14, CYAN, 0.8);
  const bars = [0.35, 0.62, 0.48, 0.81, 0.55, 0.93, 0.41, 0.7, 0.6, 0.28, 0.75, 0.5];
  for (let i = 0; i < bars.length; i++) {
    const bh = bars[i] * 92;
    const bx = 32 + i * 31;
    c.save();
    c.globalAlpha = 0.18;
    c.fillStyle = CYAN;
    c.fillRect(bx, 440, 22, 92);
    c.globalAlpha = bars[i] > 0.85 ? 0.95 : 0.7;
    c.fillStyle = bars[i] > 0.85 ? CORAL : CYAN;
    c.fillRect(bx, 440 + (92 - bh), 22, bh);
    c.restore();
  }
  c.save();
  c.globalAlpha = 0.55;
  c.strokeStyle = HOT;
  c.setLineDash([5, 6]);
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(30, 462);
  c.lineTo(410, 462);
  c.stroke();
  c.setLineDash([]);
  c.restore();

  for (let i = 0; i < 7; i++) {
    fakeText(c, 30, 556 + i * 16, 250, 5, CYAN, 0.3, rand);
    c.save();
    c.globalAlpha = 0.6;
    c.fillStyle = i === 3 ? RED : CYAN;
    c.fillRect(300, 555 + i * 16, 34 + rand() * 40, 6);
    c.restore();
  }
  label(c, 'DIAG // NOMINAL', 30, 690, 13, GREEN, 0.7);
  fakeText(c, 30, 706, 380, 5, CYAN, 0.25, rand);
  fakeText(c, 30, 720, 340, 5, CYAN, 0.25, rand);
}

/** Right-hand column content: parameter rows with warm values, status stack, gauges. */
function drawRightColumn(c: CanvasRenderingContext2D): void {
  const rand = rng(31337);
  const x0 = 1116;

  label(c, 'FLIGHT PARAM', x0, 44, 15, CYAN, 0.85);
  const rows: [string, string, string][] = [
    ['DRIFT', '-04.117', RED],
    ['YAW', '+11.902', RED],
    ['THRM', '0.8842', AMBER],
    ['PRES', '1.0031', CYAN],
    ['MASS', '77.240', CYAN],
    ['FUEL', '0.6194', AMBER],
  ];
  for (let i = 0; i < rows.length; i++) {
    const y = 74 + i * 30;
    c.save();
    c.globalAlpha = 0.14;
    c.fillStyle = i % 2 ? '#0b3948' : '#000000';
    c.fillRect(x0 - 6, y - 14, 402, 26);
    c.restore();
    label(c, rows[i][0], x0, y + 4, 14, CYAN, 0.7);
    label(c, rows[i][1], x0 + 96, y + 4, 15, rows[i][2], 0.95);
    // Bar for the same value.
    const frac = 0.25 + rand() * 0.7;
    c.save();
    c.globalAlpha = 0.2;
    c.fillStyle = CYAN;
    c.fillRect(x0 + 208, y - 4, 182, 8);
    c.globalAlpha = 0.85;
    c.fillStyle = rows[i][2];
    c.fillRect(x0 + 208, y - 4, 182 * frac, 8);
    c.restore();
  }

  // Status dot stack -- the small saturated accents the brief reserves colour for.
  const dots = [GREEN, GREEN, AMBER, GREEN, RED, GREEN, AMBER, GREEN];
  for (let i = 0; i < dots.length; i++) {
    const dy = 270 + i * 13;
    c.save();
    c.globalAlpha = 0.95;
    c.fillStyle = dots[i];
    c.beginPath();
    c.arc(x0 + 8, dy, 4, 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = 0.3;
    c.beginPath();
    c.arc(x0 + 8, dy, 8, 0, Math.PI * 2);
    c.fill();
    c.restore();
    fakeText(c, x0 + 22, dy - 3, 150, 5, CYAN, 0.32, rand);
  }
  for (let i = 0; i < 7; i++) fakeText(c, x0 + 210, 268 + i * 15, 180, 5, CYAN, 0.28, rand);

  // Lower right: dense numeric block, vertical gauges, mini sector map.
  label(c, 'NAV SOLUTION', x0, 424, 14, CYAN, 0.8);
  c.save();
  c.globalAlpha = 0.5;
  c.strokeStyle = CYAN_SOFT;
  c.lineWidth = 1.2;
  for (let r = 0; r < 6; r++) c.strokeRect(x0, 436 + r * 22, 236, 22);
  for (let col = 1; col < 4; col++) {
    c.beginPath();
    c.moveTo(x0 + col * 59, 436);
    c.lineTo(x0 + col * 59, 568);
    c.stroke();
  }
  c.restore();
  c.save();
  c.font = 'bold 12px "Courier New", monospace';
  for (let r = 0; r < 6; r++) {
    for (let col = 0; col < 4; col++) {
      const hot = r === 2 && col === 1;
      c.globalAlpha = hot ? 0.95 : 0.55;
      c.fillStyle = hot ? CORAL : CYAN;
      c.fillText(Math.floor(rand() * 9000 + 1000).toString(), x0 + col * 59 + 9, 452 + r * 22);
    }
  }
  c.restore();

  for (let g = 0; g < 3; g++) {
    const gx = x0 + 258 + g * 30;
    c.save();
    c.globalAlpha = 0.22;
    c.fillStyle = CYAN;
    c.fillRect(gx, 436, 16, 132);
    const lvl = 0.4 + rand() * 0.55;
    c.globalAlpha = 0.85;
    c.fillStyle = g === 1 ? AMBER : CYAN;
    c.fillRect(gx, 436 + 132 * (1 - lvl), 16, 132 * lvl);
    c.globalAlpha = 0.6;
    c.strokeStyle = HOT;
    c.lineWidth = 1;
    for (let t = 1; t < 6; t++) {
      c.beginPath();
      c.moveTo(gx, 436 + (132 * t) / 6);
      c.lineTo(gx + 16, 436 + (132 * t) / 6);
      c.stroke();
    }
    c.restore();
  }
  c.save();
  c.globalAlpha = 0.45;
  c.strokeStyle = CYAN;
  c.lineWidth = 1.2;
  c.strokeRect(x0 + 352, 436, 44, 132);
  c.restore();
  for (let i = 0; i < 8; i++) fakeText(c, x0 + 356, 444 + i * 16, 36, 5, CYAN, 0.3, rand);

  label(c, 'LOG', x0, 604, 13, CYAN, 0.7);
  for (let i = 0; i < 8; i++) {
    fakeText(c, x0, 620 + i * 15, 300, 5, i === 5 ? RED : CYAN, i === 5 ? 0.6 : 0.28, rand);
  }
  label(c, 'ETA 00:14:22', x0 + 250, 748, 15, HOT, 0.85);
}

/**
 * The full 3x2 array composition. One image, sliced by UVs across six physical panes so the
 * reticle crosses the mullions the way the reference's does.
 */
export function buildCommandArrayTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = ARRAY_W;
  canvas.height = ARRAY_H;
  const c = canvas.getContext('2d')!;

  // Substrate is a lit LCD, not a hole. The old #031017 floor read as dead pure black once the
  // grade crushed it; the reference's darkest screen pixel still carries a visible teal cast.
  const bg = c.createLinearGradient(0, 0, 0, ARRAY_H);
  bg.addColorStop(0, '#123a48');
  bg.addColorStop(0.5, '#0d2c39');
  bg.addColorStop(1, '#0a232e');
  c.fillStyle = bg;
  c.fillRect(0, 0, ARRAY_W, ARRAY_H);

  // Faint substrate grid under everything.
  c.save();
  c.globalAlpha = 0.06;
  c.strokeStyle = CYAN;
  c.lineWidth = 1;
  for (let x = 0; x < ARRAY_W; x += 32) {
    c.beginPath();
    c.moveTo(x, 0);
    c.lineTo(x, ARRAY_H);
    c.stroke();
  }
  for (let y = 0; y < ARRAY_H; y += 32) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(ARRAY_W, y);
    c.stroke();
  }
  c.restore();

  drawLeftColumn(c);
  drawRightColumn(c);
  drawReticle(c, ARRAY_W / 2, ARRAY_H / 2, 330);

  // Header/footer runners spanning the whole array, above and below the reticle.
  c.save();
  c.globalAlpha = 0.4;
  c.fillStyle = CYAN;
  c.fillRect(440, 16, 656, 3);
  c.fillRect(440, ARRAY_H - 19, 656, 3);
  c.restore();
  c.save();
  c.textAlign = 'center';
  label(c, 'MARSHAL GRID // SECTOR 07', ARRAY_W / 2, 40, 16, HOT, 0.8);
  label(c, 'PRIMARY TACTICAL RETURN -- LIVE', ARRAY_W / 2, ARRAY_H - 30, 14, CYAN, 0.6);
  c.restore();
  c.textAlign = 'left';

  // Per-pane treatment: each physical slab gets its own inner border and corner falloff so the
  // array reads as six lit screens carrying one image, not one big decal.
  const paneW = ARRAY_W / COLS;
  const paneH = ARRAY_H / ROWS;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const px = col * paneW;
      const py = row * paneH;
      const vig = c.createRadialGradient(
        px + paneW / 2, py + paneH / 2, paneH * 0.25,
        px + paneW / 2, py + paneH / 2, paneW * 0.72,
      );
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, 'rgba(4,20,28,0.30)');
      c.fillStyle = vig;
      c.fillRect(px, py, paneW, paneH);

      c.save();
      c.globalAlpha = 0.35;
      c.strokeStyle = CYAN;
      c.lineWidth = 2;
      c.strokeRect(px + 6, py + 6, paneW - 12, paneH - 12);
      c.globalAlpha = 0.8;
      c.fillStyle = HOT;
      // Corner ticks on the pane border.
      for (const [ox, oy, dx, dy] of [
        [6, 6, 1, 1], [paneW - 6, 6, -1, 1], [6, paneH - 6, 1, -1], [paneW - 6, paneH - 6, -1, -1],
      ] as const) {
        c.fillRect(px + ox + (dx < 0 ? -22 : 0), py + oy - 1, 22, 2);
        c.fillRect(px + ox - 1, py + oy + (dy < 0 ? -22 : 0), 2, 22);
      }
      c.restore();
    }
  }

  // Scanlines and a horizontal tear -- CRT-ish wear rather than a clean vector plate. Tinted
  // rather than black so the interstitials still carry the panel's teal instead of punching holes.
  c.save();
  c.globalAlpha = 0.16;
  c.fillStyle = '#04141c';
  for (let y = 0; y < ARRAY_H; y += 3) c.fillRect(0, y, ARRAY_W, 1);
  c.globalAlpha = 0.08;
  c.fillStyle = '#9fe6ff';
  c.fillRect(0, 214, ARRAY_W, 4);
  c.fillRect(0, 592, ARRAY_W, 3);
  c.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Rotating sweep overlay laid additively over the reticle so the array reads as live. */
export function buildSweepTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const c = canvas.getContext('2d')!;
  c.clearRect(0, 0, size, size);
  const cx = size / 2;
  const r = size / 2 - 2;

  const steps = 56;
  for (let i = 0; i < steps; i++) {
    const a0 = -(i / steps) * 1.25;
    const a1 = -((i + 1) / steps) * 1.25;
    const a = 0.34 * (1 - i / steps) ** 2.1;
    c.beginPath();
    c.moveTo(cx, cx);
    c.arc(cx, cx, r, a1, a0);
    c.closePath();
    c.fillStyle = `rgba(168,240,255,${a})`;
    c.fill();
  }
  c.save();
  c.strokeStyle = 'rgba(220,252,255,0.8)';
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(cx, cx);
  c.lineTo(cx + r, cx);
  c.stroke();
  c.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Small auxiliary readout for the sub-monitors flanking the main array. */
export function buildAuxScreenTexture(variant: 0 | 1): THREE.CanvasTexture {
  const w = 256;
  const h = 192;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d')!;
  const rand = rng(variant === 0 ? 8811 : 4477);
  c.fillStyle = '#0d2c39';
  c.fillRect(0, 0, w, h);
  c.save();
  c.globalAlpha = 0.35;
  c.strokeStyle = CYAN;
  c.lineWidth = 2;
  c.strokeRect(5, 5, w - 10, h - 10);
  c.restore();

  if (variant === 0) {
    label(c, 'HULL', 14, 26, 14, CYAN, 0.85);
    // Simple ship silhouette schematic with hot-spot sections.
    c.save();
    c.globalAlpha = 0.55;
    c.strokeStyle = CYAN;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(40, 100);
    c.lineTo(96, 66);
    c.lineTo(196, 74);
    c.lineTo(214, 100);
    c.lineTo(196, 126);
    c.lineTo(96, 134);
    c.closePath();
    c.stroke();
    c.globalAlpha = 0.5;
    c.fillStyle = CORAL;
    c.fillRect(150, 82, 34, 20);
    c.globalAlpha = 0.35;
    c.fillStyle = CYAN;
    c.fillRect(96, 104, 46, 22);
    c.restore();
    for (let i = 0; i < 3; i++) fakeText(c, 14, 150 + i * 13, 200, 4, CYAN, 0.3, rand);
    label(c, 'BR-3 BREACH', 150, 168, 11, RED, 0.85);
  } else {
    label(c, 'DOCK QUEUE', 14, 26, 14, CYAN, 0.85);
    for (let i = 0; i < 7; i++) {
      const y = 44 + i * 19;
      c.save();
      c.globalAlpha = 0.12;
      c.fillStyle = CYAN;
      c.fillRect(12, y - 11, w - 24, 16);
      c.restore();
      fakeText(c, 18, y - 5, 140, 4, CYAN, 0.35, rand);
      c.save();
      c.globalAlpha = 0.9;
      c.fillStyle = i === 2 ? AMBER : GREEN;
      c.beginPath();
      c.arc(w - 26, y - 3, 3.5, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
  }

  c.save();
  c.globalAlpha = 0.22;
  c.fillStyle = '#04141c';
  for (let y = 0; y < h; y += 3) c.fillRect(0, y, w, 1);
  c.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Stencilled steel placard for the frame's top rail. */
export function buildFrameLabelTexture(text: string): THREE.CanvasTexture {
  const w = 512;
  const h = 64;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#3a424b';
  c.fillRect(0, 0, w, h);
  c.save();
  c.globalAlpha = 0.35;
  c.fillStyle = '#20262c';
  for (let y = 0; y < h; y += 8) c.fillRect(0, y, w, 3);
  c.restore();
  c.fillStyle = '#8a8f98';
  c.fillRect(0, 0, w, 3);
  c.fillStyle = '#23282e';
  c.fillRect(0, h - 4, w, 4);
  c.save();
  c.textAlign = 'center';
  c.font = 'bold 26px "Courier New", monospace';
  c.fillStyle = '#c9c2b4';
  c.fillText(text, w / 2, 42);
  c.restore();
  // Bolt washers at the ends.
  for (const bx of [22, w - 22]) {
    c.save();
    c.fillStyle = '#6e737c';
    c.beginPath();
    c.arc(bx, h / 2, 9, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#2b3138';
    c.beginPath();
    c.arc(bx, h / 2, 4, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// =================================================================================================
// Material maps.
//
// The round-1 critique was that every surface here read as one tinted plastic with a single
// roughness. The fix is a real map set per material class: an albedo that already carries cavity
// darkening and localised wear, a height-derived normal so seams and bolts catch a grazing
// highlight, and a roughness map so paint, bare steel and grime respond to the same light
// differently. Three classes are built -- painted enclosure, machined bare steel, rubber -- and
// their roughness/metalness ranges are deliberately kept far apart.
// =================================================================================================

export interface SurfaceMaps {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
}

function newCanvas(size: number): { canvas: HTMLCanvasElement; c: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return { canvas, c: canvas.getContext('2d')! };
}

function dataTexture(canvas: HTMLCanvasElement, srgb: boolean): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Sobel a greyscale height canvas into a tangent-space normal map.
 *
 * Green sign: canvas +y runs down the image while UV +v runs up (flipY is on), so dH/dv is the
 * negation of the canvas-space vertical difference, and the GL-convention normal's Y component
 * (-dH/dv) comes back out as the raw canvas difference with no extra flip.
 */
function heightToNormal(src: HTMLCanvasElement, strength: number): THREE.CanvasTexture {
  const size = src.width;
  const h = src.getContext('2d')!.getImageData(0, 0, size, size).data;
  const { canvas, c } = newCanvas(size);
  const img = c.createImageData(size, size);
  const at = (x: number, y: number) => h[((((y % size) + size) % size) * size + (((x % size) + size) % size)) * 4] / 255;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = -(at(x + 1, y) - at(x - 1, y)) * strength;
      const ny = (at(x, y + 1) - at(x, y - 1)) * strength;
      const inv = 1 / Math.hypot(nx, ny, 1);
      const i = (y * size + x) * 4;
      img.data[i] = (nx * inv * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * inv * 0.5 + 0.5) * 255;
      img.data[i + 2] = (inv * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  c.putImageData(img, 0, 0);
  return dataTexture(canvas, false);
}

/** Grey level for a roughness canvas, where 0 is mirror and 1 is fully diffuse. */
function rough(v: number): string {
  const g = Math.round(Math.max(0, Math.min(1, v)) * 255);
  return `rgb(${g},${g},${g})`;
}

/**
 * Painted enclosure plate: bolted panels of cool grey ship paint, chipped back to bare metal on
 * the plate edges where things get knocked, with grime pooled in the seams and rust drips hanging
 * below them. Paint is dielectric, so the display module pairs this with metalness near zero --
 * that alone separates it from the bare-steel class more than any colour change would.
 */
export function buildPaintedPlateMaps(): SurfaceMaps {
  const size = 512;
  const rand = rng(50231);
  const alb = newCanvas(size);
  const hgt = newCanvas(size);
  const rgh = newCanvas(size);

  alb.c.fillStyle = '#6f7883';
  alb.c.fillRect(0, 0, size, size);
  hgt.c.fillStyle = 'rgb(150,150,150)';
  hgt.c.fillRect(0, 0, size, size);
  rgh.c.fillStyle = rough(0.78);
  rgh.c.fillRect(0, 0, size, size);

  // Roller texture in the paint: broad tonal drift so a flat wall of it is never one value.
  // Amplitude widened from the previous 0.05-0.11 pass -- at that range the drift resolved as
  // near-uniform grey by the time a face was seen from normal play distance, which is most of why
  // the console shell read as flat plastic.
  for (let i = 0; i < 120; i++) {
    alb.c.save();
    alb.c.globalAlpha = 0.07 + rand() * 0.1;
    alb.c.fillStyle = rand() > 0.5 ? '#828d99' : '#5c646e';
    alb.c.beginPath();
    alb.c.arc(rand() * size, rand() * size, 30 + rand() * 90, 0, Math.PI * 2);
    alb.c.fill();
    alb.c.restore();
  }
  for (let i = 0; i < 260; i++) {
    rgh.c.save();
    rgh.c.globalAlpha = 0.14 + rand() * 0.22;
    rgh.c.fillStyle = rough(0.55 + rand() * 0.38);
    rgh.c.beginPath();
    rgh.c.arc(rand() * size, rand() * size, 12 + rand() * 46, 0, Math.PI * 2);
    rgh.c.fill();
    rgh.c.restore();
  }

  // Plate grid: two panels each way, so a 1 m box face reads as ~0.5 m plates like the brief asks.
  const seams: [number, boolean][] = [[0, false], [256, false], [0, true], [256, true]];
  for (const [p, vertical] of seams) {
    // Cavity: a soft dark gradient either side of the groove, i.e. the AO the critic asked for,
    // baked where two plates meet instead of relying on a screen-space effect.
    const g = vertical
      ? alb.c.createLinearGradient(p - 14, 0, p + 14, 0)
      : alb.c.createLinearGradient(0, p - 14, 0, p + 14);
    g.addColorStop(0, 'rgba(24,29,35,0)');
    g.addColorStop(0.5, 'rgba(24,29,35,0.62)');
    g.addColorStop(1, 'rgba(24,29,35,0)');
    alb.c.fillStyle = g;
    if (vertical) alb.c.fillRect(p - 14, 0, 28, size);
    else alb.c.fillRect(0, p - 14, size, 28);

    // The groove itself, plus the lit lip on its far side.
    alb.c.fillStyle = '#20262d';
    hgt.c.fillStyle = 'rgb(70,70,70)';
    rgh.c.fillStyle = rough(0.92);
    for (const ctx2 of [alb.c, hgt.c, rgh.c]) {
      if (vertical) ctx2.fillRect(p - 2, 0, 5, size);
      else ctx2.fillRect(0, p - 2, size, 5);
    }
    alb.c.fillStyle = '#9aa4ae';
    hgt.c.fillStyle = 'rgb(196,196,196)';
    rgh.c.fillStyle = rough(0.42);
    for (const ctx2 of [alb.c, hgt.c, rgh.c]) {
      if (vertical) ctx2.fillRect(p + 3, 0, 2, size);
      else ctx2.fillRect(0, p + 3, size, 2);
    }
  }

  // Edge chipping: paint knocked off along the plate borders, exposing brighter, smoother metal.
  for (let i = 0; i < 420; i++) {
    const alongSeam = rand() > 0.35;
    let x: number;
    let y: number;
    if (alongSeam) {
      const p = [0, 256][Math.floor(rand() * 2)] + (rand() - 0.5) * 22;
      if (rand() > 0.5) { x = p; y = rand() * size; } else { x = rand() * size; y = p; }
    } else {
      x = rand() * size;
      y = rand() * size;
    }
    const w = 1 + rand() * 6;
    const hh = 1 + rand() * 4;
    alb.c.save();
    alb.c.globalAlpha = 0.5 + rand() * 0.45;
    alb.c.fillStyle = '#a3adb7';
    alb.c.fillRect(x, y, w, hh);
    alb.c.restore();
    rgh.c.fillStyle = rough(0.3 + rand() * 0.12);
    rgh.c.fillRect(x, y, w, hh);
    hgt.c.save();
    hgt.c.globalAlpha = 0.6;
    hgt.c.fillStyle = 'rgb(112,112,112)';
    hgt.c.fillRect(x, y, w, hh);
    hgt.c.restore();
  }

  // Larger corner chips: the 1-7 px scatter above reads as noise from normal play distance --
  // these are big enough (up to ~28 px, ~5% of the plate) to actually register as paint knocked
  // off where two edges meet, which is where impacts happen.
  for (const cx of [0, 512]) {
    for (const cy of [0, 512]) {
      for (let i = 0; i < 3; i++) {
        const x = cx + (cx === 0 ? 1 : -1) * rand() * 46;
        const y = cy + (cy === 0 ? 1 : -1) * rand() * 46;
        const r = 6 + rand() * 14;
        alb.c.save();
        alb.c.globalAlpha = 0.55 + rand() * 0.3;
        alb.c.fillStyle = '#aeb8c1';
        alb.c.beginPath();
        alb.c.arc(x, y, r, 0, Math.PI * 2);
        alb.c.fill();
        alb.c.restore();
        rgh.c.fillStyle = rough(0.22 + rand() * 0.12);
        rgh.c.beginPath();
        rgh.c.arc(x, y, r, 0, Math.PI * 2);
        rgh.c.fill();
        hgt.c.save();
        hgt.c.globalAlpha = 0.55;
        hgt.c.fillStyle = 'rgb(108,108,108)';
        hgt.c.beginPath();
        hgt.c.arc(x, y, r, 0, Math.PI * 2);
        hgt.c.fill();
        hgt.c.restore();
      }
    }
  }

  // Bolt heads at the plate corners: raised in height, bare and smooth in roughness.
  for (const bx of [0, 128, 256, 384]) {
    for (const by of [0, 128, 256, 384]) {
      const onSeam = bx % 256 === 0 || by % 256 === 0;
      if (!onSeam) continue;
      const x = bx + 14;
      const y = by + 14;
      alb.c.save();
      alb.c.fillStyle = '#2a3038';
      alb.c.beginPath();
      alb.c.arc(x, y, 8, 0, Math.PI * 2);
      alb.c.fill();
      alb.c.fillStyle = '#a9b3bd';
      alb.c.beginPath();
      alb.c.arc(x, y - 1, 6, 0, Math.PI * 2);
      alb.c.fill();
      alb.c.restore();
      hgt.c.fillStyle = 'rgb(120,120,120)';
      hgt.c.beginPath();
      hgt.c.arc(x, y, 8, 0, Math.PI * 2);
      hgt.c.fill();
      hgt.c.fillStyle = 'rgb(215,215,215)';
      hgt.c.beginPath();
      hgt.c.arc(x, y, 6, 0, Math.PI * 2);
      hgt.c.fill();
      rgh.c.fillStyle = rough(0.29);
      rgh.c.beginPath();
      rgh.c.arc(x, y, 6, 0, Math.PI * 2);
      rgh.c.fill();
    }
  }

  // Drip streaks hanging off the horizontal seams only -- corrosion where water and oil would
  // actually run, not a tint over the whole plate.
  for (let i = 0; i < 34; i++) {
    const x = rand() * size;
    const y = [3, 259][Math.floor(rand() * 2)];
    const len = 24 + rand() * 110;
    const w = 2 + rand() * 6;
    const g = alb.c.createLinearGradient(0, y, 0, y + len);
    g.addColorStop(0, 'rgba(126,84,48,0.5)');
    g.addColorStop(0.35, 'rgba(112,80,52,0.28)');
    g.addColorStop(1, 'rgba(96,76,58,0)');
    alb.c.fillStyle = g;
    alb.c.fillRect(x, y, w, len);
    const rg = rgh.c.createLinearGradient(0, y, 0, y + len);
    rg.addColorStop(0, 'rgba(255,255,255,0.55)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    rgh.c.fillStyle = rg;
    rgh.c.fillRect(x, y, w, len);
  }

  // Dust settled on the up-facing half of every plate.
  for (const top of [0, 256]) {
    const g = alb.c.createLinearGradient(0, top + 6, 0, top + 74);
    g.addColorStop(0, 'rgba(168,160,142,0.20)');
    g.addColorStop(1, 'rgba(168,160,142,0)');
    alb.c.fillStyle = g;
    alb.c.fillRect(0, top + 6, size, 74);
  }

  return {
    map: dataTexture(alb.canvas, true),
    normalMap: heightToNormal(hgt.canvas, 2.6),
    roughnessMap: dataTexture(rgh.canvas, false),
  };
}

/**
 * Machined bare steel for brackets, chamfer lips and gantry hardware: directional grain, scattered
 * scratches, no paint. Pairs with high metalness and low roughness, the opposite end of the range
 * from the painted class.
 */
export function buildBareSteelMaps(): SurfaceMaps {
  const size = 256;
  const rand = rng(11887);
  const alb = newCanvas(size);
  const hgt = newCanvas(size);
  const rgh = newCanvas(size);

  alb.c.fillStyle = '#8d97a1';
  alb.c.fillRect(0, 0, size, size);
  hgt.c.fillStyle = 'rgb(140,140,140)';
  hgt.c.fillRect(0, 0, size, size);
  rgh.c.fillStyle = rough(0.34);
  rgh.c.fillRect(0, 0, size, size);

  // Drawing grain: fine lines along one axis, the thing that makes bare steel smear its highlight.
  for (let i = 0; i < 900; i++) {
    const y = rand() * size;
    const a = 0.05 + rand() * 0.1;
    alb.c.save();
    alb.c.globalAlpha = a;
    alb.c.fillStyle = rand() > 0.5 ? '#a8b2bc' : '#6f7883';
    alb.c.fillRect(0, y, size, 1);
    alb.c.restore();
    rgh.c.save();
    rgh.c.globalAlpha = a * 2.4;
    rgh.c.fillStyle = rough(0.22 + rand() * 0.3);
    rgh.c.fillRect(0, y, size, 1);
    rgh.c.restore();
    hgt.c.save();
    hgt.c.globalAlpha = a;
    hgt.c.fillStyle = rand() > 0.5 ? 'rgb(180,180,180)' : 'rgb(100,100,100)';
    hgt.c.fillRect(0, y, size, 1);
    hgt.c.restore();
  }

  // Gouges and handling scratches, brighter and smoother than the surrounding grain.
  for (let i = 0; i < 90; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const len = 6 + rand() * 54;
    const ang = (rand() - 0.5) * 0.7;
    for (const [ctx2, style, alpha] of [
      [alb.c, '#b9c2cb', 0.5],
      [rgh.c, rough(0.16), 0.8],
      [hgt.c, 'rgb(96,96,96)', 0.6],
    ] as const) {
      ctx2.save();
      ctx2.globalAlpha = alpha;
      ctx2.strokeStyle = style;
      ctx2.lineWidth = 0.8 + rand() * 1.4;
      ctx2.beginPath();
      ctx2.moveTo(x, y);
      ctx2.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      ctx2.stroke();
      ctx2.restore();
    }
  }

  // Oxide bloom in a few patches: dulled, darker, much rougher. Localised, never a wash.
  for (let i = 0; i < 12; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 8 + rand() * 26;
    const g = alb.c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(108,84,62,0.42)');
    g.addColorStop(1, 'rgba(108,84,62,0)');
    alb.c.fillStyle = g;
    alb.c.beginPath();
    alb.c.arc(x, y, r, 0, Math.PI * 2);
    alb.c.fill();
    const rg = rgh.c.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, 'rgba(255,255,255,0.7)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    rgh.c.fillStyle = rg;
    rgh.c.beginPath();
    rgh.c.arc(x, y, r, 0, Math.PI * 2);
    rgh.c.fill();
  }

  return {
    map: dataTexture(alb.canvas, true),
    normalMap: heightToNormal(hgt.canvas, 1.4),
    roughnessMap: dataTexture(rgh.canvas, false),
  };
}

/** Ribbed cable jacket: matte rubber, no metalness at all, with the ribbing carried in normal. */
export function buildCableMaps(): SurfaceMaps {
  const size = 128;
  const rand = rng(6604);
  const alb = newCanvas(size);
  const hgt = newCanvas(size);
  const rgh = newCanvas(size);

  alb.c.fillStyle = '#2d3239';
  alb.c.fillRect(0, 0, size, size);
  rgh.c.fillStyle = rough(0.95);
  rgh.c.fillRect(0, 0, size, size);
  hgt.c.fillStyle = 'rgb(128,128,128)';
  hgt.c.fillRect(0, 0, size, size);

  for (let x = 0; x < size; x += 8) {
    hgt.c.fillStyle = 'rgb(200,200,200)';
    hgt.c.fillRect(x, 0, 4, size);
    alb.c.save();
    alb.c.globalAlpha = 0.3;
    alb.c.fillStyle = '#3c434b';
    alb.c.fillRect(x, 0, 4, size);
    alb.c.restore();
  }
  // Dust caught on the ribs, and a couple of scuffed shiny patches where the loom rubs a bracket.
  for (let i = 0; i < 60; i++) {
    alb.c.save();
    alb.c.globalAlpha = 0.06 + rand() * 0.1;
    alb.c.fillStyle = '#8b8477';
    alb.c.fillRect(rand() * size, rand() * size, 3 + rand() * 14, 2 + rand() * 5);
    alb.c.restore();
  }
  for (let i = 0; i < 6; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const g = rgh.c.createRadialGradient(x, y, 0, x, y, 18);
    g.addColorStop(0, rough(0.55));
    g.addColorStop(1, 'rgba(242,242,242,0)');
    rgh.c.fillStyle = g;
    rgh.c.beginPath();
    rgh.c.arc(x, y, 18, 0, Math.PI * 2);
    rgh.c.fill();
  }

  return {
    map: dataTexture(alb.canvas, true),
    normalMap: heightToNormal(hgt.canvas, 1.8),
    roughnessMap: dataTexture(rgh.canvas, false),
  };
}

/**
 * Roughness/normal pair for the glass, laid over the array's own UV rects. Dust and finger smear
 * concentrate along the bottom lip and the pane edges -- where a crewman braces a hand and where
 * the bezel traps dirt -- so the glass carries a broken specular instead of one mirror value.
 */
export function buildGlassSmudgeMaps(): { roughnessMap: THREE.CanvasTexture; normalMap: THREE.CanvasTexture } {
  const w = ARRAY_W / 2;
  const h = ARRAY_H / 2;
  const rand = rng(31771);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d')!;
  const hcanvas = document.createElement('canvas');
  hcanvas.width = h;
  hcanvas.height = h;
  const hc = hcanvas.getContext('2d')!;

  c.fillStyle = rough(0.1);
  c.fillRect(0, 0, w, h);
  hc.fillStyle = 'rgb(128,128,128)';
  hc.fillRect(0, 0, h, h);

  const paneW = w / COLS;
  const paneH = h / ROWS;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const px = col * paneW;
      const py = row * paneH;
      // Dirt trapped along the bezel lip on every edge of every slab.
      for (const g of [
        c.createLinearGradient(0, py + paneH, 0, py + paneH - 44),
        c.createLinearGradient(0, py, 0, py + 26),
        c.createLinearGradient(px, 0, px + 22, 0),
        c.createLinearGradient(px + paneW, 0, px + paneW - 22, 0),
      ]) {
        g.addColorStop(0, 'rgba(255,255,255,0.6)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g;
        c.fillRect(px, py, paneW, paneH);
      }
      // Hand smears on the lower slabs only: nobody reaches the top row.
      if (row === ROWS - 1) {
        for (let i = 0; i < 5; i++) {
          const sx = px + 40 + rand() * (paneW - 80);
          const sy = py + paneH * 0.55 + rand() * paneH * 0.3;
          const g = c.createRadialGradient(sx, sy, 0, sx, sy, 34 + rand() * 40);
          g.addColorStop(0, 'rgba(255,255,255,0.42)');
          g.addColorStop(1, 'rgba(255,255,255,0)');
          c.fillStyle = g;
          c.beginPath();
          c.arc(sx, sy, 74, 0, Math.PI * 2);
          c.fill();
        }
      }
    }
  }
  // Fine dust speckle across the whole sheet.
  for (let i = 0; i < 900; i++) {
    c.save();
    c.globalAlpha = 0.06 + rand() * 0.16;
    c.fillStyle = '#ffffff';
    c.fillRect(rand() * w, rand() * h, 1 + rand() * 3, 1 + rand() * 2);
    c.restore();
  }
  // Faint waviness in the glass sheet itself so the reflection is not geometrically perfect.
  for (let i = 0; i < 26; i++) {
    const g = hc.createLinearGradient(0, rand() * h, 0, rand() * h);
    g.addColorStop(0, 'rgb(120,120,120)');
    g.addColorStop(1, 'rgb(136,136,136)');
    hc.fillStyle = g;
    hc.fillRect(0, rand() * h, h, 8 + rand() * 40);
  }

  return { roughnessMap: dataTexture(canvas, false), normalMap: heightToNormal(hcanvas, 0.35) };
}

/**
 * Additive specular-glare overlay for the physical glass pane sitting in front of the phosphor
 * image (see suspendedDisplay.ts). Two soft diagonal light bars plus a scatter of tight point
 * glints stand in for the room's practicals and screen-glow catching the true glass surface,
 * baked in rather than left to whatever the runtime lights happen to be doing at render time --
 * the same reasoning as the reticle's own baked bloom pad -- so the "there's real glass here" cue
 * survives regardless of the exact camera angle a given capture lands on.
 */
export function buildGlassGlareTexture(): THREE.CanvasTexture {
  const w = ARRAY_W;
  const h = ARRAY_H;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d')!;
  c.clearRect(0, 0, w, h);

  // Wide soft bar -- the ceiling practical's reflection sweeping across the sheet.
  c.save();
  c.translate(w * 0.28, h * 0.1);
  c.rotate(-0.55);
  const bar1 = c.createLinearGradient(-40, 0, 40, 0);
  bar1.addColorStop(0, 'rgba(255,255,255,0)');
  bar1.addColorStop(0.5, 'rgba(240,250,255,0.16)');
  bar1.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = bar1;
  c.fillRect(-40, -h, 80, h * 3);
  c.restore();

  // Narrower, brighter secondary streak -- a closer light source catching the same sheet.
  c.save();
  c.translate(w * 0.7, h * 0.4);
  c.rotate(-0.4);
  const bar2 = c.createLinearGradient(-16, 0, 16, 0);
  bar2.addColorStop(0, 'rgba(255,255,255,0)');
  bar2.addColorStop(0.5, 'rgba(255,255,255,0.22)');
  bar2.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = bar2;
  c.fillRect(-16, -h, 32, h * 3);
  c.restore();

  // A few tight point glints -- crisp highlights off the panel's own micro-waviness.
  const rand = rng(4471);
  for (let i = 0; i < 6; i++) {
    const x = w * (0.08 + rand() * 0.84);
    const y = h * (0.1 + rand() * 0.8);
    const r = 3 + rand() * 5;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Soot / heat-stain decal for a multiply-blended overlay quad. White is "no change", so the map is
 * opaque white with dark plumes drawn into it -- an alpha-cut texture would multiply its cleared
 * pixels to black and stamp a rectangle onto the plate.
 *
 * `seed` shifts the plume layout so the vent bank and the drip runs under the pod conduits do not
 * repeat the same silhouette.
 */
export function buildVentSootTexture(seed: number, plumes: number): THREE.CanvasTexture {
  const w = 256;
  const h = 128;
  const rand = rng(seed);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, w, h);

  // Plumes rising from evenly spaced slots, each tapering and fading back to white.
  for (let i = 0; i < plumes; i++) {
    const x = (i + 0.5) * (w / plumes) + (rand() - 0.5) * 6;
    const len = h * (0.35 + rand() * 0.6);
    const g = c.createLinearGradient(0, h, 0, h - len);
    g.addColorStop(0, 'rgba(74,68,60,1)');
    g.addColorStop(0.4, 'rgba(150,144,134,1)');
    g.addColorStop(1, 'rgba(255,255,255,1)');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(x - 7, h);
    c.lineTo(x + 7, h);
    c.lineTo(x + 3 + rand() * 4, h - len);
    c.lineTo(x - 3 - rand() * 4, h - len);
    c.closePath();
    c.fill();
  }
  // Speckled deposit, densest right at the mouth.
  for (let i = 0; i < 200; i++) {
    c.save();
    c.globalAlpha = 0.06 + rand() * 0.2;
    c.fillStyle = '#4a443c';
    c.fillRect(rand() * w, h - rand() * rand() * h, 2 + rand() * 9, 1 + rand() * 4);
    c.restore();
  }
  // Feather the left/right ends back to white so the quad has no visible vertical edge.
  const edge = c.createLinearGradient(0, 0, w * 0.14, 0);
  edge.addColorStop(0, 'rgba(255,255,255,1)');
  edge.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = edge;
  c.fillRect(0, 0, w * 0.14, h);
  const edge2 = c.createLinearGradient(w, 0, w * 0.86, 0);
  edge2.addColorStop(0, 'rgba(255,255,255,1)');
  edge2.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = edge2;
  c.fillRect(w * 0.86, 0, w * 0.14, h);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Bright worn-through streak decal: irregular light blotches with a few directional scratch
 * lines through them, standing in for paint rubbed down to bare metal at a corner or handhold.
 * Regular alpha blend, not multiply -- this decal LIGHTENS the surface underneath, the opposite
 * direction from the soot/grime decals, so a corner can carry both a dark pooled-grime patch and
 * a light rubbed-through patch instead of one uniform tint.
 */
export function buildScuffTexture(seed: number): THREE.CanvasTexture {
  const w = 256;
  const h = 128;
  const rand = rng(seed);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d')!;
  c.clearRect(0, 0, w, h);

  const blotches = 5 + Math.floor(rand() * 4);
  for (let i = 0; i < blotches; i++) {
    const x = rand() * w;
    const y = h * 0.3 + rand() * h * 0.5;
    const r = 10 + rand() * 26;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(198,204,210,0.85)');
    g.addColorStop(0.5, 'rgba(180,188,196,0.4)');
    g.addColorStop(1, 'rgba(180,188,196,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  }
  // Directional scratch lines through the blotches -- the detail that sells "rubbed" over "spilled".
  for (let i = 0; i < 10; i++) {
    const y = h * 0.35 + rand() * h * 0.4;
    const x0 = rand() * w * 0.6;
    const len = 20 + rand() * 60;
    c.save();
    c.globalAlpha = 0.3 + rand() * 0.3;
    c.strokeStyle = 'rgba(210,216,222,1)';
    c.lineWidth = 0.8 + rand() * 1.2;
    c.beginPath();
    c.moveTo(x0, y);
    c.lineTo(x0 + len, y + (rand() - 0.5) * 6);
    c.stroke();
    c.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** UV sub-rect for pane (col, row) of the array texture, origin bottom-left in UV space. */
export function paneUvRect(col: number, row: number): { u0: number; v0: number; du: number; dv: number } {
  const du = 1 / COLS;
  const dv = 1 / ROWS;
  // Canvas row 0 is the TOP of the image, which is v = 1 - dv in UV space.
  return { u0: col * du, v0: 1 - (row + 1) * dv, du, dv };
}
