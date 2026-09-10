import * as THREE from 'three';
import type { GameScene } from '../core/Engine';
import { PlayerController } from '../player/PlayerController';
import { InteractionSystem } from '../player/InteractionSystem';
import { UIManager } from '../ui/UIManager';
import { bus } from '../core/EventBus';
import { getSharedEnvironment } from '../core/Environment';
import { AudioSystem } from '../audio/AudioSystem';
import type { InteriorCtx, StatusLight } from './interior/ctx';
import { ROOM_W, ROOM_D } from './interior/ctx';
import { buildFloor } from './interior/floor';
import { buildWalls } from './interior/walls';
import { buildCeiling } from './interior/ceiling';
import { buildStarfieldWindow } from './interior/starfieldWindow';
import { buildAirlock } from './interior/airlock';
import { buildConsole } from './interior/console';
import { buildSuspendedDisplay } from './interior/suspendedDisplay';
import { buildDetailProps } from './interior/props';
import { buildLighting } from './interior/lighting';
import { batchStaticGeometry } from './interior/batchStaticGeometry';
import { mulberry32 } from '../core/rng';
import { buildInteriorColliders } from './interior/collision';

export class ShipInteriorScene implements GameScene {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.05, 500);
  player: PlayerController;
  interaction = new InteractionSystem();
  /**
   * Stable scene identity for the Playwright harnesses in tools/. They used to match on
   * `constructor.name`, which a production build mangles to a two-letter symbol — so every
   * tool waited out its timeout with no useful error against `vite preview`, and every
   * "all targets reachable" claim had only ever been checked against a dev build.
   */
  readonly kind = 'ShipInteriorScene';
  // Everything in this room that casts a shadow is static: the only animated *transforms* are the
  // two screen-sweep quads (console radar, suspended display), both MeshBasicMaterial overlays
  // with castShadow unset, and the one shadow-casting light (lighting.ts's key) only ripples its
  // intensity, which the depth map doesn't see. If a shadow-casting mesh or light ever starts
  // moving, either drop this flag or arm renderer.shadowMap.needsUpdate from its animation tick.
  readonly staticShadows = true;
  /**
   * Per-frame hook for a director that lives outside the scene — currently the opening tutorial,
   * which has to poll movement and the player's position but is owned by GameFlow, not by the room.
   * Driven from update(), so it stops with the engine while a panel is open rather than advancing
   * behind one.
   */
  onTick: ((dt: number, elapsed: number) => void) | null = null;

  private floorMeshes: THREE.Object3D[] = [];
  private consoleGlow: THREE.PointLight[] = [];
  private floorLedMats: THREE.MeshStandardMaterial[] = [];
  private starfield: THREE.Points | null = null;
  private emergencyLight: THREE.PointLight | null = null;
  private statusLights: StatusLight[] = [];
  private animated: ((elapsed: number, dt: number) => void)[] = [];
  private noMerge = new Set<THREE.Object3D>();
  private unsubShake: (() => void) | null = null;
  private stopAmbient: (() => void) | null = null;
  // Seeded: the emergency light's random spike was the last thing making two runs of the same build
  // render differently, which is what a frame diff has to be able to rule out.
  private flickerRng = mulberry32(0x3e07);

  constructor() {
    this.player = new PlayerController(this.camera, new THREE.Vector3(0, 1.7, 4));
  }

  private buildContext(): InteriorCtx {
    return {
      scene: this.scene,
      interaction: this.interaction,
      floorMeshes: this.floorMeshes,
      consoleGlow: this.consoleGlow,
      floorLedMats: this.floorLedMats,
      statusLights: this.statusLights,
      animated: this.animated,
      noMerge: this.noMerge,
      setStarfield: (points) => {
        this.starfield = points;
      },
      setEmergencyLight: (light) => {
        this.emergencyLight = light;
      },
    };
  }

  async init(): Promise<void> {
    UIManager.setLookPromptEnabled(true);
    this.scene.background = new THREE.Color(0x03040a);
    this.scene.environment = getSharedEnvironment();
    this.scene.environmentIntensity = 0.5;
    // Light haze so geometry beyond a few meters softens into the dark rather than cutting off
    // with a hard edge — the room is only 12 units deep, so density is kept low enough that the
    // console/airlock are still crisp from spawn.
    this.scene.fog = new THREE.FogExp2(0x05070c, 0.045);

    const ctx = this.buildContext();
    buildFloor(ctx);
    buildCeiling(ctx);
    buildStarfieldWindow(ctx);
    buildConsole(ctx);
    buildSuspendedDisplay(ctx);
    buildLighting(ctx);
    // buildWalls/buildAirlock/buildDetailProps each load real glTF kit pieces asynchronously and
    // add their own independent geometry — nothing else here reads what they produce, so they run
    // concurrently. batchStaticGeometry's merge pass below is documented (see its own header
    // comment) to require every builder's geometry to already be in the scene; these three used to
    // be fired without an await, so the merge ran against whatever had already loaded by then
    // (next to nothing, since GLTFLoader fetches are async) and left the rest of the room's
    // geometry — the whole airlock, both side walls, and every detail prop — streaming in afterward
    // as unbatched, unmerged individual draw calls, with each piece's load/parse/GPU-upload landing
    // as a hitch on whatever frame happened to be running when it resolved.
    await Promise.all([buildWalls(ctx), buildAirlock(ctx), buildDetailProps(ctx)]);
    // Read colliders off the props *before* batching: the merge pass collapses every mesh sharing a
    // material into one geometry, so afterwards a per-mesh bounding box would span the whole room.
    const propColliders = buildInteriorColliders(ctx);
    batchStaticGeometry(ctx);

    this.scene.add(this.player.rig);

    this.player.setFloorTargets(this.floorMeshes);
    // roomColliders() stays as the hand-authored backstop for the hull and the two pieces of
    // hardware with gameplay colliders; propColliders is everything the room's own geometry says
    // should be solid.
    this.player.setColliders([...this.roomColliders(), ...propColliders]);
    this.player.teleport(new THREE.Vector3(0, 1.7, 4), 0);
    // The deck is one sealed plane at y=0 with no pits, so this is a backstop against a physics
    // glitch rather than something reachable by walking.
    this.player.setRespawn(new THREE.Vector3(0, 1.7, 4), 0);
    this.player.fallResetY = -5;
    this.player.onFellOut = () => UIManager.toast('Recovered to the deck.');
    this.player.onFootstep = () => AudioSystem.playFootstep('metal');
    this.stopAmbient = AudioSystem.startAmbient(64, 0.035);

    this.interaction.onPromptChange = (label) => UIManager.setPrompt(label);
    this.unsubShake = bus.on('player:shake', (amount: number) => this.player.addShake(amount));

    bus.emit('scene:ship_interior:ready');
  }

  private roomColliders(): THREE.Box3[] {
    const inset = 0.4;
    return [
      // Airlock wall (+Z)
      new THREE.Box3(new THREE.Vector3(-ROOM_W / 2, 0, ROOM_D / 2 - 0.5), new THREE.Vector3(ROOM_W / 2, 3, ROOM_D / 2)),
      // Console wall (-Z)
      new THREE.Box3(new THREE.Vector3(-ROOM_W / 2, 0, -ROOM_D / 2), new THREE.Vector3(ROOM_W / 2, 3, -ROOM_D / 2 + 0.5)),
      new THREE.Box3(new THREE.Vector3(-ROOM_W / 2 - 1, 0, -ROOM_D / 2), new THREE.Vector3(-ROOM_W / 2 + inset, 3, ROOM_D / 2)),
      new THREE.Box3(new THREE.Vector3(ROOM_W / 2 - inset, 0, -ROOM_D / 2), new THREE.Vector3(ROOM_W / 2 + 1, 3, ROOM_D / 2)),
      // Console housing (3.0 x 1.1 x 0.7 centered 0, 0.55, -4.8 — DESK_Z in console.ts, -3.6 scaled
      // by the room rebuild's 4/3)
      new THREE.Box3(new THREE.Vector3(-1.5, 0, -5.15), new THREE.Vector3(1.5, 1.2, -4.45)),
      // Repair station (0.7 x 1.4 x 0.5 centered ROOM_W/2-0.5, 0.7, 2.933 — 2.2 scaled by 4/3)
      new THREE.Box3(new THREE.Vector3(ROOM_W / 2 - 0.85, 0, 2.683), new THREE.Vector3(ROOM_W / 2 - 0.15, 1.4, 3.183)),
    ];
  }

  update(dt: number, elapsed: number): void {
    this.player.update(dt);
    this.interaction.update(this.camera);
    for (const light of this.consoleGlow) {
      light.intensity = 1.5 + Math.sin(elapsed * 2.2) * 0.25;
    }
    if (this.starfield) this.starfield.rotation.y += dt * 0.0015;
    for (const mat of this.floorLedMats) {
      mat.emissiveIntensity = 0.9 + Math.sin(elapsed * 0.8) * 0.15;
    }
    if (this.emergencyLight) {
      this.emergencyLight.intensity = 1.1 + Math.sin(elapsed * 3.1) * 0.2 + (this.flickerRng() < 0.02 ? 0.4 : 0);
    }
    for (const status of this.statusLights) {
      const on = Math.sin(elapsed * 5 + status.phase) > 0.4;
      status.material.emissiveIntensity = on ? status.onIntensity : 0.15;
    }
    for (const tick of this.animated) tick(elapsed, dt);
    this.onTick?.(dt, elapsed);
  }

  onResize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.unsubShake?.();
    this.stopAmbient?.();
    this.interaction.clear();
    this.animated.length = 0;
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
  }
}
