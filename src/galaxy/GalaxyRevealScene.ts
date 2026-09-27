import * as THREE from 'three';
import type { GameScene } from '../core/Engine';
import { CameraPath, MotionScope, ease } from '../motion';
import { disposeSceneFully } from '../core/disposeSceneTextures';
import { UIManager } from '../ui/UIManager';
import { getSharedEnvironment } from '../core/Environment';
import { PLANETS } from './planetData';
import { buildShipHull } from './shipHull';
import { buildPlanetInstance, type PlanetInstance } from './planetShader';
import { getPointSprite } from './spaceDressing';
import { buildSpaceSky } from './spaceSky';
import type { SpaceSky } from './spaceSky';
import { GRADES } from '../core/GradeGlowPass';

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

/** A belt of real rock, not a flat annulus of grey squares. Individual instanced chunks near the
 * camera plus a dust haze of points further out: the pre-fix version used one big PointsMaterial
 * for everything, which put unlit grey blocks the size of moons in front of the sun. */
function buildAsteroidField(
  chunkCount: number,
  dustCount: number,
  innerRadius: number,
  outerRadius: number,
): THREE.Group {
  const group = new THREE.Group();

  // Positions are relative to the field's own origin; the caller positions/rotates the returned
  // object so the whole belt drifts as one piece instead of sitting frozen in place.
  const place = (radiusJitter: number, thickness: number) => {
    const angle = Math.random() * Math.PI * 2;
    const radius = THREE.MathUtils.lerp(innerRadius, outerRadius, Math.random()) + radiusJitter;
    return new THREE.Vector3(
      Math.cos(angle) * radius,
      (Math.random() - 0.5) * thickness,
      Math.sin(angle) * radius,
    );
  };

  // One low-poly icosahedron reused through an InstancedMesh: 400 lit, individually tumbled rocks
  // for a single draw call. Non-uniform per-instance scale keeps them from reading as clones.
  const rock = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ color: 0x8f8679, roughness: 0.9, metalness: 0.05, flatShading: true }),
    chunkCount,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const scale = new THREE.Vector3();
  for (let i = 0; i < chunkCount; i++) {
    e.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    q.setFromEuler(e);
    const base = 0.12 + Math.pow(Math.random(), 3) * 0.85;
    scale.set(base, base * (0.55 + Math.random() * 0.6), base * (0.6 + Math.random() * 0.7));
    m.compose(place(0, 5), q, scale);
    rock.setMatrixAt(i, m);
  }
  rock.instanceMatrix.needsUpdate = true;
  group.add(rock);

  // Dust: too small and too numerous to be worth geometry, and now soft-sprited so it reads as
  // haze rather than as pixels.
  const positions = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    const p = place(0, 7);
    positions[i * 3] = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = p.z;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  group.add(
    new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0x8a8378,
        size: 0.28,
        map: getPointSprite(),
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
      }),
    ),
  );

  return group;
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

export class GalaxyRevealScene implements GameScene {
  // Nothing in open space occludes anything; GTAO only paints half-resolution blocky artefacts
  // across the sky here (see Engine.GameScene.usesAO).
  /** Stable identity for the harnesses in tools/ (constructor names are mangled in production). */
  readonly kind = 'GalaxyRevealScene';
  readonly usesAO = false;
  readonly grade = GRADES.space;
  scene = new THREE.Scene();
  private sky!: SpaceSky;
  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 4000);
  /** Everything that moves in this scene; disposed with it. */
  private fx = new MotionScope('game');
  private ship!: THREE.Group;
  private sun!: THREE.Mesh;
  private planetMeshes: THREE.Object3D[] = [];
  private planetInstances: PlanetInstance[] = [];
  private coronaInner!: THREE.Sprite;
  private coronaOuter!: THREE.Sprite;
  private asteroidField!: THREE.Group;
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

  async init(): Promise<void> {
    UIManager.setLookPromptEnabled(false);
    this.scene.background = new THREE.Color(0x02030a);
    this.scene.environment = getSharedEnvironment();
    // High enough that the hull's metals have something to reflect (metalness without an
    // environment reads as flat black), low enough that space still reads as vacuum-dark.
    this.scene.environmentIntensity = 0.3;

    this.sky = buildSpaceSky();
    this.scene.add(this.sky.group);

    // Kit pieces load async — everything below this line may assume this.ship exists, and nothing
    // above it touches the ship, so awaiting here up front is enough to keep playReveal()'s camera
    // lookAt (which reads this.ship.position) and update()'s per-frame reads safe. Engine.setScene
    // also awaits this whole init() before the scene becomes current and update() starts running.
    const hull = await buildShipHull();
    this.ship = hull.group;
    // Emergency power since the white sky: the ports glow the ship's own amber, low.
    hull.parts.windows.emissive.setHex(0xffb45a);
    hull.parts.windows.emissiveIntensity = 0.55;
    this.scene.add(this.ship);

    const ambient = new THREE.AmbientLight(0x445577, 0.3);
    this.scene.add(ambient);

    // A real photospheric surface (granulation and active regions, from Solar System Scope via
    // tools/prep-planet-textures.mjs) with limb darkening toward the edge. The flat
    // MeshBasicMaterial disc this replaces had a hard aliased rim and read as a paper cutout.
    this.sun = new THREE.Mesh(
      new THREE.SphereGeometry(9, 48, 32),
      new THREE.ShaderMaterial({
        uniforms: {
          uMap: { value: new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}textures/planets/sun.jpg`) },
          uTime: { value: 0 },
        },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          varying vec3 vNormal;
          varying vec3 vViewDir;
          void main() {
            vUv = uv;
            vNormal = normalize(mat3(modelMatrix) * normal);
            vec4 worldPos = modelMatrix * vec4(position, 1.0);
            vViewDir = normalize(cameraPosition - worldPos.xyz);
            gl_Position = projectionMatrix * viewMatrix * worldPos;
          }
        `,
        fragmentShader: /* glsl */ `
          precision highp float;
          uniform sampler2D uMap;
          uniform float uTime;
          varying vec2 vUv;
          varying vec3 vNormal;
          varying vec3 vViewDir;
          void main() {
            // Slow drift so the granulation isn't a frozen photograph.
            vec3 base = texture2D(uMap, vec2(vUv.x + uTime * 0.004, vUv.y)).rgb;
            // Limb darkening: a real star is dimmer and redder at its edge because the line of
            // sight there exits the photosphere at a shallower depth.
            float mu = clamp(dot(normalize(vNormal), normalize(vViewDir)), 0.0, 1.0);
            float limb = 0.42 + 0.58 * pow(mu, 0.55);
            vec3 color = base * limb;
            color.b *= mix(0.72, 1.0, mu);
            gl_FragColor = vec4(color * 1.35, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `,
      }),
    );
    this.sun.position.set(0, 0, -140);
    this.scene.add(this.sun);

    const sunLight = new THREE.PointLight(0xffe3ab, 5.5, 500, 1.4);
    sunLight.position.copy(this.sun.position);
    this.scene.add(sunLight);

    // The sun as a *directional* key on the ship. The point light above carries the belt and the
    // near-sun space; at the ship's distance its decay leaves almost nothing, which is why the
    // hull used to read as an unlit silhouette. A directional light is the correct model for a
    // star 140 units away, and one light is far cheaper than turning the point light's decay off.
    const sunKey = new THREE.DirectionalLight(0xffe0b8, 3.2);
    sunKey.position.copy(this.sun.position);
    sunKey.target.position.set(0, 0, 0);
    this.scene.add(sunKey);
    this.scene.add(sunKey.target);

    // Dedicated fill/rim lights on the ship, placed relative to the hero pass's camera side
    // (the -Z, sunward flank): a warm fill so the near flank's greebles read, and a cool rim
    // from behind-above so the silhouette separates from the sky in the pull-back shots.
    const shipKey = new THREE.PointLight(0xffe3ab, 3, 20);
    shipKey.position.set(5.5, 3, -6.5);
    this.scene.add(shipKey);
    const shipRim = new THREE.PointLight(0x7ab8ff, 3.5, 18);
    shipRim.position.set(-4, 2, 5);
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

    this.asteroidField = buildAsteroidField(420, 1400, 26, 42);
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

    // Planets are shader spheres built off prepared equirect maps (planetShader.ts), so there is
    // no per-planet asset load to stagger here -- construction is synchronous and the textures
    // stream in behind it.
    PLANETS.forEach((p) => {
      const angle = p.orbitAngle;
      const position = new THREE.Vector3(
        Math.cos(angle) * p.orbitRadius,
        Math.sin(angle * 0.4) * 8,
        this.sun.position.z + Math.sin(angle) * p.orbitRadius,
      );
      const instance = buildPlanetInstance(p, position, this.sun.position, this.camera);
      instance.group.userData.planetId = p.id;
      this.scene.add(instance.group);
      this.planetMeshes.push(instance.group);
      this.planetInstances.push(instance);
    });

    // Parked on the ship's sunlit side (the sun sits at -Z): the old park on +Z looked at the
    // shadow flank, which put an unlit silhouette on screen for the whole first shot.
    this.camera.position.set(3.5, 1.0, -6.5);
    this.camera.lookAt(this.ship.position.clone().add(new THREE.Vector3(2, 0, 0)));

    window.addEventListener('keydown', this.continueHandler);
    window.addEventListener('click', this.clickHandler);

    this.playReveal();
  }

  private playReveal(): void {
    UIManager.showLetterbox(true);
    const sunPos = this.sun.position;
    const start = this.camera.position.clone();
    const startLook = this.ship.position.clone().add(new THREE.Vector3(2, 0, 0));
    // One continuous move through the old keyframes (hero pass on the sunlit flank, the pull
    // back past the belt, the wide of the whole system), on the camera path that never stops dead.
    const path = new CameraPath([
      { position: start, target: startLook, fov: 50 },
      { position: new THREE.Vector3(8.5, 3, -7), target: this.ship.position.clone(), fov: 50 },
      { position: new THREE.Vector3(24, 14, 42), target: new THREE.Vector3(-6, 2, sunPos.z * 0.4), fov: 55 },
      { position: new THREE.Vector3(38, 48, 158), target: new THREE.Vector3(12, -8, sunPos.z * 0.58), fov: 58 },
    ]);
    const MOVE = 14.4;
    this.fx.tween({ duration: MOVE, ease: ease.standard, update: (e) => path.apply(this.camera, e) });
    // Beats on the same game clock as the camera, so a slow frame can't put a caption ahead of
    // the shot it belongs to.
    this.fx.timeline([
      { at: 1.2, run: () => UIManager.showCaption('You are stranded, alone, in a galaxy no chart has ever mapped.', 4200) },
      { at: 8.2, run: () => UIManager.showCaption('Somewhere out there is the truth — and a way home.', 4200) },
      { at: 8.2, run: () => this.triggerSensorPing(), beat: 'reveal:ping' },
      {
        at: MOVE + 2,
        state: true,
        run: () => {
          this.readyForContinue = true;
          UIManager.showCaption('Click or press Enter to continue', 999999);
        },
      },
    ]);
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
    this.sky.update(this.camera);
    for (const mesh of this.planetMeshes) {
      mesh.rotation.y += dt * 0.05;
    }
    for (const instance of this.planetInstances) {
      instance.update(elapsed, dt);
    }
    this.ship.rotation.y = Math.sin(this.elapsedTotal * 0.15) * 0.05;
    this.ship.updateMatrixWorld();

    (this.sun.material as THREE.ShaderMaterial).uniforms.uTime.value = this.elapsedTotal;

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
    this.fx.dispose();
    window.removeEventListener('keydown', this.continueHandler);
    window.removeEventListener('click', this.clickHandler);
    UIManager.showLetterbox(false);
    UIManager.clearCaption();
    // This scene owns everything it loaded (sky, sun, planets, sprites): free it all. It used to
    // free nothing. The hull is the exception: its clones share the cached template's geometry.
    this.scene.remove(this.ship);
    disposeSceneFully(this.scene);
  }
}
