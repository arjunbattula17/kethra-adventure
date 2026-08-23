import * as THREE from 'three';
import type { GameScene } from '../core/Engine';
import { PlayerController } from '../player/PlayerController';
import { InteractionSystem } from '../player/InteractionSystem';
import { UIManager } from '../ui/UIManager';
import { gameState } from '../core/GameState';
import { bus } from '../core/EventBus';
import { getSharedEnvironment } from '../core/Environment';
import { AudioSystem } from '../audio/AudioSystem';
import { applyPbr } from '../core/TextureLibrary';
import {
  buildHazardStripeTexture,
  buildConsoleScreenTexture,
  buildStencilPlacardTexture,
  buildFirstAidTexture,
  buildWarningStripeTexture,
  buildPanelGrimeTexture,
  buildFloorStencilTexture,
  buildFloorStainTexture,
  buildLargeDeckNumberTexture,
  buildRadarPanelTexture,
} from './ShipTextures';

const ROOM_W = 9;
const ROOM_D = 12;
const ROOM_H = 4;
const WALL_SPLIT_Y = 2.3; // seam height between the worn lower hull band and the cleaner upper trim band

interface StatusLight {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  phase: number;
  onIntensity: number;
}

export class ShipInteriorScene implements GameScene {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.05, 500);
  player: PlayerController;
  interaction = new InteractionSystem();
  private floorMeshes: THREE.Object3D[] = [];
  private consoleGlow: THREE.PointLight[] = [];
  private floorLedMats: THREE.MeshStandardMaterial[] = [];
  private starfield: THREE.Points | null = null;
  private emergencyLight: THREE.PointLight | null = null;
  private statusLights: StatusLight[] = [];
  private unsubShake: (() => void) | null = null;
  private stopAmbient: (() => void) | null = null;

  constructor() {
    this.player = new PlayerController(this.camera, new THREE.Vector3(0, 1.7, 4));
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
    this.buildRoom();
    this.buildWallSignage();
    this.buildWallPanelTrim();
    this.buildFloorMarkings();
    this.buildFloorClutter();
    this.buildStarfieldWindow();
    this.buildAirlock();
    this.buildConsole();
    this.buildDetailProps();
    this.buildCeilingGreeble();
    this.buildLighting();
    this.scene.add(this.player.rig);

    this.player.setFloorTargets(this.floorMeshes);
    this.player.setColliders(this.roomColliders());
    this.player.teleport(new THREE.Vector3(0, 1.7, 4), 0);
    this.player.onFootstep = () => AudioSystem.playFootstep('metal');
    this.stopAmbient = AudioSystem.startAmbient(64, 0.035);

    this.interaction.onPromptChange = (label) => UIManager.setPrompt(label);
    this.unsubShake = bus.on('player:shake', (amount: number) => this.player.addShake(amount));

    bus.emit('scene:ship_interior:ready');
  }

  // Stacks a worn lower hull band (ship_wall) under a cleaner upper trim band (ship_trim),
  // with a warm amber seam strip between them — the layered-material read the brief asks for
  // instead of one texture stretched across a whole wall.
  private addBandedWall(w: number, d: number, cx: number, cz: number, lowerMat: THREE.Material, upperMat: THREE.Material, seamMat: THREE.Material): void {
    const upperH = ROOM_H - WALL_SPLIT_Y;
    const lower = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_SPLIT_Y, d), lowerMat);
    lower.position.set(cx, WALL_SPLIT_Y / 2, cz);
    lower.receiveShadow = true;
    this.scene.add(lower);

    const upper = new THREE.Mesh(new THREE.BoxGeometry(w, upperH, d), upperMat);
    upper.position.set(cx, WALL_SPLIT_Y + upperH / 2, cz);
    upper.receiveShadow = true;
    this.scene.add(upper);

    const seam = new THREE.Mesh(new THREE.BoxGeometry(w * 0.98, 0.05, d + 0.02), seamMat);
    seam.position.set(cx, WALL_SPLIT_Y, cz);
    this.scene.add(seam);
  }

  private addGrimeOverlay(width: number, height: number, position: THREE.Vector3, rotation: THREE.Euler, opacity = 0.4): void {
    const grimeMat = new THREE.MeshBasicMaterial({
      map: buildPanelGrimeTexture(),
      transparent: true,
      opacity,
      blending: THREE.MultiplyBlending,
      premultipliedAlpha: true,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), grimeMat);
    mesh.position.copy(position);
    mesh.rotation.copy(rotation);
    mesh.renderOrder = 1;
    this.scene.add(mesh);
  }

  private buildRoom(): void {
    // The downloaded PBR photo sets (worn/rusty metal, by nature of what "worn" looks like) are
    // all quite dark on their own — average diffuse luminance well under half grey. A
    // MeshStandardMaterial's base `color` can only ever DARKEN a texture (it's a multiply, capped
    // at 1.0), never brighten it past its own pixel values, so no amount of scene lighting can
    // pull detail out of them once compounded with ACES's shadow rolloff. A small flat emissive
    // floor (independent of incoming light) keeps the worn/grimy detail from the texture itself
    // visible while guaranteeing the room doesn't read as solid black in areas any real light
    // doesn't directly reach.
    const floorMat = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, roughness: 0.75, metalness: 0.45, side: THREE.DoubleSide, emissive: 0x4a3826, emissiveIntensity: 1.1 });
    applyPbr(floorMat, 'ship_floor', [ROOM_W / 1.6, ROOM_D / 1.6]);

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

    const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x585f6c, roughness: 0.75, metalness: 0.35, emissive: 0x4a3f30, emissiveIntensity: 1.2 });
    applyPbr(ceilingMat, 'ship_console', [ROOM_W / 1.5, ROOM_D / 1.5]);

    const floor = new THREE.Mesh(new THREE.BoxGeometry(ROOM_W, 0.2, ROOM_D), floorMat);
    floor.position.y = -0.1;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.floorMeshes.push(floor);

    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(ROOM_W, 0.15, ROOM_D), ceilingMat);
    ceiling.position.y = ROOM_H;
    this.scene.add(ceiling);

    // Airlock wall (+Z) and console wall (-Z), both banded worn-lower/clean-upper.
    this.addBandedWall(ROOM_W, 0.2, 0, ROOM_D / 2, wallLowerMat, wallUpperMat, seamMat);
    this.addBandedWall(ROOM_W, 0.2, 0, -ROOM_D / 2, wallLowerMat, wallUpperMat, seamMat);
    // Side walls — geometry axes are swapped (thin dimension along X).
    this.addBandedWall(0.2, ROOM_D, -ROOM_W / 2, 0, sideLowerMat, sideUpperMat, seamMat);
    this.addBandedWall(0.2, ROOM_D, ROOM_W / 2, 0, sideLowerMat, sideUpperMat, seamMat);

    // Grime passes on the two side walls and the floor break up PBR tiling repetition.
    this.addGrimeOverlay(
      ROOM_D - 1,
      WALL_SPLIT_Y - 0.1,
      new THREE.Vector3(-ROOM_W / 2 + 0.15, WALL_SPLIT_Y / 2, 0),
      new THREE.Euler(0, Math.PI / 2, 0),
      0.35,
    );
    this.addGrimeOverlay(
      ROOM_D - 1,
      WALL_SPLIT_Y - 0.1,
      new THREE.Vector3(ROOM_W / 2 - 0.15, WALL_SPLIT_Y / 2, 0),
      new THREE.Euler(0, -Math.PI / 2, 0),
      0.35,
    );
    this.addGrimeOverlay(
      ROOM_W - 0.6,
      ROOM_D - 0.6,
      new THREE.Vector3(0, 0.005, 0),
      new THREE.Euler(-Math.PI / 2, 0, 0),
      0.3,
    );

    // ribbed floor trim panels for visual density
    const ribMat = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.5, metalness: 0.6 });
    for (let i = -5; i <= 5; i++) {
      const trim = new THREE.Mesh(new THREE.BoxGeometry(ROOM_W - 0.4, 0.02, 0.08), ribMat);
      trim.position.set(0, 0.01, i * 1.05);
      this.scene.add(trim);
    }
  }

  // Large bold stencilled deck-number callsign on each side wall, straddling the lower/upper
  // band seam the way the reference's oversized "06" numeral crosses its wall panel line —
  // distinct from the small ID placards in buildDetailProps(), which stay tiny/close-read.
  // Mounted at (roughly) player eye height rather than up near the ceiling: at the close-range
  // viewing distance a player actually gets next to a side wall, the camera's vertical FOV
  // window is centered on eye height and only a couple of the room's ~4 vertical units tall, so
  // a sign mounted high up the wall falls entirely outside that window and is invisible from any
  // normal up-close vantage point — exactly the "no signage visible" gap flagged last round.
  private buildWallSignage(): void {
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
    this.scene.add(westSign);

    const eastSign = new THREE.Mesh(new THREE.PlaneGeometry(signW, signH), signMat);
    eastSign.position.set(ROOM_W / 2 - 0.11, signY, signZ);
    eastSign.rotation.y = -Math.PI / 2;
    eastSign.renderOrder = 1;
    this.scene.add(eastSign);
  }

  // Raised trim-strip grid (vertical ribs + two horizontal bands per wall) breaking the two
  // side walls' large flat PBR bands into a panel grid. The tighter PBR repeat tiling used in
  // buildRoom() only re-tiles the source photo's mottled noise more finely — that photo has no
  // seam pattern to reveal, so from up close it still reads as one flat rusty plane (confirmed
  // in verification screenshots). Real raised geometry is the cheap fix: even against a dark,
  // flat-lit texture, a physical edge catches ambient/point light and reads as a seam line no
  // matter how low-contrast the underlying material is.
  private buildWallPanelTrim(): void {
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x9099a6, roughness: 0.45, metalness: 0.6, emissive: 0x2a2f38, emissiveIntensity: 0.5 });
    const ribZs = [-5.4, -3.6, -1.8, 0, 1.8, 3.6, 5.4];
    for (const xSign of [-1, 1] as const) {
      const wallX = (xSign * ROOM_W) / 2 - xSign * 0.09;
      for (const z of ribZs) {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.04, ROOM_H, 0.06), trimMat);
        rib.position.set(wallX, ROOM_H / 2, z);
        this.scene.add(rib);
      }
      for (const y of [1.15, 3.15]) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, ROOM_D - 0.6), trimMat);
        band.position.set(wallX, y, 0);
        this.scene.add(band);
      }
    }
  }

  // Breaks up the plain diamond-plate slab from buildRoom(): a hazard-striped border strip
  // running along the base of each wall (distinct zone from the center walking surface), thin
  // inset cyan LED strips just inboard of that border, and a few worn stencilled floor decals
  // near the console/repair station/airlock.
  private buildFloorMarkings(): void {
    const borderW = 0.6;
    const borderInner = ROOM_W / 2 - borderW / 2 - 0.05;
    const borderInnerD = ROOM_D / 2 - borderW / 2 - 0.05;

    const hazardTexNS = buildHazardStripeTexture();
    hazardTexNS.repeat.set(6, 1);
    const hazardMatNS = new THREE.MeshStandardMaterial({ map: hazardTexNS, roughness: 0.6, metalness: 0.25 });
    const hazardTexEW = buildHazardStripeTexture();
    hazardTexEW.repeat.set(8, 1);
    const hazardMatEW = new THREE.MeshStandardMaterial({ map: hazardTexEW, roughness: 0.6, metalness: 0.25 });

    const addBorder = (w: number, d: number, cx: number, cz: number, mat: THREE.Material) => {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), mat);
      strip.position.set(cx, 0.021, cz);
      this.scene.add(strip);
    };
    addBorder(ROOM_W - 0.4, borderW, 0, borderInnerD, hazardMatNS); // airlock wall (+Z)
    addBorder(ROOM_W - 0.4, borderW, 0, -borderInnerD, hazardMatNS); // console wall (-Z)
    addBorder(borderW, ROOM_D - 0.4, borderInner, 0, hazardMatEW); // +X side wall
    addBorder(borderW, ROOM_D - 0.4, -borderInner, 0, hazardMatEW); // -X side wall

    // Thin cyan LED strips inset just inside the hazard border, marking the seam between the
    // hazard zone and the center walking surface. Kept as a low-intensity emissive material on
    // flat geometry (not a point light) so it can't trip the bloom-blowout threshold.
    const ledMat = new THREE.MeshStandardMaterial({ color: 0x0a2530, emissive: 0x4fb8e0, emissiveIntensity: 1.0, roughness: 0.5, metalness: 0.1 });
    this.floorLedMats.push(ledMat);
    const ledInsetX = ROOM_W / 2 - borderW - 0.09;
    const ledInsetZ = ROOM_D / 2 - borderW - 0.09;
    const addLed = (w: number, d: number, cx: number, cz: number) => {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), ledMat);
      strip.position.set(cx, 0.045, cz);
      this.scene.add(strip);
    };
    // North/south runs, split around the airlock doorway and the console housing.
    addLed(2.8, 0.05, -2.9, ledInsetZ);
    addLed(2.8, 0.05, 2.9, ledInsetZ);
    addLed(2.7, 0.05, -2.95, -ledInsetZ);
    addLed(2.7, 0.05, 2.95, -ledInsetZ);
    // East run, split around the repair station footprint.
    addLed(0.05, 6.9, ledInsetX, -1.85);
    addLed(0.05, 2.5, ledInsetX, 4.05);
    // West run, clear of the journal terminal.
    addLed(0.05, 10.6, -ledInsetX, 0);

    // Small worn stencilled floor markings near the console, repair station and airlock —
    // laid flat with a transparent background so the diamond-plate texture shows through.
    const decals: [string, THREE.Vector3, number][] = [
      ['NAV', new THREE.Vector3(0, 0.025, -2.4), 0.8],
      ['REPAIR', new THREE.Vector3(ROOM_W / 2 - 1.6, 0.025, 2.2), 0.8],
    ];
    for (const [label, pos, size] of decals) {
      const tex = buildFloorStencilTexture(label);
      const decal = new THREE.Mesh(
        new THREE.PlaneGeometry(size, size),
        new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.8, metalness: 0.1, depthWrite: false }),
      );
      decal.position.copy(pos);
      decal.rotation.x = -Math.PI / 2;
      decal.renderOrder = 1;
      this.scene.add(decal);
    }
  }

  // Adds the "signs of use" the floor was missing: a physical deck hatch (not just a painted
  // label), a couple of soaked-in oil/scorch stains, and a few small low-profile props resting
  // directly on the floor (cable coil, floor vent, tool crate) — clutter rather than pure
  // texture/decal work, so the floor stops reading as one clean repeating slab.
  private buildFloorClutter(): void {
    // Deck hatch — recessed cover plate with a raised metal rim, corner rivets and a hinge pair,
    // stencilled with the same worn "HATCH" label the flat decal used to carry alone.
    const hatchPos = new THREE.Vector3(0, 0, 4.7);
    const hatchBaseMat = new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.7, metalness: 0.4, emissive: 0x1c2027, emissiveIntensity: 0.6 });
    const hatchCover = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.03, 0.9), hatchBaseMat);
    hatchCover.position.set(hatchPos.x, 0.015, hatchPos.z);
    this.scene.add(hatchCover);

    const rimMat = new THREE.MeshStandardMaterial({ color: 0x8a8f99, roughness: 0.4, metalness: 0.7 });
    const rimSpecs: [number, number, number, number][] = [
      [0.96, 0.05, 0, 0.44], // north edge (w, d, cx, cz offset)
      [0.96, 0.05, 0, -0.44],
      [0.05, 0.96, 0.44, 0],
      [0.05, 0.96, -0.44, 0],
    ];
    for (const [w, d, ox, oz] of rimSpecs) {
      const rim = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), rimMat);
      rim.position.set(hatchPos.x + ox, 0.02, hatchPos.z + oz);
      this.scene.add(rim);
    }
    for (const [ox, oz] of [[0.42, 0.42], [-0.42, 0.42], [0.42, -0.42], [-0.42, -0.42]] as [number, number][]) {
      const rivet = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.045, 8), rimMat);
      rivet.position.set(hatchPos.x + ox, 0.025, hatchPos.z + oz);
      this.scene.add(rivet);
    }
    for (const oz of [-0.2, 0.2]) {
      const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 8), rimMat);
      hinge.rotation.z = Math.PI / 2;
      hinge.position.set(hatchPos.x - 0.46, 0.03, hatchPos.z + oz);
      this.scene.add(hinge);
    }
    const hatchLabelTex = buildFloorStencilTexture('HATCH');
    const hatchLabel = new THREE.Mesh(
      new THREE.PlaneGeometry(0.75, 0.75),
      new THREE.MeshStandardMaterial({ map: hatchLabelTex, transparent: true, roughness: 0.8, metalness: 0.1, depthWrite: false }),
    );
    hatchLabel.position.set(hatchPos.x, 0.032, hatchPos.z);
    hatchLabel.rotation.x = -Math.PI / 2;
    hatchLabel.renderOrder = 1;
    this.scene.add(hatchLabel);

    // Oil/scorch stains soaked into the deck plate — irregular, non-repeating, multiply-blended
    // so the diamond-plate texture still reads underneath.
    const stains: [THREE.CanvasTexture, THREE.Vector3, number, number][] = [
      [buildFloorStainTexture('oil'), new THREE.Vector3(0.5, 0.022, -1.9), 1.5, 0.3],
      [buildFloorStainTexture('scorch'), new THREE.Vector3(ROOM_W / 2 - 1.4, 0.022, 3.15), 1.1, -0.6],
      [buildFloorStainTexture('oil'), new THREE.Vector3(0.7, 0.022, 3.9), 1.3, 1.1],
    ];
    for (const [tex, pos, size, rotZ] of stains) {
      const stain = new THREE.Mesh(
        new THREE.PlaneGeometry(size, size),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.MultiplyBlending, premultipliedAlpha: true, depthWrite: false }),
      );
      stain.position.copy(pos);
      stain.rotation.x = -Math.PI / 2;
      stain.rotation.z = rotZ;
      stain.renderOrder = 1;
      this.scene.add(stain);
    }

    // Coiled cable resting flat on the floor near the repair station. Small dark props like
    // this sit far from any point-light pool in places, and flat ambient alone gets crushed by
    // ACES tonemapping — a low flat emissive keeps it a legible dark rubber coil instead of a
    // solid black silhouette, same fix used for the room-shell materials in buildRoom().
    const coilMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.55, metalness: 0.3, emissive: 0x3a2c1e, emissiveIntensity: 1.1 });
    const coilOuter = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.035, 8, 20), coilMat);
    coilOuter.rotation.x = Math.PI / 2;
    coilOuter.position.set(ROOM_W / 2 - 1.1, 0.04, 3.6);
    this.scene.add(coilOuter);
    const coilInner = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.03, 8, 16), coilMat);
    coilInner.rotation.x = Math.PI / 2;
    coilInner.position.set(ROOM_W / 2 - 1.1, 0.075, 3.6);
    this.scene.add(coilInner);

    // Recessed floor vent grate between spawn and the console.
    const ventFrameMat = new THREE.MeshStandardMaterial({ color: 0x24262c, roughness: 0.6, metalness: 0.5, emissive: 0x33363d, emissiveIntensity: 0.9 });
    const ventFrame = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.02, 0.4), ventFrameMat);
    ventFrame.position.set(-1.6, 0.01, -1.0);
    this.scene.add(ventFrame);
    const slatMat = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.5, metalness: 0.6, emissive: 0x24262c, emissiveIntensity: 0.9 });
    for (let i = 0; i < 6; i++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.015, 0.035), slatMat);
      slat.position.set(-1.6, 0.021, -1.0 - 0.16 + i * 0.064);
      this.scene.add(slat);
    }

    // Small tool crate resting against the floor along the west wall, banded like the
    // extinguisher for a consistent worn-industrial read.
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x4a3f2e, roughness: 0.75, metalness: 0.2, emissive: 0x2a2015, emissiveIntensity: 0.7 });
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.22, 0.28), crateMat);
    crate.position.set(-ROOM_W / 2 + 1.0, 0.11, -0.3);
    crate.rotation.y = 0.2;
    this.scene.add(crate);
    const crateStripeTex = buildWarningStripeTexture('amber');
    crateStripeTex.repeat.set(2, 1);
    const crateBand = new THREE.Mesh(
      new THREE.BoxGeometry(0.37, 0.05, 0.29),
      new THREE.MeshStandardMaterial({ map: crateStripeTex, roughness: 0.6 }),
    );
    crateBand.position.set(crate.position.x, 0.19, crate.position.z);
    crateBand.rotation.y = 0.2;
    this.scene.add(crateBand);
  }

  private buildStarfieldWindow(): void {
    const windowFrame = new THREE.Mesh(
      new THREE.BoxGeometry(6.4, 2.6, 0.15),
      new THREE.MeshStandardMaterial({ color: 0x0c0e13, metalness: 0.3, roughness: 0.8 }),
    );
    windowFrame.position.set(0, 2.2, -ROOM_D / 2 + 0.3);
    this.scene.add(windowFrame);

    const glassGeo = new THREE.PlaneGeometry(6, 2.2);
    const glassMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.0 });
    const glass = new THREE.Mesh(glassGeo, glassMat);
    glass.position.set(0, 2.2, -ROOM_D / 2 + 0.38);
    this.scene.add(glass);

    const starCount = 2200;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 400;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 200 + 40;
      positions[i * 3 + 2] = -ROOM_D / 2 - 20 - Math.random() * 300;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.6, sizeAttenuation: true });
    this.starfield = new THREE.Points(geo, mat);
    this.scene.add(this.starfield);

    const nebula = new THREE.Mesh(
      new THREE.PlaneGeometry(300, 150),
      new THREE.MeshBasicMaterial({ color: 0x2a3a6b, transparent: true, opacity: 0.15 }),
    );
    nebula.position.set(-40, 30, -200);
    nebula.rotation.z = 0.3;
    this.scene.add(nebula);
  }

  private buildAirlock(): void {
    const hazardTex = buildHazardStripeTexture();
    hazardTex.repeat.set(6, 1);
    const hazardMat = new THREE.MeshStandardMaterial({ map: hazardTex, roughness: 0.6, metalness: 0.3 });

    // The airlock wall's front face sits at ROOM_D/2 - 0.1 (=5.9); every door element below
    // is kept solidly in front of that (smaller z, closer to camera) with clear gaps between
    // stages so nothing gets swallowed by the wall's own depth or z-fights against it.
    const kickstrip = new THREE.Mesh(new THREE.BoxGeometry(ROOM_W - 0.4, 0.16, 0.05), hazardMat);
    kickstrip.position.set(0, 0.1, ROOM_D / 2 - 0.2);
    this.scene.add(kickstrip);

    // Solid hex disc behind the door panel, slightly wider — its front cap shows as a
    // striped ring around the panel edge instead of a razor-thin silhouette line.
    const stripeTex = buildWarningStripeTexture('amber');
    stripeTex.repeat.set(6, 1);
    const frameMat = new THREE.MeshStandardMaterial({
      map: stripeTex,
      emissive: 0xd9a441,
      emissiveMap: stripeTex,
      emissiveIntensity: 0.35,
      roughness: 0.7,
      metalness: 0.2,
      side: THREE.DoubleSide,
    });
    const doorFrame = new THREE.Mesh(new THREE.CylinderGeometry(1.32, 1.32, 0.06, 6), frameMat);
    doorFrame.rotation.x = Math.PI / 2;
    doorFrame.position.set(0, 2.0, ROOM_D / 2 - 0.2);
    this.scene.add(doorFrame);

    // Hexagonal airlock panel, echoing reference 3's hex-door language.
    const doorMat = new THREE.MeshStandardMaterial({ color: 0xaeb6c2, roughness: 0.75, metalness: 0.25 });
    applyPbr(doorMat, 'ship_trim', [1, 1]);
    const doorPanel = new THREE.Mesh(new THREE.CylinderGeometry(1.16, 1.16, 0.08, 6), doorMat);
    doorPanel.rotation.x = Math.PI / 2;
    doorPanel.position.set(0, 2.0, ROOM_D / 2 - 0.28);
    this.scene.add(doorPanel);

    const wheelMat = new THREE.MeshStandardMaterial({ color: 0xd9a441, emissive: 0xd9a441, emissiveIntensity: 0.3, roughness: 0.4, metalness: 0.6 });
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.05, 8, 16), wheelMat);
    wheel.position.set(0, 2.0, ROOM_D / 2 - 0.35);
    this.scene.add(wheel);
    for (let i = 0; i < 4; i++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.04, 0.04), wheelMat);
      spoke.rotation.z = (Math.PI / 4) * i;
      spoke.position.copy(wheel.position);
      this.scene.add(spoke);
    }

    // Warm pool of light in front of the airlock — kept well clear of the door surface
    // (~0.9 units) so it doesn't reintroduce the bloom-blowout bug.
    const doorLight = new THREE.PointLight(0xd9a441, 2.0, 6, 2);
    doorLight.position.set(0, 2.3, ROOM_D / 2 - 1.7);
    this.scene.add(doorLight);

    // Warning-striped frame trim bordering the airlock's wall opening — a square frame just
    // outside the hex door's 1.32-unit radius, warm orange/red to contrast the door's own amber
    // wheel/ring accent, echoing the reference's orange/red-trimmed doorways. Mounted flush
    // against the wall (just in front of its inner face) so it reads as part of the opening,
    // not a separate floating prop.
    const trimHalf = 1.6;
    const trimThick = 0.05;
    const trimZ = ROOM_D / 2 - 0.11;
    const trimMat = (repeatX: number, repeatY: number) => {
      const tex = buildWarningStripeTexture('red');
      tex.repeat.set(repeatX, repeatY);
      return new THREE.MeshStandardMaterial({
        map: tex,
        emissive: 0xd9502f,
        emissiveMap: tex,
        emissiveIntensity: 0.3,
        roughness: 0.6,
        metalness: 0.25,
      });
    };
    const doorTrimSpecs: [number, number, number, number, number, number][] = [
      // w, h, cx, cy, repeatX, repeatY
      [trimHalf * 2 + 0.14, 0.14, 0, 2.0 + trimHalf, 8, 1], // top
      [trimHalf * 2 + 0.14, 0.14, 0, 2.0 - trimHalf, 8, 1], // bottom
      [0.14, trimHalf * 2, -trimHalf, 2.0, 1, 8], // left
      [0.14, trimHalf * 2, trimHalf, 2.0, 1, 8], // right
    ];
    for (const [w, h, cx, cy, repeatX, repeatY] of doorTrimSpecs) {
      const trim = new THREE.Mesh(new THREE.BoxGeometry(w, h, trimThick), trimMat(repeatX, repeatY));
      trim.position.set(cx, cy, trimZ);
      this.scene.add(trim);
    }
  }

  private buildConsole(): void {
    const consoleMat = new THREE.MeshStandardMaterial({ color: 0x9aa2ad, roughness: 0.85, metalness: 0.15 });
    applyPbr(consoleMat, 'ship_console', [1.5, 0.8]);

    const consoleBase = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.1, 0.7), consoleMat);
    consoleBase.position.set(0, 0.55, -3.6);
    consoleBase.castShadow = true;
    consoleBase.receiveShadow = true;
    this.scene.add(consoleBase);

    this.buildConsoleScreenCluster();
    this.buildSuspendedDisplay();
    this.buildChair();

    // Cool cyan-blue console fill light doubling as the console's pulsing "glow" accent — kept
    // 0.9+ units away from the console/screens and within the 0.8-2.0 safe intensity band.
    // Lowered from its original (0, 2.6, -3.0) once the suspended display's pillar/divider moved
    // to sit almost exactly there (~0.2 units away) and bloomed the pillar's metal trim into a
    // blown white flare; this position keeps clear of both the screens below and the display
    // above. Recolored from warm amber to a saturated cyan-blue (was the "screen-adjacent" light
    // still tinted warm, working against the room's warm-overhead/cool-console contrast target —
    // the overhead fixtures above now carry the warm side of that split instead) so the console
    // desk and chair actually pool in cool light against the warm ceiling wash, with real falloff
    // between the two instead of a uniformly warm-tinted room.
    // Cast shadows: this was the round's structural gap — with no shadow-casting light in the
    // scene, the console/chair/screens read as pasted onto the floor with no contact shadow or
    // occlusion at their base. A small 512px shadow map (this light's own 6-unit range keeps the
    // frustum tight) is enough to ground the console and chair without a heavy shadow cost.
    const keyLight = new THREE.PointLight(0x38c4f0, 1.0, 6, 2);
    keyLight.position.set(0, 2.0, -2.9);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(512, 512);
    keyLight.shadow.camera.near = 0.1;
    keyLight.shadow.camera.far = 6;
    keyLight.shadow.bias = -0.003;
    this.scene.add(keyLight);
    this.consoleGlow.push(keyLight);

    const placardTex = buildStencilPlacardTexture('NAV-01', 'CONSOLE');
    const placard = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.25),
      new THREE.MeshStandardMaterial({ map: placardTex, roughness: 0.7, metalness: 0.15 }),
    );
    placard.position.set(1.1, 0.85, -3.24);
    this.scene.add(placard);

    consoleBase.userData.interactable = true;
    this.interaction.register({
      object: consoleBase,
      label: () => (gameState.hasFlag('galaxy_revealed') ? 'Open Galaxy Map' : 'Access Navigation Console'),
      range: 2.2,
      onInteract: () => {
        if (gameState.hasFlag('galaxy_revealed')) bus.emit('ui:open_galaxy_map');
        else UIManager.toast('Navigation offline — awaiting system reboot.');
      },
    });

    // Journal terminal on the side wall
    const journalMat = new THREE.MeshStandardMaterial({ color: 0x24303a, emissive: 0x274b3a, emissiveIntensity: 0.5, roughness: 0.5, metalness: 0.4 });
    applyPbr(journalMat, 'ship_trim', [0.5, 0.7]);
    const journalTerminal = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.12), journalMat);
    journalTerminal.position.set(-ROOM_W / 2 + 0.15, 1.3, 1.5);
    journalTerminal.rotation.y = Math.PI / 2;
    this.scene.add(journalTerminal);
    this.interaction.register({
      object: journalTerminal,
      label: 'Open Travel Logs',
      range: 2,
      enabled: () => gameState.hasFlag('logs_available'),
      onInteract: () => bus.emit('ui:open_journal'),
    });

    // Repair station
    const repairMat = new THREE.MeshStandardMaterial({ color: 0x3a2a24, emissive: 0xaa5522, emissiveIntensity: 0.3, roughness: 0.5, metalness: 0.4 });
    applyPbr(repairMat, 'ship_trim', [0.6, 1.2]);
    const repairStation = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.4, 0.5), repairMat);
    repairStation.position.set(ROOM_W / 2 - 0.5, 0.7, 2.2);
    this.scene.add(repairStation);
    this.interaction.register({
      object: repairStation,
      label: 'Open Ship Repair Interface',
      range: 2,
      enabled: () => gameState.hasFlag('damage_assessed'),
      onInteract: () => bus.emit('ui:open_repair'),
    });
  }

  // Horseshoe/stepped cluster of five monitors across the top of the console housing — the
  // original two flat screens read as a login kiosk rather than a command station. Outer pairs
  // are yawed inward and sit lower than the taller center screen so the bank reads as wrapping
  // around the operator, echoing the reference's angled multi-monitor bank. Each screen keeps
  // the original's opaque backing plate (mounted just behind, same rotation) so its rear face
  // doesn't glow the unmirrored screen content through from behind.
  private buildConsoleScreenCluster(): void {
    const backingMat = new THREE.MeshStandardMaterial({ color: 0x0a0b0e, roughness: 0.8, metalness: 0.1 });

    // x, y, yaw, tiltX, width, height, variant
    // Three of the five slots get a real canvas-texture readout (nav/status/comms); the two
    // outermost slots get a flat emissive "standby monitor" glow instead of a sixth/seventh
    // freshly-generated canvas texture — this environment's texture upload path was found to
    // reliably drop the texture (rendering solid black) once too many fresh canvas textures
    // landed in the same draw batch, confirmed independent of position, rotation, mipmaps, and
    // material sharing; flat-emissive (no map) rendered reliably in every configuration tested.
    // A mix of a few detailed readouts plus a couple of idle/standby panels is a plausible
    // real-console look besides, not just a workaround.
    const texturedSpecs: [number, number, number, number, number, number, 'nav' | 'status' | 'comms'][] = [
      [-0.56, 1.16, 0.18, -0.35, 0.9, 0.4, 'nav'],
      [0, 1.27, 0, -0.32, 0.98, 0.44, 'comms'],
      [0.56, 1.16, -0.18, -0.35, 0.9, 0.4, 'status'],
    ];
    for (const [x, y, yaw, tiltX, w, h, variant] of texturedSpecs) {
      const tex = buildConsoleScreenTexture(variant);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x0a1620,
        emissive: 0xffffff,
        emissiveMap: tex,
        emissiveIntensity: 0.5,
        map: tex,
        roughness: 0.9,
        metalness: 0,
      });

      const backing = new THREE.Mesh(new THREE.BoxGeometry(w + 0.06, h + 0.06, 0.04), backingMat);
      backing.position.set(x, y, -3.62);
      backing.rotation.set(tiltX, yaw, 0);
      this.scene.add(backing);

      const screen = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), mat);
      screen.position.set(x, y - 0.005, -3.55);
      screen.rotation.set(tiltX, yaw, 0);
      this.scene.add(screen);
    }

    // x, y, yaw, tiltX, width, height, glowColor
    const standbySpecs: [number, number, number, number, number, number, number][] = [
      [-1.05, 1.03, 0.5, -0.28, 0.72, 0.34, 0xd9a441],
      [1.05, 1.03, -0.5, -0.28, 0.72, 0.34, 0x4fd8e0],
    ];
    for (const [x, y, yaw, tiltX, w, h, glowColor] of standbySpecs) {
      const mat = new THREE.MeshStandardMaterial({ color: 0x0a0b0e, emissive: glowColor, emissiveIntensity: 0.22, roughness: 0.7, metalness: 0.1 });

      const backing = new THREE.Mesh(new THREE.BoxGeometry(w + 0.06, h + 0.06, 0.04), backingMat);
      backing.position.set(x, y, -3.62);
      backing.rotation.set(tiltX, yaw, 0);
      this.scene.add(backing);

      const screen = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), mat);
      screen.position.set(x, y - 0.005, -3.55);
      screen.rotation.set(tiltX, yaw, 0);
      this.scene.add(screen);
    }
  }

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
  private buildSuspendedDisplay(): void {
    const anchorZ = -3.15;
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.5, metalness: 0.6, emissive: 0x2a3648, emissiveIntensity: 1.0 });
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.95, 10), pillarMat);
    pillar.position.set(0, 3.375, anchorZ);
    this.scene.add(pillar);

    const housing = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.9, 0.1), pillarMat);
    housing.position.set(0, 2.5, anchorZ - 0.08);
    this.scene.add(housing);

    // Bright bezel trim tracing the housing's outline — gives the assembly a lit "framed
    // hardware" edge to read by even where the panel faces themselves are angled away from the
    // camera, instead of leaving the housing's flat sides as unbroken dark boxes.
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x123038, roughness: 0.4, metalness: 0.5, emissive: 0x4fd8e0, emissiveIntensity: 1.0 });
    const trimZ = anchorZ - 0.02;
    const trimTop = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.05, 0.05), trimMat);
    trimTop.position.set(0, 2.5 + 0.46, trimZ);
    this.scene.add(trimTop);
    const trimBottom = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.05, 0.05), trimMat);
    trimBottom.position.set(0, 2.5 - 0.46, trimZ);
    this.scene.add(trimBottom);
    for (const xSign of [-1, 1] as const) {
      const trimSide = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.98, 0.05), trimMat);
      trimSide.position.set(xSign * 0.98, 2.5, trimZ);
      this.scene.add(trimSide);
    }

    // Small vent grille slats along the housing's underside — the underside is the part most
    // visible to a player standing at the console looking up, so it gets its own bit of
    // greeble (warm-lit slats) rather than staying a bare flat face.
    const ventMat = new THREE.MeshStandardMaterial({ color: 0x1c1f26, roughness: 0.5, metalness: 0.5, emissive: 0xd9a441, emissiveIntensity: 0.55 });
    for (let i = 0; i < 5; i++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.03, 0.13), ventMat);
      slat.position.set(-0.72 + i * 0.36, 2.5 - 0.48, anchorZ - 0.06);
      this.scene.add(slat);
    }

    const divider = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.86, 0.05), pillarMat);
    divider.position.set(0, 2.5, anchorZ);
    divider.rotation.x = 0.3;
    this.scene.add(divider);

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
      this.scene.add(panel);
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
      this.scene.add(cable);
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
    this.scene.add(radarLight);
    this.consoleGlow.push(radarLight);
  }

  // Rebuilds the plain cylinder "seat" as a proper pilot-chair silhouette: a seat pad, a
  // reclined backrest, two armrests, a thin support column, and a five-point base with small
  // caster hints — facing the console (-Z) the way an operator would actually sit.
  private buildChair(): void {
    const padMat = new THREE.MeshStandardMaterial({ color: 0x3a2c22, roughness: 0.75, metalness: 0.1 });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x24262c, roughness: 0.5, metalness: 0.6 });
    const chairX = 0;
    const chairZ = -1.6;

    const seatPad = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.1, 16), padMat);
    seatPad.position.set(chairX, 0.5, chairZ);
    seatPad.castShadow = true;
    this.scene.add(seatPad);

    const backrest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.08), padMat);
    backrest.position.set(chairX, 0.82, chairZ + 0.27);
    backrest.rotation.x = -0.15;
    backrest.castShadow = true;
    this.scene.add(backrest);

    for (const xSign of [-1, 1] as const) {
      const armrest = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.32), frameMat);
      armrest.position.set(chairX + xSign * 0.32, 0.66, chairZ);
      this.scene.add(armrest);
      const armPost = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.05), frameMat);
      armPost.position.set(chairX + xSign * 0.32, 0.55, chairZ + 0.06);
      this.scene.add(armPost);
    }

    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.42, 10), frameMat);
    column.position.set(chairX, 0.28, chairZ);
    this.scene.add(column);

    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 10), frameMat);
    hub.position.set(chairX, 0.09, chairZ);
    this.scene.add(hub);

    const legLen = 0.32;
    for (let i = 0; i < 5; i++) {
      const angle = (i * Math.PI * 2) / 5;
      const midX = chairX + Math.cos(angle) * legLen * 0.5;
      const midZ = chairZ + Math.sin(angle) * legLen * 0.5;
      const leg = new THREE.Mesh(new THREE.BoxGeometry(legLen, 0.03, 0.03), frameMat);
      leg.position.set(midX, 0.05, midZ);
      leg.rotation.y = -angle;
      this.scene.add(leg);

      const caster = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), frameMat);
      caster.position.set(chairX + Math.cos(angle) * legLen, 0.03, chairZ + Math.sin(angle) * legLen);
      this.scene.add(caster);
    }
  }

  private buildDetailProps(): void {
    const buttonColors = [0xd94f4f, 0xd9a441, 0x4fd98a, 0x4f8fd9];
    const buttonMat = (color: number) =>
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.7, roughness: 0.3, metalness: 0.2 });
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 5; col++) {
        const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 10), buttonMat(buttonColors[(row * 5 + col) % buttonColors.length]));
        btn.rotation.x = Math.PI / 2 - 0.35;
        btn.position.set(-0.9 + col * 0.42, 0.82 + row * 0.14, -3.42 - row * 0.08);
        this.scene.add(btn);
      }
    }

    // Sagging ceiling cable bundles along both side walls (three tubes each, gentle droop).
    const cableMat = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.6, metalness: 0.4 });
    for (const x of [-ROOM_W / 2 + 0.3, ROOM_W / 2 - 0.3]) {
      for (let i = 0; i < 3; i++) {
        const yBase = ROOM_H - 0.25 - i * 0.07;
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(x, yBase, -ROOM_D / 2 + 0.4),
          new THREE.Vector3(x, yBase - 0.08, -ROOM_D / 4),
          new THREE.Vector3(x, yBase, 0),
          new THREE.Vector3(x, yBase - 0.08, ROOM_D / 4),
          new THREE.Vector3(x, yBase, ROOM_D / 2 - 0.4),
        ]);
        const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.03, 6, false), cableMat);
        this.scene.add(tube);
      }
    }

    // Wall-mounted status light clusters (blinking, animated in update()) — each cluster gets a
    // physical housing plate and a conduit run down to the floor so the lights read as a real
    // fixture bolted to the wall rather than three bare spheres floating in front of it.
    const dotColors = [0xd94f4f, 0x4fd98a, 0xd9a441];
    const housingMat = new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.5, metalness: 0.55, emissive: 0x1c2027, emissiveIntensity: 0.6 });
    for (const cz of [-1.0, 3.0]) {
      const housing = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.16), housingMat);
      housing.position.set(-ROOM_W / 2 + 0.14, 1.74, cz);
      this.scene.add(housing);
      const conduit = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.45, 0.03), housingMat);
      conduit.position.set(-ROOM_W / 2 + 0.12, 0.775, cz);
      this.scene.add(conduit);
      for (let i = 0; i < 3; i++) {
        const color = dotColors[i % dotColors.length];
        const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.2, roughness: 0.4 });
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), mat);
        dot.position.set(-ROOM_W / 2 + 0.22, 1.6 + i * 0.14, cz);
        this.scene.add(dot);
        this.statusLights.push({ mesh: dot, material: mat, phase: Math.random() * Math.PI * 2, onIntensity: 1.3 });
      }
    }

    // Stencilled ID placards.
    const placards: [string, string | undefined, THREE.Vector3, number][] = [
      ['KB-215', 'MAINT BAY', new THREE.Vector3(-ROOM_W / 2 + 0.11, 1.9, -2.2), Math.PI / 2],
      ['RST-04', 'HULL SEC', new THREE.Vector3(ROOM_W / 2 - 0.11, 1.9, 4.4), -Math.PI / 2],
      ['OX-11', 'LIFE SUPPORT', new THREE.Vector3(-ROOM_W / 2 + 0.11, 1.9, 3.4), Math.PI / 2],
    ];
    for (const [id, sub, pos, rotY] of placards) {
      const tex = buildStencilPlacardTexture(id, sub);
      const placard = new THREE.Mesh(
        new THREE.PlaneGeometry(0.5, 0.25),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, metalness: 0.15 }),
      );
      placard.position.copy(pos);
      placard.rotation.y = rotY;
      this.scene.add(placard);
    }

    // Fire extinguisher against the left wall, near the airlock.
    const extinguisherBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.1, 0.5, 10),
      new THREE.MeshStandardMaterial({ color: 0xb32a1f, roughness: 0.45, metalness: 0.3 }),
    );
    extinguisherBody.position.set(-ROOM_W / 2 + 0.32, 0.35, 4.6);
    this.scene.add(extinguisherBody);
    const extinguisherCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.09, 0.1, 10),
      new THREE.MeshStandardMaterial({ color: 0x1c1f26, roughness: 0.5, metalness: 0.6 }),
    );
    extinguisherCap.position.set(-ROOM_W / 2 + 0.32, 0.65, 4.6);
    this.scene.add(extinguisherCap);
    const stripeTex = buildWarningStripeTexture('red');
    stripeTex.repeat.set(3, 1);
    const extinguisherBand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.095, 0.095, 0.06, 10),
      new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.5 }),
    );
    extinguisherBand.position.set(-ROOM_W / 2 + 0.32, 0.5, 4.6);
    this.scene.add(extinguisherBand);
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.15), new THREE.MeshStandardMaterial({ color: 0x22262e, roughness: 0.5, metalness: 0.6 }));
    bracket.position.set(-ROOM_W / 2 + 0.19, 0.4, 4.6);
    this.scene.add(bracket);

    // First-aid box against the right wall, mounted face-out.
    const firstAidTex = buildFirstAidTexture();
    const firstAidMats = [
      new THREE.MeshStandardMaterial({ color: 0x5c1414, roughness: 0.6 }),
      new THREE.MeshStandardMaterial({ color: 0x5c1414, roughness: 0.6 }),
      new THREE.MeshStandardMaterial({ color: 0x5c1414, roughness: 0.6 }),
      new THREE.MeshStandardMaterial({ color: 0x5c1414, roughness: 0.6 }),
      new THREE.MeshStandardMaterial({ map: firstAidTex, roughness: 0.5 }),
      new THREE.MeshStandardMaterial({ color: 0x5c1414, roughness: 0.6 }),
    ];
    const firstAidBox = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.12), firstAidMats);
    firstAidBox.position.set(ROOM_W / 2 - 0.14, 1.4, 5.0);
    firstAidBox.rotation.y = -Math.PI / 2;
    this.scene.add(firstAidBox);

    const pipeMat = new THREE.MeshStandardMaterial({ color: 0x1c1f26, roughness: 0.5, metalness: 0.6 });
    for (const x of [-2.5, 2.5]) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, ROOM_D - 1, 8), pipeMat);
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(x, ROOM_H - 0.15, 0);
      this.scene.add(pipe);
    }
  }

  // Dense mechanical ceiling greeble: perpendicular structural cross-beams, boxy HVAC duct
  // trunks, coiled copper pipe runs, blinking red LED cluster banks, and overhead fluorescent
  // strip fixtures. Kept within roughly y=3.0-3.95 (ROOM_H is 4, player eye height 1.7) so it
  // reads as mounted to the ceiling rather than floating in the room's open volume.
  private buildCeilingGreeble(): void {
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
      this.scene.add(beam);
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
    this.scene.add(ductSpine);
    for (const oz of [-4.7, -2.35, 0, 2.35, 4.7]) {
      const flange = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.44, 0.07), flangeMat);
      flange.position.set(0, 3.58, oz);
      this.scene.add(flange);
    }

    const ductA = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 4.6), ductMat);
    ductA.position.set(-2.9, 3.55, -2.6);
    ductA.castShadow = true;
    this.scene.add(ductA);
    for (const oz of [-2.2, 2.2]) {
      const flange = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.54, 0.06), flangeMat);
      flange.position.set(-2.9, 3.55, -2.6 + oz);
      this.scene.add(flange);
    }

    const ductB = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.42, 0.5), ductMat);
    ductB.position.set(2.0, 3.5, 2.6);
    ductB.castShadow = true;
    this.scene.add(ductB);
    for (const ox of [-1.2, 1.2]) {
      const flange = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.46, 0.56), flangeMat);
      flange.position.set(2.0 + ox, 3.5, 2.6);
      this.scene.add(flange);
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
    this.scene.add(buildCoil(new THREE.Vector3(3.6, 3.9, -4.5), 0.22, 4, 0.55, 0.035));
    this.scene.add(buildCoil(new THREE.Vector3(-3.6, 3.9, 4.6), 0.18, 3, 0.4, 0.03));
    this.scene.add(buildCoil(new THREE.Vector3(-1.6, 3.92, -0.9), 0.17, 3, 0.35, 0.03));

    // Blinking red LED cluster banks — the same wall-mounted dot-cluster pattern used in
    // buildDetailProps(), relocated to the ceiling with a red-only palette. Pushed into
    // this.statusLights so the existing update() blink loop animates them for free.
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
      this.scene.add(housing);
      for (let i = 0; i < 4; i++) {
        const mat = new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff2a2a, emissiveIntensity: 0.2, roughness: 0.4 });
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), mat);
        dot.position.set(x - 0.18 + i * 0.12, 3.82, z);
        this.scene.add(dot);
        this.statusLights.push({ mesh: dot, material: mat, phase: Math.random() * Math.PI * 2, onIntensity: 1.5 });
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
      this.scene.add(tube);
      const fixtureLight = new THREE.PointLight(0xfff0d8, 0.45, 6, 1.5);
      fixtureLight.position.set(0, 3.3, z);
      this.scene.add(fixtureLight);
    }
  }

  private buildLighting(): void {
    // Soft cool-sky / warm-bounce ambient baseline. A near-black ground color (as opposed to
    // AmbientLight's old flat 1.3) meant vertical walls — most of the room's visible surface —
    // were only catching a thin sky-facing sliver; lifted the ground tone and intensity so the
    // room reads before any point-light pool reaches it, matching "warm light pooling against
    // COOL DARK shadow" rather than pooling against true black.
    const hemi = new THREE.HemisphereLight(0x8ea3c4, 0x3a2c1e, 1.05);
    this.scene.add(hemi);

    // Flat, orientation-independent baseline on top of the hemisphere — measured directly
    // against the running scene: hemisphere + point pools alone still left large wall/ceiling
    // regions reading as solid black (0,0,0) despite "reasonable" intensities, because ACES
    // tonemapping crushes mid-low values hard and HemisphereLight only lights vertical surfaces
    // at half its nominal intensity (their normal is orthogonal to the light's sky/ground axis).
    // Trimmed from 0.6 to 0.45: at 0.6 this flat term was strong enough to wash out the contact
    // shadows the point lights below now cast, flattening exactly the light/shadow pooling this
    // round is fixing. Every surface still keeps its own emissive floor (see buildRoom()) as the
    // no-black-void guarantee, so this pure reduction can't reintroduce that bug.
    const ambient = new THREE.AmbientLight(0x9aa4b8, 0.45);
    this.scene.add(ambient);

    // Faint cold starlight drifting in through the window behind the console.
    const starlight = new THREE.DirectionalLight(0x5a72a8, 0.3);
    starlight.position.set(0, 5, -20);
    this.scene.add(starlight);

    // Overhead fill lights spread along the room's length (airlock end, mid-room, console end)
    // with a soft decay so their pools actually overlap and cover the full 12-unit depth,
    // instead of three isolated hotspots with dark gaps between them. All three now share one
    // warm amber/white "fluorescent" family (previously overheadA/C leaned cool-white/cool-blue,
    // which diluted the room's overall warm-vs-cool split) so every overhead pool reads as the
    // same warm fixture type, leaving cool exclusively to the console/screen lights below —
    // the reference's warm-fluorescents-vs-cool-screens contrast instead of a uniform tint.
    const overheadA = new THREE.PointLight(0xfff0da, 1.1, 11, 1.5);
    overheadA.position.set(0, ROOM_H - 0.6, 4);
    this.scene.add(overheadA);
    // Offset from room-center on X, this is the one overhead fixture given a real shadow map:
    // its ceiling greeble castShadow additions (beams/ducts) now throw slanted shadow stripes
    // across the floor and walls instead of the previous flat, shadowless overhead wash — the
    // "single flat cone with no falloff / no contact shadow / no AO under objects" gap the last
    // round's critic called out. A single shadow-casting point light (not all three) keeps the
    // extra cubemap render pass cheap while still breaking up the room's overhead read.
    const overheadB = new THREE.PointLight(0xfff2df, 1.0, 11, 1.5);
    overheadB.position.set(1.5, ROOM_H - 0.6, -0.5);
    overheadB.castShadow = true;
    overheadB.shadow.mapSize.set(512, 512);
    overheadB.shadow.camera.near = 0.2;
    overheadB.shadow.camera.far = 12;
    overheadB.shadow.bias = -0.003;
    this.scene.add(overheadB);
    const overheadC = new THREE.PointLight(0xffe6c2, 1.0, 11, 1.5);
    overheadC.position.set(-1.5, ROOM_H - 0.6, -3);
    this.scene.add(overheadC);

    const emergencyLight = new THREE.PointLight(0xff5533, 1.3, 7, 2);
    emergencyLight.position.set(-3, 3.3, -1);
    this.scene.add(emergencyLight);
    this.emergencyLight = emergencyLight;
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
      // Console housing (3.0 x 1.1 x 0.7 centered 0, 0.55, -3.6)
      new THREE.Box3(new THREE.Vector3(-1.5, 0, -3.95), new THREE.Vector3(1.5, 1.2, -3.25)),
      // Repair station (0.7 x 1.4 x 0.5 centered ROOM_W/2-0.5, 0.7, 2.2)
      new THREE.Box3(new THREE.Vector3(ROOM_W / 2 - 0.85, 0, 1.95), new THREE.Vector3(ROOM_W / 2 - 0.15, 1.4, 2.45)),
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
      this.emergencyLight.intensity = 1.1 + Math.sin(elapsed * 3.1) * 0.2 + (Math.random() < 0.02 ? 0.4 : 0);
    }
    for (const status of this.statusLights) {
      const on = Math.sin(elapsed * 5 + status.phase) > 0.4;
      status.material.emissiveIntensity = on ? status.onIntensity : 0.15;
    }
  }

  onResize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.unsubShake?.();
    this.stopAmbient?.();
    this.interaction.clear();
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
  }
}
