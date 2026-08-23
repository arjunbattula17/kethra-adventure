import * as THREE from 'three';
import type { InteriorCtx } from './ctx';
import { ROOM_W, ROOM_D, ROOM_H } from './ctx';
import {
  buildCeilingPlateTexture,
  buildCeilingPlateRoughness,
  buildCeilingPlateNormal,
} from './ceilingTextures';

/**
 * Flat ceiling slab over the kit wall tops. The kit's own TopAstra caps close the top of each
 * wall bay (they run y 3..5, the full ROOM_H), but they don't span the open middle of a 12x16
 * room on their own — there is no Quaternius "ceiling" category in this kit, so this stays the
 * one hand-built structural piece, resized to the new footprint and dropped down 4 cm so it seats
 * just under the wall tops instead of poking through them.
 */
export function buildCeiling(ctx: InteriorCtx): void {
  const plateMap = buildCeilingPlateTexture();
  const plateRough = buildCeilingPlateRoughness();
  const plateNormal = buildCeilingPlateNormal();
  plateMap.repeat.set(ROOM_W / 2, ROOM_D / 2);
  plateRough.repeat.set(ROOM_W / 2, ROOM_D / 2);
  plateNormal.repeat.set(ROOM_W / 2, ROOM_D / 2);

  const slabMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: plateMap,
    roughnessMap: plateRough,
    normalMap: plateNormal,
    roughness: 1,
    metalness: 0.28,
  });
  slabMat.normalScale.set(0.8, 0.8);

  const slab = new THREE.Mesh(new THREE.BoxGeometry(ROOM_W, 0.12, ROOM_D), slabMat);
  slab.position.set(0, ROOM_H - 0.06, 0);
  slab.receiveShadow = true;
  ctx.scene.add(slab);

  // Shallow transverse beams for a little structural rhythm, echoing the wall bay spacing so the
  // ceiling doesn't read as a bare painted lid.
  const beamMat = new THREE.MeshStandardMaterial({ color: 0x454e58, roughness: 0.6, metalness: 0.55 });
  const beamGeo = new THREE.BoxGeometry(ROOM_W - 0.3, 0.2, 0.28);
  for (const z of [-6, -2, 2, 6]) {
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(0, ROOM_H - 0.22, z);
    beam.castShadow = true;
    beam.receiveShadow = true;
    ctx.scene.add(beam);
  }
}
