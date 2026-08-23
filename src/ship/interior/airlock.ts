import * as THREE from 'three';
import { applyPbr } from '../../core/TextureLibrary';
import { buildHazardStripeTexture, buildWarningStripeTexture } from '../ShipTextures';
import type { InteriorCtx } from './ctx';
import { ROOM_W, ROOM_D } from './ctx';

/** The aft airlock: hex door assembly, wheel, striped frame trim and its warm door light. */
export function buildAirlock(ctx: InteriorCtx): void {

  const hazardTex = buildHazardStripeTexture();
  hazardTex.repeat.set(6, 1);
  const hazardMat = new THREE.MeshStandardMaterial({ map: hazardTex, roughness: 0.6, metalness: 0.3 });

  // The airlock wall's front face sits at ROOM_D/2 - 0.1 (=5.9); every door element below
  // is kept solidly in front of that (smaller z, closer to camera) with clear gaps between
  // stages so nothing gets swallowed by the wall's own depth or z-fights against it.
  const kickstrip = new THREE.Mesh(new THREE.BoxGeometry(ROOM_W - 0.4, 0.16, 0.05), hazardMat);
  kickstrip.position.set(0, 0.1, ROOM_D / 2 - 0.2);
  ctx.scene.add(kickstrip);

  // Solid hex disc behind the door panel, slightly wider — its front cap shows as a
  // striped ring around the panel edge instead of a razor-thin silhouette line.
  const stripeTex = buildWarningStripeTexture('amber');
  stripeTex.repeat.set(6, 1);
  const frameMat = new THREE.MeshStandardMaterial({
    map: stripeTex,
    emissive: 0xd9a441,
    emissiveMap: stripeTex,
    emissiveIntensity: 0.35,
    roughness: 0.7,
    metalness: 0.2,
    side: THREE.DoubleSide,
  });
  const doorFrame = new THREE.Mesh(new THREE.CylinderGeometry(1.32, 1.32, 0.06, 6), frameMat);
  doorFrame.rotation.x = Math.PI / 2;
  doorFrame.position.set(0, 2.0, ROOM_D / 2 - 0.2);
  ctx.scene.add(doorFrame);

  // Hexagonal airlock panel, echoing reference 3's hex-door language.
  const doorMat = new THREE.MeshStandardMaterial({ color: 0xaeb6c2, roughness: 0.75, metalness: 0.25 });
  applyPbr(doorMat, 'ship_trim', [1, 1]);
  const doorPanel = new THREE.Mesh(new THREE.CylinderGeometry(1.16, 1.16, 0.08, 6), doorMat);
  doorPanel.rotation.x = Math.PI / 2;
  doorPanel.position.set(0, 2.0, ROOM_D / 2 - 0.28);
  ctx.scene.add(doorPanel);

  const wheelMat = new THREE.MeshStandardMaterial({ color: 0xd9a441, emissive: 0xd9a441, emissiveIntensity: 0.3, roughness: 0.4, metalness: 0.6 });
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.05, 8, 16), wheelMat);
  wheel.position.set(0, 2.0, ROOM_D / 2 - 0.35);
  ctx.scene.add(wheel);
  for (let i = 0; i < 4; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.04, 0.04), wheelMat);
    spoke.rotation.z = (Math.PI / 4) * i;
    spoke.position.copy(wheel.position);
    ctx.scene.add(spoke);
  }

  // Warm pool of light in front of the airlock — kept well clear of the door surface
  // (~0.9 units) so it doesn't reintroduce the bloom-blowout bug.
  const doorLight = new THREE.PointLight(0xd9a441, 2.0, 6, 2);
  doorLight.position.set(0, 2.3, ROOM_D / 2 - 1.7);
  ctx.scene.add(doorLight);

  // Warning-striped frame trim bordering the airlock's wall opening — a square frame just
  // outside the hex door's 1.32-unit radius, warm orange/red to contrast the door's own amber
  // wheel/ring accent, echoing the reference's orange/red-trimmed doorways. Mounted flush
  // against the wall (just in front of its inner face) so it reads as part of the opening,
  // not a separate floating prop.
  const trimHalf = 1.6;
  const trimThick = 0.05;
  const trimZ = ROOM_D / 2 - 0.11;
  const trimMat = (repeatX: number, repeatY: number) => {
    const tex = buildWarningStripeTexture('red');
    tex.repeat.set(repeatX, repeatY);
    return new THREE.MeshStandardMaterial({
      map: tex,
      emissive: 0xd9502f,
      emissiveMap: tex,
      emissiveIntensity: 0.3,
      roughness: 0.6,
      metalness: 0.25,
    });
  };
  const doorTrimSpecs: [number, number, number, number, number, number][] = [
    // w, h, cx, cy, repeatX, repeatY
    [trimHalf * 2 + 0.14, 0.14, 0, 2.0 + trimHalf, 8, 1], // top
    [trimHalf * 2 + 0.14, 0.14, 0, 2.0 - trimHalf, 8, 1], // bottom
    [0.14, trimHalf * 2, -trimHalf, 2.0, 1, 8], // left
    [0.14, trimHalf * 2, trimHalf, 2.0, 1, 8], // right
  ];
  for (const [w, h, cx, cy, repeatX, repeatY] of doorTrimSpecs) {
    const trim = new THREE.Mesh(new THREE.BoxGeometry(w, h, trimThick), trimMat(repeatX, repeatY));
    trim.position.set(cx, cy, trimZ);
    ctx.scene.add(trim);
  }
}
