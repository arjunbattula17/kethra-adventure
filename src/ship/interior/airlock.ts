import * as THREE from 'three';
import type { InteriorCtx } from './ctx';
import { ROOM_D } from './ctx';
import { placeKitPiece, preloadKit } from './kit';

const HALF_D = ROOM_D / 2;
const DOOR_Z = HALF_D;
const DOOR_YAW = Math.PI; // faces -Z, into the room

/**
 * The aft airlock: a real Quaternius door frame + leaf filling the one straight bay walls.ts
 * deliberately left open on the airlock (+Z) wall, plus the small keypad panel and warm door
 * pool the room's lighting rig / blink loop already depend on.
 */
export async function buildAirlock(ctx: InteriorCtx): Promise<void> {
  await preloadKit(['Door_Frame_Square', 'Door_DarkMetal']);

  await Promise.all([
    placeKitPiece(ctx.scene, 'Door_Frame_Square', [0, 0, DOOR_Z], DOOR_YAW),
    placeKitPiece(ctx.scene, 'Door_DarkMetal', [0, 0, DOOR_Z], DOOR_YAW),
  ]);

  // Warm practical over the doorway — the same fixture type as every other door pool in the room,
  // kept from the hand-built airlock so the aft end doesn't go cold once the geometry is real.
  const doorLight = new THREE.PointLight(0xffd9a0, 1.1, 4.2, 2);
  doorLight.position.set(0, 3.1, HALF_D - 0.4);
  ctx.scene.add(doorLight);

  // Small keypad panel beside the frame — the one piece of the old hand-built airlock with an
  // actual gameplay tie-in (its three lamps run on the shared status-blink loop), so it survives
  // the geometry rebuild instead of being dropped.
  const panelMat = new THREE.MeshStandardMaterial({ color: 0x2f333a, roughness: 0.7, metalness: 0.3 });
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.08), panelMat);
  panel.position.set(-1.5, 1.5, HALF_D - 0.35);
  panel.castShadow = true;
  panel.receiveShadow = true;
  ctx.scene.add(panel);

  const lampGeo = new THREE.CylinderGeometry(0.026, 0.026, 0.025, 10);
  const lampColors = [0x4fd8f0, 0x8ef0b0, 0xe0552f];
  lampColors.forEach((color, i) => {
    const mat = new THREE.MeshStandardMaterial({ color: 0x14181d, emissive: color, emissiveIntensity: 1.4, roughness: 0.35 });
    const lamp = new THREE.Mesh(lampGeo, mat);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(-1.5, 1.66 - i * 0.14, HALF_D - 0.3);
    ctx.scene.add(lamp);
    ctx.statusLights.push({ mesh: lamp, material: mat, phase: i * 1.7, onIntensity: 1.9 });
  });
}
