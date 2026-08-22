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
