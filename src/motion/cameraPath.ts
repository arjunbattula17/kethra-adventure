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
 * position and the look target, sampled by arc length for even speed, and a smooth FOV track.
 * Under reduced motion the FOV holds at its first value.
 *
 * `pace: 'keys'` gives each segment between keys equal time instead, for moves that change scale a
 * lot, where even speed would spend nearly all the time on the long far-out segments.
 */
export class CameraPath {
  private readonly posCurve: THREE.CatmullRomCurve3;
  private readonly lookCurve: THREE.CatmullRomCurve3;
  private readonly fovs: number[];
  private readonly byKeys: boolean;

  constructor(keys: CameraKey[], opts: { pace?: 'distance' | 'keys' } = {}) {
    this.byKeys = opts.pace === 'keys';
    if (keys.length < 2) throw new Error('CameraPath needs at least two keys');
    this.posCurve = new THREE.CatmullRomCurve3(keys.map((k) => k.position.clone()), false, 'centripetal');
    this.lookCurve = new THREE.CatmullRomCurve3(keys.map((k) => k.target.clone()), false, 'centripetal');
    let last = keys[0].fov ?? 50;
    this.fovs = keys.map((k) => (last = k.fov ?? last));
  }

  /** Places the camera at progress u (0..1) along the path. */
  apply(camera: THREE.PerspectiveCamera, u: number): void {
    const t = Math.min(1, Math.max(0, u));
    this.point(this.posCurve, t, _pos);
    this.targetAt(t, _look);
    camera.position.copy(_pos);
    camera.lookAt(_look);
    const fov = reducedState.value ? this.fovs[0] : this.fovAt(t);
    if (Math.abs(camera.fov - fov) > 1e-4) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }

  /** Where the camera looks at progress u. */
  targetAt(u: number, out = new THREE.Vector3()): THREE.Vector3 {
    return this.point(this.lookCurve, Math.min(1, Math.max(0, u)), out);
  }

  private point(curve: THREE.CatmullRomCurve3, t: number, out: THREE.Vector3): THREE.Vector3 {
    return this.byKeys ? curve.getPoint(t, out) : curve.getPointAt(t, out);
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
