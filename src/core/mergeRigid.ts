import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();

/**
 * Folds the meshes of one part that moves as a unit into a mesh per material: a fan's blades, a
 * figure's head. `root` is the part; `stops` are parts hung from it that move on their own, which
 * are left for their own turn. Nothing about how the part looks or moves changes, only how many
 * draw calls it takes.
 */
export function mergeRigid(root: THREE.Object3D, stops: ReadonlySet<THREE.Object3D> = new Set()): void {
  root.updateMatrixWorld(true);
  const byMaterial = new Map<THREE.Material, THREE.Mesh[]>();
  const visit = (parent: THREE.Object3D) => {
    for (const child of parent.children) {
      if (stops.has(child)) continue;
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh && !Array.isArray(mesh.material)) {
        const meshes = byMaterial.get(mesh.material);
        if (meshes) meshes.push(mesh);
        else byMaterial.set(mesh.material, [mesh]);
      }
      visit(child);
    }
  };
  visit(root);
  const toRoot = root.matrixWorld.clone().invert();
  for (const [material, meshes] of byMaterial) {
    if (meshes.length < 2) continue;
    // Primitives are a mix of indexed and not; merging needs them alike.
    const parts = meshes.map((mesh) => (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()).applyMatrix4(_m.multiplyMatrices(toRoot, mesh.matrixWorld)));
    const geometry = mergeGeometries(parts, false);
    for (const part of parts) part.dispose();
    if (!geometry) continue;
    const merged = new THREE.Mesh(geometry, material);
    merged.castShadow = meshes[0].castShadow;
    merged.receiveShadow = meshes[0].receiveShadow;
    for (const mesh of meshes) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
    }
    root.add(merged);
  }
}
