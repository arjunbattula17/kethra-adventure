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

  clear(): void {
    this.interactables = [];
    this.currentTarget = null;
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
      // fall back to proximity so low/off-center objects (consoles, floor items) are still reachable
      let bestDist = Infinity;
      for (const it of active) {
        const objPos = new THREE.Vector3();
        it.object.getWorldPosition(objPos);
        const dist = camPos.distanceTo(objPos);
        if (dist > Math.min(it.range, 1.6)) continue;
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
