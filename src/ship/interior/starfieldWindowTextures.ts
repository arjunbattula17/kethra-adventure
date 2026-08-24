import * as THREE from 'three';

// Procedural canvases owned by the forward viewport bay: the space seen through the glass, the
// glass surface itself, the localised corrosion under the sill, and the small lit inserts
// (LED banks, sill readouts) that give the frame its accent colour.

/** Deterministic PRNG (mulberry32) so each canvas is identical between builds and review rounds. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function surface(w: number, h: number): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas.getContext('2d')!;
}

function finish(c: CanvasRenderingContext2D, repeatX = false): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (repeatX) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
  }
  return tex;
}

/** A tiling colour map. */
function finishTiled(c: CanvasRenderingContext2D): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/** A tiling data map (roughness / normal) — never colour-managed. */
function finishData(c: CanvasRenderingContext2D): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c.canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/**
 * Sobel-differentiates a greyscale height canvas into a tangent-space normal map. Real geometric
 * relief on seams, rivets and chip edges is what lets a grazing key break into a highlight —
 * without it every plate returns the same flat lambert response no matter what colour it is.
 */
function normalFromHeight(h: CanvasRenderingContext2D, strength: number): THREE.CanvasTexture {
  const w = h.canvas.width;
  const ht = h.canvas.height;
  const src = h.getImageData(0, 0, w, ht).data;
  const out = surface(w, ht);
  const img = out.createImageData(w, ht);
  const d = img.data;
  const at = (x: number, y: number): number =>
    src[((((y % ht) + ht) % ht) * w + (((x % w) + w) % w)) * 4];
  for (let y = 0; y < ht; y++) {
    for (let x = 0; x < w; x++) {
      const dx = ((at(x + 1, y) - at(x - 1, y)) / 255) * strength;
      const dy = ((at(x, y + 1) - at(x, y - 1)) / 255) * strength;
      const nx = -dx;
      const ny = dy;
      const len = Math.hypot(nx, ny, 1);
      const i = (y * w + x) * 4;
      d[i] = ((nx / len) * 0.5 + 0.5) * 255;
      d[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      d[i + 2] = (1 / len) * 0.5 * 255 + 127.5;
      d[i + 3] = 255;
    }
  }
  out.putImageData(img, 0, 0);
  return finishData(out);
}

/** Per-pixel micro noise, added straight into a data canvas. */
function speckle(c: CanvasRenderingContext2D, rnd: () => number, amount: number): void {
  const w = c.canvas.width;
  const h = c.canvas.height;
  const img = c.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * 2 * amount;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = d[i];
    d[i + 2] = d[i];
  }
  c.putImageData(img, 0, 0);
}

const rgb = (v: [number, number, number], a = 1): string => `rgba(${v[0]},${v[1]},${v[2]},${a})`;
const jitterRgb = (v: [number, number, number], k: number): string =>
  `rgb(${Math.round(v[0] + k)},${Math.round(v[1] + k)},${Math.round(v[2] + k)})`;

export interface PlateMaps {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
}

export interface PlateOptions {
  seed: number;
  res?: number;
  /** Painted / finished top coat. */
  base: [number, number, number];
  /** Substrate revealed wherever the top coat has failed. */
  under: [number, number, number];
  cols: number;
  rows: number;
  rivets?: boolean;
  /** 0..1 — how much of each plate edge has chipped back to substrate. */
  chip?: number;
  /** 0..1 — grime pooling in seams and running down from them. */
  grime?: number;
  scratch?: number;
  streaks?: number;
  /** Roughness of the intact coat and of worn/corroded areas, 0..255. */
  roughBase?: number;
  roughWorn?: number;
  /** Directional grind marks, for rolled or machined stock rather than paint. */
  brushed?: boolean;
}

/**
 * One bolted plate field, authored as three co-registered channels so albedo, roughness and
 * relief all agree: a seam is a dark line in colour, a rough line in specular *and* a groove in
 * relief. Wear is placed where use puts it — chipping starts at plate edges and rivets, grime
 * pools in the seams and runs downward out of them, scratches follow the working direction.
 */
export function buildPlateMaps(o: PlateOptions): PlateMaps {
  const size = o.res ?? 512;
  const rnd = rng(o.seed);
  const alb = surface(size, size);
  const rgh = surface(size, size);
  const hgt = surface(size, size);
  const chip = o.chip ?? 0.5;
  const grime = o.grime ?? 0.5;
  const roughBase = o.roughBase ?? 150;
  const roughWorn = o.roughWorn ?? 215;

  alb.fillStyle = rgb(o.base);
  alb.fillRect(0, 0, size, size);
  rgh.fillStyle = `rgb(${roughBase},${roughBase},${roughBase})`;
  rgh.fillRect(0, 0, size, size);
  hgt.fillStyle = 'rgb(150,150,150)';
  hgt.fillRect(0, 0, size, size);

  const cw = size / o.cols;
  const ch = size / o.rows;

  // Plate-to-plate variation: adjacent plates were painted in different batches and have taken
  // different amounts of sun, so no two read as exactly the same value.
  for (let cx = 0; cx < o.cols; cx++) {
    for (let cy = 0; cy < o.rows; cy++) {
      const k = (rnd() - 0.5) * 20;
      alb.fillStyle = jitterRgb(o.base, k);
      alb.fillRect(cx * cw, cy * ch, cw, ch);
      const r = roughBase + (rnd() - 0.5) * 26;
      rgh.fillStyle = `rgb(${r | 0},${r | 0},${r | 0})`;
      rgh.fillRect(cx * cw, cy * ch, cw, ch);
      const hz = 150 + (rnd() - 0.5) * 8;
      hgt.fillStyle = `rgb(${hz | 0},${hz | 0},${hz | 0})`;
      hgt.fillRect(cx * cw, cy * ch, cw, ch);
    }
  }

  // Broad mottling — the single biggest cure for "one uniform roughness". Patches of dulled and
  // of burnished finish drift across the plates independently of the colour.
  for (let i = 0; i < 70; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = 26 + rnd() * 130;
    const dark = rnd() < 0.55;
    const ga = alb.createRadialGradient(x, y, 0, x, y, r);
    ga.addColorStop(0, dark ? 'rgba(24,24,26,0.10)' : 'rgba(236,240,246,0.07)');
    ga.addColorStop(1, 'rgba(0,0,0,0)');
    alb.fillStyle = ga;
    alb.fillRect(x - r, y - r, r * 2, r * 2);

    const gr = rgh.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, dark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.20)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    rgh.fillStyle = gr;
    rgh.fillRect(x - r, y - r, r * 2, r * 2);
  }

  if (o.brushed) {
    for (let i = 0; i < 900; i++) {
      const y = rnd() * size;
      const x = rnd() * size;
      const len = 40 + rnd() * 260;
      const a = 0.03 + rnd() * 0.07;
      alb.fillStyle = rnd() < 0.5 ? `rgba(255,255,255,${a * 0.5})` : `rgba(0,0,0,${a * 0.5})`;
      alb.fillRect(x, y, len, 1);
      rgh.fillStyle = rnd() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
      rgh.fillRect(x, y, len, 1);
    }
  }

  // Seams. Groove in relief, grime line in colour, rough line in specular, with a proud lip on
  // the upper side of every horizontal run where the plate above laps over.
  const seamLine = (x0: number, y0: number, x1: number, y1: number, horizontal: boolean): void => {
    alb.strokeStyle = 'rgba(14,15,17,0.68)';
    alb.lineWidth = 3.2;
    alb.beginPath(); alb.moveTo(x0, y0); alb.lineTo(x1, y1); alb.stroke();
    alb.strokeStyle = 'rgba(190,196,206,0.16)';
    alb.lineWidth = 1;
    alb.beginPath();
    alb.moveTo(x0 + (horizontal ? 0 : 2.4), y0 + (horizontal ? -2.4 : 0));
    alb.lineTo(x1 + (horizontal ? 0 : 2.4), y1 + (horizontal ? -2.4 : 0));
    alb.stroke();

    rgh.strokeStyle = 'rgba(255,255,255,0.55)';
    rgh.lineWidth = 4;
    rgh.beginPath(); rgh.moveTo(x0, y0); rgh.lineTo(x1, y1); rgh.stroke();

    hgt.strokeStyle = 'rgb(88,88,88)';
    hgt.lineWidth = 3.4;
    hgt.beginPath(); hgt.moveTo(x0, y0); hgt.lineTo(x1, y1); hgt.stroke();
    hgt.strokeStyle = 'rgb(196,196,196)';
    hgt.lineWidth = 1.6;
    hgt.beginPath();
    hgt.moveTo(x0 + (horizontal ? 0 : 3), y0 + (horizontal ? -3 : 0));
    hgt.lineTo(x1 + (horizontal ? 0 : 3), y1 + (horizontal ? -3 : 0));
    hgt.stroke();
  };
  for (let i = 0; i <= o.cols; i++) seamLine(i * cw, 0, i * cw, size, false);
  for (let i = 0; i <= o.rows; i++) seamLine(0, i * ch, size, i * ch, true);

  // Rivets along the seams: a proud dome, a polished (smoother) crown, a dark shadow ring.
  const rivetAt: [number, number][] = [];
  if (o.rivets) {
    const step = 26;
    for (let i = 0; i <= o.cols; i++) {
      for (let y = step / 2; y < size; y += step) rivetAt.push([i * cw, y]);
    }
    for (let i = 0; i <= o.rows; i++) {
      for (let x = step / 2; x < size; x += step) rivetAt.push([x, i * ch]);
    }
    for (const [x, y] of rivetAt) {
      const r = 2.6 + rnd() * 0.9;
      alb.fillStyle = 'rgba(8,9,11,0.5)';
      alb.beginPath(); alb.arc(x, y + 0.8, r + 0.9, 0, Math.PI * 2); alb.fill();
      alb.fillStyle = jitterRgb(o.base, 16 + rnd() * 10);
      alb.beginPath(); alb.arc(x, y, r, 0, Math.PI * 2); alb.fill();
      alb.fillStyle = 'rgba(226,232,240,0.30)';
      alb.beginPath(); alb.arc(x - r * 0.3, y - r * 0.35, r * 0.45, 0, Math.PI * 2); alb.fill();

      rgh.fillStyle = `rgba(0,0,0,${0.35 + rnd() * 0.2})`;
      rgh.beginPath(); rgh.arc(x, y, r, 0, Math.PI * 2); rgh.fill();

      const gh = hgt.createRadialGradient(x, y, 0, x, y, r + 1.2);
      gh.addColorStop(0, 'rgb(228,228,228)');
      gh.addColorStop(0.7, 'rgb(178,178,178)');
      gh.addColorStop(1, 'rgb(120,120,120)');
      hgt.fillStyle = gh;
      hgt.beginPath(); hgt.arc(x, y, r + 1.2, 0, Math.PI * 2); hgt.fill();
    }
  }

  // Edge chipping. Paint fails at the plate borders and around fasteners first, never in the
  // middle of a panel — so every chip is seeded on a seam or a rivet and eats inward.
  const chipCount = Math.round(chip * 190);
  for (let i = 0; i < chipCount; i++) {
    const onRivet = rivetAt.length > 0 && rnd() < 0.35;
    let x: number;
    let y: number;
    if (onRivet) {
      const [rx, ry] = rivetAt[(rnd() * rivetAt.length) | 0];
      x = rx + (rnd() - 0.5) * 12;
      y = ry + (rnd() - 0.5) * 12;
    } else if (rnd() < 0.5) {
      x = Math.round(rnd() * o.cols) * cw + (rnd() - 0.5) * 16;
      y = rnd() * size;
    } else {
      x = rnd() * size;
      y = Math.round(rnd() * o.rows) * ch + (rnd() - 0.5) * 16;
    }
    const r = 1.6 + rnd() * 7;
    const pts = 5 + ((rnd() * 4) | 0);
    const path = new Path2D();
    for (let p = 0; p < pts; p++) {
      const a = (p / pts) * Math.PI * 2;
      const rr = r * (0.45 + rnd() * 0.75);
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr;
      if (p === 0) path.moveTo(px, py); else path.lineTo(px, py);
    }
    path.closePath();
    alb.fillStyle = rgb(o.under, 0.82);
    alb.fill(path);
    alb.strokeStyle = 'rgba(10,10,12,0.45)';
    alb.lineWidth = 1;
    alb.stroke(path);
    rgh.fillStyle = `rgba(255,255,255,${((roughWorn - roughBase) / 255) * 0.9 + 0.15})`;
    rgh.fill(path);
    hgt.fillStyle = 'rgb(126,126,126)';
    hgt.fill(path);
  }

  // Scratches: bare metal cut through the coat, so they are *brighter* and *smoother* than the
  // paint around them, not a darker line.
  for (let i = 0; i < (o.scratch ?? 120); i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const ang = o.brushed ? (rnd() - 0.5) * 0.18 : rnd() * Math.PI * 2;
    const len = 8 + rnd() * 90;
    const ex = x + Math.cos(ang) * len;
    const ey = y + Math.sin(ang) * len;
    alb.strokeStyle = `rgba(${o.under[0] + 60},${o.under[1] + 60},${o.under[2] + 58},${0.10 + rnd() * 0.22})`;
    alb.lineWidth = 0.6 + rnd() * 1.1;
    alb.beginPath(); alb.moveTo(x, y); alb.lineTo(ex, ey); alb.stroke();
    rgh.strokeStyle = `rgba(0,0,0,${0.18 + rnd() * 0.3})`;
    rgh.lineWidth = 0.6 + rnd() * 1.2;
    rgh.beginPath(); rgh.moveTo(x, y); rgh.lineTo(ex, ey); rgh.stroke();
  }

  // Grime pooling *in* the seams, and running down out of them — not a uniform tint.
  const poolCount = Math.round(grime * 44);
  for (let i = 0; i < poolCount; i++) {
    const horiz = rnd() < 0.6;
    const x = horiz ? rnd() * size : Math.round(rnd() * o.cols) * cw;
    const y = horiz ? Math.round(rnd() * o.rows) * ch : rnd() * size;
    const rx = horiz ? 30 + rnd() * 90 : 8 + rnd() * 14;
    const ry = horiz ? 7 + rnd() * 13 : 30 + rnd() * 90;
    const g = alb.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
    g.addColorStop(0, `rgba(16,15,14,${0.24 + rnd() * 0.26})`);
    g.addColorStop(1, 'rgba(16,15,14,0)');
    alb.save();
    alb.translate(x, y);
    alb.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry));
    alb.translate(-x, -y);
    alb.fillStyle = g;
    alb.fillRect(x - rx * 2, y - ry * 2, rx * 4, ry * 4);
    alb.restore();

    const gr = rgh.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
    gr.addColorStop(0, 'rgba(255,255,255,0.35)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    rgh.fillStyle = gr;
    rgh.fillRect(x - rx * 2, y - ry * 2, rx * 4, ry * 4);
  }

  // Drip streaks hanging below horizontal seams — gravity, not decoration.
  for (let i = 0; i < (o.streaks ?? 10); i++) {
    const x = rnd() * size;
    const y = Math.round(rnd() * o.rows) * ch;
    const len = 24 + rnd() * 150;
    const wid = 1.4 + rnd() * 6;
    const a = grime * (0.14 + rnd() * 0.3);
    const g = alb.createLinearGradient(0, y, 0, y + len);
    g.addColorStop(0, `rgba(30,22,15,${a})`);
    g.addColorStop(0.2, `rgba(46,32,20,${a * 0.8})`);
    g.addColorStop(1, 'rgba(30,24,18,0)');
    alb.fillStyle = g;
    alb.fillRect(x, y, wid, len);
    const gr = rgh.createLinearGradient(0, y, 0, y + len);
    gr.addColorStop(0, `rgba(255,255,255,${a + 0.2})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    rgh.fillStyle = gr;
    rgh.fillRect(x, y, wid, len);
  }

  speckle(rgh, rnd, 16);

  return {
    map: finishTiled(alb),
    roughnessMap: finishData(rgh),
    normalMap: normalFromHeight(hgt, 2.6),
  };
}

/**
 * Soft occlusion decal. Black with a gradient alpha, alpha-blended (not multiplied) so it is
 * predictable at any opacity — used to darken the crease wherever two forms meet, which is the
 * single cue that stops a stack of boxes reading as one plastic volume.
 */
export type AoShape = 'radial' | 'top' | 'bottom' | 'frame';

export function buildAoTexture(shape: AoShape): THREE.CanvasTexture {
  const size = 256;
  const c = surface(size, size);
  c.clearRect(0, 0, size, size);
  // Capped well short of full black: these are MeshBasicMaterial overlays, so they darken
  // whatever they sit over *regardless of scene lighting* — at the old 0.92-0.95 core alpha they
  // crushed straight to dead pixels no matter how bright the room around them was, which is most
  // of why the piece measured 30% crushed against a reference with almost none. The crease is
  // still legible at these lower ceilings; it just no longer bottoms out at literal zero.
  if (shape === 'radial') {
    const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.62)');
    g.addColorStop(0.45, 'rgba(0,0,0,0.36)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, size, size);
  } else if (shape === 'frame') {
    // Dark all round the border, clear in the middle: the crease where an inset panel meets its
    // surround, or where the whole assembly beds into the bulkhead.
    for (const [x0, y0, x1, y1] of [
      [0, 0, size * 0.34, 0], [size, 0, size * 0.66, 0],
      [0, 0, 0, size * 0.34], [0, size, 0, size * 0.66],
    ] as const) {
      const g = c.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, 'rgba(0,0,0,0.5)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, size, size);
    }
  } else {
    const up = shape === 'top';
    const g = c.createLinearGradient(0, up ? 0 : size, 0, up ? size : 0);
    g.addColorStop(0, 'rgba(0,0,0,0.58)');
    g.addColorStop(0.35, 'rgba(0,0,0,0.22)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(c.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * The exposed guts behind a removed access panel: a loom of colour-coded cable, two breaker
 * toggles and a printed wiring card. Only ever used on one jamb — the asymmetry is the point.
 */
export function buildOpenBayTexture(): THREE.CanvasTexture {
  const w = 256;
  const h = 384;
  const c = surface(w, h);
  const rnd = rng(0x4ad219);

  c.fillStyle = '#1b1f26';
  c.fillRect(0, 0, w, h);
  // Shadowed void behind the removed plate — dark, but never to literal black: the loom, straps
  // and breaker plate below still need to read as objects rather than silhouettes.
  const dark = c.createLinearGradient(0, 0, 0, h);
  dark.addColorStop(0, 'rgba(0,0,0,0.6)');
  dark.addColorStop(0.5, 'rgba(0,0,0,0.2)');
  dark.addColorStop(1, 'rgba(0,0,0,0.4)');
  c.fillStyle = dark;
  c.fillRect(0, 0, w, h);

  const wireTints = ['#8a3b2a', '#2f5f7a', '#6b6034', '#3d6a44', '#5a4a63', '#7a7268'];
  for (let i = 0; i < 26; i++) {
    const x = 20 + rnd() * (w - 40);
    c.strokeStyle = wireTints[(rnd() * wireTints.length) | 0];
    c.lineWidth = 2 + rnd() * 4;
    c.beginPath();
    c.moveTo(x, -10);
    c.bezierCurveTo(x + (rnd() - 0.5) * 90, h * 0.4, x + (rnd() - 0.5) * 90, h * 0.65, x + (rnd() - 0.5) * 50, h + 10);
    c.stroke();
    c.strokeStyle = 'rgba(0,0,0,0.4)';
    c.lineWidth = 1;
    c.stroke();
  }
  // Lacing straps holding the loom.
  for (const y of [70, 190, 300]) {
    c.fillStyle = 'rgba(24,26,30,0.9)';
    c.fillRect(14, y, w - 28, 9);
    c.fillStyle = 'rgba(120,128,140,0.35)';
    c.fillRect(14, y, w - 28, 2);
  }
  // Breaker toggles on a sub-plate.
  c.fillStyle = '#2b3037';
  c.fillRect(30, 232, 90, 54);
  c.strokeStyle = 'rgba(150,160,172,0.4)';
  c.lineWidth = 2;
  c.strokeRect(30, 232, 90, 54);
  for (let i = 0; i < 3; i++) {
    c.fillStyle = i === 1 ? '#c0492a' : '#8f979f';
    c.fillRect(40 + i * 28, 244, 12, 30);
    c.fillStyle = 'rgba(0,0,0,0.5)';
    c.fillRect(40 + i * 28, i === 1 ? 244 : 262, 12, 12);
  }
  // Wiring card, yellowed and curling.
  c.fillStyle = 'rgba(178,170,146,0.75)';
  c.fillRect(140, 236, 82, 62);
  c.fillStyle = 'rgba(40,38,34,0.65)';
  c.font = '9px monospace';
  for (let i = 0; i < 6; i++) c.fillText('▪ 4A-0' + (i + 1) + ' BUS', 145, 250 + i * 9);

  return finish(c);
}

/**
 * Draws `paint` at x and, when x is within `reach` of either edge, again wrapped around the
 * other side. The two drifting parallax layers scroll their UVs forever, so anything they
 * contain has to tile horizontally or a hard seam sweeps across the pane during play.
 */
function wrapped(w: number, x: number, reach: number, paint: (x: number) => void): void {
  paint(x);
  if (x < reach) paint(x + w);
  else if (x > w - reach) paint(x - w);
}

/** A star with a soft halo, drawn additively. */
function star(c: CanvasRenderingContext2D, x: number, y: number, r: number, tint: string, halo: number): void {
  if (halo > 1) {
    const g = c.createRadialGradient(x, y, 0, x, y, r * halo);
    g.addColorStop(0, tint);
    g.addColorStop(0.25, 'rgba(150,190,230,0.30)');
    g.addColorStop(1, 'rgba(120,160,210,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, r * halo, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = tint;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
}

const STAR_TINTS = [
  'rgba(255,255,255,1)',
  'rgba(226,238,255,1)',
  'rgba(198,220,255,1)',
  'rgba(255,238,214,1)',
  'rgba(255,214,186,1)',
];

/**
 * The view through the glass: deep space, a nebula field, a dust lane, a gas-giant limb catching
 * the local star, and a distant hull. Authored at the aperture's own aspect (~3.66:1) so circles
 * stay circular once it is mapped onto the viewport plane.
 */
export function buildSpaceBackdropTexture(): THREE.CanvasTexture {
  const w = 2048;
  const h = 560;
  const c = surface(w, h);
  const rnd = rng(0x5741d0);

  // Deep-space ground. Measured against the reference this was the render's single largest block
  // of dead pure black; the reference crop has almost no true black anywhere. Armoured glass this
  // thick is never optically clear — it carries a scattered haze of the lit interior — so the
  // floor sits at a readable dark blue-grey and the *stars* provide the contrast instead.
  const base = c.createLinearGradient(0, 0, w * 0.4, h);
  base.addColorStop(0, '#12161f');
  base.addColorStop(0.55, '#151a25');
  base.addColorStop(1, '#191e2a');
  c.fillStyle = base;
  c.fillRect(0, 0, w, h);

  // Nebula: a few very soft, very large lobes. Cool teal dominates, one violet and one faint
  // ember lobe keep it from reading as a single flat tint.
  c.globalCompositeOperation = 'lighter';
  const lobes: [number, number, number, string][] = [
    [340, 180, 520, 'rgba(34,104,132,0.30)'],
    [560, 380, 400, 'rgba(28,74,118,0.24)'],
    [980, 120, 470, 'rgba(64,44,96,0.18)'],
    [1240, 330, 360, 'rgba(30,92,116,0.16)'],
    [1830, 150, 400, 'rgba(96,58,40,0.12)'],
    [120, 430, 300, 'rgba(40,86,110,0.16)'],
  ];
  for (const [x, y, r, tint] of lobes) {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, tint);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Filament structure inside the nebula so it is not just an airbrushed blob.
  for (let i = 0; i < 90; i++) {
    const x = 120 + rnd() * 1100;
    const y = 40 + rnd() * 480;
    const len = 60 + rnd() * 260;
    const ang = -0.5 + rnd() * 1.0;
    const g = c.createLinearGradient(x, y, x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.5, `rgba(70,150,180,${0.03 + rnd() * 0.05})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.strokeStyle = g;
    c.lineWidth = 6 + rnd() * 26;
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(x + Math.cos(ang) * len * 0.5, y + Math.sin(ang) * len * 0.5 - 30, x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    c.stroke();
  }
  c.globalCompositeOperation = 'source-over';

  // Dark dust lanes cutting across the nebula — the value contrast that makes it read as depth.
  for (let i = 0; i < 22; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const len = 180 + rnd() * 520;
    const ang = -0.35 + rnd() * 0.7;
    c.strokeStyle = `rgba(11,13,19,${0.22 + rnd() * 0.3})`;
    c.lineWidth = 10 + rnd() * 46;
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(x + Math.cos(ang) * len * 0.5, y + Math.sin(ang) * len * 0.5 + 60, x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    c.stroke();
  }

  // Star field: three passes so the density reads as sky rather than as scattered dots.
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const a = 0.16 + rnd() * 0.5;
    c.fillStyle = STAR_TINTS[(rnd() * STAR_TINTS.length) | 0].replace(',1)', `,${a.toFixed(2)})`);
    c.fillRect(x, y, 1, 1);
  }
  for (let i = 0; i < 300; i++) {
    star(c, rnd() * w, rnd() * h, 0.8 + rnd() * 1.1, STAR_TINTS[(rnd() * STAR_TINTS.length) | 0], 4);
  }
  // Round 6: p95 measured a full stop under the reference (0.537 vs 0.710) after the prior round
  // fixed the pane from blown-white back to a real backdrop — this is what earns that stop back
  // without touching the pane material itself: more of the brightest star cores, and a stronger
  // flare on each, so the crop actually contains the small patch of near-white pixels the
  // reference's `hot` percentile has and ours measured at 0%.
  for (let i = 0; i < 32; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    star(c, x, y, 2.0 + rnd() * 1.4, 'rgba(255,255,255,1)', 13);
    // Cross flare on the brightest handful only.
    const len = 24 + rnd() * 34;
    const g = c.createLinearGradient(x - len, y, x + len, y);
    g.addColorStop(0, 'rgba(160,210,255,0)');
    g.addColorStop(0.5, 'rgba(220,240,255,0.62)');
    g.addColorStop(1, 'rgba(160,210,255,0)');
    c.fillStyle = g;
    c.fillRect(x - len, y - 0.8, len * 2, 1.6);
    c.fillRect(x - 0.8, y - len * 0.4, 1.6, len * 0.8);
  }

  // A distant galaxy smudge, well off to one side.
  const gx = 1660;
  const gy = 420;
  c.save();
  c.translate(gx, gy);
  c.rotate(-0.5);
  c.scale(1, 0.32);
  const gg = c.createRadialGradient(0, 0, 0, 0, 0, 130);
  gg.addColorStop(0, 'rgba(210,220,255,0.36)');
  gg.addColorStop(0.35, 'rgba(120,150,210,0.14)');
  gg.addColorStop(1, 'rgba(80,110,170,0)');
  c.fillStyle = gg;
  c.beginPath();
  c.arc(0, 0, 130, 0, Math.PI * 2);
  c.fill();
  c.restore();
  c.globalCompositeOperation = 'source-over';

  // Gas-giant limb, lit from upper-left, cresting the lower-right of the aperture.
  const px = 1430;
  const py = 730;
  const pr = 430;
  c.save();
  c.globalCompositeOperation = 'lighter';
  const atmo = c.createRadialGradient(px, py, pr * 0.97, px, py, pr * 1.13);
  atmo.addColorStop(0, 'rgba(120,205,240,0.34)');
  atmo.addColorStop(1, 'rgba(70,150,210,0)');
  c.fillStyle = atmo;
  c.beginPath();
  c.arc(px, py, pr * 1.13, 0, Math.PI * 2);
  c.fill();
  c.restore();

  c.save();
  c.beginPath();
  c.arc(px, py, pr, 0, Math.PI * 2);
  c.clip();
  const body = c.createRadialGradient(px - pr * 0.5, py - pr * 0.55, pr * 0.05, px, py, pr * 1.15);
  body.addColorStop(0, '#566c7d');
  body.addColorStop(0.35, '#33465a');
  body.addColorStop(0.7, '#1b2431');
  body.addColorStop(1, '#12161f');
  c.fillStyle = body;
  c.fillRect(px - pr, py - pr, pr * 2, pr * 2);
  // Cloud banding.
  for (let i = 0; i < 26; i++) {
    const by = py - pr + rnd() * pr * 2;
    const bh = 6 + rnd() * 34;
    c.fillStyle = rnd() < 0.5 ? `rgba(190,210,225,${0.03 + rnd() * 0.05})` : `rgba(10,16,26,${0.05 + rnd() * 0.09})`;
    c.beginPath();
    c.ellipse(px, by, pr * (0.85 + rnd() * 0.2), bh, 0.04, 0, Math.PI * 2);
    c.fill();
  }
  // Terminator: sink the lower-right side toward black.
  const term = c.createLinearGradient(px - pr * 0.4, py - pr * 0.4, px + pr * 0.9, py + pr * 0.9);
  term.addColorStop(0, 'rgba(0,0,0,0)');
  term.addColorStop(0.55, 'rgba(14,17,24,0.5)');
  term.addColorStop(1, 'rgba(17,21,29,0.92)');
  c.fillStyle = term;
  c.fillRect(px - pr, py - pr, pr * 2, pr * 2);
  c.restore();

  // Bright rim on the lit limb.
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.strokeStyle = 'rgba(180,230,255,0.75)';
  c.lineWidth = 3;
  c.beginPath();
  c.arc(px, py, pr - 1.5, Math.PI * 1.02, Math.PI * 1.72);
  c.stroke();
  c.strokeStyle = 'rgba(120,200,240,0.28)';
  c.lineWidth = 12;
  c.beginPath();
  c.arc(px, py, pr - 6, Math.PI * 1.05, Math.PI * 1.68);
  c.stroke();
  c.restore();

  // A distant hull silhouette with running lights, so the void has a sense of traffic and scale.
  c.save();
  c.translate(430, 470);
  c.rotate(0.11);
  c.fillStyle = 'rgba(24,30,40,0.95)';
  c.fillRect(-96, -7, 192, 14);
  c.fillRect(-44, -16, 62, 10);
  c.fillRect(66, -12, 26, 24);
  c.fillStyle = 'rgba(90,104,124,0.85)';
  c.fillRect(-96, -7, 192, 2);
  c.globalCompositeOperation = 'lighter';
  star(c, -92, 0, 1.7, 'rgba(255,90,60,1)', 6);
  star(c, 88, 2, 1.7, 'rgba(120,230,255,1)', 6);
  for (let i = 0; i < 7; i++) star(c, -60 + i * 18, -12, 0.9, 'rgba(200,230,255,1)', 3);
  c.restore();

  // Clamped, never scrolled: this layer carries a planet and a galaxy, which cannot be made to
  // tile. The sense of motion comes from the seamless layers drifting in front of it.
  return finish(c);
}

/** Additive nebula wisps for the mid parallax layer inside the recess. */
export function buildNebulaWispTexture(): THREE.CanvasTexture {
  const w = 1024;
  const h = 280;
  const c = surface(w, h);
  const rnd = rng(0x2b91ee);
  c.clearRect(0, 0, w, h);
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 46; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = 40 + rnd() * 150;
    const violet = rnd() < 0.3;
    const tint = violet
      ? `rgba(96,70,140,${(0.05 + rnd() * 0.07).toFixed(3)})`
      : `rgba(50,140,170,${(0.05 + rnd() * 0.09).toFixed(3)})`;
    wrapped(w, x, r, (px) => {
      const g = c.createRadialGradient(px, y, 0, px, y, r);
      g.addColorStop(0, tint);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.fillRect(px - r, y - r, r * 2, r * 2);
    });
  }
  return finish(c, true);
}

/** Sparse bright stars for a near parallax layer — drifts faster than the backdrop. */
export function buildDistantStarTexture(seed: number, count: number): THREE.CanvasTexture {
  const w = 1024;
  const h = 280;
  const c = surface(w, h);
  const rnd = rng(seed);
  c.clearRect(0, 0, w, h);
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < count; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = 0.7 + rnd() * 1.3;
    const tint = STAR_TINTS[(rnd() * STAR_TINTS.length) | 0];
    wrapped(w, x, r * 5, (px) => star(c, px, y, r, tint, 5));
  }
  return finish(c, true);
}

/**
 * The glass itself: broad specular streaks, polish swirls, sealed-edge dust and a few chips.
 * Drawn over the exterior view so the viewport reads as a pane, not an opening.
 */
export function buildGlassSheenTexture(): THREE.CanvasTexture {
  const w = 1024;
  const h = 280;
  const c = surface(w, h);
  const rnd = rng(0x9c31a7);
  c.clearRect(0, 0, w, h);

  // Broad reflected highlights raking across the pane.
  for (const [x0, x1, a] of [[-160, 220, 0.10], [260, 520, 0.06], [700, 900, 0.08]] as const) {
    const g = c.createLinearGradient(x0, 0, x1, h);
    g.addColorStop(0, 'rgba(190,220,255,0)');
    g.addColorStop(0.45, `rgba(200,228,255,${a})`);
    g.addColorStop(0.55, `rgba(200,228,255,${a})`);
    g.addColorStop(1, 'rgba(190,220,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  }

  // Circular polish scratches, concentrated where a crew arm would reach.
  c.lineWidth = 1;
  for (let i = 0; i < 120; i++) {
    const cx = 60 + rnd() * (w - 120);
    const cy = h * (0.45 + rnd() * 0.5);
    const r = 8 + rnd() * 46;
    const a0 = rnd() * Math.PI * 2;
    c.strokeStyle = `rgba(214,232,255,${0.02 + rnd() * 0.05})`;
    c.beginPath();
    c.arc(cx, cy, r, a0, a0 + 0.6 + rnd() * 1.4);
    c.stroke();
  }

  // Dust and salt haze pooling in the sealed edges, heaviest in the corners.
  const edge = 46;
  for (const [gx0, gy0, gx1, gy1] of [
    [0, 0, edge, 0], [w, 0, w - edge, 0], [0, 0, 0, edge], [0, h, 0, h - edge],
  ] as const) {
    const g = c.createLinearGradient(gx0, gy0, gx1, gy1);
    g.addColorStop(0, 'rgba(118,116,104,0.34)');
    g.addColorStop(1, 'rgba(118,116,104,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  }
  for (let i = 0; i < 900; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const edgeness = Math.min(x, w - x, y * 2.2, (h - y) * 2.2) / 90;
    if (rnd() < edgeness) continue;
    c.fillStyle = `rgba(150,148,136,${0.05 + rnd() * 0.2})`;
    c.fillRect(x, y, 1 + rnd(), 1 + rnd());
  }

  // A couple of impact chips with radial cracks.
  for (const [cx, cy] of [[228, 96], [742, 178], [905, 62]] as const) {
    c.strokeStyle = 'rgba(226,240,255,0.42)';
    c.lineWidth = 1.2;
    for (let i = 0; i < 7; i++) {
      const a = rnd() * Math.PI * 2;
      const len = 4 + rnd() * 16;
      c.beginPath();
      c.moveTo(cx, cy);
      c.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
      c.stroke();
    }
    c.fillStyle = 'rgba(232,244,255,0.5)';
    c.beginPath();
    c.arc(cx, cy, 2.2, 0, Math.PI * 2);
    c.fill();
  }

  return finish(c);
}

/**
 * Localised corrosion: rust drips running down from a seam, plus pooled grime at the bottom
 * edge. Alpha-blended over frame steel so the wear sits where water would actually run.
 */
export function buildDripStreakTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = 512;
  const c = surface(w, h);
  const rnd = rng(0x71e4a3);
  c.clearRect(0, 0, w, h);

  for (let i = 0; i < 34; i++) {
    const x = rnd() * w;
    const len = 40 + rnd() * 330;
    const wid = 1.5 + rnd() * 9;
    const a = 0.12 + rnd() * 0.4;
    const g = c.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, `rgba(112,66,32,${a})`);
    g.addColorStop(0.25, `rgba(138,84,42,${a * 0.85})`);
    g.addColorStop(1, 'rgba(96,62,38,0)');
    c.fillStyle = g;
    c.fillRect(x, 0, wid, len);
    // Darker core so each drip has an edge instead of reading as an airbrush pass.
    c.fillStyle = `rgba(58,34,18,${a * 0.5})`;
    c.fillRect(x + wid * 0.3, 0, Math.max(1, wid * 0.3), len * 0.8);
  }

  // Blooming corrosion patches where the drips start.
  for (let i = 0; i < 26; i++) {
    const x = rnd() * w;
    const y = rnd() * h * 0.35;
    const r = 5 + rnd() * 26;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(146,92,46,${0.2 + rnd() * 0.3})`);
    g.addColorStop(1, 'rgba(120,76,40,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  }

  // Grime pooling along the bottom edge of the plate.
  const pool = c.createLinearGradient(0, h, 0, h - 130);
  pool.addColorStop(0, 'rgba(26,24,22,0.5)');
  pool.addColorStop(1, 'rgba(26,24,22,0)');
  c.fillStyle = pool;
  c.fillRect(0, h - 130, w, 130);

  return finish(c);
}

/** Bank of indicator lamps, sunk into a dark plate — the frame's red accent. */
export function buildLedBankTexture(seed: number): THREE.CanvasTexture {
  const w = 256;
  const h = 384;
  const c = surface(w, h);
  const rnd = rng(seed);

  c.fillStyle = '#14171c';
  c.fillRect(0, 0, w, h);
  c.strokeStyle = 'rgba(150,160,175,0.30)';
  c.lineWidth = 4;
  c.strokeRect(4, 4, w - 8, h - 8);
  c.fillStyle = 'rgba(0,0,0,0.55)';
  c.fillRect(16, 26, w - 32, h - 52);

  const cols = 4;
  const rows = 9;
  const cw = (w - 44) / cols;
  const chh = (h - 74) / rows;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const x = 22 + col * cw + cw * 0.14;
      const y = 37 + r * chh + chh * 0.2;
      const pw = cw * 0.72;
      const ph = chh * 0.5;
      const roll = rnd();
      // Mostly red, a few amber, a few dead. Brightness varies lamp to lamp.
      let lit = 'rgba(224,85,47,';
      if (roll > 0.86) lit = 'rgba(216,166,58,';
      const dead = roll < 0.13;
      const a = dead ? 0.12 : 0.55 + rnd() * 0.45;
      c.fillStyle = dead ? 'rgba(70,34,26,0.5)' : lit + a.toFixed(2) + ')';
      c.fillRect(x, y, pw, ph);
      if (!dead) {
        const g = c.createRadialGradient(x + pw / 2, y + ph / 2, 0, x + pw / 2, y + ph / 2, pw * 0.9);
        g.addColorStop(0, lit + (a * 0.5).toFixed(2) + ')');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g;
        c.fillRect(x - pw * 0.4, y - ph, pw * 1.8, ph * 3);
      }
      c.strokeStyle = 'rgba(0,0,0,0.6)';
      c.lineWidth = 1;
      c.strokeRect(x, y, pw, ph);
    }
  }

  c.fillStyle = 'rgba(190,198,210,0.55)';
  c.font = 'bold 15px monospace';
  c.textAlign = 'center';
  c.fillText('BUS 4-A', w / 2, 20);
  c.fillText('RCS PWR', w / 2, h - 12);

  return finish(c);
}

/** Small cyan instrument readout for the sill inserts. */
export function buildSillReadoutTexture(seed: number): THREE.CanvasTexture {
  const w = 512;
  const h = 160;
  const c = surface(w, h);
  const rnd = rng(seed);

  c.fillStyle = '#04141c';
  c.fillRect(0, 0, w, h);
  c.strokeStyle = 'rgba(79,216,240,0.13)';
  c.lineWidth = 1;
  for (let x = 0; x < w; x += 16) {
    c.beginPath();
    c.moveTo(x, 0);
    c.lineTo(x, h);
    c.stroke();
  }
  for (let y = 0; y < h; y += 16) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(w, y);
    c.stroke();
  }

  // Header band.
  c.fillStyle = 'rgba(79,216,240,0.22)';
  c.fillRect(0, 0, w, 22);
  c.fillStyle = 'rgba(190,240,255,0.9)';
  c.font = 'bold 14px monospace';
  c.textAlign = 'left';
  const labels = ['NAV TRIM', 'HULL TEMP', 'ATT REF', 'DRIFT'];
  c.fillText(labels[seed % labels.length], 8, 16);
  c.textAlign = 'right';
  c.fillText(`${100 + (seed * 37) % 800}`, w - 8, 16);
  c.textAlign = 'left';

  // Bar column readouts.
  for (let i = 0; i < 9; i++) {
    const bx = 10 + i * 26;
    const bh = 14 + rnd() * 76;
    c.fillStyle = 'rgba(79,216,240,0.16)';
    c.fillRect(bx, 34, 18, 96);
    c.fillStyle = i === 6 ? 'rgba(216,166,58,0.9)' : 'rgba(120,230,250,0.85)';
    c.fillRect(bx, 130 - bh, 18, bh);
  }

  // Waveform trace on the right half.
  c.strokeStyle = 'rgba(168,240,255,0.9)';
  c.lineWidth = 1.6;
  c.beginPath();
  for (let x = 0; x <= 230; x++) {
    const y = 84 + Math.sin(x * 0.09 + seed) * 22 * (0.4 + rnd() * 0.2) + Math.sin(x * 0.31) * 6;
    if (x === 0) c.moveTo(268 + x, y);
    else c.lineTo(268 + x, y);
  }
  c.stroke();

  // Text rows under the trace.
  c.font = '11px monospace';
  for (let i = 0; i < 3; i++) {
    c.fillStyle = `rgba(150,220,240,${0.35 + rnd() * 0.35})`;
    c.fillText(`${(rnd() * 999).toFixed(0).padStart(3, '0')}·${(rnd() * 99).toFixed(0)}  OK`, 270, 118 + i * 13);
  }

  return finish(c);
}

/**
 * A physical breaker panel: rocker toggles, hand-scrawled per-circuit labels and a scuffed metal
 * face. Round 6 target: the four-unit equipment rack read as one asset repeated four times with a
 * different colour. Giving one unit a genuinely different job — flip switches instead of a lit
 * LED grid — is what makes the stack read as serviced hardware built from different parts rather
 * than a modular kit piece copy-pasted down the wall.
 */
export function buildBreakerPanelTexture(seed: number): THREE.CanvasTexture {
  const w = 256;
  const h = 384;
  const c = surface(w, h);
  const rnd = rng(seed);

  const base = c.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, '#3a3d42');
  base.addColorStop(1, '#2a2c30');
  c.fillStyle = base;
  c.fillRect(0, 0, w, h);
  c.strokeStyle = 'rgba(150,160,175,0.3)';
  c.lineWidth = 4;
  c.strokeRect(4, 4, w - 8, h - 8);

  // Worn patches: paint rubbed to bare metal wherever a hand keeps landing.
  for (let i = 0; i < 10; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = 8 + rnd() * 22;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(190,196,206,0.14)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }

  c.fillStyle = 'rgba(200,208,218,0.55)';
  c.font = 'bold 15px monospace';
  c.textAlign = 'center';
  c.fillText('PANEL ' + (seed % 8 + 1), w / 2, 20);

  const rows = 6;
  const rh = (h - 60) / rows;
  const circuitTags = ['NAV', 'LIFE', 'COMM', 'AUX', 'PUMP', 'HEAT', 'ECS', 'SPARE'];
  for (let r = 0; r < rows; r++) {
    const y = 36 + r * rh + rh / 2;
    const on = rnd() > 0.28;
    const guarded = rnd() < 0.22;

    // Recessed bezel.
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.fillRect(20, y - 20, w - 40, 34);

    // Rocker toggle, thrown up (on) or down (off) — never centred, a switch always reads a state.
    c.save();
    c.translate(52, y - 3);
    c.fillStyle = '#17191d';
    c.fillRect(-11, -16, 22, 32);
    c.fillStyle = on ? '#7f8892' : '#54585e';
    c.beginPath();
    c.ellipse(0, on ? -6 : 6, 8, 11, 0, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.5)';
    c.lineWidth = 1;
    c.stroke();
    c.restore();
    if (guarded) {
      // A hinged wire guard over a critical breaker — the one detail that reads as "someone
      // decided this switch needed protecting", not stock kit dressing.
      c.strokeStyle = 'rgba(210,150,40,0.7)';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(52, y - 3, 15, Math.PI * 1.1, Math.PI * 1.9);
      c.stroke();
    }

    // Status jewel.
    c.fillStyle = on ? 'rgba(90,220,120,0.85)' : 'rgba(90,40,30,0.6)';
    c.beginPath();
    c.arc(84, y - 3, 4, 0, Math.PI * 2);
    c.fill();

    // Hand-labelled circuit tag — deliberately uneven baseline, like a crew member wrote it.
    c.save();
    c.translate(150, y - 2);
    c.rotate((rnd() - 0.5) * 0.05);
    c.fillStyle = 'rgba(224,220,206,0.7)';
    c.font = '12px monospace';
    c.textAlign = 'left';
    c.fillText(circuitTags[(seed + r * 3) % circuitTags.length] + '-' + (r + 1), -60, 0);
    c.restore();

    if (r < rows - 1) {
      c.strokeStyle = 'rgba(0,0,0,0.4)';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(16, 36 + (r + 1) * rh);
      c.lineTo(w - 16, 36 + (r + 1) * rh);
      c.stroke();
    }
  }

  // A grease smear low on the plate, from a hand reaching past the rows above it.
  const smear = c.createRadialGradient(w * 0.7, h - 40, 0, w * 0.7, h - 40, 60);
  smear.addColorStop(0, 'rgba(20,18,16,0.3)');
  smear.addColorStop(1, 'rgba(20,18,16,0)');
  c.fillStyle = smear;
  c.fillRect(w * 0.7 - 60, h - 100, 120, 120);

  return finish(c);
}

/**
 * A hand-hung warning tag: yellowed card, a punched grommet, a loop of wire, and a short scrawled
 * line — the single cheapest cue that a prop was touched by a crew member rather than dropped in
 * from a kit. Sized to hang off a rack unit's corner stud.
 */
export function buildHandTagTexture(line1: string, line2: string): THREE.CanvasTexture {
  const w = 192;
  const h = 128;
  const c = surface(w, h);
  const rnd = rng((line1.length + 1) * 7919 + line2.length * 131);
  c.clearRect(0, 0, w, h);

  // Everything below is authored in card-local space (origin at the card's own centre) inside
  // one transform, so every element — fill, blotches, text, grommet — rotates together as a
  // single tilted object instead of the grommet drifting off in canvas space.
  c.save();
  c.translate(w / 2, h / 2 + 10);
  c.rotate(-0.03);
  const cardW = w - 20;
  const cardH = h - 40;
  const card = c.createLinearGradient(0, -cardH / 2, 0, cardH / 2);
  card.addColorStop(0, '#c9b46a');
  card.addColorStop(1, '#a8935a');
  c.fillStyle = card;
  c.fillRect(-cardW / 2, -cardH / 2, cardW, cardH);
  c.strokeStyle = 'rgba(60,48,20,0.5)';
  c.lineWidth = 2;
  c.strokeRect(-cardW / 2, -cardH / 2, cardW, cardH);

  // Grime and sun-fade blotching so it reads as handled, not printed fresh.
  for (let i = 0; i < 16; i++) {
    const x = (rnd() - 0.5) * cardW;
    const y = (rnd() - 0.5) * cardH;
    const r = 4 + rnd() * 14;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rnd() < 0.5 ? 'rgba(50,38,16,0.22)' : 'rgba(255,248,220,0.18)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Frayed lower corner.
  c.fillStyle = '#82734a';
  c.beginPath();
  c.moveTo(cardW / 2 - 14, cardH / 2);
  c.lineTo(cardW / 2, cardH / 2 - 10);
  c.lineTo(cardW / 2, cardH / 2);
  c.closePath();
  c.fill();

  c.fillStyle = 'rgba(30,22,10,0.82)';
  c.font = 'bold 20px monospace';
  c.textAlign = 'center';
  c.fillText(line1, 2, -cardH / 2 + 34);
  c.font = '13px monospace';
  c.fillStyle = 'rgba(30,22,10,0.7)';
  c.fillText(line2, -2, -cardH / 2 + 56);

  // Punched grommet, just above the card's top edge, and the wire loop it hangs from.
  const holeY = -cardH / 2 - 6;
  c.fillStyle = 'rgba(30,26,20,0.6)';
  c.beginPath();
  c.arc(0, holeY, 5, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = 'rgba(60,66,74,0.75)';
  c.lineWidth = 2;
  c.beginPath();
  c.ellipse(0, holeY - 10, 8, 12, 0, 0, Math.PI * 2);
  c.stroke();
  c.restore();

  return finish(c);
}
