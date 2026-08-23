import * as THREE from 'three';
import type { InteriorCtx } from './ctx';
import { ROOM_H } from './ctx';

/** All non-prop scene lighting: ambient/hemisphere baseline, overhead pools, emergency light. */
export function buildLighting(ctx: InteriorCtx): void {
  
    // Soft cool-sky / warm-bounce ambient baseline. A near-black ground color (as opposed to
    // AmbientLight's old flat 1.3) meant vertical walls — most of the room's visible surface —
    // were only catching a thin sky-facing sliver; lifted the ground tone and intensity so the
    // room reads before any point-light pool reaches it, matching "warm light pooling against
    // COOL DARK shadow" rather than pooling against true black.
  const hemi = new THREE.HemisphereLight(0x8ea3c4, 0x3a2c1e, 1.05);
  ctx.scene.add(hemi);

  // Flat, orientation-independent baseline on top of the hemisphere — measured directly
  // against the running scene: hemisphere + point pools alone still left large wall/ceiling
  // regions reading as solid black (0,0,0) despite "reasonable" intensities, because ACES
  // tonemapping crushes mid-low values hard and HemisphereLight only lights vertical surfaces
  // at half its nominal intensity (their normal is orthogonal to the light's sky/ground axis).
  // Trimmed from 0.6 to 0.45: at 0.6 this flat term was strong enough to wash out the contact
  // shadows the point lights below now cast, flattening exactly the light/shadow pooling this
  // round is fixing. Every surface still keeps its own emissive floor (see buildRoom()) as the
  // no-black-void guarantee, so this pure reduction can't reintroduce that bug.
  const ambient = new THREE.AmbientLight(0x9aa4b8, 0.45);
  ctx.scene.add(ambient);

  // Faint cold starlight drifting in through the window behind the console.
  const starlight = new THREE.DirectionalLight(0x5a72a8, 0.3);
  starlight.position.set(0, 5, -20);
  ctx.scene.add(starlight);

  // Overhead fill lights spread along the room's length (airlock end, mid-room, console end)
  // with a soft decay so their pools actually overlap and cover the full 12-unit depth,
  // instead of three isolated hotspots with dark gaps between them. All three now share one
  // warm amber/white "fluorescent" family (previously overheadA/C leaned cool-white/cool-blue,
  // which diluted the room's overall warm-vs-cool split) so every overhead pool reads as the
  // same warm fixture type, leaving cool exclusively to the console/screen lights below —
  // the reference's warm-fluorescents-vs-cool-screens contrast instead of a uniform tint.
  const overheadA = new THREE.PointLight(0xfff0da, 1.1, 11, 1.5);
  overheadA.position.set(0, ROOM_H - 0.6, 4);
  ctx.scene.add(overheadA);
  // Offset from room-center on X, this is the one overhead fixture given a real shadow map:
  // its ceiling greeble castShadow additions (beams/ducts) now throw slanted shadow stripes
  // across the floor and walls instead of the previous flat, shadowless overhead wash — the
  // "single flat cone with no falloff / no contact shadow / no AO under objects" gap the last
  // round's critic called out. A single shadow-casting point light (not all three) keeps the
  // extra cubemap render pass cheap while still breaking up the room's overhead read.
  const overheadB = new THREE.PointLight(0xfff2df, 1.0, 11, 1.5);
  overheadB.position.set(1.5, ROOM_H - 0.6, -0.5);
  overheadB.castShadow = true;
  overheadB.shadow.mapSize.set(512, 512);
  overheadB.shadow.camera.near = 0.2;
  overheadB.shadow.camera.far = 12;
  overheadB.shadow.bias = -0.003;
  ctx.scene.add(overheadB);
  const overheadC = new THREE.PointLight(0xffe6c2, 1.0, 11, 1.5);
  overheadC.position.set(-1.5, ROOM_H - 0.6, -3);
  ctx.scene.add(overheadC);

  const emergencyLight = new THREE.PointLight(0xff5533, 1.3, 7, 2);
  emergencyLight.position.set(-3, 3.3, -1);
  ctx.scene.add(emergencyLight);
  ctx.setEmergencyLight(emergencyLight);
}
