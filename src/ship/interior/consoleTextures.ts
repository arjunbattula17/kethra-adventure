import * as THREE from 'three';

// Procedural surfacing for the nav-console piece. The shipped `ship_console` PBR albedo is a very
// dark brown corrugate, which is what made the console read as a black slab against the brief's
// "cool grey steel / bone-white paint" palette.
//
// Every plate family here is authored as three *registered* canvases baked in one pass — albedo,
// height (converted to a tangent normal) and a packed roughness/metalness map. A chip in the paint
// is therefore simultaneously a lighter albedo, a shallow dent in the normal and a drop to smooth
// bare metal in the roughness/metalness channels, which is the whole reason a chip reads as a chip
// under a moving light instead of as a printed sticker.

/** Deterministic PRNG so the wear pattern is identical between runs (and between builders). */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvas2d(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function finish(c: HTMLCanvasElement, repeat = true): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
  tex.anisotropy = 8;
  return tex;
}

/** Normal, roughness and metalness data must stay linear — sRGB decode would skew every value. */
function finishData(c: HTMLCanvasElement, repeat = true): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
  tex.anisotropy = 8;
  return tex;
}

/**
 * Sobel a greyscale height canvas into an OpenGL-convention tangent normal map. Canvas rows run
 * top-down while `flipY` puts row 0 at v = 1, so the canvas-space Y gradient is already the +green
 * direction three.js expects — no sign flip on `ny`.
 */
function heightToNormal(height: HTMLCanvasElement, strength: number): HTMLCanvasElement {
  const S = height.width;
  const src = height.getContext('2d')!.getImageData(0, 0, S, S).data;
  const [out, octx] = canvas2d(S, S);
  const img = octx.createImageData(S, S);
  const at = (x: number, y: number) => src[((((y % S) + S) % S) * S + (((x % S) + S) % S)) * 4] / 255;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const nx = -(at(x + 1, y) - at(x - 1, y)) * strength;
      const ny = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(nx, ny, 1);
      const i = (y * S + x) * 4;
      img.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / len) * 0.5 * 255 + 127.5;
      img.data[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

/** 0–1 roughness / metalness to the packed `rgb(_, G, B)` string three samples those channels from. */
function rm(rough: number, metal: number, alpha = 1): string {
  const g = Math.round(Math.max(0, Math.min(1, rough)) * 255);
  const b = Math.round(Math.max(0, Math.min(1, metal)) * 255);
  return `rgba(0,${g},${b},${alpha})`;
}

export type PlateVariant = 'bone' | 'steel' | 'dark';

export interface SurfaceMaps {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  /** Green = roughness, blue = metalness. Bound to `roughnessMap` and `metalnessMap` together. */
  ormMap: THREE.CanvasTexture;
}

interface PlateSpec {
  base: string;
  seam: string;
  hi: string;
  /** Colour of bare metal showing through a chip. */
  bare: string;
  seed: number;
  /** Base roughness of the intact surface, and of bare metal exposed at a chip. */
  rough: number;
  chipRough: number;
  /** Base metalness. Paint is a dielectric; only the chips underneath it are metal. */
  metal: number;
  chipMetal: number;
  /** Bare rolled steel gets a directional brush; painted surfaces do not. */
  brushed: boolean;
}

const PLATE: Record<PlateVariant, PlateSpec> = {
  // Bone-white hull paint. Pulled down from the previous near-#cbc4b4 — the measured median of
  // the last render sat well above the reference and this is the largest bright surface in frame.
  bone: {
    base: '#b0a99a', seam: '#6f695e', hi: '#cbc4b4', bare: '#9299a2', seed: 1337,
    rough: 0.66, chipRough: 0.34, metal: 0.03, chipMetal: 0.9, brushed: false,
  },
  // Bare brushed structural steel. Metalness pulled down from 0.9 — a near-fully-metallic surface
  // carries no diffuse term at all, so any patch of it outside a direct light's throw (and only
  // lit by ambient/hemisphere fill) rendered dead black, which is most of the r3 crushed-black
  // measurement. 0.72 still reads as a true metal off its specular highlights and brushed
  // anisotropy, but keeps a real diffuse floor so ambient light actually lifts it.
  steel: {
    base: '#838a94', seam: '#454c56', hi: '#a6aeb7', bare: '#c0c6cc', seed: 90210,
    rough: 0.46, chipRough: 0.26, metal: 0.72, chipMetal: 0.85, brushed: true,
  },
  // Shadowed structure and recessed faces. Deliberately a *dielectric* dark composite rather than
  // a dark metal: metals carry no diffuse term, and the last render's crushed-black percentage was
  // fourteen points above the reference. A painted dark grey still catches ambient and stays alive.
  // Base lifted again this round — r3's measured crushed% (23% vs the reference's 0.06%) shows the
  // previous floor still wasn't enough of a diffuse floor under only ambient/hemisphere light.
  dark: {
    base: '#4f5761', seam: '#30363e', hi: '#6b7480', bare: '#8b939c', seed: 5150,
    rough: 0.72, chipRough: 0.38, metal: 0.05, chipMetal: 0.85, brushed: false,
  },
};

const plateCache = new Map<PlateVariant, SurfaceMaps>();

/**
 * A bolted painted plate: two-by-two panel division with recessed seams, bolt heads at every panel
 * corner, chipped paint along the seams (bare metal under the paint) and grime pooling at the lower
 * edge and in the seam channels. One canvas tile reads as roughly a 1 m square of hull.
 */
export function buildPlateMaps(variant: PlateVariant): SurfaceMaps {
  const cached = plateCache.get(variant);
  if (cached) return cached;

  const S = 512;
  const [albedo, a] = canvas2d(S, S);
  const [height, hgt] = canvas2d(S, S);
  const [orm, o] = canvas2d(S, S);
  const p = PLATE[variant];
  const rand = rng(p.seed);

  a.fillStyle = p.base;
  a.fillRect(0, 0, S, S);
  // Mid grey is the flat-plate datum; darker sinks, lighter stands proud.
  hgt.fillStyle = '#808080';
  hgt.fillRect(0, 0, S, S);
  o.fillStyle = rm(p.rough, p.metal);
  o.fillRect(0, 0, S, S);

  // ---- Mottled paint / oxide variation. The roughness copy is what actually stops the surface
  // reading as one moulded plastic sheet; the albedo copy alone never did.
  for (let i = 0; i < 2600; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const w = 2 + rand() * 12;
    const h = 1 + rand() * 5;
    const dark = rand() < 0.5;
    a.fillStyle = dark ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.045)';
    a.fillRect(x, y, w, h);
    o.fillStyle = rm(p.rough + (dark ? 0.16 : -0.13), p.metal, 0.5);
    o.fillRect(x, y, w, h);
  }

  // ---- Brushed anisotropy on bare metal: long shallow roughness streaks along one axis, which is
  // what makes rolled steel smear a highlight sideways instead of pooling it into a plastic blob.
  if (p.brushed) {
    for (let i = 0; i < 900; i++) {
      const y = rand() * S;
      const len = 40 + rand() * 260;
      o.fillStyle = rm(p.rough + (rand() - 0.5) * 0.3, p.metal, 0.45);
      o.fillRect(rand() * S, y, len, 1);
      hgt.fillStyle = rand() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
      hgt.fillRect(rand() * S, y, len, 1);
    }
  }

  // Fine wipe streaks — a surface that gets cleaned in one direction.
  a.globalAlpha = 0.06;
  for (let i = 0; i < 260; i++) {
    a.fillStyle = rand() < 0.5 ? '#000' : p.hi;
    a.fillRect(rand() * S, rand() * S, 20 + rand() * 150, 1);
  }
  a.globalAlpha = 1;

  // ---- Panel seams: a milled recess with a lit lower/right shoulder, cut into the height field
  // so the groove genuinely self-shadows, and roughened because dirt collects in a channel.
  const seams = [0, S / 2];
  for (const s of seams) {
    a.fillStyle = p.seam;
    a.fillRect(s - 1.5, 0, 3, S);
    a.fillRect(0, s - 1.5, S, 3);
    a.fillStyle = 'rgba(255,255,255,0.16)';
    a.fillRect(s + 1.5, 0, 1, S);
    a.fillRect(0, s + 1.5, S, 1);

    hgt.fillStyle = '#3a3a3a';
    hgt.fillRect(s - 2, 0, 4, S);
    hgt.fillRect(0, s - 2, S, 4);
    hgt.fillStyle = '#9a9a9a';
    hgt.fillRect(s + 2, 0, 2, S);
    hgt.fillRect(0, s + 2, S, 2);

    o.fillStyle = rm(Math.min(0.95, p.rough + 0.22), p.metal * 0.55, 0.85);
    o.fillRect(s - 4, 0, 8, S);
    o.fillRect(0, s - 4, S, 8);
  }

  // ---- Bolt heads inset from every panel corner: raised in height, bare metal in the orm map.
  const bolt = (x: number, y: number) => {
    a.beginPath();
    a.arc(x, y, 4.4, 0, Math.PI * 2);
    a.fillStyle = 'rgba(0,0,0,0.42)';
    a.fill();
    a.beginPath();
    a.arc(x - 0.7, y - 0.9, 3.1, 0, Math.PI * 2);
    a.fillStyle = p.bare;
    a.fill();
    a.beginPath();
    a.arc(x - 1.2, y - 1.5, 1.3, 0, Math.PI * 2);
    a.fillStyle = 'rgba(255,255,255,0.5)';
    a.fill();

    // Recessed washer ring with the head standing proud inside it.
    hgt.beginPath();
    hgt.arc(x, y, 5.0, 0, Math.PI * 2);
    hgt.fillStyle = '#5c5c5c';
    hgt.fill();
    hgt.beginPath();
    hgt.arc(x, y, 3.2, 0, Math.PI * 2);
    hgt.fillStyle = '#d2d2d2';
    hgt.fill();

    o.beginPath();
    o.arc(x, y, 4.6, 0, Math.PI * 2);
    o.fillStyle = rm(0.3, 0.95);
    o.fill();
  };
  const inset = 15;
  for (const cx of [0, S / 2]) {
    for (const cy of [0, S / 2]) {
      bolt(cx + inset, cy + inset);
      bolt(cx + S / 2 - inset, cy + inset);
      bolt(cx + inset, cy + S / 2 - inset);
      bolt(cx + S / 2 - inset, cy + S / 2 - inset);
    }
  }

  // ---- Chipped paint, motivated at the seams and panel edges where a plate actually gets knocked.
  // Bare metal is smoother and fully metallic; a rust bloom is rougher and dielectric.
  for (let i = 0; i < 84; i++) {
    const alongSeam = rand() < 0.72;
    const s = rand() < 0.5 ? 0 : S / 2;
    let x: number;
    let y: number;
    if (alongSeam) {
      if (rand() < 0.5) {
        x = s + (rand() - 0.5) * 12;
        y = rand() * S;
      } else {
        x = rand() * S;
        y = s + (rand() - 0.5) * 12;
      }
    } else {
      x = rand() * S;
      y = rand() * S;
    }
    const rusty = rand() < 0.3;
    const r = 1.5 + rand() * 5;
    const blob = (c: CanvasRenderingContext2D) => {
      c.beginPath();
      c.moveTo(x, y);
      for (let k = 0; k < 5; k++) {
        const ang = (k / 5) * Math.PI * 2;
        c.lineTo(x + Math.cos(ang) * r * (0.5 + rand()), y + Math.sin(ang) * r * (0.5 + rand()));
      }
      c.closePath();
      c.fill();
    };
    a.fillStyle = rusty ? 'rgba(150,96,52,0.45)' : p.bare;
    a.globalAlpha = rusty ? 1 : 0.62;
    blob(a);
    a.globalAlpha = 1;
    // A chip is a shallow step down through the paint film.
    hgt.fillStyle = 'rgba(0,0,0,0.35)';
    blob(hgt);
    o.fillStyle = rusty ? rm(0.94, 0.08, 0.9) : rm(p.chipRough, p.chipMetal, 0.9);
    blob(o);
  }

  // ---- Grime pooling at the lower edge plus vertical drip streaks under the mid seam. Grime is
  // matte and non-metallic wherever it lands, which is most of what "dirt in the seams" looks like.
  const grad = a.createLinearGradient(0, S * 0.72, 0, S);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(22,20,17,0.3)');
  a.fillStyle = grad;
  a.fillRect(0, S * 0.72, S, S * 0.28);
  const ogr = o.createLinearGradient(0, S * 0.72, 0, S);
  ogr.addColorStop(0, rm(p.rough, p.metal, 0));
  ogr.addColorStop(1, rm(0.95, p.metal * 0.25, 0.8));
  o.fillStyle = ogr;
  o.fillRect(0, S * 0.72, S, S * 0.28);

  for (let i = 0; i < 11; i++) {
    const x = rand() * S;
    const wpx = 2 + rand() * 4;
    const len = 30 + rand() * 130;
    const dg = a.createLinearGradient(0, S / 2, 0, S / 2 + len);
    dg.addColorStop(0, 'rgba(58,40,26,0.34)');
    dg.addColorStop(1, 'rgba(58,40,26,0)');
    a.fillStyle = dg;
    a.fillRect(x, S / 2, wpx, len);
    const og = o.createLinearGradient(0, S / 2, 0, S / 2 + len);
    og.addColorStop(0, rm(0.96, 0.05, 0.75));
    og.addColorStop(1, rm(0.96, 0.05, 0));
    o.fillStyle = og;
    o.fillRect(x, S / 2, wpx, len);
  }

  const maps: SurfaceMaps = {
    map: finish(albedo),
    normalMap: finishData(heightToNormal(height, 2.6)),
    ormMap: finishData(orm),
  };
  plateCache.set(variant, maps);
  return maps;
}

export type MicroKind = 'composite' | 'anodised' | 'rubber' | 'fabric' | 'polished';

interface MicroSpec {
  rough: number;
  metal: number;
  seed: number;
  strength: number;
}

const MICRO: Record<MicroKind, MicroSpec> = {
  // Moulded dark composite: coarse pebbled texture, matte, dielectric.
  composite: { rough: 0.82, metal: 0.04, seed: 777, strength: 1.4 },
  // Anodised aluminium trim: fine directional grain, smooth, metallic. Metalness pulled down from
  // 0.88 for the same reason as the steel plate — a near-pure metal has no diffuse response, so it
  // went dead black anywhere outside a direct light's throw. Still fully metallic-reading through
  // its highlight and grain; just keeps a diffuse floor under ambient/hemisphere light.
  anodised: { rough: 0.38, metal: 0.72, seed: 4242, strength: 1.0 },
  // Rubber: fine pitted matte, dielectric, no specular breakup to speak of.
  rubber: { rough: 0.96, metal: 0.02, seed: 9091, strength: 2.2 },
  // Upholstery: a woven twill with a real weave normal.
  fabric: { rough: 0.94, metal: 0.02, seed: 3113, strength: 2.8 },
  // Polished chrome with handling smudges — the smudges are the only thing keeping it from
  // reading as a perfect mirror ball. Kept fully metallic: this only ever dresses small bolts,
  // handles and trims, never a large surface, so it doesn't drive the crushed-black measurement.
  polished: { rough: 0.16, metal: 1.0, seed: 6060, strength: 0.6 },
};

const microCache = new Map<MicroKind, SurfaceMaps>();

/**
 * Micro-surface for the non-plate materials: no seams or bolts, just the grain that separates
 * rubber from anodised trim from upholstery when a highlight crosses them. Albedo stays white so
 * the material's own `color` drives the hue.
 */
export function buildMicroMaps(kind: MicroKind): SurfaceMaps {
  const cached = microCache.get(kind);
  if (cached) return cached;

  const S = 256;
  const [albedo, a] = canvas2d(S, S);
  const [height, hgt] = canvas2d(S, S);
  const [orm, o] = canvas2d(S, S);
  const spec = MICRO[kind];
  const rand = rng(spec.seed);

  a.fillStyle = '#ffffff';
  a.fillRect(0, 0, S, S);
  hgt.fillStyle = '#808080';
  hgt.fillRect(0, 0, S, S);
  o.fillStyle = rm(spec.rough, spec.metal);
  o.fillRect(0, 0, S, S);

  if (kind === 'fabric') {
    // Twill weave: alternating warp and weft ribs, offset row to row.
    const pitch = 8;
    for (let y = 0; y < S; y += pitch) {
      for (let x = 0; x < S; x += pitch) {
        const warp = ((x / pitch + y / pitch) | 0) % 2 === 0;
        hgt.fillStyle = warp ? '#a8a8a8' : '#5c5c5c';
        hgt.fillRect(x, y, pitch, pitch);
        a.fillStyle = warp ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.12)';
        a.fillRect(x, y, pitch, pitch);
      }
    }
    for (let i = 0; i < 1400; i++) {
      o.fillStyle = rm(spec.rough + (rand() - 0.5) * 0.1, spec.metal, 0.4);
      o.fillRect(rand() * S, rand() * S, 1 + rand() * 3, 1 + rand() * 3);
    }
  } else if (kind === 'anodised' || kind === 'polished') {
    // Directional grain plus, for chrome, broad soft smudges.
    const streaks = kind === 'anodised' ? 1600 : 500;
    for (let i = 0; i < streaks; i++) {
      const y = rand() * S;
      const len = 20 + rand() * 180;
      const x = rand() * S;
      hgt.fillStyle = rand() < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.07)';
      hgt.fillRect(x, y, len, 1);
      o.fillStyle = rm(spec.rough + (rand() - 0.5) * (kind === 'anodised' ? 0.2 : 0.14), spec.metal, 0.4);
      o.fillRect(x, y, len, 1);
    }
    for (let i = 0; i < 26; i++) {
      const x = rand() * S;
      const y = rand() * S;
      const r = 10 + rand() * 34;
      const g = o.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rm(Math.min(0.9, spec.rough + 0.34), spec.metal, 0.55));
      g.addColorStop(1, rm(spec.rough, spec.metal, 0));
      o.fillStyle = g;
      o.fillRect(x - r, y - r, r * 2, r * 2);
    }
  } else {
    // Pebbled moulding / pitted rubber.
    const grains = kind === 'rubber' ? 5200 : 3400;
    for (let i = 0; i < grains; i++) {
      const x = rand() * S;
      const y = rand() * S;
      const r = 0.8 + rand() * (kind === 'rubber' ? 1.8 : 3.2);
      hgt.beginPath();
      hgt.arc(x, y, r, 0, Math.PI * 2);
      hgt.fillStyle = rand() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)';
      hgt.fill();
      o.fillStyle = rm(spec.rough + (rand() - 0.5) * 0.18, spec.metal, 0.35);
      o.fillRect(x - r, y - r, r * 2, r * 2);
      a.fillStyle = rand() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.04)';
      a.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }

  const maps: SurfaceMaps = {
    map: finish(albedo),
    normalMap: finishData(heightToNormal(height, spec.strength)),
    ormMap: finishData(orm),
  };
  microCache.set(kind, maps);
  return maps;
}

let streakTex: THREE.CanvasTexture | null = null;

/**
 * A transparent grime decal: rust-brown drip runs fading downward, with dark pooling along the top
 * edge. Laid under pipe flanges and along the top of equipment banks — wear where a drip would
 * actually land, rather than a uniform tint over the whole prop.
 */
export function buildDripDecalTexture(): THREE.CanvasTexture {
  if (streakTex) return streakTex;
  const w = 256;
  const h = 256;
  const [canvas, ctx] = canvas2d(w, h);
  const rand = rng(31337);
  ctx.clearRect(0, 0, w, h);

  // Pooled grime hugging the top edge, where the drip originates.
  const top = ctx.createLinearGradient(0, 0, 0, h * 0.22);
  top.addColorStop(0, 'rgba(34,26,18,0.55)');
  top.addColorStop(1, 'rgba(34,26,18,0)');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, w, h * 0.22);

  for (let i = 0; i < 26; i++) {
    const x = rand() * w;
    const wpx = 1 + rand() * 7;
    const len = h * (0.18 + rand() * 0.72);
    const g = ctx.createLinearGradient(0, 0, 0, len);
    const rust = rand() < 0.45;
    const col = rust ? '96,58,30' : '38,32,26';
    g.addColorStop(0, `rgba(${col},${0.34 + rand() * 0.24})`);
    g.addColorStop(0.55, `rgba(${col},0.18)`);
    g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, wpx, len);
    // A heavier bead at the end of the run.
    ctx.fillStyle = `rgba(${col},0.26)`;
    ctx.beginPath();
    ctx.ellipse(x + wpx / 2, len, wpx * 0.9, wpx * 1.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  streakTex = finish(canvas, false);
  return streakTex;
}

let scuffTex: THREE.CanvasTexture | null = null;

/**
 * Boot scuff decal for the plinth in front of the operator well — arcs of abraded paint where feet
 * pivot, plus a scatter of heel marks. Transparent everywhere else so it never becomes a tint.
 */
export function buildScuffDecalTexture(): THREE.CanvasTexture {
  if (scuffTex) return scuffTex;
  const S = 256;
  const [canvas, ctx] = canvas2d(S, S);
  const rand = rng(1024);
  ctx.clearRect(0, 0, S, S);

  ctx.lineCap = 'round';
  for (let i = 0; i < 40; i++) {
    const cx = S * (0.2 + rand() * 0.6);
    const cy = S * (0.3 + rand() * 0.55);
    const r = 18 + rand() * 60;
    const a0 = rand() * Math.PI * 2;
    ctx.strokeStyle = rand() < 0.55
      ? `rgba(30,28,26,${0.12 + rand() * 0.2})`
      : `rgba(180,184,190,${0.1 + rand() * 0.16})`;
    ctx.lineWidth = 1.5 + rand() * 5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, a0, a0 + 0.5 + rand() * 1.3);
    ctx.stroke();
  }
  for (let i = 0; i < 22; i++) {
    ctx.fillStyle = `rgba(26,24,22,${0.08 + rand() * 0.16})`;
    ctx.beginPath();
    ctx.ellipse(rand() * S, rand() * S, 5 + rand() * 16, 3 + rand() * 9, rand() * 3, 0, Math.PI * 2);
    ctx.fill();
  }

  scuffTex = finish(canvas, false);
  return scuffTex;
}

let deskMapTex: THREE.CanvasTexture | null = null;

/**
 * The hero readout laid into the console deck: a wide cyan approach/orbital plot. In the
 * reference this flat glowing chart, not the vertical monitors, is the brightest thing in the
 * whole frame, so it gets the largest canvas and the strongest emissive.
 */
export function buildDeskMapTexture(): THREE.CanvasTexture {
  if (deskMapTex) return deskMapTex;
  const w = 1024;
  const h = 320;
  const [canvas, ctx] = canvas2d(w, h);
  const rand = rng(24601);

  // A lifted base plus a broad glow field under the plot: at the framing distance a near-black
  // chart just read as a dark decal let into the desk rather than a lit surface.
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#0a2735');
  bg.addColorStop(0.6, '#072030');
  bg.addColorStop(1, '#04161f');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(w * 0.5, h * 0.62, 20, w * 0.5, h * 0.62, w * 0.42);
  glow.addColorStop(0, 'rgba(79,216,240,0.32)');
  glow.addColorStop(1, 'rgba(79,216,240,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  // Fine measurement grid.
  ctx.strokeStyle = 'rgba(160,232,248,0.16)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= w; x += 24) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y <= h; y += 24) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(168,240,255,0.34)';
  for (let x = 0; x <= w; x += 120) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  const cx = w * 0.5;
  const cy = h * 0.62;

  // Orbital shells around the destination body.
  ctx.save();
  ctx.translate(cx, cy);
  for (let i = 1; i <= 5; i++) {
    ctx.strokeStyle = `rgba(79,216,240,${0.34 - i * 0.04})`;
    ctx.lineWidth = i === 3 ? 2 : 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, i * 78, i * 26, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Destination body with a soft bloom.
  ctx.shadowColor = 'rgba(168,240,255,0.9)';
  ctx.shadowBlur = 26;
  ctx.fillStyle = 'rgba(168,240,255,0.95)';
  ctx.beginPath();
  ctx.arc(0, 0, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();

  // The approach course: a long bright arc sweeping in from the left with waypoint diamonds.
  ctx.shadowColor = 'rgba(120,228,255,0.8)';
  ctx.shadowBlur = 14;
  ctx.strokeStyle = 'rgba(178,242,255,0.95)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(40, h * 0.9);
  ctx.bezierCurveTo(w * 0.24, h * 0.18, w * 0.55, h * 0.12, cx, cy);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.setLineDash([7, 9]);
  ctx.strokeStyle = 'rgba(224,85,47,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(40, h * 0.9);
  ctx.bezierCurveTo(w * 0.3, h * 0.62, w * 0.6, h * 0.86, w - 60, h * 0.34);
  ctx.stroke();
  ctx.setLineDash([]);

  const waypoints: [number, number, string][] = [
    [w * 0.16, h * 0.62, 'WP-1'],
    [w * 0.3, h * 0.29, 'WP-2'],
    [w * 0.44, h * 0.2, 'WP-3'],
  ];
  ctx.font = '11px monospace';
  for (const [x, y, label] of waypoints) {
    ctx.strokeStyle = 'rgba(168,240,255,0.9)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y - 7);
    ctx.lineTo(x + 7, y);
    ctx.lineTo(x, y + 7);
    ctx.lineTo(x - 7, y);
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = 'rgba(120,220,235,0.7)';
    ctx.fillText(label, x + 11, y - 8);
  }

  // Hazard sector wedge — the one saturated warm accent on an otherwise cool chart.
  ctx.fillStyle = 'rgba(224,85,47,0.16)';
  ctx.strokeStyle = 'rgba(224,85,47,0.7)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(w * 0.79, h * 0.1);
  ctx.lineTo(w * 0.97, h * 0.3);
  ctx.lineTo(w * 0.86, h * 0.66);
  ctx.lineTo(w * 0.73, h * 0.36);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,150,120,0.85)';
  ctx.font = 'bold 12px monospace';
  ctx.fillText('DEBRIS / NO-BURN', w * 0.75, h * 0.24);

  // Left telemetry column.
  const rows: [string, string][] = [
    ['VEC', '117.4 / -08.2'],
    ['DRIFT', '0.031 M/S'],
    ['ETA', '04:12:55'],
    ['FUEL', '61.8%'],
  ];
  ctx.fillStyle = 'rgba(3,18,27,0.72)';
  ctx.fillRect(16, 16, 190, 104);
  ctx.strokeStyle = 'rgba(79,216,240,0.4)';
  ctx.lineWidth = 1;
  ctx.strokeRect(16, 16, 190, 104);
  rows.forEach(([k, v], i) => {
    ctx.fillStyle = 'rgba(216,166,58,0.85)';
    ctx.font = '11px monospace';
    ctx.fillText(k, 26, 38 + i * 22);
    ctx.fillStyle = 'rgba(168,240,255,0.95)';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(v, 78, 38 + i * 22);
  });

  // Right histogram.
  for (let i = 0; i < 22; i++) {
    const bh = 6 + rand() * 46;
    ctx.fillStyle = `rgba(79,216,240,${0.35 + rand() * 0.45})`;
    ctx.fillRect(w - 250 + i * 10, h - 22 - bh, 6, bh);
  }
  ctx.fillStyle = 'rgba(120,220,235,0.55)';
  ctx.font = '10px monospace';
  ctx.fillText('MASS SPECTRUM // BAND C', w - 250, h - 76);

  // Ruler along the bottom edge.
  ctx.strokeStyle = 'rgba(79,216,240,0.45)';
  ctx.beginPath();
  ctx.moveTo(0, h - 9);
  ctx.lineTo(w, h - 9);
  ctx.stroke();
  for (let x = 0; x < w; x += 20) {
    const tall = x % 100 === 0;
    ctx.beginPath();
    ctx.moveTo(x, h - 9);
    ctx.lineTo(x, h - 9 - (tall ? 7 : 3));
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(216,166,58,0.9)';
  ctx.font = 'bold 14px monospace';
  ctx.fillText('NAV PLOT // ORION APPROACH', 24, h - 22);

  // Smeared fingerprints and a wiped-clean arc — the glass is a surface people touch.
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 14; i++) {
    const x = rand() * w;
    const y = h * (0.55 + rand() * 0.45);
    const r = 8 + rand() * 26;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(120,150,160,0.06)');
    g.addColorStop(1, 'rgba(120,150,160,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.globalCompositeOperation = 'source-over';

  // Scanlines last so they sit over everything.
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);

  deskMapTex = finish(canvas, false);
  return deskMapTex;
}

const faceCache = new Map<string, THREE.CanvasTexture>();

/**
 * A dark control face: rows of physical keys, a couple of small readout windows and a stencilled
 * label. Used on the pod tops and the deck keypads so no flat area is left untreated.
 */
export function buildControlFaceTexture(label: string, accent: 'amber' | 'cyan' = 'cyan'): THREE.CanvasTexture {
  const cached = faceCache.get(label + accent);
  if (cached) return cached;

  const w = 512;
  const h = 256;
  const [canvas, ctx] = canvas2d(w, h);
  const rand = rng(label.length * 7919 + (accent === 'amber' ? 13 : 29));
  const accentRgb = accent === 'amber' ? '216,166,58' : '79,216,240';

  ctx.fillStyle = '#2b323a';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.04)';
    ctx.fillRect(rand() * w, rand() * h, 2 + rand() * 8, 1 + rand() * 3);
  }

  // Recessed frame.
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, w - 6, h - 6);
  ctx.strokeStyle = 'rgba(190,196,204,0.28)';
  ctx.lineWidth = 2;
  ctx.strokeRect(9, 9, w - 18, h - 18);

  // Key matrix.
  const cols = 8;
  const rowsN = 3;
  const kx0 = 24;
  const ky0 = 92;
  const kw = 44;
  const kh = 34;
  const gap = 8;
  for (let r = 0; r < rowsN; r++) {
    for (let c = 0; c < cols; c++) {
      const x = kx0 + c * (kw + gap);
      const y = ky0 + r * (kh + gap);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(x, y + 3, kw, kh);
      const roll = rand();
      if (roll > 0.9) ctx.fillStyle = `rgba(${accentRgb},0.75)`;
      else if (roll > 0.83) ctx.fillStyle = 'rgba(224,85,47,0.7)';
      else ctx.fillStyle = roll > 0.45 ? '#525a65' : '#454d57';
      ctx.fillRect(x, y, kw, kh - 3);
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(x, y, kw, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(x, y + kh - 6, kw, 3);
      // Worn shine on the most-used keys, biased to the left of each row.
      if (rand() < 0.3) {
        ctx.fillStyle = 'rgba(230,232,236,0.09)';
        ctx.beginPath();
        ctx.ellipse(x + kw / 2, y + kh / 2 - 2, kw * 0.3, kh * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Two readout windows above the keys.
  for (let i = 0; i < 2; i++) {
    const x = 24 + i * 214;
    ctx.fillStyle = '#06171f';
    ctx.fillRect(x, 26, 194, 50);
    ctx.strokeStyle = `rgba(${accentRgb},0.45)`;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, 26, 194, 50);
    ctx.fillStyle = `rgba(${accentRgb},0.9)`;
    ctx.font = 'bold 22px monospace';
    ctx.fillText(i === 0 ? '084.2' : '  ON', x + 14, 60);
    ctx.fillStyle = 'rgba(216,166,58,0.6)';
    ctx.font = '9px monospace';
    ctx.fillText(i === 0 ? 'THRUST TRIM' : 'INTERLOCK', x + 108, 44);
  }

  ctx.fillStyle = 'rgba(214,208,196,0.62)';
  ctx.font = 'bold 13px monospace';
  ctx.fillText(label, 24, h - 16);
  ctx.fillStyle = 'rgba(214,208,196,0.28)';
  ctx.font = '10px monospace';
  ctx.fillText('ARK LTD', w - 84, h - 16);

  const tex = finish(canvas, false);
  faceCache.set(label + accent, tex);
  return tex;
}

const secondaryCache = new Map<string, THREE.CanvasTexture>();

/**
 * Small vector line-icon glyphs for the subsystem/diagnostic readouts. Drawn as strokes rather
 * than font glyphs so they stay crisp scaled to any size, instead of relying on a bitmap font at
 * a size too small to read — the "low-resolution UI icon" critique was aimed squarely at this
 * screen family, which previously had no icons at all, just text and bars.
 */
function drawSysIcon(ctx: CanvasRenderingContext2D, kind: string, cx: number, cy: number, r: number, rgb: string): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = `rgba(${rgb},0.95)`;
  ctx.fillStyle = `rgba(${rgb},0.95)`;
  ctx.lineWidth = Math.max(1.6, r * 0.16);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (kind) {
    case 'life': {
      // Heartbeat pulse trace.
      ctx.beginPath();
      ctx.moveTo(-r, 0);
      ctx.lineTo(-r * 0.35, 0);
      ctx.lineTo(-r * 0.15, -r * 0.8);
      ctx.lineTo(r * 0.05, r * 0.8);
      ctx.lineTo(r * 0.3, 0);
      ctx.lineTo(r, 0);
      ctx.stroke();
      break;
    }
    case 'reactor': {
      // Atom: nucleus plus two crossed elliptical orbits.
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.16, 0, Math.PI * 2);
      ctx.fill();
      for (const rot of [0.55, -0.55]) {
        ctx.save();
        ctx.rotate(rot);
        ctx.beginPath();
        ctx.ellipse(0, 0, r, r * 0.42, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      break;
    }
    case 'thrust': {
      // Twin nozzle-flame silhouette.
      ctx.beginPath();
      ctx.moveTo(-r * 0.5, -r * 0.7);
      ctx.lineTo(r * 0.5, -r * 0.7);
      ctx.lineTo(r * 0.22, r * 0.3);
      ctx.lineTo(r * 0.5, r * 0.8);
      ctx.lineTo(0, r * 0.35);
      ctx.lineTo(-r * 0.5, r * 0.8);
      ctx.lineTo(-r * 0.22, r * 0.3);
      ctx.closePath();
      ctx.stroke();
      break;
    }
    case 'shield': {
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.8, -r * 0.55);
      ctx.lineTo(r * 0.8, r * 0.25);
      ctx.lineTo(0, r);
      ctx.lineTo(-r * 0.8, r * 0.25);
      ctx.lineTo(-r * 0.8, -r * 0.55);
      ctx.closePath();
      ctx.stroke();
      break;
    }
    case 'comms': {
      // Broadcast arcs off a source dot.
      ctx.beginPath();
      ctx.arc(0, r * 0.3, r * 0.12, 0, Math.PI * 2);
      ctx.fill();
      for (const rr of [0.5, 0.85]) {
        ctx.beginPath();
        ctx.arc(0, r * 0.3, r * rr, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      }
      break;
    }
    default: {
      // Nav: compass ring with a needle.
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.7);
      ctx.lineTo(r * 0.18, r * 0.15);
      ctx.lineTo(0, r * 0.7);
      ctx.lineTo(-r * 0.18, r * 0.15);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

/**
 * Corner reticle brackets — the "this is an instrument, not a poster" framing device the
 * diagnostic readout uses in place of a plain rectangle.
 */
function drawReticle(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rgb: string): void {
  const arm = Math.min(w, h) * 0.22;
  ctx.strokeStyle = `rgba(${rgb},0.55)`;
  ctx.lineWidth = 2;
  for (const [cx, cy, dx, dy] of [
    [x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(cx + arm * dx, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + arm * dy);
    ctx.stroke();
  }
}

/**
 * Two extra monitor readouts for the upper tier of the bank, in the same cool screen family.
 * Rendered at 1.75x the previous canvas size — these panes are the smallest in the cluster and
 * the ones a close crop lands on hardest, so their text and icon strokes were the first thing to
 * go soft.
 */
export function buildSecondaryScreenTexture(variant: 'sys' | 'diag'): THREE.CanvasTexture {
  const cached = secondaryCache.get(variant);
  if (cached) return cached;

  const w = 672;
  const h = 392;
  const [canvas, ctx] = canvas2d(w, h);
  const rand = rng(variant === 'sys' ? 4242 : 8484);

  ctx.fillStyle = '#04141d';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(79,216,240,0.12)';
  ctx.lineWidth = 1;
  for (let y = 0; y < h; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  drawReticle(ctx, 8, 8, w - 16, h - 16, '79,216,240');

  if (variant === 'sys') {
    ctx.fillStyle = 'rgba(216,166,58,0.9)';
    ctx.font = 'bold 23px monospace';
    ctx.fillText('SUBSYSTEM LOAD', 26, 40);
    const rows: [string, string][] = [
      ['LIFE SUP', 'life'], ['REACTOR', 'reactor'], ['THRUST', 'thrust'],
      ['SHIELD', 'shield'], ['COMMS', 'comms'], ['NAV', 'nav'],
    ];
    rows.forEach(([n, icon], i) => {
      const y = 78 + i * 48;
      const rgb = '120,220,235';
      drawSysIcon(ctx, icon, 34, y + 14, 15, rgb);
      ctx.fillStyle = `rgba(${rgb},0.65)`;
      ctx.font = '19px monospace';
      ctx.fillText(n, 60, y + 20);
      const pct = 0.25 + rand() * 0.72;
      ctx.strokeStyle = 'rgba(79,216,240,0.35)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(198, y, 352, 23);
      ctx.fillStyle = pct > 0.85 ? 'rgba(224,85,47,0.85)' : 'rgba(79,216,240,0.75)';
      ctx.fillRect(198, y, 352 * pct, 23);
      ctx.fillStyle = 'rgba(168,240,255,0.85)';
      ctx.font = '17px monospace';
      ctx.fillText(`${Math.round(pct * 100)}%`, 562, y + 19);
    });
  } else {
    ctx.fillStyle = 'rgba(216,166,58,0.9)';
    ctx.font = 'bold 23px monospace';
    ctx.fillText('HULL DIAGNOSTIC', 26, 40);
    // Top-down wireframe hull with two flagged sections.
    ctx.save();
    ctx.translate(w / 2, h * 0.56);
    ctx.strokeStyle = 'rgba(120,220,235,0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -133);
    ctx.lineTo(60, -35);
    ctx.lineTo(80, 91);
    ctx.lineTo(32, 123);
    ctx.lineTo(-32, 123);
    ctx.lineTo(-80, 91);
    ctx.lineTo(-60, -35);
    ctx.closePath();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(79,216,240,0.35)';
    ctx.lineWidth = 1.5;
    for (let i = -105; i < 123; i += 31) {
      ctx.beginPath();
      ctx.moveTo(-80, i);
      ctx.lineTo(80, i);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(224,85,47,0.5)';
    ctx.fillRect(-80, 28, 52, 35);
    ctx.fillStyle = 'rgba(216,166,58,0.5)';
    ctx.fillRect(28, -38, 46, 31);
    ctx.restore();
    ctx.fillStyle = 'rgba(255,150,120,0.9)';
    ctx.font = '17px monospace';
    ctx.fillText('SEC 4-B  BREACH', 26, h - 52);
    ctx.fillStyle = 'rgba(216,166,58,0.8)';
    ctx.fillText('SEC 2-C  STRESS', 26, h - 24);
  }

  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);

  const tex = finish(canvas, false);
  secondaryCache.set(variant, tex);
  return tex;
}

let chairMeshTex: THREE.CanvasTexture | null = null;

/**
 * Alpha mask for the pilot chair's mesh back — a woven strand grid with real holes. The chair
 * sits between the camera and the deck chart in the framed shot, so a solid back panel reads as
 * a black slab across the console's focal element; a perforated one lets the chart through the
 * way the reference's mesh-back operator chair does.
 */
export function buildChairMeshTexture(): THREE.CanvasTexture {
  if (chairMeshTex) return chairMeshTex;
  const S = 128;
  const [canvas, ctx] = canvas2d(S, S);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#fff';
  const pitch = 16;
  const strand = 6;
  for (let i = 0; i < S; i += pitch) {
    ctx.fillRect(i, 0, strand, S);
    ctx.fillRect(0, i, S, strand);
  }
  chairMeshTex = finish(canvas);
  return chairMeshTex;
}

let ventTex: THREE.CanvasTexture | null = null;

/** Louvred vent insert — dark slats with a lit top lip, for pod sides and the deck bulkhead. */
export function buildVentTexture(): THREE.CanvasTexture {
  if (ventTex) return ventTex;
  const w = 128;
  const h = 128;
  const [canvas, ctx] = canvas2d(w, h);
  // Lifted off pure black: a louvre slot in the reference still carries the colour of the duct
  // behind it. The previous #0a0d10 slats were a large share of the render's crushed pixels.
  ctx.fillStyle = '#2c3239';
  ctx.fillRect(0, 0, w, h);
  for (let y = 4; y < h - 4; y += 14) {
    ctx.fillStyle = '#1b2026';
    ctx.fillRect(4, y, w - 8, 9);
    ctx.fillStyle = 'rgba(178,186,196,0.5)';
    ctx.fillRect(4, y + 9, w - 8, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(4, y, w - 8, 2);
  }
  ctx.strokeStyle = 'rgba(150,158,166,0.35)';
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
  ventTex = finish(canvas);
  return ventTex;
}

let ventNormalTex: THREE.CanvasTexture | null = null;

/** Matching louvre normal so the slats catch a real highlight on their top lip. */
export function buildVentNormalTexture(): THREE.CanvasTexture {
  if (ventNormalTex) return ventNormalTex;
  const S = 128;
  const [height, ctx] = canvas2d(S, S);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, S, S);
  for (let y = 4; y < S - 4; y += 14) {
    // Each louvre ramps from a deep shadowed root up to a proud lip.
    const g = ctx.createLinearGradient(0, y, 0, y + 11);
    g.addColorStop(0, '#2a2a2a');
    g.addColorStop(0.8, '#8a8a8a');
    g.addColorStop(1, '#e0e0e0');
    ctx.fillStyle = g;
    ctx.fillRect(4, y, S - 8, 11);
  }
  ventNormalTex = finishData(heightToNormal(height, 3.4));
  return ventNormalTex;
}

const stainCache = new Map<string, THREE.CanvasTexture>();

/**
 * Irregular floor stain decal — soot-black scorching or leaked-oil darkening, built from
 * overlapping soft-edged lobes so the outline is ragged rather than a perfect circle. This is the
 * "battle damage" beat the r5 brief calls for: a specific, motivated mark (an old short, a leaking
 * fitting) rather than another clean tinted surface.
 */
export function buildStainDecalTexture(kind: 'oil' | 'scorch'): THREE.CanvasTexture {
  const cached = stainCache.get(kind);
  if (cached) return cached;
  const S = 256;
  const [canvas, ctx] = canvas2d(S, S);
  const rand = rng(kind === 'scorch' ? 7777 : 8888);
  ctx.clearRect(0, 0, S, S);

  const cx = S / 2;
  const cy = S / 2;
  const core = kind === 'scorch' ? '10,9,8' : '14,12,9';
  const rim = kind === 'scorch' ? '46,32,22' : '38,30,18';

  for (let i = 0; i < 9; i++) {
    const a0 = (i / 9) * Math.PI * 2 + rand() * 0.3;
    const rr = S * (0.15 + rand() * 0.14);
    const lx = cx + Math.cos(a0) * rr * 0.5;
    const ly = cy + Math.sin(a0) * rr * 0.5;
    const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, rr);
    g.addColorStop(0, `rgba(${core},${0.5 + rand() * 0.25})`);
    g.addColorStop(0.6, `rgba(${rim},0.28)`);
    g.addColorStop(1, `rgba(${rim},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(lx, ly, rr, 0, Math.PI * 2);
    ctx.fill();
  }
  // Dense core where the damage/leak actually originated.
  const gc = ctx.createRadialGradient(cx, cy, 0, cx, cy, S * 0.2);
  gc.addColorStop(0, `rgba(${core},0.75)`);
  gc.addColorStop(1, `rgba(${core},0)`);
  ctx.fillStyle = gc;
  ctx.beginPath();
  ctx.arc(cx, cy, S * 0.2, 0, Math.PI * 2);
  ctx.fill();

  if (kind === 'scorch') {
    // Fine soot speckle scattered outward from the core.
    for (let i = 0; i < 140; i++) {
      const a0 = rand() * Math.PI * 2;
      const rr = S * 0.1 + rand() * S * 0.32;
      const x = cx + Math.cos(a0) * rr;
      const y = cy + Math.sin(a0) * rr;
      ctx.fillStyle = `rgba(20,17,14,${0.06 + rand() * 0.12})`;
      ctx.beginPath();
      ctx.arc(x, y, 0.6 + rand() * 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Oil sheen: a faint cool glint along one edge of the stain, where light catches the film.
    ctx.globalCompositeOperation = 'lighter';
    const gs = ctx.createRadialGradient(cx - S * 0.08, cy - S * 0.06, 0, cx - S * 0.08, cy - S * 0.06, S * 0.14);
    gs.addColorStop(0, 'rgba(90,110,120,0.14)');
    gs.addColorStop(1, 'rgba(90,110,120,0)');
    ctx.fillStyle = gs;
    ctx.fillRect(0, 0, S, S);
    ctx.globalCompositeOperation = 'source-over';
  }

  const tex = finish(canvas, false);
  stainCache.set(kind, tex);
  return tex;
}

let screenGlassTex: THREE.CanvasTexture | null = null;

/**
 * Overlay for the glass in front of every screen face: a raking fresnel streak, a soft warm blob
 * where the ceiling practicals would catch the pane, faint reflected mullions at the edges, and a
 * corner vignette. Laid over the emissive screen texture (and paired with a thin clearcoat glass
 * plane that catches the real scene lights) so a monitor reads as a lit physical surface reflecting
 * the room around it, not a flat graphic pasted onto the bezel — the r6 critique's #1 gap.
 */
export function buildScreenGlassTexture(): THREE.CanvasTexture {
  if (screenGlassTex) return screenGlassTex;
  const S = 256;
  const [canvas, ctx] = canvas2d(S, S);
  ctx.clearRect(0, 0, S, S);

  // Corner vignette: an unlit sheet of glass under a single overhead key naturally reads darker at
  // its corners than at its centre.
  const vig = ctx.createRadialGradient(S * 0.5, S * 0.5, S * 0.14, S * 0.5, S * 0.5, S * 0.74);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.3)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, S, S);

  // Raking fresnel streak, angled to agree with the console's own key light approaching from
  // screen-right — the single strongest cue that the pane is a reflective surface, not a decal.
  ctx.save();
  ctx.translate(S * 0.6, S * 0.36);
  ctx.rotate(-0.52);
  const streak = ctx.createLinearGradient(-S, 0, S, 0);
  streak.addColorStop(0, 'rgba(255,255,255,0)');
  streak.addColorStop(0.47, 'rgba(255,255,255,0)');
  streak.addColorStop(0.5, 'rgba(240,246,250,0.24)');
  streak.addColorStop(0.53, 'rgba(255,255,255,0)');
  streak.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = streak;
  ctx.fillRect(-S, -S * 0.15, S * 2, S * 0.3);
  ctx.restore();

  // Soft warm blob — the ceiling strip lights reflected in the pane, kept small and off-centre.
  const warm = ctx.createRadialGradient(S * 0.26, S * 0.14, 2, S * 0.26, S * 0.14, S * 0.3);
  warm.addColorStop(0, 'rgba(255,217,160,0.15)');
  warm.addColorStop(1, 'rgba(255,217,160,0)');
  ctx.fillStyle = warm;
  ctx.fillRect(0, 0, S, S);

  // Reflected structure at the very edges — the mullions either side showing faintly in the glass.
  ctx.fillStyle = 'rgba(8,12,16,0.12)';
  ctx.fillRect(0, 0, S * 0.045, S);
  ctx.fillRect(S * 0.955, 0, S * 0.045, S);

  screenGlassTex = finish(canvas, false);
  return screenGlassTex;
}

let seatWearTex: THREE.CanvasTexture | null = null;

/**
 * Seat wear decal: a lighter compressed sheen where an operator actually sits, with grime pooling
 * toward the edges and a scatter of stray scuffs. Laid over the fabric seat pan, armrest pads and
 * seat shell so the chair reads as sat-in rather than showroom-new — the critique's specific call-
 * out alongside the floor tiles.
 */
export function buildSeatWearTexture(): THREE.CanvasTexture {
  if (seatWearTex) return seatWearTex;
  const S = 256;
  const [canvas, ctx] = canvas2d(S, S);
  const rand = rng(2718);
  ctx.clearRect(0, 0, S, S);

  const sheen = ctx.createRadialGradient(S * 0.5, S * 0.42, 4, S * 0.5, S * 0.42, S * 0.34);
  sheen.addColorStop(0, 'rgba(222,224,226,0.16)');
  sheen.addColorStop(0.7, 'rgba(222,224,226,0.05)');
  sheen.addColorStop(1, 'rgba(222,224,226,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, S, S);

  const grime = ctx.createRadialGradient(S * 0.5, S * 0.5, S * 0.28, S * 0.5, S * 0.5, S * 0.62);
  grime.addColorStop(0, 'rgba(20,18,16,0)');
  grime.addColorStop(1, 'rgba(20,18,16,0.28)');
  ctx.fillStyle = grime;
  ctx.fillRect(0, 0, S, S);

  for (let i = 0; i < 20; i++) {
    ctx.fillStyle = `rgba(24,20,16,${0.05 + rand() * 0.14})`;
    ctx.beginPath();
    ctx.ellipse(rand() * S, rand() * S, 3 + rand() * 10, 2 + rand() * 6, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  seatWearTex = finish(canvas, false);
  return seatWearTex;
}
