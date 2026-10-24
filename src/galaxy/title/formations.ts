import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../../core/rng';
import { rockGeometry, rockMaterial, rockTextures, STATIC_VERTEX } from './asteroids';
import type { RockLight, RockShape } from './asteroids';

/**
 * The rock the astronaut sits on and the big rocks that frame the picture: belt rocks too close to
 * read as floating, so they stay put while everything beyond them drifts. Shaped like the belt rocks
 * (asteroids.ts: noise, ridges, craters, fracture planes), but bigger, finer and placed, and some of
 * their fracture planes chosen rather than dealt: the ledge's flat seat and the lower step the boots
 * rest on are cuts at the heights the figure needs (astronaut.ts).
 *
 * Everything is baked into world space and merged into one mesh, one draw, under the rocks' shader
 * with the figure's contact shadow and occlusion (spheres standing in for it) on top.
 */

export interface Formation {
  /** Centre: a point of the 16:9 frame and a distance, or a point in the perch's own frame. */
  at: { screen: [number, number]; distance: number } | { perch: [number, number, number] };
  radius: number;
  /** The rock's own stretch (x, y, z) and turn (Euler, radians). */
  stretch: [number, number, number];
  turn?: [number, number, number];
  shape: RockShape;
  detail: number;
  seed: number;
  /**
   * Chosen fracture planes, in the perch's frame: an outward normal and a point on the plane (a seat at
   * y = 0 is { n: [0, 1, 0], p: [0, 0, 0] }). Each must face away from the rock's centre.
   */
  planes?: { n: [number, number, number]; p: [number, number, number] }[];
}

export interface FormationsOptions {
  rocks: Formation[];
  /** The perch's frame (the astronaut's): where its local coordinates land in the world. */
  perch: THREE.Matrix4;
  /** World direction through a point of the 16:9 frame (TitleScene.dirAt). */
  dirAt: (sx: number, sy: number) => THREE.Vector3;
  light: RockLight;
  /** The figure's stand-in spheres (world), for the contact shadow. */
  occluders: THREE.Vector4[];
  pace?: () => Promise<void>;
}

export interface Formations {
  mesh: THREE.Mesh;
  setFade(k: number): void;
  dispose(): void;
}

export async function buildFormations(o: FormationsOptions): Promise<Formations> {
  const parts: THREE.BufferGeometry[] = [];
  const perchRot = new THREE.Quaternion().setFromRotationMatrix(o.perch);
  const rand = mulberry32(0xf0e3a);
  for (const f of o.rocks) {
    const centre = 'screen' in f.at ? o.dirAt(...f.at.screen).multiplyScalar(f.at.distance) : new THREE.Vector3(...f.at.perch).applyMatrix4(o.perch);
    const turn = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(f.turn ?? [0, 0, 0])));
    // A perched rock turns with the perch, so its cuts line up with the figure's frame.
    if ('perch' in f.at) turn.premultiply(perchRot);
    const scale = new THREE.Vector3(...f.stretch).multiplyScalar(f.radius);
    // Each chosen plane, from the perch's frame into the rock's unit sphere (before its stretch).
    const toUnit = new THREE.Matrix4().compose(centre, turn, scale).invert().multiply(o.perch);
    const cuts = (f.planes ?? []).map(({ n, p }) => {
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(...n).normalize(), new THREE.Vector3(...p));
      plane.applyMatrix4(toUnit);
      // rockGeometry cuts at n . v = d.
      return { n: plane.normal.clone(), d: -plane.constant };
    });
    const geo = rockGeometry(f.detail, f.seed, f.shape, { cuts, stretch: new THREE.Vector3(1, 1, 1) });
    geo.applyMatrix4(new THREE.Matrix4().compose(centre, turn, scale));
    const count = geo.getAttribute('position').count;
    geo.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(count).fill(rand()), 1));
    parts.push(geo);
    await o.pace?.();
  }
  const geo = mergeGeometries(parts, false)!;
  for (const g of parts) g.dispose();
  const fade = { value: 0 };
  // The occluders' reach: their bounding sphere, grown by the farthest their shadow is drawn (the key
  // light is high, so shadows fall within a metre or so).
  const bound = new THREE.Sphere().setFromPoints(o.occluders.map((s) => new THREE.Vector3(s.x, s.y, s.z)));
  const reach = Math.max(...o.occluders.map((s) => s.w));
  const occBound = new THREE.Vector4(bound.center.x, bound.center.y, bound.center.z, bound.radius + reach + 1.2);
  const material = rockMaterial(STATIC_VERTEX, o.light, { uOcc: { value: o.occluders }, uOccCount: { value: o.occluders.length }, uOccBound: { value: occBound } }, fade, 0.7, { OCCLUDERS: o.occluders.length });
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'title-formations';
  await rockTextures().ready;
  return {
    mesh,
    setFade(k) {
      fade.value = k;
    },
    dispose() {
      geo.dispose();
      material.dispose();
    },
  };
}
