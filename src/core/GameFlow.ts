import type { Engine } from './Engine';
import { ShipInteriorScene } from '../ship/ShipInteriorScene';
import { UIManager } from '../ui/UIManager';
import { gameState } from './GameState';
import { InputManager } from './InputManager';
import { bus } from './EventBus';
import { SaveSystem } from './SaveSystem';
import { TutorialSequence } from '../tutorial/TutorialSequence';

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

  constructor(engine: Engine) {
    this.engine = engine;
    bus.on('galaxy:travel_to', (planetId: string) => this.travelToPlanet(planetId));
    for (const event of ['ship:repaired', 'level:up', 'log:unlocked', 'clue:added']) {
      bus.on(event, () => SaveSystem.save());
    }
  }

  private async travelToPlanet(planetId: string): Promise<void> {
    if (planetId !== 'kethra') {
      UIManager.toast('Scanner range insufficient for that destination.');
      return;
    }
    await UIManager.fadeToBlack();
    // Loaded on demand. Kethra and the galaxy reveal are each entered at most once per session and
    // only from behind a fade-to-black, so their code (and the nature kit's loaders and the reveal's
    // shaders with it) has no reason to sit in the chunk that has to arrive before the ship interior
    // can render. The await lands inside the fade, where a first-visit fetch is invisible.
    let KethraScene;
    try {
      ({ KethraScene } = await import('../planets/kethra/KethraScene'));
    } catch {
      // A chunk that fails to arrive (stale deploy, dropped connection) would otherwise reject with
      // no handler, and the fade above has already blacked the screen — the player would be left
      // staring at nothing with no way out. Come back up and stay on the ship.
      await UIManager.fadeFromBlack();
      UIManager.toast('Navigation data unavailable. Check your connection and try again.');
      return;
    }
    const kethra = new KethraScene();
    kethra.onDepart = () => this.returnFromPlanet();
    await this.engine.setScene(() => kethra);
    await UIManager.fadeFromBlack();
  }

  private async returnFromPlanet(): Promise<void> {
    await UIManager.fadeToBlack();
    this.shipScene = new ShipInteriorScene();
    await this.engine.setScene(() => this.shipScene!);
    await UIManager.fadeFromBlack();
    gameState.setObjective('Repair the ship, or chart a course to explore further.');
    SaveSystem.save();
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
    this.engine.start();
    // Build and compile the interior WHILE the cinematic plays. The intro spends ~30 seconds
    // rendering an almost-idle scene; the interior's whole stand-up (kit fetch + geometry build
    // + ~93 shader programs) fits inside that window, so a player who watches the intro hands
    // over with only the warm-up frame left to pay. A rejection is caught at the await site in
    // beginTutorialOnShip, which falls back to building the interior the direct way.
    this.pendingShip = (async () => {
      const scene = new ShipInteriorScene();
      await this.engine.prepareScene(scene);
      return scene;
    })();
    this.pendingShip.catch(() => {});
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

    UIManager.showLetterbox(true);
    UIManager.showCaption('Navigation online. Reserve power routed to long-range scan.', 2600);
    await wait(2500);
    UIManager.clearCaption();
    // The caption fades over 0.6s; the reveal's own fade-to-black takes over from there. The
    // letterbox stays up — the cinematic runs letterboxed and retracts it when it ends.
    await wait(700);
    await this.transitionToGalaxyReveal();
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
    gameState.setFlag('galaxy_revealed');
    if (!gameState.data.planetsUnlocked.includes('kethra')) {
      gameState.data.planetsUnlocked.push('kethra');
    }
    gameState.setFlag('logs_available');
    gameState.setFlag('damage_assessed');

    await UIManager.fadeToBlack();
    this.shipScene = new ShipInteriorScene();
    await this.engine.setScene(() => this.shipScene!);
    // The handover into the reveal hid the crosshair; the rebuilt interior needs it back. Done
    // behind the fade, in the same continuation as the scene swap, so there is no window where
    // the interior is current but the crosshair is still hidden.
    UIManager.setCrosshairVisible(true);
    await UIManager.fadeFromBlack();
    this.finishReturnToShip();
  }

  private async finishReturnToShip(): Promise<void> {
    gameState.setObjective('Review the travel logs, repair the ship, and chart a course to Kethra.');
    UIManager.toast('Travel Logs restored.');
    await wait(1300);
    UIManager.toast('Ship Repair interface online.');
    await wait(1300);
    UIManager.toast('Galaxy Map calibrated — Kethra is in range.');
    SaveSystem.save();
  }
}
