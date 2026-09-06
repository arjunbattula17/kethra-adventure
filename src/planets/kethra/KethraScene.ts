import * as THREE from 'three';
import type { GameScene } from '../../core/Engine';
import { PlayerController } from '../../player/PlayerController';
import { InteractionSystem } from '../../player/InteractionSystem';
import { UIManager } from '../../ui/UIManager';
import { gameState } from '../../core/GameState';
import { bus } from '../../core/EventBus';
import { getSharedEnvironment } from '../../core/Environment';
import { DialogueSystem } from '../../dialogue/DialogueSystem';
import { WARDEN_DIALOGUE, ARCHIVIST_DIALOGUE } from './kethraDialogue';
import { KETHRA_LORE_ENTRIES } from './kethraLore';
import { KethraMechanismPuzzle } from './KethraMechanismPuzzle';
import { AudioSystem } from '../../audio/AudioSystem';
import { applyPbr } from '../../core/TextureLibrary';
import { KitBatcher, kitInstanceBox, jitter, groveRandom, resetGroveRandom } from './kit';
import { buildKethraColliders } from './collision';

const DIM_CANOPY_COLOR = new THREE.Color(0x274a3a);
const BRIGHT_CANOPY_COLOR = new THREE.Color(0x4fd98a);

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

// The six trunk anchors from the original hand-built canopy, kept at the same positions so the
// gameplay collision/readability of the terraces doesn't shift — only the mesh at each spot
// changes. Mixed families (Common/Pine/Twisted) so the canopy doesn't read as one repeated tree;
// the two TwistedTree slots are scaled well below their native ~16-19m to stay in scale with the
// rest of the grove while still reading as older, gnarled outliers.
const NAMED_TREES: TreePlacement[] = [
  { position: [-8, 0, 4], species: 'CommonTree_2', yaw: 0.4, scale: 1.05 },
  { position: [8, 0, 4], species: 'Pine_2', yaw: 2.1, scale: 1.0 },
  { position: [-16, 0.6, -6], species: 'TwistedTree_3', yaw: 1.0, scale: 0.62 },
  { position: [16, 0.6, -6], species: 'CommonTree_4', yaw: 3.6, scale: 1.1 },
  { position: [-4, 1.1, -18], species: 'Pine_4', yaw: 5.0, scale: 0.95 },
  { position: [4, 1.1, -18], species: 'TwistedTree_5', yaw: 4.2, scale: 0.5 },
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
    [-15, 15, -38, -27], // south, beyond the mechanism chamber (edge at z=-19)
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
        position: [jitter(xMin, xMax), 0, jitter(zMin, zMax)],
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

function makeTerrace(width: number, depth: number, x: number, y: number, z: number, color = 0x9a9385): THREE.Group {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0.02 });
  applyPbr(mat, 'lichen_rock', [width / 3, depth / 3]);
  const group = new THREE.Group();

  const base = new THREE.Mesh(new THREE.BoxGeometry(width, 0.5, depth), mat);
  base.position.y = -0.05;
  base.receiveShadow = true;
  base.castShadow = true;
  group.add(base);

  // Inset raised cap: turns the slab into a stepped two-tier dais instead of a bare box, and
  // reads as a worn stone platform under the same lichen_rock PBR set rather than a placeholder.
  const capW = Math.max(width - 2 * TERRACE_CAP_INSET, 0.6);
  const capD = Math.max(depth - 2 * TERRACE_CAP_INSET, 0.6);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(capW, 0.18, capD), mat);
  cap.position.y = 0.29;
  cap.receiveShadow = true;
  cap.castShadow = true;
  group.add(cap);

  group.position.set(x, y, z);
  return group;
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
  color = 0x9a9385,
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
    const ramp = makeTerrace(width, length, cross, midTop - TERRACE_TOP * Math.cos(phi), midAxis - TERRACE_TOP * Math.sin(phi), color);
    ramp.rotation.x = phi;
    return ramp;
  }
  const psi = angle;
  const ramp = makeTerrace(length, width, midAxis + TERRACE_TOP * Math.sin(psi), midTop - TERRACE_TOP * Math.cos(psi), cross, color);
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
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.05, 800);
  player: PlayerController;
  interaction = new InteractionSystem();
  onDepart: (() => void) | null = null;

  private floorMeshes: THREE.Object3D[] = [];
  /** Mid-points of the connecting ramps, kept clear of scattered boulders — see buildClutter. */
  private rampAnchors: THREE.Vector3[] = [];
  private canopyMats: THREE.MeshStandardMaterial[] = [];
  private creature: THREE.Mesh;
  private creatureTime = 0;
  private mechanismCore!: THREE.Mesh;
  private mechanismLight!: THREE.PointLight;
  private waterPool!: THREE.Mesh;
  private puzzle = new KethraMechanismPuzzle();
  private unsub: Array<() => void> = [];
  private stopAmbient: (() => void) | null = null;

  constructor() {
    this.player = new PlayerController(this.camera, new THREE.Vector3(0, 2, 18));
    this.creature = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.7, 1),
      new THREE.MeshStandardMaterial({ color: 0x88e0c8, emissive: 0x3fd9a8, emissiveIntensity: 1.0, roughness: 0.3 }),
    );
  }

  async init(): Promise<void> {
    // Same grove every visit: see resetGroveRandom in kit.ts for why the scatter is seeded.
    resetGroveRandom();
    UIManager.setLookPromptEnabled(true);
    this.scene.background = new THREE.Color(0x0b1220);
    this.scene.fog = new THREE.FogExp2(0x0b1220, 0.015);
    this.scene.environment = getSharedEnvironment();
    this.scene.environmentIntensity = 0.5;

    if (gameState.data.journalLogs.length > 0 && !gameState.data.journalLogs.some((l) => l.id === KETHRA_LORE_ENTRIES[0]?.id)) {
      gameState.data.journalLogs.push(...KETHRA_LORE_ENTRIES.map((l) => ({ ...l })));
    }

    this.buildGround();
    this.buildTerraces();
    this.buildNPCs();
    this.buildFragments();
    this.buildShrineAndValve();
    this.buildCreatureArea();
    this.buildMechanismChamber();
    this.buildReturnPad();
    this.buildAtmosphere();
    this.buildLighting();

    await Promise.all([this.buildFoliage(), this.buildGroundCover(), this.buildClutter()]);

    this.scene.add(this.player.rig);
    this.player.setFloorTargets(this.floorMeshes);
    this.player.setColliders(await this.colliders());
    this.player.teleport(new THREE.Vector3(0, 2, 18), 0);
    // The terraces are raised islands with unguarded edges, and the only thing below them is the
    // catch plane 20 units down with no way back up — walking off any edge was an unrecoverable
    // soft lock. -6 is well below the lowest terrace surface (-0.05) and well above the plane, so
    // the player is caught during the fall rather than after landing on it.
    this.player.setRespawn(new THREE.Vector3(0, 2, 18), 0);
    this.player.fallResetY = -6;
    this.player.onFellOut = () => UIManager.toast('You lose your footing and scramble back to the landing terrace.');
    this.player.onFootstep = () => AudioSystem.playFootstep('organic');
    this.stopAmbient = AudioSystem.startAmbient(96, 0.03);

    this.interaction.onPromptChange = (label) => UIManager.setPrompt(label);
    this.unsub.push(bus.on('player:shake', (amount: number) => this.player.addShake(amount)));

    this.puzzle.onSolved = () => this.setCanopyBright(true);
    if (gameState.hasFlag('kethra_mechanism_solved')) this.setCanopyBright(true);

    gameState.setObjective('Explore Kethra. Speak with the Aiveth and find the true light-sequence.');
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
  }

  private buildTerraces(): void {
    const landing = makeTerrace(10, 10, 0, 0, 16);
    const plaza = makeTerrace(16, 16, 0, 0, 2);
    const rampA = makeTerrace(4, 8, -7, -0.1, 10);
    rampA.rotation.x = -0.12;
    const westTerrace = makeTerrace(10, 9, -16, 0.6, -2);
    const rampB = makeTerrace(4, 8, 7, -0.1, 10);
    rampB.rotation.x = -0.12;
    const eastTerrace = makeTerrace(10, 9, 16, 0.6, -2);
    const chamberApproach = makeTerrace(8, 10, 0, 1.1, -14, 0x453a4a);

    // Connecting ramps. Without these, plaza / westTerrace / eastTerrace / chamberApproach are four
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
    const westRamp = makeRamp('x', [-11.3, 0.98], [-7.7, 0.38], 5, -0.5);
    const eastRamp = makeRamp('x', [7.7, 0.38], [11.3, 0.98], 5, -0.5);
    // Run out to z = -4 rather than stopping at the plaza edge, so 1.10 m is climbed over 5 units
    // (12.4deg) instead of 3 (20deg); the first two units simply lie on the plaza as a wedge.
    const chamberRamp = makeRamp('z', [-9.3, 1.48], [-4, 0.38], 6, 0);

    // A boulder is up to 6.7 units across and a ramp is 2.2-6 wide, so one landing at a ramp's mouth
    // can cover most of it. Measured before this was added: a 5.5 x 5.5 boulder sat across the
    // chamber ramp's entrance from x -5.41 to 0.11, leaving only its right half open.
    this.rampAnchors = [
      new THREE.Vector3(-9.5, 0, -0.5),
      new THREE.Vector3(9.5, 0, -0.5),
      new THREE.Vector3(0, 0, -6.65),
      new THREE.Vector3(-20.6, 0, -4.65),
    ];

    for (const t of [landing, plaza, rampA, westTerrace, rampB, eastTerrace, chamberApproach, westRamp, eastRamp, chamberRamp]) {
      this.scene.add(t);
      this.floorMeshes.push(t);
    }

    const secretLedge = makeTerrace(3, 3, -20, 2.4, -8, 0x3a4a5a);
    this.scene.add(secretLedge);
    this.floorMeshes.push(secretLedge);

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
    const ledgeStair = makeRamp('z', [-6.8, 2.78], [-2.5, 0.98], 2.6, -20.6, 0x3a4a5a);
    this.scene.add(ledgeStair);
    this.floorMeshes.push(ledgeStair);
  }

  private async buildFoliage(): Promise<void> {
    // Tree collision stays on the explicit NAMED_TREES boxes built in colliders(); these batches are
    // deliberately not opted in via userData.collides. Marking them would collide the trunk of every
    // tree in the batcher — including all 36 belt trees, which the header comment above promises are
    // decorative — and would give each named tree a second, byte-identical box, since colliders()
    // already derives one from the same prims[0] geometry and the same transform.
    const batcher = new KitBatcher();
    const allTrees: TreePlacement[] = [...NAMED_TREES, ...generateFillerTrees()];
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
      const mat = leafMesh.material as THREE.MeshStandardMaterial;
      // Leave the authored diffuse texture alone (it's what makes the foliage read as real leaf
      // clusters instead of a flat blob) and drive the bioluminescent dim/bright toggle entirely
      // through a flat emissive tint. Reusing the diffuse map as an emissive mask was tried first,
      // but it multiplies the emissive color channel-by-channel against the leaf texture — on the
      // kit's red-foliage species (TwistedTree) that leaves almost no green channel to multiply
      // against, so the toggle barely showed. A flat tint responds the same way regardless of the
      // species' authored leaf color, so the whole canopy visibly reacts together, which matters
      // here since this is the player's puzzle-progress feedback.
      mat.emissive = DIM_CANOPY_COLOR.clone();
      mat.emissiveIntensity = 0.8;
      mat.needsUpdate = true;
      this.canopyMats.push(mat);
    }
  }

  private addNPC(x: number, z: number, bodyColor: number, glowColor: number): THREE.Group {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.4, 1.3, 6, 10),
      new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.55, metalness: 0.1 }),
    );
    body.position.y = 1.05;
    group.add(body);
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 12, 12),
      new THREE.MeshStandardMaterial({ color: glowColor, emissive: glowColor, emissiveIntensity: 1 }),
    );
    marker.position.y = 2.05;
    group.add(marker);
    const light = new THREE.PointLight(glowColor, 1.2, 4);
    light.position.y = 2.05;
    group.add(light);
    group.position.set(x, 0.6, z);
    this.scene.add(group);
    return group;
  }

  private buildNPCs(): void {
    const warden = this.addNPC(-3, 3, 0x5a4a6a, 0xd94f6f);
    this.interaction.register({
      object: warden,
      label: 'Speak with the Warden',
      range: 2.4,
      onInteract: () => DialogueSystem.start(WARDEN_DIALOGUE),
    });

    const archivist = this.addNPC(3, 4, 0x4a6a5a, 0x4fd9c8);
    this.interaction.register({
      object: archivist,
      label: 'Speak with the Archivist',
      range: 2.4,
      onInteract: () => DialogueSystem.start(ARCHIVIST_DIALOGUE),
    });
  }

  private buildFragments(): void {
    const fragmentSpots: [number, number, number][] = [
      [-16, 1.4, -3],
      [16, 1.4, -3],
      [-20, 3.2, -8],
    ];
    fragmentSpots.forEach(([x, y, z], idx) => {
      const pillarMat = new THREE.MeshStandardMaterial({ color: 0x2a2418, roughness: 0.8 });
      applyPbr(pillarMat, 'lichen_rock', [1, 1]);

      // The group's origin is the pillar's own base, so getWorldPosition() lands on the pillar. It
      // used to be pinned at y = 0.7 with each child offset by `y - 0.7`, which for the ledge pillar
      // left the origin 2.5 m below the geometry — and InteractionSystem's proximity fallback
      // measures to that origin, so a prompt would fire from a point in mid-air under the pillar
      // rather than from the pillar. World positions are unchanged.
      const pillar = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.22, 10), pillarMat);
      base.position.y = 0.11;
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, 1.0, 8), pillarMat);
      shaft.position.y = 0.22 + 0.5;
      const capital = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.3, 0.18, 10), pillarMat);
      capital.position.y = 0.22 + 1.0 + 0.09;
      pillar.add(base, shaft, capital);
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
      rune.position.set(x, y + 0.9, z);
      rune.rotation.y = Math.PI / 4;
      this.scene.add(rune);

      const entry = KETHRA_LORE_ENTRIES[idx];
      const flagId = `kethra_fragment_${idx + 1}_read`;
      this.interaction.register({
        object: pillar,
        label: `Read Inscription${idx + 1 <= 3 ? ` ${idx + 1}` : ''}`,
        range: 2.2,
        onInteract: () => {
          gameState.setFlag(flagId);
          if (entry) {
            gameState.unlockLog(entry.id);
            gameState.addClue({ id: entry.id, title: entry.title, summary: entry.body.slice(0, 80), source: 'Kethra inscription' });
            gameState.addAttributeXp('archaeology', 1);
            UIManager.toast(`Inscription recorded: ${entry.title}`);
          }
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
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.3), valveMat);
    bracket.position.set(0, 0.65, 0.25);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.6, 10), valveMat);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(0, 0.9, 0.35);
    const valve = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.1, 8, 16), valveMat);
    valve.position.set(0, 0.9, 0);
    valve.rotation.x = Math.PI / 2;
    valveGroup.add(bracket, pipe, valve);
    this.scene.add(valveGroup);
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

    const shrineMat = new THREE.MeshStandardMaterial({ color: 0x4a3a5a, emissive: 0x8a6ad9, emissiveIntensity: 0.5, roughness: 0.6 });
    applyPbr(shrineMat, 'lichen_rock', [1, 1.5]);
    // Same fix as valveGroup above: the group holds the world position, children are relative.
    const shrineGroup = new THREE.Group();
    shrineGroup.position.set(-1.5, 0, 5);
    const shrineBase = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 0.2, 12), shrineMat);
    shrineBase.position.set(0, 0.1, 0);
    const shrineShaft = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.2, 6), shrineMat);
    shrineShaft.position.set(0, 0.8, 0);
    const shrineCapMat = new THREE.MeshStandardMaterial({ color: 0x8a6ad9, emissive: 0x8a6ad9, emissiveIntensity: 1.1, roughness: 0.25, metalness: 0.2 });
    const shrineCap = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), shrineCapMat);
    shrineCap.position.set(0, 1.55, 0);
    shrineGroup.add(shrineBase, shrineShaft, shrineCap);
    this.scene.add(shrineGroup);
    const shrineEntry = KETHRA_LORE_ENTRIES.find((l) => l.id === 'kethra_ritual_record');
    this.interaction.register({
      object: shrineGroup,
      label: 'Examine the Grove Shrine',
      range: 2.2,
      onInteract: () => {
        if (shrineEntry) {
          gameState.unlockLog(shrineEntry.id);
          gameState.addClue({ id: shrineEntry.id, title: shrineEntry.title, summary: shrineEntry.body.slice(0, 80), source: 'Kethra shrine record' });
          UIManager.toast(`Grove record recovered: ${shrineEntry.title}`);
        }
      },
    });
  }

  private buildCreatureArea(): void {
    this.creature.position.set(0, 2.4, -11);
    this.scene.add(this.creature);
    const creatureLight = new THREE.PointLight(0x3fd9a8, 0.9, 6);
    this.creature.add(creatureLight);
    const creatureCore = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 10, 10),
      new THREE.MeshStandardMaterial({ color: 0xd9fff0, emissive: 0xaef5da, emissiveIntensity: 1.4, roughness: 0.15 }),
    );
    this.creature.add(creatureCore);

    const grovePlant = new THREE.Mesh(
      new THREE.SphereGeometry(1.1, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0x3fd98a, emissive: 0x3fd98a, emissiveIntensity: 0.9 }),
    );
    grovePlant.position.set(-4, 2.5, -10);
    grovePlant.userData.dormant = false;
    this.scene.add(grovePlant);
    const groveLight = new THREE.PointLight(0x3fd98a, 1, 7);
    grovePlant.add(groveLight);

    this.interaction.register({
      object: grovePlant,
      label: () => (gameState.hasFlag('kethra_grove_dimmed') ? 'Restore the Grove Light' : 'Dim the Grove Light'),
      range: 2.4,
      onInteract: () => {
        const dimmed = gameState.hasFlag('kethra_grove_dimmed');
        if (dimmed) {
          gameState.data.flags = gameState.data.flags.filter((f) => f !== 'kethra_grove_dimmed');
          (grovePlant.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.9;
          groveLight.intensity = 1;
          UIManager.toast('The grove light returns. The guardian stirs.');
        } else {
          gameState.setFlag('kethra_grove_dimmed');
          (grovePlant.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.15;
          groveLight.intensity = 0.15;
          UIManager.toast('The grove dims. The guardian grows still and drowsy.');
        }
      },
    });
  }

  private buildMechanismChamber(): void {
    this.mechanismCore = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.3, 0),
      new THREE.MeshStandardMaterial({ color: 0x8a7bd9, emissive: 0x5a4fd9, emissiveIntensity: 1.2, roughness: 0.2, metalness: 0.4 }),
    );
    this.mechanismCore.position.set(0, 2.2, -18);
    this.scene.add(this.mechanismCore);

    this.mechanismLight = new THREE.PointLight(0x8a7bd9, 2.5, 10);
    this.mechanismLight.position.copy(this.mechanismCore.position);
    this.scene.add(this.mechanismLight);

    this.waterPool = new THREE.Mesh(
      new THREE.RingGeometry(1.6, 3.4, 32),
      new THREE.MeshStandardMaterial({
        color: 0x3f7fb0,
        emissive: 0x2a5f8a,
        emissiveIntensity: 0.3,
        roughness: 0.15,
        metalness: 0.6,
        transparent: true,
        opacity: 0.12,
      }),
    );
    this.waterPool.rotation.x = -Math.PI / 2;
    this.waterPool.position.set(0, 1.42, -18);
    this.scene.add(this.waterPool);

    const consoleMat = new THREE.MeshStandardMaterial({ color: 0x2a2438, roughness: 0.5, metalness: 0.3 });
    applyPbr(consoleMat, 'metal_plate_02', [1, 1]);
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x3a3448, roughness: 0.4, metalness: 0.4 });
    applyPbr(panelMat, 'metal_plate', [0.6, 0.6]);

    const consoleGroup = new THREE.Group();
    const housing = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1, 0.8), consoleMat);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.55, 0.1), panelMat);
    panel.position.set(0, 0.15, 0.44);
    panel.rotation.x = -0.25;
    const trimL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.02, 0.82), panelMat);
    trimL.position.set(-0.78, 0, 0);
    const trimR = trimL.clone();
    trimR.position.set(0.78, 0, 0);
    consoleGroup.add(housing, panel, trimL, trimR);
    consoleGroup.position.set(0, 1.9, -16);
    this.scene.add(consoleGroup);

    this.interaction.register({
      object: consoleGroup,
      label: 'Access the Cistern Heart',
      range: 3,
      onInteract: () => {
        if (!gameState.hasFlag('kethra_grove_dimmed') && !gameState.hasFlag('kethra_mechanism_solved')) {
          UIManager.toast('The guardian is too alert to risk this now. Something nearby keeps it awake.');
          return;
        }
        this.puzzle.open();
      },
    });

    const carvingMat = new THREE.MeshStandardMaterial({ color: 0x1c1810, roughness: 0.9 });
    applyPbr(carvingMat, 'lichen_rock', [1, 1.5]);
    const carvingGroup = new THREE.Group();
    const plaque = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.6, 0.2), carvingMat);
    const frameTop = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.14, 0.28), carvingMat);
    frameTop.position.y = 0.92;
    const frameBottom = frameTop.clone();
    frameBottom.position.y = -0.92;
    const frameLeft = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.9, 0.28), carvingMat);
    frameLeft.position.x = -0.65;
    const frameRight = frameLeft.clone();
    frameRight.position.x = 0.65;
    carvingGroup.add(plaque, frameTop, frameBottom, frameLeft, frameRight);
    carvingGroup.position.set(-2.6, 2.3, -17.5);
    carvingGroup.rotation.y = 0.3;
    this.scene.add(carvingGroup);
    const kindlingEntry = KETHRA_LORE_ENTRIES.find((l) => l.id === 'kethra_kindling_record');
    this.interaction.register({
      object: carvingGroup,
      label: 'Read the Last Kindling Carving',
      range: 2.8,
      onInteract: () => {
        if (kindlingEntry) {
          gameState.unlockLog(kindlingEntry.id);
          gameState.addClue({ id: kindlingEntry.id, title: kindlingEntry.title, summary: kindlingEntry.body.slice(0, 80), source: 'Deep chamber carving' });
          gameState.addAttributeXp('insight', 1);
          UIManager.toast(`Carving deciphered: ${kindlingEntry.title}`);
        }
      },
    });
  }

  private buildReturnPad(): void {
    const padMat = new THREE.MeshStandardMaterial({ color: 0x555f6a, emissive: 0x2a7fd9, emissiveIntensity: 0.5, metalness: 0.6, roughness: 0.4 });
    applyPbr(padMat, 'metal_plate', [2, 2]);
    const padGroup = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.15, 20), padMat);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.06, 8, 24), padMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.08;
    const centerMat = new THREE.MeshStandardMaterial({ color: 0x2a7fd9, emissive: 0x4fa9ff, emissiveIntensity: 1.0, roughness: 0.3 });
    const center = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 20), centerMat);
    center.position.y = 0.1;
    padGroup.add(pad, rim, center);
    // The landing terrace's walking surface is at 0.38 and the pad's tallest part reached only 0.24,
    // so the whole thing sat inside the terrace: the player arrived on an invisible pad and got a
    // "Return to Ship" prompt with nothing under their feet. Sitting it on the surface leaves the
    // main disc 0.075 proud and the rim 0.14 — both under the 0.25 step-over threshold, so it stays
    // walkable rather than becoming an obstacle.
    padGroup.position.set(0, 0.38, 18);
    this.scene.add(padGroup);
    this.interaction.register({
      object: padGroup,
      label: 'Return to Ship',
      range: 2.6,
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
      // The four boulders dressing the chamber approach are pulled to its edges and cut to about a
      // third the footprint. The approach slab is only 8 units wide and Rock_Medium runs 3-5 units
      // across at the old scales, so as solids these four met in the middle and sealed the corridor
      // — measured, the only gap left was a single 0.25-wide cell, and "Access the Cistern Heart"
      // (which opens the mechanism puzzle) was unreachable. They now leave a ~3.6-unit clear lane
      // down the centre. The last two also drop from y = 2.4 to 1.5: the slab's surface is 1.48, so
      // they had been floating 0.9 above it.
      [-3.2, 1.5, -9.4, 0.45],
      [3.3, 1.5, -9.3, 0.45],
      // Was (-20.4, 2.7, -6.2): that is the one approach corridor to the secret ledge, and
      // Rock_Medium reaches 2.59 units from its own origin before scaling, so as a solid boulder it
      // sealed the ledge off no matter how the stair was routed. Moved onto the open west terrace;
      // it stays clear of Inscription 1's pillar at (-16, -3) and of the stair's x -21.7..-19.5.
      [-18.4, 0.9, 0.5, 0.85],
      [-19.6, 2.7, -9.6, 0.8],
      [3.2, 1.5, -12.9, 0.45],
      [-3.1, 1.5, -12.2, 0.45],
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
      [-1.6, 1.16, -13],
      [1.5, 1.16, -13.2],
    ];
    for (const [x, y, z] of pathSpots) {
      batcher.add(pick(ROCK_PATHS), {
        position: new THREE.Vector3(x, y, z),
        yaw: groveRandom() * Math.PI * 2,
        scale: jitter(0.9, 1.2),
      });
    }

    // The twelve hand-placed boulders are landmarks the player walks around; the flat path stones
    // laid between them are trodden on.
    const built = await batcher.flush(this.scene);
    for (const [species, meshes] of built) {
      if (ROCKS_BIG.includes(species) && meshes[0]) meshes[0].userData.collides = true;
    }
  }

  private async buildClutter(): Promise<void> {
    const batcher = new KitBatcher();
    // Every interaction anchor, the spawn (which isn't one), and the four connecting ramps.
    // buildClutter runs after every builder that registers a target and after buildTerraces, so
    // this stays correct as targets and ramps are added.
    const keepClear = [...this.interaction.anchorPositions(), new THREE.Vector3(0, 0, 18), ...this.rampAnchors];
    const glowMatA = new THREE.MeshStandardMaterial({ color: 0x3fd98a, emissive: 0x3fd98a, emissiveIntensity: 0.8, roughness: 0.4 });
    const glowMatB = new THREE.MeshStandardMaterial({ color: 0x4fd9c8, emissive: 0x4fd9c8, emissiveIntensity: 0.8, roughness: 0.4 });

    // xMin, xMax, zMin, zMax, y (terrace top surface height), item count
    const clutterZones: [number, number, number, number, number, number][] = [
      [-6, 6, -5, 8, 0.38, 18],
      [12, 20, -6, 2, 0.98, 16],
      [-20, -12, -6, 2, 0.98, 16],
      [-5, 5, 12, 20, 0.38, 14],
      [-6, -3.6, -19, -9, 1.48, 8],
      [3.6, 6, -19, -9, 1.48, 8],
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
          const glow = new THREE.Mesh(
            new THREE.IcosahedronGeometry(0.1 + groveRandom() * 0.08, 0),
            groveRandom() > 0.5 ? glowMatA : glowMatB,
          );
          glow.position.set(x, y + 0.1, z);
          this.scene.add(glow);
        }
      }
    }

    const built = await batcher.flush(this.scene);
    for (const [species, meshes] of built) {
      if (ROCKS_BIG.includes(species) && meshes[0]) meshes[0].userData.collides = true;
    }
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
    const mat = new THREE.PointsMaterial({ color: 0x9fe8c8, size: 0.06, transparent: true, opacity: 0.6 });
    const motes = new THREE.Points(geo, mat);
    motes.name = 'motes';
    this.scene.add(motes);

    // Layered haze walls beyond the far terraces, for depth cueing on top of the exponential
    // fog: near layer tinted toward the canopy's bioluminescent teal, far layer toward the
    // background navy, so distance reads as a gradient rather than a flat fog cutoff.
    const hazeTex = buildHazeTexture();
    const hazeLayers: [number, number, number, number, number, number][] = [
      // z, y, width, height, color, opacity
      [-30, 8, 90, 22, 0x2a6a5a, 0.35],
      [-46, 10, 130, 28, 0x16324a, 0.4],
    ];
    for (const [z, y, width, height, color, opacity] of hazeLayers) {
      const hazeMat = new THREE.MeshBasicMaterial({
        map: hazeTex,
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        side: THREE.DoubleSide,
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
    moon.shadow.camera.bottom = -30;
    moon.shadow.bias = -0.0015;
    this.scene.add(moon);

    // Rim light: warm, positioned behind the canopy relative to the player's usual approach,
    // so trunk and canopy silhouettes pick up an edge highlight against the dark fog.
    const rim = new THREE.DirectionalLight(0xd9a15f, 0.55);
    rim.position.set(-14, 6, -22);
    this.scene.add(rim);

    // Fill lights: cool, keep shadowed faces from crushing to black and spread bioluminescent
    // color across both the east and west terraces instead of just the center.
    const fillA = new THREE.PointLight(0x8ad9b8, 2, 20);
    fillA.position.set(0, 5, 4);
    this.scene.add(fillA);
    const fillB = new THREE.PointLight(0x5f8ad9, 1.4, 22);
    fillB.position.set(-16, 6, -4);
    this.scene.add(fillB);
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
    boxes.push(makeCollider(0, -18, 1, 1, 3.5));
    // The creature drifts on its own path every frame (see update()), so a box baked from where it
    // happens to be at load would block empty air a second later.
    boxes.push(...buildKethraColliders(this.scene, { floorMeshes: this.floorMeshes, animated: [this.creature] }));
    return boxes;
  }

  private setCanopyBright(bright: boolean): void {
    const target = bright ? BRIGHT_CANOPY_COLOR : DIM_CANOPY_COLOR;
    for (const mat of this.canopyMats) {
      mat.emissive.copy(target);
      mat.emissiveIntensity = bright ? 1.8 : 0.8;
    }
    const waterMat = this.waterPool.material as THREE.MeshStandardMaterial;
    waterMat.opacity = bright ? 0.55 : 0.12;
    waterMat.emissiveIntensity = bright ? 0.9 : 0.3;
  }

  update(dt: number, elapsed: number): void {
    this.player.update(dt);
    this.interaction.update(this.camera);

    this.creatureTime += dt;
    const dormant = gameState.hasFlag('kethra_grove_dimmed') || gameState.hasFlag('kethra_mechanism_solved');
    const mat = this.creature.material as THREE.MeshStandardMaterial;
    if (dormant) {
      mat.emissiveIntensity = 0.4;
      this.creature.position.y = 2.0 + Math.sin(this.creatureTime * 0.5) * 0.05;
    } else {
      mat.emissiveIntensity = 1.0 + Math.sin(elapsed * 3) * 0.25;
      this.creature.position.x = Math.sin(this.creatureTime * 0.6) * 4;
      this.creature.position.y = 2.4 + Math.sin(this.creatureTime * 1.4) * 0.3;
    }

    this.mechanismCore.rotation.y += dt * 0.4;
    this.mechanismLight.intensity = gameState.hasFlag('kethra_mechanism_solved')
      ? 4 + Math.sin(elapsed * 2) * 0.5
      : 2.5;

    const motes = this.scene.getObjectByName('motes') as THREE.Points | undefined;
    if (motes) motes.rotation.y += dt * 0.01;
  }

  onResize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    for (const u of this.unsub) u();
    this.stopAmbient?.();
    this.interaction.clear();
    this.scene.traverse((obj) => {
      // Kit-sourced InstancedMesh geometries are shared, cached templates (src/planets/kethra/kit.ts)
      // reused across scene visits — disposing them here would leave the cache holding freed GPU
      // buffers and break the scene on a return trip to Kethra. batchStaticGeometry.ts documents the
      // same InstancedMesh-vs-shared-geometry hazard for the ship interior's kit.
      if ((obj as THREE.InstancedMesh).isInstancedMesh) return;
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
  }
}
