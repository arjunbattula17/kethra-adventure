import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Kethra's set-dressing models (public/models/CREDITS.md, "kethra/"): each was rebuilt from its
// source into a low-poly piece for this scene by tools outside the build, so every file is a single
// node with no transform and its primitives are ready to instance as they are.
const BASE = `${import.meta.env.BASE_URL}models/kethra`;

export type PropName = 'jacaranda' | 'tree_small';

export interface PropPrimitive {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
}

/**
 * Loads one model's primitives, in file order. Nothing is cached between visits: KethraScene
 * disposes every geometry and texture it owns when it is left, and the browser's HTTP cache makes
 * the second download free.
 */
export async function loadProp(name: PropName): Promise<PropPrimitive[]> {
  const gltf = await new GLTFLoader().loadAsync(`${BASE}/${name}.glb`);
  const prims: PropPrimitive[] = [];
  gltf.scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) prims.push({ geometry: mesh.geometry, material: mesh.material as THREE.MeshStandardMaterial });
  });
  return prims;
}
