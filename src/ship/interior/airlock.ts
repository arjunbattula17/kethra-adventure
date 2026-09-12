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

// Measured, not assumed. Door_Frame_Square's own bounds are x [-2.427, 2.427], y [0, 5],
// z [-0.253, 0.253] (tools/kit-bounds.mjs), so at DOOR_Z its room-facing face is 7.747. The clear
// opening and header height come from raycasting the placed frame with tools/probe-pixel.mjs: the
// frame's front face answers continuously at |x| = 1.744 from y = 0.519 up to y = 3.869, and rays
// through |x| < 1.72 below y ~ 3.45 hit nothing at all.
//
// This is what every piece of dressing below used to be placed against wrongly. `HALF_D - k` treats
// z = 8 as the wall line, but the wall beside the frame is the corner bay, whose room-facing surface
// is 7.565 (docs/interior-room-contract.md) — and more importantly, everything mounted at |x| < 1.72
// was not on a wall at all. The keypad cluster (x = -1.5) and the hose reel (x = 1.65) were hanging
// in the open doorway, and the trim jambs (x = +-1.85, y 0.2..4.5) were two free-floating bars 0.2 m
// clear of the deck, 0.45 m in front of the door leaf and 0.45 m above the header.
const FRAME_FACE_Z = 7.747;
const OPENING_H = 3.45;
const WALL_FACE_Z = 7.565;
// Dressing sits on the wall either side of the frame, clear of its 2.427 outer edge.
const KEYPAD_X = -2.95;
const HOSE_X = 2.95;

/**
 * The aft airlock: a real Quaternius door frame + leaf filling the one straight bay walls.ts
 * deliberately left open on the airlock (+Z) wall, dressed with the hand-built material variation
 * and wear the kit itself doesn't provide — alarm-orange trim jambs, a stencilled header placard,
 * a keypad panel with real map/roughness/normal response, and a hazard-striped threshold.
 */
export async function buildAirlock(ctx: InteriorCtx): Promise<void> {
  await preloadKit(['Door_Frame_Square', 'Door_DarkMetal']);

  // Door_DarkMetal is one leaf of a pair: its geometry spans local x [-2.106, 0], so a single
  // placement fills exactly half the opening. At DOOR_YAW that half is x [0, 2.106] and the other
  // half was left as a hole straight out of the room — a raycast through x = -0.9 at eye height hit
  // nothing at all, which is the black void behind the door in-game. The second leaf is the same
  // piece at yaw 0, which lands its local span on world x [-2.106, 0]; the two meet at x = 0 with
  // no overlap to z-fight.
  await Promise.all([
    placeKitPiece(ctx.scene, 'Door_Frame_Square', [0, 0, DOOR_Z], DOOR_YAW),
    placeKitPiece(ctx.scene, 'Door_DarkMetal', [0, 0, DOOR_Z], DOOR_YAW),
    placeKitPiece(ctx.scene, 'Door_DarkMetal', [0, 0, DOOR_Z], 0),
  ]);

  // Warm practical over the doorway — the same fixture type as every other door pool in the room.
  // Round-6 brief measured this crop's p95 at 0.706 against a reference ceiling of 0.471 (delta
  // +0.235) and named the cause directly: "the central floor light source is blown out to pure
  // white, wiping out texture and value structure across the entire midground and doorway". Round
  // 5 already cut the dynamic point light's intensity and moved it near the ceiling, but a point
  // light next to the kit's shiny metal leaf still spiked a specular hotspot into the bloom pass no
  // matter how gently it was tuned — so this round removes the dynamic light entirely. The visible
  // "light source" is now only the two elements below, whose brightness is a fixed material value
  // we set directly: a lit header lens, and a floor pool decal cut down hard enough to actually
  // pool and fall off instead of flooding the whole midground.
  const headerLensMat = new THREE.MeshStandardMaterial({
    color: 0x1a1c20,
    roughness: 0.32,
    metalness: 0,
    emissive: 0xffd9a0,
    emissiveIntensity: 0.85,
  });
  const headerLens = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.05, 0.06), headerLensMat);
  headerLens.position.set(0, 4.02, FRAME_FACE_Z - 0.03);
  headerLens.castShadow = true;
  headerLens.receiveShadow = true;
  ctx.scene.add(headerLens);

  // Floor pool the header lens throws onto the sill. Cut to roughly a third the footprint and
  // under half the peak opacity of round 5's version, so it reads as a soft puddle hugging the
  // threshold rather than a flood covering the approach floor.
  const doorGlowMat = new THREE.MeshBasicMaterial({
    map: buildDoorGlowTexture(),
    transparent: true,
    opacity: 0.09,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const doorFloorPool = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.0), doorGlowMat);
  doorFloorPool.rotation.x = -Math.PI / 2;
  doorFloorPool.position.set(0, 0.024, HALF_D - 0.6);
  doorFloorPool.renderOrder = 2;
  ctx.scene.add(doorFloorPool);

  // shared material variation
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

  // alarm-orange trim jambs
  // The palette table calls out alarm red-orange specifically for "door trim" — the reference
  // crop's most visible saturated accent. Also gives the frame opening a lit edge so it doesn't
  // crush to the same near-black as the unlit kit steel behind it.
  // Spans the opening rather than overrunning it: deck (0.03) to the header underside (3.45).
  const trimGeo = new THREE.BoxGeometry(0.1, OPENING_H - 0.03, 0.05);
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
    // 1.79 laps the 1.72 reveal edge by 0.02 and keeps the rest of the 0.1-wide bar on the
    // frame's front face, which raycasting confirms is solid out to at least |x| = 1.744.
    jamb.position.set(side * 1.79, (OPENING_H + 0.03) / 2, FRAME_FACE_Z - 0.025);
    jamb.castShadow = true;
    jamb.receiveShadow = true;
    ctx.scene.add(jamb);
  }

  // header placard
  const placardMat = new THREE.MeshStandardMaterial({
    map: buildAirlockPlacardTexture('AIRLOCK 04', 'MAIN HATCH — CYCLE BEFORE OPENING'),
    roughness: 0.55,
    metalness: 0.2,
  });
  const placard = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.34, 0.05), placardMat);
  placard.position.set(0, 4.35, FRAME_FACE_Z - 0.025);
  placard.castShadow = true;
  placard.receiveShadow = true;
  ctx.scene.add(placard);

  // keypad panel — the one piece of the old hand-built airlock with an actual gameplay
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
  panel.position.set(KEYPAD_X, 1.5, WALL_FACE_Z - 0.04);
  panel.castShadow = true;
  panel.receiveShadow = true;
  ctx.scene.add(panel);

  // Small louvred vent below the keypad — the brief's "secondary element on every surface bigger
  // than about a metre" rule, applied at prop scale.
  const ventMat = new THREE.MeshStandardMaterial({ map: buildLouvreVentTexture(), roughness: 0.7, metalness: 0.4 });
  const vent = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.17, 0.04), ventMat);
  vent.position.set(KEYPAD_X, 0.95, WALL_FACE_Z - 0.02);
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
  panelShadow.position.set(KEYPAD_X, 1.14, WALL_FACE_Z - 0.004);
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
  handWear.position.set(KEYPAD_X, 1.52, WALL_FACE_Z - 0.089);
  handWear.renderOrder = 1;
  ctx.scene.add(handWear);

  const lampGeo = new THREE.CylinderGeometry(0.026, 0.026, 0.025, 10);
  const lampColors = [0x4fd8f0, 0x8ef0b0, 0xe0552f];
  lampColors.forEach((color, i) => {
    const mat = new THREE.MeshStandardMaterial({ color: 0x14181d, emissive: color, emissiveIntensity: 1.4, roughness: 0.35 });
    const lamp = new THREE.Mesh(lampGeo, mat);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(KEYPAD_X, 1.66 - i * 0.14, WALL_FACE_Z - 0.093);
    ctx.scene.add(lamp);
    ctx.statusLights.push({ mesh: lamp, material: mat, phase: i * 1.7, onIntensity: 1.9 });
  });

  // threshold
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

  // breaking the mirror
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
  hoseBracket.position.set(HOSE_X, 0.98, WALL_FACE_Z - 0.05);
  hoseBracket.castShadow = true;
  hoseBracket.receiveShadow = true;
  ctx.scene.add(hoseBracket);

  const hoseBracketShadow = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.18), edgeShadowMat);
  hoseBracketShadow.position.set(HOSE_X, 0.83, WALL_FACE_Z - 0.004);
  hoseBracketShadow.renderOrder = 1;
  ctx.scene.add(hoseBracketShadow);

  const rubberMat = new THREE.MeshStandardMaterial({ color: 0x232326, roughness: 0.95, metalness: 0.02 });
  const hoseReel = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.045, 10, 24), rubberMat);
  hoseReel.rotation.y = Math.PI / 2;
  hoseReel.position.set(HOSE_X, 0.86, WALL_FACE_Z - 0.3);
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
  hoseCorrosion.position.set(HOSE_X, 1.16, WALL_FACE_Z - 0.004);
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
