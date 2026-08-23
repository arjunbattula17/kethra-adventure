import * as THREE from 'three';
import type { InteractionSystem } from '../../player/InteractionSystem';
import { buildPanelGrimeTexture } from '../ShipTextures';

// 12x16, three-by-four 4-unit tiles — a clean multiple of the Quaternius kit's grid (KIT_TILE=4,
// KIT_WALL_H=5 in kit.ts) and exactly 4/3 the old 9x12x4 hand-built room in every axis, which is
// what lets every hand-built piece below be *repositioned* by that same 4/3 (xz) scale instead of
// redesigned from scratch.
export const ROOM_W = 12;
export const ROOM_D = 16;
export const ROOM_H = 5;

export interface StatusLight {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  phase: number;
  onIntensity: number;
}

/**
 * Shared build context handed to every interior module. Each module owns one visual "piece" of
 * the room and only touches its own file, so pieces can be iterated on independently.
 */
export interface InteriorCtx {
  scene: THREE.Scene;
  interaction: InteractionSystem;
  /** Meshes the player's ground raycast may land on. */
  floorMeshes: THREE.Object3D[];
  /** Lights pulsed together as the console's ambient glow. */
  consoleGlow: THREE.PointLight[];
  floorLedMats: THREE.MeshStandardMaterial[];
  /** Blinking indicator dots driven by the shared status blink loop. */
  statusLights: StatusLight[];
  /** Per-frame hooks a module can register for its own animation. */
  animated: ((elapsed: number, dt: number) => void)[];
  setStarfield(points: THREE.Points): void;
  setEmergencyLight(light: THREE.PointLight): void;
}

export function addGrimeOverlay(
  ctx: InteriorCtx,
  width: number,
  height: number,
  position: THREE.Vector3,
  rotation: THREE.Euler,
  opacity = 0.4,
): void {
  const grimeMat = new THREE.MeshBasicMaterial({
    map: buildPanelGrimeTexture(),
    transparent: true,
    opacity,
    blending: THREE.MultiplyBlending,
    premultipliedAlpha: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), grimeMat);
  mesh.position.copy(position);
  mesh.rotation.copy(rotation);
  mesh.renderOrder = 1;
  ctx.scene.add(mesh);
}
