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

function buildAsteroidField(count: number, innerRadius: number, outerRadius: number): THREE.Points {
  // Positions are relative to the field's own origin; caller positions/rotates the returned object
  // so the whole belt can drift as one piece instead of sitting frozen in place.
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = THREE.MathUtils.lerp(innerRadius, outerRadius, Math.random());
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 6;
    positions[i * 3 + 2] = Math.sin(angle) * radius;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color: 0x8a8378, size: 0.5, sizeAttenuation: true });
  return new THREE.Points(geo, mat);
}

function buildRingTexture(): THREE.Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;
  const gradient = ctx.createRadialGradient(cx, cy, size * 0.3, cx, cy, size * 0.5);
  gradient.addColorStop(0, 'rgba(150,225,255,0)');
  gradient.addColorStop(0.5, 'rgba(170,235,255,0.85)');
  gradient.addColorStop(0.64, 'rgba(170,235,255,0.85)');
  gradient.addColorStop(1, 'rgba(170,235,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A small pool of additive-blended embers that stream backward from the ship's engines,
 * faded out by lerping vertex color toward black (invisible under additive blending) rather
 * than a per-particle alpha, since PointsMaterial has no per-vertex opacity attribute. */
// Soft circular sprite for engine-trail particles. THREE.PointsMaterial renders hard-edged
// squares without a map, which reads as blocky/artificial once particles overlap the ship hull.
function buildParticleSprite(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

class EngineTrail {
  points: THREE.Points;
  private readonly count: number;
  private readonly life = 1.3;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly velocities: Float32Array;
  private readonly ages: Float32Array;
  private cursor = 0;
  private spawnAccumulator = 0;
  private readonly baseColor = new THREE.Color(0xffb870);

  constructor(count: number) {
    this.count = count;
    this.positions = new Float32Array(count * 3);
    this.colors = new Float32Array(count * 3);
    this.velocities = new Float32Array(count * 3);
    this.ages = new Float32Array(count).fill(Infinity);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.4,
      map: buildParticleSprite(),
      vertexColors: true,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, mat);
  }

  private spawnOne(origin: THREE.Vector3, dir: THREE.Vector3): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.count;
    const jitter = 0.08;
    this.positions[i * 3] = origin.x + (Math.random() - 0.5) * jitter;
    this.positions[i * 3 + 1] = origin.y + (Math.random() - 0.5) * jitter;
    this.positions[i * 3 + 2] = origin.z + (Math.random() - 0.5) * jitter;
    const speed = 0.9 + Math.random() * 0.6;
    this.velocities[i * 3] = dir.x * speed + (Math.random() - 0.5) * 0.15;
    this.velocities[i * 3 + 1] = dir.y * speed + (Math.random() - 0.5) * 0.15;
    this.velocities[i * 3 + 2] = dir.z * speed + (Math.random() - 0.5) * 0.15;
    this.ages[i] = 0;
    this.colors[i * 3] = this.baseColor.r;
    this.colors[i * 3 + 1] = this.baseColor.g;
    this.colors[i * 3 + 2] = this.baseColor.b;
  }

  spawnBurst(origins: THREE.Vector3[], dir: THREE.Vector3, dt: number): void {
    this.spawnAccumulator += dt * origins.length * 26;
    while (this.spawnAccumulator >= 1) {
      this.spawnAccumulator -= 1;
      const origin = origins[Math.floor(Math.random() * origins.length)];
      this.spawnOne(origin, dir);
    }
  }

  update(dt: number): void {
    for (let i = 0; i < this.count; i++) {
      if (this.ages[i] >= this.life) continue;
      this.ages[i] += dt;
      const t = Math.min(1, this.ages[i] / this.life);
      this.positions[i * 3] += this.velocities[i * 3] * dt;
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * dt;
      this.colors[i * 3] = this.baseColor.r * (1 - t);
      this.colors[i * 3 + 1] = this.baseColor.g * (1 - t);
      this.colors[i * 3 + 2] = this.baseColor.b * (1 - t);
    }
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }
}

function buildShipModel(): THREE.Group {
  const group = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x8a919e, metalness: 0.4, roughness: 0.5 });
  const wingMat = new THREE.MeshStandardMaterial({ color: 0x4a4f5a, metalness: 0.45, roughness: 0.55 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0xd9a441, emissive: 0xd9a441, emissiveIntensity: 0.6, metalness: 0.2, roughness: 0.4 });

  const hull = new THREE.Mesh(new THREE.CapsuleGeometry(1.1, 3.4, 6, 10), hullMat);
  hull.rotation.z = Math.PI / 2;
  group.add(hull);

  const wingGeo = new THREE.BoxGeometry(3.2, 0.15, 1.4);
  const wingL = new THREE.Mesh(wingGeo, wingMat);
  wingL.position.set(-0.3, 0, 1.6);
  group.add(wingL);
  const wingR = new THREE.Mesh(wingGeo, wingMat);
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
  private coronaInner!: THREE.Sprite;
  private coronaOuter!: THREE.Sprite;
  private asteroidField!: THREE.Points;
  private engineTrail: EngineTrail;
  private readonly engineLocalPositions = [new THREE.Vector3(-2.3, 0, 1.6), new THREE.Vector3(-2.3, 0, -1.6)];
  private pingSprite!: THREE.Sprite;
  private pingElapsed = -1;
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
    this.engineTrail = new EngineTrail(160);
  }

  async init(): Promise<void> {
    UIManager.setLookPromptEnabled(false);
    this.scene.background = new THREE.Color(0x02030a);
    this.scene.environment = getSharedEnvironment();
    this.scene.environmentIntensity = 0.12;

    this.scene.add(buildStarfield(2400, 500, 1.1));
    this.scene.add(buildStarfield(1800, 900, 0.5));
    this.scene.add(this.ship);
    this.scene.add(this.engineTrail.points);

    const ambient = new THREE.AmbientLight(0x445577, 0.3);
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

    // Dedicated rim/key lights on the ship — it sits far from the sun at scene start, so without
    // these it reads as a flat unlit silhouette against the starfield.
    const shipKey = new THREE.PointLight(0xffe3ab, 3.5, 20);
    shipKey.position.set(4, 3, 6);
    this.scene.add(shipKey);
    const shipRim = new THREE.PointLight(0x7ab8ff, 4, 18);
    shipRim.position.set(-3, -1, -4);
    this.scene.add(shipRim);

    this.coronaInner = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: buildGlowTexture(),
        color: 0xffffff,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.coronaInner.scale.set(46, 46, 1);
    this.coronaInner.position.copy(this.sun.position);
    this.scene.add(this.coronaInner);

    this.coronaOuter = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: buildGlowTexture(),
        color: 0xffb870,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.coronaOuter.scale.set(110, 110, 1);
    this.coronaOuter.position.copy(this.sun.position);
    this.scene.add(this.coronaOuter);

    this.asteroidField = buildAsteroidField(900, 26, 42);
    this.asteroidField.position.copy(this.sun.position);
    this.scene.add(this.asteroidField);

    this.pingSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: buildRingTexture(),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.pingSprite.visible = false;
    this.scene.add(this.pingSprite);

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
    setTimeout(() => this.triggerSensorPing(), 8200);
  }

  private triggerSensorPing(): void {
    this.pingElapsed = 0;
    this.pingSprite.position.copy(this.ship.position);
    this.pingSprite.visible = true;
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
    this.ship.updateMatrixWorld();

    // Sun corona shimmer — slow independent pulses so it doesn't read as a static painted circle.
    const innerPulse = 1 + Math.sin(this.elapsedTotal * 0.6) * 0.05;
    this.coronaInner.scale.set(46 * innerPulse, 46 * innerPulse, 1);
    (this.coronaInner.material as THREE.SpriteMaterial).opacity = 0.88 + Math.sin(this.elapsedTotal * 0.6 + 1.4) * 0.12;
    const outerPulse = 1 + Math.sin(this.elapsedTotal * 0.35 + 0.6) * 0.04;
    this.coronaOuter.scale.set(110 * outerPulse, 110 * outerPulse, 1);
    (this.coronaOuter.material as THREE.SpriteMaterial).opacity = 0.5 + Math.sin(this.elapsedTotal * 0.4 + 2) * 0.15;
    (this.coronaOuter.material as THREE.SpriteMaterial).rotation += dt * 0.04;

    // Asteroid belt drifts as one piece around the sun instead of sitting frozen.
    this.asteroidField.rotation.y += dt * 0.02;

    // Engine trail: embers streaming backward from the ship's thrusters.
    const engineDir = new THREE.Vector3(-1, 0, 0).applyQuaternion(this.ship.quaternion).normalize();
    const origins = this.engineLocalPositions.map((p) => this.ship.localToWorld(p.clone()));
    this.engineTrail.spawnBurst(origins, engineDir, dt);
    this.engineTrail.update(dt);

    // Sensor ping sweep, timed with the second cinematic caption.
    if (this.pingElapsed >= 0) {
      this.pingElapsed += dt;
      const pingDuration = 1.6;
      const t = Math.min(1, this.pingElapsed / pingDuration);
      // Scaled for how close the camera sits to the ship at this point in the cinematic —
      // a world-space ring, not a screen-space one, so it has to match the ship's own scale.
      const scale = THREE.MathUtils.lerp(1.5, 13, t);
      this.pingSprite.scale.set(scale, scale, 1);
      (this.pingSprite.material as THREE.SpriteMaterial).opacity = (1 - t) * 0.85;
      if (t >= 1) {
        this.pingElapsed = -1;
        this.pingSprite.visible = false;
      }
    }
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
