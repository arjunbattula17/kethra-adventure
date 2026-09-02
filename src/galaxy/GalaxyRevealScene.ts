import * as THREE from 'three';
import type { GameScene } from '../core/Engine';
import { CinematicSequencer } from '../player/CameraController';
import { UIManager } from '../ui/UIManager';
import { getSharedEnvironment } from '../core/Environment';
import { PLANETS } from './planetData';
import { buildShipHull } from './shipHull';
import { buildPlanetInstance, type PlanetInstance } from './planetShader';

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

export class GalaxyRevealScene implements GameScene {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 4000);
  private sequencer: CinematicSequencer;
  private ship!: THREE.Group;
  private sun!: THREE.Mesh;
  private planetMeshes: THREE.Object3D[] = [];
  private planetInstances: PlanetInstance[] = [];
  private coronaInner!: THREE.Sprite;
  private coronaOuter!: THREE.Sprite;
  private asteroidField!: THREE.Points;
  private engineTrail: EngineTrail;
  private engineLocalPositions: THREE.Vector3[] = [];
  private pingSprite!: THREE.Sprite;
  private pingElapsed = -1;
  private elapsedTotal = 0;
  // Cinematic beats (captions, sensor ping) fire off this dt-accumulated clock, not real
  // setTimeout wall-clock time -- see revealTimers below for why.
  private revealElapsed = 0;
  private revealTimers: Array<{ at: number; fn: () => void; fired: boolean }> = [];
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
    this.engineTrail = new EngineTrail(160);
  }

  async init(): Promise<void> {
    UIManager.setLookPromptEnabled(false);
    this.scene.background = new THREE.Color(0x02030a);
    this.scene.environment = getSharedEnvironment();
    this.scene.environmentIntensity = 0.12;

    // Real NASA randomized-star equirect (public domain, see public/models/CREDITS.md) behind the
    // procedural point-star fields below — a flat color reads as empty space, this reads as a sky.
    // Loaded at its low-res "print" resolution (1024x512, ~38KB): still a proper 2:1 equirect, and
    // this cinematic's own camera keyframes never get close enough for the softness to show.
    new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}textures/space/starmap.jpg`, (texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      texture.colorSpace = THREE.SRGBColorSpace;
      this.scene.background = texture;
      // The shared post-process grade (PostProcessing.ts) was tuned entirely against the ship
      // interior's lit surfaces, and its shadow-toe lift/gamma compression flattens this mostly-
      // near-black photo into a duller grey than the source image's own galactic band actually is.
      // backgroundIntensity boosts just the background draw, independent of that shared pipeline.
      this.scene.backgroundIntensity = 1.8;
    });

    this.scene.add(buildStarfield(2400, 500, 1.1));
    this.scene.add(buildStarfield(1800, 900, 0.5));

    // Kit pieces load async — everything below this line may assume this.ship exists, and nothing
    // above it touches the ship, so awaiting here up front is enough to keep playReveal()'s camera
    // lookAt (which reads this.ship.position) and update()'s per-frame reads safe. Engine.setScene
    // also awaits this whole init() before the scene becomes current and update() starts running.
    const hull = await buildShipHull();
    this.ship = hull.group;
    this.engineLocalPositions = hull.engineLocalPositions;
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

    // Planets load their real glTF geometry in parallel — see planetModels.ts — rather than one
    // at a time, so the cinematic doesn't stall for the sum of four separate loads.
    const instances = await Promise.all(
      PLANETS.map((p) => {
        const angle = p.orbitAngle;
        const position = new THREE.Vector3(
          Math.cos(angle) * p.orbitRadius,
          Math.sin(angle * 0.4) * 8,
          this.sun.position.z + Math.sin(angle) * p.orbitRadius,
        );
        return buildPlanetInstance(p, position, this.sun.position, this.camera);
      }),
    );
    instances.forEach((instance, i) => {
      instance.group.userData.planetId = PLANETS[i].id;
      this.scene.add(instance.group);
      this.planetMeshes.push(instance.group);
      this.planetInstances.push(instance);
    });

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
    // These used to be real setTimeout(fn, ms) calls, timed to roughly match the sequencer's own
    // keyframe pacing above. But setTimeout runs on true wall-clock time while the sequencer (and
    // everything else in update()) advances on a dt clamped to 100ms/frame (see Engine.start()) --
    // so any slow frame (shader-compile stall on scene entry, GC pause, a throttled/loaded machine)
    // makes real time race ahead of the cinematic's own visual progress. The sensor ping was firing
    // and finishing its whole animation while the camera was still sitting at the very start of the
    // first keyframe, reading as a huge ring dominating the close-up shot -- invisible on a fast
    // machine where the two clocks stay roughly in sync, but reliable on anything slower. Scheduling
    // off the same dt-accumulated clock the rest of the cinematic uses keeps every beat locked to
    // what's actually on screen regardless of how long real time took to get there.
    this.revealElapsed = 0;
    this.revealTimers = [
      { at: 1.2, fn: () => UIManager.showCaption('You are stranded, alone, in a galaxy no chart has ever mapped.', 4200), fired: false },
      { at: 8.2, fn: () => UIManager.showCaption('Somewhere out there is the truth — and a way home.', 4200), fired: false },
      { at: 8.2, fn: () => this.triggerSensorPing(), fired: false },
    ];
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
    this.revealElapsed += dt;
    for (const timer of this.revealTimers) {
      if (!timer.fired && this.revealElapsed >= timer.at) {
        timer.fired = true;
        timer.fn();
      }
    }
    this.sequencer.update(dt);
    for (const mesh of this.planetMeshes) {
      mesh.rotation.y += dt * 0.05;
    }
    for (const instance of this.planetInstances) {
      instance.update(elapsed, dt);
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
