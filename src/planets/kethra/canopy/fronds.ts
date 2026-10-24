import * as THREE from 'three';

/**
 * A clump of the lantern-trees' broad leaves, for the canopy (CanopyScene): leaves radiating from a
 * centre and drooping, each a creased low-poly blade of four facets, with a few smaller ones standing
 * up in the middle for volume. Vertex colour runs pale along the midrib and dark at the edges, so
 * each leaf reads as a leaf under any light, and the canopy's glow lights the veins (the colour's
 * green channel) rather than the whole blade. About 1.4 m across before its instance's scale.
 */
export function frondClump(seed: number): THREE.BufferGeometry {
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const position: number[] = [];
  const color: number[] = [];
  const vein = new THREE.Color();
  const edge = new THREE.Color();
  const leaf = (angle: number, length: number, width: number, droop: number, lift: number) => {
    const ux = Math.cos(angle);
    const uz = Math.sin(angle);
    // Base, midrib crease, the blade's widest points either side, and the tip.
    const B = [0, lift, 0];
    const M = [ux * length * 0.5, lift + 0.07 - droop * 0.3, uz * length * 0.5];
    const L = [ux * length * 0.42 - uz * width, lift - droop * 0.38, uz * length * 0.42 + ux * width];
    const R = [ux * length * 0.42 + uz * width, lift - droop * 0.38, uz * length * 0.42 - ux * width];
    const T = [ux * length, lift - droop, uz * length];
    // Relative to the material's dark leaf colour: the midrib full, the edges about a quarter, each
    // leaf a little different.
    const k = rand();
    vein.setRGB(0.82 + 0.18 * k, 1, 0.9 + 0.1 * k);
    edge.setRGB(0.12 + 0.06 * k, 0.2 + 0.05 * k, 0.17 + 0.05 * k);
    const v = (p: number[], c: THREE.Color) => {
      position.push(p[0], p[1], p[2]);
      color.push(c.r, c.g, c.b);
    };
    // Wound so the upper faces point up (the canopy is seen from above).
    v(B, vein); v(L, edge); v(M, vein);
    v(M, vein); v(L, edge); v(T, vein);
    v(B, vein); v(M, vein); v(R, edge);
    v(M, vein); v(T, vein); v(R, edge);
  };
  const ring = 7 + Math.floor(rand() * 3);
  for (let i = 0; i < ring; i++) {
    const angle = (i / ring) * Math.PI * 2 + (rand() - 0.5) * 0.5;
    leaf(angle, 1.15 + rand() * 0.4, 0.3 + rand() * 0.14, 0.3 + rand() * 0.3, 0);
  }
  for (let i = 0; i < 3; i++) leaf(rand() * Math.PI * 2, 0.6 + rand() * 0.25, 0.2, -0.25, 0.08);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
  g.computeVertexNormals();
  return g;
}
