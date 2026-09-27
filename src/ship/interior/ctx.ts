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
  /**
   * Meshes the static-geometry batching pass (batchStaticGeometry.ts) must leave alone: anything
   * whose own position/rotation/scale is mutated per frame (merging bakes a mesh's transform into
   * shared vertex data, so an animated transform would freeze at whatever it was during batching),
   * plus interaction targets and the floor raycast slab, where identity matters for other reasons.
   * Material-property animation (emissiveIntensity, light intensity, texture offset) is unaffected
   * by merging and does not need registration here.
   */
  noMerge: Set<THREE.Object3D>;
  /**
   * Materials whose properties change after the build (a flickering tube, the alarm beacons, a
   * dropping-out panel). The merge pass shares identical materials between meshes; one of these
   * must never be merged into another, or both would start animating.
   */
  animatedMaterials: Set<THREE.Material>;
  /** Lights and materials that keep their own light whatever the ship's power stage (power.ts):
   * alarms, a fault bulb running its own flicker, the view outside. */
  ownLight: Set<object>;
  setStarfield(points: THREE.Points): void;
  setEmergencyLight(light: THREE.PointLight): void;
}

/**
 * Keeps an interaction group aim-able while letting its meshes join the static batches.
 * InteractionSystem raycasts recursively into the registered object; once batching moves the
 * group's meshes into scene-level merges there would be nothing left to hit. So an invisible box
 * the size of the group, parented to it, becomes the hit target: the raycaster ignores visibility,
 * an invisible material draws nothing, and buildInteriorColliders skips MeshBasicMaterial. The
 * group itself stays registered, so the proximity fallback still measures from its origin.
 *
 * It used to keep the whole subtree out of batching instead: about 230 meshes (the desk, the
 * journal terminal, the repair station), each its own draw call, and a per-frame recursive
 * raycast through all of them.
 */
export function addInteractionProxy(ctx: InteriorCtx, group: THREE.Object3D, pad = 0.02): void {
  group.updateWorldMatrix(true, true);
  const local = new THREE.Box3().setFromObject(group).applyMatrix4(group.matrixWorld.clone().invert());
  const size = local.getSize(new THREE.Vector3()).addScalar(pad * 2);
  const proxy = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), new THREE.MeshBasicMaterial({ visible: false }));
  proxy.name = `${group.name || 'interactable'}-aim-proxy`;
  local.getCenter(proxy.position);
  group.add(proxy);
  ctx.noMerge.add(proxy);
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
