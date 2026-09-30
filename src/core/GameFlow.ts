import * as THREE from 'three';
import type { Engine } from './Engine';
import { ShipInteriorScene } from '../ship/ShipInteriorScene';
import { UIManager } from '../ui/UIManager';
import { t } from '../content/strings';
import { gameState } from './GameState';
import { InputManager } from './InputManager';
import { bus } from './EventBus';
import { SaveSystem } from './SaveSystem';
import { TutorialSequence } from '../tutorial/TutorialSequence';
import { CONSOLE_SEAT, DESK_CHART_ANCHOR, MONITOR_ANCHOR } from '../ship/interior/console';
import { AudioSystem } from '../audio/AudioSystem';
import type { InterceptResult } from '../galaxy/intercept/InterceptGame';
import { FirstLight } from '../ship/FirstLight';
import { ConsoleGuide } from '../ship/ConsoleGuide';
import { ShipLibrary } from '../journal/shipLibrary';
import { PanelManager } from '../ui/PanelManager';
import type { GameScene } from './Engine';
import { motion, MotionScope, ease } from '../motion';
import { mark, timedAsync } from './perfMarks';
import { BackgroundPrep } from './BackgroundPrep';
import { PACE } from './prepare';

/** The levels a player travels to, with the card that names each one on arrival. */
const LEVELS: Record<string, { number: number; title: string; line: string }> = {
  kethra: { number: 2, title: 'Kethra', line: 'Terraced ruins under a dimming canopy. Someone lives here.' },
  vessek: { number: 3, title: 'Vessek Anchorage', line: 'Twenty-one stranded ships and one very old ring.' },
};

/**
 * Longest the intro's opening shot holds for the Wren's build (IntroScene.holdOpening). On an Intel UHD
 * laptop the build takes ~2 s once its files have arrived; on a slow connection the intro starts
 * anyway, and the rest of the build shows as the odd dropped frame rather than a longer wait.
 */
const SHIP_BUILD_HOLD_MS = 4000;

/** A scene's preparation stages, each with its share of the loading bar and what the bar says. */
const STAGES = {
  build: { from: 0, to: 0.35, what: '' },
  compile: { from: 0.35, to: 0.75, what: 'Preparing materials' },
  upload: { from: 0.75, to: 0.88, what: 'Loading textures onto the graphics card' },
  draw: { from: 0.88, to: 1, what: 'Warming up the graphics card' },
} as const;
type Stage = keyof typeof STAGES;

/**
 * Loading-bar progress through a scene's preparation: each stage's real progress on its share of the
 * bar, which runs from `from` to `to`; `building` names the first stage ("Waking the Wren").
 */
function stagedProgress(building: string, from = 0.05, to = 0.97): (fraction: number, stage: Stage) => void {
  return (fraction, stage) => {
    const s = STAGES[stage];
    UIManager.setLoadingProgress(from + (to - from) * (s.from + (s.to - s.from) * fraction), stage === 'build' ? building : s.what);
  };
}
const shipLoadingProgress = stagedProgress('Waking the Wren');

/**
 * A transition that failed after putting the player back where they were, with a message (a level's
 * code that wouldn't download). Any other failure leaves the player mid-transition, often on a black
 * cover, and go() shows the load-failure screen instead.
 */
class HandledFailure extends Error {}

/**
 * Scene-level states of a playthrough. One transition runs at a time, and only along EDGES, so a
 * double click or a stale callback can't start a second or out-of-place transition.
 */
export type FlowState = 'boot' | 'intro' | 'wren' | 'reveal' | 'kethra' | 'vessek' | 'ending';

const EDGES: Record<FlowState, FlowState[]> = {
  boot: ['intro', 'wren', 'reveal'],
  intro: ['wren'],
  wren: ['reveal', 'kethra', 'vessek', 'ending'],
  reveal: ['wren'],
  kethra: ['wren', 'kethra'],
  vessek: ['wren', 'vessek'],
  ending: ['wren'],
};

/**
 * Whether this machine has ever finished the opening, across saves. Deliberately not part of the
 * save (a new game wipes that): it exists so the tutorial can offer its skip to a returning
 * player who starts over. try/catch because localStorage can be unavailable (privacy modes) —
 * the graceful failure is simply treating the player as new.
 */
const OPENING_SEEN_KEY = 'kethra_opening_seen_v1';
function hasSeenOpening(): boolean {
  try {
    return localStorage.getItem(OPENING_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}
function markOpeningSeen(): void {
  try {
    localStorage.setItem(OPENING_SEEN_KEY, '1');
  } catch {
    // nothing to do — the skip offer is a convenience, not progress
  }
}

export class GameFlow {
  private engine: Engine;
  private shipScene: ShipInteriorScene | null = null;
  /** Live only during the opening. Public so the harnesses in tools/ can drive it through __DEBUG__. */
  tutorial: TutorialSequence | null = null;
  /** The Wren, preparing itself behind the intro cinematic; consumed at the handover. */
  private shipPrep: BackgroundPrep<ShipInteriorScene> | null = null;
  /** The markers pointing at the navigation console between MG1 and the first departure. */
  private consoleGuide: ConsoleGuide | null = null;

  /** The save as it stood when the player entered the current level: "Restart this level" returns here. */
  private levelSnapshot: { planetId: string; json: string } | null = null;

  state: FlowState = 'boot';
  private busy = false;
  /** Waits run on the game clock, so they pause with the game. */
  private fx = new MotionScope('game');

  constructor(engine: Engine) {
    this.engine = engine;
    bus.on('galaxy:travel_to', (planetId: string) => void this.travelToPlanet(planetId));
    // Long-range comms is the last repair the Anchorage's alloy pays for, and the one that lets the
    // ledger go home: repairing it is what opens the ending.
    bus.on('ship:repaired', (key: string) => {
      // Use the ui clock: the repair panel has the game paused when this fires.
      if (key === 'communications' && gameState.hasFlag('vessek_alloy_given')) motion.ui.after(0.9, () => this.offerTransmit());
    });
    bus.on('ui:transmit', () => this.requestTransmit());
    // The Deep Scanner's repair is what extends the chart: after Kethra, the next world resolves.
    // Without this the repair changed nothing the player could see, and level 2 ended in a dead end.
    bus.on('ship:repaired', (key: string) => {
      if (key !== 'scanner' || gameState.data.planetsUnlocked.includes('vessek')) return;
      gameState.data.planetsUnlocked.push('vessek');
      UIManager.toast(t('toast.scanner.resolved'));
      gameState.setObjective(t('objective.afterScanner'));
    });
    for (const event of ['ship:repaired', 'level:up', 'log:unlocked', 'clue:added']) {
      bus.on(event, () => SaveSystem.save());
    }
  }

  /**
   * Runs one transition to `to` if none is running and the edge exists. Returns whether it ran.
   * All scene changes go through here.
   */
  private async go(to: FlowState, body: () => Promise<void>, force = false): Promise<boolean> {
    if (this.busy) {
      console.warn(`[flow] ignored ${this.state} → ${to}: a transition is already running`);
      return false;
    }
    if (!force && !EDGES[this.state].includes(to)) {
      console.warn(`[flow] ignored ${this.state} → ${to}: not a transition from here`);
      return false;
    }
    this.busy = true;
    try {
      await body();
      this.state = to;
      return true;
    } catch (err) {
      if (err instanceof HandledFailure) {
        // The body has already restored the player and shown an error; the state is unchanged.
        console.warn(`[flow] ${this.state} → ${to} did not complete`, err);
        return false;
      }
      // Anything else stopped a scene change partway, usually behind the black cover: a scene that
      // couldn't build (a file that failed every retry), or a GPU that went away. Say so plainly and
      // offer a reload rather than leaving a black screen.
      console.error(`[flow] ${this.state} → ${to} failed`, err);
      UIManager.showLoadFailure();
      return false;
    } finally {
      this.busy = false;
    }
  }

  isTransitioning(): boolean {
    return this.busy;
  }

  /**
   * For the debug harness and the tools in tools/: jump to a state through the same guarded
   * transition the game uses, skipping only the "is this an edge from here" check.
   */
  debugGo(target: 'tutorial' | 'reveal' | 'wren' | 'kethra' | 'vessek' | 'ending'): Promise<boolean> {
    switch (target) {
      case 'tutorial':
        return this.go('wren', () => this.beginTutorialOnShip(), true);
      case 'reveal':
        return this.go('reveal', () => this.enterReveal(), true);
      case 'wren':
        return this.go('wren', () => this.returnFromPlanet(), true);
      case 'ending':
        return this.go('ending', () => this.playEnding(), true);
      default:
        return this.go(target, () => this.enterPlanet(target), true);
    }
  }

  private wait(seconds: number): Promise<void> {
    return this.fx.wait(seconds);
  }

  // ------------------------------------------------------------------ boot

  /**
   * While the title screen waits for a click: start the downloads the next scene needs, whichever
   * button it is (the Wren follows New game and Continue alike; the intro only New game). Only
   * fetching, parsing and off-thread decoding: nothing here draws, compiles or paints, so the title
   * stays responsive. Asset prep that does (building the room) waits for the click.
   */
  prefetchWhileTitleWaits(likely: 'continue' | 'newGame'): void {
    // One after the other, in the order the likely click needs them: on a slow connection, fetching
    // both at once delayed the intro's first frame by the Wren's downloads (5.9 s at 10 Mbps).
    const intro = () => import('../galaxy/IntroScene').then((m) => m.preloadIntro());
    const ship = () => ShipInteriorScene.preload();
    const [first, second] = likely === 'continue' ? [ship, intro] : [intro, ship];
    void first()
      .catch(() => {})
      .then(second)
      .catch(() => {});
  }

  async start(): Promise<void> {
    if (this.state !== 'boot') return;
    if (gameState.hasFlag('tutorial_battle_complete')) {
      // Covers players whose completed save predates the skip marker: their save already proves
      // they finished the opening, so a later "new game" should still offer the skip.
      markOpeningSeen();
      await this.go('wren', async () => {
        this.shipScene = new ShipInteriorScene();
        await this.engine.setScene(() => this.shipScene!, { onProgress: shipLoadingProgress });
        this.engine.start();
        mark('ship:playable');
      });
      void this.finishReturnToShip();
      return;
    }
    // ?skipTutorial drops straight into the galaxy reveal, for the harnesses in tools/ that are
    // testing what comes *after* the opening and would otherwise have to drive five gated steps
    // to reach it. tools/test-tutorial-flow.mjs covers the real route. There is no player-facing
    // path here: the only way in without this parameter is the console.
    if (new URLSearchParams(location.search).has('skipTutorial')) {
      await this.go('reveal', async () => {
        this.shipScene = new ShipInteriorScene();
        await this.engine.setScene(() => this.shipScene!, { onProgress: shipLoadingProgress });
        this.engine.start();
        await this.enterReveal();
      });
      return;
    }
    let introLoaded = true;
    await this.go('intro', async () => {
      introLoaded = await this.bootIntro();
    });
    // If the intro chunk failed to load, go straight to the ship so the screen isn't left black.
    if (!introLoaded) await this.go('wren', () => this.beginTutorialOnShip());
  }

  /**
   * Fresh game: plays the intro scene first. It is the cheapest scene to build, so the first frame
   * appears sooner, and it pre-warms the hull the galaxy reveal reuses. Returns false if the intro
   * chunk failed to load.
   */
  private async bootIntro(): Promise<boolean> {
    let IntroScene;
    try {
      ({ IntroScene } = await import('../galaxy/IntroScene'));
    } catch {
      return false;
    }
    const intro = new IntroScene();
    intro.onDone = () => void this.go('wren', () => this.beginTutorialOnShip());
    // The intro goes up first: one hull, two starfields and a handful of programs, about a second
    // behind the loading bar. The Wren then prepares itself while the intro plays. Its build (geometry
    // and painted textures, in pieces of up to ~200 ms) runs while the opening shot holds still
    // (IntroScene.holdOpening); its GPU work (programs, uploads, first draws) is paced to stay inside
    // the intro's frames (prepare.ts). The last time this overlapped the intro, all of the Wren's
    // programs were compiled at once and froze it for ~11 s; that is what the pacing prevents
    // (docs/PERF_LOG.md, 2026-09-28). Whatever is left when the intro ends finishes behind the
    // handover's loading bar.
    void UIManager.fadeToBlack();
    await this.engine.setScene(() => intro, { onProgress: stagedProgress('Starting the engines') });
    // The hold is in place before the first frame: the build starts only once the reveal below has
    // finished (its wipe is animated on the page's own thread), and the clock must not start first.
    let buildDone!: () => void;
    intro.holdOpening(new Promise<void>((resolve) => (buildDone = resolve)), SHIP_BUILD_HOLD_MS);
    this.engine.start();
    mark('intro:uncovered');
    await UIManager.fadeFromBlack();
    const prep = new BackgroundPrep(this.engine, new ShipInteriorScene(), PACE.playing);
    this.shipPrep = prep;
    void prep.built.then(buildDone);
    return true;
  }

  /** The intro-to-interior handover: build the ship behind a fade, then start the tutorial. */
  private async beginTutorialOnShip(): Promise<void> {
    const prep = this.shipPrep;
    this.shipPrep = null;
    await UIManager.fadeToBlack();
    let scene: ShipInteriorScene | null = null;
    if (prep) {
      if (!prep.finished) {
        // Skipped early, or a slow machine: finish at full pace, with the bar picking up where the
        // preparation has got to.
        UIManager.showLoading();
        prep.pacer.pace = PACE.loading;
        prep.onProgress = shipLoadingProgress;
        shipLoadingProgress(prep.fraction, prep.stage);
      }
      try {
        scene = await prep.done;
        await this.fitShipToMachine(scene);
      } catch {
        // Preparation failed (a kit fetch died mid-intro) — fall through to the direct build,
        // which surfaces its own failure the same way the pre-preload boot did.
        scene = null;
      }
    }
    this.shipScene = scene ?? new ShipInteriorScene();
    await this.engine.setScene(() => this.shipScene!, { prepared: scene !== null, onProgress: shipLoadingProgress });
    this.engine.start();
    await UIManager.fadeFromBlack();
    mark('ship:playable');
    this.tutorial = new TutorialSequence(this.shipScene, hasSeenOpening());
    this.tutorial.onComplete = () => void this.go('reveal', () => this.beginFirstGame());
    this.tutorial.start();
  }

  /**
   * The start-up benchmark on the prepared Wren, behind the handover's cover: a few hidden frames
   * decide whether this machine keeps the guessed tier. If the tier drops, the room's lights (and so
   * every program) change, and the room is warmed again before it is shown.
   */
  private async fitShipToMachine(scene: ShipInteriorScene): Promise<void> {
    const before = this.engine.getQualityTier();
    const after = await timedAsync('ship:benchmark', () => this.engine.benchmarkScene(scene));
    if (after !== before) {
      scene.adaptToTier(after);
      UIManager.showLoading();
      await this.engine.warmScene(scene, { onProgress: shipLoadingProgress });
    }
    // Still under 30 fps on Performance: a lower render resolution, chosen before the first frame.
    await timedAsync('ship:fitRenderScale', () => this.engine.fitRenderScale(scene));
  }

  // ------------------------------------------------------------------ the opening

  /**
   * The handover between the tutorial and the first game. Reached only from the console the
   * tutorial walked the player to: booting navigation is what brings the star chart up, which is
   * what the galaxy reveal shows.
   */
  private async beginFirstGame(): Promise<void> {
    this.tutorial = null;
    if (!this.shipScene) return;
    // Both routes here — finishing the tutorial and skipping it — count as having seen the opening.
    markOpeningSeen();

    this.shipScene.player.enabled = false;
    InputManager.exitPointerLock();
    UIManager.setLookPromptEnabled(false);
    UIManager.setCrosshairVisible(false);
    UIManager.setPrompt(null);
    gameState.setObjective('Find out where you are.');

    // The letterbox rises while the player is guided into the pilot chair, so the sit-down reads
    // as the cinematic's first shot rather than a wait before it.
    UIManager.showLetterbox(true);
    await this.sitAtConsole();
    await this.wait(0.25);
    UIManager.showCaption('Navigation online. Reserve power routed to long-range scan.', 2600);
    await this.wait(2.5);
    UIManager.clearCaption();
    // The letterbox stays up: the reveal cinematic retracts it when it ends.
    await this.wait(0.3);
    await this.enterReveal();
  }

  /**
   * First-person sit-down: eases the player from wherever they pressed E into the pilot chair,
   * facing the monitor bank, before the navigation-boot captions play. Runs on the scene's own
   * tick (so it pauses with the engine) while the player is disabled — PlayerController.update()
   * is a hard no-op then, so nothing fights the glide and the seated pose holds afterwards with
   * no snap-back. Position follows a quadratic bezier through a point behind the chair at
   * standing height, which turns "lerp through the furniture" into "step in, turn, settle";
   * the eye-height drop is weighted into the second half so it reads as sitting down rather
   * than a descending elevator. Reduced motion cuts to the seat behind a short fade instead.
   */
  private async sitAtConsole(): Promise<void> {
    const scene = this.shipScene;
    if (!scene) return;
    const player = scene.player;
    const camera = scene.camera;
    const seatEye = CONSOLE_SEAT.eyeY;
    const targetPitch = Math.atan2(MONITOR_ANCHOR.y - seatEye, Math.abs(MONITOR_ANCHOR.z - CONSOLE_SEAT.z));

    if (motion.reduced) {
      await UIManager.fadeToBlack();
      this.poseSeated(scene);
      await UIManager.fadeFromBlack();
      return;
    }

    const start = {
      x: player.rig.position.x,
      z: player.rig.position.z,
      eye: camera.position.y,
      yaw: player.yaw,
      pitch: player.pitch,
    };
    // Approach control point: behind the chair on the player's side, still at standing height.
    const mid = { x: CONSOLE_SEAT.x, z: CONSOLE_SEAT.z + 0.55 };
    // Shortest arc, so a player who approached facing +x doesn't spin the long way round.
    const yawDelta = THREE.MathUtils.euclideanModulo(0 - start.yaw + Math.PI, Math.PI * 2) - Math.PI;
    const DURATION = 1.8;

    await new Promise<void>((resolve) => {
      let elapsed = 0;
      scene.onTick = (dt) => {
        elapsed += dt;
        const k = Math.min(1, elapsed / DURATION);
        const t = ease.standard(k);
        const u = 1 - t;
        player.rig.position.x = u * u * start.x + 2 * u * t * mid.x + t * t * CONSOLE_SEAT.x;
        player.rig.position.z = u * u * start.z + 2 * u * t * mid.z + t * t * CONSOLE_SEAT.z;
        // The drop into the seat happens across the back half of the move.
        const sitT = ease.standard(THREE.MathUtils.clamp((k - 0.45) / 0.55, 0, 1));
        camera.position.y = THREE.MathUtils.lerp(start.eye, seatEye, sitT);
        player.yaw = start.yaw + yawDelta * t;
        player.pitch = THREE.MathUtils.lerp(start.pitch, targetPitch, t);
        player.rig.rotation.set(0, player.yaw, 0);
        camera.rotation.set(player.pitch, 0, 0);
        if (k >= 1) {
          scene.onTick = null;
          // A low, soft contact note as the seat takes the weight.
          AudioSystem.playTone(70, 0.22, 'sine', 0.05);
          resolve();
        }
      };
    });
  }

  /** The seated pose at the console, facing the screens. */
  private poseSeated(scene: ShipInteriorScene): void {
    const player = scene.player;
    player.enabled = false;
    player.rig.position.set(CONSOLE_SEAT.x, 0, CONSOLE_SEAT.z);
    player.yaw = 0;
    player.pitch = Math.atan2(MONITOR_ANCHOR.y - CONSOLE_SEAT.eyeY, Math.abs(MONITOR_ANCHOR.z - CONSOLE_SEAT.z));
    player.rig.rotation.set(0, 0, 0);
    scene.camera.position.y = CONSOLE_SEAT.eyeY;
    scene.camera.rotation.set(player.pitch, 0, 0);
  }

  private async enterReveal(): Promise<void> {
    await UIManager.fadeToBlack();
    // Set only once the screen is black: the flag is what enables the desk's "Access Navigation
    // Console" interaction, and setting it while the interior is still visible pops that prompt
    // over the handover's final moments.
    gameState.setFlag('tutorial_battle_complete');
    let GalaxyRevealScene;
    try {
      ({ GalaxyRevealScene } = await import('../galaxy/GalaxyRevealScene'));
    } catch {
      // Same guard as travelToPlanet. The reveal is the only route out of the opening, so skip
      // straight to the state it would have left behind rather than stranding the player.
      await UIManager.fadeFromBlack();
      void this.completeReveal(null);
      return;
    }
    const reveal = new GalaxyRevealScene();
    reveal.onPlotted = (result) => void this.completeReveal(result);
    await this.engine.setScene(() => reveal, { onProgress: stagedProgress('Booting navigation') });
    await UIManager.fadeFromBlack();
  }

  private completeReveal(result: InterceptResult | null): Promise<boolean> {
    return this.go('wren', () => this.finishReveal(result));
  }

  /**
   * After MG1: rebuilds the ship interior with the player seated at the helm. The course is saved
   * before the rebuild so the console draws it.
   */
  private async finishReveal(result: InterceptResult | null): Promise<void> {
    await UIManager.fadeToBlack();
    if (result) gameState.data.course = { points: result.course.flatMap((p) => [p.x, p.y, p.z]), days: result.days, cells: result.cells };
    this.shipScene = new ShipInteriorScene();
    await this.engine.setScene(() => this.shipScene!, { onProgress: shipLoadingProgress });
    this.poseSeated(this.shipScene);
    UIManager.setLookPromptEnabled(false);
    // MG1 replaced the HUD objective; restore the saved one.
    UIManager.setObjective(gameState.data.objective, gameState.data.objectiveNote);
    await UIManager.fadeFromBlack();
    if (result) await this.lookAtChart();
    await this.completeCalibration();
  }

  /**
   * Leans the camera over the desk chart showing the plotted course, and holds. The chart lies
   * nearly flat at chest height, so it is unreadable from the seat.
   */
  private async lookAtChart(): Promise<void> {
    const scene = this.shipScene;
    if (!scene) return;
    const player = scene.player;
    const camera = scene.camera;
    const lean = { z: DESK_CHART_ANCHOR.z + 0.95, eye: 1.62 };
    const from = { z: player.rig.position.z, eye: camera.position.y, pitch: player.pitch };
    const toPitch = Math.atan2(DESK_CHART_ANCHOR.y - lean.eye, Math.abs(DESK_CHART_ANCHOR.z - lean.z));
    const DURATION = motion.reduced ? 0.01 : 1.2;
    await new Promise<void>((resolve) => {
      let elapsed = 0;
      scene.onTick = (dt) => {
        elapsed += dt;
        const k = ease.standard(Math.min(1, elapsed / DURATION));
        player.rig.position.z = THREE.MathUtils.lerp(from.z, lean.z, k);
        camera.position.y = THREE.MathUtils.lerp(from.eye, lean.eye, k);
        player.pitch = THREE.MathUtils.lerp(from.pitch, toPitch, k);
        camera.rotation.set(player.pitch, 0, 0);
        if (elapsed >= DURATION) {
          scene.onTick = null;
          resolve();
        }
      };
    });
    await this.wait(1.6);
  }

  /** Sets the post-plot flags and awards, stands the player up and returns control. */
  private async completeCalibration(): Promise<void> {
    gameState.setFlag('galaxy_revealed');
    if (!gameState.data.planetsUnlocked.includes('kethra')) {
      gameState.data.planetsUnlocked.push('kethra');
    }
    gameState.setFlag('logs_available');
    gameState.setFlag('damage_assessed');
    // The concepts the plot just made the player USE — distance/speed/time navigation math and
    // the Doppler-confirmed cruise speed — plus what the reveal's scan itself demonstrated,
    // land in the Ship's Library the moment they earned the calibration.
    ShipLibrary.award(['lib_navigation', 'lib_doppler', 'lib_spectroscopy', 'lib_kepler', 'lib_belts']);
    gameState.addAttributeXp('insight', 1);
    gameState.addAttributeXp('engineering', 1);

    await this.standFromConsole();
    UIManager.setCrosshairVisible(true);
    UIManager.setLookPromptEnabled(true);
    await this.finishReturnToShip();
  }

  /** The sit-down's mirror: rise from the chair and step back to the console approach point. */
  private async standFromConsole(): Promise<void> {
    const scene = this.shipScene;
    if (!scene) return;
    const player = scene.player;
    const camera = scene.camera;
    if (motion.reduced) {
      player.rig.position.z = -3.0;
      player.pitch = 0;
      camera.position.y = 1.7;
      camera.rotation.set(0, 0, 0);
      player.enabled = true;
      return;
    }
    const start = { z: player.rig.position.z, eye: camera.position.y, pitch: player.pitch };
    const DURATION = 1.1;
    await new Promise<void>((resolve) => {
      let elapsed = 0;
      scene.onTick = (dt) => {
        elapsed += dt;
        const k = Math.min(1, elapsed / DURATION);
        const t = ease.standard(k);
        // Rise first, step back second — the reverse weighting of the sit-down.
        const riseT = ease.standard(Math.min(1, k / 0.65));
        camera.position.y = THREE.MathUtils.lerp(start.eye, 1.7, riseT);
        player.rig.position.z = THREE.MathUtils.lerp(start.z, -3.0, t);
        player.pitch = THREE.MathUtils.lerp(start.pitch, 0, t);
        camera.rotation.set(player.pitch, 0, 0);
        if (k >= 1) {
          scene.onTick = null;
          player.enabled = true;
          resolve();
        }
      };
    });
  }

  private async finishReturnToShip(): Promise<void> {
    if (gameState.hasFlag('kethra_mechanism_solved') || gameState.hasFlag('vessek_pulse')) {
      // A continued save from later in the story: say where things stand, not the opening's list.
      gameState.setObjective(this.shipObjective());
      SaveSystem.save();
      return;
    }
    // The course is plotted and saved on the desk chart: the one thing to do next is go. Logs and
    // repairs stay on offer as a quieter second line, and the console lights up to say where.
    gameState.setObjective(t('objective.exploreKethra'), t('objective.exploreKethra.note'));
    if (gameState.hasFlag('galaxy_revealed') && !gameState.hasFlag('left_wren') && this.shipScene) {
      this.consoleGuide?.dispose();
      this.consoleGuide = new ConsoleGuide(this.shipScene);
    }
    SaveSystem.save();
  }

  // ------------------------------------------------------------------ travel

  private async travelToPlanet(planetId: string): Promise<void> {
    if (!LEVELS[planetId]) {
      UIManager.toast('Scanner range insufficient for that destination.');
      return;
    }
    await this.go(planetId as FlowState, () => this.cruiseTo(planetId));
  }

  private async loadLevel(planetId: string): Promise<GameScene & { onDepart: (() => void) | null }> {
    if (planetId === 'kethra') {
      const { KethraScene } = await import('../planets/kethra/KethraScene');
      return new KethraScene();
    }
    const { VessekScene } = await import('../planets/vessek/VessekScene');
    return new VessekScene();
  }

  /**
   * Travel from the ship to a planet: the helm departure, the cruise, then the level. The level and
   * cruise chunks load while the ship is still on screen, and the level is prepared at the end of
   * the cruise.
   */
  private async cruiseTo(planetId: string): Promise<void> {
    const ship = this.shipScene;
    // The first arrival at Kethra plays the canopy descent (MG2) before the level.
    const flyCanopy = planetId === 'kethra' && !gameState.hasFlag('canopy_flown');
    let level: GameScene & { onDepart: (() => void) | null };
    let CruiseScene: typeof import('../galaxy/CruiseScene').CruiseScene;
    let canopy: import('../planets/kethra/canopy/CanopyScene').CanopyScene | null = null;
    try {
      let canopyModule: typeof import('../planets/kethra/canopy/CanopyScene') | null;
      [level, { CruiseScene }, canopyModule] = await Promise.all([
        this.loadLevel(planetId),
        import('../galaxy/CruiseScene'),
        flyCanopy ? import('../planets/kethra/canopy/CanopyScene') : Promise.resolve(null),
      ]);
      if (canopyModule) canopy = new canopyModule.CanopyScene();
    } catch {
      UIManager.toast('Navigation data unavailable. Check your connection and try again.', 'fail');
      throw new HandledFailure(`level ${planetId} failed to load`);
    }
    const course = gameState.data.course;
    const cruise = new CruiseScene({ destination: planetId === 'vessek' ? 'vessek' : 'kethra', days: course?.days ?? 6, cells: course?.cells ?? 4 });
    // Prepared while the ship is still on screen (First light, the departure): paced to stay inside
    // its frames, as the Wren is behind the intro.
    const cruiseReady = this.engine.prepareScene(cruise, { pacer: this.engine.newPacer(PACE.playing) });
    // A failure is reported by the await below, once First light has played.
    cruiseReady.catch(() => {});
    if (ship) await (gameState.hasFlag('first_light') ? this.departure(ship) : this.firstLight(ship));
    await cruiseReady;
    gameState.setFlag('left_wren');
    await this.engine.setScene(() => cruise, { prepared: true, quiet: true });
    this.shipScene = null;
    // What comes after the cruise prepares while it flies, paced to stay inside its frames: the
    // canopy first (the cruise hands over to it), then the level. Started at the cruise's last shot
    // instead, Kethra's build held MG2's final shot ~18 s and Vessek's held the docking title ~24-29 s
    // on an Intel UHD laptop (docs/perf/journey-cold, base-0930). The cruise holds its last shot for
    // whatever of the first is left; what's left of the level carries on under MG2.
    const paced = () => ({ pacer: this.engine.newPacer(PACE.playing) });
    let arrivalStarted: Promise<void> | null = null;
    const startArrival = () => (arrivalStarted ??= this.engine.prepareScene(canopy ?? level, paced()));
    // A failure is reported through prepareArrival, below.
    startArrival().catch(() => {});
    const levelReady = canopy ? startArrival().then(() => this.engine.prepareScene(level, paced())) : null;
    // Reported where it is awaited, below.
    levelReady?.catch(() => {});
    // The cruise holds its last shot until this settles, so a failed build must still settle it:
    // rejected, the hold never ended. The failure is thrown once the cruise hands back (see go()).
    let arrivalFailure: unknown = null;
    cruise.prepareArrival = () =>
      startArrival().catch((err: unknown) => {
        arrivalFailure = err ?? new Error('the arrival failed to prepare');
      });
    await new Promise<void>((resolve) => (cruise.onArrive = resolve));
    if (arrivalFailure) throw arrivalFailure;
    if (canopy) {
      await this.engine.setScene(() => canopy, { prepared: true, quiet: true });
      await new Promise<void>((resolve) => (canopy.onComplete = resolve));
      // Usually done by now; otherwise the rest of the build finishes on MG2's held final shot.
      await levelReady;
      gameState.setFlag('canopy_flown');
      gameState.addAttributeXp('traversal', 1);
    }
    await UIManager.fadeToBlack();
    level.onDepart = () => void this.go('wren', () => this.returnFromPlanet());
    this.levelSnapshot = { planetId, json: gameState.toJSON() };
    await this.engine.setScene(() => level, { prepared: true });
    await UIManager.fadeFromBlack();
    const card = LEVELS[planetId];
    UIManager.showChapterCard({ eyebrow: `Level ${card.number}`, title: card.title, lines: [card.line] });
    SaveSystem.save();
  }

  /** Departures after the first: sit at the helm, then push into the viewport. */
  private async departure(ship: ShipInteriorScene): Promise<void> {
    await this.takeTheHelm(ship);
    await this.pushIntoViewport(ship);
  }

  /** The first departure: plays FirstLight at the helm, then pushes into the viewport. */
  private async firstLight(ship: ShipInteriorScene): Promise<void> {
    await this.takeTheHelm(ship);
    await new FirstLight(ship).play();
    gameState.setFlag('first_light');
    await this.pushIntoViewport(ship);
  }

  private async takeTheHelm(ship: ShipInteriorScene): Promise<void> {
    InputManager.exitPointerLock();
    UIManager.setLookPromptEnabled(false);
    UIManager.setCrosshairVisible(false);
    UIManager.setPrompt(null);
    UIManager.showLetterbox(true);
    ship.player.enabled = false;
    await this.sitAtConsole();
  }

  /** Moves the camera up and forward toward the viewport glass above the monitors. */
  private async pushIntoViewport(ship: ShipInteriorScene): Promise<void> {
    const player = ship.player;
    const camera = ship.camera;
    const from = { z: player.rig.position.z, eye: camera.position.y, pitch: player.pitch };
    const to = { z: from.z - 1.1, eye: 1.95, pitch: 0.16 };
    const DURATION = motion.reduced ? 0.01 : 1.3;
    await new Promise<void>((resolve) => {
      let elapsed = 0;
      ship.onTick = (dt) => {
        elapsed += dt;
        const k = ease.accelerate(Math.min(1, elapsed / DURATION));
        player.rig.position.z = THREE.MathUtils.lerp(from.z, to.z, k);
        camera.position.y = THREE.MathUtils.lerp(from.eye, to.eye, k);
        player.pitch = THREE.MathUtils.lerp(from.pitch, to.pitch, k);
        camera.rotation.set(player.pitch, 0, 0);
        if (elapsed >= DURATION) {
          ship.onTick = null;
          resolve();
        }
      };
    });
  }

  private async enterPlanet(planetId: string): Promise<void> {
    const level = LEVELS[planetId];
    await UIManager.fadeToBlack();
    // Dynamic import keeps level code out of the initial chunk; the fetch happens behind the fade.
    let scene: GameScene & { onDepart: (() => void) | null };
    try {
      UIManager.showLoading();
      UIManager.setLoadingProgress(0.15, `Charting ${level.title}`);
      if (planetId === 'kethra') {
        const { KethraScene } = await import('../planets/kethra/KethraScene');
        scene = new KethraScene();
      } else {
        const { VessekScene } = await import('../planets/vessek/VessekScene');
        scene = new VessekScene();
      }
    } catch {
      // A chunk that fails to load (stale deploy, dropped connection) would leave the screen black:
      // fade back in and stay on the ship.
      UIManager.hideLoading();
      await UIManager.fadeFromBlack();
      UIManager.toast('Navigation data unavailable. Check your connection and try again.', 'fail');
      throw new HandledFailure(`level ${planetId} failed to load`);
    }
    scene.onDepart = () => void this.go('wren', () => this.returnFromPlanet());
    // left_wren also hides the HUD key strip (UIManager.refreshStatusBar).
    gameState.setFlag('left_wren');
    this.levelSnapshot = { planetId, json: gameState.toJSON() };
    await this.engine.setScene(() => scene, { onProgress: stagedProgress(`Building ${level.title}`, 0.2) });
    UIManager.setLoadingProgress(1, '');
    UIManager.hideLoading();
    AudioSystem.playLevelStart();
    await UIManager.fadeFromBlack();
    UIManager.showChapterCard({ eyebrow: `Level ${level.number}`, title: level.title, lines: [level.line] });
    SaveSystem.save();
  }

  /** Pause menu: put the save back to how it was on arrival, and enter the level again. */
  async restartLevel(): Promise<void> {
    if (!this.levelSnapshot) return;
    const { planetId, json } = this.levelSnapshot;
    await this.go(planetId as FlowState, async () => {
      gameState.loadFrom(json);
      await this.enterPlanet(planetId);
    });
  }

  canRestartLevel(): boolean {
    return (this.state === 'kethra' || this.state === 'vessek') && !this.busy;
  }

  private async returnFromPlanet(): Promise<void> {
    await UIManager.fadeToBlack();
    this.levelSnapshot = null;
    this.shipScene = new ShipInteriorScene();
    await this.engine.setScene(() => this.shipScene!, { onProgress: shipLoadingProgress });
    await UIManager.fadeFromBlack();
    gameState.setObjective(this.shipObjective());
    SaveSystem.save();
  }

  /** The ship objective for the current story progress. */
  private shipObjective(): string {
    if (gameState.hasFlag('ending_seen')) return 'The ledger is on its way home. Explore, or chart a course.';
    if (gameState.hasFlag('vessek_alloy_given')) return 'Repair long-range comms with the Anchorage’s alloy (repair station, right of the airlock).';
    if (gameState.data.planetsUnlocked.includes('vessek')) return 'Chart a course to the ring of ships at Vessek.';
    if (gameState.hasFlag('kethra_mechanism_solved')) return 'Use the resonant crystal to repair the Deep Scanner.';
    return 'Repair the ship, or chart a course to explore further.';
  }

  // ------------------------------------------------------------------ the ending

  /** Shows the transmit panel once comms are repaired; choosing Transmit plays the ending. */
  private offerTransmit(): void {
    if (gameState.hasFlag('ending_seen') || this.state !== 'wren') return;
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.style.width = 'min(520px, 92vw)';
    panel.innerHTML = `<div class="eyebrow">Long-range comms online</div><h2>Send the ledger home?</h2>
      <p>Sixty years of names from the Anchorage, the Wren's own logs, and a warning about the white sky. It will take the signal a long time to reach anyone. It will get there.</p>
      <div class="pause-actions" style="display:flex;gap:8px;margin-top:18px"></div>`;
    const actions = panel.querySelector('.pause-actions') as HTMLElement;
    const send = document.createElement('button');
    send.className = 'btn primary';
    send.textContent = 'Transmit';
    send.onclick = () => {
      AudioSystem.playConfirm();
      PanelManager.close('transmit');
      void this.go('ending', () => this.playEnding());
    };
    const later = document.createElement('button');
    later.className = 'btn secondary';
    later.textContent = 'Not yet';
    later.onclick = () => {
      PanelManager.close('transmit');
      gameState.setObjective('Transmit the ledger from the repair station when you’re ready.');
    };
    actions.append(send, later);
    PanelManager.open(panel, undefined, undefined, 'transmit');
    send.focus();
  }

  /** Reopens the transmit choice; the repair station offers it once comms are fixed. */
  requestTransmit(): void {
    if (gameState.data.shipSystems.communications.repaired && gameState.hasFlag('vessek_alloy_given')) this.offerTransmit();
  }

  private async playEnding(): Promise<void> {
    await UIManager.fadeToBlack();
    let EndingScene;
    try {
      ({ EndingScene } = await import('../galaxy/EndingScene'));
    } catch {
      gameState.setFlag('ending_seen');
      await UIManager.fadeFromBlack();
      UIManager.toast('Transmission sent.', 'learn');
      throw new HandledFailure('the ending failed to load');
    }
    const ending = new EndingScene();
    ending.onDone = () => void this.go('wren', () => this.finishEnding());
    await this.engine.setScene(() => ending, { onProgress: stagedProgress('Opening the channel') });
    await UIManager.fadeFromBlack();
  }

  private async finishEnding(): Promise<void> {
    gameState.setFlag('ending_seen');
    SaveSystem.save();
    await UIManager.fadeToBlack();
    this.shipScene = new ShipInteriorScene();
    await this.engine.setScene(() => this.shipScene!, { onProgress: shipLoadingProgress });
    await UIManager.fadeFromBlack();
    gameState.setObjective(this.shipObjective());
  }
}
