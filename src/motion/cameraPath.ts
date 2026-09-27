import * as THREE from 'three';
import { reducedState } from './core';

export interface CameraKey {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov?: number;
}

const _pos = new THREE.Vector3();
const _look = new THREE.Vector3();

/**
 * One continuous camera move through a set of keys: centripetal Catmull-Rom curves for the
 * position and for the look target, sampled by arc length so the speed along the path is even,
 * and a smooth FOV track. It passes through every key without stopping. The old sequencer eased to
 * a dead stop at each keyframe. Under reduced motion the FOV holds at its first value: zooms are
 * among the moves that setting removes.
 */
export class CameraPath {
  private readonly posCurve: THREE.CatmullRomCurve3;
  private readonly lookCurve: THREE.CatmullRomCurve3;
  private readonly fovs: number[];

  constructor(keys: CameraKey[]) {
    if (keys.length < 2) throw new Error('CameraPath needs at least two keys');
    this.posCurve = new THREE.CatmullRomCurve3(keys.map((k) => k.position.clone()), false, 'centripetal');
    this.lookCurve = new THREE.CatmullRomCurve3(keys.map((k) => k.target.clone()), false, 'centripetal');
    let last = keys[0].fov ?? 50;
    this.fovs = keys.map((k) => (last = k.fov ?? last));
  }

  /** Places the camera at progress u (0..1) along the path. */
  apply(camera: THREE.PerspectiveCamera, u: number): void {
    const t = Math.min(1, Math.max(0, u));
    this.posCurve.getPointAt(t, _pos);
    this.lookCurve.getPointAt(t, _look);
    camera.position.copy(_pos);
    camera.lookAt(_look);
    const fov = reducedState.value ? this.fovs[0] : this.fovAt(t);
    if (Math.abs(camera.fov - fov) > 1e-4) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }

  private fovAt(t: number): number {
    const n = this.fovs.length - 1;
    const x = t * n;
    const i = Math.min(n - 1, Math.floor(x));
    const f = x - i;
    const s = f * f * (3 - 2 * f);
    return this.fovs[i] + (this.fovs[i + 1] - this.fovs[i]) * s;
  }
}
