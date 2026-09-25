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
import { CONSOLE_SEAT, MONITOR_ANCHOR } from '../ship/interior/console';
import { AudioSystem } from '../audio/AudioSystem';
import { CoursePlot } from '../ship/CoursePlot';
import { ShipLibrary } from '../journal/shipLibrary';
import { PanelManager } from '../ui/PanelManager';
import type { GameScene } from './Engine';

/** The levels a player travels to, with the card that names each one on arrival. */
const LEVELS: Record<string, { number: number; title: string; line: string }> = {
  kethra: { number: 2, title: 'Kethra', line: 'Terraced ruins under a dimming canopy. Someone lives here.' },
  vessek: { number: 3, title: 'Vessek Anchorage', line: 'Twenty-one stranded ships and one very old ring.' },
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  private firstGameStarted = false;
  /** Interior scene being prepared behind the intro cinematic; consumed at the handover. */
  private pendingShip: Promise<ShipInteriorScene> | null = null;

  /** The save as it stood when the player entered the current level: "Restart this level" returns here. */
  private levelSnapshot: { planetId: string; json: string } | null = null;
  private inLevel: string | null = null;

  constructor(engine: Engine) {
    this.engine = engine;
    bus.on('galaxy:travel_to', (planetId: string) => this.travelToPlanet(planetId));
    // Long-range comms is the last repair the Anchorage's alloy pays for, and the one that lets the
    // ledger go home: repairing it is what opens the ending.
    bus.on('ship:repaired', (key: string) => {
      if (key === 'communications' && gameState.hasFlag('vessek_alloy_given')) window.setTimeout(() => this.offerTransmit(), 900);
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

  private async travelToPlanet(planetId: string): Promise<void> {
    const level = LEVELS[planetId];
    if (!level) {
      UIManager.toast('Scanner range insufficient for that destination.');
      return;
    }
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
      return;
    }
    scene.onDepart = () => this.returnFromPlanet();
    this.levelSnapshot = { planetId, json: gameState.toJSON() };
    this.inLevel = planetId;
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
    gameState.loadFrom(json);
    await this.travelToPlanet(planetId);
  }

  canRestartLevel(): boolean {
    return this.inLevel !== null;
  }

  private async returnFromPlanet(): Promise<void> {
    await UIManager.fadeToBlack();
    this.inLevel = null;
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

  /**
   * The moment comms come back: the player chooses to send the ledger, and the ending plays. A
   * panel rather than an automatic cutscene, so the last act of the story is the player's.
   */
  private offerTransmit(): void {
    if (gameState.hasFlag('ending_seen')) return;
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
      PanelManager.close();
      void this.playEnding();
    };
    const later = document.createElement('button');
    later.className = 'btn secondary';
    later.textContent = 'Not yet';
    later.onclick = () => {
      PanelManager.close();
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
      return;
    }
    const ending = new EndingScene();
    ending.onDone = () => void this.finishEnding();
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

  async start(): Promise<void> {
    if (gameState.hasFlag('tutorial_battle_complete')) {
      // Covers players whose completed save predates the skip marker: their save already proves
      // they finished the opening, so a later "new game" should still offer the skip.
      markOpeningSeen();
      this.shipScene = new ShipInteriorScene();
      await this.engine.setScene(() => this.shipScene!);
      this.engine.start();
      this.finishReturnToShip();
      return;
    }
    // ?skipTutorial drops straight into the galaxy reveal, for the harnesses in tools/ that are
    // testing what comes *after* the opening and would otherwise have to drive five gated steps
    // to reach it. tools/test-tutorial-flow.mjs covers the real route. There is no player-facing
    // path here: the only way in without this parameter is the console.
    if (new URLSearchParams(location.search).has('skipTutorial')) {
      this.firstGameStarted = true;
      this.shipScene = new ShipInteriorScene();
      await this.engine.setScene(() => this.shipScene!);
      this.engine.start();
      this.transitionToGalaxyReveal();
      return;
    }
    // Fresh game: the drifting-ship intro plays before anything else. It is also the cheapest
    // scene to stand up (cached hull GLB, two starfields, three lights), so the first image lands
    // sooner than booting the full interior would — and loading it pre-warms the hull template
    // the galaxy reveal reuses later.
    let IntroScene;
    try {
      ({ IntroScene } = await import('../galaxy/IntroScene'));
    } catch {
      // Same guard as every lazy cinematic chunk: if it fails to arrive, skip the mood piece and
      // boot the old way rather than stranding the player on a black screen.
      await this.beginTutorialOnShip();
      return;
    }
    const intro = new IntroScene();
    intro.onDone = () => void this.beginTutorialOnShip();
    await this.engine.setScene(() => intro);
    // Build, compile AND first-draw the interior before the intro's clock starts, under the
    // loading overlay. It used to build while the intro played, to overlap the wait; but on a
    // cold shader cache its ~93 programs stalled the GPU for ~11 s, freezing the intro on its
    // opening frame (measured with tools/intro-check.mjs), and the first-draw stall still landed
    // at the handover. Same total wait, now all of it where the loading UI says so; the intro then
    // plays uninterrupted and hands over to an interior that's ready to draw.
    UIManager.showLoading();
    void UIManager.fadeToBlack(); // keeps the pre-warm frame from showing through the overlay
    try {
      const scene = new ShipInteriorScene();
      await this.engine.prepareScene(scene);
      this.engine.prewarmScene(scene);
      this.pendingShip = Promise.resolve(scene);
    } catch {
      // A kit fetch failed: leave the ship to beginTutorialOnShip's direct build, which surfaces
      // its own failure the same way the pre-preload boot did.
      this.pendingShip = null;
    }
    this.engine.start();
    UIManager.hideLoading();
    await UIManager.fadeFromBlack();
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
    this.tutorial.onComplete = () => this.beginFirstGame();
    this.tutorial.start();
  }

  /**
   * The handover between the tutorial and the first game. Reached only from the console the
   * tutorial walked the player to: booting navigation is what brings the star chart up, which is
   * what the galaxy reveal shows.
   */
  private async beginFirstGame(): Promise<void> {
    if (this.firstGameStarted) return;
    this.firstGameStarted = true;
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
    await wait(250);
    UIManager.showCaption('Navigation online. Reserve power routed to long-range scan.', 2600);
    await wait(2500);
    UIManager.clearCaption();
    // The caption fades over 0.6s; the reveal's own fade-to-black takes over from there. The
    // letterbox stays up — the cinematic runs letterboxed and retracts it when it ends.
    await wait(700);
    await this.transitionToGalaxyReveal();
  }

  /**
   * First-person sit-down: eases the player from wherever they pressed E into the pilot chair,
   * facing the monitor bank, before the navigation-boot captions play. Runs on the scene's own
   * tick (so it pauses with the engine) while the player is disabled — PlayerController.update()
   * is a hard no-op then, so nothing fights the glide and the seated pose holds afterwards with
   * no snap-back. Position follows a quadratic bezier through a point behind the chair at
   * standing height, which turns "lerp through the furniture" into "step in, turn, settle";
   * the eye-height drop is weighted into the second half so it reads as sitting down rather
   * than a descending elevator.
   */
  private sitAtConsole(): Promise<void> {
    const scene = this.shipScene;
    if (!scene) return Promise.resolve();
    const player = scene.player;
    const camera = scene.camera;

    const start = {
      x: player.rig.position.x,
      z: player.rig.position.z,
      eye: camera.position.y,
      yaw: player.yaw,
      pitch: player.pitch,
    };
    // Approach control point: behind the chair on the player's side, still at standing height.
    const mid = { x: CONSOLE_SEAT.x, z: CONSOLE_SEAT.z + 0.55 };
    const seatEye = CONSOLE_SEAT.eyeY;
    // Seated gaze: the centre of the screen grid, from the seated eye point.
    const dz = MONITOR_ANCHOR.z - CONSOLE_SEAT.z;
    const targetPitch = Math.atan2(MONITOR_ANCHOR.y - seatEye, Math.abs(dz));
    const targetYaw = 0;
    // Shortest arc, so a player who approached facing +x doesn't spin the long way round.
    const yawDelta = THREE.MathUtils.euclideanModulo(targetYaw - start.yaw + Math.PI, Math.PI * 2) - Math.PI;

    const DURATION = 1.8;
    const ease = (v: number) => (v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2);

    return new Promise((resolve) => {
      let elapsed = 0;
      scene.onTick = (dt) => {
        elapsed += dt;
        const t = ease(Math.min(1, elapsed / DURATION));
        const u = 1 - t;
        player.rig.position.x = u * u * start.x + 2 * u * t * mid.x + t * t * CONSOLE_SEAT.x;
        player.rig.position.z = u * u * start.z + 2 * u * t * mid.z + t * t * CONSOLE_SEAT.z;
        // The drop into the seat happens across the back half of the move.
        const sitT = ease(THREE.MathUtils.clamp((elapsed / DURATION - 0.45) / 0.55, 0, 1));
        camera.position.y = THREE.MathUtils.lerp(start.eye, seatEye, sitT);
        player.yaw = start.yaw + yawDelta * t;
        player.pitch = THREE.MathUtils.lerp(start.pitch, targetPitch, t);
        player.rig.rotation.set(0, player.yaw, 0);
        camera.rotation.set(player.pitch, 0, 0);
        if (elapsed >= DURATION) {
          scene.onTick = null;
          // A low, soft contact note as the seat takes the weight.
          AudioSystem.playTone(70, 0.22, 'sine', 0.05);
          resolve();
        }
      };
    });
  }

  private async transitionToGalaxyReveal(): Promise<void> {
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
      this.finishReveal();
      return;
    }
    const reveal = new GalaxyRevealScene();
    reveal.onContinue = () => this.finishReveal();
    await this.engine.setScene(() => reveal);
    await UIManager.fadeFromBlack();
  }

  private async finishReveal(): Promise<void> {
    await UIManager.fadeToBlack();
    this.shipScene = new ShipInteriorScene();
    await this.engine.setScene(() => this.shipScene!);
    // Continuity: the player sat down at this console to boot navigation and watched the reveal
    // from that seat — they come back still in it, facing the screens the scan panel opens over.
    const player = this.shipScene.player;
    const camera = this.shipScene.camera;
    player.enabled = false;
    player.rig.position.set(CONSOLE_SEAT.x, 0, CONSOLE_SEAT.z);
    player.yaw = 0;
    player.pitch = Math.atan2(MONITOR_ANCHOR.y - CONSOLE_SEAT.eyeY, Math.abs(MONITOR_ANCHOR.z - CONSOLE_SEAT.z));
    player.rig.rotation.set(0, 0, 0);
    camera.position.y = CONSOLE_SEAT.eyeY;
    camera.rotation.set(player.pitch, 0, 0);
    await UIManager.fadeFromBlack();

    // The first game: the reveal showed the system, and this is the navigator's arithmetic to
    // reach the one world in range. The chart-calibration flags are the SOLVE.
    const puzzle = new CoursePlot();
    puzzle.onSolved = () => void this.completeCalibration();
    puzzle.start();
  }

  /** Runs when the scan correlation is solved: award the calibration, stand up, hand control back. */
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

    await this.standFromConsole();
    UIManager.setCrosshairVisible(true);
    this.finishReturnToShip();
  }

  /** The sit-down's mirror: rise from the chair and step back to the console approach point. */
  private standFromConsole(): Promise<void> {
    const scene = this.shipScene;
    if (!scene) return Promise.resolve();
    const player = scene.player;
    const camera = scene.camera;
    const start = { z: player.rig.position.z, eye: camera.position.y, pitch: player.pitch };
    const DURATION = 1.1;
    const ease = (v: number) => (v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2);
    return new Promise((resolve) => {
      let elapsed = 0;
      scene.onTick = (dt) => {
        elapsed += dt;
        const t = ease(Math.min(1, elapsed / DURATION));
        // Rise first, step back second — the reverse weighting of the sit-down.
        const riseT = ease(Math.min(1, (elapsed / DURATION) / 0.65));
        camera.position.y = THREE.MathUtils.lerp(start.eye, 1.7, riseT);
        player.rig.position.z = THREE.MathUtils.lerp(start.z, -3.0, t);
        player.pitch = THREE.MathUtils.lerp(start.pitch, 0, t);
        camera.rotation.set(player.pitch, 0, 0);
        if (elapsed >= DURATION) {
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
    await wait(1300);
    UIManager.toast('Ship Repair interface online.');
    await wait(1300);
    UIManager.toast('Galaxy Map calibrated — Kethra is in range.');
    SaveSystem.save();
  }
}
