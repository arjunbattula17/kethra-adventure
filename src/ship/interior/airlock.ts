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
  buildContactShadowTexture,
  buildAirlockHazardTexture,
  buildCorrosionDecalTexture,
  buildDoorGlowTexture,
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
  // Round-5 brief measured this crop's p95 at 0.733 against a reference ceiling of 0.471 (delta
  // +0.263) and named it directly: "the blown-out, overexposed key light at the airlock washes
  // out surface detail right at the focal point". Round 4's fix only pulled the light 0.7m off the
  // door leaf and trimmed intensity — not enough, because a point light at close range still hits
  // the kit's shiny metal leaf hard enough to spike a specular hotspot into the bloom pass
  // regardless of how gently the intensity is tuned. This round cuts the dynamic light itself
  // decisively (half the intensity, tighter falloff, another 0.4m off the leaf, aimed down from
  // near the ceiling instead of level with the metal) and moves the *visible* brightness onto two
  // controlled emissive elements below — a lit header lens and a floor pool decal — whose values
  // we set directly instead of leaving them exposed to inverse-square blowup next to reflective
  // geometry we don't own.
  const doorLight = new THREE.PointLight(0xffd9a0, 0.15, 2.2, 2);
  doorLight.position.set(0, 3.3, HALF_D - 1.5);
  ctx.scene.add(doorLight);

  // Header lens: the actual "thing making the light" the brief calls for — an emissive strip under
  // the placard whose brightness is a fixed material value, not a dynamic light next to metal.
  const headerLensMat = new THREE.MeshStandardMaterial({
    color: 0x1a1c20,
    roughness: 0.32,
    metalness: 0,
    emissive: 0xffd9a0,
    emissiveIntensity: 1.05,
  });
  const headerLens = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.05, 0.06), headerLensMat);
  headerLens.position.set(0, 4.02, HALF_D - 0.5);
  ctx.scene.add(headerLens);

  // Floor pool the header lens throws onto the sill — an additive decal with an opacity we choose
  // directly, so the "warm pool spilling onto the sill" reads without depending on a point light's
  // falloff math next to the door leaf's metal.
  const doorGlowMat = new THREE.MeshBasicMaterial({
    map: buildDoorGlowTexture(),
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const doorFloorPool = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.9), doorGlowMat);
  doorFloorPool.rotation.x = -Math.PI / 2;
  doorFloorPool.position.set(0, 0.024, HALF_D - 0.9);
  doorFloorPool.renderOrder = 2;
  ctx.scene.add(doorFloorPool);

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
    emissiveIntensity: 0.26,
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

  // ===== breaking the mirror =====
  // Round-4's critic named the door bay's near-mirror left/right massing (matched decal, matched
  // locker/panel weight) as the single biggest gap. The keypad cluster above already lives only on
  // the left; everything below is deliberately lopsided in kind, not just position — a wall-mounted
  // hose reel on the right at a different height than the keypad, and a floor crate in the midground
  // on the left at a different depth than either — so the bay reads as something crews actually use
  // unevenly rather than a symmetric kit placement. They also give the midground floor between spawn
  // and the door real geometry to catch light, instead of the flat run the blown-out door pool used
  // to wash out.

  const contactShadowMat = new THREE.MeshBasicMaterial({
    map: buildContactShadowTexture(),
    transparent: true,
    depthWrite: false,
  });

  // Hose reel, right jamb — deliberately not a mirror of the left keypad: lower, rounder, and
  // rubber rather than painted steel.
  const hoseBracketMat = new THREE.MeshStandardMaterial({
    map: steelMap,
    roughnessMap: steelRough,
    normalMap: steelNormal,
    roughness: 0.8,
    metalness: 0.4,
  });
  const hoseBracket = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.32, 0.1), hoseBracketMat);
  hoseBracket.position.set(1.65, 0.98, HALF_D - 0.36);
  hoseBracket.castShadow = true;
  hoseBracket.receiveShadow = true;
  ctx.scene.add(hoseBracket);

  const hoseBracketShadow = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.18), edgeShadowMat);
  hoseBracketShadow.position.set(1.65, 0.83, HALF_D - 0.358);
  hoseBracketShadow.renderOrder = 1;
  ctx.scene.add(hoseBracketShadow);

  const rubberMat = new THREE.MeshStandardMaterial({ color: 0x232326, roughness: 0.95, metalness: 0.02 });
  const hoseReel = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.045, 10, 24), rubberMat);
  hoseReel.rotation.y = Math.PI / 2;
  hoseReel.position.set(1.65, 0.86, HALF_D - 0.28);
  hoseReel.castShadow = true;
  hoseReel.receiveShadow = true;
  ctx.scene.add(hoseReel);

  // Corrosion bleeding from the bracket's top bolts — localised wear at the joint, per the brief.
  const corrosionMat = new THREE.MeshBasicMaterial({
    map: buildCorrosionDecalTexture(),
    transparent: true,
    depthWrite: false,
  });
  const hoseCorrosion = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), corrosionMat);
  hoseCorrosion.position.set(1.65, 1.16, HALF_D - 0.355);
  hoseCorrosion.renderOrder = 1;
  ctx.scene.add(hoseCorrosion);

  // Floor crate, left midground — off the walking lane, ahead of the keypad rather than level
  // with it, giving the approach floor real height and a shadow-catching edge instead of the flat
  // run the old door light used to blow to a shapeless bloom.
  const crateMat = new THREE.MeshStandardMaterial({
    map: steelMap,
    roughnessMap: steelRough,
    normalMap: steelNormal,
    roughness: 0.7,
    metalness: 0.3,
  });
  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.46, 0.44), crateMat);
  crate.position.set(-1.35, 0.23, HALF_D - 1.95);
  crate.rotation.y = 0.4;
  crate.castShadow = true;
  crate.receiveShadow = true;
  ctx.scene.add(crate);

  // Hazard-striped tie-down strap across the crate lid — the palette's yellow accent, and a chamfer
  // break on the box's top edge rather than a bare sharp-cornered cube.
  const hazardMat = new THREE.MeshStandardMaterial({
    map: buildAirlockHazardTexture(),
    roughness: 0.8,
    metalness: 0.1,
  });
  const crateStrap = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.06, 0.48), hazardMat);
  crateStrap.position.set(-1.35, 0.47, HALF_D - 1.95);
  crateStrap.rotation.y = 0.4;
  crateStrap.castShadow = true;
  crateStrap.receiveShadow = true;
  ctx.scene.add(crateStrap);

  const crateShadow = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), contactShadowMat);
  crateShadow.rotation.x = -Math.PI / 2;
  crateShadow.position.set(-1.35, 0.012, HALF_D - 1.95);
  crateShadow.renderOrder = 1;
  ctx.scene.add(crateShadow);
}
