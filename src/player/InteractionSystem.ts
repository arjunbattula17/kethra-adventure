import * as THREE from 'three';
import { InputManager } from '../core/InputManager';

function isDescendantOf(node: THREE.Object3D, ancestor: THREE.Object3D): boolean {
  let p: THREE.Object3D | null = node.parent;
  while (p) {
    if (p === ancestor) return true;
    p = p.parent;
  }
  return false;
}

export interface Interactable {
  object: THREE.Object3D;
  label: string | (() => string);
  range: number;
  onInteract: () => void;
  enabled?: () => boolean;
}

function resolveLabel(it: Interactable): string {
  return typeof it.label === 'function' ? it.label() : it.label;
}

/**
 * cos(70°) — how far off straight ahead a target may sit and still be offered by the proximity
 * fallback below. Wider than the horizontal field of view, so nothing the player can actually see
 * is refused; narrow enough that nothing behind or beside them is offered.
 */
const MIN_FACING_DOT = 0.34;
/** Scratch vectors for the per-frame proximity pass, which runs over every registered target. */
const _forward = new THREE.Vector3();
const _objPos = new THREE.Vector3();
const _toTarget = new THREE.Vector3();

export class InteractionSystem {
  private interactables: Interactable[] = [];
  private raycaster = new THREE.Raycaster();
  private currentTarget: Interactable | null = null;
  private currentLabel: string | null = null;
  onPromptChange: (label: string | null) => void = () => {};

  register(interactable: Interactable): () => void {
    this.interactables.push(interactable);
    return () => {
      this.interactables = this.interactables.filter((i) => i !== interactable);
    };
  }

  /**
   * World-space origin of every registered target. Scenes that scatter decor procedurally use this
   * to keep a random rock from landing on something the player has to walk up to.
   */
  anchorPositions(): THREE.Vector3[] {
    return this.interactables.map((it) => it.object.getWorldPosition(new THREE.Vector3()));
  }

  clear(): void {
    this.interactables = [];
    this.currentTarget = null;
    // The prompt is global DOM, not scene-owned: without this, a prompt visible at the moment a
    // scene is disposed stays on screen for the whole next scene (seen as "Access Navigation
    // Console" floating over the galaxy reveal).
    if (this.currentLabel !== null) {
      this.currentLabel = null;
      this.onPromptChange(null);
    }
  }

  update(camera: THREE.Camera): void {
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const camPos = new THREE.Vector3();
    camera.getWorldPosition(camPos);

    const active = this.interactables.filter((it) => !(it.enabled && !it.enabled()));
    const rayHits = this.raycaster.intersectObjects(
      active.map((it) => it.object),
      true,
    );

    let best: Interactable | null = null;
    if (rayHits.length > 0) {
      const hit = rayHits[0];
      best =
        active.find((it) => it.object === hit.object || isDescendantOf(hit.object, it.object)) ?? null;
      if (best && hit.distance > best.range) best = null;
    }

    if (!best) {
      // Fall back to proximity so low/off-centre objects (consoles, floor items) are still
      // reachable when the crosshair ray misses them.
      //
      // Distance alone was not enough: it measures camera-to-origin and asks nothing about which
      // way the player is turned, so standing at the console facing the opposite wall still raised
      // "Access Navigation Console" — a prompt for something behind you, offering a key that acts
      // on something you cannot see. It also contradicted what the opening tutorial teaches, which
      // is to put a target in the centre of your view and then press E.
      //
      // The facing test is deliberately flattened to the horizontal plane. This fallback exists
      // *because* the player is looking over or under the thing, which is a pitch problem — letting
      // pitch veto it would break the case it is here for. Which way they are turned is a separate
      // question, and that is the one worth asking.
      camera.getWorldDirection(_forward);
      _forward.y = 0;
      _forward.normalize();
      let bestDist = Infinity;
      for (const it of active) {
        it.object.getWorldPosition(_objPos);
        const dist = camPos.distanceTo(_objPos);
        if (dist > it.range) continue;
        _toTarget.copy(_objPos).sub(camPos);
        _toTarget.y = 0;
        const flatDist = _toTarget.length();
        // Standing all but on top of it: there is no meaningful direction left to test.
        if (flatDist > 0.05 && _forward.dot(_toTarget) / flatDist < MIN_FACING_DOT) continue;
        if (dist < bestDist) {
          bestDist = dist;
          best = it;
        }
      }
    }

    const label = best ? resolveLabel(best) : null;
    if (best !== this.currentTarget || label !== this.currentLabel) {
      this.currentTarget = best;
      this.currentLabel = label;
      this.onPromptChange(label);
    }

    if (this.currentTarget && InputManager.wasJustPressed('KeyE')) {
      this.currentTarget.onInteract();
    }
  }
}
