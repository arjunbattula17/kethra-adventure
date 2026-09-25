import * as THREE from 'three';
import type { GameScene } from '../../core/Engine';
import { PlayerController } from '../../player/PlayerController';
import { InteractionSystem } from '../../player/InteractionSystem';
import { UIManager } from '../../ui/UIManager';
import { PanelManager } from '../../ui/PanelManager';
import { gameState } from '../../core/GameState';
import { bus } from '../../core/EventBus';
import { disposeSceneTextures } from '../../core/disposeSceneTextures';
import { getSharedEnvironment } from '../../core/Environment';
import { DialogueSystem } from '../../dialogue/DialogueSystem';
import { AudioSystem } from '../../audio/AudioSystem';
import { Figure } from '../../characters/Figure';
import { placeKitPiece, preloadKit } from '../../ship/interior/kit';
import { groundKitPiece } from '../../ship/interior/walls';
import { buildShipHull } from '../../galaxy/shipHull';
import { buildStarfield } from '../../galaxy/spaceDressing';
import { buildPlanetInstance } from '../../galaxy/planetShader';
import type { PlanetInstance } from '../../galaxy/planetShader';
import { PLANETS } from '../../galaxy/planetData';
import { buildInstancedKit } from '../kethra/kit';
import { varroDialogue, daceDialogue } from './vessekDialogue';
import { VESSEK_ENTRIES } from './vessekLore';
import { BreakerPuzzle, CIRCUITS } from './BreakerPuzzle';

/**
 * Level 3: Vessek Anchorage (LORE.md, "Level 3"; DESIGN.md; DECISIONS D-4).
 *
 * The player docks at the Lantern Bay, the oldest hull in a ring of twenty-one stranded ships, now
 * the Anchorage's town hall. The level's beats:
 *   1. Dace meets you at the docking collar and points you to the harbormaster.
 *   2. Harbormaster Varro wants the Wren's hyperdrive core. Stats open better offers.
 *   3. Set piece: a rehearsal pulse, two years early, browns out the ring deck by deck.
 *   4. Puzzle: bring the power back in the right order before the hydroponics bay freezes.
 *   5. The lights come back; the ledger shows the pulse followed Kethra's Heart relighting.
 *   6. Varro hands over the conduit alloy; the player returns to the Wren to repair comms.
 *
 * The hall is 16 x 24 m, built on the Quaternius kit's 4 m grid like the Wren's interior, so the
 * two ship spaces share one construction language. Interior faces: x = +-7.565, z = +-11.565.
 */

const HALF_W = 8;
const HALF_D = 12;
const WALL_FACE_X = 7.565;
const WALL_FACE_Z = 11.565;
const SPAWN = new THREE.Vector3(2, 0.2, 9.4);
const FROST_SECONDS = 150;
const VALVE_BONUS_S = 45;

/** Every ship's grid is a little different, so every lamp is a different colour of white. */
const LAMP_COLORS = [0xffd8a8, 0xd6e6ff, 0xffbe7a, 0xeef2ff, 0xffe2b8];

type LampGroup = 'lamps' | 'dock' | 'grow' | 'gallery';

interface Lamp {
  group: LampGroup;
  light: THREE.PointLight;
  mat: THREE.MeshStandardMaterial | null;
  base: number;
  /** 0..1 target and current level, and a per-lamp flicker phase: lamps come and go unevenly. */
  target: number;
  level: number;
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
  readonly staticShadows = true;
  onDepart: (() => void) | null = null;
  /** Public for the test harness: the level's own puzzle and clock. */
  puzzle = new BreakerPuzzle();
  frost = { remaining: FROST_SECONDS, total: FROST_SECONDS };

  private floor!: THREE.Mesh;
  private lamps: Lamp[] = [];
  private emergency: THREE.MeshStandardMaterial[] = [];
  private emergencyLights: THREE.PointLight[] = [];
  private shipLamps: { mat: THREE.MeshBasicMaterial; angle: number; base: THREE.Color }[] = [];
  private hullMats: THREE.MeshStandardMaterial[] = [];
  private hemi!: THREE.HemisphereLight;
  private key!: THREE.DirectionalLight;
  private whiteSky!: THREE.Mesh;
  private skyMat!: THREE.MeshBasicMaterial;
  private planet: PlanetInstance | null = null;
  private plantMats: THREE.MeshStandardMaterial[] = [];
  private fans: THREE.Object3D[] = [];
  private varro!: Figure;
  private dace!: Figure;
  private boardTex!: THREE.CanvasTexture;
  private timeline: TimelineStep[] = [];
  private timelineClock = 0;
  private frostRunning = false;
  private unsub: Array<() => void> = [];
  private stopAmbient: (() => void) | null = null;
  private stopMusic: (() => void) | null = null;
  private eye = new THREE.Vector3();

  constructor() {
    this.player = new PlayerController(this.camera, SPAWN.clone());
  }

  async init(): Promise<void> {
    UIManager.setLookPromptEnabled(true);
    this.scene.background = new THREE.Color(0x020308);
    this.scene.environment = getSharedEnvironment();
    this.scene.environmentIntensity = 0.45;
    this.scene.fog = new THREE.FogExp2(0x06080c, 0.012);

    if (!gameState.data.journalLogs.some((l) => l.id === VESSEK_ENTRIES[0].id)) {
      gameState.data.journalLogs.push(...VESSEK_ENTRIES.map((l) => ({ ...l })));
    }

    this.buildFloorAndCeiling();
    this.buildOutside();
    this.buildLighting();
    this.buildPeople();
    this.buildInteractions();
    await Promise.all([this.buildShell(), this.buildDressing(), this.buildRing(), this.buildHydroponics()]);

    this.scene.add(this.player.rig);
    this.player.setFloorTargets([this.floor]);
    this.player.setColliders(this.colliders());
    this.player.teleport(SPAWN, 0);
    this.player.setRespawn(SPAWN, 0);
    this.player.fallResetY = -5;
    this.player.onFootstep = () => AudioSystem.playFootstep('metal');
    this.player.onLand = (s) => AudioSystem.playLand(s);
    this.stopAmbient = AudioSystem.startAmbient(58, 0.02);
    this.stopMusic = AudioSystem.startMusic('vessek');
    this.interaction.onPromptChange = (label) => UIManager.setPrompt(label);
    this.unsub.push(bus.on('player:shake', (amount: number) => this.player.addShake(amount)));

    this.puzzle.frost = this.frost;
    this.puzzle.tickFrost = (dt) => this.tickFrost(dt);
    this.puzzle.onSolved = () => this.powerRestored();

    // Resume a save mid-level in the state it was left.
    if (gameState.hasFlag('vessek_power_restored')) {
      this.setLampGroups(['lamps', 'dock', 'grow', 'gallery'], 1, true);
    } else if (gameState.hasFlag('vessek_pulse')) {
      this.setLampGroups(['lamps', 'dock', 'grow', 'gallery'], 0, true);
      this.setEmergency(1);
      this.startFrost();
    }
    this.drawBoard();
    gameState.setObjective(this.currentObjective());
    bus.emit('scene:vessek:ready');
  }

  private currentObjective(): string {
    if (gameState.hasFlag('vessek_alloy_given')) return 'Return to the Wren and repair long-range comms.';
    if (gameState.hasFlag('vessek_ledger_read')) return 'Tell Harbormaster Varro what you found.';
    if (gameState.hasFlag('vessek_power_restored')) return 'Read the Anchorage ledger by Varro’s desk.';
    if (gameState.hasFlag('vessek_pulse')) return 'Restore power in the breaker gallery before the hydroponics bay freezes.';
    return 'Find the harbormaster in the Lantern Bay.';
  }

  // ---------------------------------------------------------------- construction

  private buildFloorAndCeiling(): void {
    // The walking surface: one invisible slab the player's floor ray lands on. The visible deck is
    // kit plating laid over it in buildShell.
    this.floor = new THREE.Mesh(new THREE.BoxGeometry(HALF_W * 2, 0.2, HALF_D * 2), new THREE.MeshBasicMaterial({ visible: false }));
    this.floor.position.y = -0.1;
    this.scene.add(this.floor);

    // Ceiling: dark plating with two long cable trays, low enough to feel like the inside of a hull.
    const ceilMat = new THREE.MeshStandardMaterial({ color: 0x1a1e23, roughness: 0.85, metalness: 0.4 });
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

    // Deck: plating in three finishes that mark the zones (collar, concourse, work areas).
    for (const x of [-6, -2, 2, 6]) {
      for (const z of [-10, -6, -2, 2, 6, 10]) {
        const name = z >= 6 ? 'Platform_Metal' : x < -2 || (x > 2 && z < -2) ? 'Platform_DarkPlates' : 'Platform_Simple';
        place(name, [x, 0.001, z]);
      }
    }
    // Long walls: west is solid hull with hanging cable runs; east is the window gallery.
    for (const z of [-6, -2, 2, 6]) {
      place('WallAstra_Straight', [-(HALF_W - 2), 0, z], 0);
      place('TopCables_Straight_Hanging', [-(HALF_W - 2), 0, z], 0);
      place('WallWindow_Straight', [HALF_W - 2, 0, z], Math.PI);
      place('TopWindow_Straight', [HALF_W - 2, 0, z], Math.PI);
    }
    // End walls. The south wall's east bay is the docking collar's airlock to the Wren.
    for (const x of [-2, 2]) {
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
    for (const [x, z] of [[-6.9, -4], [-6.9, 8], [6.6, -8], [6.6, 8]]) place('Column_Pipes', [x, 0, z]);
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
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 0.69),
      new THREE.MeshStandardMaterial({ map: signTexture('WREN-01', 'EAST CLAMP · DOCKED', '#1d2126', '#d9a441'), emissive: 0xffffff, emissiveMap: signTexture('WREN-01', 'EAST CLAMP · DOCKED', '#1d2126', '#d9a441'), emissiveIntensity: 0.35, roughness: 0.7 }),
    );
    sign.position.set(2, 4.35, WALL_FACE_Z - 0.3);
    sign.rotation.y = Math.PI;
    this.scene.add(sign);
    // The hall's own name, painted over the old Lantern Bay registry.
    const hallSign = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 1.06),
      new THREE.MeshStandardMaterial({ map: signTexture('LANTERN BAY', 'HARBORMASTER · LEDGER · ALL CREWS', '#2a2420', '#e8dcc4'), roughness: 0.8 }),
    );
    hallSign.position.set(-WALL_FACE_X + 0.05, 3.7, -1);
    hallSign.rotation.y = Math.PI / 2;
    this.scene.add(hallSign);
  }

  private async buildDressing(): Promise<void> {
    const props = ['Prop_Crate3', 'Prop_Crate4', 'Prop_Barrel_Large', 'Prop_Chest', 'Prop_Computer', 'Prop_AccessPoint', 'Prop_Cable_1', 'Prop_Vent_Big', 'Prop_Light_Wide', 'Prop_Light_Floor', 'Prop_Fan_Small', 'Prop_Fan_Small_Propeller', 'Prop_PipeHolder'];
    await preloadKit(props);
    const jobs: Promise<THREE.Object3D>[] = [];
    const place = (name: string, pos: [number, number, number], yaw = 0, scale = 1) =>
      jobs.push(placeKitPiece(this.scene, name, pos, yaw, scale).then(groundKitPiece));

    // Harbormaster's desk: crates lashed together under a salvaged console. The Anchorage builds
    // furniture out of cargo.
    place('Prop_Chest', [-3.3, 0, -1.25], 0.06);
    place('Prop_Chest', [-1.8, 0, -1.3], -0.04);
    place('Prop_AccessPoint', [-1.4, -0.4, -1.4], Math.PI / 2);
    const deskLamp = new THREE.PointLight(0xffd8a8, 0.8, 4, 2);
    deskLamp.position.set(-2.6, 1.3, -1.0);
    this.scene.add(deskLamp);
    this.lamps.push({ group: 'lamps', light: deskLamp, mat: null, base: 0.8, target: 1, level: 1, phase: 4.1 });
    place('Prop_Crate3', [-5.9, 0.5, -3.2], 0.4);
    place('Prop_Barrel_Large', [-6.6, 0, -2.2]);
    // Cargo along the collar: what every arriving ship brought with it.
    for (const [x, z, yaw] of [[-6.4, 9.8, 0.2], [-5.3, 10.4, 0.8], [-6.5, 7.9, -0.3], [6.3, 8.4, 0.5]] as const) {
      place('Prop_Crate3', [x, 0.5, z], yaw);
    }
    place('Prop_Chest', [-3.4, 0, 10.6], 0.1);
    place('Prop_Barrel_Large', [6.6, 0, 6.7]);
    place('Prop_Barrel_Large', [6.9, 0, 7.4]);
    place('Prop_Cable_1', [0.5, 0.01, 7.4], 1.2);
    place('Prop_Cable_1', [3.6, 0.01, -6.8], -0.4);
    // Dace's duct, low on the west wall.
    const vent = await placeKitPiece(this.scene, 'Prop_Vent_Big', [-WALL_FACE_X + 0.05, 0.9, 3.4], 0);
    groundKitPiece(vent);
    vent.rotation.set(0, Math.PI / 2, Math.PI / 2);
    // Floor lights along the docking collar (the "dock lights" circuit).
    for (const x of [-4, 0, 4]) place('Prop_Light_Floor', [x, 0.01, 7.2]);
    // Scrubber fans in the ceiling, which stop when the power goes.
    for (const [x, z] of [[-2.6, 2], [2.6, -3]]) {
      const fan = await placeKitPiece(this.scene, 'Prop_Fan_Small_Propeller', [x, 4.9, z]);
      fan.rotation.x = Math.PI;
      this.fans.push(fan);
      place('Prop_Fan_Small', [x, 4.92, z]);
    }
    place('Prop_PipeHolder', [5.2, 0, -10.9], 0);
    await Promise.all(jobs);

    this.buildBreakerBoard();
    this.buildLedgerLectern();
  }

  /** The breaker board: six lever switches whose lamps show the puzzle's live state. */
  private buildBreakerBoard(): void {
    const g = new THREE.Group();
    g.position.set(4.6, 0, -WALL_FACE_Z + 0.25);
    const cabinet = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.1, 0.4), new THREE.MeshStandardMaterial({ color: 0x3a4148, roughness: 0.6, metalness: 0.6 }));
    cabinet.position.y = 1.35;
    g.add(cabinet);
    this.boardTex = canvasTex(1024, 640, () => {});
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 2.0),
      new THREE.MeshStandardMaterial({ map: this.boardTex, emissive: 0xffffff, emissiveMap: this.boardTex, emissiveIntensity: 0.55, roughness: 0.6 }),
    );
    face.position.set(0, 1.35, 0.21);
    g.add(face);
    const lamp = new THREE.PointLight(0xffe2b8, 0.9, 5, 2);
    lamp.position.set(0, 2.9, 0.9);
    g.add(lamp);
    this.lamps.push({ group: 'gallery', light: lamp, mat: null, base: 0.9, target: 1, level: 1, phase: 2.3 });
    this.scene.add(g);
    this.interaction.register({
      object: g,
      label: () => (gameState.hasFlag('vessek_power_restored') ? 'Breaker board (all green)' : gameState.hasFlag('vessek_pulse') ? 'Open the breaker board' : 'Breaker board'),
      range: 3,
      onInteract: () => {
        if (gameState.hasFlag('vessek_power_restored')) {
          UIManager.toast('Every circuit is holding. The reserve cells are charging.');
        } else if (!gameState.hasFlag('vessek_pulse')) {
          UIManager.toast('Six breakers, six crews’ handwriting. Everything is running, for now.');
        } else {
          this.puzzle.open();
        }
      },
    });
    // The Kindling ring plate, under a floor grate in front of the board.
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

  private drawBoard(): void {
    const canvas = this.boardTex.image as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#23282d';
    ctx.fillRect(0, 0, 1024, 640);
    ctx.fillStyle = '#e8dcc4';
    ctx.font = 'bold 44px Rajdhani, sans-serif';
    ctx.fillText('RING BUS · 6 UNITS', 40, 70);
    const powered = gameState.hasFlag('vessek_power_restored') || !gameState.hasFlag('vessek_pulse');
    CIRCUITS.forEach((c, i) => {
      const x = 60 + i * 158;
      const on = powered ? true : this.puzzle.isOn(c.id);
      ctx.fillStyle = '#15181b';
      ctx.fillRect(x, 120, 120, 380);
      ctx.fillStyle = on ? '#7cbf7c' : '#3a2a26';
      ctx.beginPath();
      ctx.arc(x + 60, 170, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8d949b';
      ctx.fillRect(x + 48, on ? 230 : 330, 24, 130);
      ctx.fillStyle = '#c9ccd0';
      ctx.fillRect(x + 30, on ? 220 : 440, 60, 26);
      ctx.fillStyle = '#e8dcc4';
      ctx.font = '600 22px Rajdhani, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(c.name.split(' ').slice(-1)[0].toUpperCase(), x + 60, 540);
      ctx.textAlign = 'left';
    });
    this.boardTex.needsUpdate = true;
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
    const book = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.04, 0.44), [
      new THREE.MeshStandardMaterial({ color: 0x5a3b24 }),
      new THREE.MeshStandardMaterial({ color: 0x5a3b24 }),
      new THREE.MeshStandardMaterial({ map: pageTex, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ color: 0x5a3b24 }),
      new THREE.MeshStandardMaterial({ color: 0x5a3b24 }),
      new THREE.MeshStandardMaterial({ color: 0x5a3b24 }),
    ]);
    book.position.y = 1.13;
    book.rotation.x = -0.3;
    g.add(book);
    this.scene.add(g);
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

  private async buildHydroponics(): Promise<void> {
    // Three long growing tables in the north-west corner, grow lights overhead. The plants are the
    // nature kit's own, in trays: this is the Anchorage's food.
    const tableMat = new THREE.MeshStandardMaterial({ color: 0x4a5258, metalness: 0.6, roughness: 0.5 });
    const soilMat = new THREE.MeshStandardMaterial({ color: 0x2a211a, roughness: 1 });
    const plants: { position: THREE.Vector3; yaw: number; scale: number }[] = [];
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const growLight = new THREE.PointLight(0xd8ffd8, 1.4, 7, 1.6);
    growLight.position.set(-4.7, 2.1, -8.4);
    this.scene.add(growLight);
    for (const z of [-10.2, -8.4, -6.6]) {
      const table = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.9, 1.0), tableMat);
      table.position.set(-4.7, 0.45, z);
      this.scene.add(table);
      const soil = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.08, 0.84), soilMat);
      soil.position.set(-4.7, 0.94, z);
      this.scene.add(soil);
      for (let i = 0; i < 9; i++) plants.push({ position: new THREE.Vector3(-6.7 + i * 0.5, 0.96, z + (rnd() - 0.5) * 0.4), yaw: rnd() * 6.28, scale: 0.55 + rnd() * 0.3 });
      // Grow light bar: pale green-white, not purple. Grow lights here run on whatever the ring
      // could salvage.
      const barMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xd8ffd8, emissiveIntensity: 1.6 });
      const bar = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.06, 0.16), barMat);
      bar.position.set(-4.7, 2.3, z);
      this.scene.add(bar);
      // One light for the three bars (see the dock lights); each bar still glows on its own.
      this.lamps.push({ group: 'grow', light: growLight, mat: barMat, base: 1.4, target: 1, level: 1, phase: z });
    }
    const half = Math.ceil(plants.length / 2);
    const built = await Promise.all([
      buildInstancedKit(this.scene, 'Plant_1', plants.slice(0, half)),
      buildInstancedKit(this.scene, 'Fern_1', plants.slice(half)),
    ]);
    for (const meshes of built) for (const m of meshes) this.plantMats.push(m.material as THREE.MeshStandardMaterial);
    for (const m of this.plantMats) m.userData.baseColor = m.color.clone();
  }

  /** The view: the Anchorage's ring curving away, lashed hulls, and Vessek below. */
  private buildOutside(): void {
    const stars = buildStarfield(2500, 1800, 2.2);
    this.scene.add(stars);
    const vessek = PLANETS.find((p) => p.id === 'vessek')!;
    const sun = new THREE.Vector3(2000, 800, -600);
    this.planet = buildPlanetInstance(vessek, new THREE.Vector3(620, -170, -180), sun, this.camera);
    this.planet.group.scale.setScalar(52);
    this.scene.add(this.planet.group);
    // The white sky: a shell around everything that the pulse floods with light.
    this.skyMat = new THREE.MeshBasicMaterial({ color: 0xf3f0ea, transparent: true, opacity: 0, side: THREE.BackSide, depthWrite: false, fog: false });
    this.whiteSky = new THREE.Mesh(new THREE.SphereGeometry(1500, 24, 16), this.skyMat);
    this.scene.add(this.whiteSky);
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
    // Lashed hulls around the ring, each with its own mismatched running lights.
    let hull;
    try {
      hull = await buildShipHull();
    } catch {
      return;
    }
    const tints = [0x9aa1a6, 0x8d7f6b, 0x6f7c85, 0xa3968a, 0x7b8a7f];

    // Eight hulls: each costs about eleven draw calls (one per paint slot), so this is the view's
    // whole budget on a slow laptop (docs/PERF_LOG.md).
    const count = 8;
    for (let i = 0; i < count; i++) {
      // Spread around the far side of the ring, where the windows look.
      const angle = Math.PI + 0.75 + i * ((2 * Math.PI - 1.5) / (count - 1)) + (i % 2) * 0.06;
      const g = hull.group.clone(true);
      const x = ringCenter.x + Math.cos(angle) * (R + 5);
      const z = ringCenter.z + Math.sin(angle) * (R + 5);
      g.position.set(x, ringCenter.y + 3 + (i % 3) * 2.5, z);
      g.rotation.set(0, -angle + (i % 2 ? 0.2 : -0.3), (i % 3) * 0.06);
      g.scale.setScalar(1.8 + (i % 4) * 0.45);
      const lampColor = new THREE.Color(LAMP_COLORS[i % LAMP_COLORS.length]);
      g.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.castShadow = false;
        const mat = (m.material as THREE.MeshStandardMaterial).clone();
        // Moored for decades: engines cold, so no glowing engine rings. What light they have is
        // their own grid's, each a different white, washing faintly over the plating.
        mat.emissive.copy(lampColor);
        mat.emissiveIntensity = mat.name === 'mat21' || mat.name === 'mat15' ? 0.07 : 0.02;
        mat.metalness = Math.min(mat.metalness, 0.4);
        if (mat.name === 'mat21') mat.color.setHex(tints[i % tints.length]);
        m.material = mat;
        this.hullMats.push(mat);
      });
      this.scene.add(g);
      for (let k = 0; k < 3; k++) {
        const mat = new THREE.MeshBasicMaterial({ color: lampColor.clone(), fog: false });
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.55, 6, 4), mat);
        dot.position.set(x + (k - 1) * 3, g.position.y + 2.5 + k * 0.5, z + (k - 1) * 1.5);
        this.scene.add(dot);
        this.shipLamps.push({ mat, angle, base: lampColor.clone() });
      }
    }
  }

  private buildLighting(): void {
    const hemi = new THREE.HemisphereLight(0x8a9bb0, 0x3a3128, 0.35);
    this.scene.add(hemi);
    this.hemi = hemi;
    // Light off Vessek through the windows: a cool fill from the east.
    const planetLight = new THREE.DirectionalLight(0xc8d6ff, 0.55);
    planetLight.position.set(30, 8, -6);
    this.scene.add(planetLight);
    const key = new THREE.DirectionalLight(0xffe6c8, 0.35);
    this.key = key;
    key.position.set(-5, 12, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -12;
    key.shadow.camera.right = 12;
    key.shadow.camera.top = 14;
    key.shadow.camera.bottom = -14;
    this.scene.add(key);

    // Hall lamps down the concourse, each a different white.
    const lampGeo = new THREE.BoxGeometry(1.3, 0.08, 0.3);
    [[0, 5.5], [0, 0.5], [0, -4.5], [-3.5, -1], [3.5, 2.5]].forEach(([x, z], i) => {
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: LAMP_COLORS[i % LAMP_COLORS.length], emissiveIntensity: 1.5 });
      const fixture = new THREE.Mesh(lampGeo, mat);
      fixture.position.set(x, 4.5, z);
      this.scene.add(fixture);
      const light = new THREE.PointLight(LAMP_COLORS[i % LAMP_COLORS.length], 1.4, 11, 1.6);
      light.position.set(x, 4.2, z);
      this.scene.add(light);
      this.lamps.push({ group: 'lamps', light, mat, base: 1.4, target: 1, level: 1, phase: i * 1.7 });
    });
    // Dock lights over the collar: one light for the row of floor fixtures (every point light is
    // written into every shader, so a row of lamps shares one; see ShipInteriorScene.applyLightBudget).
    {
      const light = new THREE.PointLight(0xe8f0ff, 1.1, 9, 1.6);
      light.position.set(0, 0.7, 7.2);
      this.scene.add(light);
      this.lamps.push({ group: 'dock', light, mat: null, base: 1.1, target: 1, level: 1, phase: 0 });
    }
    // Emergency strips at knee height: off until the pulse, then the only light left.
    for (const [x, z, len, yaw] of [[-WALL_FACE_X + 0.1, 0, 20, Math.PI / 2], [WALL_FACE_X - 0.35, 0, 20, -Math.PI / 2]] as const) {
      const mat = new THREE.MeshStandardMaterial({ color: 0x331a08, emissive: 0xff9a40, emissiveIntensity: 0.05 });
      const strip = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 0.05), mat);
      strip.position.set(x, 0.5, z);
      strip.rotation.y = yaw;
      this.scene.add(strip);
      this.emergency.push(mat);
    }
    for (const [x, z] of [[-4, -5], [3, 2]]) {
      const light = new THREE.PointLight(0xff9a40, 0, 12, 1.6);
      light.position.set(x, 0.8, z);
      this.scene.add(light);
      this.emergencyLights.push(light);
    }
  }

  private buildPeople(): void {
    // Harbormaster Ilse Varro: long work coat with a reflective stripe, the ledger's twin at her hip.
    this.varro = new Figure({
      kind: 'human', height: 1.74, build: 1.0, seed: 5,
      skin: 0x8a5f48, garment: 0x2f3d4c, trim: 0xd8d2c0, coat: 1.0,
      hair: { color: 0x2a211c, style: 'bun' }, prop: 'ledger',
    });
    this.varro.group.position.set(-2.6, 0, -2.3);
    this.scene.add(this.varro.group);
    // Dace: twelve, oversized jacket, headlamp, pockets full of tools.
    this.dace = new Figure({
      kind: 'human', height: 1.42, build: 0.9, seed: 9,
      skin: 0xc49a7c, garment: 0x6b4f2e, trim: 0x9aa3a8, coat: 0.55,
      hair: { color: 0x7a4a26, style: 'swept' }, headlamp: true,
      glow: { color: 0xffe6c0, intensity: 1 }, prop: 'toolbelt',
    });
    this.dace.group.position.set(-5.9, 0, 5.2);
    this.dace.group.rotation.y = Math.PI / 2 + 0.3;
    this.scene.add(this.dace.group);
  }

  private buildInteractions(): void {
    this.interaction.register({
      object: this.varro.group,
      label: 'Speak with Harbormaster Varro',
      range: 2.8,
      onInteract: () => {
        const beforePulse = !gameState.hasFlag('vessek_varro_met');
        DialogueSystem.start(varroDialogue(), () => {
          gameState.setObjective(this.currentObjective());
          if (beforePulse && gameState.hasFlag('vessek_varro_met') && !gameState.hasFlag('vessek_pulse')) this.startPulse();
          if (gameState.hasFlag('vessek_alloy_given') && !gameState.hasFlag('vessek_complete')) this.levelComplete();
        });
      },
    });
    this.interaction.register({
      object: this.dace.group,
      label: 'Talk to Dace',
      range: 2.6,
      onInteract: () => DialogueSystem.start(daceDialogue()),
    });
    // The duct behind Dace: a traversal route to the warm-water valve during the freeze.
    const ductTarget = new THREE.Object3D();
    ductTarget.position.set(-WALL_FACE_X + 0.4, 0.9, 3.4);
    this.scene.add(ductTarget);
    this.interaction.register({
      object: ductTarget,
      label: () => (gameState.data.attributes.traversal >= 2 ? 'Crawl through Dace’s duct' : 'Crawl through Dace’s duct (traversal 2)'),
      range: 2.2,
      enabled: () => gameState.hasFlag('vessek_pulse') && !gameState.hasFlag('vessek_power_restored') && !gameState.hasFlag('vessek_valve_opened'),
      onInteract: () => this.openValve(),
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
  }

  private colliders(): THREE.Box3[] {
    const box = (x0: number, z0: number, x1: number, z1: number, h = 3) => new THREE.Box3(new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, h, z1));
    return [
      // Hull
      box(-HALF_W - 1, -HALF_D - 1, -WALL_FACE_X, HALF_D + 1),
      box(WALL_FACE_X, -HALF_D - 1, HALF_W + 1, HALF_D + 1),
      box(-HALF_W - 1, -HALF_D - 1, HALF_W + 1, -WALL_FACE_Z),
      box(-HALF_W - 1, WALL_FACE_Z, HALF_W + 1, HALF_D + 1),
      // Desk, hydroponics tables, breaker cabinet, lectern, columns, cargo
      box(-4.1, -1.7, -1.0, -0.85, 1.0),
      box(-7.1, -10.8, -2.3, -6.0, 1.0),
      box(2.8, -WALL_FACE_Z, 6.4, -10.9, 2.5),
      box(-5.5, 0.3, -4.9, 0.9, 1.2),
      ...[[-6.9, -4], [-6.9, 8], [6.6, -8], [6.6, 8]].map(([x, z]) => box(x - 0.45, z - 0.45, x + 0.45, z + 0.45, 5)),
      box(-7.0, 7.4, -4.7, 10.9, 1.1),
      box(5.7, 6.2, 7.3, 8.9, 1.1),
      box(-3.9, 10.2, -2.9, 11.0, 0.8),
      box(4.2, -11.5, 6.2, -10.3, 0.9),
    ];
  }

  // ---------------------------------------------------------------- the pulse

  private startPulse(): void {
    gameState.setFlag('vessek_pulse');
    this.player.enabled = false;
    const lampOrder: LampGroup[] = ['grow', 'dock', 'lamps', 'gallery'];
    this.timelineClock = 0;
    this.timeline = [
      { at: 0.0, run: () => AudioSystem.playTone(55, 2.4, 'sine', 0.12) },
      { at: 0.4, run: () => UIManager.whiteFlash(900) },
      { at: 0.5, run: () => bus.emit('player:shake', 0.5) },
      ...lampOrder.map((g, i) => ({ at: 1.6 + i * 0.7, run: () => { this.setLampGroups([g], 0); AudioSystem.playTone(90 - i * 8, 0.25, 'triangle', 0.06); } })),
      { at: 4.6, run: () => this.setEmergency(1) },
      { at: 5.0, run: () => UIManager.showCaption('Varro: “Rehearsal pulse. Two years early.”', 3200) },
      {
        at: 6.2,
        run: () => {
          this.player.enabled = true;
          this.drawBoard();
          gameState.setObjective(this.currentObjective());
          UIManager.toast('The hydroponics heaters are down. The breaker gallery is in the north-east corner.', 'act');
          this.startFrost();
        },
      },
    ];
  }

  private startFrost(): void {
    this.frostRunning = true;
    this.renderFrostMeter();
  }

  /** Called from update() while playing and from the breaker panel while it holds the game paused. */
  private tickFrost(dt: number): void {
    if (!this.frostRunning) return;
    this.frost.remaining -= dt;
    if (this.frost.remaining <= 0) this.frostOut();
    this.renderFrostMeter();
  }

  private renderFrostMeter(): void {
    const f = Math.max(0, this.frost.remaining / this.frost.total);
    UIManager.setMeter(this.frostRunning ? `Hydroponics ${(1 + 11 * f).toFixed(1)} °C` : null, f);
    // Frost creeps over the seedlings as the bay cools.
    for (const m of this.plantMats) {
      const base = m.userData.baseColor as THREE.Color | undefined;
      if (base) m.color.copy(base).lerp(new THREE.Color(0xdfeaf2), (1 - f) * 0.8);
    }
  }

  /** The kind failure: the plants frost over, the backup warmers buy another try immediately. */
  private frostOut(): void {
    this.frost.remaining = this.frost.total;
    AudioSystem.playFail();
    this.puzzle.reset('The bay hit 1 °C. Dace’s backup warmers kicked in and bought one more try. The breakers are back where the pulse left them.');
    UIManager.toast('The seedlings frosted over. Dace’s backup warmers bought another try.', 'fail');
  }

  private openValve(): void {
    if (gameState.data.attributes.traversal < 2) {
      UIManager.toast('Too tight and too steep for you yet (traversal 2).');
      AudioSystem.playFail();
      return;
    }
    gameState.setFlag('vessek_valve_opened');
    this.frost.remaining = Math.min(this.frost.total, this.frost.remaining + VALVE_BONUS_S);
    gameState.addAttributeXp('traversal', 1);
    AudioSystem.playConfirm();
    UIManager.toast('You squeeze through the duct and crank the warm-water valve. The bay stops cooling for a while.', 'learn');
    this.renderFrostMeter();
  }

  private powerRestored(): void {
    this.frostRunning = false;
    UIManager.setMeter(null, 0);
    gameState.setFlag('vessek_power_restored');
    gameState.addAttributeXp('engineering', 1);
    this.setEmergency(0.3);
    this.drawBoard();
    // The heaters and scrubbers hold; then the reserve cells come up and the rest of the ring
    // relights deck by deck, the pulse in reverse.
    this.timelineClock = 0;
    this.timeline = [
      { at: 0.2, run: () => this.setLampGroups(['grow', 'gallery'], 1) },
      { at: 1.6, run: () => UIManager.toast('Reserve cells online. The rest of the ring is coming back.', 'learn') },
      { at: 2.2, run: () => this.setLampGroups(['dock'], 1) },
      { at: 3.0, run: () => { this.setLampGroups(['lamps'], 1); this.setEmergency(0); AudioSystem.playSuccess(); } },
      { at: 3.4, run: () => { this.relightShips = true; } },
      { at: 4.2, run: () => gameState.setObjective(this.currentObjective()) },
    ];
    for (const m of this.plantMats) {
      const base = m.userData.baseColor as THREE.Color | undefined;
      if (base) m.color.copy(base);
    }
  }

  private relightShips = false;

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
      lines: [
        'Three hundred people kept their harvest.',
        deal ? deals[deal] : 'Varro gave the alloy freely, and you kept your core.',
        '+3 conduit alloy for the Wren’s comms.',
      ],
    });
  }

  private setLampGroups(groups: LampGroup[], target: number, instant = false): void {
    for (const l of this.lamps) {
      if (!groups.includes(l.group)) continue;
      l.target = target;
      if (instant) l.level = target;
    }
    if (target === 0 && groups.includes('lamps')) {
      for (const s of this.shipLamps) s.mat.color.setHex(0x000000);
      for (const m of this.hullMats) m.userData.lit = m.emissiveIntensity;
      for (const m of this.hullMats) m.emissiveIntensity = 0;
    }
    if (instant && target === 1) {
      this.relightShips = true;
    }
  }

  private setEmergency(level: number): void {
    for (const m of this.emergency) m.emissiveIntensity = 0.05 + level * 2.2;
    for (const l of this.emergencyLights) l.intensity = level * 0.9;
  }

  // ---------------------------------------------------------------- frame

  update(dt: number, elapsed: number): void {
    this.player.update(dt);
    this.interaction.update(this.camera);
    this.player.camera.getWorldPosition(this.eye);
    this.varro.update(dt, elapsed, this.eye);
    this.dace.update(dt, elapsed, this.eye);
    this.planet?.update(elapsed, dt);
    if (this.planet) this.planet.group.rotation.y += dt * 0.004;

    if (this.timeline.length) {
      this.timelineClock += dt;
      while (this.timeline.length && this.timeline[0].at <= this.timelineClock) this.timeline.shift()!.run();
    }
    // The white sky swells and fades with the pulse.
    const pulsing = gameState.hasFlag('vessek_pulse') && this.timelineClock < 4.6 && !gameState.hasFlag('vessek_power_restored');
    const skyTarget = pulsing ? THREE.MathUtils.clamp(1 - Math.abs(this.timelineClock - 0.9) / 1.4, 0, 1) : 0;
    this.skyMat.opacity += (skyTarget - this.skyMat.opacity) * Math.min(1, dt * 6);
    this.whiteSky.visible = this.skyMat.opacity > 0.01;

    for (const l of this.lamps) {
      // Lamps don't fade: they stutter, then settle, which is how salvaged fixtures fail.
      const diff = l.target - l.level;
      if (Math.abs(diff) > 0.001) {
        l.level += Math.sign(diff) * Math.min(Math.abs(diff), dt * 1.8);
        const stutter = Math.abs(diff) > 0.05 && Math.sin(elapsed * 40 + l.phase * 13) > 0.3 ? 0.25 : 1;
        l.light.intensity = l.base * l.level * stutter;
        if (l.mat) l.mat.emissiveIntensity = 1.6 * l.level * stutter;
      } else {
        // Out of sync by design: every ship's grid is a little different (LORE.md, Places).
        const hum = l.level > 0.5 ? 1 + Math.sin(elapsed * (2 + l.phase % 3) + l.phase) * 0.04 : 1;
        l.light.intensity = l.base * l.level * hum;
        if (l.mat) l.mat.emissiveIntensity = 1.6 * l.level;
      }
    }
    // The hall's general light follows its lamps, so a brown-out is actually dark.
    let hall = 0;
    let n = 0;
    for (const l of this.lamps) if (l.group === 'lamps') { hall += l.level; n++; }
    const lit = n ? hall / n : 1;
    this.hemi.intensity = 0.1 + 0.25 * lit;
    this.key.intensity = 0.08 + 0.27 * lit;

    if (this.relightShips) {
      for (const s of this.shipLamps) s.mat.color.lerp(s.base, Math.min(1, dt * 1.5));
      for (const m of this.hullMats) if (m.userData.lit !== undefined) m.emissiveIntensity += (m.userData.lit - m.emissiveIntensity) * Math.min(1, dt * 1.5);
    }
    const fansOn = !gameState.hasFlag('vessek_pulse') || gameState.hasFlag('vessek_power_restored');
    for (const f of this.fans) f.rotation.y += dt * (fansOn ? 6 : 0);

    if (!PanelManager.isOpen) this.tickFrost(dt);
  }

  onResize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
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

