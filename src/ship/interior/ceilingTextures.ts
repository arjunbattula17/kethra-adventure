import * as THREE from 'three';

/**
 * Procedural canvas textures for the ceiling. All cool-grey steel per the art brief
 * (`#39424c`–`#525c68` for ceiling structure) — the previous pass used the shared
 * `ship_console` photo maps, whose warm brown base was the single biggest palette
 * deviation in the overhead read.
 *
 * Every structural map ships as a triple: albedo, a companion roughness and a normal derived
 * from the same height field, so seams, rivets and dents all agree with each other and the
 * plating breaks up specular instead of reading as one uniform sheen.
 */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas2d(w: number, h: number): { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return { canvas, g: canvas.getContext('2d')! };
}

function toTexture(canvas: HTMLCanvasElement, srgb: boolean): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Runs `draw` nine times on a 3x3 offset lattice so marks near an edge wrap seamlessly. */
function tileable(g: CanvasRenderingContext2D, size: number, draw: () => void): void {
  for (const ox of [-size, 0, size]) {
    for (const oy of [-size, 0, size]) {
      g.save();
      g.translate(ox, oy);
      draw();
      g.restore();
    }
  }
}

/**
 * Sobel-differentiates a grayscale height canvas into a tangent-space normal map. Sampling
 * wraps, so a height field drawn with `tileable` yields a seamlessly tiling normal map.
 * Image rows run down while V runs up, hence the un-negated Y derivative.
 */
function heightToNormal(src: HTMLCanvasElement, strength: number): THREE.CanvasTexture {
  const W = src.width;
  const H = src.height;
  const data = src.getContext('2d')!.getImageData(0, 0, W, H).data;
  const { canvas, g } = canvas2d(W, H);
  const out = g.createImageData(W, H);
  const at = (x: number, y: number) => data[((((y % H) + H) % H) * W + (((x % W) + W) % W)) * 4] / 255;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx =
        (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) -
          at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)) * strength;
      const dy =
        (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) -
          at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1)) * strength;
      const nx = -dx;
      const ny = dy;
      const len = Math.sqrt(nx * nx + ny * ny + 1);
      const i = (y * W + x) * 4;
      out.data[i] = Math.round(((nx / len) * 0.5 + 0.5) * 255);
      out.data[i + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255);
      out.data[i + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
      out.data[i + 3] = 255;
    }
  }
  g.putImageData(out, 0, 0);
  return toTexture(canvas, false);
}

/* ------------------------------------------------------------------------------------------
 * Bolted plate: albedo / roughness / normal share one layout.
 * ---------------------------------------------------------------------------------------- */

const PLATE_S = 512;
/** Panel seam lines within one tile — 2x2 panels. */
const PLATE_SEAMS = [0, PLATE_S / 2];
const PLATE_RIVET_STEP = 32;

let plateMap: THREE.CanvasTexture | null = null;
let plateRough: THREE.CanvasTexture | null = null;
let plateNormal: THREE.CanvasTexture | null = null;

/**
 * Bolted grey-steel plate. Layered as: cool base, metre-scale oxidation blooms (teal-green
 * patina and warm ochre, both drawn from the reference's ceiling plating), brushed grain,
 * seams with a lit lip, rivet rows, and corrosion/chipping that only ever hugs a seam or a
 * rivet — wear where use puts it, not a uniform tint.
 */
export function buildCeilingPlateTexture(): THREE.CanvasTexture {
  if (plateMap) return plateMap;
  const S = PLATE_S;
  const { canvas, g } = canvas2d(S, S);
  const rnd = mulberry32(0x51c3);

  g.fillStyle = '#4c5563';
  g.fillRect(0, 0, S, S);

  // Metre-scale oxidation blooms. The reference's overhead plating is not one grey — it drifts
  // through green patina and dull ochre across a couple of panels at a time, which is what
  // stops a large surface reading as flat albedo at distance.
  const blooms: [string, number][] = [
    ['rgba(86,110,92,0.30)', 12],   // green patina
    ['rgba(122,104,74,0.22)', 9],   // ochre oxide
    ['rgba(64,80,98,0.26)', 10],    // cool wash
    ['rgba(28,33,40,0.30)', 12],    // soot / shadow pooling
    ['rgba(132,144,158,0.16)', 8],  // rubbed-bright plating
  ];
  for (const [col, n] of blooms) {
    for (let i = 0; i < n; i++) {
      const x = rnd() * S;
      const y = rnd() * S;
      const r = 70 + rnd() * 190;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, col);
      grad.addColorStop(0.55, col.replace(/[\d.]+\)$/, '0.12)'));
      grad.addColorStop(1, col.replace(/[\d.]+\)$/, '0)'));
      g.fillStyle = grad;
      tileable(g, S, () => { g.beginPath(); g.ellipse(x, y, r, r * (0.5 + rnd() * 0.8), rnd() * 3, 0, Math.PI * 2); g.fill(); });
    }
  }

  // Fine brushed-metal grain.
  for (let i = 0; i < 1400; i++) {
    const y = rnd() * S;
    const x = rnd() * S;
    const len = 12 + rnd() * 80;
    g.strokeStyle = rnd() < 0.5 ? 'rgba(158,170,184,0.055)' : 'rgba(22,26,32,0.065)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + len, y + (rnd() - 0.5) * 2);
    g.stroke();
  }

  // Panel seams: dark groove with a lit lip above it.
  g.lineCap = 'butt';
  for (const s of PLATE_SEAMS) {
    tileable(g, S, () => {
      g.fillStyle = '#2a313a';
      g.fillRect(s - 2.5, -S, 5, S * 3);
      g.fillRect(-S, s - 2.5, S * 3, 5);
      g.fillStyle = 'rgba(154,166,180,0.55)';
      g.fillRect(s - 4, -S, 1.5, S * 3);
      g.fillRect(-S, s - 4, S * 3, 1.5);
      g.fillStyle = 'rgba(24,28,34,0.42)';
      g.fillRect(s + 3, -S, 2, S * 3);
      g.fillRect(-S, s + 3, S * 3, 2);
    });
  }

  // Rivet rows tracking every seam.
  const rivet = (x: number, y: number) => {
    tileable(g, S, () => {
      g.fillStyle = 'rgba(20,24,30,0.72)';
      g.beginPath();
      g.arc(x + 0.8, y + 1.1, 3.4, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#717c8b';
      g.beginPath();
      g.arc(x, y, 3.0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(182,194,208,0.85)';
      g.beginPath();
      g.arc(x - 0.8, y - 0.9, 1.5, 0, Math.PI * 2);
      g.fill();
    });
  };
  for (const s of PLATE_SEAMS) {
    for (let t = PLATE_RIVET_STEP / 2; t < S; t += PLATE_RIVET_STEP) {
      rivet(s, t);
      rivet(t, s);
    }
  }

  // Localised corrosion — small, and only ever hugging a seam or a rivet line.
  for (let i = 0; i < 46; i++) {
    const alongX = rnd() < 0.5;
    const s = PLATE_SEAMS[rnd() < 0.5 ? 0 : 1];
    const t = rnd() * S;
    const x = alongX ? t : s + (rnd() - 0.5) * 26;
    const y = alongX ? s + (rnd() - 0.5) * 26 : t;
    const r = 6 + rnd() * 18;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(148,98,54,${0.18 + rnd() * 0.22})`);
    grad.addColorStop(0.6, 'rgba(94,66,44,0.10)');
    grad.addColorStop(1, 'rgba(94,66,44,0)');
    g.fillStyle = grad;
    tileable(g, S, () => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); });
  }

  // Chipped paint flecks at panel corners: bare pale metal, with a dark lip on the low side.
  for (let i = 0; i < 70; i++) {
    const s = PLATE_SEAMS[rnd() < 0.5 ? 0 : 1];
    const o = PLATE_SEAMS[rnd() < 0.5 ? 0 : 1];
    const x = s + (rnd() - 0.5) * 46;
    const y = o + (rnd() - 0.5) * 46;
    const rx = 2 + rnd() * 5;
    const ry = 1 + rnd() * 3;
    const a = rnd() * Math.PI;
    tileable(g, S, () => {
      g.fillStyle = 'rgba(24,28,34,0.34)';
      g.beginPath();
      g.ellipse(x + 1, y + 1, rx, ry, a, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(150,160,174,0.34)';
      g.beginPath();
      g.ellipse(x, y, rx, ry, a, 0, Math.PI * 2);
      g.fill();
    });
  }

  plateMap = toTexture(canvas, true);
  return plateMap;
}

/**
 * Companion roughness: seam lips and chipped-to-bare spots read polished, corrosion blooms and
 * settled grime read matte. Wide spread — a single roughness value across every steel surface
 * was the flat-plastic tell.
 */
export function buildCeilingPlateRoughness(): THREE.CanvasTexture {
  if (plateRough) return plateRough;
  const S = PLATE_S;
  const { canvas, g } = canvas2d(S, S);
  const rnd = mulberry32(0x9a17);

  g.fillStyle = '#8c8c8c';
  g.fillRect(0, 0, S, S);

  // Matte grime / oxide patches and polished rub-through patches, at the same metre scale as
  // the albedo blooms so the two read as one material story.
  for (let i = 0; i < 46; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 60 + rnd() * 170;
    const v = rnd() < 0.55 ? 200 + rnd() * 45 : 70 + rnd() * 60;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(${v},${v},${v},0.5)`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    tileable(g, S, () => { g.beginPath(); g.ellipse(x, y, r, r * (0.5 + rnd() * 0.8), rnd() * 3, 0, Math.PI * 2); g.fill(); });
  }
  // Brushed grain, so grazing highlights streak rather than sitting as an even sheen.
  for (let i = 0; i < 900; i++) {
    const y = rnd() * S;
    const x = rnd() * S;
    const len = 20 + rnd() * 120;
    g.strokeStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
    g.lineWidth = 1 + rnd();
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + len, y + (rnd() - 0.5) * 2);
    g.stroke();
  }
  // Seam grooves collect grime; the lit lip beside them is worn smooth.
  for (const s of PLATE_SEAMS) {
    tileable(g, S, () => {
      g.fillStyle = 'rgba(28,28,28,0.85)';
      g.fillRect(s - 2, -S, 4, S * 3);
      g.fillRect(-S, s - 2, S * 3, 4);
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.fillRect(s - 4, -S, 1.5, S * 3);
      g.fillRect(-S, s - 4, S * 3, 1.5);
    });
  }
  // Rivet heads are rubbed bright.
  for (const s of PLATE_SEAMS) {
    for (let t = PLATE_RIVET_STEP / 2; t < S; t += PLATE_RIVET_STEP) {
      for (const [px, py] of [[s, t], [t, s]] as [number, number][]) {
        tileable(g, S, () => {
          g.fillStyle = 'rgba(255,255,255,0.5)';
          g.beginPath();
          g.arc(px, py, 3, 0, Math.PI * 2);
          g.fill();
        });
      }
    }
  }

  plateRough = toTexture(canvas, false);
  return plateRough;
}

/** Height-derived normals for the plate: seam grooves, proud rivets, panel dents and scratches. */
export function buildCeilingPlateNormal(): THREE.CanvasTexture {
  if (plateNormal) return plateNormal;
  const S = PLATE_S;
  const { canvas, g } = canvas2d(S, S);
  const rnd = mulberry32(0x1e6d);

  g.fillStyle = '#808080';
  g.fillRect(0, 0, S, S);

  // Broad dents and oil-canning across each panel.
  for (let i = 0; i < 40; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 30 + rnd() * 110;
    const up = rnd() < 0.5;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, up ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.16)');
    grad.addColorStop(1, 'rgba(128,128,128,0)');
    g.fillStyle = grad;
    tileable(g, S, () => { g.beginPath(); g.ellipse(x, y, r, r * (0.5 + rnd() * 0.9), rnd() * 3, 0, Math.PI * 2); g.fill(); });
  }

  // Seam: a groove with a raised lip on one side, matching the albedo.
  for (const s of PLATE_SEAMS) {
    tileable(g, S, () => {
      g.fillStyle = '#3c3c3c';
      g.fillRect(s - 2.5, -S, 5, S * 3);
      g.fillRect(-S, s - 2.5, S * 3, 5);
      g.fillStyle = '#c8c8c8';
      g.fillRect(s - 4.5, -S, 2, S * 3);
      g.fillRect(-S, s - 4.5, S * 3, 2);
    });
  }

  // Proud rivet domes.
  for (const s of PLATE_SEAMS) {
    for (let t = PLATE_RIVET_STEP / 2; t < S; t += PLATE_RIVET_STEP) {
      for (const [px, py] of [[s, t], [t, s]] as [number, number][]) {
        tileable(g, S, () => {
          const d = g.createRadialGradient(px, py, 0, px, py, 3.6);
          d.addColorStop(0, 'rgba(255,255,255,0.95)');
          d.addColorStop(0.75, 'rgba(190,190,190,0.6)');
          d.addColorStop(1, 'rgba(128,128,128,0)');
          g.fillStyle = d;
          g.beginPath();
          g.arc(px, py, 3.6, 0, Math.PI * 2);
          g.fill();
        });
      }
    }
  }

  // Scratches and weld beads.
  for (let i = 0; i < 130; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const len = 14 + rnd() * 90;
    const a = rnd() < 0.75 ? (rnd() < 0.5 ? 0 : Math.PI / 2) + (rnd() - 0.5) * 0.24 : rnd() * Math.PI;
    g.strokeStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.22)';
    g.lineWidth = 0.8 + rnd() * 1.6;
    tileable(g, S, () => {
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      g.stroke();
    });
  }

  plateNormal = heightToNormal(canvas, 2.6);
  return plateNormal;
}

/* ------------------------------------------------------------------------------------------
 * Corrugated deck bays.
 * ---------------------------------------------------------------------------------------- */

let deckMap: THREE.CanvasTexture | null = null;
let deckNormal: THREE.CanvasTexture | null = null;
let deckRough: THREE.CanvasTexture | null = null;

/**
 * Corrugated ceiling deck. Ribs vary along V so that on a box's down-facing face they run
 * along X and repeat down Z, matching the ribbed panel bays in the reference. The base value
 * sits at the bright end of the brief's ceiling range: these bays fill most of the overhead
 * and were the surfaces crushing to pure black.
 */
export function buildCorrugatedDeckTexture(): THREE.CanvasTexture {
  if (deckMap) return deckMap;
  const S = 256;
  const RIBS = 8;
  const { canvas, g } = canvas2d(S, S);
  const rnd = mulberry32(0x2f81);

  const period = S / RIBS;
  for (let y = 0; y < S; y++) {
    const p = (y % period) / period;
    const s = Math.sin(p * Math.PI * 2);
    const v = 78 + s * 24;
    // Hard shadow line in the valley of every rib gives the corrugation a crisp read
    // even where the normal map is washed out by the overhead pools.
    const valley = p > 0.44 && p < 0.56 ? 24 : 0;
    g.fillStyle = `rgb(${Math.round(v - valley)},${Math.round(v + 6 - valley)},${Math.round(v + 17 - valley)})`;
    g.fillRect(0, y, S, 1);
  }

  // Oxidation drift across whole bays — the same green/ochre story as the plate, so the deck
  // and the structure read as the same ship rather than two asset kits.
  for (const [col, n] of [
    ['rgba(88,112,94,0.26)', 8],
    ['rgba(124,104,72,0.18)', 6],
    ['rgba(58,74,92,0.24)', 7],
  ] as [string, number][]) {
    for (let i = 0; i < n; i++) {
      const x = rnd() * S;
      const y = rnd() * S;
      const r = 40 + rnd() * 90;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, col);
      grad.addColorStop(1, col.replace(/[\d.]+\)$/, '0)'));
      g.fillStyle = grad;
      tileable(g, S, () => { g.beginPath(); g.ellipse(x, y, r, r * 0.7, 0, 0, Math.PI * 2); g.fill(); });
    }
  }

  // Grime pooling in the corrugation valleys and soot streaks running across them.
  for (let i = 0; i < 26; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const w = 8 + rnd() * 48;
    const h = 20 + rnd() * 90;
    const grad = g.createRadialGradient(x, y, 0, x, y, Math.max(w, h));
    grad.addColorStop(0, `rgba(18,21,26,${0.14 + rnd() * 0.18})`);
    grad.addColorStop(1, 'rgba(18,21,26,0)');
    g.fillStyle = grad;
    tileable(g, S, () => { g.beginPath(); g.ellipse(x, y, w, h, 0, 0, Math.PI * 2); g.fill(); });
  }
  for (let i = 0; i < 10; i++) {
    const x = rnd() * S;
    g.fillStyle = 'rgba(128,140,154,0.07)';
    g.fillRect(x, 0, 2 + rnd() * 10, S);
  }

  deckMap = toTexture(canvas, true);
  return deckMap;
}

/** Tangent-space normals for the corrugation ribs (pure V-axis sine), plus panel dents. */
export function buildCorrugatedDeckNormal(): THREE.CanvasTexture {
  if (deckNormal) return deckNormal;
  const S = 256;
  const RIBS = 8;
  const { canvas, g } = canvas2d(S, S);
  const rnd = mulberry32(0x4c19);
  const period = S / RIBS;
  for (let y = 0; y < S; y++) {
    const p = (y % period) / period;
    const v = Math.round(128 + Math.sin(p * Math.PI * 2) * 112);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(0, y, S, 1);
  }
  for (let i = 0; i < 26; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 18 + rnd() * 46;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, rnd() < 0.5 ? 'rgba(255,255,255,0.13)' : 'rgba(0,0,0,0.13)');
    grad.addColorStop(1, 'rgba(128,128,128,0)');
    g.fillStyle = grad;
    tileable(g, S, () => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); });
  }
  deckNormal = heightToNormal(canvas, 1.5);
  return deckNormal;
}

/** Deck roughness: valleys hold dust and read matte, rib crowns are rubbed smoother. */
export function buildCorrugatedDeckRoughness(): THREE.CanvasTexture {
  if (deckRough) return deckRough;
  const S = 256;
  const RIBS = 8;
  const { canvas, g } = canvas2d(S, S);
  const rnd = mulberry32(0x7b30);
  const period = S / RIBS;
  for (let y = 0; y < S; y++) {
    const p = (y % period) / period;
    const v = Math.round(212 - Math.sin(p * Math.PI * 2) * 62);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(0, y, S, 1);
  }
  for (let i = 0; i < 34; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 20 + rnd() * 70;
    const v = rnd() < 0.5 ? 245 : 120;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(${v},${v},${v},0.45)`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    tileable(g, S, () => { g.beginPath(); g.ellipse(x, y, r, r * 0.65, 0, 0, Math.PI * 2); g.fill(); });
  }
  deckRough = toTexture(canvas, false);
  return deckRough;
}

/* ------------------------------------------------------------------------------------------
 * Painted trim (bezels, sprinkler bodies, gauge cases).
 * ---------------------------------------------------------------------------------------- */

let trimMap: THREE.CanvasTexture | null = null;
let trimRough: THREE.CanvasTexture | null = null;

/**
 * Pale painted trim. Deliberately mid-grey rather than bone-white: the bezels are the largest
 * light-valued surfaces in the overhead and a white base colour pushed the whole ceiling's p95
 * well past the reference. Brightness belongs to the emissive lenses they frame, not to paint.
 */
export function buildPaintedTrimTexture(): THREE.CanvasTexture {
  if (trimMap) return trimMap;
  const S = 256;
  const { canvas, g } = canvas2d(S, S);
  const rnd = mulberry32(0xa4d2);

  g.fillStyle = '#8d939c';
  g.fillRect(0, 0, S, S);
  // Uneven paint lay-down.
  for (let i = 0; i < 40; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 24 + rnd() * 80;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, rnd() < 0.5 ? 'rgba(166,172,180,0.22)' : 'rgba(88,94,102,0.24)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    tileable(g, S, () => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); });
  }
  // Grime settling along the lower run of the trim.
  for (let i = 0; i < 22; i++) {
    const x = rnd() * S;
    const w = 6 + rnd() * 40;
    const grad = g.createLinearGradient(0, 0, 0, S);
    grad.addColorStop(0, 'rgba(38,42,48,0)');
    grad.addColorStop(1, `rgba(38,42,48,${0.14 + rnd() * 0.2})`);
    g.fillStyle = grad;
    g.fillRect(x, 0, w, S);
  }
  // Chipped edges showing bare steel under the paint.
  for (let i = 0; i < 90; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const rx = 1.5 + rnd() * 5;
    const ry = 1 + rnd() * 3;
    const a = rnd() * Math.PI;
    tileable(g, S, () => {
      g.fillStyle = 'rgba(40,44,50,0.4)';
      g.beginPath();
      g.ellipse(x + 1, y + 1, rx, ry, a, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(118,126,138,0.55)';
      g.beginPath();
      g.ellipse(x, y, rx, ry, a, 0, Math.PI * 2);
      g.fill();
    });
  }
  trimMap = toTexture(canvas, true);
  return trimMap;
}

/** Painted trim roughness: paint is semi-matte, the chips through to bare steel are shiny. */
export function buildPaintedTrimRoughness(): THREE.CanvasTexture {
  if (trimRough) return trimRough;
  const S = 256;
  const { canvas, g } = canvas2d(S, S);
  const rnd = mulberry32(0xb711);
  g.fillStyle = '#b4b4b4';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 90; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const rx = 1.5 + rnd() * 5;
    const ry = 1 + rnd() * 3;
    g.fillStyle = 'rgba(40,40,40,0.7)';
    tileable(g, S, () => { g.beginPath(); g.ellipse(x, y, rx, ry, rnd() * Math.PI, 0, Math.PI * 2); g.fill(); });
  }
  for (let i = 0; i < 30; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 20 + rnd() * 70;
    const v = rnd() < 0.5 ? 240 : 150;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(${v},${v},${v},0.45)`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    tileable(g, S, () => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); });
  }
  trimRough = toTexture(canvas, false);
  return trimRough;
}

/* ------------------------------------------------------------------------------------------
 * Diffuser, pipe, grille.
 * ---------------------------------------------------------------------------------------- */

let diffuserMap: THREE.CanvasTexture | null = null;

/**
 * Warm practical diffuser face (`#ffd9a0` family): a hot centre falling to a cooler
 * edge, a faint lamp-grid, and a couple of dead/dirty cells so the fixtures are not
 * ten identical rectangles.
 */
export function buildDiffuserTexture(): THREE.CanvasTexture {
  if (diffuserMap) return diffuserMap;
  const W = 256;
  const H = 128;
  const { canvas, g } = canvas2d(W, H);
  const rnd = mulberry32(0x77c2);

  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#8d6c3d');
  grad.addColorStop(0.5, '#e8c48f');
  grad.addColorStop(1, '#8d6c3d');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  const hot = g.createRadialGradient(W * 0.5, H * 0.5, 0, W * 0.5, H * 0.5, W * 0.5);
  hot.addColorStop(0, 'rgba(255,238,206,0.6)');
  hot.addColorStop(1, 'rgba(255,238,206,0)');
  g.fillStyle = hot;
  g.fillRect(0, 0, W, H);

  // Diffuser egg-crate.
  g.strokeStyle = 'rgba(58,42,24,0.5)';
  g.lineWidth = 2;
  for (let x = 0; x <= W; x += 16) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, H);
    g.stroke();
  }
  for (let y = 0; y <= H; y += 16) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(W, y);
    g.stroke();
  }

  // Dust and insect grime settled inside the housing.
  for (let i = 0; i < 30; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const r = 3 + rnd() * 16;
    const d = g.createRadialGradient(x, y, 0, x, y, r);
    d.addColorStop(0, `rgba(38,28,16,${0.24 + rnd() * 0.32})`);
    d.addColorStop(1, 'rgba(38,28,16,0)');
    g.fillStyle = d;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // One dead cell per fixture.
  g.fillStyle = 'rgba(28,22,14,0.6)';
  g.fillRect(W * 0.72, H * 0.28, 30, 30);

  diffuserMap = toTexture(canvas, true);
  return diffuserMap;
}

let pipeMap: THREE.CanvasTexture | null = null;
let pipeRough: THREE.CanvasTexture | null = null;

/** Lengthwise-streaked steel for the overhead pipe trunks, with drip staining at the bands. */
export function buildPipeSteelTexture(): THREE.CanvasTexture {
  if (pipeMap) return pipeMap;
  const W = 256;
  const H = 128;
  const { canvas, g } = canvas2d(W, H);
  const rnd = mulberry32(0x3d4a);

  g.fillStyle = '#767e89';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 300; i++) {
    const y = rnd() * H;
    g.fillStyle = rnd() < 0.5 ? 'rgba(168,178,190,0.10)' : 'rgba(36,42,50,0.12)';
    g.fillRect(0, y, W, 1 + rnd() * 2);
  }
  // Rust runs that start at a band and travel down the pipe's underside.
  for (let i = 0; i < 18; i++) {
    const x = rnd() * W;
    const w = 4 + rnd() * 24;
    const grad = g.createLinearGradient(x, 0, x, H);
    grad.addColorStop(0, 'rgba(122,76,42,0)');
    grad.addColorStop(0.4, `rgba(122,76,42,${0.14 + rnd() * 0.22})`);
    grad.addColorStop(1, 'rgba(44,30,18,0.24)');
    g.fillStyle = grad;
    g.fillRect(x, 0, w, H);
  }
  for (let i = 0; i < 22; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const r = 5 + rnd() * 22;
    const d = g.createRadialGradient(x, y, 0, x, y, r);
    d.addColorStop(0, 'rgba(26,30,36,0.26)');
    d.addColorStop(1, 'rgba(26,30,36,0)');
    g.fillStyle = d;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  pipeMap = toTexture(canvas, true);
  return pipeMap;
}

/** Pipe roughness: bare galvanised steel is fairly sharp, the rust runs kill the specular dead. */
export function buildPipeRoughness(): THREE.CanvasTexture {
  if (pipeRough) return pipeRough;
  const W = 256;
  const H = 128;
  const { canvas, g } = canvas2d(W, H);
  const rnd = mulberry32(0x5c81);
  g.fillStyle = '#5a5a5a';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 220; i++) {
    const y = rnd() * H;
    g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    g.fillRect(0, y, W, 1 + rnd() * 2);
  }
  for (let i = 0; i < 18; i++) {
    const x = rnd() * W;
    const w = 4 + rnd() * 24;
    const grad = g.createLinearGradient(x, 0, x, H);
    grad.addColorStop(0, 'rgba(240,240,240,0)');
    grad.addColorStop(0.4, 'rgba(240,240,240,0.6)');
    grad.addColorStop(1, 'rgba(240,240,240,0.8)');
    g.fillStyle = grad;
    g.fillRect(x, 0, w, H);
  }
  pipeRough = toTexture(canvas, false);
  return pipeRough;
}

let grilleMap: THREE.CanvasTexture | null = null;

/** Dark louvre/mesh face used behind vent slats and inside fan housings. */
export function buildGrilleTexture(): THREE.CanvasTexture {
  if (grilleMap) return grilleMap;
  const S = 128;
  const { canvas, g } = canvas2d(S, S);
  g.fillStyle = '#1b2027';
  g.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 8) {
    g.fillStyle = 'rgba(112,122,136,0.6)';
    g.fillRect(0, y, S, 3);
    g.fillStyle = 'rgba(6,8,11,0.6)';
    g.fillRect(0, y + 3, S, 2);
  }
  for (let x = 0; x < S; x += 8) {
    g.fillStyle = 'rgba(78,86,96,0.3)';
    g.fillRect(x, 0, 2, S);
  }
  grilleMap = toTexture(canvas, true);
  return grilleMap;
}

/* ------------------------------------------------------------------------------------------
 * Multiply decals.
 *
 * These are drawn on an OPAQUE white base, not on a cleared (transparent) canvas. Canvas 2D
 * stores premultiplied alpha, so a cleared texel arrives in the shader as rgb = 0; under
 * MultiplyBlending that paints a hard black rectangle over whatever the decal quad covers,
 * which is exactly the kind of dead pure-black the value audit flagged. White = no-op is the
 * only safe neutral for a multiply decal.
 * ---------------------------------------------------------------------------------------- */

function decalTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  return tex;
}

let dripMap: THREE.CanvasTexture | null = null;

/**
 * Corrosion bloom around a leaking joint: a rust-brown core with radial runs feathering to
 * white (no-op) well before the quad's edge.
 */
export function buildCeilingDripTexture(): THREE.CanvasTexture {
  if (dripMap) return dripMap;
  const S = 256;
  const { canvas, g } = canvas2d(S, S);
  const rnd = mulberry32(0x6b2e);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, S, S);

  const core = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.44);
  core.addColorStop(0, 'rgba(96,70,44,0.85)');
  core.addColorStop(0.45, 'rgba(140,112,80,0.45)');
  core.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = core;
  g.fillRect(0, 0, S, S);

  for (let i = 0; i < 30; i++) {
    const a = rnd() * Math.PI * 2;
    const len = 26 + rnd() * 82;
    const x = S / 2 + Math.cos(a) * (8 + rnd() * 24);
    const y = S / 2 + Math.sin(a) * (8 + rnd() * 24);
    const grad = g.createLinearGradient(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len);
    grad.addColorStop(0, `rgba(104,72,42,${0.4 + rnd() * 0.3})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.strokeStyle = grad;
    g.lineWidth = 2 + rnd() * 7;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  // A few darker pits right at the joint.
  for (let i = 0; i < 14; i++) {
    const x = S / 2 + (rnd() - 0.5) * S * 0.5;
    const y = S / 2 + (rnd() - 0.5) * S * 0.5;
    const r = 4 + rnd() * 15;
    const d = g.createRadialGradient(x, y, 0, x, y, r);
    d.addColorStop(0, `rgba(76,50,28,${0.4 + rnd() * 0.3})`);
    d.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = d;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  dripMap = decalTexture(canvas);
  return dripMap;
}

let sootMap: THREE.CanvasTexture | null = null;

/**
 * Heat/soot bloom for the plating directly above a lamp: a warm-grey halo darkening to a
 * carbon core, with feathered convection tongues licking outward. Multiply decal.
 */
export function buildCeilingSootTexture(): THREE.CanvasTexture {
  if (sootMap) return sootMap;
  const S = 256;
  const { canvas, g } = canvas2d(S, S);
  const rnd = mulberry32(0x2a7f);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, S, S);

  // Convection tongues first, so the core sits on top of them.
  for (let i = 0; i < 46; i++) {
    const a = rnd() * Math.PI * 2;
    const len = 40 + rnd() * 78;
    const grad = g.createLinearGradient(
      S / 2, S / 2, S / 2 + Math.cos(a) * len, S / 2 + Math.sin(a) * len,
    );
    grad.addColorStop(0, `rgba(72,66,60,${0.3 + rnd() * 0.25})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.strokeStyle = grad;
    g.lineWidth = 6 + rnd() * 20;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(S / 2, S / 2);
    g.lineTo(S / 2 + Math.cos(a) * len, S / 2 + Math.sin(a) * len);
    g.stroke();
  }

  // Warm scorch ring, then the carbon core.
  const ring = g.createRadialGradient(S / 2, S / 2, S * 0.1, S / 2, S / 2, S * 0.46);
  ring.addColorStop(0, 'rgba(150,120,86,0.35)');
  ring.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = ring;
  g.fillRect(0, 0, S, S);

  const core = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.24);
  core.addColorStop(0, 'rgba(46,42,40,0.82)');
  core.addColorStop(0.6, 'rgba(96,88,80,0.4)');
  core.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = core;
  g.fillRect(0, 0, S, S);

  // Speckle so the core is not a clean airbrushed blob.
  for (let i = 0; i < 220; i++) {
    const a = rnd() * Math.PI * 2;
    const d = rnd() * rnd() * S * 0.44;
    const x = S / 2 + Math.cos(a) * d;
    const y = S / 2 + Math.sin(a) * d;
    g.fillStyle = `rgba(56,52,48,${0.1 + rnd() * 0.3})`;
    g.beginPath();
    g.arc(x, y, 1 + rnd() * 4, 0, Math.PI * 2);
    g.fill();
  }

  sootMap = decalTexture(canvas);
  return sootMap;
}

let streakMap: THREE.CanvasTexture | null = null;

/**
 * Directional grime/condensate streaking for the plating a pipe run passes under: strong at
 * the top of the quad (up against the pipe) and fading out along it. Multiply decal.
 */
export function buildCeilingStreakTexture(): THREE.CanvasTexture {
  if (streakMap) return streakMap;
  const W = 128;
  const H = 256;
  const { canvas, g } = canvas2d(W, H);
  const rnd = mulberry32(0x91c4);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, W, H);

  for (let i = 0; i < 60; i++) {
    const x = rnd() * W;
    const w = 1 + rnd() * 9;
    // Never start flush with the quad's top edge, or the decal shows a hard cut-off line.
    const top = H * 0.07 + rnd() * H * 0.2;
    const len = H * (0.3 + rnd() * 0.6);
    const grad = g.createLinearGradient(0, top, 0, top + len);
    const v = 60 + rnd() * 70;
    grad.addColorStop(0, `rgba(${v},${v - 6},${v - 14},${0.3 + rnd() * 0.32})`);
    grad.addColorStop(0.35, `rgba(${v + 20},${v + 12},${v},${0.2 + rnd() * 0.2})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(x, top, w, len);
  }
  // Rusty condensate blotches where the streaks originate.
  for (let i = 0; i < 22; i++) {
    const x = rnd() * W;
    const y = H * 0.09 + rnd() * H * 0.24;
    const r = 5 + rnd() * 20;
    const d = g.createRadialGradient(x, y, 0, x, y, r);
    d.addColorStop(0, `rgba(112,80,48,${0.3 + rnd() * 0.3})`);
    d.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = d;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // Feather the left/right edges so the quad never shows a hard vertical cut.
  const edge = g.createLinearGradient(0, 0, W, 0);
  edge.addColorStop(0, 'rgba(255,255,255,1)');
  edge.addColorStop(0.16, 'rgba(255,255,255,0)');
  edge.addColorStop(0.84, 'rgba(255,255,255,0)');
  edge.addColorStop(1, 'rgba(255,255,255,1)');
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = edge;
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'source-over';

  streakMap = decalTexture(canvas);
  return streakMap;
}
