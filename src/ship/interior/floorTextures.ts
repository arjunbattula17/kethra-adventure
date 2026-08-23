import * as THREE from 'three';

/**
 * Procedural canvas textures for the deck. The reference deck is bone-white painted plate — not
 * the rust diamond-plate PBR set the floor used to borrow — so these are authored here rather
 * than loaded, and every one of them tiles.
 *
 * Canvases are memoised, textures are not: `.repeat` is per-texture state, so each caller gets
 * its own THREE.CanvasTexture wrapping the same shared canvas.
 */
const canvasCache = new Map<string, HTMLCanvasElement>();

function makeCanvas(
  key: string,
  size: number,
  draw: (c: CanvasRenderingContext2D, s: number) => void,
): HTMLCanvasElement {
  const cached = canvasCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d')!, size);
  canvasCache.set(key, canvas);
  return canvas;
}

function scratchCanvas(size: number, draw: (c: CanvasRenderingContext2D, s: number) => void): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d')!, size);
  return canvas;
}

function texture(canvas: HTMLCanvasElement, repeatX: number, repeatY: number, srgb: boolean): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 8;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return tex;
}

/** Draws the same marks nine times on a 3x3 offset grid so blobs crossing an edge still tile. */
function wrapped(c: CanvasRenderingContext2D, size: number, draw: () => void): void {
  for (let ox = -1; ox <= 1; ox++) {
    for (let oy = -1; oy <= 1; oy++) {
      c.save();
      c.translate(ox * size, oy * size);
      draw();
      c.restore();
    }
  }
}

function blob(c: CanvasRenderingContext2D, x: number, y: number, r: number, rgb: string, alpha: number): void {
  const grad = c.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, `rgba(${rgb},${alpha})`);
  grad.addColorStop(0.6, `rgba(${rgb},${alpha * 0.45})`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = grad;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
}

function speckle(c: CanvasRenderingContext2D, size: number, count: number, dark: string, light: string): void {
  for (let i = 0; i < count; i++) {
    c.fillStyle = Math.random() < 0.5 ? dark : light;
    c.fillRect(Math.random() * size, Math.random() * size, 1, 1);
  }
}

/**
 * Sobel-differentiates a greyscale height canvas into a tangent-space normal map. Sampling wraps,
 * so a height field that tiles produces a normal map that tiles.
 */
function normalFromHeight(height: HTMLCanvasElement, strength: number): HTMLCanvasElement {
  const s = height.width;
  const src = height.getContext('2d')!.getImageData(0, 0, s, s).data;
  const out = document.createElement('canvas');
  out.width = s;
  out.height = s;
  const octx = out.getContext('2d')!;
  const img = octx.createImageData(s, s);
  const h = (x: number, y: number) => src[((((y % s) + s) % s) * s + (((x % s) + s) % s)) * 4] / 255;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * strength;
      const dy = (h(x, y + 1) - h(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * s + x) * 4;
      img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / len) * 0.5 * 255 + 127.5;
      img.data[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

/**
 * Bone-white painted deck. Deliberately authored well below the brief's #c9c2b4–#ddd6c6 swatch:
 * the room's key + hemi + bounce rig lands this albedo *inside* that range on screen, whereas the
 * previous #d9d2c2 base clipped the whole mid-ground to white and erased the plating.
 */
export function buildPaintedDeckTexture(repeatX: number, repeatY: number): THREE.CanvasTexture {
  const canvas = makeCanvas('paintedDeck', 512, (c, s) => {
    c.fillStyle = '#a8a191';
    c.fillRect(0, 0, s, s);

    // Broad paint-batch drift: whole patches of deck a half-stop apart, so the surface has a
    // value *range* instead of one flat tone that the highlight rolls straight off.
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      const r = 110 + Math.random() * 190;
      const light = Math.random() < 0.45;
      wrapped(c, s, () => blob(c, x, y, r, light ? '198,192,178' : '118,113,101', light ? 0.3 : 0.34));
    }
    // Finer mottling on top of the drift.
    for (let i = 0; i < 70; i++) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      const r = 26 + Math.random() * 90;
      const light = Math.random() < 0.5;
      wrapped(c, s, () => blob(c, x, y, r, light ? '210,204,190' : '106,101,90', light ? 0.14 : 0.18));
    }
    // Bare primer showing through where paint has worn off — small, high-contrast, motivated.
    for (let i = 0; i < 22; i++) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      const r = 10 + Math.random() * 26;
      wrapped(c, s, () => blob(c, x, y, r, '96,93,88', 0.42));
    }

    // Hairline scratches from dragged crates — short, directional, mostly along the deck axes.
    for (let i = 0; i < 260; i++) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      const axis = Math.random() < 0.7;
      const len = 8 + Math.random() * 90;
      const jitter = (Math.random() - 0.5) * 10;
      c.strokeStyle = Math.random() < 0.4 ? 'rgba(192,187,175,0.18)' : 'rgba(80,76,67,0.2)';
      c.lineWidth = Math.random() < 0.85 ? 1 : 2;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(axis ? x + len : x + jitter, axis ? y + jitter : y + len);
      c.stroke();
    }

    speckle(c, s, 14000, 'rgba(56,53,46,0.24)', 'rgba(212,208,197,0.2)');
  });
  return texture(canvas, repeatX, repeatY, true);
}

/**
 * Grit relief for the painted deck: fine cast stipple plus the scratch grooves, so the deck
 * catches a broken grazing highlight instead of a mirror-flat sheet of one value.
 */
export function buildDeckNormalTexture(repeatX: number, repeatY: number): THREE.CanvasTexture {
  const canvas = makeCanvas('deckNormal', 512, (c, s) => {
    const height = scratchCanvas(s, (h) => {
      h.fillStyle = '#808080';
      h.fillRect(0, 0, s, s);
      // Cast grit.
      for (let i = 0; i < 9000; i++) {
        const r = 0.7 + Math.random() * 1.9;
        h.fillStyle = Math.random() < 0.5 ? 'rgba(46,46,46,0.5)' : 'rgba(214,214,214,0.5)';
        h.beginPath();
        h.arc(Math.random() * s, Math.random() * s, r, 0, Math.PI * 2);
        h.fill();
      }
      // Shallow orange-peel undulation.
      for (let i = 0; i < 40; i++) {
        const x = Math.random() * s;
        const y = Math.random() * s;
        const r = 20 + Math.random() * 60;
        wrapped(h, s, () => blob(h, x, y, r, Math.random() < 0.5 ? '40,40,40' : '210,210,210', 0.16));
      }
      // Scratch grooves.
      for (let i = 0; i < 180; i++) {
        const x = Math.random() * s;
        const y = Math.random() * s;
        const axis = Math.random() < 0.72;
        const len = 10 + Math.random() * 100;
        h.strokeStyle = 'rgba(30,30,30,0.55)';
        h.lineWidth = Math.random() < 0.8 ? 1 : 2;
        h.beginPath();
        h.moveTo(x, y);
        h.lineTo(axis ? x + len : x + (Math.random() - 0.5) * 8, axis ? y + (Math.random() - 0.5) * 8 : y + len);
        h.stroke();
      }
      // A handful of impact dings.
      for (let i = 0; i < 14; i++) {
        const x = Math.random() * s;
        const y = Math.random() * s;
        wrapped(h, s, () => blob(h, x, y, 4 + Math.random() * 9, '24,24,24', 0.7));
      }
    });
    c.drawImage(normalFromHeight(height, 5.0), 0, 0);
  });
  return texture(canvas, repeatX, repeatY, false);
}

/**
 * Roughness variation for the painted deck. Wide range on purpose: matte unworn paint at ~0.95,
 * burnished walking lanes down near 0.3, which is what separates "painted composite" from the
 * bare steel inserts under the same light.
 */
export function buildDeckRoughnessTexture(repeatX: number, repeatY: number): THREE.CanvasTexture {
  const canvas = makeCanvas('deckRough', 256, (c, s) => {
    c.fillStyle = '#f2f2f2';
    c.fillRect(0, 0, s, s);
    // Burnished traffic patches.
    for (let i = 0; i < 22; i++) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      const r = 22 + Math.random() * 62;
      wrapped(c, s, () => blob(c, x, y, r, '48,48,48', 0.72));
    }
    // Polish streaks along the walking axis (V runs down +Z on the deck).
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * s;
      const grad = c.createLinearGradient(x - 9, 0, x + 9, 0);
      grad.addColorStop(0, 'rgba(70,70,70,0)');
      grad.addColorStop(0.5, `rgba(70,70,70,${0.25 + Math.random() * 0.3})`);
      grad.addColorStop(1, 'rgba(70,70,70,0)');
      c.fillStyle = grad;
      c.fillRect(x - 9, 0, 18, s);
    }
    // Dull, dusty patches pushing the other way.
    for (let i = 0; i < 14; i++) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      wrapped(c, s, () => blob(c, x, y, 18 + Math.random() * 44, '255,255,255', 0.5));
    }
    speckle(c, s, 6000, 'rgba(255,255,255,0.3)', 'rgba(110,110,110,0.3)');
  });
  return texture(canvas, repeatX, repeatY, false);
}

/**
 * Dark bare-plate tread used for the recessed deck inserts — staggered raised grip dashes with
 * a lit top edge and a dropped shadow. Base value raised off near-black: the reference's recessed
 * plate is a dark *material*, not a hole, and still carries seams and grip pattern in shadow.
 */
export function buildTreadPlateTexture(repeatX: number, repeatY: number): THREE.CanvasTexture {
  const canvas = makeCanvas('treadPlate', 256, (c, s) => {
    c.fillStyle = '#63665f';
    c.fillRect(0, 0, s, s);
    for (let i = 0; i < 22; i++) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      wrapped(c, s, () => blob(c, x, y, 26 + Math.random() * 56, Math.random() < 0.6 ? '58,60,55' : '124,126,116', 0.3));
    }

    const step = 16;
    for (let row = 0; row * step < s + step; row++) {
      const y = row * step;
      const offset = row % 2 === 0 ? 0 : step / 2;
      for (let col = -1; col * step < s + step; col++) {
        const x = col * step + offset;
        const angle = row % 2 === 0 ? 0.55 : -0.55;
        c.save();
        c.translate(x, y);
        c.rotate(angle);
        c.fillStyle = 'rgba(44,46,42,0.8)';
        c.fillRect(-5, -1, 11, 5);
        c.fillStyle = 'rgba(146,148,138,0.92)';
        c.fillRect(-5, -2, 11, 3);
        c.fillStyle = 'rgba(186,188,176,0.7)';
        c.fillRect(-5, -2, 11, 1);
        c.restore();
      }
    }
    // Grime worked into the pattern where boots do not reach.
    for (let i = 0; i < 10; i++) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      wrapped(c, s, () => blob(c, x, y, 20 + Math.random() * 40, '40,38,33', 0.34));
    }
    speckle(c, s, 4000, 'rgba(34,34,32,0.3)', 'rgba(198,198,186,0.18)');
  });
  return texture(canvas, repeatX, repeatY, true);
}

/** Relief for the tread dashes, so the insert lights like machined plate rather than a printed decal. */
export function buildTreadNormalTexture(repeatX: number, repeatY: number): THREE.CanvasTexture {
  const canvas = makeCanvas('treadNormal', 256, (c, s) => {
    const height = scratchCanvas(s, (h) => {
      h.fillStyle = '#4a4a4a';
      h.fillRect(0, 0, s, s);
      const step = 16;
      for (let row = 0; row * step < s + step; row++) {
        const y = row * step;
        const offset = row % 2 === 0 ? 0 : step / 2;
        for (let col = -1; col * step < s + step; col++) {
          const x = col * step + offset;
          h.save();
          h.translate(x, y);
          h.rotate(row % 2 === 0 ? 0.55 : -0.55);
          h.fillStyle = '#c8c8c8';
          h.fillRect(-5, -2, 11, 4);
          h.fillStyle = '#e4e4e4';
          h.fillRect(-4, -1, 9, 2);
          h.restore();
        }
      }
      for (let i = 0; i < 2600; i++) {
        h.fillStyle = Math.random() < 0.5 ? 'rgba(40,40,40,0.4)' : 'rgba(200,200,200,0.4)';
        h.fillRect(Math.random() * s, Math.random() * s, 1, 1);
      }
    });
    c.drawImage(normalFromHeight(height, 6.5), 0, 0);
  });
  return texture(canvas, repeatX, repeatY, false);
}

/**
 * Multiply-blended wear decals. These are drawn on an **opaque white** field rather than a
 * transparent one: MULTIPLY blending multiplies the destination by the source colour, so a
 * transparent (rgb 0) pixel would stamp the deck black. White = "leave the deck alone".
 */
export function buildDeckWearTexture(variant: 'scuff' | 'drip' | 'grime' | 'oil'): THREE.CanvasTexture {
  const canvas = makeCanvas(`wear_${variant}`, 256, (c, s) => {
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, s, s);
    const mid = s / 2;

    if (variant === 'scuff') {
      // Arcs of a boot pivoting in one spot, plus dragged streaks along the walking direction.
      for (let i = 0; i < 46; i++) {
        const r = s * (0.1 + Math.random() * 0.34);
        const a0 = Math.random() * Math.PI * 2;
        c.strokeStyle = `rgba(104,100,90,${0.06 + Math.random() * 0.13})`;
        c.lineWidth = 1 + Math.random() * 6;
        c.beginPath();
        c.arc(mid + (Math.random() - 0.5) * 40, mid + (Math.random() - 0.5) * 40, r, a0, a0 + 0.5 + Math.random() * 1.6);
        c.stroke();
      }
      for (let i = 0; i < 24; i++) {
        c.strokeStyle = `rgba(116,110,98,${0.05 + Math.random() * 0.09})`;
        c.lineWidth = 2 + Math.random() * 7;
        const y = Math.random() * s;
        c.beginPath();
        c.moveTo(Math.random() * s * 0.4, y);
        c.lineTo(s * 0.6 + Math.random() * s * 0.4, y + (Math.random() - 0.5) * 20);
        c.stroke();
      }
      blob(c, mid, mid, s * 0.42, '96,92,84', 0.14);
    } else if (variant === 'drip') {
      // Corrosion running down from a leaking joint: a dark head with tapering runs below it.
      for (let i = 0; i < 14; i++) {
        const x = mid + (Math.random() - 0.5) * s * 0.5;
        const top = s * 0.1 + Math.random() * s * 0.15;
        const len = s * (0.3 + Math.random() * 0.5);
        const w = 2 + Math.random() * 9;
        const grad = c.createLinearGradient(x, top, x, top + len);
        grad.addColorStop(0, `rgba(84,64,42,${0.26 + Math.random() * 0.22})`);
        grad.addColorStop(0.5, 'rgba(104,82,56,0.17)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = grad;
        c.fillRect(x - w / 2, top, w, len);
      }
      for (let i = 0; i < 5; i++) {
        blob(c, mid + (Math.random() - 0.5) * s * 0.4, s * 0.22, s * 0.16, '72,54,36', 0.32);
      }
    } else if (variant === 'oil') {
      for (let i = 0; i < 7; i++) {
        blob(c, mid + (Math.random() - 0.5) * s * 0.38, mid + (Math.random() - 0.5) * s * 0.38, s * (0.12 + Math.random() * 0.2), '42,40,40', 0.4);
      }
      for (let i = 0; i < 30; i++) {
        const r = 1 + Math.random() * 4;
        c.fillStyle = 'rgba(44,42,42,0.35)';
        c.beginPath();
        c.arc(mid + (Math.random() - 0.5) * s * 0.8, mid + (Math.random() - 0.5) * s * 0.8, r, 0, Math.PI * 2);
        c.fill();
      }
    } else {
      for (let i = 0; i < 12; i++) {
        blob(c, Math.random() * s, Math.random() * s, s * (0.12 + Math.random() * 0.24), '86,82,70', 0.2);
      }
      speckle(c, s, 2500, 'rgba(74,70,60,0.18)', 'rgba(255,255,255,0)');
    }

    // Fade the rim back to pure white so the decal never shows its own quad edge.
    const fade = c.createRadialGradient(mid, mid, s * 0.26, mid, mid, s * 0.5);
    fade.addColorStop(0, 'rgba(255,255,255,0)');
    fade.addColorStop(0.7, 'rgba(255,255,255,0.65)');
    fade.addColorStop(1, 'rgba(255,255,255,1)');
    c.fillStyle = fade;
    c.fillRect(0, 0, s, s);
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Contact-occlusion decals, multiply-blended onto the deck under anything resting on it. A single
 * 1024-shadow directional light cannot resolve the centimetre-scale darkening where a grate lip or
 * a hose meets the plate, and without it every prop reads as floating — the exact note the critic
 * gave. `pad` is a soft ellipse for freestanding props; `strip` is a one-sided gradient for the
 * shadow that pools along a wall base, a rail or a raised band.
 */
export function buildContactShadowTexture(variant: 'pad' | 'strip'): THREE.CanvasTexture {
  const canvas = makeCanvas(`contact_${variant}`, 128, (c, s) => {
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, s, s);
    // These values look far too pale on the canvas on purpose. MultiplyBlending happens in the
    // renderer's *linear* working space, and the map is sRGB-decoded first, so the factor the
    // deck actually gets is sRGBToLinear(texel) — a texel that reads as mid-grey 0.5 multiplies
    // the surface by 0.21, not 0.5. The darkest texel here is ~0.70 sRGB, i.e. a 0.44 linear
    // multiply, which is a believable contact shadow rather than a hole.
    if (variant === 'pad') {
      const grad = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      grad.addColorStop(0, 'rgba(120,120,128,0.62)');
      grad.addColorStop(0.42, 'rgba(150,150,158,0.45)');
      grad.addColorStop(0.78, 'rgba(196,196,202,0.24)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = grad;
      c.fillRect(0, 0, s, s);
    } else {
      const grad = c.createLinearGradient(0, 0, 0, s);
      grad.addColorStop(0, 'rgba(126,126,134,0.6)');
      grad.addColorStop(0.28, 'rgba(160,160,168,0.4)');
      grad.addColorStop(0.72, 'rgba(190,190,196,0.2)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = grad;
      c.fillRect(0, 0, s, s);
      // Feather the short ends so a stretched strip does not stop dead.
      const ends = c.createLinearGradient(0, 0, s, 0);
      ends.addColorStop(0, 'rgba(255,255,255,1)');
      ends.addColorStop(0.12, 'rgba(255,255,255,0)');
      ends.addColorStop(0.88, 'rgba(255,255,255,0)');
      ends.addColorStop(1, 'rgba(255,255,255,1)');
      c.fillStyle = ends;
      c.fillRect(0, 0, s, s);
    }
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Pale canvas work-mat, laid over the deck with small parts on it — the light irregular sheets
 * the reference scatters through its mid-ground. Alpha-cut edges so it isn't a floating rectangle.
 */
export function buildTarpTexture(seed: number): THREE.CanvasTexture {
  const canvas = makeCanvas(`tarp_${seed}`, 256, (c, s) => {
    c.clearRect(0, 0, s, s);

    // Irregular sheet outline.
    const mid = s / 2;
    c.beginPath();
    const corners = 14;
    for (let i = 0; i <= corners; i++) {
      const a = (i / corners) * Math.PI * 2;
      const rad = s * (0.36 + Math.sin(a * 3 + seed) * 0.045 + Math.cos(a * 5 - seed) * 0.03);
      const x = mid + Math.cos(a) * rad * 1.25;
      const y = mid + Math.sin(a) * rad;
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.closePath();
    c.fillStyle = '#aca596';
    c.fill();
    c.save();
    c.clip();

    // Fold creases and a soft shadow along one side.
    for (let i = 0; i < 9; i++) {
      c.strokeStyle = `rgba(118,112,100,${0.2 + Math.random() * 0.24})`;
      c.lineWidth = 1 + Math.random() * 2;
      c.beginPath();
      const x0 = Math.random() * s;
      c.moveTo(x0, 0);
      c.bezierCurveTo(x0 + 30, s * 0.3, x0 - 40, s * 0.7, x0 + (Math.random() - 0.5) * 60, s);
      c.stroke();
    }
    for (let i = 0; i < 5; i++) {
      blob(c, Math.random() * s, Math.random() * s, 20 + Math.random() * 40, '80,76,66', 0.18);
    }

    // A few small parts laid out on the mat: cool-toned plates and dark fasteners.
    for (let i = 0; i < 5; i++) {
      c.save();
      c.translate(mid + (Math.random() - 0.5) * s * 0.6, mid + (Math.random() - 0.5) * s * 0.45);
      c.rotate(Math.random() * Math.PI);
      c.fillStyle = Math.random() < 0.45 ? '#3a6183' : '#2f333a';
      const w = 8 + Math.random() * 22;
      const h = 6 + Math.random() * 12;
      c.fillRect(-w / 2, -h / 2, w, h);
      c.fillStyle = 'rgba(158,172,188,0.5)';
      c.fillRect(-w / 2, -h / 2, w, 2);
      c.restore();
    }
    speckle(c, s, 1400, 'rgba(78,74,64,0.2)', 'rgba(214,210,200,0.16)');
    c.restore();
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
