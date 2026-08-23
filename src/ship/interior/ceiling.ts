import * as THREE from 'three';
import { applyPbr } from '../../core/TextureLibrary';
import type { InteriorCtx } from './ctx';
import { ROOM_W, ROOM_D, ROOM_H } from './ctx';

/** Ceiling slab plus its mechanical greeble: beams, ducts, pipe coils, LED banks, strip lights. */
export function buildCeiling(ctx: InteriorCtx): void {

  // ===== ceiling slab =====
  const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x585f6c, roughness: 0.75, metalness: 0.35, emissive: 0x4a3f30, emissiveIntensity: 1.2 });
  applyPbr(ceilingMat, 'ship_console', [ROOM_W / 1.5, ROOM_D / 1.5]);

  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(ROOM_W, 0.15, ROOM_D), ceilingMat);
  ceiling.position.y = ROOM_H;
  ctx.scene.add(ceiling);


  // ===== mechanical greeble =====
  // Dense mechanical ceiling greeble: perpendicular structural cross-beams, boxy HVAC duct
  // trunks, coiled copper pipe runs, blinking red LED cluster banks, and overhead fluorescent
  // strip fixtures. Kept within roughly y=3.0-3.95 (ROOM_H is 4, player eye height 1.7) so it
  // reads as mounted to the ceiling rather than floating in the room's open volume.
    // Cross-beams run along X (perpendicular to the room's Z-length), spaced down the depth.
    // Center y sits just under the ceiling slab's underside (3.925) with a slight embed so the
    // seam reads as flush-mounted rather than leaving a visible gap. Thickened and re-spaced
    // (was 5 beams at 0.16 deep / 2.4 apart) after a straight-up-from-room-center raycast check
    // showed the old thin beams landed entirely inside the gaps between them from that exact
    // vantage point — tighter spacing plus double the Z-depth means the ~2.8-unit-tall vertical
    // slice of ceiling visible in frame from any floor position now always crosses at least one.
  const beamMat = new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 0.55, metalness: 0.6, emissive: 0x2a3648, emissiveIntensity: 1.1 });
  for (const z of [-5.25, -3.75, -2.25, -0.75, 0.75, 2.25, 3.75, 5.25]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(ROOM_W - 0.5, 0.3, 0.34), beamMat);
    beam.position.set(0, 3.78, z);
    // Casts a real shadow stripe from overheadB (the one overhead light configured to cast
    // shadows below) down onto the floor/walls — the ceiling greeble was previously lit but
    // threw no shadow at all, so the room read as uniformly lit under it instead of having the
    // banded light/shadow pooling a dense structural ceiling like this should produce.
    beam.castShadow = true;
    ctx.scene.add(beam);
  }

  // Three boxy HVAC duct trunks — a central spine running the full room length dead-center
  // on X (so it sits directly under any straight-up look regardless of where in the room the
  // player is standing — the single most reliable fix for the "nothing visible from center"
  // gap), plus the original two side/cross trunks for width. Each gets flange bands for a
  // bolted-joint read.
  const ductMat = new THREE.MeshStandardMaterial({ color: 0x565c68, roughness: 0.6, metalness: 0.4, emissive: 0x2a3648, emissiveIntensity: 1.1 });
  const flangeMat = new THREE.MeshStandardMaterial({ color: 0x30333c, roughness: 0.5, metalness: 0.55, emissive: 0x2a3648, emissiveIntensity: 1.0 });

  const ductSpine = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, ROOM_D - 1.6), ductMat);
  ductSpine.position.set(0, 3.58, 0);
  ductSpine.castShadow = true;
  ctx.scene.add(ductSpine);
  for (const oz of [-4.7, -2.35, 0, 2.35, 4.7]) {
    const flange = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.44, 0.07), flangeMat);
    flange.position.set(0, 3.58, oz);
    ctx.scene.add(flange);
  }

  const ductA = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 4.6), ductMat);
  ductA.position.set(-2.9, 3.55, -2.6);
  ductA.castShadow = true;
  ctx.scene.add(ductA);
  for (const oz of [-2.2, 2.2]) {
    const flange = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.54, 0.06), flangeMat);
    flange.position.set(-2.9, 3.55, -2.6 + oz);
    ctx.scene.add(flange);
  }

  const ductB = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.42, 0.5), ductMat);
  ductB.position.set(2.0, 3.5, 2.6);
  ductB.castShadow = true;
  ctx.scene.add(ductB);
  for (const ox of [-1.2, 1.2]) {
    const flange = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.46, 0.56), flangeMat);
    flange.position.set(2.0 + ox, 3.5, 2.6);
    ctx.scene.add(flange);
  }

  // Coiled copper pipe runs — a spiral CatmullRomCurve3 through TubeGeometry gives a cheap
  // coil silhouette without hand-authored geometry.
  const coilMat = new THREE.MeshStandardMaterial({ color: 0xb5651d, roughness: 0.4, metalness: 0.75, emissive: 0x4a3826, emissiveIntensity: 1.1 });
  const buildCoil = (center: THREE.Vector3, radius: number, turns: number, height: number, tubeRadius: number) => {
    const steps = turns * 12;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const angle = t * turns * Math.PI * 2;
      pts.push(new THREE.Vector3(center.x + Math.cos(angle) * radius, center.y - t * height, center.z + Math.sin(angle) * radius));
    }
    return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), steps, tubeRadius, 6, false), coilMat);
  };
  ctx.scene.add(buildCoil(new THREE.Vector3(3.6, 3.9, -4.5), 0.22, 4, 0.55, 0.035));
  ctx.scene.add(buildCoil(new THREE.Vector3(-3.6, 3.9, 4.6), 0.18, 3, 0.4, 0.03));
  ctx.scene.add(buildCoil(new THREE.Vector3(-1.6, 3.92, -0.9), 0.17, 3, 0.35, 0.03));

  // Blinking red LED cluster banks — the same wall-mounted dot-cluster pattern used in
  // buildDetailProps(), relocated to the ceiling with a red-only palette. Pushed into
  // ctx.statusLights so the existing update() blink loop animates them for free.
  const ledHousingMat = new THREE.MeshStandardMaterial({ color: 0x24272e, roughness: 0.5, metalness: 0.55, emissive: 0x2a3648, emissiveIntensity: 1.0 });
  const ledClusterPositions: [number, number][] = [
    [-3.2, 1.4],
    [3.0, -2.0],
    [0.3, 4.9],
    [1.6, -0.6],
  ];
  for (const [x, z] of ledClusterPositions) {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.14), ledHousingMat);
    housing.position.set(x, 3.86, z);
    ctx.scene.add(housing);
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff2a2a, emissiveIntensity: 0.2, roughness: 0.4 });
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), mat);
      dot.position.set(x - 0.18 + i * 0.12, 3.82, z);
      ctx.scene.add(dot);
      ctx.statusLights.push({ mesh: dot, material: mat, phase: Math.random() * Math.PI * 2, onIntensity: 1.5 });
    }
  }

  // Overhead fluorescent strip fixtures — a bright emissive box plus its own soft point
  // light. The room is only 4 units tall, so a player can get within ~1.5 units of these
  // looking straight up; decay/intensity are matched to buildLighting()'s overheadA-C
  // pool lights (the pattern already proven not to blow out at that range) rather than the
  // steeper decay=2 falloff used for wall-mounted accent lights, which spikes hard at
  // close range under inverse-square falloff.
  // Base diffuse color is kept dark (near-black) rather than near-white: this box sits
  // directly inside the pooled overlap of buildLighting()'s overheadA-C fill lights, and a
  // bright diffuse albedo there picks up their light on top of its own emissive term, easily
  // clearing the bloom threshold and washing into a full-screen blob when viewed close-up
  // from underneath. Routing all of the "lit tube" brightness through the emissive channel
  // instead keeps the glow readable without stacking on top of ambient/point light.
  const tubeMat = new THREE.MeshStandardMaterial({ color: 0x24262b, roughness: 0.5, metalness: 0, emissive: 0xeef3ff, emissiveIntensity: 0.85 });
  for (const z of [-3.6, 1.2, 4.2]) {
    const tube = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.05, 0.12), tubeMat);
    tube.position.set(0, 3.85, z);
    ctx.scene.add(tube);
    const fixtureLight = new THREE.PointLight(0xfff0d8, 0.45, 6, 1.5);
    fixtureLight.position.set(0, 3.3, z);
    ctx.scene.add(fixtureLight);
  }

}
