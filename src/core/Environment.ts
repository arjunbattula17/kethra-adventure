import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

let sharedEnvironment: THREE.Texture | null = null;

export function initSharedEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  if (sharedEnvironment) return sharedEnvironment;
  const pmrem = new THREE.PMREMGenerator(renderer);
  sharedEnvironment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return sharedEnvironment;
}

export function getSharedEnvironment(): THREE.Texture | null {
  return sharedEnvironment;
}

/**
 * After a GPU context loss the environment map's pixels are gone: they only ever existed on the GPU
 * (PMREM renders them there), so unlike a texture loaded from an image, three.js has nothing to
 * re-upload. Render a fresh one and hand it back for the caller to swap in.
 */
export function rebuildSharedEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  sharedEnvironment = null;
  return initSharedEnvironment(renderer);
}
