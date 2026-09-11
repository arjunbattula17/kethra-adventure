import * as THREE from 'three';
import { AudioSystem } from '../audio/AudioSystem';
import { bus } from '../core/EventBus';
import { gameState } from '../core/GameState';
import { InputManager } from '../core/InputManager';
import { PanelManager } from '../ui/PanelManager';
import { UIManager } from '../ui/UIManager';
import { CONSOLE_APPROACH, MONITOR_ANCHOR, consoleBootGate } from '../ship/interior/console';
import type { ShipInteriorScene } from '../ship/ShipInteriorScene';
import { TutorialBeacon } from './TutorialBeacon';
import { TutorialHud } from './TutorialHud';
import type { TutorialKeyChip } from './TutorialHud';

/**
 * The opening tutorial.
 *
 * The game used to drop the player into the ship and start the threat-response puzzle on a timer
 * roughly nine seconds later, before they had been told that the mouse looks, that WASD walks, or
 * what the puzzle in front of them wanted. This replaces that with a sequence that ends where the
 * puzzle now begins: at the navigation console, on a deliberate keypress.
 *
 * Every step is gated on the player actually doing the thing, read back from the system that
 * already owns it -- PlayerController's yaw/pitch for looking, InputManager for keys, PanelManager
 * for the character sheet, the camera's own world position for arriving at the desk, and the
 * console's real InteractionSystem entry for the handover. Nothing advances on a timer and nothing
 * advances on an "OK" button, so a player who reaches the end has demonstrably done all of it.
 *
 * Two escape valves. The cold-open captions are skippable for everyone -- they carry no
 * instruction, and they are the part a returning player has already read. The steps themselves
 * are skippable only for a player who has finished the opening before on this machine (GameFlow
 * passes that in from a localStorage marker the save-wipe of a new game doesn't touch): skipping
 * runs the exact completion path, so everything downstream of the console boot is identical.
 */

interface TutorialStep {
  title: string;
  /** Trusted markup (may contain <kbd>). */
  body: string;
  keys?: TutorialKeyChip[];
  /** Mirrored into the objective tracker so the top-left HUD tracks the tutorial too. */
  objective: string;
  /** Shown under the body if the step is still unfinished after `hintAfter` seconds. */
  hint: string;
  hintAfter: number;
  enter?: () => void;
  done: () => boolean;
}

const COLD_OPEN = [
  'Emergency reboot complete. Life support: online.',
  'Navigation, hyperdrive and long-range scan are still dark.',
  'You are the only one aboard awake to do anything about it.',
];
const COLD_OPEN_MS = 2700;

/** How much combined yaw + pitch, in radians, counts as "looked around". About a quarter turn. */
const LOOK_THRESHOLD = 1.5;
/** How close to the deck marker, in metres, counts as having reached the console. */
const ARRIVAL_RADIUS = 1.7;
/** Fraction of the viewport the waypoint marker is held inside once the target leaves the screen. */
const EDGE_X = 0.86;
const EDGE_Y = 0.8;
/** Seconds the cleared card is held on screen before the next step replaces it. */
const STEP_HOLD = 0.8;
/** Pixels of clearance kept between the waypoint marker's centre and the top of the card. */
const MARKER_CLEARANCE = 40;

const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];

export class TutorialSequence {
  onComplete: () => void = () => {};

  private scene: ShipInteriorScene;
  private hud = new TutorialHud();
  private beacon: TutorialBeacon;
  private steps: TutorialStep[];

  private running = false;
  private finished = false;
  /** -1 while the cold open plays; an index into `steps` once it hands over. */
  private stepIndex = -1;
  private stepElapsed = 0;
  private hintShown = false;
  private holdRemaining = 0;
  private elapsed = 0;

  private pressed = new Set<string>();
  private lookAmount = 0;
  private lastYaw = 0;
  private lastPitch = 0;
  private openedCharacterSheet = false;
  private consoleBooted = false;

  private waypointActive = false;
  private waypointTarget = new THREE.Vector3();
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();
  private tmpC = new THREE.Vector3();

  private skipRequested = false;
  private resolveWait: (() => void) | null = null;
  private unsubscribe: (() => void) | null = null;
  /** elapsed at the moment the first step card appeared; arms the whole-tutorial skip below. */
  private stepsStartedAt = Infinity;
  /** Whether this player may skip the steps themselves — true only for returning players. */
  private readonly allowSkip: boolean;

  constructor(scene: ShipInteriorScene, allowSkip = false) {
    this.scene = scene;
    this.allowSkip = allowSkip;
    this.beacon = new TutorialBeacon(scene.scene);
    this.lastYaw = scene.player.yaw;
    this.lastPitch = scene.player.pitch;
    this.steps = this.buildSteps();
  }

  private buildSteps(): TutorialStep[] {
    return [
      {
        title: 'Take the Helm',
        body: 'Click anywhere on the screen to hand mouse control to the ship, then move your mouse to look around the deck.',
        keys: [{ code: 'Mouse', label: 'MOUSE' }],
        objective: 'Get your bearings.',
        hint: 'Left-click the game window first — that is what captures your mouse. Escape releases it again whenever you want.',
        hintAfter: 9,
        enter: () => {
          this.lookAmount = 0;
          this.lastYaw = this.scene.player.yaw;
          this.lastPitch = this.scene.player.pitch;
        },
        done: () => this.lookAmount > LOOK_THRESHOLD,
      },
      {
        title: 'Find Your Footing',
        body: 'Walk the deck with <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd>. Hold <kbd>Shift</kbd> to run and tap <kbd>Space</kbd> to jump — those stay with you everywhere you go.',
        keys: [
          { code: 'KeyW', label: 'W' },
          { code: 'KeyA', label: 'A' },
          { code: 'KeyS', label: 'S' },
          { code: 'KeyD', label: 'D' },
          { code: 'ShiftLeft', label: 'SHIFT', optional: true },
          { code: 'Space', label: 'SPACE', optional: true },
        ],
        objective: 'Learn to move.',
        hint: 'Tap each of the four keys once: W walks forward, S back, A left, D right. Shift and Space are optional.',
        hintAfter: 12,
        done: () => MOVE_KEYS.every((code) => this.pressed.has(code)),
      },
      {
        title: 'Know Your Skills',
        body: 'Insight, engineering, perception — what you are good at decides what this ship, and the worlds past it, will let you do, and those skills grow as you use them. Press <kbd>Tab</kbd> to read your sheet, then close it again.',
        keys: [{ code: 'Tab', label: 'TAB' }],
        objective: 'Review your character sheet.',
        hint: 'Press Tab to open the sheet. Tab again — or Escape — closes it.',
        hintAfter: 12,
        // Cleared on entry for the same reason step 1 clears lookAmount: the latch is set by a
        // window listener that has been live since the cold open, and the HUD has been advertising
        // "TAB — Character" since the first frame. A player who tried it earlier would otherwise
        // arrive at this step to find it already complete, and never get to read the one card that
        // explains what skills are for.
        enter: () => {
          this.openedCharacterSheet = false;
        },
        done: () => this.openedCharacterSheet && !PanelManager.isOpen,
      },
      {
        title: 'Reach the Console',
        body: 'Nothing gets repaired from where you are standing. The navigation console at the far end of the deck is the one system still listening to you — walk to the marker.',
        objective: 'Reach the navigation console.',
        hint: 'It is the wide bank of screens at the far end of the room. The amber marker on your screen points the way and counts down the distance.',
        hintAfter: 18,
        enter: () => {
          this.beacon.showPillarAt(CONSOLE_APPROACH.x, CONSOLE_APPROACH.z);
          this.waypointTarget.set(CONSOLE_APPROACH.x, 1.1, CONSOLE_APPROACH.z);
          this.waypointActive = true;
        },
        done: () => this.horizontalDistanceTo(CONSOLE_APPROACH.x, CONSOLE_APPROACH.z) < ARRIVAL_RADIUS,
      },
      {
        title: 'Bring It Online',
        body: 'Look at the console screens and press <kbd>E</kbd> to boot navigation. This is how you use anything out here: put it in the centre of your view, wait for the prompt, press <kbd>E</kbd>.',
        keys: [{ code: 'KeyE', label: 'E' }],
        objective: 'Boot the navigation console.',
        hint: 'Step right up to the screens. The prompt appears in the centre of your view once you are close enough.',
        hintAfter: 14,
        enter: () => {
          consoleBootGate.unlocked = true;
          this.beacon.showBracketAt(MONITOR_ANCHOR.x, MONITOR_ANCHOR.y, MONITOR_ANCHOR.z + 0.25);
          this.waypointTarget.set(MONITOR_ANCHOR.x, MONITOR_ANCHOR.y, MONITOR_ANCHOR.z);
          this.waypointActive = true;
        },
        done: () => this.consoleBooted,
      },
    ];
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    consoleBootGate.unlocked = false;
    consoleBootGate.consumed = false;
    this.hud.mount();
    this.unsubscribe = bus.on('console:boot_requested', this.onConsoleRequested);
    window.addEventListener('keydown', this.onKeyDown);
    this.scene.onTick = (dt) => this.tick(dt);
    void this.runColdOpen();
  }

  /** Per-frame driver, called from ShipInteriorScene.update -- so it pauses with the engine. */
  private tick(dt: number): void {
    if (!this.running) return;
    this.elapsed += dt;
    this.beacon.update(this.elapsed);
    this.updateWaypoint();

    if (this.holdRemaining > 0) {
      this.holdRemaining -= dt;
      if (this.holdRemaining <= 0) this.enterNextStep();
      return;
    }
    if (this.stepIndex < 0) return;

    const step = this.steps[this.stepIndex];
    this.stepElapsed += dt;
    this.pollKeys(step);
    this.trackLook();

    if (!this.hintShown && this.stepElapsed >= step.hintAfter) {
      this.hud.setHint(step.hint);
      this.hintShown = true;
    }
    if (step.done()) this.advance();
  }

  private async runColdOpen(): Promise<void> {
    UIManager.showLetterbox(true);
    this.hud.showSkipHint(true);
    await this.wait(1100);
    for (const line of COLD_OPEN) {
      if (this.skipRequested || this.finished) break;
      UIManager.showCaption(line, COLD_OPEN_MS);
      await this.wait(COLD_OPEN_MS - 250);
    }
    this.hud.showSkipHint(false);
    UIManager.clearCaption();
    UIManager.showLetterbox(false);
    // The caption fades over 0.6s and the letterbox bars retract over 0.9s, both across the band the
    // first card is about to occupy. Let them clear it before the card arrives.
    await this.wait(950);
    if (this.finished) return;
    this.stepIndex = 0;
    this.stepsStartedAt = this.elapsed;
    if (this.allowSkip) this.hud.showSkipHint(true, '<kbd>Enter</kbd>Skip tutorial');
    this.enterStep();
  }

  /** Resolves after `ms`, or immediately if the cold open is skipped or the tutorial torn down. */
  private wait(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const id = window.setTimeout(() => {
        this.resolveWait = null;
        resolve();
      }, ms);
      this.resolveWait = () => {
        window.clearTimeout(id);
        this.resolveWait = null;
        resolve();
      };
    });
  }

  private enterStep(): void {
    const step = this.steps[this.stepIndex];
    this.stepElapsed = 0;
    this.hintShown = false;
    this.hud.setCard({
      index: this.stepIndex + 1,
      total: this.steps.length,
      title: step.title,
      body: step.body,
      keys: step.keys,
    });
    gameState.setObjective(step.objective);
    step.enter?.();
  }

  private advance(): void {
    AudioSystem.playChime();
    this.hud.markCardComplete();
    this.holdRemaining = STEP_HOLD;
  }

  private enterNextStep(): void {
    this.stepIndex++;
    if (this.stepIndex >= this.steps.length) {
      this.complete();
      return;
    }
    this.enterStep();
  }

  private pollKeys(step: TutorialStep): void {
    for (const key of step.keys ?? []) {
      if (key.code === 'Mouse' || this.pressed.has(key.code)) continue;
      if (!InputManager.isDown(key.code)) continue;
      this.pressed.add(key.code);
      this.hud.markKey(key.code);
      AudioSystem.playUiClick();
    }
  }

  private trackLook(): void {
    const player = this.scene.player;
    this.lookAmount += Math.abs(player.yaw - this.lastYaw) + Math.abs(player.pitch - this.lastPitch);
    this.lastYaw = player.yaw;
    this.lastPitch = player.pitch;
    if (this.lookAmount > 0.25) this.hud.markKey('Mouse');
  }

  private horizontalDistanceTo(x: number, z: number): number {
    const pos = this.scene.camera.getWorldPosition(this.tmpC);
    return Math.hypot(pos.x - x, pos.z - z);
  }

  /**
   * Drives the screen-space waypoint marker. On screen it sits on the target as a pip; off screen
   * it is clamped to the viewport edge as an arrow pointing the way the player has to turn.
   */
  private updateWaypoint(): void {
    if (!this.waypointActive) {
      this.hud.hideWaypoint();
      return;
    }
    const camera = this.scene.camera;
    const local = this.tmpA.copy(this.waypointTarget).applyMatrix4(camera.matrixWorldInverse);
    const behind = local.z > -camera.near;

    let x: number;
    let y: number;
    if (behind) {
      // A target behind the lens has no meaningful projection. Camera space keeps its sign either
      // side of the camera, so its x/y still say which way to turn -- scaled past the edge so the
      // clamp below lands the arrow on the correct border.
      const length = Math.hypot(local.x, local.y);
      if (length < 1e-4) {
        x = 2;
        y = 0;
      } else {
        x = (local.x / length) * 2;
        y = (local.y / length) * 2;
      }
    } else {
      const ndc = this.tmpB.copy(this.waypointTarget).project(camera);
      x = ndc.x;
      y = ndc.y;
    }

    const offscreen = behind || Math.abs(x) > EDGE_X || Math.abs(y) > EDGE_Y;
    if (offscreen) {
      const overshoot = Math.max(Math.abs(x) / EDGE_X, Math.abs(y) / EDGE_Y);
      x /= overshoot;
      y /= overshoot;
    }

    const px = (x * 0.5 + 0.5) * window.innerWidth;
    // The bottom of the NDC clamp band falls inside the instruction card at every viewport size, so
    // a target directly behind the player used to park the arrow and its distance readout on top of
    // the card's own sentence. Hold the marker clear of the card instead. The arrow's heading comes
    // from the direction, not from where it ends up, so it still points the right way.
    const py = Math.min(
      (-y * 0.5 + 0.5) * window.innerHeight,
      this.hud.cardTopEdge() - MARKER_CLEARANCE,
    );
    // CSS rotation runs clockwise with y growing downward, so the screen heading flips y.
    const angle = offscreen ? Math.atan2(-y, x) : 0;
    const metres = camera.getWorldPosition(this.tmpC).distanceTo(this.waypointTarget);
    this.hud.placeWaypoint(px, py, angle, offscreen, metres);
  }

  private onConsoleRequested = (): void => {
    if (this.finished) return;
    if (!consoleBootGate.unlocked) {
      UIManager.toast('The console is still rebooting — finish your systems check first.');
      AudioSystem.playError();
      this.hud.flash();
      return;
    }
    consoleBootGate.consumed = true;
    this.consoleBooted = true;
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.stepIndex < 0 && (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter')) {
      this.skipRequested = true;
      this.resolveWait?.();
      return;
    }
    // Whole-tutorial skip, returning players only. Armed a second after the first card appears so
    // an Enter mashed through the cold-open captions can't fall through and skip everything; the
    // repeat guard covers a held key the same way. Ignored while a panel is open — the handover
    // this triggers assumes the game, not a menu, is on screen.
    if (
      this.allowSkip &&
      this.stepIndex >= 0 &&
      !e.repeat &&
      !PanelManager.isOpen &&
      (e.code === 'Enter' || e.code === 'NumpadEnter') &&
      this.elapsed - this.stepsStartedAt > 1
    ) {
      this.complete();
      return;
    }
    if (e.code === 'Tab') {
      // CharacterPanel opens on this same event; whether it actually did is only knowable once the
      // whole dispatch has run, and no frame ticks while a panel holds the engine paused.
      window.setTimeout(() => {
        if (PanelManager.activeId === 'character') this.openedCharacterSheet = true;
      }, 0);
    }
  };

  private complete(): void {
    this.teardown();
    this.onComplete();
  }

  /** Test hook for the harnesses in tools/. Never reachable from gameplay input. */
  debugAdvance(): void {
    if (!this.running || this.holdRemaining > 0) return;
    if (this.stepIndex < 0) {
      this.skipRequested = true;
      this.resolveWait?.();
      return;
    }
    this.advance();
  }

  teardown(): void {
    if (!this.running) return;
    this.running = false;
    this.finished = true;
    this.resolveWait?.();
    this.unsubscribe?.();
    this.unsubscribe = null;
    window.removeEventListener('keydown', this.onKeyDown);
    this.scene.onTick = null;
    this.waypointActive = false;
    this.hud.destroy();
    this.beacon.dispose();
  }
}
