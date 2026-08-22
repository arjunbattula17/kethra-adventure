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

const DIM_CANOPY_COLOR = new THREE.Color(0x274a3a);
const BRIGHT_CANOPY_COLOR = new THREE.Color(0x4fd98a);

function makeTerrace(width: number, depth: number, x: number, y: number, z: number, color = 0x9a9385): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0.02 });
  applyPbr(mat, 'lichen_rock', [width / 3, depth / 3]);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 0.6, depth), mat);
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  return mesh;
}

function makeTrunk(x: number, z: number, height: number, radius = 1.1): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({ color: 0x9a8265, roughness: 0.95, metalness: 0 });
  applyPbr(mat, 'bark_willow', [1.5, height / 3]);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.7, radius, height, 10), mat);
  mesh.position.set(x, height / 2, z);
  mesh.castShadow = true;
  return mesh;
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

export class KethraScene implements GameScene {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.05, 800);
  player: PlayerController;
  interaction = new InteractionSystem();
  onDepart: (() => void) | null = null;

  private floorMeshes: THREE.Object3D[] = [];
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
      new THREE.MeshStandardMaterial({ color: 0x88e0c8, emissive: 0x3fd9a8, emissiveIntensity: 1.6, roughness: 0.3 }),
    );
  }

  async init(): Promise<void> {
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
    this.buildCanopy();
    this.buildNPCs();
    this.buildFragments();
    this.buildShrineAndValve();
    this.buildCreatureArea();
    this.buildMechanismChamber();
    this.buildReturnPad();
    this.buildClutter();
    this.buildAtmosphere();
    this.buildLighting();

    this.scene.add(this.player.rig);
    this.player.setFloorTargets(this.floorMeshes);
    this.player.setColliders(this.colliders());
    this.player.teleport(new THREE.Vector3(0, 2, 18), 0);
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

    for (const t of [landing, plaza, rampA, westTerrace, rampB, eastTerrace, chamberApproach]) {
      this.scene.add(t);
      this.floorMeshes.push(t);
    }

    const secretLedge = makeTerrace(3, 3, -20, 2.4, -8, 0x3a4a5a);
    this.scene.add(secretLedge);
    this.floorMeshes.push(secretLedge);
  }

  private buildCanopy(): void {
    const trunkPositions: [number, number, number][] = [
      [-8, 0, 4],
      [8, 0, 4],
      [-16, 0.6, -6],
      [16, 0.6, -6],
      [-4, 1.1, -18],
      [4, 1.1, -18],
    ];
    for (const [x, base, z] of trunkPositions) {
      const height = 9 + Math.random() * 3;
      const trunk = makeTrunk(x, z, height);
      trunk.position.y = base + height / 2;
      this.scene.add(trunk);

      const canopyMat = new THREE.MeshStandardMaterial({
        color: DIM_CANOPY_COLOR.clone(),
        emissive: DIM_CANOPY_COLOR.clone(),
        emissiveIntensity: 0.8,
        roughness: 0.6,
      });
      this.canopyMats.push(canopyMat);
      const canopy = new THREE.Mesh(new THREE.IcosahedronGeometry(2.4 + Math.random(), 1), canopyMat);
      canopy.position.set(x, base + height + 1.2, z);
      canopy.scale.y = 0.6;
      this.scene.add(canopy);
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
      new THREE.MeshStandardMaterial({ color: glowColor, emissive: glowColor, emissiveIntensity: 2 }),
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
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 1.4, 8), pillarMat);
      pillar.position.set(x, y, z);
      this.scene.add(pillar);

      const rune = new THREE.Mesh(
        new THREE.PlaneGeometry(0.6, 0.6),
        new THREE.MeshStandardMaterial({ color: 0xd9c88a, emissive: 0xd9c88a, emissiveIntensity: 1.2, side: THREE.DoubleSide }),
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
    const valve = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.1, 8, 16), valveMat);
    valve.position.set(2.5, 0.9, 8);
    valve.rotation.x = Math.PI / 2;
    this.scene.add(valve);
    this.interaction.register({
      object: valve,
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
    const shrine = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.6, 6), shrineMat);
    shrine.position.set(-1.5, 0.8, 5);
    this.scene.add(shrine);
    const shrineEntry = KETHRA_LORE_ENTRIES.find((l) => l.id === 'kethra_ritual_record');
    this.interaction.register({
      object: shrine,
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
    const creatureLight = new THREE.PointLight(0x3fd9a8, 1.5, 6);
    this.creature.add(creatureLight);

    const grovePlant = new THREE.Mesh(
      new THREE.SphereGeometry(1.1, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0x3fd98a, emissive: 0x3fd98a, emissiveIntensity: 1.4 }),
    );
    grovePlant.position.set(-4, 2.5, -10);
    grovePlant.userData.dormant = false;
    this.scene.add(grovePlant);
    const groveLight = new THREE.PointLight(0x3fd98a, 2, 7);
    grovePlant.add(groveLight);

    this.interaction.register({
      object: grovePlant,
      label: () => (gameState.hasFlag('kethra_grove_dimmed') ? 'Restore the Grove Light' : 'Dim the Grove Light'),
      range: 2.4,
      onInteract: () => {
        const dimmed = gameState.hasFlag('kethra_grove_dimmed');
        if (dimmed) {
          gameState.data.flags = gameState.data.flags.filter((f) => f !== 'kethra_grove_dimmed');
          (grovePlant.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.4;
          groveLight.intensity = 2;
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
    const console_ = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1, 0.8), consoleMat);
    console_.position.set(0, 1.9, -16);
    this.scene.add(console_);

    this.interaction.register({
      object: console_,
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
    const carving = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.8, 0.3), carvingMat);
    carving.position.set(-2.6, 2.3, -17.5);
    carving.rotation.y = 0.3;
    this.scene.add(carving);
    const kindlingEntry = KETHRA_LORE_ENTRIES.find((l) => l.id === 'kethra_kindling_record');
    this.interaction.register({
      object: carving,
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
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.15, 20), padMat);
    pad.position.set(0, 0.1, 18);
    this.scene.add(pad);
    this.interaction.register({
      object: pad,
      label: 'Return to Ship',
      range: 2.6,
      onInteract: () => this.onDepart?.(),
    });
  }

  private buildAtmosphere(): void {
    const count = 700;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 60;
      positions[i * 3 + 1] = Math.random() * 12;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 60 - 5;
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

  private colliders(): THREE.Box3[] {
    const boxes: THREE.Box3[] = [];
    const trunkSpots: [number, number][] = [[-8, 4], [8, 4], [-16, -6], [16, -6], [-4, -18], [4, -18]];
    for (const [x, z] of trunkSpots) {
      boxes.push(new THREE.Box3(new THREE.Vector3(x - 0.9, 0, z - 0.9), new THREE.Vector3(x + 0.9, 6, z + 0.9)));
    }
    boxes.push(new THREE.Box3(new THREE.Vector3(-1, 0, -19), new THREE.Vector3(1, 3.5, -17)));
    return boxes;
  }

  private setCanopyBright(bright: boolean): void {
    const target = bright ? BRIGHT_CANOPY_COLOR : DIM_CANOPY_COLOR;
    for (const mat of this.canopyMats) {
      mat.color.copy(target);
      mat.emissive.copy(target);
      mat.emissiveIntensity = bright ? 1.8 : 0.8;
    }
    const waterMat = this.waterPool.material as THREE.MeshStandardMaterial;
    waterMat.opacity = bright ? 0.55 : 0.12;
    waterMat.emissiveIntensity = bright ? 0.9 : 0.3;
  }

  private buildClutter(): void {
    const rockMatSmall = new THREE.MeshStandardMaterial({ color: 0x4a4438, roughness: 0.9, metalness: 0.05 });
    const rockMatLarge = new THREE.MeshStandardMaterial({ color: 0x5a5448, roughness: 0.88, metalness: 0.04 });
    const shrubMat = new THREE.MeshStandardMaterial({ color: 0x2f5a3f, roughness: 0.75, emissive: 0x1a3a28, emissiveIntensity: 0.25 });
    const reedMat = new THREE.MeshStandardMaterial({ color: 0x3a6a4a, roughness: 0.7, emissive: 0x143020, emissiveIntensity: 0.2 });
    // Bioluminescent ground-plants: small, strongly emissive, picked up by the global bloom pass.
    const glowMatA = new THREE.MeshStandardMaterial({ color: 0x3fd98a, emissive: 0x3fd98a, emissiveIntensity: 1.6, roughness: 0.4 });
    const glowMatB = new THREE.MeshStandardMaterial({ color: 0x4fd9c8, emissive: 0x4fd9c8, emissiveIntensity: 1.6, roughness: 0.4 });

    // xMin, xMax, zMin, zMax, y (terrace top surface height), item count
    const clutterZones: [number, number, number, number, number, number][] = [
      [-6, 6, -5, 8, 0.3, 14],
      [12, 20, -6, 2, 0.9, 12],
      [-20, -12, -6, 2, 0.9, 12],
      [-5, 5, 12, 20, 0.3, 10],
      [-6, -3.6, -19, -9, 1.4, 6],
      [3.6, 6, -19, -9, 1.4, 6],
      [-21, -19, -9, -7, 2.7, 5],
    ];

    for (const [xMin, xMax, zMin, zMax, y, density] of clutterZones) {
      for (let i = 0; i < density; i++) {
        const x = xMin + Math.random() * (xMax - xMin);
        const z = zMin + Math.random() * (zMax - zMin);
        const roll = Math.random();
        if (roll < 0.3) {
          const big = Math.random() > 0.6;
          const rock = new THREE.Mesh(
            big
              ? new THREE.DodecahedronGeometry(0.35 + Math.random() * 0.35, 0)
              : new THREE.IcosahedronGeometry(0.18 + Math.random() * 0.22, 0),
            big ? rockMatLarge : rockMatSmall,
          );
          rock.position.set(x, y + (big ? 0.3 : 0.15), z);
          rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
          this.scene.add(rock);
        } else if (roll < 0.55) {
          const shrub = new THREE.Mesh(new THREE.ConeGeometry(0.22 + Math.random() * 0.15, 0.5 + Math.random() * 0.3, 6), shrubMat);
          shrub.position.set(x, y + 0.3, z);
          this.scene.add(shrub);
        } else if (roll < 0.78) {
          const cluster = new THREE.Group();
          const bladeCount = 3 + Math.floor(Math.random() * 3);
          for (let b = 0; b < bladeCount; b++) {
            const bladeHeight = 0.4 + Math.random() * 0.4;
            const blade = new THREE.Mesh(new THREE.ConeGeometry(0.04, bladeHeight, 4), reedMat);
            blade.position.set((Math.random() - 0.5) * 0.3, bladeHeight / 2, (Math.random() - 0.5) * 0.3);
            blade.rotation.z = (Math.random() - 0.5) * 0.3;
            cluster.add(blade);
          }
          cluster.position.set(x, y, z);
          this.scene.add(cluster);
        } else {
          const glow = new THREE.Mesh(
            new THREE.IcosahedronGeometry(0.1 + Math.random() * 0.08, 0),
            Math.random() > 0.5 ? glowMatA : glowMatB,
          );
          glow.position.set(x, y + 0.1, z);
          this.scene.add(glow);
        }
      }
    }
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
      mat.emissiveIntensity = 1.6 + Math.sin(elapsed * 3) * 0.4;
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
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
  }
}
