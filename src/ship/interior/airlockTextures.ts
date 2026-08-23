import * as THREE from 'three';

// Procedural canvas textures for the aft airlock. Kept local to the airlock module so the
// palette can be pinned to the art brief's cool-steel / bone-white values rather than
// inheriting the warm rust of the shared photo-sourced PBR sets.

const STEEL_BASE = '#666c74';
const STEEL_LIGHT = '#828892';
const STEEL_DARK = '#3f444c';
// Deliberately below the deck's #c9c2b4-#ddd6c6: the floor is meant to be the brightest large
// surface in frame, and the round-1 render blew its p95 to 0.83 by painting the hatch brighter
// than the deck it stands on.
const BONE_BASE = '#a8a294';
const BONE_LIGHT = '#b9b3a3';
const BONE_SHADOW = '#7c766a';
const PRIMER = '#565b63';
const CYAN = '#7fe4f5';

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function finish(canvas: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function canvas2d(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

/** Vertical wash streaks — the grime that runs down every surface in the reference. */
function streaks(g: CanvasRenderingContext2D, w: number, h: number, rand: () => number, count: number, alpha: number): void {
  for (let i = 0; i < count; i++) {
    const x = rand() * w;
    const top = rand() * h * 0.55;
    const len = h * (0.25 + rand() * 0.6);
    const grad = g.createLinearGradient(0, top, 0, top + len);
    grad.addColorStop(0, `rgba(20,24,28,${alpha * (0.4 + rand() * 0.6)})`);
    grad.addColorStop(1, 'rgba(20,24,28,0)');
    g.fillStyle = grad;
    g.fillRect(x, top, 1 + rand() * 3, len);
  }
}

/** A bolt head: dark seat ring, lit crown, shadow under. Real geometry is used on hero
 *  frames; this is the cheap version painted straight into a plate texture. */
function bolt(g: CanvasRenderingContext2D, x: number, y: number, r: number, light: string, dark: string): void {
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.beginPath();
  g.arc(x + r * 0.25, y + r * 0.3, r, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = dark;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = light;
  g.beginPath();
  g.arc(x - r * 0.2, y - r * 0.25, r * 0.6, 0, Math.PI * 2);
  g.fill();
}

/**
 * Cool grey structural steel: a 2x2 grid of bolted plates with recessed seams, corner bolts,
 * weld beads and drip streaks. This is the base material for the airlock's frame, jambs,
 * lockers and overhead lintel.
 */
export function buildAirlockSteelTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, g] = canvas2d(S, S);
  const rand = makeRng(0x51e2);

  g.fillStyle = STEEL_BASE;
  g.fillRect(0, 0, S, S);

  // Mottled base so large flat areas never read as one flat colour.
  for (let i = 0; i < 900; i++) {
    const r = 3 + rand() * 26;
    g.fillStyle = rand() > 0.5 ? `rgba(150,158,168,${0.03 + rand() * 0.07})` : `rgba(48,54,62,${0.03 + rand() * 0.08})`;
    g.beginPath();
    g.arc(rand() * S, rand() * S, r, 0, Math.PI * 2);
    g.fill();
  }

  // Plate seams: dark recess with a lit lip on the lower edge.
  const half = S / 2;
  g.fillStyle = 'rgba(24,28,34,0.85)';
  g.fillRect(half - 3, 0, 6, S);
  g.fillRect(0, half - 3, S, 6);
  g.fillStyle = 'rgba(168,176,186,0.5)';
  g.fillRect(half + 3, 0, 2, S);
  g.fillRect(0, half + 3, S, 2);

  // Weld bead running the horizontal seam.
  for (let x = 0; x < S; x += 7) {
    g.fillStyle = `rgba(120,128,138,${0.25 + rand() * 0.3})`;
    g.beginPath();
    g.ellipse(x, half + 8, 5, 2.5, 0, 0, Math.PI * 2);
    g.fill();
  }

  // Corner bolts on every plate.
  for (const px of [0, 1]) {
    for (const py of [0, 1]) {
      const ox = px * half;
      const oy = py * half;
      for (const [bx, by] of [[26, 26], [half - 26, 26], [26, half - 26], [half - 26, half - 26]] as const) {
        bolt(g, ox + bx, oy + by, 7, STEEL_LIGHT, STEEL_DARK);
      }
    }
  }

  // Scratch marks clustered near the seams, where tools and boots hit.
  g.lineWidth = 1;
  for (let i = 0; i < 90; i++) {
    const x = rand() * S;
    const y = rand() * S;
    g.strokeStyle = `rgba(190,198,208,${0.06 + rand() * 0.18})`;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rand() - 0.5) * 40, y + (rand() - 0.5) * 12);
    g.stroke();
  }

  streaks(g, S, S, rand, 34, 0.32);
  return finish(c);
}

/**
 * Bone-white painted plate for the door leaf: brushed paint, a faint roller texture, chips at
 * the edges revealing grey primer, and grime pooling at the bottom edge.
 */
export function buildDoorPlateTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, g] = canvas2d(S, S);
  const rand = makeRng(0x2c07);

  const base = g.createLinearGradient(0, 0, 0, S);
  base.addColorStop(0, BONE_LIGHT);
  base.addColorStop(0.65, BONE_BASE);
  base.addColorStop(1, BONE_SHADOW);
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);

  for (let i = 0; i < 700; i++) {
    g.fillStyle = rand() > 0.5 ? `rgba(255,252,242,${0.03 + rand() * 0.06})` : `rgba(120,114,102,${0.03 + rand() * 0.07})`;
    g.beginPath();
    g.arc(rand() * S, rand() * S, 4 + rand() * 30, 0, Math.PI * 2);
    g.fill();
  }

  // Paint chipped through to primer, concentrated along the plate border.
  for (let i = 0; i < 130; i++) {
    const edge = Math.floor(rand() * 4);
    const t = rand() * S;
    const inset = rand() * rand() * 70;
    const x = edge === 0 ? t : edge === 1 ? t : edge === 2 ? inset : S - inset;
    const y = edge === 0 ? inset : edge === 1 ? S - inset : t;
    g.fillStyle = rand() > 0.35 ? PRIMER : '#7d6a52';
    g.beginPath();
    const r = 1.5 + rand() * 5;
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      g.lineTo(x + Math.cos(a) * r * (0.5 + rand()), y + Math.sin(a) * r * (0.5 + rand()));
    }
    g.closePath();
    g.fill();
  }

  // Fine brush/roller grain.
  for (let i = 0; i < 220; i++) {
    const y = rand() * S;
    g.strokeStyle = `rgba(255,255,250,${0.03 + rand() * 0.06})`;
    g.beginPath();
    g.moveTo(rand() * S, y);
    g.lineTo(rand() * S, y + (rand() - 0.5) * 6);
    g.stroke();
  }

  streaks(g, S, S, rand, 22, 0.22);

  // Grime pooling along the bottom edge where the plate meets the next one down.
  const pool = g.createLinearGradient(0, S * 0.82, 0, S);
  pool.addColorStop(0, 'rgba(30,32,30,0)');
  pool.addColorStop(1, 'rgba(30,32,30,0.5)');
  g.fillStyle = pool;
  g.fillRect(0, S * 0.82, S, S * 0.18);

  return finish(c);
}

/**
 * Flat industrial paint with chipping — used for the alarm-orange door surround and the
 * hazard-yellow kick plates. Colour is passed in so one builder covers both accents.
 */
export function buildPaintedTrimTexture(hex: string, chip = PRIMER): THREE.CanvasTexture {
  const S = 256;
  const [c, g] = canvas2d(S, S);
  const rand = makeRng(0x9a13 ^ hex.length);

  g.fillStyle = hex;
  g.fillRect(0, 0, S, S);

  for (let i = 0; i < 260; i++) {
    g.fillStyle = rand() > 0.5 ? `rgba(255,235,215,${0.03 + rand() * 0.07})` : `rgba(40,26,20,${0.04 + rand() * 0.1})`;
    g.beginPath();
    g.arc(rand() * S, rand() * S, 3 + rand() * 18, 0, Math.PI * 2);
    g.fill();
  }

  // Chips, heaviest along the two long edges — corners take the knocks.
  for (let i = 0; i < 90; i++) {
    const y = rand() < 0.5 ? rand() * rand() * 30 : S - rand() * rand() * 30;
    const x = rand() * S;
    g.fillStyle = chip;
    g.beginPath();
    const r = 1 + rand() * 4;
    g.moveTo(x, y);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      g.lineTo(x + Math.cos(a) * r * (0.5 + rand()), y + Math.sin(a) * r * (0.5 + rand()));
    }
    g.closePath();
    g.fill();
  }

  g.lineWidth = 1;
  for (let i = 0; i < 60; i++) {
    const x = rand() * S;
    const y = rand() * S;
    g.strokeStyle = `rgba(255,240,225,${0.05 + rand() * 0.15})`;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rand() - 0.5) * 30, y + (rand() - 0.5) * 8);
    g.stroke();
  }

  return finish(c);
}

/** Hazard chevrons in the brief's yellow over near-black, with paint wear. */
export function buildAirlockHazardTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, g] = canvas2d(S, S);
  const rand = makeRng(0x3f81);

  g.fillStyle = '#24272c';
  g.fillRect(0, 0, S, S);
  g.fillStyle = '#d8a63a';
  const stripeW = S / 4;
  for (let i = -2; i < 6; i++) {
    g.save();
    g.beginPath();
    g.rect(0, 0, S, S);
    g.clip();
    g.translate(i * stripeW * 2, 0);
    g.rotate(Math.PI / 4);
    g.fillRect(-S, -S, stripeW, S * 4);
    g.restore();
  }
  // Worn tread down the middle of the band, where boots cross it.
  const worn = g.createLinearGradient(0, S * 0.3, 0, S * 0.7);
  worn.addColorStop(0, 'rgba(40,42,44,0)');
  worn.addColorStop(0.5, 'rgba(40,42,44,0.45)');
  worn.addColorStop(1, 'rgba(40,42,44,0)');
  g.fillStyle = worn;
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 120; i++) {
    g.fillStyle = `rgba(70,72,74,${0.1 + rand() * 0.3})`;
    g.beginPath();
    g.arc(rand() * S, rand() * S, 1 + rand() * 5, 0, Math.PI * 2);
    g.fill();
  }
  return finish(c);
}

/** Louvred vent grille — real slats read as depth without extra geometry at small sizes. */
export function buildLouvreVentTexture(): THREE.CanvasTexture {
  const W = 256;
  const H = 128;
  const [c, g] = canvas2d(W, H);
  const rand = makeRng(0x7712);

  g.fillStyle = '#1b1f24';
  g.fillRect(0, 0, W, H);
  const slats = 7;
  const sh = H / slats;
  for (let i = 0; i < slats; i++) {
    const y = i * sh;
    const grad = g.createLinearGradient(0, y, 0, y + sh);
    grad.addColorStop(0, '#0d1014');
    grad.addColorStop(0.55, '#767d87');
    grad.addColorStop(1, '#454b54');
    g.fillStyle = grad;
    g.fillRect(6, y + sh * 0.22, W - 12, sh * 0.62);
  }
  // Frame with corner bolts.
  g.strokeStyle = '#8a9099';
  g.lineWidth = 5;
  g.strokeRect(3, 3, W - 6, H - 6);
  for (const [bx, by] of [[13, 13], [W - 13, 13], [13, H - 13], [W - 13, H - 13]] as const) {
    bolt(g, bx, by, 5, STEEL_LIGHT, STEEL_DARK);
  }
  for (let i = 0; i < 60; i++) {
    g.fillStyle = `rgba(20,22,24,${0.1 + rand() * 0.3})`;
    g.beginPath();
    g.arc(rand() * W, rand() * H, 2 + rand() * 9, 0, Math.PI * 2);
    g.fill();
  }
  const tex = finish(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** Non-slip tread plate for the door sill, with hazard edging painted along both long sides. */
export function buildSillTreadTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 128;
  const [c, g] = canvas2d(W, H);
  const rand = makeRng(0x4d20);

  g.fillStyle = '#7a8089';
  g.fillRect(0, 0, W, H);
  // Raised tread lozenges.
  for (let y = 10; y < H - 8; y += 14) {
    for (let x = ((y / 14) % 2) * 12; x < W; x += 24) {
      g.fillStyle = 'rgba(20,24,28,0.55)';
      g.fillRect(x + 1, y + 2, 13, 5);
      g.fillStyle = 'rgba(178,186,196,0.85)';
      g.fillRect(x, y, 13, 5);
    }
  }
  // Hazard edging top and bottom.
  for (const oy of [0, H - 18]) {
    g.save();
    g.beginPath();
    g.rect(0, oy, W, 18);
    g.clip();
    g.fillStyle = '#24272c';
    g.fillRect(0, oy, W, 18);
    g.fillStyle = '#d8a63a';
    for (let i = -1; i < 30; i++) {
      g.save();
      g.translate(i * 36, oy);
      g.rotate(Math.PI / 5);
      g.fillRect(-30, -30, 16, 90);
      g.restore();
    }
    g.restore();
  }
  // Wear polished down the walking centre.
  const worn = g.createLinearGradient(0, H * 0.25, 0, H * 0.75);
  worn.addColorStop(0, 'rgba(220,226,234,0)');
  worn.addColorStop(0.5, 'rgba(220,226,234,0.22)');
  worn.addColorStop(1, 'rgba(220,226,234,0)');
  g.fillStyle = worn;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 90; i++) {
    g.fillStyle = `rgba(24,26,28,${0.06 + rand() * 0.2})`;
    g.beginPath();
    g.arc(rand() * W, rand() * H, 2 + rand() * 12, 0, Math.PI * 2);
    g.fill();
  }
  return finish(c);
}

/** Cyan airlock status readout: pressure bars, cycle state, a hatch schematic. */
export function buildAirlockScreenTexture(variant: 'pressure' | 'cycle'): THREE.CanvasTexture {
  const W = 256;
  const H = 160;
  const [c, g] = canvas2d(W, H);
  const rand = makeRng(variant === 'pressure' ? 0x1188 : 0x22aa);

  g.fillStyle = '#05161d';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(79,216,240,0.12)';
  g.lineWidth = 1;
  for (let x = 0; x < W; x += 12) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, H);
    g.stroke();
  }
  for (let y = 0; y < H; y += 12) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(W, y);
    g.stroke();
  }

  g.fillStyle = CYAN;
  g.font = 'bold 13px monospace';
  g.fillText(variant === 'pressure' ? 'HATCH A / PRESS' : 'CYCLE CONTROL', 10, 20);
  g.fillStyle = 'rgba(79,216,240,0.4)';
  g.fillRect(8, 26, W - 16, 1);

  if (variant === 'pressure') {
    g.font = '11px monospace';
    const rows = ['INNER  101.2 kPa', 'LOCK   101.1 kPa', 'OUTER    0.0 kPa', 'O2 %     20.9', 'SEAL     NOMINAL'];
    rows.forEach((r, i) => {
      g.fillStyle = i === 4 ? '#8ef0b0' : CYAN;
      g.fillText(r, 12, 46 + i * 15);
    });
    // Bar meter.
    for (let i = 0; i < 22; i++) {
      const on = i < 19;
      g.fillStyle = on ? (i > 17 ? '#e0552f' : CYAN) : 'rgba(79,216,240,0.18)';
      g.fillRect(12 + i * 10, H - 24, 7, 12);
    }
  } else {
    // Hatch schematic: concentric rings and dogging-bolt marks.
    const cx = W * 0.34;
    const cy = H * 0.6;
    g.strokeStyle = CYAN;
    g.lineWidth = 2;
    for (const r of [16, 26, 36]) {
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.stroke();
    }
    g.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.strokeStyle = i % 3 === 0 ? '#e0552f' : CYAN;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * 36, cy + Math.sin(a) * 36);
      g.lineTo(cx + Math.cos(a) * 44, cy + Math.sin(a) * 44);
      g.stroke();
    }
    g.font = '11px monospace';
    const rows = ['SEQ  READY', 'DOGS 8/8', 'EQUAL  OK', 'PURGE  ---'];
    rows.forEach((r, i) => {
      g.fillStyle = i === 3 ? 'rgba(79,216,240,0.45)' : CYAN;
      g.fillText(r, W * 0.6, 52 + i * 17);
    });
  }

  // Scanline haze.
  for (let y = 0; y < H; y += 3) {
    g.fillStyle = `rgba(0,0,0,${0.1 + rand() * 0.05})`;
    g.fillRect(0, y, W, 1);
  }
  const tex = finish(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** Stencilled placard for the door header and equipment lockers. */
export function buildAirlockPlacardTexture(main: string, sub: string, accent = '#e0552f'): THREE.CanvasTexture {
  const W = 512;
  const H = 128;
  const [c, g] = canvas2d(W, H);
  const rand = makeRng(0x6600 + main.length * 37);

  g.fillStyle = '#2f353c';
  g.fillRect(0, 0, W, H);
  g.fillStyle = accent;
  g.fillRect(0, 0, 14, H);
  g.fillRect(W - 14, 0, 14, H);
  g.strokeStyle = 'rgba(180,188,198,0.5)';
  g.lineWidth = 3;
  g.strokeRect(20, 10, W - 40, H - 20);

  g.fillStyle = '#ddd6c6';
  g.font = 'bold 52px "Arial Narrow", Impact, sans-serif';
  g.textBaseline = 'middle';
  g.fillText(main, 36, H * 0.4);
  g.fillStyle = 'rgba(200,206,214,0.7)';
  g.font = '20px monospace';
  g.fillText(sub, 38, H * 0.75);

  for (const [bx, by] of [[10, 12], [W - 10, 12], [10, H - 12], [W - 10, H - 12]] as const) {
    bolt(g, bx, by, 5, STEEL_LIGHT, STEEL_DARK);
  }
  for (let i = 0; i < 70; i++) {
    g.fillStyle = `rgba(18,20,24,${0.08 + rand() * 0.25})`;
    g.beginPath();
    g.arc(rand() * W, rand() * H, 2 + rand() * 12, 0, Math.PI * 2);
    g.fill();
  }
  const tex = finish(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// =================================================================================================
// Roughness fields
//
// The round-1 critique was that steel, paint, rubber and glass all shared one response. A single
// scalar `roughness` per material is what causes that: real surfaces vary across themselves, and
// the variation is what produces the moving specular breakup that reads as "material" rather than
// "tinted plastic". These are linear-space greyscale maps — white = rough, black = polished.
// =================================================================================================

function greyNoise(g: CanvasRenderingContext2D, S: number, rand: () => number, count: number, lo: number, hi: number): void {
  for (let i = 0; i < count; i++) {
    const v = Math.round(lo + rand() * (hi - lo));
    g.fillStyle = `rgba(${v},${v},${v},${0.1 + rand() * 0.35})`;
    g.beginPath();
    g.arc(rand() * S, rand() * S, 3 + rand() * 34, 0, Math.PI * 2);
    g.fill();
  }
}

/**
 * Structural steel: mid-rough overall, grimy (rougher) along the plate seams where dirt packs in,
 * and polished down to near-mirror in broad patches where the plate has been rubbed by traffic.
 */
export function buildSteelRoughnessTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, g] = canvas2d(S, S);
  const rand = makeRng(0x51e3);

  g.fillStyle = '#9a9a9a';
  g.fillRect(0, 0, S, S);
  greyNoise(g, S, rand, 260, 90, 210);

  // Seams pack grime: rougher than the plate faces around them.
  const half = S / 2;
  g.fillStyle = 'rgba(240,240,240,0.85)';
  g.fillRect(half - 5, 0, 10, S);
  g.fillRect(0, half - 5, S, 10);

  // Rubbed-bright patches. Big and soft so the specular travels across the surface as the camera
  // moves instead of sitting still like a painted-on highlight.
  for (let i = 0; i < 14; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const r = 26 + rand() * 78;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(58,58,58,${0.35 + rand() * 0.4})`);
    grad.addColorStop(1, 'rgba(58,58,58,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Scratches cut through to bare bright metal.
  g.lineWidth = 1.4;
  for (let i = 0; i < 120; i++) {
    const x = rand() * S;
    const y = rand() * S;
    g.strokeStyle = `rgba(40,40,40,${0.2 + rand() * 0.5})`;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rand() - 0.5) * 54, y + (rand() - 0.5) * 16);
    g.stroke();
  }
  return finish(c, false);
}

/**
 * Painted plate: uniformly matte except where hands and shoulders have burnished it. The contrast
 * between the burnished lanes and the flat paint is what separates "painted metal" from "steel".
 */
export function buildPaintRoughnessTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, g] = canvas2d(S, S);
  const rand = makeRng(0x2c08);

  g.fillStyle = '#d2d2d2';
  g.fillRect(0, 0, S, S);
  greyNoise(g, S, rand, 200, 170, 235);

  // Burnished handling zones — centre band and the lower third where boots and gloves land.
  for (const [cx, cy, r] of [[S * 0.5, S * 0.46, 150], [S * 0.5, S * 0.88, 190], [S * 0.18, S * 0.6, 90]] as const) {
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, 'rgba(96,96,96,0.62)');
    grad.addColorStop(1, 'rgba(96,96,96,0)');
    g.fillStyle = grad;
    g.fillRect(cx - r, cy - r, r * 2, r * 2);
  }

  // Chips expose primer: rougher than the paint around them.
  for (let i = 0; i < 120; i++) {
    const edge = Math.floor(rand() * 4);
    const t = rand() * S;
    const inset = rand() * rand() * 70;
    const x = edge === 0 || edge === 1 ? t : edge === 2 ? inset : S - inset;
    const y = edge === 0 ? inset : edge === 1 ? S - inset : t;
    g.fillStyle = `rgba(255,255,255,${0.4 + rand() * 0.5})`;
    g.beginPath();
    g.arc(x, y, 1.5 + rand() * 5, 0, Math.PI * 2);
    g.fill();
  }
  return finish(c, false);
}

/**
 * Tangent-space normal map matching the steel plate's seam/bolt layout: V-groove seams that lean
 * light toward their centreline and domed bolt heads, so the plate breaks up specular highlights
 * with real surface direction instead of only a painted-on light/dark pattern.
 */
export function buildAirlockSteelNormalTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, g] = canvas2d(S, S);
  g.fillStyle = 'rgb(128,128,255)';
  g.fillRect(0, 0, S, S);

  const half = S / 2;
  const groove = (center: number, vertical: boolean) => {
    const w = 8;
    for (let i = -w; i <= w; i++) {
      const t = i / w;
      const lean = Math.round(128 - t * 90);
      g.fillStyle = vertical ? `rgb(${lean},128,220)` : `rgb(128,${lean},220)`;
      if (vertical) g.fillRect(center + i, 0, 1, S);
      else g.fillRect(0, center + i, S, 1);
    }
  };
  groove(half, true);
  groove(half, false);

  for (const px of [0, 1]) {
    for (const py of [0, 1]) {
      const ox = px * half;
      const oy = py * half;
      for (const [bx, by] of [[26, 26], [half - 26, 26], [26, half - 26], [half - 26, half - 26]] as const) {
        const cx = ox + bx;
        const cy = oy + by;
        const r = 7;
        for (let yy = -r; yy <= r; yy++) {
          for (let xx = -r; xx <= r; xx++) {
            const d = Math.sqrt(xx * xx + yy * yy);
            if (d > r) continue;
            const R = Math.round(128 + (xx / r) * 90);
            const G = Math.round(128 + (yy / r) * 90);
            g.fillStyle = `rgb(${R},${G},220)`;
            g.fillRect(cx + xx, cy + yy, 1, 1);
          }
        }
      }
    }
  }
  return finish(c, false);
}

// =================================================================================================
// Grounding decals
//
// The scene's only shadow caster is one 1024px directional key, which cannot resolve the contact
// between a crate and the deck it sits on. These alpha-masked planes are the ambient occlusion the
// lighting rig has no way to compute, and they are what stops props reading as pasted on.
//
// All of them use straight alpha blending, never MultiplyBlending: a multiply decal drawn from a
// canvas with cleared regions multiplies the destination by RGB 0 wherever alpha is 0, which paints
// an opaque black rectangle around the decal instead of nothing.
// =================================================================================================

/** Radial contact-occlusion pool for the footprint of a prop standing on the deck. */
export function buildContactShadowTexture(): THREE.CanvasTexture {
  const S = 128;
  const [c, g] = canvas2d(S, S);
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(10,12,15,0.72)');
  grad.addColorStop(0.42, 'rgba(10,12,15,0.5)');
  grad.addColorStop(0.74, 'rgba(10,12,15,0.15)');
  grad.addColorStop(1, 'rgba(10,12,15,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  const tex = finish(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/**
 * One-sided occlusion ramp: opaque at v=0 (the plane's lower edge) fading out upward. Used along
 * the wall/deck junction and under every wall-mounted box, where the key light — which comes from
 * behind the camera side — can never cast a shadow onto the bulkhead itself.
 */
export function buildEdgeShadowTexture(): THREE.CanvasTexture {
  const W = 8;
  const H = 128;
  const [c, g] = canvas2d(W, H);
  // Canvas row 0 is v=1, so the dark end must be painted at the bottom of the canvas.
  const grad = g.createLinearGradient(0, H, 0, 0);
  grad.addColorStop(0, 'rgba(10,12,15,0.68)');
  grad.addColorStop(0.22, 'rgba(10,12,15,0.4)');
  grad.addColorStop(0.55, 'rgba(10,12,15,0.13)');
  grad.addColorStop(1, 'rgba(10,12,15,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  const tex = finish(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/**
 * Soft warm radial falloff for the door header's floor pool — an additive decal, not a dynamic
 * light, so its brightness is a value we set directly rather than something that can spike into
 * a bloom starburst off nearby metal. See the round-5 fix note on `doorFloorPool` in airlock.ts.
 */
export function buildDoorGlowTexture(): THREE.CanvasTexture {
  const S = 128;
  const [c, g] = canvas2d(S, S);
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(255,221,176,0.85)');
  grad.addColorStop(0.4, 'rgba(255,205,150,0.4)');
  grad.addColorStop(0.75, 'rgba(255,196,130,0.1)');
  grad.addColorStop(1, 'rgba(255,196,130,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  const tex = finish(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** Boot-scuff and dragged-grit smudges for the walking lane through the hatch. */
export function buildScuffDecalTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, g] = canvas2d(S, S);
  const rand = makeRng(0x77a1);
  g.clearRect(0, 0, S, S);

  // Heel-drag arcs, aligned with the direction of travel through the door.
  g.lineCap = 'round';
  for (let i = 0; i < 46; i++) {
    const x = S * (0.08 + rand() * 0.84);
    const y = S * (0.08 + rand() * 0.84);
    const len = 12 + rand() * 60;
    g.lineWidth = 2 + rand() * 7;
    g.strokeStyle = `rgba(26,28,32,${0.06 + rand() * 0.22})`;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + len * 0.5, y + (rand() - 0.5) * 14, x + len, y + (rand() - 0.5) * 22);
    g.stroke();
  }
  // Ground-in grit blooms.
  for (let i = 0; i < 90; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const r = 4 + rand() * 26;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(34,34,36,${0.05 + rand() * 0.14})`);
    grad.addColorStop(1, 'rgba(34,34,36,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const tex = finish(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** Burnished halo where a hand or glove grips the same spot ten thousand times. */
export function buildHandWearTexture(): THREE.CanvasTexture {
  const S = 128;
  const [c, g] = canvas2d(S, S);
  const rand = makeRng(0x3311);
  g.clearRect(0, 0, S, S);
  const grad = g.createRadialGradient(S / 2, S / 2, S * 0.1, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(196,200,208,0.34)');
  grad.addColorStop(0.6, 'rgba(160,166,176,0.12)');
  grad.addColorStop(1, 'rgba(160,166,176,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 40; i++) {
    const a = rand() * Math.PI * 2;
    const r = rand() * S * 0.4;
    g.strokeStyle = `rgba(210,215,222,${0.05 + rand() * 0.16})`;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r);
    g.lineTo(S / 2 + Math.cos(a + 0.4) * (r + 12), S / 2 + Math.sin(a + 0.4) * (r + 12));
    g.stroke();
  }
  const tex = finish(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/**
 * A soft off-axis band, added over dark glass. Flat `MeshStandardMaterial` glass with no plane of
 * reflection to catch reads as a black hole; the reference's viewport is convincing precisely
 * because a broad room reflection sits on top of what you can see through it.
 */
export function buildGlassStreakTexture(): THREE.CanvasTexture {
  const S = 128;
  const [c, g] = canvas2d(S, S);
  g.clearRect(0, 0, S, S);
  g.save();
  g.translate(S / 2, S / 2);
  g.rotate(-0.62);
  const grad = g.createLinearGradient(0, -S * 0.5, 0, S * 0.5);
  grad.addColorStop(0.0, 'rgba(150,186,208,0)');
  grad.addColorStop(0.26, 'rgba(168,204,226,0.5)');
  grad.addColorStop(0.36, 'rgba(120,150,172,0.1)');
  grad.addColorStop(0.52, 'rgba(158,192,214,0.26)');
  grad.addColorStop(0.66, 'rgba(90,116,138,0.05)');
  grad.addColorStop(1.0, 'rgba(90,116,138,0)');
  g.fillStyle = grad;
  g.fillRect(-S, -S, S * 2, S * 2);
  g.restore();
  const tex = finish(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/**
 * Deck markings for the hatch approach — stencilled bay ID, a keep-clear hatch box and a caution
 * triangle, all with the paint worn away where boots cross them. The reference's own weakest region
 * is its bare low-texel foreground floor; this is the piece of the frame where we can be better
 * than it rather than merely level with it.
 */
export function buildDeckStencilTexture(): THREE.CanvasTexture {
  const W = 1024;
  const H = 512;
  const [c, g] = canvas2d(W, H);
  const rand = makeRng(0x40d1);
  g.clearRect(0, 0, W, H);

  const YELLOW = '#d8a63a';

  // Keep-clear box: dashed outline around the hatch swing.
  g.strokeStyle = YELLOW;
  g.lineWidth = 12;
  g.setLineDash([54, 34]);
  g.strokeRect(40, 40, W - 80, H - 80);
  g.setLineDash([]);

  // Bay stencil, split so the wear reads across letterforms rather than as one grey wash.
  g.fillStyle = YELLOW;
  g.font = 'bold 104px "Arial Narrow", Impact, sans-serif';
  g.textBaseline = 'middle';
  g.fillText('AIRLOCK 04', 96, 168);
  g.fillStyle = '#ded8c8';
  g.font = 'bold 62px "Arial Narrow", Impact, sans-serif';
  g.fillText('KEEP CLEAR OF HATCH SWING', 100, 262);

  // Caution triangle on the right.
  g.strokeStyle = YELLOW;
  g.lineWidth = 14;
  g.beginPath();
  g.moveTo(W - 190, 130);
  g.lineTo(W - 100, 286);
  g.lineTo(W - 280, 286);
  g.closePath();
  g.stroke();
  g.fillStyle = YELLOW;
  g.fillRect(W - 197, 176, 14, 62);
  g.fillRect(W - 197, 250, 14, 16);

  // Direction chevrons along the bottom.
  g.fillStyle = '#ded8c8';
  for (let i = 0; i < 7; i++) {
    const x = 110 + i * 122;
    g.beginPath();
    g.moveTo(x, H - 130);
    g.lineTo(x + 62, H - 84);
    g.lineTo(x, H - 38);
    g.lineTo(x - 22, H - 38);
    g.lineTo(x + 40, H - 84);
    g.lineTo(x - 22, H - 130);
    g.closePath();
    g.fill();
  }

  // Wear: scrub the paint away in the lane and at random, so the markings are half-gone rather
  // than freshly applied. destination-out erases alpha, which is what "worn paint" actually is.
  g.globalCompositeOperation = 'destination-out';
  const lane = g.createLinearGradient(W * 0.3, 0, W * 0.72, 0);
  lane.addColorStop(0, 'rgba(0,0,0,0)');
  lane.addColorStop(0.5, 'rgba(0,0,0,0.72)');
  lane.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = lane;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 320; i++) {
    const x = rand() * W;
    const y = rand() * H;
    const r = 4 + rand() * 40;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(0,0,0,${0.2 + rand() * 0.7})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.globalCompositeOperation = 'source-over';

  const tex = finish(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/**
 * Localised wear decal on a transparent ground, alpha-blended over a surface: corrosion bleeding
 * out of a joint plus drip runs below it. Motivated wear, not a uniform tint.
 */
export function buildCorrosionDecalTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, g] = canvas2d(S, S);
  const rand = makeRng(0xbe11);
  g.clearRect(0, 0, S, S);

  // Corrosion bloom hugging the top edge (the joint), fading downward.
  for (let i = 0; i < 160; i++) {
    const x = rand() * S;
    const y = Math.pow(rand(), 2.2) * S * 0.7;
    const r = 3 + rand() * 22 * (1 - y / S);
    const a = 0.05 + rand() * 0.16 * (1 - y / S);
    g.fillStyle = rand() > 0.5 ? `rgba(112,72,44,${a})` : `rgba(70,58,50,${a})`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // Drip runs.
  for (let i = 0; i < 22; i++) {
    const x = rand() * S;
    const top = rand() * S * 0.3;
    const len = S * (0.2 + rand() * 0.6);
    const grad = g.createLinearGradient(0, top, 0, top + len);
    grad.addColorStop(0, `rgba(96,64,40,${0.14 + rand() * 0.18})`);
    grad.addColorStop(1, 'rgba(96,64,40,0)');
    g.fillStyle = grad;
    g.fillRect(x, top, 1 + rand() * 3, len);
  }
  const tex = finish(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}
