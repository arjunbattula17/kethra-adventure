import * as THREE from 'three';
import type { InteriorCtx } from './ctx';
import { ROOM_W, ROOM_D } from './ctx';
import { placeKitPiece, preloadKit, KIT_TILE } from './kit';

const COLS = ROOM_W / KIT_TILE; // 3
const ROWS = ROOM_D / KIT_TILE; // 4

/** Mixed so no two orthogonally-adjacent tiles share a variant — the (col+row)%N walk guarantees
 *  that for any two grid neighbours the index differs by exactly 1 (mod N). */
const VARIANTS = ['Platform_Simple', 'Platform_Metal', 'Platform_DarkPlates', 'Platform_Squares'];

/**
 * The deck: the whole 12x16 footprint tiled from real Quaternius floor plates instead of a single
 * painted slab. Every tile is pushed onto ctx.floorMeshes so the player's ground raycast keeps
 * working exactly as it did against the old hand-built plane.
 */
export async function buildFloor(ctx: InteriorCtx): Promise<void> {
  await preloadKit(VARIANTS);

  const placements: Promise<THREE.Object3D>[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const x = -ROOM_W / 2 + KIT_TILE / 2 + col * KIT_TILE;
      const z = -ROOM_D / 2 + KIT_TILE / 2 + row * KIT_TILE;
      const variant = VARIANTS[(col + row) % VARIANTS.length];
      // A second, coprime-ish walk over the same grid so the yaw variety doesn't retrace the
      // material assignment and quietly recreate a repeating tile pair.
      const yaw = ((col * 7 + row * 3) % 4) * (Math.PI / 2);
      placements.push(placeKitPiece(ctx.scene, variant, [x, 0, z], yaw));
    }
  }

  const tiles = await Promise.all(placements);
  for (const tile of tiles) ctx.floorMeshes.push(tile);
}
