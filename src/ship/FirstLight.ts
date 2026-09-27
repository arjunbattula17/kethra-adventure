import * as THREE from 'three';
import type { ShipInteriorScene } from './ShipInteriorScene';
import { MotionScope, damp, ease, motion } from '../motion';
import { UIManager } from '../ui/UIManager';
import { PanelManager } from '../ui/PanelManager';
import { AudioSystem } from '../audio/AudioSystem';
import { t } from '../content/strings';
import { gameState } from '../core/GameState';
import { getPointSprite } from '../galaxy/spaceDressing';
import { repaintDeskMap } from './interior/consoleTextures';
import { WAVE_AFT, WAVE_FORE } from './interior/power';

/** How long a full hold takes, and the fraction of it at which each pod lights. */
const HOLD_SECONDS = 3.5;
const IGNITIONS = [0.25, 0.5, 0.75, 1];

/**
 * First light (docs/DESIGN.md §5): the Wren has made no light of its own since the white sky. The
 * plot is committed; the survey lead takes the throttle. The cabin falls to its emergency strips,
 * the desk chart draws the course again, and the player holds the lever forward: four ignitions,
 * each a real kick, with power travelling down the deck as light, stern to helm, strip by strip.
 * Letting go spools the current step back; nothing fails. `play()` resolves once the fourth pod is
 * lit and the wave has reached the helm; the flow then pushes out through the viewport.
 */
export class FirstLight {
  private readonly ship: ShipInteriorScene;
  private readonly fx = new MotionScope('game');
  private held = false;
  private armed = false;
  private progress = 0;
  private lit = 0;
  private front = WAVE_AFT;
  private hint: HTMLDivElement | null = null;
  private dust: { points: THREE.Points; vel: Float32Array; age: number } | null = null;

  constructor(ship: ShipInteriorScene) {
    this.ship = ship;
  }

  async play(): Promise<void> {
    const ship = this.ship;
    const player = ship.player;
    const course = gameState.data.course;

    // Beat 1: the cabin falls to its emergency strips (from the helm aft), the desk chart draws the
    // course again, and the view eases toward the glass.
    UIManager.showCaption(t('firstlight.orion.plot', { cells: String(course?.cells ?? 4) }), 3200);
    AudioSystem.playTone(55, 1.6, 'sine', 0.07);
    const fromZ = player.rig.position.z;
    this.fx.tween({ duration: motion.reduced ? 0.01 : 1.4, update: (k) => ship.power.setWave(THREE.MathUtils.lerp(WAVE_FORE, WAVE_AFT, k), 'emergency', 'navigation') });
    if (ship.deskChart) {
      const chart = ship.deskChart;
      this.fx.tween({ duration: motion.reduced ? 0.01 : 1.6, update: (k) => repaintDeskMap(chart, course, ease.decelerate(k)) });
    }
    this.fx.tween({ duration: motion.reduced ? 0.01 : 3, update: (k) => (player.rig.position.z = fromZ - 0.12 * ease.standard(k)) });
    // Down a little from the monitors, so the chart redrawing the course sits in the lower third.
    const fromPitch = player.pitch;
    this.fx.tween({
      duration: motion.reduced ? 0.01 : 1.2,
      ease: ease.standard,
      update: (k) => {
        player.pitch = THREE.MathUtils.lerp(fromPitch, 0.02, k);
        ship.camera.rotation.set(player.pitch, 0, 0);
      },
    });
    await this.fx.wait(motion.reduced ? 0.4 : 2.8);
    ship.power.apply('emergency');

    // Beat 2: hold on the lever. After a second of stillness it offers itself.
    await this.turnTo(ship.throttle.focus, motion.reduced ? 0.01 : 1);
    await this.fx.wait(1);
    this.fx.tween({ duration: 0.5, update: (k) => ship.throttle.setRim(k) });
    for (let i = 0; i < 4; i++) ship.throttle.setPod(i, 1);
    this.showHint();
    this.armed = true;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);

    // Beat 3: the hold.
    await new Promise<void>((resolve) => {
      ship.onTick = (dt) => {
        this.tick(dt);
        if (this.lit === IGNITIONS.length && this.front <= WAVE_FORE + 0.3 && !this.dust) resolve();
      };
    });
    ship.onTick = (dt) => this.tickDust(dt);
    this.stopInput();
    this.hideHint();
    ship.power.apply('full');
    this.fx.tween({ duration: 0.6, update: (k) => ship.throttle.setRim(1 - k) });
    await this.fx.wait(motion.reduced ? 0.3 : 1.2);
    ship.onTick = null;
    this.dispose();
  }

  private tick(dt: number): void {
    // Holding pushes the lever through the four steps; letting go spools back to the last one lit.
    const floor = this.lit ? IGNITIONS[this.lit - 1] : 0;
    this.progress = this.held ? Math.min(1, this.progress + dt / HOLD_SECONDS) : Math.max(floor, this.progress - dt / 1.2);
    this.ship.throttle.setLever(this.progress);
    while (this.lit < IGNITIONS.length && this.progress >= IGNITIONS[this.lit] - 1e-6) this.ignite(this.lit++);
    // The power front runs down the deck toward the helm, one quarter per lit pod.
    const target = WAVE_AFT - (WAVE_AFT - WAVE_FORE) * (this.lit / IGNITIONS.length);
    this.front = motion.reduced ? target : damp(this.front, target, 2.2, dt);
    this.ship.power.setWave(this.front, 'emergency', 'full');
    this.tickDust(dt);
  }

  private ignite(i: number): void {
    this.ship.throttle.setPod(i, 2);
    AudioSystem.playTone(46 + i * 9, 0.9, 'triangle', 0.1);
    // Each ignition is a real impact: one of the only camera kicks in the game (DESIGN §3).
    this.ship.player.addShake(0.35 + i * 0.05);
    motion.conductor.duck(1.5);
    if (i === IGNITIONS.length - 1) this.shakeDust();
  }

  /** Dust shaken loose from the ceiling, once, on the last ignition. */
  private shakeDust(): void {
    if (motion.reduced) return;
    const count = 140;
    const eye = this.ship.camera.getWorldPosition(new THREE.Vector3());
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos.set([eye.x + (Math.random() - 0.5) * 3, 3.6 + Math.random() * 1.1, eye.z - 0.4 - Math.random() * 2.6], i * 3);
      vel.set([(Math.random() - 0.5) * 0.2, -0.2 - Math.random() * 0.6, (Math.random() - 0.5) * 0.2], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const points = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xb8ad9c, size: 2, sizeAttenuation: false, map: getPointSprite(), transparent: true, depthWrite: false, opacity: 0.7 }));
    this.ship.scene.add(points);
    this.dust = { points, vel, age: 0 };
  }

  private tickDust(dt: number): void {
    const d = this.dust;
    if (!d) return;
    d.age += dt;
    const attr = d.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const p = attr.array as Float32Array;
    for (let i = 0; i < p.length; i += 3) {
      d.vel[i + 1] -= 1.6 * dt;
      p[i] += d.vel[i] * dt;
      p[i + 1] += d.vel[i + 1] * dt;
      p[i + 2] += d.vel[i + 2] * dt;
    }
    attr.needsUpdate = true;
    (d.points.material as THREE.PointsMaterial).opacity = 0.7 * Math.max(0, 1 - d.age / 2.4);
    if (d.age > 2.4) {
      d.points.removeFromParent();
      d.points.geometry.dispose();
      (d.points.material as THREE.Material).dispose();
      this.dust = null;
    }
  }

  /** Turns the seated view to look at `point`. */
  private turnTo(point: THREE.Vector3, seconds: number): Promise<void> {
    const player = this.ship.player;
    const eye = this.ship.camera.getWorldPosition(new THREE.Vector3());
    const d = point.clone().sub(eye);
    const toYaw = Math.atan2(-d.x, -d.z);
    const toPitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    const from = { yaw: player.yaw, pitch: player.pitch };
    return new Promise((resolve) => {
      this.fx.tween({
        duration: seconds,
        ease: ease.standard,
        update: (k) => {
          player.yaw = THREE.MathUtils.lerp(from.yaw, toYaw, k);
          player.pitch = THREE.MathUtils.lerp(from.pitch, toPitch, k);
          player.rig.rotation.set(0, player.yaw, 0);
          this.ship.camera.rotation.set(player.pitch, 0, 0);
        },
        done: resolve,
      });
    });
  }

  private showHint(): void {
    const el = document.createElement('div');
    el.className = 'first-light-hint';
    el.innerHTML = `<span class="keycap">${t('skip.key')}</span><span>${t('firstlight.hold')}</span><span class="first-light-bar"><span></span></span>`;
    document.getElementById('ui-root')!.appendChild(el);
    this.hint = el;
    motion.ui.animate(el, [{ opacity: 0 }, { opacity: 1 }], { dur: 'medium' });
    const fill = el.querySelector('.first-light-bar > span') as HTMLElement;
    const loop = () => {
      if (!this.hint) return;
      fill.style.transform = `scaleX(${this.progress})`;
      requestAnimationFrame(loop);
    };
    loop();
  }

  private hideHint(): void {
    const el = this.hint;
    this.hint = null;
    if (!el) return;
    const a = motion.ui.animate(el, [{ opacity: 1 }, { opacity: 0 }], { dur: 'small', exit: true, fill: 'forwards' });
    a.finished.then(() => el.remove(), () => el.remove());
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.code !== 'Space' || !this.armed || PanelManager.isOpen) return;
    e.preventDefault();
    this.held = true;
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === 'Space') this.held = false;
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button === 0 && this.armed && !PanelManager.isOpen) this.held = true;
  };

  private onPointerUp = (): void => {
    this.held = false;
  };

  private stopInput(): void {
    this.armed = false;
    this.held = false;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
  }

  dispose(): void {
    this.stopInput();
    this.hint?.remove();
    this.hint = null;
    this.fx.dispose();
  }
}
