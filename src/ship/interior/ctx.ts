import * as THREE from 'three';
import type { InteractionSystem } from '../../player/InteractionSystem';
import { buildPanelGrimeTexture } from '../ShipTextures';

export const ROOM_W = 9;
export const ROOM_D = 12;
export const ROOM_H = 4;
/** Seam height between the worn lower hull band and the cleaner upper trim band. */
export const WALL_SPLIT_Y = 2.3;

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

/**
 * Stacks a worn lower hull band under a cleaner upper trim band with a seam strip between them —
 * the layered-material read, instead of one texture stretched across a whole wall.
 */
export function addBandedWall(
  ctx: InteriorCtx,
  w: number,
  d: number,
  cx: number,
  cz: number,
  lowerMat: THREE.Material,
  upperMat: THREE.Material,
  seamMat: THREE.Material,
): void {
  const upperH = ROOM_H - WALL_SPLIT_Y;
  const lower = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_SPLIT_Y, d), lowerMat);
  lower.position.set(cx, WALL_SPLIT_Y / 2, cz);
  lower.receiveShadow = true;
  ctx.scene.add(lower);

  const upper = new THREE.Mesh(new THREE.BoxGeometry(w, upperH, d), upperMat);
  upper.position.set(cx, WALL_SPLIT_Y + upperH / 2, cz);
  upper.receiveShadow = true;
  ctx.scene.add(upper);

  const seam = new THREE.Mesh(new THREE.BoxGeometry(w * 0.98, 0.05, d + 0.02), seamMat);
  seam.position.set(cx, WALL_SPLIT_Y, cz);
  ctx.scene.add(seam);
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
