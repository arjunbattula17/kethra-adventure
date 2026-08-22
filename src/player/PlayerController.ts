import * as THREE from 'three';
import { InputManager } from '../core/InputManager';

export interface ColliderBox {
  box: THREE.Box3;
}

export interface FloorRaycastTarget {
  meshes: THREE.Object3D[];
}

const EYE_HEIGHT = 1.7;
const WALK_SPEED = 3.2;
const SPRINT_SPEED = 5.6;
const CROUCH_SPEED = 1.6;
const PLAYER_RADIUS = 0.35;
const GRAVITY = -18;
const JUMP_SPEED = 6;
const MOUSE_SENSITIVITY = 0.0022;
const MAX_STEP_UP = 0.45;

export class PlayerController {
  rig = new THREE.Object3D();
  camera: THREE.PerspectiveCamera;
  velocityY = 0;
  onGround = false;
  yaw = 0;
  pitch = 0;
  colliders: ColliderBox[] = [];
  floorTargets: THREE.Object3D[] = [];
  enabled = true;
  crouching = false;
  private raycaster = new THREE.Raycaster();
  private moveState = { speed: 0 };
  headBobTime = 0;
  cameraShakeTrauma = 0;
  onFootstep: (() => void) | null = null;
  private lastBobHalfCycle = 0;

  constructor(camera: THREE.PerspectiveCamera, startPos = new THREE.Vector3(0, 1.7, 0)) {
    this.camera = camera;
    this.rig.position.copy(startPos);
    this.rig.add(camera);
    camera.position.set(0, 0, 0);
  }

  setColliders(boxes: THREE.Box3[]): void {
    this.colliders = boxes.map((box) => ({ box }));
  }

  setFloorTargets(meshes: THREE.Object3D[]): void {
    this.floorTargets = meshes;
  }

  teleport(pos: THREE.Vector3, yaw = 0): void {
    this.rig.position.copy(pos);
    this.yaw = yaw;
    this.pitch = 0;
    this.velocityY = 0;
  }

  private resolveCollisionXZ(desired: THREE.Vector3): THREE.Vector3 {
    const result = desired.clone();
    const testPoint = (p: THREE.Vector3) => {
      for (const { box } of this.colliders) {
        const closest = new THREE.Vector3(
          THREE.MathUtils.clamp(p.x, box.min.x, box.max.x),
          THREE.MathUtils.clamp(p.y, box.min.y, box.max.y),
          THREE.MathUtils.clamp(p.z, box.min.z, box.max.z),
        );
        if (closest.distanceTo(p) < PLAYER_RADIUS && p.y > box.min.y - 0.1 && p.y < box.max.y + 2) {
          return true;
        }
      }
      return false;
    };

    const testX = this.rig.position.clone();
    testX.x = result.x;
    if (testPoint(testX)) result.x = this.rig.position.x;

    const testZ = this.rig.position.clone();
    testZ.z = result.z;
    if (testPoint(testZ)) result.z = this.rig.position.z;

    return result;
  }

  private sampleFloorHeight(x: number, z: number): number | null {
    this.raycaster.set(new THREE.Vector3(x, this.rig.position.y + 2, z), new THREE.Vector3(0, -1, 0));
    this.raycaster.far = 10;
    const hits = this.raycaster.intersectObjects(this.floorTargets, true);
    if (hits.length === 0) return null;
    return hits[0].point.y;
  }

  update(dt: number): void {
    if (!this.enabled) return;

    const delta = InputManager.consumeMouseDelta();
    this.yaw -= delta.x * MOUSE_SENSITIVITY;
    this.pitch -= delta.y * MOUSE_SENSITIVITY;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);

    this.rig.rotation.set(0, this.yaw, 0);
    this.camera.rotation.set(this.pitch, 0, 0);

    this.crouching = InputManager.isDown('ControlLeft') || InputManager.isDown('KeyC');
    const sprinting = InputManager.isDown('ShiftLeft') && !this.crouching;
    const targetSpeed = this.crouching ? CROUCH_SPEED : sprinting ? SPRINT_SPEED : WALK_SPEED;

    let moveX = 0;
    let moveZ = 0;
    if (InputManager.isDown('KeyW') || InputManager.isDown('ArrowUp')) moveZ -= 1;
    if (InputManager.isDown('KeyS') || InputManager.isDown('ArrowDown')) moveZ += 1;
    if (InputManager.isDown('KeyA') || InputManager.isDown('ArrowLeft')) moveX -= 1;
    if (InputManager.isDown('KeyD') || InputManager.isDown('ArrowRight')) moveX += 1;

    const moving = moveX !== 0 || moveZ !== 0;
    this.moveState.speed = moving ? targetSpeed : 0;

    const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    const moveDir = new THREE.Vector3();
    moveDir.addScaledVector(forward, -moveZ);
    moveDir.addScaledVector(right, moveX);
    if (moveDir.lengthSq() > 0) moveDir.normalize();

    const desired = this.rig.position.clone().addScaledVector(moveDir, targetSpeed * dt);
    const resolved = this.resolveCollisionXZ(desired);

    const floorY = this.sampleFloorHeight(resolved.x, resolved.z);
    if (floorY !== null) {
      const stepDiff = floorY - this.rig.position.y;
      if (stepDiff > MAX_STEP_UP && !this.onGround) {
        // wall too tall to step onto: keep falling, don't snap
      } else if (Math.abs(stepDiff) <= MAX_STEP_UP + 1 || this.velocityY <= 0) {
        if (this.rig.position.y <= floorY + 0.05 || stepDiff <= MAX_STEP_UP) {
          resolved.y = floorY;
          this.onGround = this.rig.position.y - floorY < 0.15 || stepDiff >= -0.2;
        }
      }
    }

    if (InputManager.wasJustPressed('Space') && this.onGround) {
      this.velocityY = JUMP_SPEED;
      this.onGround = false;
    }

    if (!this.onGround || floorY === null) {
      this.velocityY += GRAVITY * dt;
      resolved.y = this.rig.position.y + this.velocityY * dt;
      if (floorY !== null && resolved.y <= floorY) {
        resolved.y = floorY;
        this.velocityY = 0;
        this.onGround = true;
      }
    } else {
      this.velocityY = 0;
    }

    this.rig.position.copy(resolved);

    if (moving && this.onGround) {
      this.headBobTime += dt * targetSpeed * 3.2;
      const halfCycle = Math.floor(this.headBobTime / Math.PI);
      if (halfCycle !== this.lastBobHalfCycle) {
        this.lastBobHalfCycle = halfCycle;
        this.onFootstep?.();
      }
    }
    const bobY = moving && this.onGround ? Math.sin(this.headBobTime) * 0.035 : 0;
    const bobX = moving && this.onGround ? Math.cos(this.headBobTime * 0.5) * 0.02 : 0;

    let shakeOffset = new THREE.Vector3();
    if (this.cameraShakeTrauma > 0) {
      const shake = this.cameraShakeTrauma * this.cameraShakeTrauma;
      shakeOffset = new THREE.Vector3(
        (Math.random() - 0.5) * shake * 0.3,
        (Math.random() - 0.5) * shake * 0.3,
        0,
      );
      this.cameraShakeTrauma = Math.max(0, this.cameraShakeTrauma - dt * 1.6);
    }

    this.camera.position.set(bobX + shakeOffset.x, EYE_HEIGHT + bobY + shakeOffset.y - EYE_HEIGHT * (this.crouching ? 0.35 : 0), shakeOffset.z);
  }

  addShake(amount: number): void {
    this.cameraShakeTrauma = Math.min(1, this.cameraShakeTrauma + amount);
  }

  getWorldPosition(): THREE.Vector3 {
    const camWorld = new THREE.Vector3();
    this.camera.getWorldPosition(camWorld);
    return camWorld;
  }

  getLookDirection(): THREE.Vector3 {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    return dir;
  }
}
