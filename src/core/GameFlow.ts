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
import { ShipLibrary } from '../journal/shipLibrary';
import { PanelManager } from '../ui/PanelManager';
import type { GameScene } from './Engine';
import { motion, MotionScope, ease } from '../motion';

/** The levels a player travels to, with the card that names each one on arrival. */
const LEVELS: Record<string, { number: number; title: string; line: string }> = {
  kethra: { number: 2, title: 'Kethra', line: 'Terraced ruins under a dimming canopy. Someone lives here.' },
  vessek: { number: 3, title: 'Vessek Anchorage', line: 'Twenty-one stranded ships and one very old ring.' },
};

/**
 * The scene-level states of a playthrough. One transition runs at a time, and only along the
 * edges below: a second click on Set course, a pad pressed twice or a stale callback can't start
 * a transition that is already running or doesn't belong to where the player is.
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
  /** Interior scene being prepared behind the intro cinematic; consumed at the handover. */
  private pendingShip: Promise<ShipInteriorScene> | null = null;

  /** The save as it stood when the player entered the current level: "Restart this level" returns here. */
  private levelSnapshot: { planetId: string; json: string } | null = null;

  /** Where the playthrough is, and whether a transition is under way. */
  state: FlowState = 'boot';
  private busy = false;
  /** The flow's own waits, on the game clock: they pause with the game. */
  private fx = new MotionScope('game');

  constructor(engine: Engine) {
    this.engine = engine;
    bus.on('galaxy:travel_to', (planetId: string) => void this.travelToPlanet(planetId));
    // Long-range comms is the last repair the Anchorage's alloy pays for, and the one that lets the
    // ledger go home: repairing it is what opens the ending.
    bus.on('ship:repaired', (key: string) => {
      // On the ui clock: the repair panel is open (and the game paused) when this lands, and the
      // offer takes that panel's place.
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
   * Runs one transition to `to`, if the machine is idle and the edge exists. Returns whether it
   * ran. Everything that changes the scene goes through here.
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
      // A transition that couldn't finish (a level chunk that failed to arrive) has already put
      // the player back where they were and said so; the state stays where it was.
      console.warn(`[flow] ${this.state} → ${to} did not complete`, err);
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

  async start(): Promise<void> {
    if (this.state !== 'boot') return;
    if (gameState.hasFlag('tutorial_battle_complete')) {
      // Covers players whose completed save predates the skip marker: their save already proves
      // they finished the opening, so a later "new game" should still offer the skip.
      markOpeningSeen();
      await this.go('wren', async () => {
        this.shipScene = new ShipInteriorScene();
        await this.engine.setScene(() => this.shipScene!);
        this.engine.start();
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
        await this.engine.setScene(() => this.shipScene!);
        this.engine.start();
        await this.enterReveal();
      });
      return;
    }
    let introLoaded = true;
    await this.go('intro', async () => {
      introLoaded = await this.bootIntro();
    });
    // If the intro's chunk failed to arrive, skip the mood piece and boot the old way rather than
    // stranding the player on a black screen.
    if (!introLoaded) await this.go('wren', () => this.beginTutorialOnShip());
  }

  /**
   * Fresh game: the drifting-ship intro plays before anything else. It is also the cheapest scene
   * to stand up, so the first image lands sooner than booting the full interior would, and loading
   * it pre-warms the hull the galaxy reveal reuses later.
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
    await this.engine.setScene(() => intro);
    // Build, compile AND first-draw the interior before the intro's clock starts, under the
    // loading overlay. It used to build while the intro played, to overlap the wait; but on a
    // cold shader cache its ~93 programs stalled the GPU for ~11 s, freezing the intro on its
    // opening frame (measured with tools/intro-check.mjs), and the first-draw stall still landed
    // at the handover. Same total wait, now all of it where the loading UI says so; the intro then
    // plays uninterrupted and hands over to an interior that's ready to draw.
    UIManager.showLoading();
    UIManager.setLoadingProgress(0.1, 'Waking the Wren');
    void UIManager.fadeToBlack(); // keeps the pre-warm frame from showing through the overlay
    try {
      const scene = new ShipInteriorScene();
      await this.engine.prepareScene(scene);
      UIManager.setLoadingProgress(0.85, 'Warming up the graphics card');
      this.engine.prewarmScene(scene);
      UIManager.setLoadingProgress(0.95, 'Checking what this computer can draw');
      // If the tier drops, the ship's shaders change: draw it once more under the cover.
      const before = this.engine.getQualityTier();
      const after = this.engine.benchmarkScene(scene);
      if (after !== before) {
        scene.adaptToTier(after);
        this.engine.prewarmScene(scene);
      }
      UIManager.setLoadingProgress(1, '');
      this.pendingShip = Promise.resolve(scene);
    } catch {
      // A kit fetch failed: leave the ship to beginTutorialOnShip's direct build, which surfaces
      // its own failure the same way the pre-preload boot did.
      this.pendingShip = null;
    }
    this.engine.start();
    UIManager.hideLoading();
    await UIManager.fadeFromBlack();
    return true;
  }

  /** The intro-to-interior handover: build the ship behind a fade, then start the tutorial. */
  private async beginTutorialOnShip(): Promise<void> {
    const prepared = this.pendingShip;
    this.pendingShip = null;
    await UIManager.fadeToBlack();
    let scene: ShipInteriorScene | null = null;
    if (prepared) {
      try {
        scene = await prepared;
      } catch {
        // Preparation failed (a kit fetch died mid-intro) — fall through to the direct build,
        // which surfaces its own failure the same way the pre-preload boot did.
        scene = null;
      }
    }
    this.shipScene = scene ?? new ShipInteriorScene();
    await this.engine.setScene(() => this.shipScene!, { prepared: scene !== null });
    this.engine.start();
    await UIManager.fadeFromBlack();
    this.tutorial = new TutorialSequence(this.shipScene, hasSeenOpening());
    this.tutorial.onComplete = () => void this.go('reveal', () => this.beginFirstGame());
    this.tutorial.start();
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
    // The caption fades out on its own; the reveal's scan transition takes over from there. The
    // letterbox stays up: the cinematic runs letterboxed and retracts it when it ends.
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
    await this.engine.setScene(() => reveal);
    await UIManager.fadeFromBlack();
  }

  private completeReveal(result: InterceptResult | null): Promise<boolean> {
    return this.go('wren', () => this.finishReveal(result));
  }

  /**
   * MG1 is won: back to the Wren, still in the helm seat the player sat down in to boot navigation,
   * with the plotted course on the desk screen in front of them (saved first, so the rebuilt
   * console draws it).
   */
  private async finishReveal(result: InterceptResult | null): Promise<void> {
    await UIManager.fadeToBlack();
    if (result) gameState.data.course = { points: result.course.flatMap((p) => [p.x, p.y, p.z]), days: result.days, cells: result.cells };
    this.shipScene = new ShipInteriorScene();
    await this.engine.setScene(() => this.shipScene!);
    this.poseSeated(this.shipScene);
    UIManager.setLookPromptEnabled(false);
    // MG1 showed its own objectives; back aboard, the saved one stands until the next is set.
    UIManager.setObjective(gameState.data.objective);
    await UIManager.fadeFromBlack();
    if (result) await this.lookAtChart();
    await this.completeCalibration();
  }

  /**
   * Lean over the deck chart, where the course just plotted is drawn, and hold. The chart lies
   * nearly flat at chest height, so from the seat it is a sliver: rising and leaning in is what
   * makes it readable.
   */
  private async lookAtChart(): Promise<void> {
    const scene = this.shipScene;
    if (!scene) return;
    const player = scene.player;
    const camera = scene.camera;
    const lean = { z: DESK_CHART_ANCHOR.z + 0.95, eye: 1.62 };
    const from = { z: player.rig.position.z, eye: camera.position.y, pitch: player.pitch };
    const toPitch = Math.atan2(DESK_CHART_ANCHOR.y - lean.eye, Math.abs(DESK_CHART_ANCHOR.z - lean.z));
    const DURATION = motion.reduced ? 0.01 : 1.4;
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
    await this.wait(2.2);
  }

  /** The plot is the calibration: award it, stand up, hand control back. */
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
    // MG1's awards (docs/DESIGN.md §4): the plot used insight and engineering.
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
    gameState.setObjective('Review the travel logs, repair the ship, and chart a course to Kethra.');
    UIManager.toast('Travel Logs restored.');
    await this.wait(1.3);
    UIManager.toast('Ship Repair interface online.');
    await this.wait(1.3);
    UIManager.toast('Galaxy Map calibrated — Kethra is in range.');
    SaveSystem.save();
  }

  // ------------------------------------------------------------------ travel

  private async travelToPlanet(planetId: string): Promise<void> {
    if (!LEVELS[planetId]) {
      UIManager.toast('Scanner range insufficient for that destination.');
      return;
    }
    await this.go(planetId as FlowState, () => this.enterPlanet(planetId));
  }

  private async enterPlanet(planetId: string): Promise<void> {
    const level = LEVELS[planetId];
    await UIManager.fadeToBlack();
    // Loaded on demand. Each level is entered from behind the transition, so its code (and the kit
    // loaders and shaders that come with it) has no reason to sit in the chunk that has to arrive
    // before the ship interior can render. The await lands behind the cover, where a first-visit
    // fetch is invisible.
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
      // A chunk that fails to arrive (stale deploy, dropped connection) would otherwise reject with
      // no handler, and the cover is already down — the player would be left staring at nothing
      // with no way out. Come back up and stay on the ship.
      UIManager.hideLoading();
      await UIManager.fadeFromBlack();
      UIManager.toast('Navigation data unavailable. Check your connection and try again.', 'fail');
      throw new Error(`level ${planetId} failed to load`);
    }
    scene.onDepart = () => void this.go('wren', () => this.returnFromPlanet());
    // The first departure retires the HUD's key strip (UIManager.refreshStatusBar).
    gameState.setFlag('left_wren');
    this.levelSnapshot = { planetId, json: gameState.toJSON() };
    UIManager.setLoadingProgress(0.45, `Building ${level.title}`);
    await this.engine.setScene(() => scene);
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
    await this.engine.setScene(() => this.shipScene!);
    await UIManager.fadeFromBlack();
    gameState.setObjective(this.shipObjective());
    SaveSystem.save();
  }

  /** What to do aboard the Wren, from how far the story has got. */
  private shipObjective(): string {
    if (gameState.hasFlag('ending_seen')) return 'The ledger is on its way home. Explore, or chart a course.';
    if (gameState.hasFlag('vessek_alloy_given')) return 'Repair long-range comms with the Anchorage’s alloy (repair station, right of the airlock).';
    if (gameState.data.planetsUnlocked.includes('vessek')) return 'Chart a course to the ring of ships at Vessek.';
    if (gameState.hasFlag('kethra_mechanism_solved')) return 'Use the resonant crystal to repair the Deep Scanner.';
    return 'Repair the ship, or chart a course to explore further.';
  }

  // ------------------------------------------------------------------ the ending

  /**
   * The moment comms come back: the player chooses to send the ledger, and the ending plays. A
   * panel rather than an automatic cutscene, so the last act of the story is the player's.
   */
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
      throw new Error('the ending failed to load');
    }
    const ending = new EndingScene();
    ending.onDone = () => void this.go('wren', () => this.finishEnding());
    await this.engine.setScene(() => ending);
    await UIManager.fadeFromBlack();
  }

  private async finishEnding(): Promise<void> {
    gameState.setFlag('ending_seen');
    SaveSystem.save();
    await UIManager.fadeToBlack();
    this.shipScene = new ShipInteriorScene();
    await this.engine.setScene(() => this.shipScene!);
    await UIManager.fadeFromBlack();
    gameState.setObjective(this.shipObjective());
  }
}
