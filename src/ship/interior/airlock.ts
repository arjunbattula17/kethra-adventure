import * as THREE from 'three';
import type { InteriorCtx } from './ctx';
import { ROOM_D } from './ctx';
import { placeKitPiece, preloadKit } from './kit';
import {
  buildAirlockSteelTexture,
  buildSteelRoughnessTexture,
  buildAirlockSteelNormalTexture,
  buildPaintedTrimTexture,
  buildPaintRoughnessTexture,
  buildLouvreVentTexture,
  buildSillTreadTexture,
  buildAirlockPlacardTexture,
  buildEdgeShadowTexture,
  buildHandWearTexture,
  buildDeckStencilTexture,
} from './airlockTextures';

const HALF_D = ROOM_D / 2;
const DOOR_Z = HALF_D;
const DOOR_YAW = Math.PI; // faces -Z, into the room

/**
 * The aft airlock: a real Quaternius door frame + leaf filling the one straight bay walls.ts
 * deliberately left open on the airlock (+Z) wall, dressed with the hand-built material variation
 * and wear the kit itself doesn't provide — alarm-orange trim jambs, a stencilled header placard,
 * a keypad panel with real map/roughness/normal response, and a hazard-striped threshold.
 */
export async function buildAirlock(ctx: InteriorCtx): Promise<void> {
  await preloadKit(['Door_Frame_Square', 'Door_DarkMetal']);

  await Promise.all([
    placeKitPiece(ctx.scene, 'Door_Frame_Square', [0, 0, DOOR_Z], DOOR_YAW),
    placeKitPiece(ctx.scene, 'Door_DarkMetal', [0, 0, DOOR_Z], DOOR_YAW),
  ]);

  // Warm practical over the doorway — the same fixture type as every other door pool in the room.
  // Toned down from the round-2 value (1.1 / 4.2) which the measured value structure flagged as
  // the single largest highlight-ceiling miss in this crop (p95 0.894 vs reference 0.471): at
  // this close a range the old settings blew the bone-white deck out under the fixture well past
  // the reference's ceiling. Kept warm and close, just dimmer and shorter-reaching.
  const doorLight = new THREE.PointLight(0xffd9a0, 0.55, 3.6, 2);
  doorLight.position.set(0, 3.1, HALF_D - 0.4);
  ctx.scene.add(doorLight);

  // ===== shared material variation =====
  // The recurring critique across every piece: one uniform roughness reading as tinted plastic.
  // These give the airlock's own hand-built dressing real map/roughness/normal response instead
  // of flat MeshStandardMaterial colours.
  const steelMap = buildAirlockSteelTexture();
  const steelRough = buildSteelRoughnessTexture();
  const steelNormal = buildAirlockSteelNormalTexture();
  const trimMap = buildPaintedTrimTexture('#e0552f');
  trimMap.repeat.set(1, 3.5);
  const trimRough = buildPaintRoughnessTexture();
  trimRough.repeat.set(1, 3.5);

  // ===== alarm-orange trim jambs =====
  // The palette table calls out alarm red-orange specifically for "door trim" — the reference
  // crop's most visible saturated accent. Also gives the frame opening a lit edge so it doesn't
  // crush to the same near-black as the unlit kit steel behind it.
  const trimGeo = new THREE.BoxGeometry(0.1, 4.3, 0.05);
  const trimMat = new THREE.MeshStandardMaterial({
    map: trimMap,
    roughnessMap: trimRough,
    roughness: 1,
    metalness: 0.15,
    emissive: 0x5a1c0c,
    emissiveIntensity: 0.35,
  });
  for (const side of [-1, 1] as const) {
    const jamb = new THREE.Mesh(trimGeo, trimMat);
    jamb.position.set(side * 1.85, 2.35, HALF_D - 0.45);
    jamb.castShadow = true;
    jamb.receiveShadow = true;
    ctx.scene.add(jamb);
  }

  // ===== header placard =====
  const placardMat = new THREE.MeshStandardMaterial({
    map: buildAirlockPlacardTexture('AIRLOCK 04', 'MAIN HATCH — CYCLE BEFORE OPENING'),
    roughness: 0.55,
    metalness: 0.2,
  });
  const placard = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.34, 0.05), placardMat);
  placard.position.set(0, 4.35, HALF_D - 0.5);
  placard.castShadow = true;
  placard.receiveShadow = true;
  ctx.scene.add(placard);

  // ===== keypad panel — the one piece of the old hand-built airlock with an actual gameplay
  // tie-in (its three lamps run on the shared status-blink loop), rebuilt with real material
  // response instead of a flat colour. =====
  const panelMat = new THREE.MeshStandardMaterial({
    map: steelMap,
    roughnessMap: steelRough,
    normalMap: steelNormal,
    roughness: 0.85,
    metalness: 0.35,
  });
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.08), panelMat);
  panel.position.set(-1.5, 1.5, HALF_D - 0.35);
  panel.castShadow = true;
  panel.receiveShadow = true;
  ctx.scene.add(panel);

  // Small louvred vent below the keypad — the brief's "secondary element on every surface bigger
  // than about a metre" rule, applied at prop scale.
  const ventMat = new THREE.MeshStandardMaterial({ map: buildLouvreVentTexture(), roughness: 0.7, metalness: 0.4 });
  const vent = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.17, 0.04), ventMat);
  vent.position.set(-1.5, 0.95, HALF_D - 0.34);
  vent.castShadow = true;
  vent.receiveShadow = true;
  ctx.scene.add(vent);

  // Edge-occlusion decal under the wall-mounted panel: the room's only shadow caster can't resolve
  // the panel-to-wall contact, so this fakes the ambient occlusion that would otherwise be missing
  // and the panel would read as pasted on.
  const edgeShadowTex = buildEdgeShadowTexture();
  edgeShadowTex.center.set(0.5, 0.5);
  edgeShadowTex.rotation = Math.PI; // opaque edge to v=1 — the panel's bottom sits at this decal's top
  const edgeShadowMat = new THREE.MeshBasicMaterial({ map: edgeShadowTex, transparent: true, depthWrite: false });
  const panelShadow = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.22), edgeShadowMat);
  panelShadow.position.set(-1.5, 1.14, HALF_D - 0.348);
  panelShadow.renderOrder = 1;
  ctx.scene.add(panelShadow);

  // Burnished hand-wear halo where a glove hits the lamp cluster thousands of times — localised
  // wear, not a uniform tint, per the brief.
  const handWearMat = new THREE.MeshBasicMaterial({
    map: buildHandWearTexture(),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const handWear = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.42), handWearMat);
  handWear.position.set(-1.5, 1.52, HALF_D - 0.345);
  handWear.renderOrder = 1;
  ctx.scene.add(handWear);

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

  // ===== threshold =====
  // Non-slip hazard-edged tread plate right under the hatch, and the worn deck stencilling the
  // reference's own foreground floor is built for. Both are real texture builders this module
  // already shipped but never wired into a scene until now.
  const sillMat = new THREE.MeshStandardMaterial({ map: buildSillTreadTexture(), roughness: 0.75, metalness: 0.25 });
  const sill = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.03, 0.45), sillMat);
  sill.position.set(0, 0.015, HALF_D - 0.28);
  sill.castShadow = true;
  sill.receiveShadow = true;
  ctx.scene.add(sill);

  const deckStencilMat = new THREE.MeshBasicMaterial({
    map: buildDeckStencilTexture(),
    transparent: true,
    depthWrite: false,
  });
  const deckStencil = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.7), deckStencilMat);
  deckStencil.rotation.x = -Math.PI / 2;
  deckStencil.position.set(0, 0.022, HALF_D - 1.85);
  deckStencil.renderOrder = 1;
  ctx.scene.add(deckStencil);
}
