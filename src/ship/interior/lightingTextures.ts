import * as THREE from 'three';

import { mulberry32 } from '../../core/rng';


// Procedural canvas textures owned by the lighting piece. Every one of these is a *neutral*
// (white/greyscale) alpha ramp so a single texture can be tinted warm / cool / alarm-red by the
// material's `color` and shared across every fixture in the room — the glow atlas costs four
// small canvases total instead of one per light.

function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; c: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return { canvas, c: canvas.getContext('2d')! };
}

let radialGlow: THREE.CanvasTexture | null = null;
/** Soft round halo with a hot core — the bloom-catching corona around a bare tube or bulb. */
export function buildRadialGlowTexture(): THREE.CanvasTexture {
  if (radialGlow) return radialGlow;
  const size = 128;
  const { canvas, c } = makeCanvas(size, size);
  const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.1, 'rgba(255,252,244,0.8)');
  g.addColorStop(0.28, 'rgba(255,244,226,0.34)');
  g.addColorStop(0.6, 'rgba(255,238,214,0.09)');
  g.addColorStop(1, 'rgba(255,236,210,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, size, size);
  radialGlow = new THREE.CanvasTexture(canvas);
  radialGlow.colorSpace = THREE.SRGBColorSpace;
  return radialGlow;
}

let barGlow: THREE.CanvasTexture | null = null;
/** Elongated soft bar — the halo of a linear tube fixture, and the graze it throws on the wall. */
export function buildBarGlowTexture(): THREE.CanvasTexture {
  if (barGlow) return barGlow;
  const w = 256;
  const h = 64;
  const { canvas, c } = makeCanvas(w, h);
  const vertical = c.createLinearGradient(0, 0, 0, h);
  vertical.addColorStop(0, 'rgba(255,246,230,0)');
  vertical.addColorStop(0.34, 'rgba(255,250,240,0.42)');
  vertical.addColorStop(0.5, 'rgba(255,255,255,1)');
  vertical.addColorStop(0.66, 'rgba(255,250,240,0.42)');
  vertical.addColorStop(1, 'rgba(255,246,230,0)');
  c.fillStyle = vertical;
  c.fillRect(0, 0, w, h);

  // Mask the ends so the bar tapers out instead of stopping dead at the quad edge.
  const horizontal = c.createLinearGradient(0, 0, w, 0);
  horizontal.addColorStop(0, 'rgba(0,0,0,0)');
  horizontal.addColorStop(0.16, 'rgba(0,0,0,0.85)');
  horizontal.addColorStop(0.5, 'rgba(0,0,0,1)');
  horizontal.addColorStop(0.84, 'rgba(0,0,0,0.85)');
  horizontal.addColorStop(1, 'rgba(0,0,0,0)');
  c.globalCompositeOperation = 'destination-in';
  c.fillStyle = horizontal;
  c.fillRect(0, 0, w, h);

  barGlow = new THREE.CanvasTexture(canvas);
  barGlow.colorSpace = THREE.SRGBColorSpace;
  return barGlow;
}

let wallCone: THREE.CanvasTexture | null = null;
/**
 * The pool a hooded downlight throws on the wall below it: narrow and hot at the lens, widening
 * and fading out toward the deck. Canvas row 0 is the lens end — CanvasTexture flips Y, so row 0
 * lands at the TOP of the quad.
 */
export function buildWallConeTexture(): THREE.CanvasTexture {
  const rng = mulberry32(0x4c01);
  if (wallCone) return wallCone;
  const w = 128;
  const h = 256;
  const { canvas, c } = makeCanvas(w, h);
  c.clearRect(0, 0, w, h);

  for (let y = 0; y < h; y++) {
    const t = y / (h - 1);
    const half = (0.11 + 0.89 * Math.pow(t, 0.8)) * (w / 2);
    // Fades out toward the deck, and ramps in over the first few rows so the cone starts at the
    // lens rather than as a hard bright line.
    const a = Math.pow(1 - t, 1.75) * Math.min(1, t * 9) * 0.92;
    if (a <= 0.002) continue;
    const g = c.createLinearGradient(w / 2 - half, 0, w / 2 + half, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.28, `rgba(255,255,255,${(a * 0.62).toFixed(4)})`);
    g.addColorStop(0.5, `rgba(255,255,255,${a.toFixed(4)})`);
    g.addColorStop(0.72, `rgba(255,255,255,${(a * 0.62).toFixed(4)})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(w / 2 - half, y, half * 2, 1);
  }

  // Faint dust striations inside the cone so it doesn't read as a clean gradient sweep.
  c.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 7; i++) {
    const x = w * (0.2 + rng() * 0.6);
    const g = c.createLinearGradient(x - 5, 0, x + 5, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.5, `rgba(0,0,0,${(0.1 + rng() * 0.14).toFixed(3)})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(x - 5, 0, 10, h);
  }

  wallCone = new THREE.CanvasTexture(canvas);
  wallCone.colorSpace = THREE.SRGBColorSpace;
  return wallCone;
}

let floorPool: THREE.CanvasTexture | null = null;
/** Irregular soft blob for the light pool a fixture drops on the deck. */
export function buildFloorPoolTexture(): THREE.CanvasTexture {
  const rng = mulberry32(0x4c02);
  if (floorPool) return floorPool;
  const size = 256;
  const { canvas, c } = makeCanvas(size, size);
  const g = c.createRadialGradient(size / 2, size / 2, size * 0.02, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.2, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.24)');
  g.addColorStop(0.72, 'rgba(255,255,255,0.07)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, size, size);

  // Bite chunks out of the rim so the pool edge is uneven — a perfect disc reads as a decal.
  c.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 14; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = size * (0.24 + rng() * 0.2);
    const x = size / 2 + Math.cos(angle) * dist;
    const y = size / 2 + Math.sin(angle) * dist;
    const r = size * (0.06 + rng() * 0.13);
    const bite = c.createRadialGradient(x, y, 0, x, y, r);
    bite.addColorStop(0, `rgba(0,0,0,${(0.18 + rng() * 0.22).toFixed(3)})`);
    bite.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = bite;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }

  floorPool = new THREE.CanvasTexture(canvas);
  floorPool.colorSpace = THREE.SRGBColorSpace;
  return floorPool;
}

let diffuser: THREE.CanvasTexture | null = null;
/**
 * Frosted lens face for tubes and troffer panels — hot toward the middle, banded by the internal
 * ribs, with a couple of dead/dirty patches. Used as an emissiveMap so a lit fixture has internal
 * structure instead of reading as a solid white rectangle under bloom.
 */
export function buildDiffuserTexture(): THREE.CanvasTexture {
  const rng = mulberry32(0x4c03);
  if (diffuser) return diffuser;
  const w = 128;
  const h = 64;
  const { canvas, c } = makeCanvas(w, h);
  c.fillStyle = '#fff6e6';
  c.fillRect(0, 0, w, h);

  const falloff = c.createLinearGradient(0, 0, 0, h);
  falloff.addColorStop(0, 'rgba(120,104,84,0.55)');
  falloff.addColorStop(0.35, 'rgba(255,255,255,0)');
  falloff.addColorStop(0.65, 'rgba(255,255,255,0)');
  falloff.addColorStop(1, 'rgba(120,104,84,0.55)');
  c.fillStyle = falloff;
  c.fillRect(0, 0, w, h);

  c.fillStyle = 'rgba(146,128,102,0.3)';
  for (let x = 4; x < w; x += 9) c.fillRect(x, 0, 2, h);

  // Grime settled in the lens — the reference has no perfectly clean fixture.
  for (let i = 0; i < 6; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const r = 4 + rng() * 12;
    const smudge = c.createRadialGradient(x, y, 0, x, y, r);
    smudge.addColorStop(0, `rgba(96,84,66,${(0.14 + rng() * 0.2).toFixed(3)})`);
    smudge.addColorStop(1, 'rgba(96,84,66,0)');
    c.fillStyle = smudge;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }

  diffuser = new THREE.CanvasTexture(canvas);
  diffuser.colorSpace = THREE.SRGBColorSpace;
  diffuser.wrapS = THREE.RepeatWrapping;
  diffuser.wrapT = THREE.RepeatWrapping;
  return diffuser;
}

let louver: THREE.CanvasTexture | null = null;
/** Egg-crate anti-glare grille laid over a recessed troffer face. Bars opaque, cells clear. */
export function buildLouverTexture(): THREE.CanvasTexture {
  if (louver) return louver;
  const size = 64;
  const { canvas, c } = makeCanvas(size, size);
  c.clearRect(0, 0, size, size);
  c.strokeStyle = 'rgba(255,255,255,0.95)';
  c.lineWidth = 5;
  for (let i = 0; i <= 4; i++) {
    const p = (i / 4) * size;
    c.beginPath();
    c.moveTo(p, 0);
    c.lineTo(p, size);
    c.moveTo(0, p);
    c.lineTo(size, p);
    c.stroke();
  }
  // Thin bright highlight down one side of each bar — the lit edge of a metal vane.
  c.strokeStyle = 'rgba(255,255,255,0.4)';
  c.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const p = (i / 4) * size + 3;
    c.beginPath();
    c.moveTo(p, 0);
    c.lineTo(p, size);
    c.stroke();
  }
  louver = new THREE.CanvasTexture(canvas);
  // Consumed as an alphaMap (green channel), not as colour — leave it un-decoded.
  louver.colorSpace = THREE.NoColorSpace;
  louver.wrapS = THREE.RepeatWrapping;
  louver.wrapT = THREE.RepeatWrapping;
  return louver;
}
