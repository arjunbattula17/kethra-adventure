import * as THREE from 'three';
import { displayFontsReady } from '../../core/loadFonts';
import { damp, dampVec3, motion } from '../../motion';
import type { GameScene } from '../../core/Engine';
import { PlayerController } from '../../player/PlayerController';
import { InteractionSystem } from '../../player/InteractionSystem';
import { UIManager } from '../../ui/UIManager';
import { gameState } from '../../core/GameState';
import { bus } from '../../core/EventBus';
import { disposeSceneTextures } from '../../core/disposeSceneTextures';
import { getSharedEnvironment } from '../../core/Environment';
import { DialogueSystem } from '../../dialogue/DialogueSystem';
import { AudioSystem } from '../../audio/AudioSystem';
import { Figure } from '../../characters/Figure';
import { placeKitPiece, preloadKit } from '../../ship/interior/kit';
import { groundKitPiece } from '../../ship/interior/walls';
import { batchStaticGeometry } from '../../ship/interior/batchStaticGeometry';
import { buildShipHull } from '../../galaxy/shipHull';
import { buildSpaceSky } from '../../galaxy/spaceSky';
import type { SpaceSky } from '../../galaxy/spaceSky';
import { GRADES } from '../../core/GradeGlowPass';
import { buildPlanetInstance } from '../../galaxy/planetShader';
import type { PlanetInstance } from '../../galaxy/planetShader';
import { PLANETS } from '../../galaxy/planetData';
import { applyPbr } from '../../core/TextureLibrary';
import { registerMiniGame } from '../../debug/hooks';
import { varroDialogue, daceDialogue } from './vessekDialogue';
import { VESSEK_ENTRIES } from './vessekLore';
import { RingBus, CIRCUITS } from './bus';
import type { BusEvent, CircuitId } from './bus';
import { BusWorld } from './busWorld';
import { buildRooms, isOpenBay, hallOpenings } from './rooms';
import type { Rooms, Door } from './rooms';
import { buildDressing } from './dressing';
import type { Dressing } from './dressing';
import * as L from './layout';
import { LAMP_COLORS } from './anchorage';

/**
 * Level 3: Vessek Anchorage, expanded (LORE.md, "Level 3"; docs/DESIGN.md §6).
 *
 * The Lantern Bay, the oldest hull in a ring of twenty-one stranded ships, is the town hall; the
 * school hold, the hydroponics tanker and the aft junction are lashed hulls around it, joined by
 * tubes, with Dace's ducts in the gaps. One ring bus carries six units for all of it (bus.ts), and
 * its levers, gauges and conduits are in the rooms they serve (busWorld.ts). The beats:
 *   Ki   Dace's lamp board: light the school by switching something else off.
 *   Shō  Varro's deal: get the aft junction back on the bus, through the ducts.
 *   Ten  The rehearsal pulse, two years early: every grid browns out, and the lamps that reset
 *        themselves trip the bus whenever it's loaded. The frost clock starts.
 *   Ketsu Lock the auto-resets out in the ducts, bring up pumps, heaters and scrubbers inside six
 *        units, and the grow lights come back deck by deck. Then the ledger and the alloy.
 */

const HALF_W = 8;
const HALF_D = 12;
const WALL_FACE_X = 7.565;
const WALL_FACE_Z = 11.565;
const SPAWN = new THREE.Vector3(L.SPAWN.x, L.SPAWN.y, L.SPAWN.z);
/** The pulse's own beat, before the player has control back and the frost starts. */
const PULSE_BEAT = 6.2;

/** Lamp groups: most follow a circuit; the grow lights follow the bay's power, the junction its reset. */
type LampGroup = 'lamps' | 'dock' | 'school' | 'grow' | 'junction' | 'emergency';

interface Lamp {
  group: LampGroup;
  light: THREE.PointLight | null;
  mat: THREE.MeshStandardMaterial | null;
  base: number;
  /** The emissive intensity that means "on". */
  glow: number;
  goal: number;
  level: number;
  /** Seconds before it starts toward a new goal (the pulse browns the ring out deck by deck). */
  delay: number;
  phase: number;
}

interface TimelineStep {
  at: number;
  run: () => void;
}

function canvasTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A stencilled sign in the Anchorage's patchwork style: each crew painted its own. */
function signTexture(text: string, sub: string, bg: string, fg: string): THREE.CanvasTexture {
  return canvasTex(512, 160, (ctx) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 160);
    ctx.strokeStyle = fg;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, 492, 140);
    ctx.globalAlpha = 1;
    ctx.fillStyle = fg;
    ctx.font = 'bold 58px Rajdhani, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, 256, 80);
    ctx.font = '600 26px Rajdhani, sans-serif';
    ctx.globalAlpha = 0.75;
    ctx.fillText(sub, 256, 124);
    // Wear: a few scuffs, so the paint looks lived with.
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#000';
    for (let i = 0; i < 40; i++) ctx.fillRect((i * 97) % 512, (i * 53) % 160, 6 + (i % 5) * 4, 2);
  });
}

export class VessekScene implements GameScene {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.05, 2500);
  player: PlayerController;
  interaction = new InteractionSystem();
  readonly kind = 'VessekScene';
  readonly grade = GRADES.vessek;
  private sky!: SpaceSky;
  readonly staticShadows = true;
  onDepart: (() => void) | null = null;
  /** Public for the tests and the harness: the ring's bus, and its frost clock. */
  readonly bus = new RingBus();

  private floor!: THREE.Mesh;
  private rooms!: Rooms;
  private dressing!: Dressing;
  private busWorld!: BusWorld;
  private readonly noMerge = new Set<THREE.Object3D>();
  private readonly animated = new Set<THREE.Material>();
  private lamps: Lamp[] = [];
  private emergency: THREE.MeshStandardMaterial[] = [];
  private shipLamps: { mat: THREE.MeshBasicMaterial; base: THREE.Color }[] = [];
  private hullMats: THREE.MeshStandardMaterial[] = [];
  private hemi!: THREE.HemisphereLight;
  private key!: THREE.DirectionalLight;
  private planetLight!: THREE.DirectionalLight;
  private whiteSky!: THREE.Mesh;
  private skyMat!: THREE.MeshBasicMaterial;
  private planet: PlanetInstance | null = null;
  private varro!: Figure;
  private dace!: Figure;
  private timeline: TimelineStep[] = [];
  private timelineClock = 0;
  /** The pulse's beat is playing; the frost waits for it. */
  private pulseBeat = false;
  /** The grow lights coming back row by row after the bay is saved (seconds since). */
  private dawn = -1;
  private doorTimers = new Map<Door, number>();
  private unsub: Array<() => void> = [];
  private unregister: (() => void) | null = null;
  private stopAmbient: (() => void) | null = null;
  private stopMusic: (() => void) | null = null;
  private eye = new THREE.Vector3();
  private relightShips = false;

  constructor() {
    this.player = new PlayerController(this.camera, SPAWN.clone());
  }

  async init(): Promise<void> {
    // Signage and screens are drawn onto canvases in the game's own faces: wait for them, or the
    // textures bake the fallback font for the whole visit.
    await displayFontsReady();
    UIManager.setLookPromptEnabled(true);
    this.scene.background = new THREE.Color(0x020308);
    this.scene.environment = getSharedEnvironment();
    this.scene.environmentIntensity = 0.45;
    this.scene.fog = new THREE.FogExp2(0x06080c, 0.012);

    if (!gameState.data.journalLogs.some((l) => l.id === VESSEK_ENTRIES[0].id)) {
      gameState.data.journalLogs.push(...VESSEK_ENTRIES.map((l) => ({ ...l })));
    }
    this.restoreBus();

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x5a6068, roughness: 0.7, metalness: 0.45 });
    applyPbr(wallMat, 'ship_wall', [1, 1]);
    const ceilMat = new THREE.MeshStandardMaterial({ color: 0x1a1e23, roughness: 0.85, metalness: 0.4 });

    this.buildFloorAndCeiling(ceilMat);
    this.buildOutside();
    this.buildLighting();
    this.buildPeople();
    const [rooms, dressing, hallColliders] = await Promise.all([
      buildRooms(this.scene, { wall: wallMat, ceiling: ceilMat }),
      buildDressing(this.scene),
      hallOpenings(this.scene, wallMat),
      this.buildShell(),
      this.buildHallDressing(),
      this.buildRing(),
    ]);
    this.rooms = rooms;
    this.dressing = dressing;
    for (const o of rooms.noMerge) this.noMerge.add(o);
    this.wireDressing();
    this.busWorld = new BusWorld({
      scene: this.scene,
      interaction: this.interaction,
      bus: this.bus,
      noMerge: this.noMerge,
      animated: this.animated,
      leversLive: () => !this.pulseBeat,
      onEvent: (e) => this.onBusEvent(e),
    });
    this.buildInteractions();

    this.scene.add(this.player.rig);
    this.player.setFloorTargets([this.floor, ...rooms.floors]);
    this.player.setColliders([...hallColliders, ...this.hallFurniture(), ...rooms.colliders, ...dressing.colliders]);
    this.syncDoorColliders();
    this.player.ladders = rooms.ladders;
    this.player.teleport(SPAWN, 0);
    this.player.setRespawn(SPAWN, 0);
    this.player.fallResetY = -5;
    this.player.onFootstep = () => AudioSystem.playFootstep('metal');
    this.player.onLand = (s) => AudioSystem.playLand(s);
    this.stopAmbient = AudioSystem.startAmbient(58, 0.02);
    this.stopMusic = AudioSystem.startMusic('vessek');
    this.interaction.onPromptChange = (label) => UIManager.setPrompt(label);
    this.unsub.push(bus.on('player:shake', (amount: number) => this.player.addShake(amount)));

    // Merge the static kit and dressing into batches, as the Wren does.
    this.player.rig.traverse((o) => this.noMerge.add(o));
    for (const f of [this.varro, this.dace]) f.group.traverse((o) => this.noMerge.add(o));
    batchStaticGeometry({ scene: this.scene, noMerge: this.noMerge, animatedMaterials: this.animated });

    if (gameState.hasFlag('vessek_pulse') && !gameState.hasFlag('vessek_power_restored')) this.setEmergency(1);
    this.settleLamps();
    gameState.setObjective(this.currentObjective());
    bus.emit('scene:vessek:ready');
  }

  /** The bus as the save left it: before the pulse, in it (with the lockouts thrown), or after. */
  private restoreBus(): void {
    const b = this.bus;
    if (gameState.hasFlag('vessek_deal_message') || gameState.hasFlag('vessek_lockout_lamps')) b.lockOut('lamps');
    if (gameState.hasFlag('vessek_lockout_dock')) b.lockOut('dock');
    if (gameState.hasFlag('vessek_power_restored')) {
      b.pulse();
      for (const id of ['pumps', 'heaters', 'scrubbers'] as const) b.throwLever(id, true);
      b.update(0);
    } else if (gameState.hasFlag('vessek_pulse')) {
      b.pulse();
    } else if (gameState.hasFlag('vessek_school_lit')) {
      b.throwLever('fans', false);
      b.throwLever('school', true);
    }
  }

  private currentObjective(): string {
    const f = (x: string) => gameState.hasFlag(x);
    if (f('vessek_alloy_given')) return 'Return to the Wren and repair long-range comms.';
    if (f('vessek_ledger_read')) return 'Tell Harbormaster Varro what you found.';
    if (f('vessek_power_restored')) return 'Read the Anchorage ledger by Varro’s desk.';
    if (f('vessek_pulse')) return 'Save the hydroponics bay: lock out the lamps that reset themselves, then bring up the pumps, heaters and scrubbers within six units.';
    if (f('vessek_junction_reset')) return 'Tell Harbormaster Varro the junction is back on the bus.';
    if (f('vessek_varro_met')) return f('vessek_school_lit') || !this.bus.isOn('fans') ? 'Reach the aft junction through Dace’s ducts and put it back on the bus.' : 'Find Dace in the school hold, west of the hall: the ducts need their fans off.';
    return 'Find the harbormaster in the Lantern Bay.';
  }

  // ---------------------------------------------------------------- construction

  private buildFloorAndCeiling(ceilMat: THREE.Material): void {
    // The walking surface: one invisible slab the player's floor ray lands on. The visible deck is
    // kit plating laid over it in buildShell.
    this.floor = new THREE.Mesh(new THREE.BoxGeometry(HALF_W * 2, 0.2, HALF_D * 2), new THREE.MeshBasicMaterial({ visible: false }));
    this.floor.position.y = -0.1;
    this.scene.add(this.floor);
    this.noMerge.add(this.floor);
    // Ceiling: dark plating with two long cable trays, low enough to feel like the inside of a hull.
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, HALF_D * 2), ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = 5;
    this.scene.add(ceil);
    const trayMat = new THREE.MeshStandardMaterial({ color: 0x2c3339, roughness: 0.6, metalness: 0.7 });
    for (const x of [-2.6, 2.6]) {
      const tray = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, HALF_D * 2 - 1), trayMat);
      tray.position.set(x, 4.6, 0);
      this.scene.add(tray);
    }
  }

  private async buildShell(): Promise<void> {
    const pieces = ['Platform_Simple', 'Platform_DarkPlates', 'Platform_Metal', 'WallAstra_Straight', 'TopAstra_Straight', 'TopCables_Straight_Hanging', 'WallWindow_Straight', 'TopWindow_Straight', 'WallAstra_Corner_Square_Inner', 'TopCables_Corner_Square_Inner', 'Door_Frame_Square', 'Door_Metal', 'Column_Pipes'];
    await preloadKit(pieces);
    const jobs: Promise<THREE.Object3D>[] = [];
    const place = (name: string, pos: [number, number, number], yaw = 0) => jobs.push(placeKitPiece(this.scene, name, pos, yaw).then(groundKitPiece));
    const open = (wall: L.Bay['wall'], at: number) => isOpenBay({ room: 'hall', wall, at });

    // Deck: plating in three finishes that mark the zones (collar, concourse, work areas).
    for (const x of [-6, -2, 2, 6]) {
      for (const z of [-10, -6, -2, 2, 6, 10]) {
        const name = z >= 6 ? 'Platform_Metal' : x < -2 || (x > 2 && z < -2) ? 'Platform_DarkPlates' : 'Platform_Simple';
        place(name, [x, 0.001, z]);
      }
    }
    // Long walls: west is solid hull with hanging cable runs (and the tube to the school); east is
    // the window gallery.
    for (const z of [-6, -2, 2, 6]) {
      if (!open('west', z)) {
        place('WallAstra_Straight', [-(HALF_W - 2), 0, z], 0);
        place('TopCables_Straight_Hanging', [-(HALF_W - 2), 0, z], 0);
      }
      place('WallWindow_Straight', [HALF_W - 2, 0, z], Math.PI);
      place('TopWindow_Straight', [HALF_W - 2, 0, z], Math.PI);
    }
    // End walls. The north wall opens on the tanker's tube and the hall duct; the south wall's east
    // bay is the docking collar's airlock to the Wren.
    for (const x of [-2, 2]) {
      if (open('north', x)) continue;
      place('WallAstra_Straight', [x, 0, -(HALF_D - 2)], -Math.PI / 2);
      place('TopAstra_Straight', [x, 0, -(HALF_D - 2)], -Math.PI / 2);
    }
    place('WallAstra_Straight', [-2, 0, HALF_D - 2], Math.PI / 2);
    place('TopAstra_Straight', [-2, 0, HALF_D - 2], Math.PI / 2);
    place('Door_Frame_Square', [2, 0, WALL_FACE_Z], 0);
    place('Door_Metal', [4.1, 0, WALL_FACE_Z + 0.05], 0);
    // Corners, same yaw table as the Wren (walls.ts).
    const cornerYaw: Record<string, number> = { '-1,-1': 0, '-1,1': Math.PI / 2, '1,-1': -Math.PI / 2, '1,1': Math.PI };
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const pos: [number, number, number] = [sx * (WALL_FACE_X - 3.565), 0, sz * (WALL_FACE_Z - 3.565)];
        place('WallAstra_Corner_Square_Inner', pos, cornerYaw[`${sx},${sz}`]);
        place('TopCables_Corner_Square_Inner', pos, cornerYaw[`${sx},${sz}`]);
      }
    }
    // Pipe risers against the long walls, one per bay seam, so the concourse floor stays open.
    for (const [x, z] of [[-6.9, -4], [-6.9, 8.6], [6.6, -8], [6.6, 8]]) place('Column_Pipes', [x, 0, z]);
    await Promise.all(jobs);
    // The kit's window glass is authored opaque grey. Clear it so the ring outside shows through.
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
        if (mat.name === 'M_Glass' && mat instanceof THREE.MeshStandardMaterial && !mat.transparent) {
          mat.color.set(0x0c1a20);
          mat.transparent = true;
          mat.opacity = 0.16;
          mat.roughness = 0.05;
          mat.metalness = 0.3;
          mat.depthWrite = false;
          mat.needsUpdate = true;
        }
      }
      if ((m.material as THREE.Material)?.name === 'M_Glass') m.castShadow = false;
    });

    // The airlock sign, in the Wren's own stencil: this is the way home.
    const airlock = signTexture('WREN-01', 'EAST CLAMP · DOCKED', '#1d2126', '#d9a441');
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.69), new THREE.MeshStandardMaterial({ map: airlock, emissive: 0xffffff, emissiveMap: airlock, emissiveIntensity: 0.35, roughness: 0.7 }));
    sign.position.set(2, 4.35, WALL_FACE_Z - 0.3);
    sign.rotation.y = Math.PI;
    this.scene.add(sign);
    // The hall's own name, painted over the old Lantern Bay registry; and each hatch's.
    const signs: [string, string, number, number, number, number][] = [
      ['LANTERN BAY', 'HARBORMASTER · LEDGER · ALL CREWS', -WALL_FACE_X + 0.05, 3.7, -1, Math.PI / 2],
      ['SCHOOL', 'THE HOLD · MIND THE LITTLE ONES', -WALL_FACE_X + 0.05, 3.9, 6, Math.PI / 2],
      ['TANKER', 'HYDROPONICS · KEEP SHUT', -2, 3.9, -WALL_FACE_Z + 0.05, 0],
    ];
    for (const [text, sub, x, y, z, yaw] of signs) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(text === 'LANTERN BAY' ? 3.4 : 2.2, text === 'LANTERN BAY' ? 1.06 : 0.69), new THREE.MeshStandardMaterial({ map: signTexture(text, sub, '#2a2420', '#e8dcc4'), roughness: 0.8 }));
      m.position.set(x, y, z);
      m.rotation.y = yaw;
      this.scene.add(m);
    }
  }

  private async buildHallDressing(): Promise<void> {
    const props = ['Prop_Crate3', 'Prop_Crate4', 'Prop_Barrel_Large', 'Prop_Chest', 'Prop_AccessPoint', 'Prop_Cable_1', 'Prop_Light_Floor', 'Prop_Fan_Small', 'Prop_Fan_Small_Propeller', 'Prop_PipeHolder'];
    await preloadKit(props);
    const jobs: Promise<THREE.Object3D>[] = [];
    const place = (name: string, pos: [number, number, number], yaw = 0, scale = 1) =>
      jobs.push(placeKitPiece(this.scene, name, pos, yaw, scale).then(groundKitPiece));

    // Harbormaster's desk: crates lashed together under a salvaged console. The Anchorage builds
    // furniture out of cargo.
    place('Prop_Chest', [-3.3, 0, -1.25], 0.06);
    place('Prop_Chest', [-1.8, 0, -1.3], -0.04);
    place('Prop_AccessPoint', [-1.4, -0.4, -1.4], Math.PI / 2);
    place('Prop_Crate3', [-5.9, 0.5, -3.2], 0.4);
    place('Prop_Barrel_Large', [-6.6, 0, -2.2]);
    // Cargo along the collar and in the north-west, where the grow tables stood before the tanker.
    for (const [x, z, yaw] of [[-6.4, 9.8, 0.2], [-5.3, 10.4, 0.8], [6.3, 8.4, 0.5], [-6.5, -9.4, 0.3], [-5.2, -10.4, -0.5]] as const) {
      place('Prop_Crate3', [x, 0.5, z], yaw);
    }
    place('Prop_Chest', [-3.4, 0, 10.6], 0.1);
    place('Prop_Barrel_Large', [6.6, 0, 6.7]);
    place('Prop_Barrel_Large', [6.9, 0, 7.4]);
    place('Prop_Cable_1', [0.5, 0.01, 7.4], 1.2);
    place('Prop_Cable_1', [3.6, 0.01, -6.8], -0.4);
    // Floor lights along the docking collar (the dock lights circuit).
    for (const x of [-4, 0, 4]) place('Prop_Light_Floor', [x, 0.01, 7.2]);
    place('Prop_PipeHolder', [5.2, 0, -10.9], 0);
    await Promise.all(jobs);
    this.buildLedgerLectern();
    this.buildRingPlate();
  }

  /** The Kindling ring plate, under a floor grate by the north wall. */
  private buildRingPlate(): void {
    const plate = new THREE.Mesh(
      new THREE.CircleGeometry(0.7, 8),
      new THREE.MeshStandardMaterial({
        color: 0x6b5a3a,
        metalness: 0.8,
        roughness: 0.35,
        emissive: 0x7be0a0,
        emissiveIntensity: 0.25,
        emissiveMap: canvasTex(256, 256, (ctx) => {
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, 256, 256);
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.arc(128, 128, 96, 0, Math.PI * 2);
          ctx.moveTo(128, 32);
          ctx.lineTo(128, 224);
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            ctx.moveTo(128 + Math.cos(a) * 50, 128 + Math.sin(a) * 50);
            ctx.lineTo(128 + Math.cos(a) * 82, 128 + Math.sin(a) * 82);
          }
          ctx.stroke();
        }),
      }),
    );
    plate.rotation.x = -Math.PI / 2;
    plate.position.set(2.2, 0.02, -8.6);
    this.scene.add(plate);
    this.noMerge.add(plate);
    const grate = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.85, 8), new THREE.MeshStandardMaterial({ color: 0x2a2f34, metalness: 0.8, roughness: 0.5 }));
    grate.rotation.x = -Math.PI / 2;
    grate.position.set(2.2, 0.025, -8.6);
    this.scene.add(grate);
    const plateEntry = VESSEK_ENTRIES.find((e) => e.id === 'vessek_ring_plate')!;
    this.interaction.register({
      object: plate,
      label: () => (gameState.data.attributes.archaeology >= 2 ? 'Read the plate under the grate' : 'A plate under the grate (archaeology 2)'),
      range: 2.2,
      onInteract: () => {
        if (gameState.data.attributes.archaeology < 2) {
          UIManager.toast('Kindling script, like Kethra’s carvings. You can’t read enough of it yet (archaeology 2).');
          AudioSystem.playFail();
          return;
        }
        const first = !gameState.hasFlag('vessek_plate_read');
        gameState.setFlag('vessek_plate_read');
        gameState.unlockLog(plateEntry.id);
        gameState.addClue({ id: plateEntry.id, title: plateEntry.title, summary: 'The ring answers the Hearts; the Hearts answer the Choir.', source: 'Anchorage ring plate' });
        if (first) {
          gameState.addAttributeXp('archaeology', 1);
          AudioSystem.playCollect();
        }
        UIManager.showDocument(plateEntry.title, plateEntry.body);
      },
    });
  }

  private buildLedgerLectern(): void {
    const g = new THREE.Group();
    g.position.set(-5.2, 0, 0.6);
    g.rotation.y = Math.PI / 2 - 0.3;
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 1.05, 6), new THREE.MeshStandardMaterial({ color: 0x3a3028, roughness: 0.7, metalness: 0.3 }));
    stand.position.y = 0.52;
    g.add(stand);
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.06, 0.55), new THREE.MeshStandardMaterial({ color: 0x2a221c, roughness: 0.8 }));
    top.position.y = 1.08;
    top.rotation.x = -0.3;
    g.add(top);
    const pageTex = canvasTex(256, 160, (ctx) => {
      ctx.fillStyle = '#e8dcc4';
      ctx.fillRect(0, 0, 256, 160);
      ctx.fillStyle = '#4a3f33';
      for (let i = 0; i < 12; i++) {
        const y = 16 + i * 11;
        ctx.fillRect(12, y, 90 + ((i * 37) % 30), 2);
        ctx.fillRect(140, y, 70 + ((i * 53) % 40), 2);
      }
      ctx.fillStyle = '#8a2d21';
      ctx.fillRect(140, 16 + 11 * 11, 100, 3);
    });
    const cover = new THREE.MeshStandardMaterial({ color: 0x5a3b24 });
    const book = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.04, 0.44), [cover, cover, new THREE.MeshStandardMaterial({ map: pageTex, roughness: 0.9 }), cover, cover, cover]);
    book.position.y = 1.13;
    book.rotation.x = -0.3;
    g.add(book);
    this.scene.add(g);
    g.traverse((o) => this.noMerge.add(o));
    const ledger = VESSEK_ENTRIES.find((e) => e.id === 'vessek_ledger')!;
    this.interaction.register({
      object: g,
      label: 'Read the Anchorage ledger',
      range: 2.4,
      onInteract: () => {
        if (!gameState.hasFlag('vessek_power_restored')) {
          UIManager.showDocument('The Anchorage Ledger', 'Every ship pulled in, in four generations of handwriting: one every six to nine years, back sixty years to the Lantern Bay itself. Varro keeps the last page covered with her hand while you’re still a stranger.');
          return;
        }
        const first = !gameState.hasFlag('vessek_ledger_read');
        gameState.setFlag('vessek_ledger_read');
        gameState.unlockLog(ledger.id);
        gameState.addClue({ id: ledger.id, title: ledger.title, summary: 'The early rehearsal came eleven days after Kethra’s Heart was relit.', source: 'Anchorage ledger' });
        if (first) {
          AudioSystem.playCollect();
          gameState.addAttributeXp('insight', 1);
          if (gameState.hasFlag('kethra_kindling_record')) {
            gameState.connectClues('kethra_kindling_record', ledger.id, 'The Kindling vanished in a white sky, and the Hearts feed the signal that causes it.');
          }
        }
        UIManager.showDocument(ledger.title, ledger.body, () => gameState.setObjective(this.currentObjective()));
      },
    });
  }

  /** The view: the Anchorage's ring curving away, lashed hulls, and Vessek below. */
  private buildOutside(): void {
    this.sky = buildSpaceSky({ seed: 0x7e55 });
    this.scene.add(this.sky.group);
    const vessek = PLANETS.find((p) => p.id === 'vessek')!;
    const sun = new THREE.Vector3(2000, 800, -600);
    this.planet = buildPlanetInstance(vessek, new THREE.Vector3(620, -170, -180), sun, this.camera);
    this.planet.group.scale.setScalar(52);
    this.scene.add(this.planet.group);
    this.planet.group.traverse((o) => this.noMerge.add(o));
    // The white sky: a shell around everything that the pulse floods with light.
    this.skyMat = new THREE.MeshBasicMaterial({ color: 0xf3f0ea, transparent: true, opacity: 0, side: THREE.BackSide, depthWrite: false, fog: false });
    this.whiteSky = new THREE.Mesh(new THREE.SphereGeometry(1500, 24, 16), this.skyMat);
    this.scene.add(this.whiteSky);
    this.noMerge.add(this.whiteSky);
    this.sky.group.traverse((o) => this.noMerge.add(o));
  }

  private async buildRing(): Promise<void> {
    // A broken Kindling ring, 60 m in radius, just below the hall's floor. The Lantern Bay sits on
    // its near arc, so from the east windows the ring and its lashed hulls curve away across the
    // whole view, 80 to 140 m out.
    const ringCenter = new THREE.Vector3(70, -5, 0);
    const R = 60;
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x5a5448, roughness: 0.7, metalness: 0.5, emissive: 0x7be0a0, emissiveIntensity: 0.04 });
    const arcs: [number, number][] = [[-2.6, 1.9], [2.05, 0.9], [3.1, 1.7], [4.95, 1.25]];
    for (const [start, len] of arcs) {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(R, 2.4, 8, 90, len), ringMat);
      arc.rotation.x = Math.PI / 2;
      arc.rotation.z = start;
      arc.position.copy(ringCenter);
      this.scene.add(arc);
    }
    // Lashed hulls around the ring, each with its own mismatched running lights: every one its own
    // freighter of the Wren's class (a seeded variant), since twenty-one ships pulled in over the
    // years were never going to match.
    const count = 8;
    const hulls = await Promise.all(Array.from({ length: count }, (_, i) => buildShipHull({ variant: i + 1 })));
    for (let i = 0; i < count; i++) {
      const angle = Math.PI + 0.75 + i * ((2 * Math.PI - 1.5) / (count - 1)) + (i % 2) * 0.06;
      const g = hulls[i].group;
      const x = ringCenter.x + Math.cos(angle) * (R + 5);
      const z = ringCenter.z + Math.sin(angle) * (R + 5);
      g.position.set(x, ringCenter.y + 3 + (i % 3) * 2.5, z);
      g.rotation.set(0, -angle + (i % 2 ? 0.2 : -0.3), (i % 3) * 0.06);
      g.scale.setScalar(1.8 + (i % 4) * 0.45);
      const lampColor = new THREE.Color(LAMP_COLORS[i % LAMP_COLORS.length]);
      g.traverse((o) => {
        const m = o as THREE.Mesh;
        this.noMerge.add(o);
        if (!m.isMesh) return;
        m.castShadow = false;
        const mat = m.material as THREE.MeshStandardMaterial;
        // Moored for decades: engines cold. What light they have is their own grid's, each a
        // different white, washing faintly over the plating.
        mat.emissive.copy(lampColor);
        mat.emissiveIntensity = mat.name === 'hull-paint' ? 0.07 : 0.02;
        mat.metalness = Math.min(mat.metalness, 0.4);
        this.hullMats.push(mat);
        this.animated.add(mat);
      });
      this.scene.add(g);
      for (let k = 0; k < 3; k++) {
        const mat = new THREE.MeshBasicMaterial({ color: lampColor.clone(), fog: false });
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.55, 6, 4), mat);
        dot.position.set(x + (k - 1) * 3, g.position.y + 2.5 + k * 0.5, z + (k - 1) * 1.5);
        this.scene.add(dot);
        this.noMerge.add(dot);
        this.shipLamps.push({ mat, base: lampColor.clone() });
      }
    }
  }

  /**
   * The ring's light, on a budget: eight point lights for four compartments (every point light is
   * written into every shader). Each circuit's fixtures glow on their own; one light per circuit
   * carries the room.
   */
  private buildLighting(): void {
    const hemi = new THREE.HemisphereLight(0x8a9bb0, 0x3a3128, 0.35);
    this.scene.add(hemi);
    this.hemi = hemi;
    // Light off Vessek through the windows: a cool fill from the east.
    const planetLight = new THREE.DirectionalLight(0xc8d6ff, 0.55);
    this.planetLight = planetLight;
    planetLight.position.set(30, 8, -6);
    this.scene.add(planetLight);
    const key = new THREE.DirectionalLight(0xffe6c8, 0.35);
    this.key = key;
    key.position.set(-5, 12, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -28;
    key.shadow.camera.right = 28;
    key.shadow.camera.top = 40;
    key.shadow.camera.bottom = -20;
    this.scene.add(key);

    const lamp = (group: LampGroup, light: THREE.PointLight | null, mat: THREE.MeshStandardMaterial | null, base: number, glow: number, phase: number) => {
      if (light) this.scene.add(light);
      if (mat) this.animated.add(mat);
      this.lamps.push({ group, light, mat, base, glow, goal: 1, level: 1, delay: 0, phase });
    };
    // Hall lamps down the concourse, each fixture a different white; three lights carry them.
    const lampGeo = new THREE.BoxGeometry(1.3, 0.08, 0.3);
    [[0, 5.5], [0, 0.5], [0, -4.5], [-3.5, -1], [3.5, 2.5]].forEach(([x, z], i) => {
      const mat = new THREE.MeshStandardMaterial({ color: 0x33363a, emissive: LAMP_COLORS[i % LAMP_COLORS.length], emissiveIntensity: 1.5 });
      const fixture = new THREE.Mesh(lampGeo, mat);
      fixture.position.set(x, 4.5, z);
      this.scene.add(fixture);
      const light = i < 3 ? new THREE.PointLight(LAMP_COLORS[i], 1.8, 13, 1.6) : null;
      light?.position.set(x, 4.2, z);
      lamp('lamps', light, mat, 1.8, 1.5, i * 1.7);
    });
    const dock = new THREE.PointLight(0xe8f0ff, 1.1, 9, 1.6);
    dock.position.set(0, 0.7, 7.2);
    lamp('dock', dock, null, 1.1, 0, 0);
    const school = new THREE.PointLight(0xffc27a, 1.6, 14, 1.6);
    school.position.set(-18, 3.6, 6);
    lamp('school', school, null, 1.6, 0, 3.1);
    const grow = new THREE.PointLight(0xd8ffd8, 1.8, 20, 1.4);
    grow.position.set(0, 3.2, -26);
    lamp('grow', grow, null, 1.8, 0, 5.3);
    const junction = new THREE.PointLight(0x9fd0ff, 1.2, 14, 1.6);
    junction.position.set(18, 3.8, -28);
    lamp('junction', junction, null, 1.2, 0, 2.2);
    // Emergency strips at knee height round the hall, and one light: off until the pulse.
    for (const [x, z, len, yaw] of [[-WALL_FACE_X + 0.1, 0, 20, Math.PI / 2], [WALL_FACE_X - 0.35, 0, 20, -Math.PI / 2]] as const) {
      const mat = new THREE.MeshStandardMaterial({ color: 0x331a08, emissive: 0xff9a40, emissiveIntensity: 0.05 });
      const strip = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 0.05), mat);
      strip.position.set(x, 0.5, z);
      strip.rotation.y = yaw;
      this.scene.add(strip);
      this.emergency.push(mat);
      this.animated.add(mat);
    }
    const emergency = new THREE.PointLight(0xff9a40, 0, 16, 1.6);
    emergency.position.set(0, 0.8, -2);
    lamp('emergency', emergency, null, 1.1, 0, 0);
  }

  private buildPeople(): void {
    // Harbormaster Ilse Varro: long work coat with a reflective stripe, the ledger's twin at her hip.
    this.varro = new Figure({
      kind: 'human', height: 1.74, build: 1.0, seed: 5,
      skin: 0x8a5f48, garment: 0x2f3d4c, trim: 0xd8d2c0, coat: 1.0,
      hair: { color: 0x2a211c, style: 'bun' }, prop: 'ledger',
    });
    this.varro.group.position.set(L.PEOPLE.varro.x, 0, L.PEOPLE.varro.z);
    this.scene.add(this.varro.group);
    // Dace: twelve, oversized jacket, headlamp, pockets full of tools. In the school, by her board.
    this.dace = new Figure({
      kind: 'human', height: 1.42, build: 0.9, seed: 9,
      skin: 0xc49a7c, garment: 0x6b4f2e, trim: 0x9aa3a8, coat: 0.55,
      hair: { color: 0x7a4a26, style: 'swept' }, headlamp: true,
      glow: { color: 0xffe6c0, intensity: 1 }, prop: 'toolbelt',
    });
    this.dace.group.position.set(L.PEOPLE.dace.x, 0, L.PEOPLE.dace.z);
    this.dace.group.rotation.y = Math.PI / 2;
    this.scene.add(this.dace.group);
  }

  /** The school, tanker and junction's working parts: lamps that follow their circuits, doors. */
  private wireDressing(): void {
    const d = this.dressing;
    for (const [i, mat] of d.growBars.entries()) {
      this.animated.add(mat);
      this.lamps.push({ group: 'grow', light: null, mat, base: 0, glow: 1.6, goal: 1, level: 1, delay: 0, phase: i });
    }
    this.animated.add(d.schoolMat);
    this.lamps.push({ group: 'school', light: null, mat: d.schoolMat, base: 0, glow: 1.6, goal: 1, level: 1, delay: 0, phase: 1 });
    this.animated.add(d.junctionMat);
    this.lamps.push({ group: 'junction', light: null, mat: d.junctionMat, base: 0, glow: 1.4, goal: 1, level: 1, delay: 0, phase: 2 });
    this.animated.add(d.heaterMat);
    for (const m of d.plantMats) this.animated.add(m);
    for (const f of d.ductFans) {
      this.animated.add(f.light);
      f.blades.traverse((o) => this.noMerge.add(o));
    }
    d.scrubberFan.traverse((o) => this.noMerge.add(o));
    for (const o of [d.resetPanel, d.keypad, d.insideButton, d.crank]) o.traverse((x) => this.noMerge.add(x));
    if (gameState.hasFlag('vessek_junction_reset')) d.resetLever.rotation.x = -0.9;
    // Doors as the save left them.
    const sealed = gameState.hasFlag('vessek_pulse') && !gameState.hasFlag('vessek_hatch_open') && !gameState.hasFlag('vessek_power_restored');
    this.rooms.hatch.setOpen(!sealed);
    this.rooms.keypadDoor.setOpen(false);
    this.rooms.grate.setOpen(gameState.hasFlag('vessek_grate_open'));
  }

  private buildInteractions(): void {
    this.interaction.register({
      object: this.varro.group,
      label: 'Speak with Harbormaster Varro',
      range: 2.8,
      onInteract: () => {
        const reporting = gameState.hasFlag('vessek_junction_reset') && !gameState.hasFlag('vessek_pulse');
        DialogueSystem.start(varroDialogue(), () => {
          // Persuasion 3: she threw her own hall lamps' lockout.
          if (gameState.hasFlag('vessek_deal_message') && !this.bus.locked.has('lamps')) this.bus.lockOut('lamps');
          gameState.setObjective(this.currentObjective());
          if (reporting && !gameState.hasFlag('vessek_pulse')) this.startPulse();
          if (gameState.hasFlag('vessek_alloy_given') && !gameState.hasFlag('vessek_complete')) this.levelComplete();
        });
      },
    });
    this.interaction.register({
      object: this.dace.group,
      label: 'Talk to Dace',
      range: 2.6,
      onInteract: () => DialogueSystem.start(daceDialogue(), () => gameState.setObjective(this.currentObjective())),
    });
    // The airlock home.
    const door = new THREE.Object3D();
    door.position.set(2, 1.4, WALL_FACE_Z - 0.4);
    this.scene.add(door);
    this.interaction.register({
      object: door,
      label: 'Board the Wren',
      range: 2.6,
      onInteract: () => {
        if (gameState.hasFlag('vessek_pulse') && !gameState.hasFlag('vessek_power_restored')) {
          UIManager.toast('Not now. Three hundred people’s food is freezing.');
          AudioSystem.playFail();
          return;
        }
        this.onDepart?.();
      },
    });

    const d = this.dressing;
    // Shō: the junction's reset.
    this.interaction.register({
      object: d.resetPanel,
      label: () => (gameState.hasFlag('vessek_junction_reset') ? 'The junction is on the bus' : 'Put the junction back on the bus'),
      range: 2.4,
      onInteract: () => {
        if (gameState.hasFlag('vessek_junction_reset')) return;
        if (!gameState.hasFlag('vessek_varro_met')) {
          UIManager.toast('A junction reset lever, taped over: HARBORMASTER ONLY.');
          return;
        }
        gameState.setFlag('vessek_junction_reset');
        gameState.addAttributeXp('engineering', 1);
        AudioSystem.playConfirm();
        UIManager.toast('The junction thumps back onto the bus and its lamps come up. Tell Varro.', 'learn');
        gameState.setObjective(this.currentObjective());
      },
    });
    // The junction door: a keypad outside, a button inside. It closes itself behind you.
    this.interaction.register({
      object: d.keypad,
      label: () => (gameState.hasFlag('vessek_junction_code') ? 'Enter the junction code: 4-1-7' : 'A keypad on the junction door'),
      range: 2,
      onInteract: () => {
        if (!gameState.hasFlag('vessek_junction_code')) {
          UIManager.toast('Four digits, and you don’t have them. Varro might.');
          AudioSystem.playFail();
          return;
        }
        this.openFor(this.rooms.keypadDoor, 7);
        AudioSystem.playConfirm();
      },
    });
    this.interaction.register({
      object: d.insideButton,
      label: 'Open the junction door',
      range: 2,
      onInteract: () => {
        this.openFor(this.rooms.keypadDoor, 7);
        AudioSystem.playConfirm();
      },
    });
    // The tanker hatch: the pulse seals it; it only cranks open from the tanker's side.
    this.interaction.register({
      object: d.crank,
      label: 'Crank the hatch open',
      range: 2.2,
      enabled: () => !this.rooms.hatch.open,
      onInteract: () => {
        gameState.setFlag('vessek_hatch_open');
        this.rooms.hatch.setOpen(true);
        this.syncDoorColliders();
        AudioSystem.playTone(80, 0.6, 'sawtooth', 0.05);
      },
    });
    const hatchHall = new THREE.Object3D();
    hatchHall.position.set(-2, 1.4, -WALL_FACE_Z - 0.6);
    this.scene.add(hatchHall);
    this.interaction.register({
      object: hatchHall,
      label: 'The tanker hatch is sealed',
      range: 2.2,
      enabled: () => !this.rooms.hatch.open,
      onInteract: () => UIManager.toast('Pressure seal: the pulse shut it. It cranks open from the tanker’s side only.'),
    });
    // The short duct's bent grate: traversal 2.
    this.interaction.register({
      object: this.rooms.grate.object,
      label: () => (gameState.data.attributes.traversal >= 2 ? 'Squeeze past the bent grate' : 'A bent grate (traversal 2)'),
      range: 1.8,
      enabled: () => !this.rooms.grate.open,
      onInteract: () => {
        if (gameState.data.attributes.traversal < 2) {
          UIManager.toast('Too tight for you yet (traversal 2).');
          AudioSystem.playFail();
          return;
        }
        gameState.setFlag('vessek_grate_open');
        gameState.addAttributeXp('traversal', 1);
        this.rooms.grate.setOpen(true);
        this.syncDoorColliders();
        AudioSystem.playConfirm();
      },
    });
    // The duct fans: running, they close the ducts.
    for (const f of d.ductFans) {
      this.interaction.register({
        object: f.blades,
        label: 'The duct fan is running',
        range: 1.8,
        enabled: () => this.bus.isOn('fans'),
        onInteract: () => UIManager.toast('Not with the fans running. Dace’s board switches them off.'),
      });
    }
  }

  private hallFurniture(): THREE.Box3[] {
    const box = (x0: number, z0: number, x1: number, z1: number, h = 3) => new THREE.Box3(new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, h, z1));
    return [
      // Desk, lectern, columns, cargo.
      box(-4.1, -1.7, -1.0, -0.85, 1.0),
      box(-5.5, 0.3, -4.9, 0.9, 1.2),
      ...[[-6.9, -4], [-6.9, 8.6], [6.6, -8], [6.6, 8]].map(([x, z]) => box(x - 0.45, z - 0.45, x + 0.45, z + 0.45, 5)),
      box(-7.0, 9.3, -4.7, 10.9, 1.1),
      box(5.7, 6.2, 7.3, 8.9, 1.1),
      box(-3.9, 10.2, -2.9, 11.0, 0.8),
      box(-7.1, -10.9, -4.5, -8.8, 1.1),
      box(4.8, -11.5, 5.6, -10.3, 0.9),
    ];
  }

  /** Doors and fans in the player's colliders exactly while they are shut or running. */
  private syncDoorColliders(): void {
    const r = this.rooms;
    const all = this.player.colliders;
    for (const door of [r.hatch, r.keypadDoor, r.grate]) {
      if (door.open) door.collider.makeEmpty();
      else door.collider.copy(door.closedBox);
      if (!all.some((c) => c.box === door.collider)) all.push({ box: door.collider });
    }
    for (const f of this.dressing.ductFans) {
      if (this.bus.isOn('fans')) f.collider.copy(f.closed);
      else f.collider.makeEmpty();
      if (!all.some((c) => c.box === f.collider)) all.push({ box: f.collider });
    }
  }

  private openFor(door: Door, seconds: number): void {
    door.setOpen(true);
    this.doorTimers.set(door, seconds);
    this.syncDoorColliders();
  }

  // ---------------------------------------------------------------- the bus

  private onBusEvent(e: BusEvent | { kind: 'lockout'; id: CircuitId }): void {
    const name = (id: CircuitId) => CIRCUITS[id].name.toLowerCase();
    switch (e.kind) {
      case 'refused':
        UIManager.toast(`The ${name(e.id)} won’t close without the ${e.missing.map(name).join(' and ')}.`, 'fail');
        AudioSystem.playFail();
        break;
      case 'trip':
        bus.emit('player:shake', 0.25);
        AudioSystem.playTone(48, 0.5, 'sawtooth', 0.09);
        UIManager.toast(`The bus tripped: ${e.load} units on a six-unit bus. Everything but the regulator dropped${this.bus.phase === 'crisis' ? ', and the bay lost warmth' : ''}.`, 'fail');
        break;
      case 'autoReset':
        UIManager.toast(`The ${name(e.id)} switched themselves back on.`, 'act');
        break;
      case 'lockout':
        gameState.setFlag(`vessek_lockout_${e.id}`);
        UIManager.toast(`Locked out: the ${name(e.id)} won’t switch themselves back on now.`, 'learn');
        break;
      case 'restored':
        this.powerRestored();
        break;
      case 'frostOut':
        AudioSystem.playFail();
        UIManager.toast('The seedlings frosted over. Dace’s backup warmers bought another try; the bus is back where the pulse left it.', 'fail');
        break;
      default:
        break;
    }
    // Ki: the school's lamps lit for the first time.
    if (!gameState.hasFlag('vessek_school_lit') && this.bus.phase === 'normal' && this.bus.isOn('school')) {
      gameState.setFlag('vessek_school_lit');
      gameState.addAttributeXp('engineering', 1);
      UIManager.showCaption('Dace: “Lamps! Class is back on.”', 3200);
      AudioSystem.playCollect();
    }
    this.syncDoorColliders();
    gameState.setObjective(this.currentObjective());
  }

  /** Where each lamp group should be, from the bus and the level's state. */
  private goalFor(group: LampGroup): number {
    const b = this.bus;
    const restored = b.phase === 'restored';
    switch (group) {
      case 'lamps':
        return restored || b.isOn('lamps') ? 1 : 0;
      case 'dock':
        return restored || b.isOn('dock') ? 1 : 0;
      case 'school':
        return b.isOn('school') ? 1 : 0;
      case 'grow':
        // The bay runs on its own reserve cells until the pulse drains them.
        return b.phase === 'normal' ? 1 : restored ? 1 : 0;
      case 'junction':
        return gameState.hasFlag('vessek_junction_reset') && b.isOn('regulator') ? 1 : 0.12;
      case 'emergency':
        return b.phase === 'crisis' ? 1 : 0;
    }
  }

  /** Snap every lamp to where it should be (loading, and a save resumed mid-level). */
  private settleLamps(): void {
    for (const l of this.lamps) {
      l.goal = l.level = this.goalFor(l.group);
      this.applyLamp(l, 1);
    }
  }

  private applyLamp(l: Lamp, stutter: number): void {
    if (l.light) l.light.intensity = l.base * l.level * stutter;
    if (l.mat) l.mat.emissiveIntensity = l.glow * l.level * stutter;
  }

  // ---------------------------------------------------------------- the pulse

  private startPulse(): void {
    gameState.setFlag('vessek_pulse');
    this.player.enabled = false;
    this.pulseBeat = true;
    // A cinematic beat: the HUD steps out and the ring's idle motion ducks until control returns.
    motion.conductor.hold('vessek-pulse');
    motion.conductor.duck(PULSE_BEAT);
    this.bus.pulse();
    // The grids go deck by deck: the tanker first, then the collar, the hall, the school.
    const order: LampGroup[] = ['grow', 'dock', 'lamps', 'school'];
    for (const l of this.lamps) {
      const i = order.indexOf(l.group);
      if (i >= 0) l.delay = 1.6 + i * 0.7;
    }
    this.rooms.hatch.setOpen(false);
    this.syncDoorColliders();
    this.timelineClock = 0;
    this.timeline = [
      { at: 0.0, run: () => AudioSystem.playTone(55, 2.4, 'sine', 0.12) },
      { at: 0.4, run: () => UIManager.whiteFlash(0.9) },
      { at: 0.5, run: () => bus.emit('player:shake', 0.5) },
      ...order.map((_, i) => ({ at: 1.6 + i * 0.7, run: () => AudioSystem.playTone(90 - i * 8, 0.25, 'triangle', 0.06) })),
      {
        at: 3.4,
        run: () => {
          for (const s of this.shipLamps) s.mat.color.setHex(0x000000);
          for (const m of this.hullMats) {
            m.userData.lit = m.emissiveIntensity;
            m.emissiveIntensity = 0;
          }
        },
      },
      { at: 4.6, run: () => this.setEmergency(1) },
      { at: 5.0, run: () => UIManager.showCaption('Varro: “Rehearsal pulse. Two years early. The tanker’s sealed itself.”', 3600) },
      {
        at: PULSE_BEAT,
        run: () => {
          motion.conductor.release('vessek-pulse');
          this.player.enabled = true;
          this.pulseBeat = false;
          gameState.setObjective(this.currentObjective());
          UIManager.toast('The bay’s heaters are down, and the lamps that reset themselves will trip the bus. Dace’s lockout boxes are in the ducts.', 'act');
        },
      },
    ];
  }

  /** Ketsu: the bay holds. The grow lights come back row by row, then the rest of the ring. */
  private powerRestored(): void {
    UIManager.setMeter(null, 0);
    gameState.setFlag('vessek_power_restored');
    gameState.addAttributeXp('engineering', 1);
    motion.conductor.duck(4.2);
    this.dawn = 0;
    this.rooms.hatch.setOpen(true);
    this.syncDoorColliders();
    for (const m of this.dressing.plantMats) {
      const base = m.userData.baseColor as THREE.Color | undefined;
      if (base) m.color.copy(base);
    }
    this.timelineClock = 0;
    this.timeline = [
      { at: 1.6, run: () => UIManager.toast('Reserve cells online. The rest of the ring is coming back.', 'learn') },
      { at: 2.4, run: () => { this.setEmergency(0); AudioSystem.playSuccess(); } },
      { at: 3.0, run: () => { this.relightShips = true; } },
      { at: 4.2, run: () => gameState.setObjective(this.currentObjective()) },
    ];
  }

  private levelComplete(): void {
    gameState.setFlag('vessek_complete');
    AudioSystem.playLevelEnd();
    const deals: Record<string, string> = {
      vessek_deal_message: 'You promised to carry the ledger home.',
      vessek_deal_knowledge: 'You traded what Kethra taught you.',
      vessek_deal_repair: 'You paid in repairs.',
    };
    const deal = Object.keys(deals).find((f) => gameState.hasFlag(f));
    UIManager.showChapterCard({
      eyebrow: 'Level 3 complete',
      title: 'The Anchorage holds',
      lines: ['Three hundred people kept their harvest.', deal ? deals[deal] : 'Varro gave the alloy freely, and you kept your core.', '+3 conduit alloy for the Wren’s comms.'],
    });
  }

  private setEmergency(level: number): void {
    for (const m of this.emergency) m.emissiveIntensity = 0.05 + level * 2.2;
  }

  // ---------------------------------------------------------------- frame

  update(dt: number, elapsed: number): void {
    this.player.update(dt);
    this.interaction.update(this.camera);
    this.player.camera.getWorldPosition(this.eye);
    this.sky.update(this.camera);
    this.varro.update(dt, elapsed, this.eye);
    this.dace.update(dt, elapsed, this.eye);
    const ambientDt = dt * motion.ambient;
    this.planet?.update(motion.ambientTime, ambientDt);
    if (this.planet) this.planet.group.rotation.y += ambientDt * 0.004;

    if (this.timeline.length) {
      this.timelineClock += dt;
      while (this.timeline.length && this.timeline[0].at <= this.timelineClock) this.timeline.shift()!.run();
    }
    // The bus runs on its own: auto-resets count back, and during the crisis the bay freezes.
    if (!this.pulseBeat) for (const e of this.bus.update(dt)) this.onBusEvent(e);
    this.busWorld.update(dt, elapsed);
    this.updateFrost();
    this.registerHarness();

    // The white sky swells and fades with the pulse.
    const skyTarget = this.pulseBeat ? THREE.MathUtils.clamp(1 - Math.abs(this.timelineClock - 0.9) / 1.4, 0, 1) : 0;
    this.skyMat.opacity = damp(this.skyMat.opacity, skyTarget, 6, dt);
    this.whiteSky.visible = this.skyMat.opacity > 0.01;

    // The grow lights come back row by row after the bay is saved: light travels.
    if (this.dawn >= 0) this.dawn += dt;
    let growRow = 0;
    for (const l of this.lamps) {
      let goal = this.goalFor(l.group);
      if (l.group === 'grow' && this.dawn >= 0 && l.mat) goal = this.dawn > 0.5 + growRow++ * 0.6 ? 1 : 0;
      if (goal !== l.goal) l.goal = goal;
      if (l.delay > 0) {
        l.delay -= dt;
        continue;
      }
      // Lamps don't fade: they stutter, then settle, which is how salvaged fixtures fail.
      const diff = l.goal - l.level;
      if (Math.abs(diff) > 0.001) {
        l.level += Math.sign(diff) * Math.min(Math.abs(diff), dt * 1.8);
        // ~2.4 Hz: slow enough to stay under three flashes a second (docs/DESIGN.md §3, flash guard).
        const stutter = Math.abs(diff) > 0.05 && Math.sin(elapsed * 15 + l.phase * 13) > 0.3 ? 0.25 : 1;
        this.applyLamp(l, stutter);
      } else {
        // Out of sync by design: every ship's grid is a little different (LORE.md, Places).
        const hum = l.level > 0.5 ? 1 + Math.sin(motion.ambientTime * (2 + (l.phase % 3)) + l.phase) * 0.04 : 1;
        this.applyLamp(l, hum);
      }
    }
    // The hall's general light follows its lamps, so a brown-out is actually dark.
    let hall = 0;
    let n = 0;
    for (const l of this.lamps) if (l.group === 'lamps') { hall += l.level; n++; }
    const lit = n ? hall / n : 1;
    this.hemi.intensity = 0.12 + 0.23 * lit;
    this.key.intensity = 0.08 + 0.27 * lit;
    // The window light has no shadows, so it would light the hall straight through the walls; it
    // falls with the lamps so the brown-out is actually dark, leaving the emergency strips to read.
    this.planetLight.intensity = 0.15 + 0.4 * lit;
    if (this.relightShips) {
      for (const s of this.shipLamps) dampVec3(s.mat.color, s.base, 1.5, dt);
      for (const m of this.hullMats) if (m.userData.lit !== undefined) m.emissiveIntensity = damp(m.emissiveIntensity, m.userData.lit, 1.5, dt);
    }

    // Machines: the duct fans and the scrubber turn while they have power; the heaters glow.
    const d = this.dressing;
    const fans = this.bus.isOn('fans');
    for (const f of d.ductFans) {
      f.blades.rotation.z += dt * (fans ? 14 : 0);
      // The fan light strobes slowly through the blades, well under three flashes a second.
      f.light.emissiveIntensity = fans ? 0.35 + 0.3 * Math.max(0, Math.sin(elapsed * 4)) : 0.08;
    }
    d.scrubberFan.rotation.y += dt * (this.bus.isOn('scrubbers') || this.bus.phase === 'normal' ? 5 : 0);
    const heat = this.bus.isOn('heaters') || this.bus.phase !== 'crisis' ? 1 : 0;
    d.heaterMat.emissiveIntensity = damp(d.heaterMat.emissiveIntensity, heat * 1.4, 2, dt);
    d.resetLever.rotation.x = damp(d.resetLever.rotation.x, gameState.hasFlag('vessek_junction_reset') ? -0.9 : 0.9, 6, dt);

    for (const [door, t] of this.doorTimers) {
      const left = t - dt;
      if (left > 0) this.doorTimers.set(door, left);
      else {
        this.doorTimers.delete(door);
        door.setOpen(false);
        this.syncDoorColliders();
      }
    }
    for (const door of [this.rooms.hatch, this.rooms.keypadDoor]) door.update(dt);
  }

  /** The frost: the HUD's meter, and the seedlings frosting over as the bay cools. */
  private updateFrost(): void {
    const crisis = this.bus.phase === 'crisis' && !this.pulseBeat;
    const f = Math.max(0, this.bus.frost.remaining / this.bus.frost.total);
    UIManager.setMeter(crisis ? `Hydroponics ${(1 + 11 * f).toFixed(1)} °C` : null, f);
    if (this.bus.phase !== 'crisis') return;
    for (const m of this.dressing.plantMats) {
      const base = m.userData.baseColor as THREE.Color | undefined;
      if (base) m.color.copy(base).lerp(new THREE.Color(0xdfeaf2), (1 - f) * 0.8);
    }
  }

  /** F2 in the harness, and the tests: save the bay now (the crisis), or fail it (a trip). */
  private registerHarness(): void {
    const live = this.bus.phase === 'crisis' && !this.pulseBeat;
    if (live && !this.unregister) {
      this.unregister = registerMiniGame({
        name: 'vessek-bus',
        win: () => {
          for (const id of ['dock', 'lamps'] as const) {
            if (!this.bus.locked.has(id)) this.onBusEvent({ kind: 'lockout', id });
            this.bus.lockOut(id);
            this.bus.throwLever(id, false);
          }
          for (const id of ['pumps', 'heaters', 'scrubbers'] as const) this.bus.throwLever(id, true);
        },
        fail: () => {
          this.bus.throwLever('lamps', true);
          this.onBusEvent(this.bus.throwLever('heaters', true));
        },
      });
    } else if (!live && this.unregister) {
      this.unregister();
      this.unregister = null;
    }
  }

  onResize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    motion.conductor.release('vessek-pulse');
    this.unregister?.();
    for (const u of this.unsub) u();
    this.stopAmbient?.();
    this.stopMusic?.();
    UIManager.setMeter(null, 0);
    this.interaction.clear();
    this.scene.traverse((obj) => {
      if ((obj as THREE.InstancedMesh).isInstancedMesh) return;
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
    disposeSceneTextures(this.scene);
  }
}
