import * as THREE from 'three';

// Shared dressing for the two space cinematics (the opening intro and the galaxy reveal): the
// soft point sprite and the procedural star fields both scenes hang their sky on. Extracted from
// GalaxyRevealScene.ts when the intro was added so neither scene owns the other's helpers.

/** Soft round sprite shared by star fields, asteroid dust and the engine trail. Without a map,
 * THREE.PointsMaterial draws hard-edged SQUARES — which is exactly what the pre-fix renders
 * show: white squares for stars and chunky grey blocks for the asteroid belt, both obvious
 * enough to read as a rendering fault rather than as sky. */
let pointSprite: THREE.Texture | null = null;
export function getPointSprite(): THREE.Texture {
  if (pointSprite) return pointSprite;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.25)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  pointSprite = new THREE.CanvasTexture(canvas);
  return pointSprite;
}

export function buildStarfield(count: number, spread: number, size: number): THREE.Points {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const tint = new THREE.Color();
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * spread;
    positions[i * 3 + 1] = (Math.random() - 0.5) * spread;
    positions[i * 3 + 2] = (Math.random() - 0.5) * spread;
    const warmth = Math.random();
    tint.setHSL(warmth > 0.8 ? 0.08 : warmth < 0.15 ? 0.6 : 0.12, 0.25, 0.75 + Math.random() * 0.25);
    // Most stars should be faint. A uniform brightness reads as a scattering of identical dots
    // rather than a sky with depth in it, so each star gets a random dimming weighted toward dim.
    const brightness = 0.25 + Math.pow(Math.random(), 2.2) * 0.75;
    colors[i * 3] = tint.r * brightness;
    colors[i * 3 + 1] = tint.g * brightness;
    colors[i * 3 + 2] = tint.b * brightness;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    vertexColors: true,
    size,
    map: getPointSprite(),
    sizeAttenuation: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(geo, mat);
}
