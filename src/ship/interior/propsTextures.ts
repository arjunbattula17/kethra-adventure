import * as THREE from 'three';

/**
 * Procedural canvas textures for the set-dressing props. These are the "third layer" of detail —
 * label plates, louvre shading, stencils and wear that would be uneconomical as geometry at
 * 2–5 cm scale. Everything here is painted in the brief's palette: cool grey steel, bone paint,
 * hazard amber and cyan readouts, with rust used only as small localised staining.
 */

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return [canvas, canvas.getContext('2d')!];
}

function finish(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Non-colour data map (roughness, normal): must stay linear or the lighting response is wrong. */
function finishData(canvas: HTMLCanvasElement, repeat: number): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  return tex;
}

/** Letter-spaced stencil text — reads as sprayed lettering rather than a tight font render. */
function stencilText(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, spacing: number): void {
  const widths = [...text].map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * Math.max(0, text.length - 1);
  let x = cx - total / 2;
  const prevAlign = ctx.textAlign;
  ctx.textAlign = 'left';
  for (let i = 0; i < text.length; i++) {
    ctx.fillText(text[i], x, cy);
    x += widths[i] + spacing;
  }
  ctx.textAlign = prevAlign;
}

/** Scratches concentrated near an edge — wear is motivated by contact, not sprayed uniformly. */
function edgeScuffs(ctx: CanvasRenderingContext2D, w: number, h: number, count: number, seedOffset = 0): void {
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const t = (i * 2.399 + seedOffset) % 1;
    const nearBottom = t > 0.45;
    const x = ((i * 137.5 + seedOffset * 61) % w);
    const y = nearBottom ? h - Math.random() * h * 0.22 : Math.random() * h * 0.16;
    const len = 4 + Math.random() * 26;
    ctx.strokeStyle = `rgba(214,208,196,${0.06 + Math.random() * 0.16})`;
    ctx.lineWidth = 0.6 + Math.random() * 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len * (Math.random() - 0.5) * 2, y + (Math.random() - 0.5) * 5);
    ctx.stroke();
  }
  ctx.restore();
}

/** Dark grime settling into a corner or along a bottom edge. */
function grimeGradient(ctx: CanvasRenderingContext2D, w: number, h: number, strength = 0.5): void {
  const g = ctx.createLinearGradient(0, h * 0.55, 0, h);
  g.addColorStop(0, 'rgba(12,14,17,0)');
  g.addColorStop(1, `rgba(12,14,17,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const c = ctx.createRadialGradient(w * 0.5, h * 0.5, w * 0.28, w * 0.5, h * 0.5, w * 0.78);
  c.addColorStop(0, 'rgba(12,14,17,0)');
  c.addColorStop(1, `rgba(12,14,17,${strength * 0.7})`);
  ctx.fillStyle = c;
  ctx.fillRect(0, 0, w, h);
}

const CRATE_TONES: Record<string, [string, string, string]> = {
  // [base, panel inset, edge highlight]
  steel: ['#79808a', '#6a717b', '#9aa2ac'],
  bone: ['#bdb6a8', '#aca596', '#d6cfbf'],
  olive: ['#525d4d', '#485241', '#6c7663'],
};

/**
 * Supply-crate face: recessed centre panel, corner brackets, stencilled contents code, barcode
 * and a hazard corner flash. Painted so the crate reads as one of a fleet of identical boxes.
 */
export function buildCratePanelTexture(label: string, tone: 'steel' | 'bone' | 'olive' = 'steel'): THREE.CanvasTexture {
  const w = 256;
  const h = 256;
  const [canvas, ctx] = makeCanvas(w, h);
  const [base, inset, hi] = CRATE_TONES[tone];

  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, hi);
  g.addColorStop(0.14, base);
  g.addColorStop(1, inset);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Recessed centre panel with a lit top edge and a dark bottom edge — a painted bevel.
  ctx.fillStyle = inset;
  ctx.fillRect(24, 26, w - 48, h - 74);
  ctx.strokeStyle = 'rgba(10,12,15,0.55)';
  ctx.lineWidth = 3;
  ctx.strokeRect(24, 26, w - 48, h - 74);
  ctx.strokeStyle = 'rgba(226,222,212,0.28)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(25, 27);
  ctx.lineTo(w - 25, 27);
  ctx.stroke();

  // Corner brackets.
  ctx.fillStyle = '#3b434c';
  for (const [cx, cy, sx, sy] of [
    [0, 0, 1, 1],
    [w, 0, -1, 1],
    [0, h, 1, -1],
    [w, h, -1, -1],
  ] as const) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(sx, sy);
    ctx.fillRect(0, 0, 40, 12);
    ctx.fillRect(0, 0, 12, 40);
    ctx.restore();
  }

  // Contents stencil + barcode block.
  ctx.fillStyle = 'rgba(222,217,205,0.82)';
  ctx.font = 'bold 30px monospace';
  ctx.textBaseline = 'middle';
  stencilText(ctx, label, w / 2, 84, 3);

  ctx.font = 'bold 13px monospace';
  ctx.fillStyle = 'rgba(222,217,205,0.5)';
  stencilText(ctx, 'CONTENTS SEALED', w / 2, 112, 2);

  ctx.fillStyle = 'rgba(20,23,28,0.85)';
  ctx.fillRect(46, 136, 164, 34);
  for (let i = 0; i < 34; i++) {
    const bw = 1 + ((i * 7) % 3);
    ctx.fillStyle = 'rgba(216,212,202,0.75)';
    ctx.fillRect(52 + i * 4.6, 141, bw, 24);
  }

  // Hazard corner flash — small saturated accent, per the brief.
  ctx.save();
  ctx.beginPath();
  ctx.rect(w - 78, h - 46, 62, 22);
  ctx.clip();
  ctx.fillStyle = '#1a1710';
  ctx.fillRect(w - 78, h - 46, 62, 22);
  ctx.fillStyle = '#d8a63a';
  for (let i = -2; i < 8; i++) {
    ctx.save();
    ctx.translate(w - 78 + i * 14, h - 46);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-14, -20, 7, 60);
    ctx.restore();
  }
  ctx.restore();

  // Bottom kick band where the crate is dragged across deck plate.
  ctx.fillStyle = 'rgba(40,44,50,0.75)';
  ctx.fillRect(0, h - 22, w, 22);

  edgeScuffs(ctx, w, h, 44, 3);
  grimeGradient(ctx, w, h, 0.42);
  return finish(canvas);
}

/**
 * Locker / cabinet door: brushed steel, louvre vent stack at the top with drip streaks below it,
 * an engraved ID plate and a recessed handle shadow.
 */
export function buildLockerDoorTexture(label: string): THREE.CanvasTexture {
  const w = 256;
  const h = 512;
  const [canvas, ctx] = makeCanvas(w, h);

  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, '#8b939d');
  g.addColorStop(0.35, '#7a828c');
  g.addColorStop(0.85, '#69707a');
  g.addColorStop(1, '#565d66');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Vertical brushed grain.
  for (let x = 0; x < w; x += 2) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.035})`;
    ctx.fillRect(x, 0, 1, h);
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.045})`;
    ctx.fillRect(x + 1, 0, 1, h);
  }

  // Louvre vents — dark slot with a lit lower lip so each slat reads as pressed metal.
  for (let i = 0; i < 7; i++) {
    const y = 44 + i * 17;
    ctx.fillStyle = 'rgba(14,17,21,0.9)';
    ctx.fillRect(46, y, w - 92, 9);
    ctx.fillStyle = 'rgba(220,226,233,0.3)';
    ctx.fillRect(46, y + 9, w - 92, 2);
  }

  // Drip streaks below the vents — condensation runs, localised and motivated.
  for (let i = 0; i < 9; i++) {
    const x = 52 + Math.random() * (w - 104);
    const len = 30 + Math.random() * 150;
    const gg = ctx.createLinearGradient(0, 176, 0, 176 + len);
    gg.addColorStop(0, 'rgba(58,48,36,0.4)');
    gg.addColorStop(1, 'rgba(58,48,36,0)');
    ctx.fillStyle = gg;
    ctx.fillRect(x, 176, 1 + Math.random() * 2.5, len);
  }

  // Engraved ID plate.
  ctx.fillStyle = '#2a2f36';
  ctx.fillRect(52, 214, w - 104, 54);
  ctx.strokeStyle = 'rgba(226,222,212,0.22)';
  ctx.lineWidth = 2;
  ctx.strokeRect(52, 214, w - 104, 54);
  ctx.fillStyle = 'rgba(222,217,205,0.85)';
  ctx.font = 'bold 26px monospace';
  ctx.textBaseline = 'middle';
  stencilText(ctx, label, w / 2, 241, 4);

  // Recessed handle channel down the closing edge.
  ctx.fillStyle = 'rgba(12,15,18,0.72)';
  ctx.fillRect(w - 44, 296, 26, 118);
  ctx.fillStyle = 'rgba(226,232,238,0.24)';
  ctx.fillRect(w - 44, 296, 3, 118);

  // Kick band and chipped paint at the bottom corners.
  ctx.fillStyle = 'rgba(43,49,56,0.8)';
  ctx.fillRect(0, h - 46, w, 46);
  for (let i = 0; i < 26; i++) {
    const x = Math.random() < 0.5 ? Math.random() * 40 : w - Math.random() * 40;
    ctx.fillStyle = `rgba(150,116,72,${0.15 + Math.random() * 0.3})`;
    ctx.fillRect(x, h - 60 + Math.random() * 58, 1 + Math.random() * 5, 1 + Math.random() * 4);
  }

  edgeScuffs(ctx, w, h, 60, 11);
  grimeGradient(ctx, w, h, 0.5);
  return finish(canvas);
}

const CANISTER_COLORS: Record<string, [string, string]> = {
  o2: ['#4fd8f0', 'OXYGEN'],
  fuel: ['#d8a63a', 'FUEL H3'],
  coolant: ['#7f8fa8', 'COOLANT'],
};

/** Wrapped canister band: colour code stripe, hazard diamond and repeated contents text. */
export function buildCanisterLabelTexture(kind: 'o2' | 'fuel' | 'coolant'): THREE.CanvasTexture {
  const w = 256;
  const h = 64;
  const [canvas, ctx] = makeCanvas(w, h);
  const [accent, text] = CANISTER_COLORS[kind];

  ctx.fillStyle = '#2c323a';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(0, 0, w, 9);
  ctx.fillRect(0, h - 9, w, 9);
  ctx.globalAlpha = 1;

  ctx.fillStyle = 'rgba(226,222,212,0.85)';
  ctx.font = 'bold 17px monospace';
  ctx.textBaseline = 'middle';
  stencilText(ctx, text, w * 0.32, h / 2, 2);

  // Hazard diamond.
  ctx.save();
  ctx.translate(w * 0.76, h / 2);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = '#d8a63a';
  ctx.fillRect(-14, -14, 28, 28);
  ctx.fillStyle = '#1a1710';
  ctx.fillRect(-9, -9, 18, 18);
  ctx.restore();

  edgeScuffs(ctx, w, h, 18, 7);
  const tex = finish(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

/** Small cool readout for wall panels and equipment faces — the brief's cyan accent. */
export function buildReadoutTexture(seed = 0): THREE.CanvasTexture {
  const w = 256;
  const h = 128;
  const [canvas, ctx] = makeCanvas(w, h);

  ctx.fillStyle = '#061820';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(79,216,240,0.12)';
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 12) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += 12) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Bar graph column.
  for (let i = 0; i < 9; i++) {
    const v = 0.2 + Math.abs(Math.sin(i * 1.7 + seed)) * 0.72;
    ctx.fillStyle = i === 6 ? 'rgba(224,85,47,0.85)' : 'rgba(79,216,240,0.7)';
    ctx.fillRect(14 + i * 13, h - 16 - v * 74, 8, v * 74);
  }

  // Trace line.
  ctx.strokeStyle = 'rgba(168,240,255,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= 24; i++) {
    const x = 140 + i * 4.6;
    const y = 48 + Math.sin(i * 0.8 + seed * 2) * 16 + Math.sin(i * 2.3) * 5;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.fillStyle = 'rgba(168,240,255,0.75)';
  ctx.font = 'bold 12px monospace';
  ctx.textBaseline = 'middle';
  stencilText(ctx, 'SYS NOMINAL', w * 0.72, 92, 1);
  stencilText(ctx, `CH-0${(seed % 8) + 1}`, w * 0.72, 110, 1);

  // Scanline darkening keeps the emissive from reading as flat paint.
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);

  return finish(canvas);
}

/** Perforated tool board with hung-tool silhouettes — the workbench's secondary detail layer. */
export function buildToolBoardTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = 256;
  const [canvas, ctx] = makeCanvas(w, h);

  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#6c737d');
  g.addColorStop(1, '#4c535c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Peg perforations.
  for (let y = 12; y < h - 8; y += 18) {
    for (let x = 12; x < w - 8; x += 18) {
      ctx.fillStyle = 'rgba(12,15,19,0.75)';
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(220,226,233,0.14)';
      ctx.beginPath();
      ctx.arc(x, y + 3.4, 3, 0, Math.PI * 0.9);
      ctx.fill();
    }
  }

  const dark = 'rgba(16,19,24,0.88)';

  // Wrenches.
  for (let i = 0; i < 5; i++) {
    const x = 40 + i * 34;
    const len = 96 + (i % 3) * 22;
    ctx.fillStyle = dark;
    ctx.fillRect(x - 4, 40, 8, len);
    ctx.beginPath();
    ctx.arc(x, 40, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(108,115,125,0.9)';
    ctx.beginPath();
    ctx.arc(x, 38, 5.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Screwdrivers with amber handles.
  for (let i = 0; i < 6; i++) {
    const x = 236 + i * 20;
    ctx.fillStyle = dark;
    ctx.fillRect(x - 2, 46, 4, 74);
    ctx.fillStyle = 'rgba(216,166,58,0.9)';
    ctx.fillRect(x - 5, 34, 10, 24);
  }

  // Coiled hose loop and a clipboard.
  ctx.strokeStyle = dark;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(400, 84, 34, 0.2, Math.PI * 1.85);
  ctx.stroke();
  ctx.fillStyle = 'rgba(198,190,175,0.85)';
  ctx.fillRect(452, 42, 44, 60);
  ctx.fillStyle = 'rgba(70,76,84,0.9)';
  ctx.fillRect(452, 42, 44, 9);
  ctx.fillStyle = 'rgba(70,76,84,0.5)';
  for (let i = 0; i < 5; i++) ctx.fillRect(458, 60 + i * 8, 32, 2);

  // Parts bins along the bottom rail.
  for (let i = 0; i < 8; i++) {
    const x = 24 + i * 60;
    ctx.fillStyle = i % 3 === 0 ? 'rgba(160,86,50,0.85)' : 'rgba(84,92,102,0.9)';
    ctx.fillRect(x, 178, 50, 44);
    ctx.fillStyle = 'rgba(14,17,21,0.6)';
    ctx.fillRect(x, 178, 50, 8);
    ctx.fillStyle = 'rgba(226,222,212,0.35)';
    ctx.fillRect(x + 8, 196, 34, 3);
  }

  grimeGradient(ctx, w, h, 0.4);
  edgeScuffs(ctx, w, h, 40, 5);
  return finish(canvas);
}

/** Rack-unit face: vent slot field, a couple of port rows and a small label strip. */
export function buildRackUnitTexture(label: string): THREE.CanvasTexture {
  const w = 256;
  const h = 64;
  const [canvas, ctx] = makeCanvas(w, h);

  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#5c646e');
  g.addColorStop(0.5, '#4b525b');
  g.addColorStop(1, '#3a4148');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Honeycomb-ish vent field.
  for (let y = 10; y < h - 8; y += 7) {
    for (let x = 78; x < w - 46; x += 7) {
      ctx.fillStyle = 'rgba(10,12,16,0.85)';
      ctx.fillRect(x + ((y / 7) % 2) * 3.5, y, 4, 4);
    }
  }

  // Port row.
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = 'rgba(12,14,18,0.9)';
    ctx.fillRect(12 + i * 10, 14, 7, 12);
    ctx.fillStyle = 'rgba(226,232,238,0.2)';
    ctx.fillRect(12 + i * 10, 26, 7, 1.5);
  }

  ctx.fillStyle = 'rgba(216,212,202,0.7)';
  ctx.font = 'bold 12px monospace';
  ctx.textBaseline = 'middle';
  stencilText(ctx, label, 42, 44, 1);

  // Status pips at the right edge.
  const pips = ['#4fd8f0', '#4fd8f0', '#d8a63a', '#4fd8f0'];
  for (let i = 0; i < pips.length; i++) {
    ctx.fillStyle = pips[i];
    ctx.fillRect(w - 34, 12 + i * 11, 14, 5);
  }

  edgeScuffs(ctx, w, h, 12, 2);
  return finish(canvas);
}

// ===========================================================================================
// material-response layer: tiling detail / roughness / normal sets, plus decal maps
// ===========================================================================================

/** Soft grey blob, redrawn across the tile edges so the noise field stays seamless. */
function blob(c: CanvasRenderingContext2D, w: number, h: number, x: number, y: number, r: number, v: number, a: number): void {
  for (const ox of [0, -w, w]) {
    for (const oy of [0, -h, h]) {
      const px = x + ox;
      const py = y + oy;
      if (px + r < 0 || px - r > w || py + r < 0 || py - r > h) continue;
      const g = c.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, `rgba(${v},${v},${v},${a})`);
      g.addColorStop(1, `rgba(${v},${v},${v},0)`);
      c.fillStyle = g;
      c.fillRect(px - r, py - r, r * 2, r * 2);
    }
  }
}

/**
 * Sobel height to tangent-space normal. Micro-relief is what separates a brushed steel flange
 * from a rubber caster at grazing angles; a flat normal makes every material read as the same
 * moulded plastic no matter what its roughness value says.
 */
function normalFromHeight(height: HTMLCanvasElement, strength: number): HTMLCanvasElement {
  const w = height.width;
  const h = height.height;
  const src = height.getContext('2d')!.getImageData(0, 0, w, h).data;
  const [out, octx] = makeCanvas(w, h);
  const img = octx.createImageData(w, h);
  const at = (x: number, y: number) => src[((((y % h) + h) % h) * w + (((x % w) + w) % w)) * 4] / 255;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (at(x - 1, y) - at(x + 1, y)) * strength;
      const ny = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(nx, ny, 1);
      const i = (y * w + x) * 4;
      img.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / len) * 127.5 + 127.5;
      img.data[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

export type SurfaceKind = 'paint' | 'steel' | 'brushed' | 'rubber' | 'galv' | 'composite';

export interface SurfaceSet {
  map: THREE.Texture;
  roughnessMap: THREE.Texture;
  normalMap: THREE.Texture;
  normalScale: number;
}

const surfaceCache = new Map<string, SurfaceSet>();

/**
 * One tiling detail set per material family. The albedo layer stays close to white so it
 * modulates the material base colour rather than replacing it, but its mean sits a little
 * under 1.0 — flat maximum-value albedo is what pushes prop highlights past the reference.
 *
 * The three channels are authored to disagree on purpose: paint has broad low-frequency
 * roughness variation and almost no relief, brushed steel has near-zero albedo variation but
 * strong directional roughness streaks, rubber is uniformly matte with heavy fine relief.
 */
export function buildSurfaceSet(kind: SurfaceKind, repeat = 3): SurfaceSet {
  const key = `${kind}|${repeat}`;
  const hit = surfaceCache.get(key);
  if (hit) return hit;

  const s = 256;
  const [albedo, ac] = makeCanvas(s, s);
  const [rough, rc] = makeCanvas(s, s);
  const [height, hc] = makeCanvas(s, s);
  let normalStrength = 6;
  let normalScale = 0.5;

  switch (kind) {
    case 'paint': {
      // Sprayed enamel: orange-peel mottle, chalked patches, and rub-polished spots where a
      // hand or a shoulder repeatedly passes — those read shinier than the paint around them.
      ac.fillStyle = '#e8e6e2';
      ac.fillRect(0, 0, s, s);
      for (let i = 0; i < 90; i++) blob(ac, s, s, Math.random() * s, Math.random() * s, 10 + Math.random() * 44, 200 + Math.random() * 46, 0.16);
      for (let i = 0; i < 260; i++) {
        ac.fillStyle = `rgba(150,142,130,${0.05 + Math.random() * 0.16})`;
        ac.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 3, 1 + Math.random() * 2);
      }

      rc.fillStyle = '#f2f2f2';
      rc.fillRect(0, 0, s, s);
      for (let i = 0; i < 40; i++) blob(rc, s, s, Math.random() * s, Math.random() * s, 18 + Math.random() * 52, 120 + Math.random() * 60, 0.5);
      for (let i = 0; i < 130; i++) {
        rc.fillStyle = `rgba(255,255,255,${0.1 + Math.random() * 0.2})`;
        rc.fillRect(Math.random() * s, Math.random() * s, 2 + Math.random() * 8, 1 + Math.random() * 2);
      }

      hc.fillStyle = '#808080';
      hc.fillRect(0, 0, s, s);
      for (let i = 0; i < 120; i++) blob(hc, s, s, Math.random() * s, Math.random() * s, 4 + Math.random() * 12, 100 + Math.random() * 110, 0.5);
      normalStrength = 4;
      normalScale = 0.35;
      break;
    }
    case 'steel':
    case 'brushed': {
      // Rolled / brushed plate: the albedo barely moves, all the character is in directional
      // roughness. Grain runs along U so it catches a travelling highlight, not a flat sheen.
      ac.fillStyle = '#efefef';
      ac.fillRect(0, 0, s, s);
      for (let y = 0; y < s; y++) {
        const cr = (190 + Math.random() * 60) | 0;
        ac.fillStyle = `rgba(${cr},${cr + 2},${cr + 6},${0.06 + Math.random() * 0.1})`;
        ac.fillRect(0, y, s, 1);
      }
      for (let i = 0; i < 26; i++) blob(ac, s, s, Math.random() * s, Math.random() * s, 12 + Math.random() * 40, 176 + Math.random() * 50, 0.12);

      rc.fillStyle = '#e2e2e2';
      rc.fillRect(0, 0, s, s);
      for (let i = 0; i < 460; i++) {
        const y = Math.random() * s;
        rc.fillStyle = Math.random() < 0.5
          ? `rgba(255,255,255,${0.08 + Math.random() * 0.28})`
          : `rgba(110,110,110,${0.06 + Math.random() * 0.22})`;
        rc.fillRect(Math.random() * s, y, 20 + Math.random() * 190, 1);
      }
      for (let i = 0; i < 22; i++) blob(rc, s, s, Math.random() * s, Math.random() * s, 16 + Math.random() * 46, 150 + Math.random() * 70, 0.4);

      hc.fillStyle = '#808080';
      hc.fillRect(0, 0, s, s);
      for (let i = 0; i < 420; i++) {
        const y = Math.random() * s;
        hc.fillStyle = Math.random() < 0.5 ? 'rgba(210,210,210,0.14)' : 'rgba(40,40,40,0.14)';
        hc.fillRect(Math.random() * s, y, 24 + Math.random() * 200, 1);
      }
      normalStrength = kind === 'brushed' ? 7 : 5;
      normalScale = kind === 'brushed' ? 0.5 : 0.38;
      break;
    }
    case 'rubber': {
      // Moulded rubber: dead matte, no specular story at all — only dense fine pebbling.
      ac.fillStyle = '#dedede';
      ac.fillRect(0, 0, s, s);
      for (let i = 0; i < 2600; i++) {
        const cr = (140 + Math.random() * 90) | 0;
        ac.fillStyle = `rgba(${cr},${cr},${cr + 2},0.3)`;
        ac.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 1 + Math.random() * 2);
      }

      rc.fillStyle = '#fbfbfb';
      rc.fillRect(0, 0, s, s);
      for (let i = 0; i < 900; i++) {
        rc.fillStyle = `rgba(228,228,228,${0.1 + Math.random() * 0.14})`;
        rc.fillRect(Math.random() * s, Math.random() * s, 2 + Math.random() * 4, 2 + Math.random() * 4);
      }

      hc.fillStyle = '#808080';
      hc.fillRect(0, 0, s, s);
      for (let i = 0; i < 2200; i++) {
        const v = Math.random() < 0.5 ? 40 : 220;
        hc.fillStyle = `rgba(${v},${v},${v},0.4)`;
        hc.beginPath();
        hc.arc(Math.random() * s, Math.random() * s, 1 + Math.random() * 2.4, 0, Math.PI * 2);
        hc.fill();
      }
      normalStrength = 9;
      normalScale = 0.75;
      break;
    }
    case 'galv': {
      // Hot-dip galvanised: crystalline spangle. Each crystal carries its own roughness, so the
      // surface breaks into facets under a moving light instead of holding one flat sheen.
      ac.fillStyle = '#e6e8ea';
      ac.fillRect(0, 0, s, s);
      rc.fillStyle = '#dcdcdc';
      rc.fillRect(0, 0, s, s);
      hc.fillStyle = '#808080';
      hc.fillRect(0, 0, s, s);
      const layers: [CanvasRenderingContext2D, number, number][] = [];
      for (let i = 0; i < 150; i++) {
        const x = Math.random() * s;
        const y = Math.random() * s;
        const r = 5 + Math.random() * 20;
        const rot = Math.random() * Math.PI;
        layers.length = 0;
        layers.push([ac, 196 + Math.random() * 52, 0.35]);
        layers.push([rc, 130 + Math.random() * 118, 0.6]);
        layers.push([hc, 90 + Math.random() * 130, 0.45]);
        for (const [c, v, a] of layers) {
          for (const ox of [0, -s, s]) {
            for (const oy of [0, -s, s]) {
              if (x + ox + r < 0 || x + ox - r > s || y + oy + r < 0 || y + oy - r > s) continue;
              c.save();
              c.translate(x + ox, y + oy);
              c.rotate(rot);
              c.fillStyle = `rgba(${v | 0},${v | 0},${v | 0},${a})`;
              c.beginPath();
              for (let p = 0; p < 6; p++) {
                const ang = (p / 6) * Math.PI * 2;
                const rr = r * (0.62 + ((p * 37 + i * 11) % 40) / 80);
                if (p === 0) c.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
                else c.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
              }
              c.closePath();
              c.fill();
              c.restore();
            }
          }
        }
      }
      normalStrength = 5;
      normalScale = 0.4;
      break;
    }
    default: {
      // Worn composite / phenolic: fibrous, thirsty, almost no specular but a lot of relief.
      ac.fillStyle = '#e0dcd6';
      ac.fillRect(0, 0, s, s);
      for (let i = 0; i < 700; i++) {
        ac.save();
        ac.translate(Math.random() * s, Math.random() * s);
        ac.rotate(Math.random() * Math.PI);
        const cr = (150 + Math.random() * 80) | 0;
        ac.fillStyle = `rgba(${cr},${cr - 4},${cr - 12},${0.08 + Math.random() * 0.16})`;
        ac.fillRect(-12, 0, 8 + Math.random() * 26, 1 + Math.random() * 1.5);
        ac.restore();
      }
      rc.fillStyle = '#f6f6f6';
      rc.fillRect(0, 0, s, s);
      for (let i = 0; i < 60; i++) blob(rc, s, s, Math.random() * s, Math.random() * s, 14 + Math.random() * 40, 170 + Math.random() * 60, 0.4);

      hc.fillStyle = '#808080';
      hc.fillRect(0, 0, s, s);
      for (let i = 0; i < 900; i++) {
        hc.save();
        hc.translate(Math.random() * s, Math.random() * s);
        hc.rotate(Math.random() * Math.PI);
        const v = Math.random() < 0.5 ? 50 : 210;
        hc.fillStyle = `rgba(${v},${v},${v},0.22)`;
        hc.fillRect(-10, 0, 8 + Math.random() * 24, 1.4);
        hc.restore();
      }
      normalStrength = 8;
      normalScale = 0.6;
      break;
    }
  }

  const mapTex = finishData(albedo, repeat);
  mapTex.colorSpace = THREE.SRGBColorSpace;
  const set: SurfaceSet = {
    map: mapTex,
    roughnessMap: finishData(rough, repeat),
    normalMap: finishData(normalFromHeight(height, normalStrength), repeat),
    normalScale,
  };
  surfaceCache.set(key, set);
  return set;
}

/** Wires a surface set onto a material, keeping the material colour as the base tint. */
export function applySurface(mat: THREE.MeshStandardMaterial, kind: SurfaceKind, repeat = 3): void {
  const set = buildSurfaceSet(kind, repeat);
  mat.map = set.map;
  mat.roughnessMap = set.roughnessMap;
  mat.normalMap = set.normalMap;
  mat.normalScale = new THREE.Vector2(set.normalScale, set.normalScale);
  mat.needsUpdate = true;
}

let contactShadowTex: THREE.CanvasTexture | null = null;

/**
 * Baked contact-occlusion blob laid on the deck under a prop. The single shadow-casting key
 * light cannot ground fifty props on its own, and an ungrounded prop is the loudest tell that a
 * set was assembled rather than lit: the eye reads floating even when it cannot say why.
 * White at the quad edge, so multiply blending leaves the surrounding deck untouched.
 */
export function buildContactShadowTexture(): THREE.CanvasTexture {
  if (contactShadowTex) return contactShadowTex;
  const s = 128;
  const [canvas, ctx] = makeCanvas(s, s);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, s, s);

  // Authored against the *linear* multiplier, not the sRGB number: #8d9298 looks like a mid grey
  // but multiplies the deck by 0.28, which is already a firm contact shadow. Reading these as
  // sRGB is how a soft AO blob turns into a black halo and buries the shadow end of the range.
  // The prop footprint lands near stop 0.54, so the tight core sits just inside it and the
  // penumbra is fully recovered by 0.9. This is the one directional-falloff cue every floor prop
  // gets under the room's single flat key light, so the core is kept deep enough to read as a
  // real footprint rather than a faint AO smudge.
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, '#1f2226');
  g.addColorStop(0.45, '#2c3036');
  g.addColorStop(0.56, '#6c7178');
  g.addColorStop(0.7, '#b6babe');
  g.addColorStop(0.88, '#e6e8ea');
  g.addColorStop(1, '#ffffff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);

  // A little grit tracked out from under the prop — a contact edge is never perfectly clean.
  for (let i = 0; i < 120; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = s * (0.3 + Math.random() * 0.2);
    ctx.fillStyle = `rgba(150,154,160,${0.1 + Math.random() * 0.2})`;
    ctx.beginPath();
    ctx.arc(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r, 1 + Math.random() * 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  contactShadowTex = finish(canvas);
  contactShadowTex.wrapS = THREE.ClampToEdgeWrapping;
  contactShadowTex.wrapT = THREE.ClampToEdgeWrapping;
  return contactShadowTex;
}

const streakCache = new Map<number, THREE.CanvasTexture>();

/**
 * Drip / corrosion streak decal for a wall face. Multiply-blended and white where it should do
 * nothing, so it only darkens where a fluid actually ran. Variants differ in tint: 0 is oily
 * grey-black under a joint, 1 is rust-brown under a valve, 2 is pale scale under a vent.
 */
export function buildStreakTexture(variant = 0): THREE.CanvasTexture {
  const hit = streakCache.get(variant);
  if (hit) return hit;
  const w = 128;
  const h = 256;
  const [canvas, ctx] = makeCanvas(w, h);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);

  // Same linear-multiply caution as the contact blob: these tints look far too light as swatches
  // and land as convincing stains once multiplied. A "realistic" dark oil brown here would punch
  // a hole clean through the wall's value range.
  const [tr, tg, tb] = [
    [108, 112, 120],
    [140, 88, 50],
    [172, 168, 152],
  ][variant % 3];

  // Wet pooling right at the source, then runs that thin out and fade as they travel.
  const src = ctx.createRadialGradient(w / 2, 10, 2, w / 2, 10, 46);
  src.addColorStop(0, `rgba(${tr},${tg},${tb},0.45)`);
  src.addColorStop(1, `rgba(${tr},${tg},${tb},0)`);
  ctx.fillStyle = src;
  ctx.fillRect(0, 0, w, 70);

  for (let i = 0; i < 22; i++) {
    const x = 12 + Math.random() * (w - 24);
    const len = h * (0.18 + Math.random() * 0.72);
    const wide = 0.8 + Math.random() * 3.4;
    const g = ctx.createLinearGradient(0, 4, 0, 4 + len);
    g.addColorStop(0, `rgba(${tr},${tg},${tb},${0.18 + Math.random() * 0.26})`);
    g.addColorStop(0.55, `rgba(${tr},${tg},${tb},${0.08 + Math.random() * 0.12})`);
    g.addColorStop(1, `rgba(${tr},${tg},${tb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x, 4, wide, len);
    // Beaded tail where a drip stalled and dried.
    ctx.fillStyle = `rgba(${tr},${tg},${tb},${0.1 + Math.random() * 0.14})`;
    ctx.beginPath();
    ctx.ellipse(x + wide / 2, 4 + len * 0.92, wide * 1.6, wide * 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Feather the side edges so the decal has no visible boundary against clean wall.
  const edge = ctx.createLinearGradient(0, 0, w, 0);
  edge.addColorStop(0, 'rgba(255,255,255,1)');
  edge.addColorStop(0.16, 'rgba(255,255,255,0)');
  edge.addColorStop(0.84, 'rgba(255,255,255,0)');
  edge.addColorStop(1, 'rgba(255,255,255,1)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, w, h);

  const tex = finish(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  streakCache.set(variant, tex);
  return tex;
}

const floorGrimeCache = new Map<number, THREE.CanvasTexture>();

/**
 * Organic floor stain — spilled fluid, foot-polished sheen, mineral scale — for scattering flat
 * across the deck. Unlike `buildStreakTexture` (a directional run for a vertical wall face under
 * a leak), this pools and dries in place: several overlapping off-centre blobs instead of one
 * gravity-fed line, feathered to a soft irregular edge so it reads as ground-in wear rather than a
 * painted circle. Variant 0 is dark oily grime, 1 is pale mineral scale, 2 is a faint traffic
 * sheen — mixing the three across a floor breaks up what would otherwise be one uniform tint.
 */
export function buildFloorGrimeTexture(variant = 0): THREE.CanvasTexture {
  const hit = floorGrimeCache.get(variant);
  if (hit) return hit;
  const s = 256;
  const [canvas, ctx] = makeCanvas(s, s);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, s, s);

  const [tr, tg, tb, coreA] = [
    [24, 22, 19, 0.48],
    [150, 140, 116, 0.32],
    [40, 43, 47, 0.2],
  ][variant % 3];

  for (let i = 0; i < 5; i++) {
    const cx = s * (0.32 + Math.random() * 0.36);
    const cy = s * (0.32 + Math.random() * 0.36);
    const r = s * (0.16 + Math.random() * 0.2);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(${tr},${tg},${tb},${coreA})`);
    g.addColorStop(0.6, `rgba(${tr},${tg},${tb},${coreA * 0.5})`);
    g.addColorStop(1, `rgba(${tr},${tg},${tb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  }

  // Fine speckle so the stain isn't a smooth airbrushed gradient up close.
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = `rgba(${tr},${tg},${tb},${0.03 + Math.random() * 0.1})`;
    ctx.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }

  // Feather the whole border back to white (a no-op under multiply blending) so the decal has no
  // visible boundary against clean deck, same convention as the streak texture's edge feather.
  const edge = ctx.createRadialGradient(s / 2, s / 2, s * 0.24, s / 2, s / 2, s * 0.5);
  edge.addColorStop(0, 'rgba(255,255,255,0)');
  edge.addColorStop(1, 'rgba(255,255,255,1)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, s, s);

  const tex = finish(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  floorGrimeCache.set(variant, tex);
  return tex;
}
