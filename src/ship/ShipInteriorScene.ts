import * as THREE from 'three';
import type { GameScene } from '../core/Engine';
import { PlayerController } from '../player/PlayerController';
import { InteractionSystem } from '../player/InteractionSystem';
import { UIManager } from '../ui/UIManager';
import { gameState } from '../core/GameState';
import { bus } from '../core/EventBus';
import { getSharedEnvironment } from '../core/Environment';
import { AudioSystem } from '../audio/AudioSystem';

const ROOM_W = 9;
const ROOM_D = 12;
const ROOM_H = 4;

export class ShipInteriorScene implements GameScene {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.05, 500);
  player: PlayerController;
  interaction = new InteractionSystem();
  private floorMeshes: THREE.Object3D[] = [];
  private consoleGlow: THREE.PointLight[] = [];
  private starfield: THREE.Points | null = null;
  private unsubShake: (() => void) | null = null;
  private stopAmbient: (() => void) | null = null;

  constructor() {
    this.player = new PlayerController(this.camera, new THREE.Vector3(0, 1.7, 4));
  }

  async init(): Promise<void> {
    this.scene.background = new THREE.Color(0x03040a);
    this.scene.environment = getSharedEnvironment();
    this.scene.environmentIntensity = 0.6;
    this.buildRoom();
    this.buildStarfieldWindow();
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

  private buildRoom(): void {
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x2a2e38, roughness: 0.55, metalness: 0.25, side: THREE.DoubleSide });
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x363a46, roughness: 0.7, metalness: 0.15, side: THREE.DoubleSide });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x181b22, roughness: 0.4, metalness: 0.5, side: THREE.DoubleSide });

    const floor = new THREE.Mesh(new THREE.BoxGeometry(ROOM_W, 0.2, ROOM_D), floorMat);
    floor.position.y = -0.1;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.floorMeshes.push(floor);

    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(ROOM_W, 0.15, ROOM_D), trimMat);
    ceiling.position.y = ROOM_H;
    this.scene.add(ceiling);

    const wallGeo = new THREE.BoxGeometry(ROOM_W, ROOM_H, 0.2);
    const backWall = new THREE.Mesh(wallGeo, wallMat);
    backWall.position.set(0, ROOM_H / 2, ROOM_D / 2);
    backWall.receiveShadow = true;
    this.scene.add(backWall);

    const sideGeo = new THREE.BoxGeometry(0.2, ROOM_H, ROOM_D);
    const leftWall = new THREE.Mesh(sideGeo, wallMat);
    leftWall.position.set(-ROOM_W / 2, ROOM_H / 2, 0);
    this.scene.add(leftWall);
    const rightWall = new THREE.Mesh(sideGeo, wallMat);
    rightWall.position.set(ROOM_W / 2, ROOM_H / 2, 0);
    this.scene.add(rightWall);

    // ribbed floor trim panels for visual density
    for (let i = -5; i <= 5; i++) {
      const trim = new THREE.Mesh(new THREE.BoxGeometry(ROOM_W - 0.4, 0.02, 0.08), trimMat);
      trim.position.set(0, 0.01, i * 1.05);
      this.scene.add(trim);
    }
  }

  private buildStarfieldWindow(): void {
    const windowFrame = new THREE.Mesh(
      new THREE.BoxGeometry(6.4, 2.6, 0.15),
      new THREE.MeshStandardMaterial({ color: 0x0c0e13, metalness: 0.85, roughness: 0.3 }),
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

  private buildConsole(): void {
    const consoleMat = new THREE.MeshStandardMaterial({ color: 0x2b2f38, roughness: 0.4, metalness: 0.7 });
    const screenMat = new THREE.MeshStandardMaterial({ color: 0x1a5c7a, emissive: 0x1a5c7a, emissiveIntensity: 1.4, roughness: 0.3 });

    const consoleBase = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.1, 0.7), consoleMat);
    consoleBase.position.set(0, 0.55, -3.6);
    consoleBase.castShadow = true;
    this.scene.add(consoleBase);

    const screen = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.05), screenMat);
    screen.position.set(0, 1.15, -3.55);
    screen.rotation.x = -0.35;
    this.scene.add(screen);

    const consoleLight = new THREE.PointLight(0x2f9fd6, 2.2, 4);
    consoleLight.position.set(0, 1.2, -3.4);
    this.scene.add(consoleLight);
    this.consoleGlow.push(consoleLight);

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
    const journalTerminal = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.9, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x24303a, emissive: 0x274b3a, emissiveIntensity: 0.6 }),
    );
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
    const repairStation = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 1.4, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x3a2a24, emissive: 0xaa5522, emissiveIntensity: 0.35 }),
    );
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
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.2 });
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 5; col++) {
        const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 10), buttonMat(buttonColors[(row * 5 + col) % buttonColors.length]));
        btn.rotation.x = Math.PI / 2 - 0.35;
        btn.position.set(-0.9 + col * 0.42, 0.82 + row * 0.14, -3.42 - row * 0.08);
        this.scene.add(btn);
      }
    }

    const cableMat = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.6, metalness: 0.4 });
    for (let i = 0; i < 4; i++) {
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 6), cableMat);
      cable.position.set(-ROOM_W / 2 + 0.25, 2.6, -3 + i * 1.3);
      cable.rotation.z = 0.08 * (i % 2 === 0 ? 1 : -1);
      this.scene.add(cable);
    }

    const panelMat = new THREE.MeshStandardMaterial({ color: 0x2c313c, roughness: 0.45, metalness: 0.5 });
    const sidePanel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.6, 2.4), panelMat);
    sidePanel.position.set(-ROOM_W / 2 + 0.16, 1.4, -1);
    this.scene.add(sidePanel);
    for (let i = 0; i < 6; i++) {
      const dotColor = i % 3 === 0 ? 0xd94f4f : 0x4fd98a;
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.03, 8, 8),
        new THREE.MeshStandardMaterial({ color: dotColor, emissive: dotColor, emissiveIntensity: 1.6 }),
      );
      dot.position.set(-ROOM_W / 2 + 0.21, 0.8 + i * 0.28, -1.9 + (i % 2) * 0.4);
      this.scene.add(dot);
    }

    const pipeMat = new THREE.MeshStandardMaterial({ color: 0x1c1f26, roughness: 0.5, metalness: 0.6 });
    for (const x of [-2.5, 2.5]) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, ROOM_D - 1, 8), pipeMat);
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(x, ROOM_H - 0.15, 0);
      this.scene.add(pipe);
    }
  }

  private buildLighting(): void {
    const ambient = new THREE.AmbientLight(0xaec3e0, 1.0);
    this.scene.add(ambient);

    const fill = new THREE.DirectionalLight(0xcfe0ff, 1.6);
    fill.position.set(3, 5, 3);
    this.scene.add(fill);

    const overheadA = new THREE.PointLight(0xdfe8ff, 3.5, 9, 1.6);
    overheadA.position.set(0, ROOM_H - 0.3, -2);
    this.scene.add(overheadA);

    const overheadB = new THREE.PointLight(0xdfe8ff, 3, 9, 1.6);
    overheadB.position.set(0, ROOM_H - 0.3, 3);
    this.scene.add(overheadB);

    const emergencyLight = new THREE.PointLight(0xff5533, 1.5, 8);
    emergencyLight.position.set(-3, 3.5, -2);
    this.scene.add(emergencyLight);
  }

  private roomColliders(): THREE.Box3[] {
    const inset = 0.4;
    return [
      new THREE.Box3(
        new THREE.Vector3(-ROOM_W / 2, 0, ROOM_D / 2 - 0.5),
        new THREE.Vector3(ROOM_W / 2, 3, ROOM_D / 2),
      ),
      new THREE.Box3(new THREE.Vector3(-ROOM_W / 2 - 1, 0, -ROOM_D / 2), new THREE.Vector3(-ROOM_W / 2 + inset, 3, ROOM_D / 2)),
      new THREE.Box3(new THREE.Vector3(ROOM_W / 2 - inset, 0, -ROOM_D / 2), new THREE.Vector3(ROOM_W / 2 + 1, 3, ROOM_D / 2)),
      new THREE.Box3(new THREE.Vector3(-1.3, 0, -3.9), new THREE.Vector3(1.3, 1.2, -3.2)),
    ];
  }

  update(dt: number, elapsed: number): void {
    this.player.update(dt);
    this.interaction.update(this.camera);
    for (const light of this.consoleGlow) {
      light.intensity = 2.0 + Math.sin(elapsed * 2.2) * 0.3;
    }
    if (this.starfield) this.starfield.rotation.y += dt * 0.0015;
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
