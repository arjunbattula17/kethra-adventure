import * as THREE from 'three';
import type { GameScene } from '../core/Engine';
import { UIManager } from '../ui/UIManager';
import { AudioSystem } from '../audio/AudioSystem';
import { getSharedEnvironment } from '../core/Environment';
import { buildShipHull } from './shipHull';
import { buildStarfield } from './spaceDressing';

/**
 * The opening cinematic: the emergency reboot, watched from outside.
 *
 * The cold-open captions have always narrated a reboot the player never saw ("Emergency reboot
 * complete. Life support: online."). This scene is that event. The freighter drifts dead across
 * an empty sky — no sun, no planets, deliberately: "where are we" stays the galaxy reveal's
 * question — until the port running light blinks, the viewport strips flicker back on section by
 * section, and a warm glow settles into the crew section. The engines never light: they are what
 * the rest of the game is about repairing. The camera ends pushed in on the one lit viewport
 * band, and the cut to black hands over to waking up inside, where the captions land as
 * narration of what was just watched.
 *
 * Cheap by design (the low-end target applies to cinematics too): the cached freighter GLB, two
 * point starfields, the equirect sky at low intensity, three lights, no particles, no belt, no
 * planet shaders. Loading it also pre-warms the hull template the galaxy reveal reuses later.
 *
 * Skippable by anyone at any time (Space/Enter/click) — it carries mood, not instruction.
 */

/** Timeline (seconds on the scene's dt clock, so it pauses with the engine). */
const BLINK_AT = 5.2;
const CUT_AT = 9;
const WINDOWS_AT = 10.5;
const STRIPS_AT = 13;
const GLOW_AT = 16.5;
const PUSH_AT = 20;
const PUSH_SECONDS = 10.5;
const DONE_AT = 31.5;

const DRIFT_PER_SECOND = 0.13;

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/** 0..1 ramp with the stutter of a failing starter: hard dropouts early, steadying toward 1. */
function flicker(t01: number, seed: number, elapsed: number): number {
  if (t01 <= 0) return 0;
  if (t01 >= 1) return 1;
  const strobe = Math.sin(elapsed * 31 + seed) * Math.sin(elapsed * 7.3 + seed * 2);
  const dropout = strobe > -0.2 + t01 * 1.1 ? 1 : 0.08;
  return t01 * dropout;
}

export class IntroScene implements GameScene {
  readonly kind = 'IntroScene';
  readonly usesAO = false;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 2000);
  onDone: (() => void) | null = null;

  private ship!: THREE.Group;
  private navPort: THREE.MeshStandardMaterial | null = null;
  private navStarboard: THREE.MeshStandardMaterial | null = null;
  /** Hull materials by glTF slot name; each hull clone gets fresh material objects per mesh. */
  private windowMats: THREE.MeshStandardMaterial[] = [];
  private stripMats: THREE.MeshStandardMaterial[] = [];
  private crewGlow!: THREE.PointLight;
  private elapsed = 0;
  private finished = false;
  private stopAmbient: (() => void) | null = null;
  private ambientStarted = false;
  private skipHintShown = false;

  private keyHandler = (e: KeyboardEvent) => {
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') this.finish();
  };
  private clickHandler = () => this.finish();

  async init(): Promise<void> {
    UIManager.setLookPromptEnabled(false);
    UIManager.showLetterbox(true);

    this.scene.background = new THREE.Color(0x010208);
    // The hull's plating is 0.85-metalness: without an environment to reflect, metal renders as
    // a hole in the starfield no matter how the lights are aimed. A low-intensity IBL is what
    // makes the dead ship read as a *shaped* silhouette.
    this.scene.environment = getSharedEnvironment();
    this.scene.environmentIntensity = 0.15;
    new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}textures/space/starfield.jpg`, (texture) => {
      if (this.finished) return;
      texture.mapping = THREE.EquirectangularReflectionMapping;
      texture.colorSpace = THREE.SRGBColorSpace;
      this.scene.background = texture;
      // Noticeably brighter than the hull: the dead ship reads as a silhouette against the sky
      // band, the one cinematic tool that works when the subject itself must stay dark.
      this.scene.backgroundIntensity = 0.9;
    });
    this.scene.add(buildStarfield(1400, 600, 0.7));

    const hull = await buildShipHull();
    this.ship = hull.group;
    this.ship.position.set(-3.5, 0, 0);
    this.ship.rotation.z = 0.06;
    // A slight tilt toward the camera turns the broad top plating into the lit plane that sells
    // the ship's mass while the flanks stay black.
    this.ship.rotation.x = 0.1;
    this.scene.add(this.ship);

    // Kill every sign of life on the hull; the timeline brings them back one system at a time.
    this.ship.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (obj.name === 'nav-light-port') {
        this.navPort = mat;
      } else if (obj.name === 'nav-light-starboard') {
        this.navStarboard = mat;
      } else if (mat.name === 'mat4') {
        this.windowMats.push(mat);
      } else if (mat.name === 'mat13') {
        this.stripMats.push(mat);
      } else if (mat.name === 'mat1') {
        // Engine rings: dark for the whole intro, and their repair is the game.
      }
      if (mat.emissiveIntensity !== undefined) mat.emissiveIntensity = 0;
    });

    // A dead ship still has a shape: faint cool rim from the distant, unseen star, and just
    // enough ambient that black-on-black reads as silhouette instead of nothing.
    const rim = new THREE.DirectionalLight(0x8fb4ff, 1.15);
    rim.position.set(-6, 3, -10);
    this.scene.add(rim);
    // The rim alone lights the far side; a whisper of cool fill from the camera side keeps the
    // near hull a *shaped* black instead of a hole in the starfield.
    const fill = new THREE.DirectionalLight(0x44557a, 0.55);
    fill.position.set(4, 2, 10);
    this.scene.add(fill);
    this.scene.add(new THREE.AmbientLight(0x25314a, 0.24));

    // The "somebody's home" glow that fades up over the crew section late in the timeline.
    this.crewGlow = new THREE.PointLight(0xffc27a, 0, 14);
    this.scene.add(this.crewGlow);

    this.camera.position.set(0, 1.2, 9.5);
    this.camera.lookAt(0, 0, 0);

    window.addEventListener('keydown', this.keyHandler);
    window.addEventListener('click', this.clickHandler);
  }

  update(dt: number): void {
    this.elapsed += dt;
    const t = this.elapsed;

    // The ship drifts; until the cut nobody alive is holding the camera, so it does not move.
    this.ship.position.x += DRIFT_PER_SECOND * dt;
    this.ship.rotation.z += dt * 0.0015;
    this.ship.updateMatrixWorld();

    if (t >= 1.2 && !this.skipHintShown) {
      this.skipHintShown = true;
      UIManager.showCaption('Press Space to skip', 2200);
    }

    // Port running light: two waking blinks, then the steady pulse of a live nav beacon.
    if (this.navPort) {
      if (t < BLINK_AT) this.navPort.emissiveIntensity = 0;
      else {
        const phase = (t - BLINK_AT) % 2.4;
        this.navPort.emissiveIntensity = phase < 0.16 ? 2.2 : 0;
        if (t - dt < BLINK_AT && t >= BLINK_AT) AudioSystem.playTone(88, 0.5, 'sine', 0.05);
      }
    }
    if (this.navStarboard) {
      this.navStarboard.emissiveIntensity = t >= STRIPS_AT && (t - STRIPS_AT + 1.2) % 2.4 < 0.16 ? 2.2 : 0;
    }

    // Reboot cascade: viewports first, then the running strips and hex panels, all with the
    // stutter of systems being dragged back awake.
    const windowRamp = flicker(Math.min(1, Math.max(0, (t - WINDOWS_AT) / 2.4)), 1, t);
    for (const mat of this.windowMats) mat.emissiveIntensity = 0.75 * windowRamp;
    const stripRamp = flicker(Math.min(1, Math.max(0, (t - STRIPS_AT) / 2.8)), 7, t);
    for (const mat of this.stripMats) mat.emissiveIntensity = 0.4 * stripRamp;

    if (t >= STRIPS_AT && !this.ambientStarted) {
      this.ambientStarted = true;
      this.stopAmbient = AudioSystem.startAmbient(48, 0.02);
    }

    const glowRamp = Math.min(1, Math.max(0, (t - GLOW_AT) / 3));
    this.crewGlow.intensity = 2.6 * easeInOut(glowRamp);
    this.crewGlow.position.copy(this.ship.position).add(new THREE.Vector3(1.6, 1.2, 2.2));

    // Camera: static wide until the cut, then parked off the bow quarter tracking the drift, then
    // a slow push toward the lit viewport band.
    if (t >= CUT_AT) {
      const push = easeInOut(Math.min(1, Math.max(0, (t - PUSH_AT) / PUSH_SECONDS)));
      this.camera.position.set(
        this.ship.position.x + THREE.MathUtils.lerp(6.6, 3.6, push),
        this.ship.position.y + THREE.MathUtils.lerp(1.9, 1.1, push),
        this.ship.position.z + THREE.MathUtils.lerp(8.8, 4.8, push),
      );
      // The look target drifts from ship centre toward the lit crew-section band as the push
      // tightens, so the frame ends filled by the one part of the hull that has come back to life.
      this.camera.lookAt(
        this.ship.position.x + THREE.MathUtils.lerp(0, 1.2, push),
        this.ship.position.y + THREE.MathUtils.lerp(0, 0.4, push),
        this.ship.position.z + THREE.MathUtils.lerp(0, 0.9, push),
      );
    }

    if (t >= DONE_AT) this.finish();
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    UIManager.clearCaption();
    // The letterbox deliberately stays up: the tutorial's cold open re-uses it immediately, and a
    // retract/re-extend across the handover would read as a glitch.
    this.onDone?.();
  }

  onResize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    window.removeEventListener('keydown', this.keyHandler);
    window.removeEventListener('click', this.clickHandler);
    this.stopAmbient?.();
    this.finished = true;
  }
}
