import * as THREE from 'three';
import type { GameScene } from '../../../core/Engine';
import { MotionScope, damp, dampVec3, ease, motion } from '../../../motion';
import { UIManager } from '../../../ui/UIManager';
import { PanelManager } from '../../../ui/PanelManager';
import { AudioSystem } from '../../../audio/AudioSystem';
import { registerMiniGame } from '../../../debug/hooks';
import { gameState } from '../../../core/GameState';
import { t } from '../../../content/strings';
import type { StringKey } from '../../../content/strings';
import { GRADES } from '../../../core/GradeGlowPass';
import { getPointSprite } from '../../../galaxy/spaceDressing';
import { buildSkiff } from '../../../galaxy/skiff';
import type { Skiff } from '../../../galaxy/skiff';
import { buildWickmoth } from '../grove';
import type { Wickmoth } from '../grove';
import * as L from './layout';

/** Descent speed and braked (Shift) descent speed in m/s; horizontal acceleration and top speed. */
const DESCENT = 2.4;
const BRAKED = 0.9;
const ACCEL = 16;
const MAX_ACROSS = 7;
/** How far the lamp reaches, in metres. */
const LAMP_RANGE = 28;
/** Maximum number of lights that glow onto nearby boughs at once; one shader uniform slot each. */
const GLOW_SLOTS = 16;
const GROVE = new THREE.Color(0x5cd1b0);
const ASLEEP = new THREE.Color(0x0b2620);

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _c = new THREE.Color();

/**
 * Canopy minigame: steer the skiff down through five layers of boughs (layout.ts). The lamp wakes
 * the pods it touches, and lit pods light the nearby boughs for a few seconds. init builds the
 * scene; onEnter starts play.
 */
export class CanopyScene implements GameScene {
  readonly kind = 'CanopyScene';
  readonly usesAO = false;
  readonly grade = GRADES.kethra;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 900);
  /** Called after touchdown once the landing shot has finished. */
  onComplete: (() => void) | null = null;

  private fx = new MotionScope('game');
  private boughs = L.buildBoughs();
  private pods = L.podsFor(this.boughs);
  private podGlow = new Float32Array(this.pods.length);
  private boughMesh!: THREE.InstancedMesh;
  private podMesh!: THREE.InstancedMesh;
  private readonly glowSlots = Array.from({ length: GLOW_SLOTS }, () => new THREE.Vector4(0, -999, 0, 0));
  private skiff!: Skiff;
  private lamp!: THREE.SpotLight;
  private lampTarget = new THREE.Object3D();
  private lantern!: { group: THREE.Group; light: THREE.PointLight };
  private moth!: Wickmoth;
  private lanterns: THREE.Group[] = [];
  private shadowBlob!: THREE.Mesh;
  private sparks!: THREE.Points;
  private sparkLife = new Float32Array(60);
  private sparkVel = new Float32Array(60 * 3);
  private scarMat!: THREE.SpriteMaterial;

  // The skiff's state.
  private readonly pos = new THREE.Vector3(L.START.x, L.START.y, L.START.z);
  private readonly vel = new THREE.Vector3();
  private phase: 'waiting' | 'fly' | 'climb' | 'landed' = 'waiting';
  private pips = 3;
  private passed = -1;
  private scrapeCooldown = 0;
  private time = 0;
  private readonly kick = new THREE.Vector3();
  private readonly kickVel = new THREE.Vector3();
  private readonly held = new Set<string>();
  private pointer = new THREE.Vector2();
  private pointerAt = -1e9;
  private stats: { traversal: number; perception: number; engineering: number };

  private panel: HTMLDivElement | null = null;
  private unregister: (() => void) | null = null;
  private readonly look = new THREE.Vector3();
  private readonly ray = new THREE.Raycaster();

  constructor() {
    const a = gameState.data.attributes;
    this.stats = { traversal: a.traversal, perception: a.perception, engineering: a.engineering };
  }

  async init(): Promise<void> {
    const s = this.scene;
    s.background = new THREE.Color(0x020807);
    s.fog = new THREE.FogExp2(0x061510, 0.008);
    // Very dim ambient so the canopy reads mostly as silhouettes.
    s.add(new THREE.HemisphereLight(0x2a4a44, 0x020403, 0.16));

    this.buildBoughs();
    this.buildPods();
    this.buildTrunks();
    this.buildClearing();
    this.buildLantern();

    this.moth = buildWickmoth();
    this.moth.root.scale.setScalar(3);
    this.moth.root.position.set(-40, 52, 8);
    s.add(this.moth.root);

    this.skiff = buildSkiff();
    this.skiff.group.position.copy(this.pos);
    s.add(this.skiff.group, this.lampTarget);
    this.lamp = new THREE.SpotLight(0xfff0d8, 45, LAMP_RANGE + 12, this.lampAngle(false), 0.45, 1.1);
    this.lamp.target = this.lampTarget;
    this.skiff.lampAnchor.add(this.lamp);

    this.shadowBlob = new THREE.Mesh(
      new THREE.CircleGeometry(1.2, 20).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    s.add(this.shadowBlob);

    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(60 * 3).fill(-999), 3));
    this.sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ color: 0xffc27a, size: 3, sizeAttenuation: false, map: getPointSprite(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.sparks.frustumCulled = false;
    s.add(this.sparks);
    this.scarMat = new THREE.SpriteMaterial({ map: getPointSprite(), color: 0xff8a3a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });

    this.placeCamera(0, true);
  }

  // ------------------------------------------------------------------ building

  /** Standard material plus an emissive glow from up to GLOW_SLOTS nearby lights (pods, lanterns). */
  private glowMaterial(color: number): THREE.MeshStandardMaterial {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, flatShading: true });
    const slots = this.glowSlots;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uGlow = { value: slots };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGlowPos;')
        .replace(
          '#include <project_vertex>',
          '#include <project_vertex>\nvec4 glowPos = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\nglowPos = instanceMatrix * glowPos;\n#endif\nvGlowPos = (modelMatrix * glowPos).xyz;',
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nuniform vec4 uGlow[${GLOW_SLOTS}];\nvarying vec3 vGlowPos;`)
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>\nfor (int i = 0; i < ${GLOW_SLOTS}; i++) {\n  vec3 d = vGlowPos - uGlow[i].xyz;\n  totalEmissiveRadiance += vec3(0.36, 0.82, 0.69) * uGlow[i].w * exp(-dot(d, d) / 14.0) * 0.28;\n}`,
        );
    };
    mat.customProgramCacheKey = () => 'canopy-glow';
    return mat;
  }

  private buildBoughs(): void {
    const n = this.boughs.length;
    this.boughMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.82, 1, 1, 8, 1).translate(0, 0.5, 0), this.glowMaterial(0x2c2a22), n);
    this.boughs.forEach((b, i) => this.boughMesh.setMatrixAt(i, this.boughMatrix(b.a, b.b, b.r)));
    this.boughMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.boughMesh);

    // Foliage clumps placed along each bough.
    const clumps: THREE.Matrix4[] = [];
    let k = 0;
    for (const b of this.boughs) {
      const len = Math.hypot(b.b.x - b.a.x, b.b.y - b.a.y, b.b.z - b.a.z);
      for (let d = 1.5; d < len; d += 2.4) {
        const t = d / len;
        const h = Math.sin(k++ * 12.9898) * 43758.5453;
        const r = h - Math.floor(h);
        _v.set(b.a.x + (b.b.x - b.a.x) * t, b.a.y + (b.b.y - b.a.y) * t + b.r * 0.9, b.a.z + (b.b.z - b.a.z) * t);
        _q.setFromAxisAngle(_up, r * 6.28);
        _s.set(1.1 + r * 1.1, 0.55 + r * 0.45, 1.1 + (1 - r) * 0.9);
        clumps.push(new THREE.Matrix4().compose(_v, _q, _s));
      }
    }
    const foliage = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), this.glowMaterial(0x0f2a24), clumps.length);
    clumps.forEach((m, i) => foliage.setMatrixAt(i, m));
    foliage.instanceMatrix.needsUpdate = true;
    this.scene.add(foliage);
  }

  private boughMatrix(a: L.Vec, b: L.Vec, r: number): THREE.Matrix4 {
    const dir = _v.set(b.x - a.x, b.y - a.y, b.z - a.z);
    const len = dir.length();
    _q.setFromUnitVectors(_up, dir.divideScalar(len || 1));
    return _m.compose(_s.set(a.x, a.y, a.z), _q, new THREE.Vector3(r, len, r));
  }

  private buildPods(): void {
    this.podMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.32, 10, 8), new THREE.MeshBasicMaterial({ toneMapped: false }), this.pods.length);
    this.pods.forEach((p, i) => {
      this.podMesh.setMatrixAt(i, _m.makeTranslation(p.at.x, p.at.y, p.at.z));
      this.podMesh.setColorAt(i, ASLEEP);
    });
    this.podMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.podMesh);
  }

  private buildTrunks(): void {
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(3.2, 4.6, 230, 12), this.glowMaterial(0x221f1a), 9);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3;
      const r = 40 + (i % 3) * 5;
      trunks.setMatrixAt(i, _m.makeTranslation(Math.cos(a) * r, 115, Math.sin(a) * r));
    }
    trunks.instanceMatrix.needsUpdate = true;
    this.scene.add(trunks);
  }

  /** Ground, landing terrace with its lights, and the ring of lanterns. */
  private buildClearing(): void {
    const ground = new THREE.Mesh(new THREE.CircleGeometry(90, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x0c1a14, roughness: 1 }));
    this.scene.add(ground);
    const stone = new THREE.MeshStandardMaterial({ color: 0x4a4d48, roughness: 0.85, flatShading: true });
    const terrace = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.7, 0.6, 24), stone);
    terrace.position.y = 0.3;
    this.scene.add(terrace);
    const amber = new THREE.MeshStandardMaterial({ color: 0x2a2118, emissive: 0xffb45a, emissiveIntensity: 2.2 });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.22), amber);
      lamp.position.set(Math.cos(a) * 3.8, 0.64, Math.sin(a) * 3.8);
      this.scene.add(lamp);
    }
    const pool = new THREE.PointLight(0xffb45a, 14, 18, 1.5);
    pool.position.set(0, 2, 0);
    this.scene.add(pool);
    // Ring of lanterns around the clearing.
    const post = new THREE.MeshStandardMaterial({ color: 0x3a4a44, roughness: 0.7, flatShading: true });
    const glow = new THREE.MeshStandardMaterial({ color: 0x0a2a22, emissive: 0x5cd1b0, emissiveIntensity: 1.8 });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.4;
      const g = new THREE.Group();
      g.position.set(Math.cos(a) * 10, 0, Math.sin(a) * 10);
      const shaft = new THREE.Mesh(new THREE.ConeGeometry(0.22, 3.4, 6), post);
      shaft.position.y = 1.7;
      g.add(shaft);
      for (const r of [0, Math.PI * 0.66, Math.PI * 1.33]) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.2, 0.36), post);
        fin.position.set(Math.cos(r) * 0.16, 0.8, Math.sin(r) * 0.16);
        fin.rotation.y = -r;
        g.add(fin);
      }
      const head = new THREE.Group();
      head.position.y = 3.5;
      const hood = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.55, 8, 1, true).rotateZ(Math.PI / 2), post);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), glow);
      lamp.position.x = 0.12;
      head.add(hood, lamp);
      // Heads start facing outward; touchdown() turns them toward the skiff.
      head.rotation.y = -a;
      g.add(head);
      this.scene.add(g);
      this.lanterns.push(head);
    }
  }

  /** Swinging lantern hung over the first layer's gap. */
  private buildLantern(): void {
    const gap = L.LAYERS[0].gap;
    const group = new THREE.Group();
    group.position.set(gap.x, L.LAYERS[0].y + 16, gap.z);
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 9, 4).translate(0, -4.5, 0), new THREE.MeshStandardMaterial({ color: 0x2a2a28, roughness: 0.6, metalness: 0.6 }));
    group.add(chain);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 10), new THREE.MeshStandardMaterial({ color: 0x0a2a22, emissive: 0x7fe0c8, emissiveIntensity: 2.4 }));
    head.position.y = -9.3;
    group.add(head);
    const light = new THREE.PointLight(0x7fe0c8, 40, 30, 1.4);
    light.position.y = -9.3;
    group.add(light);
    this.scene.add(group);
    this.lantern = { group, light };
  }

  // ------------------------------------------------------------------ play

  onEnter(): void {
    this.panel = document.createElement('div');
    this.panel.className = 'canopy-panel';
    document.getElementById('ui-root')!.appendChild(this.panel);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('blur', this.onBlur);
    this.unregister = registerMiniGame({ name: 'canopy', win: () => this.debugWin(), fail: () => this.debugFail() });
    this.phase = 'fly';
    this.renderPanel();
    this.say('mg2.orion.start');
    UIManager.setObjective(t('mg2.objective'));
  }

  private lampAngle(keyboardOnly: boolean): number {
    return (this.stats.engineering >= 2 ? 0.44 : 0.32) + (keyboardOnly ? 0.12 : 0);
  }

  update(dt: number): void {
    this.time += dt;
    const time = this.time;
    this.updateSway(time);
    this.updateLantern(time);
    this.updateMoth(dt, time);
    if (this.phase === 'fly') this.fly(dt, time);
    this.updateLamp(dt);
    this.updateGlow();
    this.updateSparks(dt);
    this.placeCamera(dt, false);
    (this.scene.fog as THREE.FogExp2).density = 0.006 + 0.012 * (1 - Math.min(1, this.pos.y / L.START.y));
  }

  private fly(dt: number, time: number): void {
    const h = this.held;
    const ax = (h.has('KeyW') || h.has('ArrowUp') ? 1 : 0) - (h.has('KeyS') || h.has('ArrowDown') ? 1 : 0);
    const az = (h.has('KeyD') || h.has('ArrowRight') ? 1 : 0) - (h.has('KeyA') || h.has('ArrowLeft') ? 1 : 0);
    const blocked = PanelManager.isOpen;
    this.vel.x += (blocked ? 0 : ax) * ACCEL * dt;
    this.vel.z += (blocked ? 0 : az) * ACCEL * dt;
    // Traversal 2 gives stronger damping, so the skiff responds more tightly.
    const damping = this.stats.traversal >= 2 ? 3.6 : 2.0;
    this.vel.x *= Math.exp(-damping * dt);
    this.vel.z *= Math.exp(-damping * dt);
    const across = Math.hypot(this.vel.x, this.vel.z);
    if (across > MAX_ACROSS) this.vel.multiplyScalar(MAX_ACROSS / across);
    const braking = h.has('ShiftLeft') || h.has('ShiftRight');
    this.vel.y = -(braking ? BRAKED : DESCENT);
    // Below the last layer, pull the skiff toward the landing pad at the origin.
    if (this.pos.y < L.LAYERS[L.LAYERS.length - 1].y - 3) {
      this.vel.x += -this.pos.x * 1.2 * dt;
      this.vel.z += -this.pos.z * 1.2 * dt;
    }
    this.pos.addScaledVector(this.vel, dt);

    const contact = L.collide(this.pos, L.SKIFF_RADIUS, this.boughs, time);
    if (contact) {
      this.pos.x += contact.normal.x * contact.depth;
      this.pos.y += contact.normal.y * contact.depth;
      this.pos.z += contact.normal.z * contact.depth;
      const vn = this.vel.x * contact.normal.x + this.vel.z * contact.normal.z;
      if (vn < 0) {
        this.vel.x -= contact.normal.x * vn * 1.6;
        this.vel.z -= contact.normal.z * vn * 1.6;
      }
      if (this.scrapeCooldown <= 0) this.scrape(contact);
    }
    this.scrapeCooldown -= dt;

    // The last passed layer is the checkpoint climbBack() returns to.
    for (const layer of L.LAYERS) {
      if (layer.index > this.passed && this.pos.y < layer.y - 4) {
        this.passed = layer.index;
        this.onLayerPassed(layer);
      }
    }
    if (this.pos.y <= L.LANDING.y + 0.45) this.touchdown();
    this.placeSkiff(dt);
  }

  private onLayerPassed(layer: L.Layer): void {
    AudioSystem.playTone(330 + layer.index * 60, 0.5, 'sine', 0.05);
    const next = L.LAYERS[layer.index + 1];
    if (next?.kind === 'pods') this.say('mg2.orion.pods');
    else if (next?.kind === 'sway') this.say('mg2.orion.sway');
    else if (next?.kind === 'moth') this.say('mg2.orion.moth');
    else if (next?.kind === 'drop') this.say('mg2.orion.drop');
    this.renderPanel();
  }

  /** Handles a bough hit: sparks, a camera kick, and one hull pip lost. */
  private scrape(contact: L.Contact): void {
    this.scrapeCooldown = 0.9;
    this.pips--;
    AudioSystem.playTone(90, 0.35, 'sawtooth', 0.08);
    const p = new THREE.Vector3(contact.point.x, contact.point.y, contact.point.z);
    this.burstSparks(p, new THREE.Vector3(contact.normal.x, contact.normal.y, contact.normal.z));
    if (!motion.reduced) this.kickVel.set(-contact.normal.x * 6, -3, -contact.normal.z * 6);
    const scar = new THREE.Sprite(this.scarMat);
    scar.position.copy(p);
    scar.scale.setScalar(0.9);
    this.scene.add(scar);
    this.renderPanel();
    if (this.pips <= 0) this.climbBack();
  }

  /** Moves the skiff back to the last passed layer's checkpoint and restores the hull. */
  private climbBack(): void {
    this.phase = 'climb';
    this.say('mg2.orion.climb');
    const from = this.pos.clone();
    const cp = L.checkpointFor(this.passed);
    const to = new THREE.Vector3(cp.x, cp.y, cp.z);
    this.vel.set(0, 0, 0);
    this.fx.tween({
      duration: motion.reduced ? 0.3 : 2.2,
      ease: ease.standard,
      update: (k) => {
        this.pos.lerpVectors(from, to, k);
        this.placeSkiff(0);
      },
      done: () => {
        this.pips = 3;
        this.phase = 'fly';
        this.renderPanel();
      },
    });
  }

  private touchdown(): void {
    this.phase = 'landed';
    this.pos.y = L.LANDING.y + 0.45;
    this.placeSkiff(0);
    AudioSystem.playSuccess();
    this.fx.tween({ duration: 0.5, update: (k) => this.skiff.gear.scale.set(1, 1 - 0.35 * Math.sin(k * Math.PI), 1) });
    this.burstSparks(new THREE.Vector3(this.pos.x, 0.7, this.pos.z), new THREE.Vector3(0, 1, 0), 0xb8b0a0, true);
    motion.conductor.duck(3);
    for (const head of this.lanterns) {
      const world = head.getWorldPosition(new THREE.Vector3());
      const from = head.rotation.y;
      const to = Math.atan2(-(this.pos.z - world.z), this.pos.x - world.x);
      this.fx.tween({ duration: 1.4, delay: 0.3 + Math.random() * 0.4, ease: ease.standard, update: (k) => (head.rotation.y = THREE.MathUtils.lerp(from, to, k)) });
    }
    this.say('mg2.orion.down');
    this.panel?.remove();
    this.panel = null;
    this.fx.after(motion.reduced ? 1 : 3.2, () => this.onComplete?.());
  }

  private placeSkiff(dt: number): void {
    const g = this.skiff.group;
    g.position.copy(this.pos);
    g.rotation.z = dt ? damp(g.rotation.z, -this.vel.x * 0.045, 6, dt) : g.rotation.z;
    g.rotation.x = dt ? damp(g.rotation.x, this.vel.z * 0.06, 6, dt) : g.rotation.x;
    // Blob shadow on the nearest bough straight below, or on the ground.
    this.ray.set(this.pos, _v.set(0, -1, 0));
    this.ray.far = 60;
    const hit = this.ray.intersectObject(this.boughMesh, false)[0];
    const y = hit ? hit.point.y + 0.15 : 0.62;
    this.shadowBlob.position.set(this.pos.x, y, this.pos.z);
    (this.shadowBlob.material as THREE.MeshBasicMaterial).opacity = 0.55 * THREE.MathUtils.clamp(1 - (this.pos.y - y) / 40, 0.15, 1);
  }

  /** The mouse aims the lamp if it moved in the last 3 s; otherwise it follows the heading with a
   * wider cone. */
  private updateLamp(dt: number): void {
    const mouse = performance.now() - this.pointerAt < 3000;
    const aim = _v;
    if (mouse) {
      this.ray.setFromCamera(this.pointer, this.camera);
      const plane = new THREE.Plane(_up, -(this.pos.y - 16));
      if (!this.ray.ray.intersectPlane(plane, aim)) aim.copy(this.pos).add(new THREE.Vector3(6, -16, 0));
    } else aim.set(this.pos.x + 6 + this.vel.x * 2, this.pos.y - 16, this.pos.z + this.vel.z * 2);
    dampVec3(this.lampTarget.position, aim, dt ? 10 : 1e3, dt || 1);
    this.lamp.angle = this.lampAngle(!mouse);

    // Pods inside the cone light up for `lit` seconds; perception 2 keeps them lit longer.
    const lit = this.stats.perception >= 2 ? 6.5 : 4;
    const origin = this.skiff.lampAnchor.getWorldPosition(new THREE.Vector3());
    const dir = this.lampTarget.position.clone().sub(origin).normalize();
    const cos = Math.cos(this.lamp.angle);
    for (let i = 0; i < this.pods.length; i++) {
      const p = this.pods[i].at;
      const dx = p.x - origin.x;
      const dy = p.y - origin.y;
      const dz = p.z - origin.z;
      const d = Math.hypot(dx, dy, dz);
      if (d < LAMP_RANGE && (dx * dir.x + dy * dir.y + dz * dir.z) / d > cos && this.phase !== 'landed') {
        if (this.podGlow[i] <= 0) AudioSystem.playTone(880 + (i % 5) * 110, 0.12, 'sine', 0.012);
        this.podGlow[i] = lit;
      } else if (this.podGlow[i] > 0) this.podGlow[i] = Math.max(0, this.podGlow[i] - dt);
    }
  }

  /** Updates pod colours and fills the glow slots with the strongest lights, weighted by distance
   * to the skiff. */
  private updateGlow(): void {
    const candidates: { at: L.Vec; w: number }[] = [];
    for (let i = 0; i < this.pods.length; i++) {
      const g = this.podGlow[i];
      const w = g > 0 ? Math.min(1, g / 1.2) : 0;
      _c.copy(ASLEEP).lerp(GROVE, w).multiplyScalar(1 + w * 1.6);
      this.podMesh.setColorAt(i, _c);
      if (w > 0) candidates.push({ at: this.pods[i].at, w });
    }
    this.podMesh.instanceColor!.needsUpdate = true;
    candidates.push({ at: this.lantern.light.getWorldPosition(new THREE.Vector3()), w: 1.6 });
    if (this.moth.root.visible) candidates.push({ at: this.moth.root.position, w: 2.2 });
    const p = this.pos;
    candidates.sort((a, b) => b.w / (1 + Math.hypot(b.at.x - p.x, b.at.y - p.y, b.at.z - p.z) / 30) - a.w / (1 + Math.hypot(a.at.x - p.x, a.at.y - p.y, a.at.z - p.z) / 30));
    for (let i = 0; i < GLOW_SLOTS; i++) {
      const c = candidates[i];
      if (c) this.glowSlots[i].set(c.at.x, c.at.y, c.at.z, c.w);
      else this.glowSlots[i].set(0, -999, 0, 0);
    }
  }

  private updateSway(time: number): void {
    let any = false;
    this.boughs.forEach((b, i) => {
      if (!b.sway) return;
      const s = L.boughAt(b, time);
      this.boughMesh.setMatrixAt(i, this.boughMatrix(s.a, s.b, b.r));
      any = true;
    });
    if (any) this.boughMesh.instanceMatrix.needsUpdate = true;
  }

  private updateLantern(time: number): void {
    this.lantern.group.rotation.z = Math.sin(time * 1.1) * 0.22;
    this.lantern.group.rotation.x = Math.sin(time * 0.8 + 1) * 0.12;
  }

  /** The moth crosses layer 4 and counts as a glow light while visible. */
  private updateMoth(dt: number, time: number): void {
    const near = this.pos.y < L.LAYERS[2].y && this.pos.y > L.LAYERS[3].y - 12;
    this.moth.root.visible = near;
    if (!near) return;
    const k = ((time * 0.07) % 1) * 2 - 1;
    this.moth.root.position.set(k * 38, L.LAYERS[3].y - 5 + Math.sin(time * 0.9) * 1.5, 6 - k * 10);
    // Face along the path; local +z is forward.
    this.moth.root.rotation.y = Math.atan2(38, -10);
    this.moth.update(dt, time);
  }

  private burstSparks(at: THREE.Vector3, normal: THREE.Vector3, color = 0xffc27a, ring = false): void {
    (this.sparks.material as THREE.PointsMaterial).color.setHex(color);
    const pos = this.sparks.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < 60; i++) {
      pos.setXYZ(i, at.x, at.y, at.z);
      if (ring) {
        const a = (i / 60) * Math.PI * 2;
        this.sparkVel.set([Math.cos(a) * 4, 0.3, Math.sin(a) * 4], i * 3);
      } else {
        this.sparkVel.set([normal.x * 4 + (Math.random() - 0.5) * 5, normal.y * 4 + Math.random() * 3, normal.z * 4 + (Math.random() - 0.5) * 5], i * 3);
      }
      this.sparkLife[i] = ring ? 1.4 : 0.35 + Math.random() * 0.35;
    }
    pos.needsUpdate = true;
  }

  private updateSparks(dt: number): void {
    const pos = this.sparks.geometry.getAttribute('position') as THREE.BufferAttribute;
    let live = false;
    for (let i = 0; i < 60; i++) {
      if (this.sparkLife[i] <= 0) continue;
      live = true;
      this.sparkLife[i] -= dt;
      this.sparkVel[i * 3 + 1] -= 9 * dt;
      pos.setXYZ(i, pos.getX(i) + this.sparkVel[i * 3] * dt, pos.getY(i) + this.sparkVel[i * 3 + 1] * dt, pos.getZ(i) + this.sparkVel[i * 3 + 2] * dt);
      if (this.sparkLife[i] <= 0) pos.setXYZ(i, 0, -999, 0);
    }
    if (live) pos.needsUpdate = true;
  }

  /**
   * Damped follow camera behind and above the skiff; it pulls in to avoid boughs. After touchdown
   * it moves to a fixed landing view.
   */
  private placeCamera(dt: number, snap: boolean): void {
    const cam = this.camera;
    const want = _v;
    if (this.phase === 'landed') {
      want.set(this.pos.x - 9, 3.4, this.pos.z + 6.5);
      this.look.set(this.pos.x + 2, 1.2, this.pos.z - 1);
    } else {
      want.set(this.pos.x - 8.5, this.pos.y + 5.5, this.pos.z);
      this.look.set(this.pos.x + 6, this.pos.y - 7, this.pos.z);
      // Keep a bough from coming between the camera and the skiff.
      const toCam = want.clone().sub(this.pos);
      const dist = toCam.length();
      this.ray.set(this.pos, toCam.normalize());
      this.ray.far = dist;
      const hit = this.ray.intersectObject(this.boughMesh, false)[0];
      if (hit) want.copy(this.pos).addScaledVector(toCam, Math.max(2, hit.distance - 0.6));
    }
    if (snap) cam.position.copy(want);
    else dampVec3(cam.position, want, this.phase === 'landed' ? 1.6 : 5, dt);
    // Camera kick decays as a damped spring.
    if (dt) {
      this.kickVel.addScaledVector(this.kick, -60 * dt).multiplyScalar(Math.exp(-7 * dt));
      this.kick.addScaledVector(this.kickVel, dt);
    }
    cam.position.add(this.kick);
    cam.lookAt(this.look);
  }

  private renderPanel(): void {
    if (!this.panel) return;
    const layer = Math.min(L.LAYERS.length, this.passed + 2);
    const pips = [0, 1, 2].map((i) => `<span class="canopy-pip ${i < this.pips ? 'on' : ''}"></span>`).join('');
    const notes = [
      this.stats.traversal >= 2 ? t('mg2.stat.traversal') : '',
      this.stats.perception >= 2 ? t('mg2.stat.perception') : '',
      this.stats.engineering >= 2 ? t('mg2.stat.engineering') : '',
    ].filter(Boolean);
    this.panel.innerHTML = `<div class="eyebrow">${t('mg2.eyebrow', { n: String(layer) })}</div>
      <div class="canopy-hull"><span class="label">${t('mg2.hull')}</span>${pips}</div>
      ${notes.length ? `<ul class="intercept-stats">${notes.map((n) => `<li>${n}</li>`).join('')}</ul>` : ''}
      <div class="intercept-keys"><span><span class="keycap">WASD</span>${t('mg2.key.steer')}</span><span>${t('mg2.key.lamp')}</span><span><span class="keycap">Shift</span>${t('mg2.key.brake')}</span></div>`;
  }

  private say(key: StringKey): void {
    UIManager.showCaption(t(key), 4200);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    this.held.add(e.code);
    if (e.code.startsWith('Arrow')) e.preventDefault();
  };
  private onKeyUp = (e: KeyboardEvent): void => {
    this.held.delete(e.code);
  };
  private onBlur = (): void => this.held.clear();
  private onPointerMove = (e: PointerEvent): void => {
    this.pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    this.pointerAt = performance.now();
  };

  // ------------------------------------------------------------------ tests and the debug harness

  /** Debug win (F2): lands on the pad immediately; does nothing if already landed. */
  private debugWin(): void {
    if (this.phase === 'landed') return;
    this.pos.set(0, L.LANDING.y + 0.45, 0);
    this.vel.set(0, 0, 0);
    this.passed = L.LAYERS.length - 1;
    this.touchdown();
  }

  private debugFail(): void {
    if (this.phase !== 'fly') return;
    const b = this.boughs.find((x) => x.layer === Math.max(0, this.passed + 1)) ?? this.boughs[0];
    this.scrape({ bough: b, point: this.pos.clone(), normal: { x: 1, y: 0, z: 0 }, depth: 0 });
  }

  state(): { phase: string; pips: number; passed: number; pos: L.Vec; lit: number; lampAngle: number } {
    let lit = 0;
    for (const g of this.podGlow) if (g > 0) lit++;
    return { phase: this.phase, pips: this.pips, passed: this.passed, pos: { x: this.pos.x, y: this.pos.y, z: this.pos.z }, lit, lampAngle: this.lamp.angle };
  }

  onResize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.fx.dispose();
    this.unregister?.();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('blur', this.onBlur);
    this.panel?.remove();
    UIManager.clearCaption();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      for (const x of Array.isArray(mat) ? mat : mat ? [mat] : []) x.dispose();
    });
  }
}
