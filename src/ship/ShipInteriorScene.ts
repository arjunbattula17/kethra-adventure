import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { displayFontsReady } from '../core/loadFonts';
import type { GameScene } from '../core/Engine';
import { PlayerController } from '../player/PlayerController';
import { InteractionSystem } from '../player/InteractionSystem';
import { UIManager } from '../ui/UIManager';
import { bus } from '../core/EventBus';
import { disposeSceneTextures, downscaleCanvasTextures } from '../core/disposeSceneTextures';
import { clearMemoTextures } from '../core/memoTexture';
import { getActiveEngine } from '../core/EngineRegistry';
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
import { gameState } from '../core/GameState';
import { ShipPower, powerStageFor } from './interior/power';

const _ledColour = new THREE.Color();

/** A repeatable pseudo-random number in [0, 1) for an integer slot. */
function hash01(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** Point lights kept in the room at the default tiers; see applyLightBudget. */
const POINT_LIGHT_BUDGET = 16;

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
  private readonly ownLight = new Set<object>();
  /** The Wren's power stage; First light (M2) animates it from here. */
  readonly power = new ShipPower();
  private statusLights: StatusLight[] = [];
  private animated: ((elapsed: number, dt: number) => void)[] = [];
  private noMerge = new Set<THREE.Object3D>();
  private unsubShake: (() => void) | null = null;
  private stopAmbient: (() => void) | null = null;
  private stopMusic: (() => void) | null = null;
  // Seeded: the emergency light's random spike was the last thing making two runs of the same build
  // render differently, which is what a frame diff has to be able to rule out.
  private flickerSeed = mulberry32(0x3e07)() * 1000;

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
      animatedMaterials: new Set(),
      ownLight: this.ownLight,
      setStarfield: (points) => {
        this.starfield = points;
      },
      setEmergencyLight: (light) => {
        this.emergencyLight = light;
      },
    };
  }

  async init(): Promise<void> {
    // Signage and screens are drawn onto canvases in the game's own faces: wait for them, or the
    // textures bake the fallback font for the whole visit.
    await displayFontsReady();
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
    // The steady levels the old per-frame pulse used to force these to (it centred on them).
    for (const light of this.consoleGlow) light.intensity = 1.5;
    for (const mat of this.floorLedMats) mat.emissiveIntensity = 0.9;
    // Read colliders off the props *before* batching: the merge pass collapses every mesh sharing a
    // material into one geometry, so afterwards a per-mesh bounding box would span the whole room.
    const propColliders = buildInteriorColliders(ctx);
    this.instanceStatusLights();
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
    this.stopMusic = AudioSystem.startMusic('wren');
    this.player.onLand = (s) => AudioSystem.playLand(s);

    this.interaction.onPromptChange = (label) => UIManager.setPrompt(label);
    this.unsubShake = bus.on('player:shake', (amount: number) => this.player.addShake(amount));

    // The same memory budget the texture cache applies to the kits' file textures, extended to
    // this room's ~130 generated canvases (~170MB at full size) — the shared-VRAM tier's biggest
    // remaining texture population. Runs before the scene's first render, so full-size canvases
    // are never uploaded. (Module-cached canvases stay halved for the rest of the session if the
    // player later switches tiers by hand — same trade the kit cache makes, minus its refetch.)
    if (getActiveEngine()?.getQualityTier() === 'low') downscaleCanvasTextures(this.scene, 1024);

    this.applyLightBudget(getActiveEngine()?.getQualityTier() === 'low' ? 8 : POINT_LIGHT_BUDGET);
    // The Wren's power stage (power.ts), read off the save: emergency until navigation boots.
    if (this.starfield) this.ownLight.add(this.starfield).add(this.starfield.material as THREE.Material);
    this.power.collect(this.scene, this.ownLight, this.floorLedMats);
    this.power.apply(powerStageFor((f) => gameState.hasFlag(f)));
    bus.emit('scene:ship_interior:ready');
  }

  /**
   * The start-up benchmark can lower the tier after this room was built for a higher one; this
   * brings the room down to the Performance tier's own budget (8 lights, halved canvases) too.
   */
  adaptToTier(tier: 'low' | 'medium' | 'high'): void {
    if (tier !== 'low') return;
    this.applyLightBudget(8);
    downscaleCanvasTextures(this.scene, 1024);
  }

  /**
   * Keeps only the strongest point lights. three.js writes every point light into every lit shader
   * as an unrolled block of code, so the room's 41 lights made each of its ~93 shader programs
   * very long, and the first load on a fresh browser spent over a minute compiling them (measured:
   * 65 s to the intro on this project's dev PC). The 25 weakest lights are small glows whose
   * fixtures already glow on their own; dropping them left the room within 2/255 per pixel of the
   * original across five views (docs/PERF_LOG.md) and halved that load. Scored by intensity times
   * reach squared, which is roughly how much of the room each light can touch.
   */
  private applyLightBudget(max: number): void {
    const lights: THREE.PointLight[] = [];
    this.scene.traverse((o) => {
      if ((o as THREE.PointLight).isPointLight) lights.push(o as THREE.PointLight);
    });
    const reach = (l: THREE.PointLight) => l.intensity * l.distance * l.distance;
    lights.sort((a, b) => reach(b) - reach(a));
    for (const l of lights.slice(max)) {
      l.removeFromParent();
      this.consoleGlow = this.consoleGlow.filter((c) => c !== l);
      if (this.emergencyLight === l) this.emergencyLight = null;
    }
  }

  /**
   * The room's blinking status LEDs, about 78 of them across eleven modules, each built as its own
   * mesh with its own material (so the blink loop could drive it): one draw call apiece. Here they
   * become one merged, unlit mesh (an LED is its own light) with a colour per vertex; a blink
   * rewrites only that LED's vertex range, and only when it flips.
   */
  private instanceStatusLights(): void {
    if (!this.statusLights.length) return;
    const parts: THREE.BufferGeometry[] = [];
    let offset = 0;
    for (const s of this.statusLights) {
      s.mesh.updateWorldMatrix(true, false);
      let g = s.mesh.geometry.clone();
      if (g.index) g = g.toNonIndexed();
      for (const name of Object.keys(g.attributes)) if (name !== 'position') g.deleteAttribute(name);
      g.applyMatrix4(s.mesh.matrixWorld);
      const count = g.getAttribute('position').count;
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
      parts.push(g);
      const base = s.material.emissive.clone();
      this.blinkers.push({ start: offset, count, base, phase: s.phase, onIntensity: s.onIntensity, on: null });
      offset += count;
      s.mesh.removeFromParent();
    }
    const geo = mergeGeometries(parts, false)!;
    for (const g of parts) g.dispose();
    this.ledColours = geo.getAttribute('color') as THREE.BufferAttribute;
    const sheet = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true }));
    sheet.name = 'status-leds';
    this.noMerge.add(sheet);
    this.scene.add(sheet);
    this.statusLights.length = 0;
  }
  private blinkers: { start: number; count: number; base: THREE.Color; phase: number; onIntensity: number; on: boolean | null }[] = [];
  private ledColours: THREE.BufferAttribute | null = null;

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
    // While a scripted pose holds the player (seated, leaning over the chart), nothing is on offer.
    if (this.player.enabled) this.interaction.update(this.camera);
    if (this.starfield) this.starfield.rotation.y += dt * 0.0015;
    if (this.emergencyLight) {
      // A spike in roughly one of every eight 1/6 s slots: decided per slot of time, not per frame,
      // so it flickers at the same rate at 30 Hz and 144 Hz. Seeded, so frame diffs stay stable.
      const slot = Math.floor(elapsed * 6);
      const spike = hash01(slot + this.flickerSeed) < 0.12 ? 0.4 : 0;
      this.emergencyLight.intensity = 1.1 + Math.sin(elapsed * 3.1) * 0.2 + spike;
    }
    let flipped = false;
    for (const b of this.blinkers) {
      const on = Math.sin(elapsed * 5 + b.phase) > 0.4;
      if (on === b.on) continue;
      b.on = on;
      _ledColour.copy(b.base).multiplyScalar(on ? b.onIntensity : 0.15);
      for (let v = b.start; v < b.start + b.count; v++) this.ledColours!.setXYZ(v, _ledColour.r, _ledColour.g, _ledColour.b);
      flipped = true;
    }
    if (flipped) this.ledColours!.needsUpdate = true;
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
    this.stopMusic?.();
    this.interaction.clear();
    this.animated.length = 0;
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
    disposeSceneTextures(this.scene);
    clearMemoTextures();
  }
}
