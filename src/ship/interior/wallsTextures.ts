import * as THREE from 'three';

/**
 * Procedural canvas textures owned by the wall piece. The shared PBR photo set (`ship_wall`) is a
 * uniformly rust-orange scan — stretched across 100+ square metres of hull it is the single
 * largest palette deviation from the reference, so the walls paint their own cool grey-steel
 * plate maps here instead and keep corrosion as a small, motivated decal pass.
 */

type PlateVariant = 'steel' | 'painted' | 'dark' | 'deep';

interface PlateSpec {
  base: string;
  hi: string;
  lo: string;
  seam: string;
  /** Bright bare metal revealed where paint chips and scratches cut through the finish. */
  bare: string;
  /** Roughness and metalness of the intact surface, before per-texel wear modulates them. */
  rough: number;
  metal: number;
  /** How readily this finish chips at plate corners — 0 for bare steel, 1 for paint. */
  chip: number;
}

const PLATE: Record<PlateVariant, PlateSpec> = {
  // Wall steel, upper structure — cool desaturated grey-blue (#5d666f – #7c858f).
  steel: { base: '#69727b', hi: '#7d868f', lo: '#4d545c', seam: '#343a41', bare: '#9aa2ac', rough: 0.56, metal: 0.86, chip: 0.35 },
  // Painted band. Paint is a dielectric film, so it sits near metalness 0 and much rougher than
  // the bare steel around it — that difference is what stops the wall reading as one plastic.
  painted: { base: '#7e848c', hi: '#8f959c', lo: '#666c74', seam: '#474d54', bare: '#8e959e', rough: 0.79, metal: 0.05, chip: 1 },
  // Recessed / shadowed steel (#2b3138 – #3d444c).
  dark: { base: '#363d45', hi: '#434b53', lo: '#292f36', seam: '#1e232a', bare: '#7b838d', rough: 0.6, metal: 0.78, chip: 0.5 },
  // Deep recess backing. Kept well off pure black: the reference has almost no true black
  // anywhere, its shadows still carry material, and crushed blacks were a measured miss.
  deep: { base: '#2a3037', hi: '#333941', lo: '#22272d', seam: '#191d22', bare: '#5e666f', rough: 0.88, metal: 0.4, chip: 0.2 },
};

function canvas2d(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const el = document.createElement('canvas');
  el.width = w;
  el.height = h;
  return [el, el.getContext('2d')!];
}

function finish(el: HTMLCanvasElement, repeat = true, srgb = true): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(el);
  // Normal and ORM maps carry measurements, not colour — tagging them sRGB would gamma-decode
  // the numbers and silently flatten every roughness difference this pass exists to create.
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  } else {
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
  }
  tex.anisotropy = 8;
  return tex;
}

function drawLetterSpaced(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, spacing: number): void {
  const widths = [...text].map((c) => ctx.measureText(c).width + spacing);
  const total = widths.reduce((a, b) => a + b, 0) - spacing;
  let x = cx - total / 2;
  for (let i = 0; i < text.length; i++) {
    ctx.fillText(text[i], x, y);
    x += widths[i];
  }
}

/** One bolt head: dark socket ring with a lit top-left crescent, so it reads as raised. */
function drawBolt(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y + r * 0.35, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(150,158,168,0.85)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.55, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(198,205,214,0.7)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.34, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(30,35,41,0.75)';
  ctx.fill();
}

/**
 * Converts a grayscale height canvas to a tangent-space (GL convention) normal map. The plate
 * relief — seam grooves, raised bolt heads, weld beads, gouges — has to reach the shader as a
 * normal perturbation, not just an albedo shade, or every surface keeps the single flat
 * untextured response the critic called out.
 */
function heightToNormal(hgt: HTMLCanvasElement, strength: number): HTMLCanvasElement {
  const size = hgt.width;
  const src = hgt.getContext('2d')!.getImageData(0, 0, size, size).data;
  const [el, ctx] = canvas2d(size, size);
  const out = ctx.createImageData(size, size);
  // Wrapped sampling: the plate map tiles, so its normal map has to tile with it.
  const at = (x: number, y: number) => src[((((y % size) + size) % size) * size + (((x % size) + size) % size)) * 4] / 255;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      // Canvas rows run downward while V runs upward, so the V derivative flips sign twice and
      // green ends up as +dy in canvas space.
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      out.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      out.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      out.data[i + 2] = (1 / len) * 0.5 * 255 + 127.5;
      out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return el;
}

/** Packs two grayscale canvases into one ORM texture: G = roughness, B = metalness. */
function packOrm(rough: HTMLCanvasElement, metal: HTMLCanvasElement): THREE.CanvasTexture {
  const size = rough.width;
  const r = rough.getContext('2d')!.getImageData(0, 0, size, size).data;
  const m = metal.getContext('2d')!.getImageData(0, 0, size, size).data;
  const [el, ctx] = canvas2d(size, size);
  const out = ctx.createImageData(size, size);
  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] = 255;
    out.data[i + 1] = r[i];
    out.data[i + 2] = m[i];
    out.data[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  return finish(el, true, false);
}

export interface PlateMaps {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  /** G = roughness, B = metalness. Feed to both `roughnessMap` and `metalnessMap`. */
  ormMap: THREE.CanvasTexture;
}

/**
 * Tileable bolted-plate PBR set. `cols`/`rows` subdivide one tile into individual plates, each
 * with its own tone, a chamfered seam groove and corner bolts — so the tiling rate directly sets
 * the apparent plate size (aim for 0.5–1.5 m per plate at the mesh's repeat).
 *
 * Albedo, height and the two ORM channels are painted in one pass so every feature agrees across
 * all three maps: a seam is dark *and* recessed *and* rougher *and* less metallic (grime is a
 * dielectric), a bolt head is proud *and* polished *and* bare metal, a paint chip exposes steel.
 * That correlation is what separates a material from a tinted plastic.
 */
export function buildWallPlateSet(variant: PlateVariant, cols = 2, rows = 2): PlateMaps {
  const size = 512;
  const [el, ctx] = canvas2d(size, size);
  const [hEl, h] = canvas2d(size, size);
  const [rEl, r] = canvas2d(size, size);
  const [mEl, m] = canvas2d(size, size);
  const pal = PLATE[variant];
  const cw = size / cols;
  const ch = size / rows;
  const g = (v: number) => `rgb(${Math.round(Math.min(1, Math.max(0, v)) * 255)},${Math.round(Math.min(1, Math.max(0, v)) * 255)},${Math.round(Math.min(1, Math.max(0, v)) * 255)})`;

  ctx.fillStyle = pal.base;
  ctx.fillRect(0, 0, size, size);
  h.fillStyle = g(0.5);
  h.fillRect(0, 0, size, size);
  r.fillStyle = g(pal.rough);
  r.fillRect(0, 0, size, size);
  m.fillStyle = g(pal.metal);
  m.fillRect(0, 0, size, size);

  // Per-plate variation — adjacent plates in the reference are never the same value, and a plate
  // that was replaced later is both cleaner and slightly proud of its neighbours.
  for (let row = 0; row < rows; row++) {
    for (let c = 0; c < cols; c++) {
      const fresh = Math.random() < 0.5;
      ctx.fillStyle = fresh ? pal.hi : pal.lo;
      ctx.globalAlpha = 0.1 + Math.random() * 0.16;
      ctx.fillRect(c * cw, row * ch, cw, ch);
      ctx.globalAlpha = 1;
      h.fillStyle = g(0.5 + (fresh ? 0.03 : -0.03));
      h.fillRect(c * cw, row * ch, cw, ch);
      r.fillStyle = g(pal.rough * (fresh ? 0.9 : 1.06));
      r.fillRect(c * cw, row * ch, cw, ch);
    }
  }

  // Brushed-metal grain: dense faint horizontal strokes, anisotropic in roughness too.
  for (let i = 0; i < 900; i++) {
    const y = Math.random() * size;
    const x = Math.random() * size;
    const len = 20 + Math.random() * 130;
    const up = Math.random() < 0.5;
    ctx.strokeStyle = up ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.045)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y + (Math.random() - 0.5) * 1.5);
    ctx.stroke();
    r.strokeStyle = up ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)';
    r.lineWidth = 1;
    r.beginPath();
    r.moveTo(x, y);
    r.lineTo(x + len, y);
    r.stroke();
    h.strokeStyle = up ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
    h.lineWidth = 1;
    h.beginPath();
    h.moveTo(x, y);
    h.lineTo(x + len, y);
    h.stroke();
  }

  // Seam grooves on every plate boundary: dark slot, lit lower lip, recessed in height, and
  // rougher plus less metallic because that is exactly where grime collects.
  const seam = (x0: number, y0: number, x1: number, y1: number) => {
    const horiz = y0 === y1;
    ctx.strokeStyle = pal.seam;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(190,198,208,0.28)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x0 + (horiz ? 0 : 2), y0 + (horiz ? 2 : 0));
    ctx.lineTo(x1 + (horiz ? 0 : 2), y1 + (horiz ? 2 : 0));
    ctx.stroke();

    h.strokeStyle = g(0.18);
    h.lineWidth = 3;
    h.beginPath();
    h.moveTo(x0, y0);
    h.lineTo(x1, y1);
    h.stroke();

    r.strokeStyle = g(Math.min(1, pal.rough * 1.3 + 0.12));
    r.lineWidth = 6;
    r.beginPath();
    r.moveTo(x0, y0);
    r.lineTo(x1, y1);
    r.stroke();

    m.strokeStyle = g(pal.metal * 0.35);
    m.lineWidth = 6;
    m.beginPath();
    m.moveTo(x0, y0);
    m.lineTo(x1, y1);
    m.stroke();
  };
  for (let c = 0; c <= cols; c++) seam(c * cw, 0, c * cw, size);
  for (let row = 0; row <= rows; row++) seam(0, row * ch, size, row * ch);

  // Corner bolts, wrapped so tile edges line up with their neighbours. A bolt is proud, polished
  // by the spanner that drove it, and always bare metal whatever the surface around it is.
  const inset = Math.min(cw, ch) * 0.12;
  const br = Math.max(2.4, Math.min(cw, ch) * 0.028);
  const boltMaps = (x: number, y: number) => {
    h.fillStyle = g(0.86);
    h.beginPath();
    h.arc(x, y, br, 0, Math.PI * 2);
    h.fill();
    r.fillStyle = g(0.24);
    r.beginPath();
    r.arc(x, y, br * 1.15, 0, Math.PI * 2);
    r.fill();
    m.fillStyle = g(0.97);
    m.beginPath();
    m.arc(x, y, br * 1.15, 0, Math.PI * 2);
    m.fill();
  };
  for (let row = 0; row <= rows; row++) {
    for (let c = 0; c <= cols; c++) {
      const bx = c * cw + (c === 0 ? inset : c === cols ? -inset : 0);
      const by = row * ch + (row === 0 ? inset : row === rows ? -inset : 0);
      if (c > 0 && c < cols) {
        drawBolt(ctx, c * cw - inset, by, br);
        boltMaps(c * cw - inset, by);
        drawBolt(ctx, c * cw + inset, by, br);
        boltMaps(c * cw + inset, by);
      } else {
        drawBolt(ctx, bx, by, br);
        boltMaps(bx, by);
      }
    }
  }

  // Weld beads and gouges. A gouge cuts through the finish, so it reads as bright bare metal:
  // low roughness, full metalness, and a real dent in the height field.
  for (let i = 0; i < 18; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const dx = (Math.random() - 0.5) * 90;
    const dy = (Math.random() - 0.5) * 40;
    const bead = Math.random() < 0.45;
    const lw = 0.8 + Math.random() * 1.4;
    const stroke = (c: CanvasRenderingContext2D, style: string, width: number) => {
      c.strokeStyle = style;
      c.lineWidth = width;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + dx, y + dy);
      c.stroke();
    };
    stroke(ctx, bead ? `rgba(25,29,34,${0.12 + Math.random() * 0.16})` : `${pal.bare}`, lw);
    stroke(h, g(bead ? 0.66 : 0.34), lw * 1.4);
    stroke(r, g(bead ? Math.min(1, pal.rough * 1.2) : 0.31), lw * 1.8);
    stroke(m, g(bead ? pal.metal : 0.95), lw * 1.8);
  }

  // Paint chipping at plate corners — where a trolley, a boot or a dropped tool actually lands.
  // Chips expose bare steel, which is the sharpest material contrast on a painted wall.
  if (pal.chip > 0) {
    const chips = Math.round(26 * pal.chip);
    for (let i = 0; i < chips; i++) {
      // Bias toward seams and corners rather than scattering uniformly over the plate face.
      const cx = Math.round(Math.random() * cols) * cw + (Math.random() - 0.5) * cw * 0.34;
      const cy = Math.round(Math.random() * rows) * ch + (Math.random() - 0.5) * ch * 0.34;
      const rad = 2 + Math.random() * 7;
      const blob = (c: CanvasRenderingContext2D, style: string) => {
        c.fillStyle = style;
        c.beginPath();
        for (let k = 0; k <= 7; k++) {
          const a = (k / 7) * Math.PI * 2;
          const rr = rad * (0.55 + Math.random() * 0.7);
          const px = cx + Math.cos(a) * rr;
          const py = cy + Math.sin(a) * rr;
          if (k === 0) c.moveTo(px, py);
          else c.lineTo(px, py);
        }
        c.closePath();
        c.fill();
      };
      blob(ctx, pal.bare);
      blob(h, g(0.42));
      blob(r, g(0.34));
      blob(m, g(0.94));
    }
  }

  // Large soft grime blotches: the low-frequency break-up that stops the tiling reading as tiling,
  // and the reason no two square metres of this wall share a roughness.
  for (let i = 0; i < 7; i++) {
    const cx = Math.random() * size;
    const cy = Math.random() * size;
    const rad = size * (0.12 + Math.random() * 0.3);
    const soft = (c: CanvasRenderingContext2D, inner: string, outer: string) => {
      const grad = c.createRadialGradient(cx, cy, 0, cx, cy, rad);
      grad.addColorStop(0, inner);
      grad.addColorStop(1, outer);
      c.fillStyle = grad;
      c.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    };
    soft(ctx, 'rgba(34,31,27,0.3)', 'rgba(34,31,27,0)');
    soft(r, 'rgba(255,255,255,0.28)', 'rgba(255,255,255,0)');
    soft(m, 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0)');
  }

  return {
    map: finish(el),
    normalMap: finish(heightToNormal(hEl, 5.5), true, false),
    ormMap: packOrm(rEl, mEl),
  };
}

/**
 * Shared roughness break-up for the flat-coloured trim, housings and castings. Values sit near
 * white with darker polished patches, because `roughnessMap` multiplies: the map can only smooth
 * a surface, so each material declares its dirtiest state and the map wears it back.
 */
export function buildGrungeRoughTexture(): THREE.CanvasTexture {
  const size = 256;
  const [el, ctx] = canvas2d(size, size);
  ctx.fillStyle = '#f2f2f2';
  ctx.fillRect(0, 0, size, size);
  // Broad handled/rubbed areas polished smooth.
  for (let i = 0; i < 26; i++) {
    const cx = Math.random() * size;
    const cy = Math.random() * size;
    const rad = size * (0.05 + Math.random() * 0.22);
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    const v = 130 + Math.random() * 80;
    grad.addColorStop(0, `rgba(${v},${v},${v},0.75)`);
    grad.addColorStop(1, `rgba(${v},${v},${v},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
  }
  // Fine wipe marks and micro-scratches.
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const len = 4 + Math.random() * 48;
    const a = Math.random() * Math.PI * 2;
    ctx.strokeStyle = `rgba(${Math.random() < 0.6 ? '150,150,150' : '255,255,255'},${0.08 + Math.random() * 0.3})`;
    ctx.lineWidth = 0.6 + Math.random() * 1.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  return finish(el, true, false);
}

/**
 * Dust and finger film for glazing. Glass is the smoothest thing on the wall, but perfectly clean
 * glass on a working ship is a tell — the film breaks its reflection into patches.
 */
export function buildDustFilmTexture(): THREE.CanvasTexture {
  const size = 256;
  const [el, ctx] = canvas2d(size, size);
  ctx.fillStyle = '#1c1c1c';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 34; i++) {
    const cx = Math.random() * size;
    const cy = Math.random() * size;
    const rad = size * (0.04 + Math.random() * 0.2);
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    const v = 130 + Math.random() * 110;
    grad.addColorStop(0, `rgba(${v},${v},${v},0.5)`);
    grad.addColorStop(1, `rgba(${v},${v},${v},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
  }
  // Wiper arcs — someone cleaned this pane once, badly.
  for (let i = 0; i < 7; i++) {
    ctx.strokeStyle = `rgba(210,210,210,${0.12 + Math.random() * 0.2})`;
    ctx.lineWidth = 5 + Math.random() * 16;
    ctx.beginPath();
    ctx.arc(size * (0.2 + Math.random() * 0.6), size * 1.1, size * (0.35 + Math.random() * 0.5), Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  }
  return finish(el, true, false);
}

/**
 * Contact-shadow pooling where the wall meets the ceiling: a soft dark band at the top edge,
 * gone by a third of the way down. The brief's "shadow pooling" gap is a grounding problem as
 * much as a lighting one — every bay's top seam is a real occluded corner in the reference, and
 * a flat, unshadowed top edge is what makes a lit panel read as a floating cutout instead of a
 * bolted-in plate. Multiply-blended like the floor grime, and kept off pure black (max ~0.35
 * darkening) so the seam still carries material under it rather than crushing to a void.
 */
export function buildUpperAOTexture(): THREE.CanvasTexture {
  const w = 512;
  const hgt = 200;
  const [el, ctx] = canvas2d(w, hgt);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, hgt);
  const grad = ctx.createLinearGradient(0, 0, 0, hgt);
  grad.addColorStop(0, 'rgba(96,98,102,1)');
  grad.addColorStop(0.4, 'rgba(190,190,192,1)');
  grad.addColorStop(1, 'rgba(255,255,255,1)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, hgt);
  // Uneven soot/condensation streaks dropping from the seam, so the band reads as accumulated
  // grime rather than a rendered gradient.
  for (let i = 0; i < 46; i++) {
    const x = Math.random() * w;
    const len = hgt * (0.15 + Math.random() * 0.55);
    const wdt = 3 + Math.random() * 14;
    const g = ctx.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, 'rgba(70,70,72,0.55)');
    g.addColorStop(1, 'rgba(70,70,72,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - wdt / 2, 0, wdt, len);
  }
  return finish(el);
}

/**
 * Splash-and-scuff dirt loading for the bottom of the wall, densest at the deck and gone by waist
 * height. Multiply-blended, so it darkens the plate underneath rather than painting a tint over it.
 */
export function buildLowerDirtTexture(): THREE.CanvasTexture {
  const w = 512;
  const hgt = 256;
  const [el, ctx] = canvas2d(w, hgt);
  // White is the multiply identity, so the untouched upper band leaves the wall alone.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, hgt);
  const grad = ctx.createLinearGradient(0, 0, 0, hgt);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(148,143,133,1)');
  grad.addColorStop(0.82, 'rgba(96,92,84,1)');
  grad.addColorStop(1, 'rgba(74,71,66,1)');
  ctx.fillStyle = grad;
  ctx.globalAlpha = 0.9;
  ctx.fillRect(0, 0, w, hgt);
  ctx.globalAlpha = 1;

  // Splash flecks thrown up off the deck, thinning with height.
  for (let i = 0; i < 520; i++) {
    const t = Math.pow(Math.random(), 0.45);
    const y = hgt - t * hgt * 0.85;
    const x = Math.random() * w;
    const rad = 0.8 + Math.random() * 3.4;
    ctx.fillStyle = `rgba(${70 + Math.random() * 40 | 0},${68 + Math.random() * 38 | 0},${64 + Math.random() * 34 | 0},${0.2 + Math.random() * 0.45})`;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  // Mop-line and heel scuffs along the walking lane.
  for (let i = 0; i < 90; i++) {
    const y = hgt * (0.55 + Math.random() * 0.45);
    const x = Math.random() * w;
    ctx.strokeStyle = `rgba(88,84,78,${0.12 + Math.random() * 0.28})`;
    ctx.lineWidth = 1 + Math.random() * 5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 10 + Math.random() * 90, y + (Math.random() - 0.5) * 5);
    ctx.stroke();
  }
  return finish(el);
}

/** Pebbled seal rubber — matte, non-metallic, and the darkest thing on the wall that still reads. */
export function buildRubberTexture(): THREE.CanvasTexture {
  const size = 128;
  const [el, ctx] = canvas2d(size, size);
  ctx.fillStyle = '#2c2f33';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const rad = 0.6 + Math.random() * 2.2;
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.16)';
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(el);
}

/** Horizontal louvre slats for extract vents and cabinet grilles. Tiles vertically. */
export function buildLouverTexture(slats = 10): THREE.CanvasTexture {
  const w = 128;
  const h = 128;
  const [el, ctx] = canvas2d(w, h);
  ctx.fillStyle = '#39414a';
  ctx.fillRect(0, 0, w, h);
  const pitch = h / slats;
  for (let i = 0; i < slats; i++) {
    const y = i * pitch;
    // The slot behind a slat is the darkest value on the wall, but it still carries a graded
    // falloff rather than sitting at pure black — crushed shadows were a measured miss.
    const slot = ctx.createLinearGradient(0, y + pitch * 0.18, 0, y + pitch * 0.68);
    slot.addColorStop(0, '#171b20');
    slot.addColorStop(1, '#252b32');
    ctx.fillStyle = slot;
    ctx.fillRect(0, y + pitch * 0.18, w, pitch * 0.5);
    ctx.fillStyle = 'rgba(168,178,190,0.6)';
    ctx.fillRect(0, y + pitch * 0.68, w, pitch * 0.16);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(0, y + pitch * 0.84, w, pitch * 0.1);
  }
  // Dust caught on the upper lip of every slat.
  for (let i = 0; i < 140; i++) {
    const x = Math.random() * w;
    const s = Math.floor(Math.random() * slats);
    ctx.fillStyle = `rgba(126,120,108,${0.1 + Math.random() * 0.25})`;
    ctx.fillRect(x, s * pitch + pitch * 0.66, 1 + Math.random() * 7, 1.4);
  }
  // Frame rails down each side so the grille reads as a fitted insert, not a painted stripe.
  ctx.fillStyle = '#5a626b';
  ctx.fillRect(0, 0, 7, h);
  ctx.fillRect(w - 7, 0, 7, h);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(7, 0, 2, h);
  ctx.fillRect(w - 9, 0, 2, h);
  return finish(el);
}

/**
 * What is visible through a glazed wall bay: an adjoining lit compartment. Painted with its own
 * depth (slatted blinds, machinery silhouettes, a cyan monitor, a warm ceiling strip) so a single
 * emissive plane behind a protruding frame reads as a real room rather than a coloured pane.
 */
export function buildWindowInteriorTexture(seed = 0): THREE.CanvasTexture {
  const w = 512;
  const h = 256;
  const [el, ctx] = canvas2d(w, h);

  ctx.fillStyle = '#12161d';
  ctx.fillRect(0, 0, w, h);

  // Warm olive back wall, brighter toward the ceiling where the interior strip lights sit.
  const back = ctx.createLinearGradient(0, 0, 0, h);
  back.addColorStop(0, '#9c8a4e');
  back.addColorStop(0.45, '#7a6c3c');
  back.addColorStop(1, '#2b2a1e');
  ctx.fillStyle = back;
  ctx.fillRect(0, 0, w, h);

  // Warm ceiling strip inside the far compartment.
  ctx.fillStyle = 'rgba(255,217,160,0.85)';
  ctx.fillRect(w * 0.1, 8, w * 0.8, 6);
  ctx.fillStyle = 'rgba(255,217,160,0.22)';
  ctx.fillRect(w * 0.05, 2, w * 0.9, 26);

  // Machinery silhouettes along the far floor — the mid-ground layer.
  const rnd = (() => {
    let s = 1337 + seed * 977;
    return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  })();
  for (let i = 0; i < 11; i++) {
    const bw = 22 + rnd() * 70;
    const bh = 30 + rnd() * 95;
    const x = rnd() * (w - bw);
    ctx.fillStyle = `rgba(11,14,19,${0.72 + rnd() * 0.22})`;
    ctx.fillRect(x, h - bh, bw, bh);
    ctx.fillStyle = 'rgba(120,132,146,0.16)';
    ctx.fillRect(x, h - bh, bw, 2);
  }

  // Vertical structure behind the glass.
  for (let i = 0; i < 6; i++) {
    const x = 20 + rnd() * (w - 40);
    ctx.fillStyle = 'rgba(14,17,22,0.5)';
    ctx.fillRect(x, 0, 5 + rnd() * 7, h);
  }

  // Cool screens — the reference keeps every screen and LED cyan against the warm practicals.
  for (let i = 0; i < 4; i++) {
    const sw = 16 + rnd() * 34;
    const sh = 12 + rnd() * 22;
    const x = 20 + rnd() * (w - 60);
    const y = 40 + rnd() * (h * 0.45);
    ctx.fillStyle = 'rgba(8,12,16,0.9)';
    ctx.fillRect(x - 2, y - 2, sw + 4, sh + 4);
    ctx.fillStyle = 'rgba(79,216,240,0.85)';
    ctx.fillRect(x, y, sw, sh);
    ctx.fillStyle = 'rgba(168,240,255,0.9)';
    for (let l = 0; l < 4; l++) ctx.fillRect(x + 2, y + 3 + l * 4, sw * (0.3 + rnd() * 0.6), 1.5);
  }
  // One tall cyan indicator column, the crop's brightest interior element.
  ctx.fillStyle = 'rgba(120,232,250,0.95)';
  ctx.fillRect(w * 0.17, h * 0.18, 7, h * 0.62);
  ctx.fillStyle = 'rgba(120,232,250,0.2)';
  ctx.fillRect(w * 0.17 - 8, h * 0.16, 23, h * 0.66);

  // Slatted blinds pulled most of the way down.
  for (let y = 0; y < h * 0.92; y += 7) {
    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    ctx.fillRect(0, y, w, 3);
    ctx.fillStyle = 'rgba(255,236,190,0.07)';
    ctx.fillRect(0, y + 3, w, 1);
  }

  // Glass: dirt film, a diagonal reflection streak and a hard edge vignette.
  const refl = ctx.createLinearGradient(0, h, w * 0.6, 0);
  refl.addColorStop(0, 'rgba(200,225,255,0)');
  refl.addColorStop(0.55, 'rgba(200,225,255,0.1)');
  refl.addColorStop(0.75, 'rgba(200,225,255,0)');
  ctx.fillStyle = refl;
  ctx.fillRect(0, 0, w, h);
  const vig = ctx.createRadialGradient(w / 2, h / 2, h * 0.25, w / 2, h / 2, w * 0.62);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);

  return finish(el, false);
}

/** Diagonal hazard chevrons on a transparent ground, for painting onto plate. */
export function buildChevronTexture(color = '#d8a63a', bars = 5): THREE.CanvasTexture {
  const w = 256;
  const h = 128;
  const [el, ctx] = canvas2d(w, h);
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.PI / 4);
  const span = w * 1.6;
  const pitch = span / (bars * 2);
  ctx.fillStyle = color;
  for (let i = -bars; i <= bars; i++) {
    ctx.fillRect(i * pitch * 2, -span / 2, pitch, span);
  }
  ctx.restore();

  // Paint wears off first where boots and crates hit it — speckle the alpha, don't tint it.
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] === 0) continue;
    if (Math.random() < 0.22) img.data[i + 3] = Math.max(0, img.data[i + 3] - Math.random() * 210);
  }
  ctx.putImageData(img, 0, 0);
  return finish(el, false);
}

/** Bone-white letter-spaced stencil lettering on a transparent ground. */
export function buildStencilTextTexture(text: string, px = 74): THREE.CanvasTexture {
  const w = 1024;
  const h = 192;
  const [el, ctx] = canvas2d(w, h);
  ctx.clearRect(0, 0, w, h);
  ctx.font = `bold ${px}px monospace`;
  ctx.textAlign = 'start';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(214,208,196,0.62)';
  drawLetterSpaced(ctx, text, w / 2, h / 2, px * 0.22);
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] === 0) continue;
    if (Math.random() < 0.16) img.data[i + 3] = Math.max(0, img.data[i + 3] - Math.random() * 190);
  }
  ctx.putImageData(img, 0, 0);
  return finish(el, false);
}

/**
 * Localised corrosion: rust bleed and grime running downward from a joint or pipe. Meant for a
 * small decal plane at the actual drip source, not a full-wall tint.
 */
export function buildDripTexture(): THREE.CanvasTexture {
  const size = 256;
  const [el, ctx] = canvas2d(size, size);
  ctx.clearRect(0, 0, size, size);

  // Corrosion bloom hugging the top edge (the joint).
  const bloom = ctx.createLinearGradient(0, 0, 0, size * 0.4);
  bloom.addColorStop(0, 'rgba(140,84,42,0.5)');
  bloom.addColorStop(1, 'rgba(140,84,42,0)');
  ctx.fillStyle = bloom;
  ctx.fillRect(0, 0, size, size * 0.4);

  for (let i = 0; i < 26; i++) {
    const x = Math.random() * size;
    const len = size * (0.2 + Math.random() * 0.75);
    const wdt = 1.5 + Math.random() * 7;
    const rust = Math.random() < 0.55;
    const g = ctx.createLinearGradient(0, 0, 0, len);
    const a = 0.16 + Math.random() * 0.3;
    g.addColorStop(0, rust ? `rgba(150,90,46,${a})` : `rgba(16,19,24,${a})`);
    g.addColorStop(0.55, rust ? `rgba(120,72,38,${a * 0.6})` : `rgba(16,19,24,${a * 0.6})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.translate(x, 0);
    ctx.fillStyle = g;
    ctx.fillRect(-wdt / 2, 0, wdt, len);
    ctx.restore();
  }
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size * 0.6;
    const r = 1 + Math.random() * 5;
    ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '158,96,50' : '20,23,28'},${0.1 + Math.random() * 0.25})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(el, false);
}

/** Scuff band for walking lanes and corners — dark abraded paint, transparent elsewhere. */
export function buildScuffTexture(): THREE.CanvasTexture {
  const w = 256;
  const h = 128;
  const [el, ctx] = canvas2d(w, h);
  ctx.clearRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const len = 6 + Math.random() * 70;
    ctx.strokeStyle = `rgba(18,21,26,${0.08 + Math.random() * 0.24})`;
    ctx.lineWidth = 0.7 + Math.random() * 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y + (Math.random() - 0.5) * 6);
    ctx.stroke();
  }
  for (let i = 0; i < 22; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    ctx.fillStyle = `rgba(196,203,212,${0.05 + Math.random() * 0.14})`;
    ctx.fillRect(x, y, 3 + Math.random() * 26, 0.8 + Math.random() * 2);
  }
  return finish(el, false);
}
