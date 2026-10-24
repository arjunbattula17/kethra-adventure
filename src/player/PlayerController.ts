import * as THREE from 'three';
import { InputManager } from '../core/InputManager';
import { PLAYER } from '../content/tuning';
import { BINDINGS } from '../content/controls';
import type { BindingId } from '../content/controls';
import { motion, damp } from '../motion';

const held = (id: BindingId) => BINDINGS[id].codes.some((c) => InputManager.isDown(c));
const pressed = (id: BindingId) => BINDINGS[id].codes.some((c) => InputManager.wasJustPressed(c));

export interface ColliderBox {
  box: THREE.Box3;
}

export interface FloorRaycastTarget {
  meshes: THREE.Object3D[];
}

// Movement feel lives in the tuning file; see the warning there before changing it.
const {
  EYE_HEIGHT, WALK_SPEED, SPRINT_SPEED, CROUCH_SPEED, PLAYER_RADIUS, PLAYER_HEIGHT, CROUCH_HEIGHT, CLIMB_SPEED,
  STEP_OVER, GRAVITY, JUMP_SPEED, MOUSE_SENSITIVITY, MAX_STEP_UP,
  COYOTE_TIME, JUMP_BUFFER, LAND_DIP, LAND_RECOVER, TURN_SPEED,
} = PLAYER;
// Crouching lowers the eye as far as it lowers the top of the capsule, so the eye stays 0.1 m under
// the top either way. A smaller drop leaves a crouched eye above the capsule, and a roof that stops
// the capsule then cuts through the camera.
const CROUCH_DROP = PLAYER_HEIGHT - CROUCH_HEIGHT;

/** How far the capsule centred at (x, z) reaches into `box` in plan view; above 0 means they overlap. */
function depthInto(box: THREE.Box3, x: number, z: number): number {
  const dx = x - THREE.MathUtils.clamp(x, box.min.x, box.max.x);
  const dz = z - THREE.MathUtils.clamp(z, box.min.z, box.max.z);
  if (dx !== 0 || dz !== 0) return PLAYER_RADIUS - Math.sqrt(dx * dx + dz * dz);
  return PLAYER_RADIUS + Math.min(x - box.min.x, box.max.x - x, z - box.min.z, box.max.z - z);
}

// Scratch vectors for update(): it runs every frame, so it allocates nothing.
const _up = new THREE.Vector3(0, 1, 0);
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _moveDir = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _rayOrigin = new THREE.Vector3();
const _down = new THREE.Vector3(0, -1, 0);
const _moveFrom = new THREE.Vector3();

export class PlayerController {
  rig = new THREE.Object3D();
  camera: THREE.PerspectiveCamera;
  velocityY = 0;
  onGround = false;
  yaw = 0;
  pitch = 0;
  colliders: ColliderBox[] = [];
  floorTargets: THREE.Object3D[] = [];
  /**
   * Ladder shafts: stand in one and W climbs, S descends. At the top, W also steps off onto the
   * floor ahead. Vessek's ducts use them.
   */
  ladders: THREE.Box3[] = [];
  /**
   * Below this world Y the player has fallen out of the level and is put back at the respawn point.
   * Kethra's terraces are islands with unguarded edges over a catch plane 20 units down, and there
   * was nothing to climb back up — walking off any edge was an unrecoverable soft lock. Defaults to
   * off; a scene sets it below its own lowest real floor.
   */
  fallResetY = -Infinity;
  onFellOut: (() => void) | null = null;
  private respawn: { pos: THREE.Vector3; yaw: number } | null = null;
  enabled = true;
  crouching = false;
  /** A cap on movement speed (m/s) that a scene can set. */
  speedLimit = Infinity;
  private raycaster = new THREE.Raycaster();
  /** The last floor sample, reused for an identical query within the same update(). */
  private floorSample = { valid: false, x: 0, z: 0, originY: 0, y: null as number | null };
  private floorHits: THREE.Intersection[] = [];
  private moveState = { speed: 0 };
  headBobTime = 0;
  cameraShakeTrauma = 0;
  onFootstep: (() => void) | null = null;
  /** Fires on touchdown with how hard the landing was (0..1). */
  onLand: ((strength: number) => void) | null = null;
  /** Multiplies mouse-look speed; set from the settings menu. */
  static sensitivity = 1;
  private lastBobHalfCycle = 0;
  private sinceGrounded = 0;
  private jumpBufferedFor = 0;
  /** From take-off to landing. The floor-follow is off meanwhile, or it pulls the player back down. */
  private jumping = false;
  /** Feet height at take-off; colliders keep blocking from this height until the player lands. */
  private jumpFromY = 0;
  private landDip = 0;
  private lean = 0;
  /** 0 standing, 1 crouched: eased, so the view lowers instead of snapping. */
  private crouchAmount = 0;
  /** Advances with time, not frames, so shake jitters at the same rate at 30 Hz and 144 Hz. */
  private shakePhase = 0;

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
    this.floorSample.valid = false;
  }

  /** Where fallResetY returns the player to. Set once per scene, after the opening teleport. */
  setRespawn(pos: THREE.Vector3, yaw = 0): void {
    this.respawn = { pos: pos.clone(), yaw };
  }

  teleport(pos: THREE.Vector3, yaw = 0): void {
    this.rig.position.copy(pos);
    this.yaw = yaw;
    this.pitch = 0;
    this.velocityY = 0;
    this.jumping = false;
  }

  /**
   * Whether the floor at (x, z) is too far above the player's feet to step onto. Without this the
   * player can scale any wall that has a walkable surface on top: update() snaps a grounded player
   * to whatever floor the downward ray finds, and since velocityY is zeroed on every grounded frame
   * its own MAX_STEP_UP test could never fail. Measured, a grounded player was being lifted 6 m in
   * one frame. Treating a too-tall step as a wall — refusing the horizontal move rather than
   * refusing the snap — is what stops the player ending up standing inside the raised geometry.
   */
  private stepTooHigh(x: number, z: number, feetY: number): boolean {
    const floorY = this.sampleFloorHeight(x, z);
    return floorY !== null && floorY - feetY > MAX_STEP_UP;
  }

  /**
   * The top of the player above the feet. Crouching shrinks the capsule at once, but the view eases
   * down over about a fifth of a second; until it is down, the top follows the eye, or a crouch
   * under a low roof (or in mid-jump) carries the camera into the roof.
   */
  private headHeight(): number {
    return Math.max(this.crouching ? CROUCH_HEIGHT : PLAYER_HEIGHT, PLAYER_HEIGHT - CROUCH_DROP * this.crouchAmount);
  }

  /**
   * Whether the player capsule standing with its feet at `feetY` would overlap a collider at
   * (x, z). The vertical test decides whether an obstacle is stepped over, walked under, or
   * blocking: the old version compared the *feet* against the box instead of the whole capsule, so
   * anything whose base sat above ankle height — a wall shelf, a bench top, a mounted panel —
   * never blocked at all. It also allocated a Vector3 per box per test, which the scene's
   * geometry-derived colliders make far too expensive.
   *
   * `from` is where a move starts. A collider the player is already inside there only blocks a move
   * that goes no further out of it: a closing door or a fall can leave the player overlapping a
   * box, and every nearby spot overlaps it too, so nothing else would get them out.
   */
  private blockedAt(x: number, z: number, feetY: number, height = this.headHeight(), stepFromY = feetY, from: THREE.Vector3 | null = null): boolean {
    const headY = feetY + height;
    const stepY = stepFromY + STEP_OVER;
    for (const { box } of this.colliders) {
      if (box.max.y <= stepY || box.min.y >= headY) continue;
      const dx = x - THREE.MathUtils.clamp(x, box.min.x, box.max.x);
      const dz = z - THREE.MathUtils.clamp(z, box.min.z, box.max.z);
      if (dx * dx + dz * dz >= PLAYER_RADIUS * PLAYER_RADIUS) continue;
      if (from && depthInto(box, x, z) < depthInto(box, from.x, from.z)) continue;
      return true;
    }
    return false;
  }

  /** Whether the player's capsule, where it stands now, overlaps `box`. A door checks before it shuts. */
  overlaps(box: THREE.Box3): boolean {
    const p = this.rig.position;
    return !box.isEmpty() && box.max.y > p.y && box.min.y < p.y + this.headHeight() && depthInto(box, p.x, p.z) > 0;
  }

  /** The lowest collider underside at or above `headY` over the player's footprint at (x, z), or null. */
  private roofAbove(x: number, z: number, headY: number): number | null {
    let roof: number | null = null;
    for (const { box } of this.colliders) {
      if (box.min.y < headY - 0.05 || (roof !== null && box.min.y >= roof)) continue;
      const dx = x - THREE.MathUtils.clamp(x, box.min.x, box.max.x);
      const dz = z - THREE.MathUtils.clamp(z, box.min.z, box.max.z);
      if (dx * dx + dz * dz < PLAYER_RADIUS * PLAYER_RADIUS) roof = box.min.y;
    }
    return roof;
  }

  /**
   * The floor is found by a ray down the middle of the body, but colliders are tested against its
   * radius. Coming down past the top of something with the middle just beyond its edge, the ray finds
   * the floor below and the body would sink into its side: it slides off the edge instead, as far as
   * it overlaps, unless that would push it into something else. Only boxes the descent brings into
   * reach count; anything that already reached the body was resolved by the horizontal move.
   */
  private slideOffEdges(p: THREE.Vector3, fromY: number): void {
    const height = this.headHeight();
    for (const { box } of this.colliders) {
      if (box.max.y > fromY + STEP_OVER || box.max.y <= p.y + STEP_OVER || box.min.y >= p.y + height) continue;
      const dx = p.x - THREE.MathUtils.clamp(p.x, box.min.x, box.max.x);
      const dz = p.z - THREE.MathUtils.clamp(p.z, box.min.z, box.max.z);
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d === 0 || d >= PLAYER_RADIUS) continue;
      const push = (PLAYER_RADIUS - d) / d + 1e-4;
      const x = p.x + dx * push;
      const z = p.z + dz * push;
      if (this.blockedAt(x, z, p.y)) continue;
      p.x = x;
      p.z = z;
    }
  }

  private resolveCollisionXZ(desired: THREE.Vector3): THREE.Vector3 {
    const result = desired;
    const from = this.rig.position;
    const stepFrom = this.jumping ? Math.min(from.y, this.jumpFromY) : from.y;
    // Resolved one axis at a time so a blocked direction slides along the obstacle instead of
    // stopping dead.
    if (this.blockedAt(result.x, from.z, from.y, undefined, stepFrom, from) || this.stepTooHigh(result.x, from.z, from.y)) result.x = from.x;
    if (this.blockedAt(result.x, result.z, from.y, undefined, stepFrom, _moveFrom.set(result.x, from.y, from.z)) || this.stepTooHigh(result.x, result.z, from.y)) result.z = from.z;
    return result;
  }

  /**
   * Height of the walking surface under (x, z), or null if there is none within reach. Public
   * rather than private because tools/collision-check.mjs drives it directly to sample the floor
   * across a whole scene: it has to use the player's own raycast, against the same floor targets,
   * or its reachability model would diverge from what the player actually walks on. The ray starts
   * 2 units above the rig (above the take-off point during a jump, so it can't start over a floor
   * overhead) and reaches 10, so a caller sampling somewhere other than the player's own position
   * must park the rig at a height that covers the range it cares about.
   */
  sampleFloorHeight(x: number, z: number): number | null {
    const originY = (this.jumping ? Math.min(this.rig.position.y, this.jumpFromY) : this.rig.position.y) + 2;
    // update() asks for the same spot up to three times a frame (each collision axis, then the final
    // position), and standing still they are all the same spot. The floor doesn't move within a
    // frame, so an identical query gets the identical answer without walking the floor meshes again.
    const c = this.floorSample;
    if (c.valid && c.x === x && c.z === z && c.originY === originY) return c.y;
    this.raycaster.set(_rayOrigin.set(x, originY, z), _down);
    this.raycaster.far = 10;
    const hits = this.floorHits;
    hits.length = 0;
    this.raycaster.intersectObjects(this.floorTargets, true, hits);
    const y = hits.length === 0 ? null : hits[0].point.y;
    c.valid = true;
    c.x = x;
    c.z = z;
    c.originY = originY;
    c.y = y;
    return y;
  }

  update(dt: number): void {
    if (!this.enabled) {
      // Mouse movement during a cutscene would otherwise all land at once when control returns.
      InputManager.consumeMouseDelta();
      return;
    }
    // Scenes can move or swap floor meshes between frames (and tools call sampleFloorHeight directly),
    // so a cached sample only lives for one update.
    this.floorSample.valid = false;

    const delta = InputManager.consumeMouseDelta();
    this.yaw -= delta.x * MOUSE_SENSITIVITY * PlayerController.sensitivity;
    this.pitch -= delta.y * MOUSE_SENSITIVITY * PlayerController.sensitivity;
    // Keyboard-only play: the arrow keys look around, as the mouse does, and never move the player.
    // Interaction targets are found by the way the player faces (InteractionSystem's proximity
    // fallback), so looking is all a keyboard player needs.
    if (held('lookLeft')) this.yaw += TURN_SPEED * dt;
    if (held('lookRight')) this.yaw -= TURN_SPEED * dt;
    if (held('lookUp')) this.pitch += TURN_SPEED * dt;
    if (held('lookDown')) this.pitch -= TURN_SPEED * dt;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);

    this.rig.rotation.set(0, this.yaw, 0);
    this.camera.rotation.set(this.pitch, 0, 0);

    // Force a crouch while there is no headroom to stand (a duct roof, or a ladder top into one).
    const pos = this.rig.position;
    const noHeadroom = this.blockedAt(pos.x, pos.z, pos.y, PLAYER_HEIGHT);
    this.crouching = held('crouch') || noHeadroom;
    const sprinting = held('sprint') && !this.crouching;
    const targetSpeed = Math.min(this.speedLimit, this.crouching ? CROUCH_SPEED : sprinting ? SPRINT_SPEED : WALK_SPEED);

    let moveX = 0;
    let moveZ = 0;
    if (held('forward')) moveZ -= 1;
    if (held('back')) moveZ += 1;
    if (held('left')) moveX -= 1;
    if (held('right')) moveX += 1;

    const moving = moveX !== 0 || moveZ !== 0;
    this.moveState.speed = moving ? targetSpeed : 0;

    const forward = _forward.set(0, 0, -1).applyAxisAngle(_up, this.yaw);
    const right = _right.set(1, 0, 0).applyAxisAngle(_up, this.yaw);
    const moveDir = _moveDir.set(0, 0, 0);
    moveDir.addScaledVector(forward, -moveZ);
    moveDir.addScaledVector(right, moveX);
    if (moveDir.lengthSq() > 0) moveDir.normalize();

    const ladder = this.ladders.find((b) => pos.x > b.min.x && pos.x < b.max.x && pos.z > b.min.z && pos.z < b.max.z && pos.y >= b.min.y - 0.05 && pos.y <= b.max.y + 0.05);
    const climb = held('forward') ? 1 : held('back') ? -1 : 0;
    const atTop = ladder !== undefined && pos.y >= ladder.max.y - 0.02;
    const atFoot = ladder !== undefined && pos.y <= ladder.min.y + 0.02;
    // At the top W steps off, and at the foot S backs away: both are walking, not climbing.
    if (ladder && climb !== 0 && !(climb > 0 && atTop) && !(climb < 0 && atFoot)) {
      // Climbing: vertical movement only, no gravity, and x/z kept a player radius inside the
      // shaft, since its walls can close in above the opening.
      pos.y = THREE.MathUtils.clamp(pos.y + climb * CLIMB_SPEED * dt, ladder.min.y, ladder.max.y);
      pos.x = THREE.MathUtils.clamp(pos.x, ladder.min.x + PLAYER_RADIUS, ladder.max.x - PLAYER_RADIUS);
      pos.z = THREE.MathUtils.clamp(pos.z, ladder.min.z + PLAYER_RADIUS, ladder.max.z - PLAYER_RADIUS);
      this.velocityY = 0;
      this.onGround = true;
      this.jumping = false;
      this.moveState.speed = 0;
      this.crouchAmount = damp(this.crouchAmount, this.crouching ? 1 : 0, 14, dt);
      this.camera.position.set(0, EYE_HEIGHT - CROUCH_DROP * this.crouchAmount, 0);
      this.camera.rotation.z = 0;
      return;
    }

    const desired = _desired.copy(this.rig.position).addScaledVector(moveDir, targetSpeed * dt);
    const resolved = this.resolveCollisionXZ(desired);

    // Over the shaft at the top of a ladder, its top rung is the floor until you step off onto the
    // real one; otherwise the hole under the upper floor drops you back down the shaft.
    const overTop = atTop && resolved.x > ladder.min.x && resolved.x < ladder.max.x && resolved.z > ladder.min.z && resolved.z < ladder.max.z;
    const floorY = overTop ? ladder.max.y : this.sampleFloorHeight(resolved.x, resolved.z);
    // No floor-follow mid-jump: a jump's first frames are inside the snap range, and the snap would
    // set the player straight back down. The airborne branch below lands it instead.
    if (floorY !== null && !this.jumping) {
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

    // Forgiveness: a press shortly before landing is remembered (buffer), and a jump shortly after
    // leaving a ledge still counts (coyote time). Jump height and distance are unchanged.
    this.sinceGrounded = this.onGround ? 0 : this.sinceGrounded + dt;
    this.jumpBufferedFor = pressed('jump') ? JUMP_BUFFER : Math.max(0, this.jumpBufferedFor - dt);
    // Not on a ladder: over the shaft, a jump from the top rung would come down past it. Not without
    // room to stand either (a duct, under a shelf): the head is at the roof already, and small
    // fittings hanging under it have no colliders to keep the camera out.
    if (this.jumpBufferedFor > 0 && !ladder && !noHeadroom && (this.onGround || this.sinceGrounded < COYOTE_TIME) && this.velocityY <= 0) {
      this.velocityY = JUMP_SPEED;
      this.onGround = false;
      this.jumping = true;
      this.jumpFromY = resolved.y;
      this.jumpBufferedFor = 0;
      this.sinceGrounded = COYOTE_TIME;
    }

    if (!this.onGround || floorY === null) {
      const fallSpeed = -this.velocityY;
      this.velocityY += GRAVITY * dt;
      resolved.y = this.rig.position.y + this.velocityY * dt;
      if (this.velocityY > 0) {
        // Rising: the head stops at the underside of anything overhead (a duct roof, a root tunnel).
        const height = this.headHeight();
        const roof = this.roofAbove(resolved.x, resolved.z, this.rig.position.y + height);
        if (roof !== null && resolved.y + height > roof) {
          resolved.y = Math.max(this.rig.position.y, roof - height);
          this.velocityY = 0;
        }
      }
      if (floorY !== null && resolved.y <= floorY) {
        resolved.y = floorY;
        this.velocityY = 0;
        this.onGround = true;
        this.jumping = false;
        // Follow-through on landing: the view dips with the weight and springs back.
        const strength = THREE.MathUtils.clamp(fallSpeed / 9, 0, 1);
        if (strength > 0.25) {
          this.landDip = LAND_DIP * strength;
          this.onLand?.(strength);
        }
      }
    } else {
      this.velocityY = 0;
    }

    if (resolved.y < this.rig.position.y) this.slideOffEdges(resolved, this.rig.position.y);
    this.rig.position.copy(resolved);
    this.floorSample.valid = false;

    if (this.rig.position.y < this.fallResetY && this.respawn) {
      this.rig.position.copy(this.respawn.pos);
      this.yaw = this.respawn.yaw;
      this.velocityY = 0;
      this.onGround = true;
      this.jumping = false;
      this.onFellOut?.();
    }

    if (moving && this.onGround) {
      this.headBobTime += dt * targetSpeed * 3.2;
      const halfCycle = Math.floor(this.headBobTime / Math.PI);
      if (halfCycle !== this.lastBobHalfCycle) {
        this.lastBobHalfCycle = halfCycle;
        this.onFootstep?.();
      }
    }
    // Reduced motion: no head bob, no landing dip, no lean, no camera shake.
    const amount = motion.reduced ? 0 : 1;
    const bobY = moving && this.onGround ? Math.sin(this.headBobTime) * 0.035 * amount : 0;
    const bobX = moving && this.onGround ? Math.cos(this.headBobTime * 0.5) * 0.02 * amount : 0;
    this.landDip = damp(this.landDip, 0, LAND_RECOVER, dt);
    // A slight roll into strafes, so sideways movement has weight.
    this.lean = damp(this.lean, -moveX * (moving ? 0.012 : 0) * amount, 8, dt);
    this.crouchAmount = damp(this.crouchAmount, this.crouching ? 1 : 0, 14, dt);

    let shakeX = 0;
    let shakeY = 0;
    if (this.cameraShakeTrauma > 0) {
      const shake = this.cameraShakeTrauma * this.cameraShakeTrauma * amount;
      this.shakePhase += dt * 24;
      const p = this.shakePhase;
      shakeX = ((Math.sin(p) + 0.5 * Math.sin(p * 2.37 + 1.3)) / 1.5) * shake * 0.15;
      shakeY = ((Math.sin(p * 1.13 + 2.1) + 0.5 * Math.sin(p * 2.71 + 0.4)) / 1.5) * shake * 0.15;
      this.cameraShakeTrauma = Math.max(0, this.cameraShakeTrauma - dt * 1.6);
    }

    this.camera.position.set(bobX + shakeX, EYE_HEIGHT + bobY + shakeY - this.landDip * amount - CROUCH_DROP * this.crouchAmount, 0);
    this.camera.rotation.z = this.lean;
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
