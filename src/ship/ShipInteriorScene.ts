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
    this.buildStarfieldWindow();
    this.buildAirlock();
    this.buildConsole();
    this.buildDetailProps();
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

    const wallLowerMat = new THREE.MeshStandardMaterial({ color: 0xb0a89c, roughness: 0.85, metalness: 0.35, emissive: 0x4a3826, emissiveIntensity: 1.1 });
    applyPbr(wallLowerMat, 'ship_wall', [ROOM_W / 2.4, WALL_SPLIT_Y / 2]);
    const wallUpperMat = new THREE.MeshStandardMaterial({ color: 0xc4cbd6, roughness: 0.7, metalness: 0.35, emissive: 0x2a3648, emissiveIntensity: 1.1 });
    applyPbr(wallUpperMat, 'ship_trim', [ROOM_W / 2.4, (ROOM_H - WALL_SPLIT_Y) / 1.5]);
    const sideLowerMat = new THREE.MeshStandardMaterial({ color: 0xb0a89c, roughness: 0.85, metalness: 0.35, emissive: 0x4a3826, emissiveIntensity: 1.1 });
    applyPbr(sideLowerMat, 'ship_wall', [ROOM_D / 2.4, WALL_SPLIT_Y / 2]);
    const sideUpperMat = new THREE.MeshStandardMaterial({ color: 0xc4cbd6, roughness: 0.7, metalness: 0.35, emissive: 0x2a3648, emissiveIntensity: 1.1 });
    applyPbr(sideUpperMat, 'ship_trim', [ROOM_D / 2.4, (ROOM_H - WALL_SPLIT_Y) / 1.5]);
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
  }

  private buildConsole(): void {
    const consoleMat = new THREE.MeshStandardMaterial({ color: 0x9aa2ad, roughness: 0.85, metalness: 0.15 });
    applyPbr(consoleMat, 'ship_console', [1.5, 0.8]);

    const navTex = buildConsoleScreenTexture('nav');
    const navScreenMat = new THREE.MeshStandardMaterial({
      color: 0x0a1620,
      emissive: 0xffffff,
      emissiveMap: navTex,
      emissiveIntensity: 0.5,
      map: navTex,
      roughness: 0.9,
      metalness: 0,
    });
    const statusTex = buildConsoleScreenTexture('status');
    const statusScreenMat = new THREE.MeshStandardMaterial({
      color: 0x180d04,
      emissive: 0xffffff,
      emissiveMap: statusTex,
      emissiveIntensity: 0.55,
      map: statusTex,
      roughness: 0.9,
      metalness: 0,
    });

    const consoleBase = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.1, 0.7), consoleMat);
    consoleBase.position.set(0, 0.55, -3.6);
    consoleBase.castShadow = true;
    this.scene.add(consoleBase);

    // Both screens are thin emissive boxes tilted back toward the player; without an opaque
    // backing plate their rear face glows just as brightly, showing the (unmirrored) screen
    // content through the console from behind. A plain dark plate mounted just behind each
    // screen blocks that without needing a per-face material array.
    const backingMat = new THREE.MeshStandardMaterial({ color: 0x0a0b0e, roughness: 0.8, metalness: 0.1 });

    const navBacking = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.56, 0.04), backingMat);
    navBacking.position.set(-0.68, 1.16, -3.62);
    navBacking.rotation.x = -0.35;
    this.scene.add(navBacking);
    const navScreen = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.5, 0.05), navScreenMat);
    navScreen.position.set(-0.68, 1.15, -3.55);
    navScreen.rotation.x = -0.35;
    this.scene.add(navScreen);

    const statusBacking = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.56, 0.04), backingMat);
    statusBacking.position.set(0.68, 1.16, -3.62);
    statusBacking.rotation.x = -0.35;
    this.scene.add(statusBacking);
    const statusScreen = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.5, 0.05), statusScreenMat);
    statusScreen.position.set(0.68, 1.15, -3.55);
    statusScreen.rotation.x = -0.35;
    this.scene.add(statusScreen);

    // Warm key light doubling as the console's pulsing "glow" accent — kept 0.9+ units
    // away from the console/screens and within the 0.8-2.0 safe intensity band.
    const keyLight = new THREE.PointLight(0xffb066, 1.0, 6, 2);
    keyLight.position.set(0, 2.6, -3.0);
    this.scene.add(keyLight);
    this.consoleGlow.push(keyLight);

    const placardTex = buildStencilPlacardTexture('NAV-01', 'CONSOLE');
    const placard = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.25),
      new THREE.MeshStandardMaterial({ map: placardTex, roughness: 0.7, metalness: 0.15 }),
    );
    placard.position.set(1.1, 0.85, -3.24);
    this.scene.add(placard);

    const seat = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.45, 0.9, 12),
      new THREE.MeshStandardMaterial({ color: 0x3a2c22, roughness: 0.8 }),
    );
    seat.position.set(0, 0.45, -1.6);
    this.scene.add(seat);

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

    // Wall-mounted status light clusters (blinking, animated in update()).
    const dotColors = [0xd94f4f, 0x4fd98a, 0xd9a441];
    for (const cz of [-1.0, 3.0]) {
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
    const ambient = new THREE.AmbientLight(0x9aa4b8, 0.6);
    this.scene.add(ambient);

    // Faint cold starlight drifting in through the window behind the console.
    const starlight = new THREE.DirectionalLight(0x5a72a8, 0.3);
    starlight.position.set(0, 5, -20);
    this.scene.add(starlight);

    // Overhead fill lights spread along the room's length (airlock end, mid-room, console end)
    // with a soft decay so their pools actually overlap and cover the full 12-unit depth,
    // instead of three isolated hotspots with dark gaps between them.
    const overheadA = new THREE.PointLight(0xdfe8ff, 1.1, 11, 1.5);
    overheadA.position.set(0, ROOM_H - 0.6, 4);
    this.scene.add(overheadA);
    const overheadB = new THREE.PointLight(0xfff2df, 1.0, 11, 1.5);
    overheadB.position.set(1.5, ROOM_H - 0.6, -0.5);
    this.scene.add(overheadB);
    const overheadC = new THREE.PointLight(0x9fb8d9, 1.0, 11, 1.5);
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
