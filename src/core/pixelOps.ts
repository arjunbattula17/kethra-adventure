/**
 * Per-pixel height-to-normal conversions for the procedural canvas textures, on raw RGBA bytes.
 *
 * The ship's painters each had their own copy, sampling through a closure that wrapped every
 * coordinate with two modulos and normalising with Math.hypot, which V8 runs several times slower
 * than a square root. Together they were ~2.5 s of the Wren's first build on an Intel UHD laptop
 * (docs/PERF_LOG.md, 2026-09-28). These keep each copy's arithmetic, operation for operation; only
 * the indexing and the /255 (a table of the same quotients) changed, and the length is a square
 * root. tools/pixel-ops-check.mjs compares every byte with the originals: about 1.6 bytes in a
 * million differ, by 1/255, where hypot's last bit tipped a channel across a rounding boundary.
 * (Math.hypot's last bit was never portable: V8, SpiderMonkey and JavaScriptCore each compute it
 * their own way, while a square root is correctly rounded everywhere.) About 3x faster.
 *
 * Every function reads the red channel of `src` as height, samples with wrap-around (the maps
 * tile), and writes opaque RGBA into `out` (same size).
 */

const BYTE_TO_UNIT = new Float64Array(256);
for (let i = 0; i < 256; i++) BYTE_TO_UNIT[i] = i / 255;

/**
 * Central differences, the form the walls, floor, console and props painters use:
 * n = normalize(-dx, dy, 1), with dx and dy the height differences times `strength`.
 */
export function centralNormals(src: Uint8ClampedArray, w: number, h: number, strength: number, out: Uint8ClampedArray): void {
  const H = BYTE_TO_UNIT;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    const up = (y === 0 ? h - 1 : y - 1) * w;
    const down = (y === h - 1 ? 0 : y + 1) * w;
    for (let x = 0; x < w; x++) {
      const left = x === 0 ? w - 1 : x - 1;
      const right = x === w - 1 ? 0 : x + 1;
      const dx = (H[src[(row + right) << 2]] - H[src[(row + left) << 2]]) * strength;
      const dy = (H[src[(down + x) << 2]] - H[src[(up + x) << 2]]) * strength;
      const len = Math.sqrt(dx * dx + dy * dy + 1);
      const i = (row + x) << 2;
      out[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      out[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      out[i + 2] = (1 / len) * 0.5 * 255 + 127.5;
      out[i + 3] = 255;
    }
  }
}

/** The displays painter's form: the same differences, scaled by 1 / length. */
export function centralNormalsInv(src: Uint8ClampedArray, w: number, h: number, strength: number, out: Uint8ClampedArray): void {
  const H = BYTE_TO_UNIT;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    const up = (y === 0 ? h - 1 : y - 1) * w;
    const down = (y === h - 1 ? 0 : y + 1) * w;
    for (let x = 0; x < w; x++) {
      const left = x === 0 ? w - 1 : x - 1;
      const right = x === w - 1 ? 0 : x + 1;
      const nx = -(H[src[(row + right) << 2]] - H[src[(row + left) << 2]]) * strength;
      const ny = (H[src[(down + x) << 2]] - H[src[(up + x) << 2]]) * strength;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      const i = (row + x) << 2;
      out[i] = (nx * inv * 0.5 + 0.5) * 255;
      out[i + 1] = (ny * inv * 0.5 + 0.5) * 255;
      out[i + 2] = (inv * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
  }
}

/** The starfield window's form: differences taken on the raw bytes, then divided by 255. */
export function centralNormalsFromBytes(src: Uint8ClampedArray, w: number, h: number, strength: number, out: Uint8ClampedArray): void {
  for (let y = 0; y < h; y++) {
    const row = y * w;
    const up = (y === 0 ? h - 1 : y - 1) * w;
    const down = (y === h - 1 ? 0 : y + 1) * w;
    for (let x = 0; x < w; x++) {
      const left = x === 0 ? w - 1 : x - 1;
      const right = x === w - 1 ? 0 : x + 1;
      const dx = ((src[(row + right) << 2] - src[(row + left) << 2]) / 255) * strength;
      const dy = ((src[(down + x) << 2] - src[(up + x) << 2]) / 255) * strength;
      const nx = -dx;
      const ny = dy;
      const len = Math.sqrt(nx * nx + ny * ny + 1);
      const i = (row + x) << 2;
      out[i] = ((nx / len) * 0.5 + 0.5) * 255;
      out[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      out[i + 2] = (1 / len) * 0.5 * 255 + 127.5;
      out[i + 3] = 255;
    }
  }
}

/** The ceiling painter's form: a 3x3 Sobel kernel, rounded to the nearest byte (it always used sqrt). */
export function sobelNormals(src: Uint8ClampedArray, w: number, h: number, strength: number, out: Uint8ClampedArray): void {
  const H = BYTE_TO_UNIT;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    const up = (y === 0 ? h - 1 : y - 1) * w;
    const down = (y === h - 1 ? 0 : y + 1) * w;
    for (let x = 0; x < w; x++) {
      const l = x === 0 ? w - 1 : x - 1;
      const r = x === w - 1 ? 0 : x + 1;
      const dx =
        (H[src[(up + r) << 2]] + 2 * H[src[(row + r) << 2]] + H[src[(down + r) << 2]] -
          H[src[(up + l) << 2]] - 2 * H[src[(row + l) << 2]] - H[src[(down + l) << 2]]) * strength;
      const dy =
        (H[src[(down + l) << 2]] + 2 * H[src[(down + x) << 2]] + H[src[(down + r) << 2]] -
          H[src[(up + l) << 2]] - 2 * H[src[(up + x) << 2]] - H[src[(up + r) << 2]]) * strength;
      const nx = -dx;
      const ny = dy;
      const len = Math.sqrt(nx * nx + ny * ny + 1);
      const i = (row + x) << 2;
      out[i] = Math.round(((nx / len) * 0.5 + 0.5) * 255);
      out[i + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255);
      out[i + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
      out[i + 3] = 255;
    }
  }
}
