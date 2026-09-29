import * as THREE from 'three';
import { damp } from '../../../motion';

const OPEN = { intensity: 1.2, distance: 9 };
const HOODED = { intensity: 0.15, distance: 2.2 };
/** Softer than physical decay (2): inverse-square falloff blows out nearby surfaces under bloom. */
const DECAY = 1.2;

/**
 * The player's first-person lantern: raised or lowered, and hooded to shrink its light to a small
 * pool. The light is never hidden, only set to intensity 0: hidden lights leave the light count,
 * and a count change recompiles every shader in the scene. When lowered, only the body is hidden.
 */
export class Lantern {
  readonly group = new THREE.Group();
  readonly light: THREE.PointLight;
  private readonly body = new THREE.Group();
  hooded = false;
  /** 0 lowered and dark, 1 held up and lit. */
  raise = 0;
  private hood = 0;
  private readonly shutter: THREE.Mesh;
  private readonly flame: THREE.Mesh;
  private readonly flameMat: THREE.MeshBasicMaterial;
  private sway = 0;
  private swayV = 0;
  private bob = 0;
  private t = 0;

  constructor() {
    // Unlit materials: the lantern's own light is centimetres away and would blow the cage out to
    // white, so the colours are pre-lit.
    const brass = new THREE.MeshBasicMaterial({ color: 0x6a4c26 });
    const glassMat = new THREE.MeshBasicMaterial({ color: 0xffc88a, transparent: true, opacity: 0.22, depthWrite: false });
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, y: number) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.y = y;
      this.body.add(m);
      return m;
    };
    add(new THREE.CylinderGeometry(0.05, 0.056, 0.022, 10), brass, -0.075);
    add(new THREE.CylinderGeometry(0.03, 0.052, 0.035, 10), brass, 0.078);
    const handle = add(new THREE.TorusGeometry(0.028, 0.004, 5, 14), brass, 0.112);
    handle.rotation.y = Math.PI / 2;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const bar = add(new THREE.BoxGeometry(0.006, 0.14, 0.006), brass, 0);
      bar.position.x = Math.cos(a) * 0.047;
      bar.position.z = Math.sin(a) * 0.047;
    }
    add(new THREE.CylinderGeometry(0.042, 0.042, 0.13, 12, 1, true), glassMat, 0);
    this.flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb45a).multiplyScalar(1.8) });
    this.flame = add(new THREE.SphereGeometry(0.014, 8, 6), this.flameMat, -0.012);
    this.flame.scale.set(1, 1.9, 1);
    this.shutter = add(new THREE.CylinderGeometry(0.05, 0.05, 0.135, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0x241a10, side: THREE.DoubleSide }), 0.14);
    this.light = new THREE.PointLight(0xffc27a, 0, OPEN.distance, DECAY);
    this.light.position.y = -0.01;
    this.group.add(this.body, this.light);
    this.group.scale.setScalar(0.75);
    this.group.traverse((o) => {
      o.frustumCulled = false;
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = false;
    });
  }

  /**
   * `moving` bobs it with the stride; `turn` (radians/second of view yaw) swings it the other way,
   * lagging like a hanging weight.
   */
  update(dt: number, moving: boolean, turn: number, raised: boolean): void {
    this.raise = damp(this.raise, raised ? 1 : 0, 5, dt);
    this.hood = damp(this.hood, this.hooded ? 1 : 0, 18, dt);
    this.body.visible = this.raise > 0.01;
    // A hanging weight: sprung toward zero, kicked by turning.
    this.swayV += (-this.sway * 40 - this.swayV * 6 + turn * 0.6) * dt;
    this.sway += this.swayV * dt;
    this.t += dt;
    this.bob += dt * (moving ? 7.5 : 0);
    const bobY = moving ? Math.sin(this.bob) * 0.006 : 0;
    this.group.position.set(-0.3 + this.sway * 0.05, -0.25 + bobY - (1 - this.raise) * 0.35, -0.56);
    this.group.rotation.set(0.12, 0.25, this.sway);
    // The hood drops from above the lantern over the glass; open, it is stowed out of sight.
    this.shutter.visible = this.hood > 0.03;
    this.shutter.position.y = THREE.MathUtils.lerp(0.16, 0, this.hood);
    this.flame.scale.set(1, 1.9 + Math.sin(this.t * 13) * 0.15, 1);
    this.flameMat.color.setHex(0xffb45a).multiplyScalar(THREE.MathUtils.lerp(1.8, 0.5, this.hood));
    this.light.intensity = this.raise * THREE.MathUtils.lerp(OPEN.intensity, HOODED.intensity, this.hood);
    this.light.distance = THREE.MathUtils.lerp(OPEN.distance, HOODED.distance, this.hood);
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    });
  }
}
