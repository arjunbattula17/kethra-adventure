import * as THREE from 'three';
import { applyPbr } from '../../core/TextureLibrary';
import { buildLargeDeckNumberTexture } from '../ShipTextures';
import type { InteriorCtx } from './ctx';
import { ROOM_W, ROOM_D, ROOM_H, WALL_SPLIT_Y, addBandedWall, addGrimeOverlay } from './ctx';

/** The four hull walls: banded shell materials, panel trim grid, grime, and deck signage. */
export function buildWalls(ctx: InteriorCtx): void {

  // ===== banded wall shell =====
  // Panel-seam/rivet density: tiled noticeably tighter than the room-shell's original pass
  // (roughly 1.6x more repeats per band) so the worn-metal PBR texture's own seam and rivet
  // detail reads as a grid of smaller panels breaking up each large flat band, instead of a
  // few huge stretched tiles — the cheap way to add panel density without extra geometry.
  const wallLowerMat = new THREE.MeshStandardMaterial({ color: 0xb0a89c, roughness: 0.85, metalness: 0.35, emissive: 0x4a3826, emissiveIntensity: 1.1 });
  applyPbr(wallLowerMat, 'ship_wall', [ROOM_W / 1.5, WALL_SPLIT_Y / 1.15]);
  const wallUpperMat = new THREE.MeshStandardMaterial({ color: 0xc4cbd6, roughness: 0.7, metalness: 0.35, emissive: 0x2a3648, emissiveIntensity: 1.1 });
  applyPbr(wallUpperMat, 'ship_trim', [ROOM_W / 1.5, (ROOM_H - WALL_SPLIT_Y) / 0.95]);
  const sideLowerMat = new THREE.MeshStandardMaterial({ color: 0xb0a89c, roughness: 0.85, metalness: 0.35, emissive: 0x4a3826, emissiveIntensity: 1.1 });
  applyPbr(sideLowerMat, 'ship_wall', [ROOM_D / 1.5, WALL_SPLIT_Y / 1.15]);
  const sideUpperMat = new THREE.MeshStandardMaterial({ color: 0xc4cbd6, roughness: 0.7, metalness: 0.35, emissive: 0x2a3648, emissiveIntensity: 1.1 });
  applyPbr(sideUpperMat, 'ship_trim', [ROOM_D / 1.5, (ROOM_H - WALL_SPLIT_Y) / 0.95]);
  const seamMat = new THREE.MeshStandardMaterial({ color: 0xd9a441, roughness: 0.5, metalness: 0.5 });

  // Airlock wall (+Z) and console wall (-Z), both banded worn-lower/clean-upper.
  addBandedWall(ctx, ROOM_W, 0.2, 0, ROOM_D / 2, wallLowerMat, wallUpperMat, seamMat);
  addBandedWall(ctx, ROOM_W, 0.2, 0, -ROOM_D / 2, wallLowerMat, wallUpperMat, seamMat);
  // Side walls — geometry axes are swapped (thin dimension along X).
  addBandedWall(ctx, 0.2, ROOM_D, -ROOM_W / 2, 0, sideLowerMat, sideUpperMat, seamMat);
  addBandedWall(ctx, 0.2, ROOM_D, ROOM_W / 2, 0, sideLowerMat, sideUpperMat, seamMat);

  // Grime passes on the two side walls and the floor break up PBR tiling repetition.
  addGrimeOverlay(ctx, 
    ROOM_D - 1,
    WALL_SPLIT_Y - 0.1,
    new THREE.Vector3(-ROOM_W / 2 + 0.15, WALL_SPLIT_Y / 2, 0),
    new THREE.Euler(0, Math.PI / 2, 0),
    0.35,
  );
  addGrimeOverlay(ctx, 
    ROOM_D - 1,
    WALL_SPLIT_Y - 0.1,
    new THREE.Vector3(ROOM_W / 2 - 0.15, WALL_SPLIT_Y / 2, 0),
    new THREE.Euler(0, -Math.PI / 2, 0),
    0.35,
  );


  // ===== panel trim grid =====
  // Raised trim-strip grid (vertical ribs + two horizontal bands per wall) breaking the two
  // side walls' large flat PBR bands into a panel grid. The tighter PBR repeat tiling used in
  // buildRoom() only re-tiles the source photo's mottled noise more finely — that photo has no
  // seam pattern to reveal, so from up close it still reads as one flat rusty plane (confirmed
  // in verification screenshots). Real raised geometry is the cheap fix: even against a dark,
  // flat-lit texture, a physical edge catches ambient/point light and reads as a seam line no
  // matter how low-contrast the underlying material is.
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x9099a6, roughness: 0.45, metalness: 0.6, emissive: 0x2a2f38, emissiveIntensity: 0.5 });
  const ribZs = [-5.4, -3.6, -1.8, 0, 1.8, 3.6, 5.4];
  for (const xSign of [-1, 1] as const) {
    const wallX = (xSign * ROOM_W) / 2 - xSign * 0.09;
    for (const z of ribZs) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.04, ROOM_H, 0.06), trimMat);
      rib.position.set(wallX, ROOM_H / 2, z);
      ctx.scene.add(rib);
    }
    for (const y of [1.15, 3.15]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, ROOM_D - 0.6), trimMat);
      band.position.set(wallX, y, 0);
      ctx.scene.add(band);
    }
  }


  // ===== deck-number signage =====
  // Large bold stencilled deck-number callsign on each side wall, straddling the lower/upper
  // band seam the way the reference's oversized "06" numeral crosses its wall panel line —
  // distinct from the small ID placards in buildDetailProps(), which stay tiny/close-read.
  // Mounted at (roughly) player eye height rather than up near the ceiling: at the close-range
  // viewing distance a player actually gets next to a side wall, the camera's vertical FOV
  // window is centered on eye height and only a couple of the room's ~4 vertical units tall, so
  // a sign mounted high up the wall falls entirely outside that window and is invisible from any
  // normal up-close vantage point — exactly the "no signage visible" gap flagged last round.
  const deckTex = buildLargeDeckNumberTexture('04', 'DECK');
  const signH = 1.3;
  const signW = signH * (400 / 560);
  const signY = 1.9;
  const signZ = 0.8;
  const signMat = new THREE.MeshStandardMaterial({ map: deckTex, transparent: true, roughness: 0.75, metalness: 0.15, depthWrite: false });

  const westSign = new THREE.Mesh(new THREE.PlaneGeometry(signW, signH), signMat);
  westSign.position.set(-ROOM_W / 2 + 0.11, signY, signZ);
  westSign.rotation.y = Math.PI / 2;
  westSign.renderOrder = 1;
  ctx.scene.add(westSign);

  const eastSign = new THREE.Mesh(new THREE.PlaneGeometry(signW, signH), signMat);
  eastSign.position.set(ROOM_W / 2 - 0.11, signY, signZ);
  eastSign.rotation.y = -Math.PI / 2;
  eastSign.renderOrder = 1;
  ctx.scene.add(eastSign);

}
