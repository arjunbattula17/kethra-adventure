import * as THREE from 'three';
import { displayFontsReady } from '../../core/loadFonts';
import { GRADES } from '../../core/GradeGlowPass';
import { MotionScope, CameraPath, ease, motion } from '../../motion';
import type { GameScene } from '../../core/Engine';
import { PlayerController } from '../../player/PlayerController';
import { InteractionSystem } from '../../player/InteractionSystem';
import { UIManager } from '../../ui/UIManager';
import { gameState } from '../../core/GameState';
import { disposeSceneTextures, downscaleCanvasTextures } from '../../core/disposeSceneTextures';
import { getActiveEngine } from '../../core/EngineRegistry';
import { bus } from '../../core/EventBus';
import { getSharedEnvironment } from '../../core/Environment';
import { DialogueSystem } from '../../dialogue/DialogueSystem';
import { WARDEN_DIALOGUE, ARCHIVIST_DIALOGUE } from './kethraDialogue';
import { KETHRA_LORE_ENTRIES } from './kethraLore';
import { ShipLibrary } from '../../journal/shipLibrary';
import { Survey } from '../../journal/Survey';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { AudioSystem } from '../../audio/AudioSystem';
import { applyPbr, pbrTexturesReady } from '../../core/TextureLibrary';
import { KitBatcher, kitInstanceBox, mergeKit, jitter, groveRandom, resetGroveRandom } from './kit';
import { buildKethraColliders } from './collision';
import { Figure } from '../../characters/Figure';
import { getPointSprite } from '../../galaxy/spaceDressing';
import { buildCisternHeart, buildShrineStele, tintByLuminance, CANOPY_TINTS } from './grove';
import type { CisternHeart } from './grove';
import { buildSkiff } from '../../galaxy/skiff';
import { HushGame } from './hush/HushGame';
import * as H from './hush/sim';
import { addWake, wake } from './wake';
import { HoldToSkip } from '../../ui/HoldToSkip';
import { buildCanopyCeiling } from './canopyCeiling';
import type { CanopyCeiling } from './canopyCeiling';
import { makePoolWater } from './water';
import type { PoolWater, ShoreShape } from './water';
import { addHeartCrystals, buildBanks, buildMist, buildMoss, buildRuins, buildTrees, stoneGeometry, treeBankSpots, LANDMARK_TREE, STEPPING_STONES, UNDERSTORY_TREES } from './dressing';
import type { Mist, MothPerch } from './dressing';
import { t, excerpt } from '../../content/strings';

/** Where the skiff is parked on the landing terrace, beside the arrival point. */
const SKIFF_AT = { x: 3, z: 19.6 };

const DIM_CANOPY_COLOR = new THREE.Color(0x274a3a);
const BRIGHT_CANOPY_COLOR = new THREE.Color(0x4fd98a);
/** Residual emissive the wake leaves on canopy leaves: half the step from dim (x0.8) to bright
 * (x1.8). */
const CANOPY_WAKE = BRIGHT_CANOPY_COLOR.clone().multiplyScalar(1.8).sub(DIM_CANOPY_COLOR.clone().multiplyScalar(0.8)).multiplyScalar(0.5);
/** Base color of the wake's residual glow on stone and water. */
const WAKE_GREEN = new THREE.Color(0x3fd9a8);

/** Height of the water plane, below every walking surface (the lowest, at the ramps' feet, is about
 * 0.2). */
const WATER_Y = -0.9;

/** What stands in the pool, for the water's shallows: the terraces, their ramps and the chamber. */
const TERRACE_SHORES: ShoreShape[] = [
  { x: 0, z: 16, hx: 5, hz: 5 },
  { x: 0, z: 2, hx: 8, hz: 8 },
  { x: 0, z: 10.5, hx: 1.5, hz: 1.1 },
  { x: -7, z: 10, hx: 2, hz: 4 },
  { x: 7, z: 10, hx: 2, hz: 4 },
  { x: -16, z: -2, hx: 5, hz: 4.5 },
  { x: 16, z: -2, hx: 5, hz: 4.5 },
  { x: -9.5, z: -0.5, hx: 2.2, hz: 2.5 },
  { x: 9.5, z: -0.5, hx: 2.2, hz: 2.5 },
  { x: 0, z: -7.5, hx: 3, hz: 2 },
  { x: -20.3, z: -6.5, hx: 1.5, hz: 3 },
  { x: H.CENTER.x, z: H.CENTER.z, hx: H.RADIUS + 1.4 },
];

/** Where a player arrives, and where a fall into the pool puts them back. */
const SPAWN = new THREE.Vector3(0, 2, 18);
/** The chamber's door, generously: from inside, the only opening the outer trees show through. */
const DOOR_VIEW = new THREE.Box3(
  new THREE.Vector3(-H.GATE.halfWidth - 0.5, H.FLOOR_Y - 1, H.GATE.z - 1),
  new THREE.Vector3(H.GATE.halfWidth + 0.5, H.FLOOR_Y + 8, H.GATE.z + 1),
);
/**
 * The east terrace's north strip, the stepping stones off it and the islet they lead to. A fall
 * from here wades back to the terrace's edge, facing the first stone, instead of the whole way to
 * the landing.
 */
const atStepStones = (p: THREE.Vector3) => p.x > 14 && p.z > 1.2;
const STONES_RESPAWN = new THREE.Vector3(16.9, 2.2, 1.0);
const STONES_YAW = Math.PI;

/** The objective once the Heart is awake, on the day it wakes and on any later visit. */
const OBJECTIVE_AWAKE = 'The Heart is awake. Look around, or take the skiff back to the Wren.';

/** Yields to the event loop so a frame can render between builders. */
const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// Clear radius kept around every interaction anchor and the spawn when scattering boulders, applied
// per-axis rather than by centre distance: a collider is an axis-aligned box, so a rock 3.4 units
// away on the diagonal can still have a face 0.24 from the anchor, which is how a boulder was still
// landing on the spawn after the first attempt at this guard.
//
// The figure that matters is the boulder's worst CORNER radius, not its worst axis extent, because
// the yaw is random and an AABB reaches its corner radius along one axis at 45 degrees.
// Rock_Medium_3's corner radius in XZ is hypot(1.824, 2.586) = 3.165, times the 1.3 max clutter
// scale is 4.114, plus the player's 0.35 radius is 4.46. The hand-placed boulders in
// buildGroundCover are deliberate and verified against tools/collision-check.mjs rather than being
// silently dropped by this guard.
const CLUTTER_KEEP_CLEAR = 4.6;

// A clutter zone only gets boulders if it is wider than one. Rock_Medium_3 reaches 2.59 units from
// its own origin and clutter scales it up to 1.3, so a boulder spans up to ~6.7 units — dropping one
// into a 2.4-wide zone puts most of its bulk outside the zone entirely. That is what sealed the
// chamber approach: zones 5 and 6 line its two long edges, and four boulders thrown inward from
// them met in the middle of the 8-unit-wide corridor and walled the mechanism puzzle off. The
// secret ledge's 2-wide zone has the same problem. Narrow zones get ground cover only; the four
// wide zones (plaza, both side terraces, landing) are unaffected.
const MIN_BOULDER_ZONE = 7;

function pick<T>(arr: T[]): T {
  return arr[Math.floor(groveRandom() * arr.length)];
}

/**
 * Brings the kit's ground flora into Kethra's palette (ART_BIBLE.md): leaves to sea-green, and the
 * flowers and mushrooms (red, yellow and orange in the pack) to the pale azure and verdant of the
 * Rite, glowing faintly, so the grove floor makes its own light the way the lore says it does.
 */
function retintFlora(built: Map<string, THREE.InstancedMesh[]>): void {
  for (const meshes of built.values()) {
    for (const mesh of meshes) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (mat.name === 'Flowers' || mat.name === 'Mushrooms') {
        const glow = mat.name === 'Flowers' ? 0x8fd6ff : 0xb7f0c8;
        tintByLuminance(mat, glow, 1.2);
        mat.emissive.set(glow);
        mat.emissiveMap = mat.map;
        mat.emissiveIntensity = 0.45;
        addWake(mat, new THREE.Color(glow).multiplyScalar(0.35), 1.4);
      } else if (mat.name.startsWith('Leaves')) {
        tintByLuminance(mat, 0x5fa88c, 1.5);
      }
    }
  }
}

/**
 * The canopy treatment every leaf material in the grove gets, kit trees and sourced ones alike.
 *
 * It leaves the authored diffuse texture alone (it's what makes the foliage read as real leaf
 * clusters instead of a flat blob) and drives the bioluminescent dim/bright toggle entirely through
 * a flat emissive tint. Reusing the diffuse map as an emissive mask was tried first, but it
 * multiplies the emissive color channel-by-channel against the leaf texture — on the kit's
 * red-foliage species (TwistedTree) that leaves almost no green channel to multiply against, so the
 * toggle barely showed. A flat tint responds the same way regardless of the species' authored leaf
 * color, so the whole canopy visibly reacts together, which matters here since this is the player's
 * puzzle-progress feedback. The wake (wake.ts) carries it from dim to bright when the Heart wakes.
 *
 * The leaves come in autumn red (TwistedTree), summer green and photographed green; the art bible
 * gives Kethra's canopy one palette, sea-greens and teals. Tinting by the leaf texture's brightness
 * keeps every painted leaf cluster while putting every family in that palette.
 *
 * `wake` scales the glow the canopy keeps once the Heart is awake.
 */
function dressCanopy(mat: THREE.MeshStandardMaterial, tint: number, wake = 1): void {
  mat.emissive = DIM_CANOPY_COLOR.clone();
  mat.emissiveIntensity = 0.8;
  tintByLuminance(mat, tint);
  addWake(mat, wake === 1 ? CANOPY_WAKE : CANOPY_WAKE.clone().multiplyScalar(wake), 1.6);
}

// Quaternius Stylized Nature MegaKit species pools (see public/models/CREDITS.md and kit.ts).
// Sizes verified from real glTF accessor bounds: Common/Pine trees run ~7-10m tall at scale 1,
// TwistedTree is a hero/landmark family at ~15-19m tall, DeadTree has no foliage material (bark
// only) so it never participates in the canopy dim/bright toggle.
const COMMON_TREES = ['CommonTree_1', 'CommonTree_2', 'CommonTree_3', 'CommonTree_4', 'CommonTree_5'];
const PINES = ['Pine_1', 'Pine_2', 'Pine_3', 'Pine_4', 'Pine_5'];
const TWISTED_TREES = ['TwistedTree_1', 'TwistedTree_2', 'TwistedTree_3', 'TwistedTree_4', 'TwistedTree_5'];
const DEAD_TREES = ['DeadTree_1', 'DeadTree_2', 'DeadTree_3', 'DeadTree_4', 'DeadTree_5'];
const ROCKS_BIG = ['Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3'];
const ROCKS_SMALL = ['Pebble_Round_1', 'Pebble_Round_2', 'Pebble_Round_3', 'Pebble_Round_4', 'Pebble_Round_5', 'Pebble_Square_1', 'Pebble_Square_2', 'Pebble_Square_3'];
const ROCK_PATHS = ['RockPath_Round_Small_1', 'RockPath_Round_Small_2', 'RockPath_Round_Thin', 'RockPath_Round_Wide', 'RockPath_Square_Small_1', 'RockPath_Square_Small_2', 'RockPath_Square_Thin', 'RockPath_Square_Wide'];
const SHRUBS = ['Bush_Common', 'Bush_Common_Flowers', 'Fern_1'];
const GRASSES = ['Grass_Common_Short', 'Grass_Common_Tall', 'Grass_Wispy_Short', 'Grass_Wispy_Tall', 'Clover_1', 'Clover_2'];
const SMALL_FLORA = ['Mushroom_Common', 'Mushroom_Laetiporus', 'Flower_3_Single', 'Flower_3_Group', 'Flower_4_Single', 'Flower_4_Group', 'Plant_1', 'Plant_7'];

interface TreePlacement {
  position: [number, number, number];
  species: string;
  yaw: number;
  scale: number;
}

// Hand-placed trees with trunk colliders (see colliders()); the terrace ramps are placed around
// them. The TwistedTree is scaled well below its native ~16-19m to match the rest of the grove.
const NAMED_TREES: TreePlacement[] = [
  { position: [-8, 0, 4], species: 'CommonTree_2', yaw: 0.4, scale: 1.05 },
  { position: [8, 0, 4], species: 'Pine_2', yaw: 2.1, scale: 1.0 },
  { position: [-16, 0.6, -6], species: 'TwistedTree_3', yaw: 1.0, scale: 0.62 },
  { position: [16, 0.6, -6], species: 'CommonTree_4', yaw: 3.6, scale: 1.1 },
];

// Background canopy fill: belts of trees beyond the walkable terraces, purely decorative (no
// colliders, not floor targets) so density can be pushed hard without touching gameplay. Kept
// clear of the landing terrace approach (z 11-22 near x 0) so the spawn view isn't immediately
// blocked.
function generateFillerTrees(): TreePlacement[] {
  // At least an 8-unit gap from the nearest terrace edge — comfortably past the widest canopy
  // radius in play (Pine_5/CommonTree_2 at scale 1.3 run ~3m radius, a scaled-down TwistedTree
  // tops out around 3.7m) so no filler canopy reaches over a walkable terrace or the spawn point.
  const belts: [number, number, number, number][] = [
    [-17, 17, 29, 42], // north, beyond the landing terrace (edge at z=21)
    [-40, -29, -15, 10], // west, beyond the west terrace (edge at x=-21)
    [29, 40, -15, 10], // east, beyond the east terrace (edge at x=21)
    [-17, 17, -48, -39], // south, beyond the Heart's chamber (wall at z=-35)
  ];
  const trees: TreePlacement[] = [];
  for (const [xMin, xMax, zMin, zMax] of belts) {
    const count = 9;
    for (let i = 0; i < count; i++) {
      const roll = groveRandom();
      let species: string;
      let scale: number;
      if (roll < 0.35) {
        species = pick(COMMON_TREES);
        scale = jitter(0.8, 1.3);
      } else if (roll < 0.65) {
        species = pick(PINES);
        scale = jitter(0.8, 1.3);
      } else if (roll < 0.82) {
        species = pick(TWISTED_TREES);
        scale = jitter(0.32, 0.55);
      } else {
        species = pick(DEAD_TREES);
        scale = jitter(0.7, 1.1);
      }
      trees.push({
        position: [jitter(xMin, xMax), WATER_Y - 0.3, jitter(zMin, zMax)],
        species,
        yaw: groveRandom() * Math.PI * 2,
        scale,
      });
    }
  }
  return trees;
}

/**
 * How far the raised cap — the actual walking surface — is inset from the slab's own edge on each
 * side. The 0.3 ring outside it is the base tier, 0.18 lower, so a terrace's walkable extent is
 * always 0.6 narrower than the size passed to makeTerrace. Ramps have to be sized against this or
 * their surface stops short of the terrace's.
 */
const TERRACE_CAP_INSET = 0.3;

/**
 * Lichen rock in a slab's colour. The map's tiling is in each slab's own UVs (tiledBox), not on
 * the map, so every slab of a colour shares this one material and they merge (mergeSlabs).
 */
function slabMaterial(color = 0x7d8c86): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0.02 });
  applyPbr(mat, 'lichen_rock', [1, 1]);
  addWake(mat, WAKE_GREEN.clone().multiplyScalar(0.02), 0.7);
  return mat;
}

/** A box whose UVs run `repeat` times across each face, as that repeat set on a map would tile it. */
function tiledBox(width: number, height: number, depth: number, repeat: [number, number]): THREE.BoxGeometry {
  const box = new THREE.BoxGeometry(width, height, depth);
  const uv = box.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * repeat[0], uv.getY(i) * repeat[1]);
  return box;
}

function makeTerrace(width: number, depth: number, x: number, y: number, z: number, mat: THREE.MeshStandardMaterial): THREE.Group {
  const repeat: [number, number] = [width / 3, depth / 3];
  const group = new THREE.Group();

  // The base tier's top is at 0.2; it extends below the water line so no gap shows under the
  // terrace.
  const baseHeight = 0.5 + Math.max(0, y + 1.4 - WATER_Y - 0.9);
  const base = new THREE.Mesh(tiledBox(width, baseHeight, depth, repeat), mat);
  base.position.y = 0.2 - baseHeight / 2;
  base.receiveShadow = true;
  base.castShadow = true;
  group.add(base);

  // Inset raised cap: turns the slab into a stepped two-tier dais instead of a bare box, and
  // reads as a worn stone platform under the same lichen_rock PBR set rather than a placeholder.
  const capW = Math.max(width - 2 * TERRACE_CAP_INSET, 0.6);
  const capD = Math.max(depth - 2 * TERRACE_CAP_INSET, 0.6);
  const cap = new THREE.Mesh(tiledBox(capW, 0.18, capD, repeat), mat);
  cap.position.y = 0.29;
  cap.receiveShadow = true;
  cap.castShadow = true;
  group.add(cap);

  group.position.set(x, y, z);
  return group;
}

/**
 * The slabs as one mesh per stone colour, each slab's place and tilt baked into its vertices. A
 * dozen terraces and ramps were two draw calls apiece. The slabs themselves are spent.
 */
function mergeSlabs(slabs: THREE.Group[]): THREE.Mesh[] {
  const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const slab of slabs) {
    slab.updateMatrixWorld(true);
    for (const part of slab.children as THREE.Mesh[]) {
      const parts = byMaterial.get(part.material as THREE.Material);
      const placed = part.geometry.applyMatrix4(part.matrixWorld);
      if (parts) parts.push(placed);
      else byMaterial.set(part.material as THREE.Material, [placed]);
    }
  }
  return [...byMaterial].map(([material, parts]) => {
    const mesh = new THREE.Mesh(mergeGeometries(parts, false)!, material);
    for (const part of parts) part.dispose();
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  });
}

/**
 * Height of a terrace's walking surface above its group origin — the 0.18-tall inset cap centred
 * at 0.29 in makeTerrace. Ramps are positioned against this so their ends land exactly on the
 * surfaces they bridge.
 */
const TERRACE_TOP = 0.38;

/**
 * A sloped slab bridging two terraces at different heights. Each end is given as the world
 * (coordinate along `axis`, walking-surface height) of the terrace it meets — the edge of that
 * terrace's *cap*, not of its slab — so the two walking surfaces meet by construction rather than by
 * eye. `from` is the end at the lower coordinate; either end may be the higher one.
 *
 * The slab is grown by the cap inset on both sides on top of the overlap, because the ramp's own
 * walking surface is inset too: sizing it to hypot + 2 * overlap left the cap 0.2 short of each
 * terrace's cap, and the only floor across that strip was the ramp's base tier 0.18 lower — a real
 * trench the player dropped into and climbed out of at every junction.
 */
const RAMP_OVERLAP = 0.25;

function makeRamp(
  axis: 'x' | 'z',
  from: [number, number],
  to: [number, number],
  width: number,
  cross: number,
  mat: THREE.MeshStandardMaterial,
): THREE.Group {
  const run = to[0] - from[0];
  const rise = to[1] - from[1];
  const angle = Math.atan2(rise, run);
  const length = Math.hypot(run, rise) + 2 * (RAMP_OVERLAP + TERRACE_CAP_INSET);
  const midAxis = (from[0] + to[0]) / 2;
  const midTop = (from[1] + to[1]) / 2;

  if (axis === 'z') {
    // Rotating about X by -angle leaves the surface climbing at rise/run along +Z; the group origin
    // then has to be offset by the cap height through that rotation so the mid-surface lands on
    // (midAxis, midTop).
    const phi = -angle;
    const ramp = makeTerrace(width, length, cross, midTop - TERRACE_TOP * Math.cos(phi), midAxis - TERRACE_TOP * Math.sin(phi), mat);
    ramp.rotation.x = phi;
    return ramp;
  }
  const psi = angle;
  const ramp = makeTerrace(length, width, midAxis + TERRACE_TOP * Math.sin(psi), midTop - TERRACE_TOP * Math.cos(psi), cross, mat);
  ramp.rotation.z = psi;
  return ramp;
}

function makeCollider(x: number, z: number, halfW: number, halfD: number, top: number): THREE.Box3 {
  return new THREE.Box3(new THREE.Vector3(x - halfW, 0, z - halfD), new THREE.Vector3(x + halfW, top, z + halfD));
}

// Soft gradient plane texture used for distant ground-hugging haze layers: opaque near the
// bottom, fading to transparent toward the top, so it reads as mist rather than a hard sheet.
function buildHazeTexture(): THREE.Texture {
  const w = 512;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, h, 0, 0);
  gradient.addColorStop(0, 'rgba(255,255,255,0.6)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.3)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Carved-glyph texture for inscription runes: a dark stone card with thin glowing symbol
// lines, so a close-up reads as an inscription rather than a flat emissive card blowing to
// solid white under bloom. `seed` varies the glyph layout per fragment.
function buildRuneTexture(seed: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#241f14';
  ctx.fillRect(0, 0, size, size);

  let s = seed * 9301 + 49297;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };

  ctx.strokeStyle = '#f2d9a0';
  ctx.lineCap = 'round';
  const margin = 40;
  const lines = 5 + Math.floor(rand() * 3);
  for (let i = 0; i < lines; i++) {
    ctx.lineWidth = 3 + rand() * 4;
    ctx.beginPath();
    const segs = 2 + Math.floor(rand() * 3);
    let x = margin + rand() * (size - margin * 2);
    let y = margin + rand() * (size - margin * 2);
    ctx.moveTo(x, y);
    for (let seg = 0; seg < segs; seg++) {
      x = margin + rand() * (size - margin * 2);
      y = margin + rand() * (size - margin * 2);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(margin + rand() * (size - margin * 2), margin + rand() * (size - margin * 2), 4 + rand() * 5, 0, Math.PI * 2);
    ctx.fillStyle = '#f2d9a0';
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class KethraScene implements GameScene {
  /** Timers and tweens owned by this scene: disposed with it, so none fires into the next one. */
  private fx = new MotionScope('game');
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.05, 800);
  player: PlayerController;
  interaction = new InteractionSystem();
  /**
   * Stable scene identity for the Playwright harnesses in tools/. They used to match on
   * `constructor.name`, which a production build mangles to a two-letter symbol — so every
   * tool waited out its timeout with no useful error against `vite preview`, and every
   * "all targets reachable" claim had only ever been checked against a dev build.
   */
  readonly kind = 'KethraScene';
  readonly grade = GRADES.kethra;

  onDepart: (() => void) | null = null;

  private floorMeshes: THREE.Object3D[] = [];
  /** Every instanced kit mesh, kept until the colliders are built and then merged (mergeKit). */
  private kit: THREE.InstancedMesh[] = [];
  /** Mid-points of the connecting ramps, kept clear of scattered boulders — see buildClutter. */
  private rampAnchors: THREE.Vector3[] = [];
  /** The secret ledge's sides, up to its base tier (buildTerraces). */
  private ledgeSides = new THREE.Box3();
  private ruinColliders: THREE.Box3[] = [];
  private heart!: CisternHeart;
  /** The Heart's chamber minigame and its moth (hush/HushGame.ts). */
  hush!: HushGame;
  /** Scene lights with their full intensity (base) and the fraction kept inside the chamber (keep). */
  private lights: { light: THREE.Light; base: number; keep: number }[] = [];
  private wakeSkip: HoldToSkip | null = null;
  private canopy!: CanopyCeiling;
  private pool!: PoolWater;
  private mist: Mist | null = null;
  /** Where the resting moths sit: filled in by the builders that own those surfaces. */
  private perches: MothPerch[] = [];
  private atStones = false;
  /** Out-of-reach dressing, kept out of the collider pass. */
  private scenery: THREE.Object3D[] = [];
  /** The landmark and understory trees: not drawn from inside the chamber, whose wall hides them. */
  private outerTrees: THREE.Object3D[] = [];
  /** Whether the moon's shadow was last painted with the outer trees hidden, and so lacks theirs. */
  private moonPaintedWithoutTrees = false;
  private readonly camPos = new THREE.Vector3();
  private readonly viewProj = new THREE.Matrix4();
  private readonly frustum = new THREE.Frustum();
  /**
   * The moon's shadow map is drawn once, not every frame, since nothing it shadows moves. Only the
   * moth's gaze (hush/HushGame.ts) needs a live shadow, and only of the chamber, so on frames the
   * moon is not repainted everything outside the chamber stops casting shadows.
   */
  private moon: THREE.DirectionalLight | null = null;
  private moonDirty = true;
  private shadowsOn = false;
  private worldCasters: THREE.Object3D[] = [];
  private warden: Figure | null = null;
  private archivist: Figure | null = null;
  private unsub: Array<() => void> = [];
  private stopAmbient: (() => void) | null = null;
  private stopMusic: (() => void) | null = null;
  /** Held rather than looked up by name each frame: getObjectByName walks the whole scene graph. */
  private motes: THREE.Points | null = null;
  private eye = new THREE.Vector3();

  constructor() {
    this.player = new PlayerController(this.camera, new THREE.Vector3(0, 2, 18));
  }

  async init(): Promise<void> {
    // Canvas textures bake whatever font is loaded when drawn, so wait for the display fonts first.
    await displayFontsReady();
    // Same grove every visit: see resetGroveRandom in kit.ts for why the scatter is seeded.
    resetGroveRandom();
    this.scene.background = new THREE.Color(0x0b1220);
    this.scene.fog = new THREE.FogExp2(0x0b1220, 0.015);
    this.scene.environment = getSharedEnvironment();
    this.scene.environmentIntensity = 0.5;

    if (gameState.data.journalLogs.length > 0 && !gameState.data.journalLogs.some((l) => l.id === KETHRA_LORE_ENTRIES[0]?.id)) {
      gameState.data.journalLogs.push(...KETHRA_LORE_ENTRIES.map((l) => ({ ...l })));
    }
    // The shrine's survey flag is newer than its record: a save that already holds the record has read it.
    if (gameState.data.journalLogs.some((l) => l.id === 'kethra_ritual_record' && l.unlocked)) gameState.setFlag('kethra_shrine_read');
    // Standing under a forest that makes its own light is the moment the concept means something.
    ShipLibrary.award(['lib_biolum']);

    // The scene builds while a cutscene is on screen: yield after each builder so it keeps
    // rendering.
    const builders = [
      () => this.buildGround(),
      () => this.buildTerraces(),
      () => this.buildNPCs(),
      () => this.buildFragments(),
      () => this.buildShrineAndValve(),
      () => this.buildHeartChamber(),
      () => this.buildReturnPad(),
      () => this.buildFinds(),
      () => this.buildAtmosphere(),
      () => this.buildLighting(),
    ];
    for (const build of builders) {
      build();
      await nextTask();
    }

    // Every belt tree is placed, so the grove's random sequence (which places everything after them)
    // is the same on every tier; Low keeps every other one. The belts stand far out in the water, in
    // the fog, and the kit's bark was most of the level's triangles: Kethra on Low was 349k against
    // its 320k budget.
    const low = getActiveEngine()?.getQualityTier() === 'low';
    const fillers = generateFillerTrees().filter((_, i) => !low || i % 2 === 0);
    // The terraces' rock and metal maps (applyPbr, above) with the kit, so they are in hand for the
    // engine's warm-up frame behind the loading cover.
    await Promise.all([this.buildFoliage(fillers), this.buildGroundCover(), this.buildClutter(), this.buildDressing(fillers), pbrTexturesReady()]);
    await nextTask();

    this.scene.add(this.player.rig);
    this.player.setFloorTargets(this.floorMeshes);
    this.player.setColliders(await this.colliders());
    // The colliders read the boulders' placements from their instanced meshes, so the kit is only
    // merged now. Meshes draw alike when their material came from the same kit material and was
    // tinted the same way.
    mergeKit(
      this.scene,
      this.kit,
      (mesh) => {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        return [mat.name, mat.vertexColors, mat.color.getHex(), mat.emissive.getHex(), mat.emissiveIntensity, mesh.castShadow].join('|');
      },
      // The four belts out in the water (generateFillerTrees) and everything within them.
      (x, z) => (z > 22 ? 'north' : z < -36 ? 'south' : x < -24 ? 'west' : x > 24 ? 'east' : 'middle'),
    );
    this.kit = [];
    this.player.teleport(SPAWN, 0);
    // Terrace edges are unguarded and there is no way back up from the water, so a fall respawns
    // the player. The reset height is just above the water so they never visibly sink into it.
    this.player.setRespawn(SPAWN, 0);
    this.player.fallResetY = WATER_Y + 0.3;
    this.player.onFellOut = () =>
      UIManager.toast(this.atStones ? 'You slip off the stone and wade back to the terrace.' : 'You slip into the dark water and wade back to the landing terrace.');
    this.player.onFootstep = () => AudioSystem.playFootstep('organic');
    this.player.onLand = (s) => AudioSystem.playLand(s);

    this.interaction.onPromptChange = (label) => UIManager.setPrompt(label);
    this.unsub.push(bus.on('player:shake', (amount: number) => this.player.addShake(amount)));

    // Same low-tier canvas budget as the ship interior — see the note there.
    if (getActiveEngine()?.getQualityTier() === 'low') downscaleCanvasTextures(this.scene, 1024);

    const own = new Set<THREE.Object3D>();
    for (const root of [this.hush.chamber.group, this.heart.root, this.heart.callStone]) root.traverse((o) => own.add(o));
    this.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o.castShadow && !own.has(o)) this.worldCasters.push(o);
    });
    this.scene.onBeforeRender = () => {
      if (this.moonDirty) return;
      for (const o of this.worldCasters) o.castShadow = false;
    };
    this.scene.onAfterRender = () => {
      if (this.moonDirty) this.moonDirty = false;
      else for (const o of this.worldCasters) o.castShadow = true;
    };

    // On a return visit after the puzzle is solved, the wake starts finished.
    wake.origin.set(H.HEART.x, H.FLOOR_Y, H.HEART.z);
    if (gameState.hasFlag('kethra_mechanism_solved')) {
      wake.done();
      this.heart.setAwake(true);
    } else wake.reset();
  }

  /**
   * Arrival: the grove's sound, the look prompt and the objective. Here rather than in init, which
   * runs while the cruise is still on screen (GameFlow.cruiseTo prepares the level during it).
   */
  onEnter(): void {
    UIManager.setLookPromptEnabled(true);
    this.stopAmbient = AudioSystem.startAmbient(96, 0.03);
    this.stopMusic = AudioSystem.startMusic('kethra');
    gameState.setObjective(gameState.hasFlag('kethra_mechanism_solved') ? OBJECTIVE_AWAKE : 'Explore Kethra. Speak with the Aiveth and find the true light-sequence.');
  }

  private buildGround(): void {
    const safetyNet = new THREE.Mesh(
      new THREE.PlaneGeometry(600, 600),
      new THREE.MeshStandardMaterial({ color: 0x0c1a14, roughness: 1 }),
    );
    safetyNet.rotation.x = -Math.PI / 2;
    safetyNet.position.y = -20;
    this.scene.add(safetyNet);
    this.floorMeshes.push(safetyNet);

    // The water is not a floor target: stepping off an edge falls through to the respawn reset.
    // Roughness keeps the moon's reflection a sheen rather than a bright block under bloom.
    const waterMat = new THREE.MeshStandardMaterial({ color: 0x040a09, roughness: 0.62, metalness: 0, envMapIntensity: 0.3 });
    this.pool = makePoolWater(waterMat);
    this.pool.setShores(TERRACE_SHORES);
    addWake(waterMat, WAKE_GREEN.clone().multiplyScalar(0.05), 1.3);
    const water = new THREE.Mesh(new THREE.CircleGeometry(110, 64), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = WATER_Y;
    water.receiveShadow = true;
    this.scene.add(water);

    this.canopy = buildCanopyCeiling();
    addWake(this.canopy.leaves, CANOPY_WAKE.clone().multiplyScalar(0.3), 1.6);
    this.scene.add(this.canopy.group);
  }

  private buildTerraces(): void {
    const stone = slabMaterial();
    const landing = makeTerrace(10, 10, 0, 0, 16, stone);
    const plaza = makeTerrace(16, 16, 0, 0, 2, stone);
    const rampA = makeTerrace(4, 8, -7, -0.1, 10, stone);
    rampA.rotation.x = -0.12;
    const westTerrace = makeTerrace(10, 9, -16, 0.6, -2, stone);
    const rampB = makeTerrace(4, 8, 7, -0.1, 10, stone);
    rampB.rotation.x = -0.12;
    const eastTerrace = makeTerrace(10, 9, 16, 0.6, -2, stone);
    // The landing's walking surface stops at z = 11.3 and the plaza's starts at 9.7, with the pool
    // between: walking straight from the spawn at the plaza fell in every time, and the two side
    // ramps are out of sight behind the player's shoulders. This span is the direct way across. It
    // sits 2 mm low so its faces share no plane with the two slabs it overlaps.
    const causeway = makeTerrace(3, 2.2, 0, -0.002, 10.5, stone);

    // Connecting ramps. Without these, the plaza, the side terraces and the Heart's chamber are
    // separate islands with nothing between them: the side terraces sit 3 units away across empty
    // space and 0.60 m up, and the chamber 3 units away and 1.10 m up. Nothing bridges them and no
    // jump can, either — PlayerController's apex is JUMP_SPEED^2 / (2 * GRAVITY) = 6^2 / 36 = exactly
    // 1.00 m, so the chamber's 1.10 m rise is above the apex outright, and the 0.60 m rise leaves a
    // 0.42 s window above ledge height, worth 2.36 m at SPRINT_SPEED against a 3 m gap. Six of the
    // scene's eleven registered interactions were unreachable, including "Access the Cistern Heart",
    // which opens the mechanism puzzle the scene's own objective points at.
    //
    // Each ramp is placed off the named trees' trunk colliders, which are wider than they look:
    // CommonTree_2 spans x[-9.77,-6.06] z[2.53,6.10] straight across the west gap and Pine_2 spans
    // x[5.68,9.67] z[2.14,5.72] across the east one, so both side ramps sit south of z = 2.
    // Endpoints are cap edges: the plaza's slab reaches x = +-8 but its walking surface stops at
    // +-7.7, and the side terraces' slabs start at +-11 but their surfaces at +-11.3.
    const westRamp = makeRamp('x', [-11.3, 0.98], [-7.7, 0.38], 5, -0.5, stone);
    const eastRamp = makeRamp('x', [7.7, 0.38], [11.3, 0.98], 5, -0.5, stone);
    // Run out to z = -4 rather than stopping at the plaza edge, so 1.10 m is climbed over 5 units
    // (12.4deg) instead of 3 (20deg); the first two units simply lie on the plaza as a wedge. It
    // tops out at the chamber's door (hush/sim.ts puts the ring's north edge at z = -9.3).
    const chamberRamp = makeRamp('z', [H.CENTER.z + H.RADIUS, H.FLOOR_Y], [-4, 0.38], 6, 0, stone);

    // A boulder is up to 6.7 units across and a ramp is 2.2-6 wide, so one landing at a ramp's mouth
    // can cover most of it. Measured before this was added: a 5.5 x 5.5 boulder sat across the
    // chamber ramp's entrance from x -5.41 to 0.11, leaving only its right half open.
    this.rampAnchors = [
      new THREE.Vector3(-9.5, 0, -0.5),
      new THREE.Vector3(9.5, 0, -0.5),
      new THREE.Vector3(0, 0, -6.65),
      new THREE.Vector3(-20.6, 0, -4.65),
    ];

    const ledgeStone = slabMaterial(0x3a4a5a);
    const secretLedge = makeTerrace(3, 3, -20, 2.4, -8, ledgeStone);
    // Terraces are floors, not colliders: a rise is refused by comparing floor heights, and the floor
    // probe starts 2 m above the feet. The ledge's top is 2.4 m above the banks beside it, out of the
    // probe's sight, so without its own box the player walked into the pillar from there. The box stops
    // at the base tier, under the cap, so standing on the ledge and the stair's top are unaffected.
    // Taken before mergeSlabs, which bakes each part's placement into its geometry.
    secretLedge.updateMatrixWorld(true);
    this.ledgeSides.setFromObject(secretLedge.children[0]);

    // The ledge abuts the west terrace rather than standing across a gap, so unlike the other three
    // it was technically already attainable — but only through a PlayerController quirk: a grounded
    // player is snapped to whatever floor is under them with no step-up limit at all (velocityY is
    // zeroed every grounded frame, which defeats the MAX_STEP_UP test), so walking into the ledge
    // teleported the player 1.80 m straight up. This stair replaces that pop with a real climb. It
    // stays tucked-away: 2.6 units wide against the terraces' 5-6, hugging the far x edge, and only
    // visible from the back of the west terrace. x = -20.6 keeps it clear of TwistedTree_3's trunk
    // collider, which reaches x = -19.77.
    // Tops out at z = -6.5, the ledge's own north edge, not at its centre: a stair that only reaches
    // full height mid-platform leaves the player a 0.68 m step up at the edge, well over
    // PlayerController's 0.45 m MAX_STEP_UP, so it would have looked connected and still not been.
    const ledgeStair = makeRamp('z', [-6.8, 2.78], [-2.5, 0.98], 2.6, -20.6, ledgeStone);

    for (const mesh of mergeSlabs([landing, plaza, causeway, rampA, westTerrace, rampB, eastTerrace, westRamp, eastRamp, chamberRamp, secretLedge, ledgeStair])) {
      this.scene.add(mesh);
      this.floorMeshes.push(mesh);
    }
  }

  private async buildFoliage(fillers: TreePlacement[]): Promise<void> {
    // Tree collision stays on the explicit NAMED_TREES boxes built in colliders(); these batches are
    // deliberately not opted in via userData.collides. Marking them would collide the trunk of every
    // tree in the batcher — including all 36 belt trees, which the header comment above promises are
    // decorative — and would give each named tree a second, byte-identical box, since colliders()
    // already derives one from the same prims[0] geometry and the same transform.
    const batcher = new KitBatcher();
    const allTrees: TreePlacement[] = [...NAMED_TREES, ...fillers];
    for (const t of allTrees) {
      batcher.add(t.species, { position: new THREE.Vector3(...t.position), yaw: t.yaw, scale: t.scale });
    }

    const built = await batcher.flush(this.scene);
    for (const [species, meshes] of built) {
      if (species.startsWith('DeadTree')) continue;
      // Primitive 1 is always the canopy/leaf mesh for the Common/Pine/Twisted families (primitive
      // 0 is the trunk) — see the per-species primitive inspection this rebuild was based on.
      const leafMesh = meshes[1];
      if (!leafMesh) continue;
      dressCanopy(leafMesh.material as THREE.MeshStandardMaterial, CANOPY_TINTS[species.length % CANOPY_TINTS.length]);
    }
    for (const meshes of built.values()) this.kit.push(...meshes);
  }

  /**
   * The set dressing from dressing.ts: loam banks under the trees, moss, the colonnade, the Heart's
   * crystal, the landmark tree and understory, mist and moths. The low tier goes without the mist
   * (overdraw), the moths (too small to see at its resolution) and the understory, and builds six
   * columns, two crystal clusters and half the landmark's leaf cards.
   */
  private async buildDressing(fillers: TreePlacement[]): Promise<void> {
    const tier = getActiveEngine()?.getQualityTier();
    const low = tier === 'low';
    const understory = low ? [] : UNDERSTORY_TREES;
    const banks = buildBanks([...fillers.map((tree) => ({ x: tree.position[0], z: tree.position[2] })), ...treeBankSpots(understory)], WATER_Y);
    const moss = buildMoss();
    this.scene.add(banks.mesh, moss);
    this.scenery.push(banks.mesh, moss);
    if (!low) {
      this.mist = buildMist(WATER_Y);
      this.scene.add(this.mist.mesh);
    }
    const ruins = low ? buildRuins(WATER_Y, [], 6, STEPPING_STONES) : buildRuins(WATER_Y, this.perches, undefined, STEPPING_STONES);
    addHeartCrystals(this.heart.root, low ? 2 : undefined);
    const [landmark, small] = await Promise.all([
      buildTrees('jacaranda', LANDMARK_TREE, WATER_Y, low ? 0.5 : 1),
      understory.length ? buildTrees('tree_small', understory, WATER_Y, 1) : null,
    ]);
    this.scene.add(ruins.mesh);
    this.scenery.push(ruins.mesh);
    this.ruinColliders = ruins.colliders;
    [landmark, small].forEach((tree, i) => {
      if (!tree) return;
      this.scene.add(...tree.bark, tree.leaves);
      this.outerTrees.push(...tree.bark, tree.leaves);
      // Half the kit canopy's residual glow: these crowns are cut-out cards with no painted shading, and
      // the landmark's fills the view from the east terrace, where the full glow read as neon.
      dressCanopy(tree.leaves.material as THREE.MeshStandardMaterial, CANOPY_TINTS[i * 2], 0.5);
    });
    this.pool.setShores([...TERRACE_SHORES, ...banks.shores, ...ruins.shores]);
  }

  private buildNPCs(): void {
    // The plaza's walking surface is 0.38 up (TERRACE_TOP); figures stand on it, turned a little
    // toward the landing path the player arrives by.
    this.warden = new Figure({
      kind: 'aiveth', height: 2.25, build: 1.05, seed: 3,
      skin: 0x2f5a55, garment: 0x283049, trim: 0x70748f, coat: 1.6,
      glow: { color: 0x6ab8ff, intensity: 1.2 }, prop: 'staff',
    });
    this.warden.group.position.set(-3, TERRACE_TOP, 3);
    this.warden.group.rotation.y = 0.35;
    // "Wary rather than welcoming": her light starts drawn in and opens as she comes to trust you.
    this.warden.setGlow(gameState.hasFlag('kethra_warden_trust_1') ? 1 : 0.45);
    this.scene.add(this.warden.group);
    this.interaction.register({
      object: this.warden.group,
      label: 'Speak with the Warden',
      range: 2.6,
      // Once met, she picks up at her topics instead of challenging a stranger again.
      onInteract: () => DialogueSystem.start({ ...WARDEN_DIALOGUE, startNode: gameState.hasFlag('kethra_warden_met') ? 'warden_topics' : WARDEN_DIALOGUE.startNode }, () => {
        this.warden?.setGlow(gameState.hasFlag('kethra_warden_trust_1') || gameState.hasFlag('kethra_warden_valve_thanks') ? 1 : 0.45);
      }),
    });

    this.archivist = new Figure({
      kind: 'aiveth', height: 2.0, build: 0.95, seed: 7,
      skin: 0x3a6b5d, garment: 0x3c5642, trim: 0xb3a27a, coat: 1.1,
      glow: { color: 0x7be0a0, intensity: 1.35 },
    });
    this.archivist.group.position.set(3, TERRACE_TOP, 4);
    this.archivist.group.rotation.y = -0.4;
    this.scene.add(this.archivist.group);
    this.interaction.register({
      object: this.archivist.group,
      label: 'Speak with the Archivist',
      range: 2.6,
      onInteract: () => DialogueSystem.start(ARCHIVIST_DIALOGUE),
    });
  }

  private buildFragments(): void {
    // Pillar bases sit on the walking surfaces: the side terraces' tops are at 0.98, the ledge's at
    // 2.78.
    const fragmentSpots: [number, number, number][] = [
      [-16, 0.98, -3],
      [16, 0.98, -3],
      [-20, 2.78, -8],
    ];
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x2a2418, roughness: 0.8 });
    applyPbr(pillarMat, 'lichen_rock', [1, 1]);
    // Base, shaft and capital as one piece, which the three pillars share.
    const pillarGeo = mergeGeometries(
      [
        new THREE.CylinderGeometry(0.42, 0.48, 0.22, 10).translate(0, 0.11, 0),
        new THREE.CylinderGeometry(0.26, 0.32, 1.0, 8).translate(0, 0.22 + 0.5, 0),
        new THREE.CylinderGeometry(0.4, 0.3, 0.18, 10).translate(0, 0.22 + 1.0 + 0.09, 0),
      ],
      false,
    )!;
    fragmentSpots.forEach(([x, y, z], idx) => {
      // The group's origin is the pillar's own base, so getWorldPosition() lands on the pillar. It
      // used to be pinned at y = 0.7 with each child offset by `y - 0.7`, which for the ledge pillar
      // left the origin 2.5 m below the geometry — and InteractionSystem's proximity fallback
      // measures to that origin, so a prompt would fire from a point in mid-air under the pillar
      // rather than from the pillar. World positions are unchanged.
      const pillar = new THREE.Group();
      pillar.add(new THREE.Mesh(pillarGeo, pillarMat));
      pillar.position.set(x, y, z);
      this.scene.add(pillar);

      const runeTex = buildRuneTexture(idx + 1);
      const rune = new THREE.Mesh(
        new THREE.PlaneGeometry(0.6, 0.6),
        new THREE.MeshStandardMaterial({
          map: runeTex,
          emissive: 0xd9c88a,
          emissiveMap: runeTex,
          emissiveIntensity: 0.9,
          roughness: 0.6,
          side: THREE.DoubleSide,
        }),
      );
      rune.position.set(x, y + 1.32, z);
      rune.rotation.y = Math.PI / 4;
      this.scene.add(rune);

      const entry = KETHRA_LORE_ENTRIES[idx];
      const flagId = `kethra_fragment_${idx + 1}_read`;
      this.interaction.register({
        object: pillar,
        label: `Read Inscription${idx + 1 <= 3 ? ` ${idx + 1}` : ''}`,
        range: 2.2,
        onInteract: () => {
          // Rewards land once. Re-reading used to grant archaeology every press, so mashing E on one
          // pillar could buy every archaeology-gated dialogue option in the grove.
          const firstRead = !gameState.hasFlag(flagId);
          gameState.setFlag(flagId);
          if (!entry) return;
          if (firstRead) {
            gameState.unlockLog(entry.id);
            gameState.addClue({ id: entry.id, title: entry.title, summary: excerpt(entry.body), source: 'Kethra inscription' });
            gameState.addAttributeXp('archaeology', 1);
          }
          // The Rite's order is in these words, and the journal that files them is back on the Wren.
          UIManager.showDocument(entry.title, entry.body);
        },
      });
    });
  }

  private buildShrineAndValve(): void {
    const valveMat = new THREE.MeshStandardMaterial({ color: 0x6a5a3a, metalness: 0.7, roughness: 0.4 });
    applyPbr(valveMat, 'metal_plate', [1, 1]);
    // The group carries the world position and its children are placed relative to it. They used to
    // be the other way round — a group left at the origin with every child holding absolute world
    // coordinates — which put valveGroup.getWorldPosition() at (0, 0, 0). InteractionSystem's
    // proximity fallback measures camera-to-object-origin (InteractionSystem.ts), so that spawned a
    // live interaction zone at the plaza centre: standing at (0, ·, 0) raised the "Realign the Lower
    // Valve" prompt and E completed the objective from 8.65 m away with the valve behind the player.
    // The same origin is what the boulder keep-clear guard reads, so it was also guarding empty
    // ground instead of the valve. World transforms are unchanged.
    const valveGroup = new THREE.Group();
    valveGroup.position.set(2.5, 0, 8);
    // Bracket, pipe and wheel as one piece.
    const valve = mergeGeometries(
      [
        new THREE.BoxGeometry(0.5, 0.5, 0.3).translate(0, 0.65, 0.25),
        new THREE.CylinderGeometry(0.14, 0.14, 0.6, 10).rotateZ(Math.PI / 2).translate(0, 0.9, 0.35),
        new THREE.TorusGeometry(0.35, 0.1, 8, 16).rotateX(Math.PI / 2).translate(0, 0.9, 0),
      ],
      false,
    )!;
    valveGroup.add(new THREE.Mesh(valve, valveMat));
    this.scene.add(valveGroup);
    this.perches.push({ parent: valveGroup, position: new THREE.Vector3(0.12, 1.042, 0.35), normal: new THREE.Vector3(0, 1, 0), span: 0.17, turn: 1.9 });
    this.interaction.register({
      object: valveGroup,
      label: () => (gameState.hasFlag('kethra_helped_with_valve') ? 'Valve Already Repaired' : 'Realign the Lower Valve'),
      range: 2.2,
      onInteract: () => {
        if (gameState.hasFlag('kethra_helped_with_valve')) {
          UIManager.toast('The valve turns smoothly. Water still trickles through, thin but steady.');
          return;
        }
        gameState.setFlag('kethra_helped_with_valve');
        gameState.addAttributeXp('engineering', 1);
        UIManager.toast('You realign the corroded valve. A thin trickle of water resumes down the terrace.');
      },
    });

    const shrineMat = new THREE.MeshStandardMaterial({ color: 0x75857f, roughness: 0.9, flatShading: true });
    // Same fix as valveGroup above: the group holds the world position, children are relative.
    const shrineGroup = buildShrineStele(shrineMat, buildRuneTexture(9));
    shrineGroup.position.set(-1.5, TERRACE_TOP, 5);
    shrineGroup.rotation.y = 0.5;
    this.scene.add(shrineGroup);
    // On the stele's face beside the lit record, and on the rim of the offering bowl.
    this.perches.push(
      { parent: shrineGroup, position: new THREE.Vector3(0.12, 1.42, 0.128), normal: new THREE.Vector3(0, 0, 1), span: 0.2, turn: 0.4 },
      { parent: shrineGroup, position: new THREE.Vector3(0.22, 0.302, 0.42), normal: new THREE.Vector3(0, 1, 0), span: 0.16, turn: 4.1 },
    );
    const shrineEntry = KETHRA_LORE_ENTRIES.find((l) => l.id === 'kethra_ritual_record');
    this.interaction.register({
      object: shrineGroup,
      label: 'Examine the Grove Shrine',
      range: 2.2,
      onInteract: () => {
        if (!shrineEntry) return;
        gameState.setFlag('kethra_shrine_read');
        gameState.unlockLog(shrineEntry.id);
        gameState.addClue({ id: shrineEntry.id, title: shrineEntry.title, summary: excerpt(shrineEntry.body), source: 'Kethra shrine record' });
        UIManager.showDocument(shrineEntry.title, shrineEntry.body);
      },
    });
  }

  /**
   * Builds the Cistern Heart, its call-stone and the gate carving. HushGame builds the chamber
   * room, its moth and its rules.
   */
  private buildHeartChamber(): void {
    // Kindling-cut stone: flat-shaded and untextured, because a tiled rock map smears into stripes
    // across extruded shapes, which made the vanes read as planks.
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x75857f, roughness: 0.9, flatShading: true });
    this.heart = buildCisternHeart(stoneMat);
    this.heart.root.position.set(H.HEART.x, H.HEART.y, H.HEART.z);
    this.heart.root.rotation.y = H.HEART_YAW;
    this.scene.add(this.heart.root);
    // Turned to face the player, who stands south of it looking over it toward the Heart.
    this.heart.callStone.position.set(H.STONE.x, H.STONE.y, H.STONE.z);
    this.heart.callStone.rotation.y = Math.PI;
    this.scene.add(this.heart.callStone);

    this.hush = new HushGame({
      scene: this.scene,
      camera: this.camera,
      player: this.player,
      heart: this.heart,
      shadows: getActiveEngine()?.getQualityTier() !== 'low',
      onWin: () => this.stageWake(),
    });
    this.floorMeshes.push(this.hush.chamber.floor);

    // Carving plaque on the inner face of the gate's west pillar.
    const carvingMat = new THREE.MeshStandardMaterial({ color: 0x1c1810, roughness: 0.9 });
    applyPbr(carvingMat, 'lichen_rock', [1, 1.5]);
    const carvingGroup = new THREE.Group();
    // The plaque and its four-sided frame as one piece.
    const carving = mergeGeometries(
      [
        new THREE.BoxGeometry(1.0, 1.6, 0.2),
        new THREE.BoxGeometry(1.3, 0.14, 0.28).translate(0, 0.92, 0),
        new THREE.BoxGeometry(1.3, 0.14, 0.28).translate(0, -0.92, 0),
        new THREE.BoxGeometry(0.14, 1.9, 0.28).translate(-0.65, 0, 0),
        new THREE.BoxGeometry(0.14, 1.9, 0.28).translate(0.65, 0, 0),
      ],
      false,
    )!;
    carvingGroup.add(new THREE.Mesh(carving, carvingMat));
    carvingGroup.position.set(-(H.GATE.halfWidth + 0.55), H.FLOOR_Y + 1.02, H.GATE.z - 1.04);
    carvingGroup.rotation.y = Math.PI;
    this.scene.add(carvingGroup);
    this.perches.push({ parent: carvingGroup, position: new THREE.Vector3(-0.3, -0.45, 0.103), normal: new THREE.Vector3(0, 0, 1), span: 0.22, turn: 2.6 });
    const kindlingEntry = KETHRA_LORE_ENTRIES.find((l) => l.id === 'kethra_kindling_record');
    this.interaction.register({
      object: carvingGroup,
      label: 'Read the Last Kindling Carving',
      range: 2.8,
      onInteract: () => {
        // The flag is what the navigation map's survey checks for this site; it was never set, so
        // the carving stayed "unexplored" on the map forever. It also gates the insight reward to
        // the first read (it used to grant insight on every press).
        if (!kindlingEntry) return;
        if (!gameState.hasFlag('kethra_kindling_record')) {
          gameState.setFlag('kethra_kindling_record');
          gameState.unlockLog(kindlingEntry.id);
          gameState.addClue({ id: kindlingEntry.id, title: kindlingEntry.title, summary: excerpt(kindlingEntry.body), source: 'Deep chamber carving' });
          gameState.addAttributeXp('insight', 1);
        }
        UIManager.showDocument(kindlingEntry.title, kindlingEntry.body);
      },
    });
  }

  /**
   * Plays the win cutscene: the wake spreads out from the Heart while the camera, detached from the
   * player rig, flies out of the chamber. The camera is reattached when it ends or is skipped.
   */
  private stageWake(): void {
    const cam = this.camera;
    this.player.enabled = false;
    UIManager.showLetterbox(true);
    motion.conductor.duck(11);
    bus.emit('player:shake', 0.3);
    const from = cam.getWorldPosition(new THREE.Vector3());
    const look = from.clone().add(cam.getWorldDirection(new THREE.Vector3()).multiplyScalar(6));
    this.scene.attach(cam);
    const F = H.FLOOR_Y;
    const heartAt = new THREE.Vector3(H.HEART.x, F + 2.3, H.HEART.z);
    const path = new CameraPath(
      [
        { position: from, target: look, fov: cam.fov },
        { position: new THREE.Vector3(3.4, F + 3.2, H.HEART.z - 8.6), target: heartAt, fov: 56 },
        { position: new THREE.Vector3(0.6, F + 8.5, H.HEART.z - 4.5), target: new THREE.Vector3(0, F + 1, H.HEART.z + 9), fov: 60 },
        { position: new THREE.Vector3(0, F + 15.5, -8), target: new THREE.Vector3(0, 1, 9), fov: 62 },
        { position: new THREE.Vector3(0, F + 17, 2), target: new THREE.Vector3(0, 15, 20), fov: 64 },
      ],
      { pace: 'keys' },
    );
    const LENGTH = 11.5;
    const move = this.fx.tween({ duration: LENGTH, ease: ease.standard, update: (e) => path.apply(cam, e) });
    const front = this.fx.tween({
      duration: 7.5,
      delay: 3.2,
      ease: ease.accelerate,
      update: (e) => {
        wake.radius = e * 78;
      },
    });
    const line = this.fx.after(3.4, () => UIManager.showCaption(t('mg3.orion.wake'), 4000));
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      move.cancel();
      front.cancel();
      line.cancel();
      wake.done();
      this.wakeSkip?.dispose();
      this.wakeSkip = null;
      this.player.rig.add(cam);
      cam.fov = 65;
      cam.updateProjectionMatrix();
      this.player.enabled = true;
      UIManager.showLetterbox(false);
      this.hush.finish();
      AudioSystem.playLevelEnd();
      UIManager.toast('The Cistern Heart wakes. Water and light flow back up the terraces.', 'learn');
      gameState.setObjective(OBJECTIVE_AWAKE);
      UIManager.showChapterCard({
        eyebrow: 'Level 2 complete',
        title: 'The Heart wakes',
        lines: ['Light and water climb the terraces again.', '+3 resonant crystal: enough to repair the Wren’s navigation and Deep Scanner.', `${Survey.line('kethra')}.`],
      });
    };
    this.fx.after(LENGTH, finish);
    this.wakeSkip = new HoldToSkip({ onSkip: finish });
    this.wakeSkip.show();
  }

  /**
   * The survey's two finds that are places (src/content/discoveries.ts): Oshel's grove on the slab
   * at the landmark tree's foot, out over the stepping stones, and the Wickmoth's empty perch on the
   * far arch once it has settled on the Heart.
   */
  private buildFinds(): void {
    // What is stood on: each stone's own solid, undrawn. The ruins mesh draws them.
    const unseen = new THREE.MeshBasicMaterial({ visible: false });
    for (const stone of STEPPING_STONES) {
      const floor = new THREE.Mesh(stoneGeometry(stone, WATER_Y), unseen);
      this.scene.add(floor);
      this.floorMeshes.push(floor);
    }

    // A child's lantern on a crook at the slab's edge nearest the trunk, and a sleeping mat rolled
    // beside it. The lantern is dark until the wake reaches it.
    const [sx, sz, top] = STEPPING_STONES[STEPPING_STONES.length - 1];
    const site = new THREE.Group();
    site.position.set(sx + 0.75, top, sz + 0.1);
    const crook = new THREE.CylinderGeometry(0.022, 0.034, 1.5, 5);
    crook.rotateZ(0.1);
    crook.translate(0, 0.75, 0);
    const roll = new THREE.CylinderGeometry(0.11, 0.11, 0.8, 8);
    roll.rotateZ(Math.PI / 2);
    roll.rotateY(0.6);
    roll.translate(-0.55, 0.11, 0.1);
    const kept = new THREE.Mesh(mergeGeometries([crook, roll], false)!, new THREE.MeshStandardMaterial({ color: 0x4d4636, roughness: 1 }));
    crook.dispose();
    roll.dispose();
    const glass = new THREE.MeshStandardMaterial({ color: 0x1c2a26, roughness: 0.5 });
    addWake(glass, WAKE_GREEN.clone().multiplyScalar(1.6), 0.6);
    const lantern = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), glass);
    lantern.position.set(-0.16, 1.36, 0);
    site.add(kept, lantern);
    this.scene.add(site);
    this.scenery.push(site);
    this.interaction.register({
      object: site,
      label: 'Look at the child’s lantern',
      range: 2.6,
      onInteract: () => Survey.collect('kethra_oshel'),
    });

    const perch = new THREE.Object3D();
    perch.position.set(H.PERCHES.arch.at.x, H.PERCHES.arch.at.y, H.PERCHES.arch.at.z);
    this.scene.add(perch);
    this.interaction.register({
      object: perch,
      label: 'Look up at the empty perch',
      range: 6.5,
      enabled: () => gameState.hasFlag('kethra_mechanism_solved'),
      onInteract: () => Survey.collect('kethra_perch'),
    });
  }

  /** The skiff parked on the landing terrace; interacting with it returns the player to the ship. */
  private buildReturnPad(): void {
    const skiff = buildSkiff();
    // Gear pads rest on the terrace's walking surface (0.38); they sit 0.46 below the hull origin.
    skiff.group.position.set(SKIFF_AT.x, 0.38 + 0.46, SKIFF_AT.z);
    skiff.group.rotation.y = -0.6;
    this.scene.add(skiff.group);
    this.interaction.register({
      object: skiff.group,
      label: 'Return to Ship',
      range: 3.2,
      onInteract: () => this.onDepart?.(),
    });
  }

  private async buildGroundCover(): Promise<void> {
    const batcher = new KitBatcher();

    const rockSpots: [number, number, number, number][] = [
      [-21.5, 0.9, 3, 1.15],
      [-11.5, 0.9, -6.2, 0.9],
      [21.5, 0.9, 2.5, 1.0],
      [11.4, 0.9, -6.4, 0.95],
      // Was (-20.4, 2.7, -6.2): that is the one approach corridor to the secret ledge, and
      // Rock_Medium reaches 2.59 units from its own origin before scaling, so as a solid boulder it
      // sealed the ledge off no matter how the stair was routed. Moved onto the open west terrace;
      // it stays clear of Inscription 1's pillar at (-16, -3) and of the stair's x -21.7..-19.5.
      [-18.4, 0.9, 0.5, 0.85],
      [-19.6, 2.7, -9.6, 0.8],
      // Off the spawn line, not on it. At (0, 20.5) this boulder sat 2.5m dead ahead of the arrival
      // point, and Rock_Medium runs up to ~5 units across at these scales — measured, it reached
      // z = 18.15 against a spawn at z = 18, so on a fair share of loads the player materialised
      // inside it. Harmless-looking while rocks were walk-through; a hard spawn block once they
      // weren't.
      [-3.6, 0, 20.4, 1.0],
      [-2.5, -0.05, 21.5, 0.75],
    ];
    for (const [x, y, z, s] of rockSpots) {
      batcher.add(pick(ROCKS_BIG), {
        position: new THREE.Vector3(x, y + 0.16 * s, z),
        yaw: groveRandom() * Math.PI * 2,
        scale: s * jitter(0.9, 1.15),
      });
    }

    const pathSpots: [number, number, number][] = [
      [-4.6, 0.09, 6],
      [-3.2, 0.09, 5.4],
      [4.4, 0.09, 6],
      [3.1, 0.09, 5.5],
      [-6.5, -0.02, 11.5],
      [6.4, -0.02, 11.4],
    ];
    for (const [x, y, z] of pathSpots) {
      batcher.add(pick(ROCK_PATHS), {
        position: new THREE.Vector3(x, y, z),
        yaw: groveRandom() * Math.PI * 2,
        scale: jitter(0.9, 1.2),
      });
    }

    // The hand-placed boulders are landmarks the player walks around; the flat path stones
    // laid between them are trodden on.
    const built = await batcher.flush(this.scene);
    for (const [species, meshes] of built) {
      if (ROCKS_BIG.includes(species) && meshes[0]) meshes[0].userData.collides = true;
    }
    retintFlora(built);
    for (const meshes of built.values()) this.kit.push(...meshes);
  }

  private async buildClutter(): Promise<void> {
    const batcher = new KitBatcher();
    // Every interaction anchor, the spawn (which isn't one), and the four connecting ramps.
    // buildClutter runs after every builder that registers a target and after buildTerraces, so
    // this stays correct as targets and ramps are added.
    const keepClear = [...this.interaction.anchorPositions(), new THREE.Vector3(0, 0, 18), ...this.rampAnchors];
    const glowMatA = new THREE.MeshStandardMaterial({ color: 0x3fd98a, emissive: 0x3fd98a, emissiveIntensity: 0.8, roughness: 0.4 });
    const glowMatB = new THREE.MeshStandardMaterial({ color: 0x4fd9c8, emissive: 0x4fd9c8, emissiveIntensity: 0.8, roughness: 0.4 });
    // The glow motes of each colour, merged into one mesh once they are all placed.
    const glows = new Map<THREE.Material, THREE.BufferGeometry[]>([[glowMatA, []], [glowMatB, []]]);

    // xMin, xMax, zMin, zMax, y (terrace top surface height), item count
    const clutterZones: [number, number, number, number, number, number][] = [
      [-6, 6, -5, 8, 0.38, 18],
      [12, 20, -6, 2, 0.98, 16],
      [-20, -12, -6, 2, 0.98, 16],
      [-5, 5, 12, 20, 0.38, 14],
      [-21, -19, -9, -7, 2.78, 7],
    ];

    for (const [xMin, xMax, zMin, zMax, y, density] of clutterZones) {
      const roomForBoulders = Math.min(xMax - xMin, zMax - zMin) >= MIN_BOULDER_ZONE;
      for (let i = 0; i < density; i++) {
        const x = jitter(xMin, xMax);
        const z = jitter(zMin, zMax);
        const roll = groveRandom();
        const yaw = groveRandom() * Math.PI * 2;
        if (roll < 0.28) {
          const big = roomForBoulders && groveRandom() < 0.35;
          // Boulders are the only thing this pass places that the player can't walk through, and
          // the zone table above sits directly on top of the play space — zone 4 covers the arrival
          // pad the player spawns on, and three of the zones cover an inscription pillar. Unseeded
          // scatter would therefore block the spawn or an objective on some fraction of loads;
          // the first collision-check run caught exactly that. Everything else here is walked
          // through, so it can land wherever it falls.
          if (big && keepClear.some((p) => Math.max(Math.abs(x - p.x), Math.abs(z - p.z)) < CLUTTER_KEEP_CLEAR)) continue;
          batcher.add(pick(big ? ROCKS_BIG : ROCKS_SMALL), {
            position: new THREE.Vector3(x, y + (big ? 0.16 : 0.04), z),
            yaw,
            scale: jitter(0.85, 1.3) * (big ? 1 : 1.4),
          });
        } else if (roll < 0.5) {
          batcher.add(pick(SHRUBS), { position: new THREE.Vector3(x, y + 0.04, z), yaw, scale: jitter(0.85, 1.3) });
        } else if (roll < 0.75) {
          batcher.add(pick(GRASSES), { position: new THREE.Vector3(x, y + 0.02, z), yaw, scale: jitter(0.85, 1.35) });
        } else if (roll < 0.9) {
          batcher.add(pick(SMALL_FLORA), { position: new THREE.Vector3(x, y + 0.03, z), yaw, scale: jitter(0.85, 1.25) });
        } else {
          const mote = new THREE.IcosahedronGeometry(0.1 + groveRandom() * 0.08, 0);
          glows.get(groveRandom() > 0.5 ? glowMatA : glowMatB)!.push(mote.translate(x, y + 0.1, z));
        }
      }
    }

    for (const [mat, motes] of glows) {
      const mesh = new THREE.Mesh(mergeGeometries(motes, false)!, mat);
      for (const mote of motes) mote.dispose();
      this.scene.add(mesh);
    }

    const built = await batcher.flush(this.scene);
    for (const [species, meshes] of built) {
      if (ROCKS_BIG.includes(species) && meshes[0]) meshes[0].userData.collides = true;
    }
    retintFlora(built);
    for (const meshes of built.values()) this.kit.push(...meshes);
  }

  private buildAtmosphere(): void {
    const count = 700;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (groveRandom() - 0.5) * 60;
      positions[i * 3 + 1] = groveRandom() * 12;
      positions[i * 3 + 2] = (groveRandom() - 0.5) * 60 - 5;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    // Round, soft motes: without a sprite, points draw as hard squares, which one drifting close to
    // the camera made obvious.
    const mat = new THREE.PointsMaterial({ color: 0x9fe8c8, size: 0.06, transparent: true, opacity: 0.6, map: getPointSprite(), depthWrite: false, blending: THREE.AdditiveBlending });
    const motes = new THREE.Points(geo, mat);
    motes.name = 'motes';
    this.scene.add(motes);
    this.motes = motes;

    // Layered haze walls beyond the far terraces, for depth cueing on top of the exponential
    // fog: near layer tinted toward the canopy's bioluminescent teal, far layer toward the
    // background navy, so distance reads as a gradient rather than a flat fog cutoff.
    const hazeTex = buildHazeTexture();
    const hazeLayers: [number, number, number, number, number, number][] = [
      // z, y, width, height, color, opacity
      [-42, 8, 90, 22, 0x2a6a5a, 0.35],
      [-56, 10, 130, 28, 0x16324a, 0.4],
    ];
    for (const [z, y, width, height, color, opacity] of hazeLayers) {
      const hazeMat = new THREE.MeshBasicMaterial({
        map: hazeTex,
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        side: THREE.DoubleSide,
        // A flat sheet: one pass, not three.js's back-then-front for transparent double-sided
        // materials, which marks the material for update twice every frame.
        forceSinglePass: true,
      });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, height), hazeMat);
      plane.position.set(0, y, z);
      plane.renderOrder = 5;
      this.scene.add(plane);
    }
  }

  private buildLighting(): void {
    const ambient = new THREE.AmbientLight(0x5f7288, 1.0);
    this.scene.add(ambient);
    this.lights.push({ light: ambient, base: 1.0, keep: 0.2 });

    // Key light: cool moonlight, now shadow-casting so trunks/terraces read with real
    // directional contrast instead of flat even lighting.
    const moon = new THREE.DirectionalLight(0x99aadd, 1.4);
    moon.position.set(10, 20, 5);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    moon.shadow.camera.near = 1;
    moon.shadow.camera.far = 70;
    moon.shadow.camera.left = -30;
    moon.shadow.camera.right = 30;
    moon.shadow.camera.top = 30;
    // The Heart's chamber runs to z = -35.
    moon.shadow.camera.bottom = -38;
    moon.shadow.bias = -0.0015;
    moon.shadow.autoUpdate = false;
    this.moon = moon;
    this.scene.add(moon);
    this.lights.push({ light: moon, base: 1.4, keep: 0.12 });

    // Rim light: warm, positioned behind the canopy relative to the player's usual approach,
    // so trunk and canopy silhouettes pick up an edge highlight against the dark fog.
    const rim = new THREE.DirectionalLight(0xd9a15f, 0.55);
    rim.position.set(-14, 6, -22);
    this.scene.add(rim);
    this.lights.push({ light: rim, base: 0.55, keep: 0.1 });

    // Fill lights: cool, keep shadowed faces from crushing to black and spread bioluminescent
    // color across both the east and west terraces instead of just the center.
    const fillA = new THREE.PointLight(0x8ad9b8, 2, 20);
    fillA.position.set(0, 5, 4);
    this.scene.add(fillA);
    const fillB = new THREE.PointLight(0x5f8ad9, 1.4, 22);
    fillB.position.set(-16, 6, -4);
    this.scene.add(fillB);
    this.lights.push({ light: fillA, base: 2, keep: 0.08 }, { light: fillB, base: 1.4, keep: 0.08 });
  }

  private async colliders(): Promise<THREE.Box3[]> {
    // The six named trees and the mechanism core keep their hand-authored boxes: they are the
    // collision the terraces were laid out around, so they stay pinned rather than being left to
    // whatever the generic pass infers. Everything else in the grove — boulders, pillars, the
    // shrine and valve, the mechanism console and carving, the return pad and the two Aiveth — now
    // comes from the scene's own geometry.
    const boxes: THREE.Box3[] = [];
    for (const t of NAMED_TREES) {
      const box = await kitInstanceBox(t.species, new THREE.Vector3(...t.position), t.yaw, t.scale);
      boxes.push(box);
    }
    // The chamber's colliders are also the blocks the moth's line of sight is tested against.
    boxes.push(...this.hush.colliders);
    boxes.push(makeCollider(SKIFF_AT.x, SKIFF_AT.z, 1.5, 1.5, 1.2));
    boxes.push(this.ledgeSides, ...this.ruinColliders);
    // The moth flies between perches and the lantern rides the camera, so a box baked from where
    // either happens to be at load would block empty air a second later.
    boxes.push(...buildKethraColliders(this.scene, {
      floorMeshes: this.floorMeshes,
      animated: [this.hush.moth.root, this.player.rig],
      exact: [this.hush.chamber.group, this.heart.root, this.heart.callStone],
      scenery: this.scenery,
    }));
    return boxes;
  }

  /** Redraws the moon's shadow map on the next frame (after the build, or when shadows are
   * re-enabled). */
  private repaintMoon(): void {
    if (!this.moon) return;
    this.moon.shadow.needsUpdate = true;
    this.moonDirty = true;
    this.moonPaintedWithoutTrees = this.outerTrees.length > 0 && !this.outerTrees[0].visible;
  }

  /**
   * Whether the chamber's wall hides every tree out in the water: the camera (not the player, whom
   * the wake's camera leaves inside) is well inside it, and the door is out of view. Seen through
   * the door, the trees had vanished as the player walked in.
   */
  private outerTreesHidden(): boolean {
    const cam = this.camera;
    cam.updateWorldMatrix(true, false);
    const p = cam.getWorldPosition(this.camPos);
    if (Math.hypot(p.x - H.CENTER.x, p.z - H.CENTER.z) > H.RADIUS - 2.5) return false;
    this.viewProj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    return !this.frustum.setFromProjectionMatrix(this.viewProj).intersectsBox(DOOR_VIEW);
  }

  update(dt: number, elapsed: number): void {
    const shadows = getActiveEngine()?.renderer.shadowMap.enabled ?? false;
    if (shadows && !this.shadowsOn) this.repaintMoon();
    this.shadowsOn = shadows;
    this.player.update(dt);
    const atStones = atStepStones(this.player.rig.position);
    if (atStones !== this.atStones) {
      this.atStones = atStones;
      if (atStones) this.player.setRespawn(STONES_RESPAWN, STONES_YAW);
      else this.player.setRespawn(SPAWN, 0);
    }
    // No prompts and no E while a cutscene (the wake, a gust) has the player disabled.
    if (this.player.enabled) this.interaction.update(this.camera);
    else this.interaction.release();
    const eye = this.player.camera.getWorldPosition(this.eye);
    this.warden?.update(dt, elapsed, eye);
    this.archivist?.update(dt, elapsed, eye);

    // Ambient motion is scaled by motion.ambient, which the conductor ducks during the wake
    // cutscene.
    const ambientDt = dt * motion.ambient;
    this.hush.update(dt, elapsed);
    this.heart.update(dt, elapsed);
    // Dim the grove lights inside the chamber; once the Heart is awake it lights the room, so dim
    // less.
    const dark = this.hush.inside * (gameState.hasFlag('kethra_mechanism_solved') ? 0.55 : 1);
    for (const l of this.lights) l.light.intensity = THREE.MathUtils.lerp(l.base, l.base * l.keep, dark);
    this.scene.environmentIntensity = THREE.MathUtils.lerp(0.5, 0.08, dark);
    // The moon's shadow map is redrawn as the trees come back if it was repainted while they were
    // hidden.
    const treesShown = !this.outerTreesHidden();
    if (this.outerTrees.length && this.outerTrees[0].visible !== treesShown) {
      for (const tree of this.outerTrees) tree.visible = treesShown;
      if (treesShown && this.moonPaintedWithoutTrees) this.repaintMoon();
    }

    this.canopy.update(motion.ambientTime);
    this.pool.update(motion.ambientTime);
    this.mist?.update(motion.ambientTime);
    if (this.motes) this.motes.rotation.y += ambientDt * 0.01;
  }

  onResize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.fx.dispose();
    this.hush.dispose();
    this.wakeSkip?.dispose();
    for (const u of this.unsub) u();
    this.stopAmbient?.();
    this.stopMusic?.();
    this.interaction.clear();
    this.pool.dispose();
    this.mist?.dispose();
    this.scene.traverse((obj) => {
      // Kit-sourced InstancedMesh geometries are shared, cached templates (src/planets/kethra/kit.ts)
      // reused across scene visits — disposing them here would leave the cache holding freed GPU
      // buffers and break the scene on a return trip to Kethra. batchStaticGeometry.ts documents the
      // same InstancedMesh-vs-shared-geometry hazard for the ship interior's kit.
      // Only those: the canopy ceiling and the chamber build InstancedMeshes of their own.
      if ((obj as THREE.InstancedMesh).isInstancedMesh && obj.userData.sharedGeometry) return;
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
    disposeSceneTextures(this.scene);
  }
}
