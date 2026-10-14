// Checks src/core/pixelOps.ts against the per-painter originals it replaced: every byte of every
// output, on synthetic height fields (noise, smooth relief, hard 0/255 steps, flat) at the sizes and
// strengths the ship's painters use. Passes when no byte is off by more than 1 and fewer than 10 in a
// million are off at all (sqrt vs hypot in the last bit; see pixelOps.ts). Prints the speed-up.
//
//   node tools/pixel-ops-check.mjs
import { centralNormals, centralNormalsInv, centralNormalsFromBytes, sobelNormals } from '../src/core/pixelOps.ts';

// ---- the originals, verbatim apart from reading/writing plain arrays instead of canvases ----
function wallsOriginal(src, size, _h, strength, out) {
  const at = (x, y) => src[((((y % size) + size) % size) * size + (((x % size) + size) % size)) * 4] / 255;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      out[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      out[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      out[i + 2] = (1 / len) * 0.5 * 255 + 127.5;
      out[i + 3] = 255;
    }
  }
}
function consoleOriginal(src, S, _h, strength, img) {
  const at = (x, y) => src[((((y % S) + S) % S) * S + (((x % S) + S) % S)) * 4] / 255;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const nx = -(at(x + 1, y) - at(x - 1, y)) * strength;
      const ny = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(nx, ny, 1);
      const i = (y * S + x) * 4;
      img[i] = ((nx / len) * 0.5 + 0.5) * 255;
      img[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      img[i + 2] = (1 / len) * 0.5 * 255 + 127.5;
      img[i + 3] = 255;
    }
  }
}
function propsOriginal(src, w, h, strength, img) {
  const at = (x, y) => src[((((y % h) + h) % h) * w + (((x % w) + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (at(x - 1, y) - at(x + 1, y)) * strength;
      const ny = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(nx, ny, 1);
      const i = (y * w + x) * 4;
      img[i] = ((nx / len) * 0.5 + 0.5) * 255;
      img[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      img[i + 2] = (1 / len) * 127.5 + 127.5;
      img[i + 3] = 255;
    }
  }
}
function displaysOriginal(h, size, _h, strength, img) {
  const at = (x, y) => h[((((y % size) + size) % size) * size + (((x % size) + size) % size)) * 4] / 255;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = -(at(x + 1, y) - at(x - 1, y)) * strength;
      const ny = (at(x, y + 1) - at(x, y - 1)) * strength;
      const inv = 1 / Math.hypot(nx, ny, 1);
      const i = (y * size + x) * 4;
      img[i] = (nx * inv * 0.5 + 0.5) * 255;
      img[i + 1] = (ny * inv * 0.5 + 0.5) * 255;
      img[i + 2] = (inv * 0.5 + 0.5) * 255;
      img[i + 3] = 255;
    }
  }
}
function starfieldOriginal(src, w, ht, strength, d) {
  const at = (x, y) => src[((((y % ht) + ht) % ht) * w + (((x % w) + w) % w)) * 4];
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
}
function ceilingOriginal(data, W, H, strength, out) {
  const at = (x, y) => data[((((y % H) + H) % H) * W + (((x % W) + W) % W)) * 4] / 255;
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
      out[i] = Math.round(((nx / len) * 0.5 + 0.5) * 255);
      out[i + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255);
      out[i + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
      out[i + 3] = 255;
    }
  }
}

// ---- synthetic height fields ----
let seed = 1;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
function field(kind, w, h) {
  const a = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v;
      if (kind === 'noise') v = rnd() * 256;
      else if (kind === 'smooth') v = 128 + 90 * Math.sin(x / 13) * Math.cos(y / 7);
      else if (kind === 'steps') v = ((x >> 3) + (y >> 4)) % 2 ? 255 : 0;
      else if (kind === 'mixed') v = 128 + 60 * Math.sin(x / 31) + (rnd() - 0.5) * 70 + (((x >> 5) % 3 === 0) ? 60 : 0);
      else v = 128;
      a[(y * w + x) * 4] = v;
    }
  }
  return a;
}

const cases = [
  ['walls/floor', wallsOriginal, centralNormals, true],
  ['console', consoleOriginal, centralNormals, true],
  ['props', propsOriginal, centralNormals, false],
  ['displays', displaysOriginal, centralNormalsInv, true],
  ['starfield', starfieldOriginal, centralNormalsFromBytes, false],
  ['ceiling', ceilingOriginal, sobelNormals, false],
];
const strengths = [0.3, 0.35, 1.4, 1.5, 1.8, 2.6, 3.4, 5.0, 7.5, 11, 24];
let failures = 0;
for (const [name, orig, next, squareOnly] of cases) {
  let bytes = 0;
  let diffs = 0;
  let worst = 0;
  let tOld = 0;
  let tNew = 0;
  for (const [w, h] of squareOnly ? [[256, 256], [512, 512], [1024, 1024]] : [[256, 256], [300, 180], [1024, 280], [512, 512]]) {
    for (const kind of ['noise', 'smooth', 'steps', 'mixed', 'flat']) {
      const src = field(kind, w, h);
      for (const s of strengths) {
        const a = new Uint8ClampedArray(w * h * 4);
        const b = new Uint8ClampedArray(w * h * 4);
        let t = performance.now();
        orig(src, w, h, s, a);
        tOld += performance.now() - t;
        t = performance.now();
        next(src, w, h, s, b);
        tNew += performance.now() - t;
        bytes += a.length;
        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { diffs++; worst = Math.max(worst, Math.abs(a[i] - b[i])); }
      }
    }
  }
  const ok = worst <= 1 && diffs / bytes < 1e-5;
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(12)} ${diffs} of ${bytes} bytes differ (worst ${worst})   ${(tOld / 1000).toFixed(2)} s -> ${(tNew / 1000).toFixed(2)} s (${(tOld / tNew).toFixed(1)}x)`);
}
process.exit(failures ? 1 : 0);
