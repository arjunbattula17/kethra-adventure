import * as THREE from 'three';
import { buildRadarPanelTexture } from '../ShipTextures';
import type { InteriorCtx } from './ctx';

/** The ceiling-hung radar display over the console -- the room's focal point. */
export function buildSuspendedDisplay(ctx: InteriorCtx): void {
  // Large suspended dual-panel radar display hanging from the ceiling on a thin support pillar —
  // the room's clear focal point, echoing the reference's overhead circular readout on a support
  // column. Centered above/behind the console (z=-3.15, versus the console housing's own -3.6)
  // rather than out over the walkway: an earlier pass at z=-2.7 put the housing's shadowed
  // underside close enough to the required verification vantage (0, 1.7, -1.5) that it filled
  // most of the frame as an unreadable dark slab — nearly the same "blank placeholder" failure
  // the brief was fixing, just moved from a flat gradient to a flat underside. Pulling it back
  // over the console roughly doubles that distance and lets the tilted panel faces (rotation.x
  // bumped to 0.3) actually come into view from below instead of presenting their edge. Bottom
  // edge stays well above head height (~2.05, player eye height 1.7) so it never blocks the
  // walk-up to the console, and sits clear of the ceiling's central duct spine (buildCeilingGreeble's
  // duct top is at y=3.78; the pillar starts above that at y=3.85).
  const anchorZ = -3.15;
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.5, metalness: 0.6, emissive: 0x2a3648, emissiveIntensity: 1.0 });
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.95, 10), pillarMat);
  pillar.position.set(0, 3.375, anchorZ);
  ctx.scene.add(pillar);

  const housing = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.9, 0.1), pillarMat);
  housing.position.set(0, 2.5, anchorZ - 0.08);
  ctx.scene.add(housing);

  // Bright bezel trim tracing the housing's outline — gives the assembly a lit "framed
  // hardware" edge to read by even where the panel faces themselves are angled away from the
  // camera, instead of leaving the housing's flat sides as unbroken dark boxes.
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x123038, roughness: 0.4, metalness: 0.5, emissive: 0x4fd8e0, emissiveIntensity: 1.0 });
  const trimZ = anchorZ - 0.02;
  const trimTop = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.05, 0.05), trimMat);
  trimTop.position.set(0, 2.5 + 0.46, trimZ);
  ctx.scene.add(trimTop);
  const trimBottom = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.05, 0.05), trimMat);
  trimBottom.position.set(0, 2.5 - 0.46, trimZ);
  ctx.scene.add(trimBottom);
  for (const xSign of [-1, 1] as const) {
    const trimSide = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.98, 0.05), trimMat);
    trimSide.position.set(xSign * 0.98, 2.5, trimZ);
    ctx.scene.add(trimSide);
  }

  // Small vent grille slats along the housing's underside — the underside is the part most
  // visible to a player standing at the console looking up, so it gets its own bit of
  // greeble (warm-lit slats) rather than staying a bare flat face.
  const ventMat = new THREE.MeshStandardMaterial({ color: 0x1c1f26, roughness: 0.5, metalness: 0.5, emissive: 0xd9a441, emissiveIntensity: 0.55 });
  for (let i = 0; i < 5; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.03, 0.13), ventMat);
    slat.position.set(-0.72 + i * 0.36, 2.5 - 0.48, anchorZ - 0.06);
    ctx.scene.add(slat);
  }

  const divider = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.86, 0.05), pillarMat);
  divider.position.set(0, 2.5, anchorZ);
  divider.rotation.x = 0.3;
  ctx.scene.add(divider);

  const radarTex = buildRadarPanelTexture();
  const panelMat = new THREE.MeshStandardMaterial({
    color: 0x0a1620,
    emissive: 0xffffff,
    emissiveMap: radarTex,
    emissiveIntensity: 0.6,
    map: radarTex,
    roughness: 0.85,
    metalness: 0,
  });
  for (const x of [-0.48, 0.48]) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.84), panelMat);
    panel.position.set(x, 2.5, anchorZ + 0.07);
    panel.rotation.x = 0.3;
    ctx.scene.add(panel);
  }

  // A couple of service cables sagging from the housing's underside down toward the console —
  // the small bit of "hardware wiring" texture the reference's overhead fixtures carry, using
  // the same dark tube-cable language as buildDetailProps()'s wall cable bundles.
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.6, metalness: 0.4 });
  for (const x of [-0.35, 0.35]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, 2.5 - 0.47, anchorZ - 0.05),
      new THREE.Vector3(x * 1.3, 2.15, anchorZ - 0.25),
      new THREE.Vector3(x * 1.1, 1.75, anchorZ - 0.45),
    ]);
    const cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.018, 6, false), cableMat);
    ctx.scene.add(cable);
  }

  // Cool cyan glow marking the display as the room's focal point — kept a full unit clear of
  // the panel faces/divider/housing (closer placements measurably bloomed out into a washed-
  // white flare against the divider's metal trim once the display moved farther from camera)
  // and off the x=0 centerline so it doesn't stare straight down the divider, within the safe
  // intensity band, pulsing with the rest of the console glow. Pushed toward a more saturated
  // blue (was a fairly desaturated teal) to match the console key light's new cool cast so the
  // whole console/screen cluster reads as one consistent cool-lit zone against the warm
  // overhead fixtures.
  const radarLight = new THREE.PointLight(0x35c8f5, 1.1, 6, 2);
  radarLight.position.set(0.5, 2.25, anchorZ + 1.0);
  ctx.scene.add(radarLight);
  ctx.consoleGlow.push(radarLight);
}
