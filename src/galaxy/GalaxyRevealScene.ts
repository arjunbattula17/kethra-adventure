import * as THREE from 'three';
import type { GameScene } from '../core/Engine';
import { CinematicSequencer } from '../player/CameraController';
import { UIManager } from '../ui/UIManager';
import { getSharedEnvironment } from '../core/Environment';
import { PLANETS } from './planetData';

function buildGlowTexture(): THREE.Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,235,190,0.9)');
  gradient.addColorStop(0.35, 'rgba(255,219,153,0.45)');
  gradient.addColorStop(1, 'rgba(255,219,153,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function buildStarfield(count: number, spread: number, size: number): THREE.Points {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const tint = new THREE.Color();
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * spread;
    positions[i * 3 + 1] = (Math.random() - 0.5) * spread;
    positions[i * 3 + 2] = (Math.random() - 0.5) * spread;
    const warmth = Math.random();
    tint.setHSL(warmth > 0.8 ? 0.08 : warmth < 0.15 ? 0.6 : 0.12, 0.25, 0.75 + Math.random() * 0.25);
    colors[i * 3] = tint.r;
    colors[i * 3 + 1] = tint.g;
    colors[i * 3 + 2] = tint.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({ vertexColors: true, size, sizeAttenuation: true });
  return new THREE.Points(geo, mat);
}

function buildAsteroidField(count: number, innerRadius: number, outerRadius: number, sunZ: number): THREE.Points {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = THREE.MathUtils.lerp(innerRadius, outerRadius, Math.random());
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 6;
    positions[i * 3 + 2] = sunZ + Math.sin(angle) * radius;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color: 0x8a8378, size: 0.5, sizeAttenuation: true });
  return new THREE.Points(geo, mat);
}

function buildShipModel(): THREE.Group {
  const group = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x8a919e, metalness: 0.7, roughness: 0.35 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0xd9a441, emissive: 0xd9a441, emissiveIntensity: 0.6, metalness: 0.2, roughness: 0.4 });

  const hull = new THREE.Mesh(new THREE.CapsuleGeometry(1.1, 3.4, 6, 10), hullMat);
  hull.rotation.z = Math.PI / 2;
  group.add(hull);

  const wingGeo = new THREE.BoxGeometry(3.2, 0.15, 1.4);
  const wingL = new THREE.Mesh(wingGeo, hullMat);
  wingL.position.set(-0.3, 0, 1.6);
  group.add(wingL);
  const wingR = new THREE.Mesh(wingGeo, hullMat);
  wingR.position.set(-0.3, 0, -1.6);
  group.add(wingR);

  const engineGlowGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 12);
  for (const side of [-1, 1]) {
    const glow = new THREE.Mesh(engineGlowGeo, accentMat);
    glow.rotation.x = Math.PI / 2;
    glow.position.set(-2.1, 0, side * 1.6);
    group.add(glow);
  }

  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), accentMat);
  cockpit.position.set(1.7, 0.3, 0);
  group.add(cockpit);

  return group;
}

export class GalaxyRevealScene implements GameScene {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 4000);
  private sequencer: CinematicSequencer;
  private ship: THREE.Group;
  private sun!: THREE.Mesh;
  private planetMeshes: THREE.Mesh[] = [];
  private elapsedTotal = 0;
  private readyForContinue = false;
  onContinue: (() => void) | null = null;
  private continueHandler = (e: KeyboardEvent) => {
    if (this.readyForContinue && (e.code === 'Enter' || e.code === 'Space')) this.triggerContinue();
  };
  private clickHandler = () => {
    if (this.readyForContinue) this.triggerContinue();
  };

  constructor() {
    this.sequencer = new CinematicSequencer(this.camera);
    this.ship = buildShipModel();
  }

  async init(): Promise<void> {
    this.scene.background = new THREE.Color(0x02030a);
    this.scene.environment = getSharedEnvironment();
    this.scene.environmentIntensity = 0.12;

    this.scene.add(buildStarfield(2400, 500, 1.1));
    this.scene.add(buildStarfield(1800, 900, 0.5));
    this.scene.add(this.ship);

    const ambient = new THREE.AmbientLight(0x445577, 0.18);
    this.scene.add(ambient);

    this.sun = new THREE.Mesh(
      new THREE.SphereGeometry(9, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd88a }),
    );
    this.sun.position.set(0, 0, -140);
    this.scene.add(this.sun);

    const sunLight = new THREE.PointLight(0xffe3ab, 5.5, 500, 1.4);
    sunLight.position.copy(this.sun.position);
    this.scene.add(sunLight);

    const coronaInner = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: buildGlowTexture(),
        color: 0xffffff,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    coronaInner.scale.set(46, 46, 1);
    coronaInner.position.copy(this.sun.position);
    this.scene.add(coronaInner);

    const coronaOuter = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: buildGlowTexture(),
        color: 0xffb870,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    coronaOuter.scale.set(110, 110, 1);
    coronaOuter.position.copy(this.sun.position);
    this.scene.add(coronaOuter);

    this.scene.add(buildAsteroidField(900, 26, 42, this.sun.position.z));

    for (const p of PLANETS) {
      const geo = new THREE.SphereGeometry(p.radius, 24, 24);
      const mat = new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.7, metalness: 0.15 });
      const mesh = new THREE.Mesh(geo, mat);
      const angle = p.orbitAngle;
      mesh.position.set(
        Math.cos(angle) * p.orbitRadius,
        Math.sin(angle * 0.4) * 8,
        this.sun.position.z + Math.sin(angle) * p.orbitRadius,
      );
      mesh.userData.planetId = p.id;
      this.scene.add(mesh);
      this.planetMeshes.push(mesh);

      if (p.hasRing) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(p.radius * 1.5, p.radius * 2.1, 48),
          new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
        );
        ring.rotation.x = Math.PI / 2.4;
        ring.position.copy(mesh.position);
        this.scene.add(ring);
      }
    }

    this.camera.position.set(0, 0.6, 6);
    this.camera.lookAt(this.ship.position.clone().add(new THREE.Vector3(3, 0, 0)));

    window.addEventListener('keydown', this.continueHandler);
    window.addEventListener('click', this.clickHandler);

    this.playReveal();
  }

  private playReveal(): void {
    UIManager.showLetterbox(true);
    const sunPos = this.sun.position;
    this.sequencer.play(
      [
        { position: new THREE.Vector3(4, 1.2, 10), lookAt: this.ship.position.clone(), duration: 3.2, hold: 0.4 },
        { position: new THREE.Vector3(24, 14, 42), lookAt: new THREE.Vector3(-6, 2, sunPos.z * 0.4), duration: 4.5, hold: 0.8, fov: 55 },
        { position: new THREE.Vector3(38, 48, 158), lookAt: new THREE.Vector3(12, -8, sunPos.z * 0.58), duration: 5.5, hold: 2, fov: 58 },
      ],
      () => {
        this.readyForContinue = true;
        UIManager.showCaption('Click or press Enter to continue', 999999);
      },
    );
    setTimeout(() => UIManager.showCaption('You are stranded, alone, in a galaxy no chart has ever mapped.', 4200), 1200);
    setTimeout(() => UIManager.showCaption('Somewhere out there is the truth — and a way home.', 4200), 8200);
  }

  private triggerContinue(): void {
    if (!this.readyForContinue) return;
    this.readyForContinue = false;
    UIManager.clearCaption();
    UIManager.showLetterbox(false);
    this.onContinue?.();
  }

  update(dt: number, elapsed: number): void {
    this.elapsedTotal = elapsed;
    this.sequencer.update(dt);
    for (const mesh of this.planetMeshes) {
      mesh.rotation.y += dt * 0.05;
    }
    this.ship.rotation.y = Math.sin(this.elapsedTotal * 0.15) * 0.05;
  }

  onResize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    window.removeEventListener('keydown', this.continueHandler);
    window.removeEventListener('click', this.clickHandler);
    UIManager.showLetterbox(false);
    UIManager.clearCaption();
  }
}
