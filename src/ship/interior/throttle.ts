import * as THREE from 'three';
import type { InteriorCtx } from './ctx';

/**
 * The drive throttle at the helm and the four pod lamps beside it: a lever the player holds forward
 * to relight the engines. It moves, so it stays out of the room's static batching.
 */
export interface Throttle {
  group: THREE.Group;
  /** Where the camera looks to hold on the lever. */
  focus: THREE.Vector3;
  /** 0 = back at idle, 1 = full forward. */
  setLever(k: number): void;
  /** Glow of the grip's amber rim, 0 to 1; lit while the lever can be used. */
  setRim(k: number): void;
  /** Pod lamp `i`: 0 dark, 1 armed (amber), 2 lit (white). */
  setPod(i: number, state: 0 | 1 | 2): void;
}

/** Beside the chart on the deck's right, within a seated pilot's reach. */
const AT = { x: 0.62, y: 1.02, z: -4.49 };

export function buildThrottle(ctx: InteriorCtx): Throttle {
  const group = new THREE.Group();
  group.name = 'drive-throttle';
  group.position.set(AT.x, AT.y, AT.z);

  const steel = new THREE.MeshStandardMaterial({ color: 0x3a4148, roughness: 0.45, metalness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.6, metalness: 0.4 });
  const rim = new THREE.MeshStandardMaterial({ color: 0x2a2118, emissive: 0xd9a441, emissiveIntensity: 0, roughness: 0.4 });

  const base = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.24), dark);
  base.position.y = 0.017;
  group.add(base);
  for (const x of [-0.055, 0.055]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.05, 0.2), steel);
    rail.position.set(x, 0.055, 0);
    group.add(rail);
  }
  const pivot = new THREE.Group();
  pivot.position.set(0, 0.05, 0.04);
  group.add(pivot);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.17, 10), steel);
  arm.position.y = 0.085;
  pivot.add(arm);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.04, 0.05), dark);
  grip.position.y = 0.18;
  pivot.add(grip);
  const rimBand = new THREE.Mesh(new THREE.BoxGeometry(0.079, 0.008, 0.054), rim);
  rimBand.position.y = 0.201;
  pivot.add(rimBand);

  // Four pod lamps in a row along the base: one per engine.
  const pods: THREE.MeshStandardMaterial[] = [];
  for (let i = 0; i < 4; i++) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x1a1612, emissive: 0xd9a441, emissiveIntensity: 0, roughness: 0.3 });
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.006, 12), mat);
    lamp.position.set(-0.105, 0.036, -0.075 + i * 0.05);
    group.add(lamp);
    pods.push(mat);
  }

  ctx.scene.add(group);
  group.traverse((o) => ctx.noMerge.add(o));
  for (const m of [steel, dark, rim, ...pods]) ctx.animatedMaterials.add(m);

  const white = new THREE.Color(0xfff4e0);
  const amber = new THREE.Color(0xd9a441);
  const set = (k: number) => (pivot.rotation.x = THREE.MathUtils.lerp(-0.55, 0.6, k));
  set(0);
  return {
    group,
    focus: new THREE.Vector3(AT.x, AT.y + 0.12, AT.z),
    setLever: set,
    setRim(k) {
      rim.emissiveIntensity = 1.6 * k;
    },
    setPod(i, state) {
      const m = pods[i];
      m.emissive.copy(state === 2 ? white : amber);
      m.emissiveIntensity = state === 0 ? 0 : state === 1 ? 0.8 : 2.4;
    },
  };
}
