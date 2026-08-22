import * as THREE from 'three';

export interface CinematicKeyframe {
  position: THREE.Vector3;
  lookAt: THREE.Vector3;
  fov?: number;
  duration: number;
  hold?: number;
  ease?: (t: number) => number;
}

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class CinematicSequencer {
  private camera: THREE.PerspectiveCamera;
  private keyframes: CinematicKeyframe[] = [];
  private index = 0;
  private t = 0;
  private holdT = 0;
  playing = false;
  onComplete: () => void = () => {};
  private startPos = new THREE.Vector3();
  private startLook = new THREE.Vector3();
  private startFov = 50;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  play(keyframes: CinematicKeyframe[], onComplete?: () => void): void {
    this.keyframes = keyframes;
    this.index = 0;
    this.t = 0;
    this.holdT = 0;
    this.playing = keyframes.length > 0;
    if (onComplete) this.onComplete = onComplete;
    this.captureStart();
  }

  private captureStart(): void {
    this.startPos.copy(this.camera.position);
    this.startFov = this.camera.fov;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    this.startLook.copy(this.camera.position).add(dir);
  }

  skip(): void {
    if (!this.playing) return;
    const last = this.keyframes[this.keyframes.length - 1];
    if (last) {
      this.camera.position.copy(last.position);
      this.camera.lookAt(last.lookAt);
      if (last.fov) {
        this.camera.fov = last.fov;
        this.camera.updateProjectionMatrix();
      }
    }
    this.playing = false;
    this.onComplete();
  }

  update(dt: number): void {
    if (!this.playing) return;
    const kf = this.keyframes[this.index];
    if (!kf) {
      this.playing = false;
      this.onComplete();
      return;
    }

    if (this.t < kf.duration) {
      this.t += dt;
      const rawP = Math.min(1, this.t / kf.duration);
      const ease = kf.ease ?? easeInOutCubic;
      const p = ease(rawP);
      this.camera.position.lerpVectors(this.startPos, kf.position, p);
      const look = new THREE.Vector3().lerpVectors(this.startLook, kf.lookAt, p);
      this.camera.lookAt(look);
      if (kf.fov) {
        this.camera.fov = THREE.MathUtils.lerp(this.startFov, kf.fov, p);
        this.camera.updateProjectionMatrix();
      }
    } else if (this.holdT < (kf.hold ?? 0)) {
      this.holdT += dt;
    } else {
      this.index += 1;
      this.t = 0;
      this.holdT = 0;
      this.startPos.copy(kf.position);
      this.startLook.copy(kf.lookAt);
      this.startFov = kf.fov ?? this.startFov;
    }
  }
}
