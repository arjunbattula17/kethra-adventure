import * as THREE from 'three';

// Shared dressing for the space scenes: the soft point sprite used by dust, trails and glows.
// The sky itself is spaceSky.ts.

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
