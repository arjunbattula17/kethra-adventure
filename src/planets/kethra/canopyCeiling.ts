import * as THREE from 'three';
import { getPointSprite } from '../../galaxy/spaceDressing';

/**
 * The canopy over the grove, seen from below: the same lantern-tree canopy the skiff came down
 * through in MG2, as a ceiling of dark leaf clumps with lantern pods hanging under it on their
 * threads, open above the landing terrace where the skiff broke through. It only has to read from
 * the terraces, so it is a few thousand triangles in four draw calls, and it makes no light of its
 * own: its pods glow, and the wake (wake.ts) lights it when the Heart wakes.
 */
export interface CanopyCeiling {
  group: THREE.Group;
  /** The leaves' material, for the wake. */
  leaves: THREE.MeshStandardMaterial;
  update(elapsed: number): void;
}

const CENTRE = { x: 0, z: -6 };
const REACH = 62;
/** Where the skiff came down, and how wide the hole it left is. */
const HOLE = { x: 2, z: 17, r: 6 };

/**
 * Its own seeded random, not the grove's: drawing from groveRandom here would shift every scatter
 * after it, and the boulders' places are checked against the paths (tools/collision-check.mjs).
 */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildCanopyCeiling(): CanopyCeiling {
  const groveRandom = seeded(4071);
  const group = new THREE.Group();
  group.name = 'canopy-ceiling';

  const leaves = new THREE.MeshStandardMaterial({ color: 0x0f2a22, emissive: 0x0d2a22, emissiveIntensity: 0.6, roughness: 0.9, flatShading: true });
  const clumpGeo = new THREE.IcosahedronGeometry(1, 1);
  const clumps: THREE.Matrix4[] = [];
  const pods: THREE.Vector3[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (let tries = 0; clumps.length < 260 && tries < 4000; tries++) {
    const a = groveRandom() * Math.PI * 2;
    const d = Math.sqrt(groveRandom()) * REACH;
    const x = CENTRE.x + Math.cos(a) * d;
    const z = CENTRE.z + Math.sin(a) * d;
    const size = 3 + groveRandom() * 4;
    if (Math.hypot(x - HOLE.x, z - HOLE.z) < HOLE.r + size * 0.7) continue;
    const y = 25 + groveRandom() * 6 + d * 0.06;
    m.compose(new THREE.Vector3(x, y, z), q.setFromEuler(e.set(0, groveRandom() * Math.PI, 0)), new THREE.Vector3(size, size * (0.28 + groveRandom() * 0.18), size * (0.75 + groveRandom() * 0.4)));
    clumps.push(m.clone());
    // Most clumps carry a lantern or two under them.
    const n = groveRandom() < 0.55 ? 1 + Math.floor(groveRandom() * 2) : 0;
    for (let i = 0; i < n; i++) {
      pods.push(new THREE.Vector3(x + (groveRandom() - 0.5) * size, y - size * 0.25 - 1 - groveRandom() * 3.5, z + (groveRandom() - 0.5) * size));
    }
  }
  const clumpMesh = new THREE.InstancedMesh(clumpGeo, leaves, clumps.length);
  clumps.forEach((mat, i) => clumpMesh.setMatrixAt(i, mat));
  clumpMesh.instanceMatrix.needsUpdate = true;
  clumpMesh.computeBoundingSphere();
  group.add(clumpMesh);

  // Pods: small lanterns, warm and teal as in the canopy, on threads up into the leaves.
  const podGeo = new THREE.OctahedronGeometry(0.22, 0);
  podGeo.scale(1, 1.5, 1);
  const podMesh = new THREE.InstancedMesh(podGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), pods.length);
  const warm = new THREE.Color(0xffc27a);
  const teal = new THREE.Color(0x5fd9c8);
  const threadPts: number[] = [];
  const podColours = pods.map((p, i) => {
    podMesh.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z));
    const c = (groveRandom() < 0.6 ? warm : teal).clone().multiplyScalar(1.6);
    podMesh.setColorAt(i, c);
    threadPts.push(p.x, p.y + 0.3, p.z, p.x, p.y + 3.2, p.z);
    return c;
  });
  podMesh.instanceMatrix.needsUpdate = true;
  podMesh.computeBoundingSphere();
  group.add(podMesh);
  const threads = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(threadPts, 3)),
    new THREE.LineBasicMaterial({ color: 0x1c3a30, transparent: true, opacity: 0.6 }),
  );
  group.add(threads);
  const halos = new THREE.Points(
    new THREE.BufferGeometry().setFromPoints(pods),
    new THREE.PointsMaterial({ map: getPointSprite(), color: 0xffd2a0, size: 2.4, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  group.add(halos);

  const base = new THREE.Color();
  return {
    group,
    leaves,
    update(elapsed) {
      // A slow breath through the pods, each on its own phase.
      podColours.forEach((c, i) => {
        podMesh.setColorAt(i, base.copy(c).multiplyScalar(0.8 + 0.2 * Math.sin(elapsed * 0.7 + i * 1.7)));
      });
      podMesh.instanceColor!.needsUpdate = true;
    },
  };
}
