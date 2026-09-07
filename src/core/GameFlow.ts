import type { Engine } from './Engine';
import { ShipInteriorScene } from '../ship/ShipInteriorScene';
import { BattlePuzzle } from '../ship/BattlePuzzle';
import { UIManager } from '../ui/UIManager';
import { gameState } from './GameState';
import { InputManager } from './InputManager';
import { bus } from './EventBus';
import { SaveSystem } from './SaveSystem';
import { TutorialSequence } from '../tutorial/TutorialSequence';
import { showBattleBriefing } from '../tutorial/BattleBriefing';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class GameFlow {
  private engine: Engine;
  private shipScene: ShipInteriorScene | null = null;
  /** Live only during the opening. Public so the harnesses in tools/ can drive it through __DEBUG__. */
  tutorial: TutorialSequence | null = null;
  private firstGameStarted = false;

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
    this.shipScene = new ShipInteriorScene();
    await this.engine.setScene(() => this.shipScene!);
    this.engine.start();

    if (gameState.hasFlag('tutorial_battle_complete')) {
      this.finishReturnToShip();
      return;
    }
    // ?skipTutorial drops straight into the puzzle, for the harnesses in tools/ that are testing
    // what comes *after* the opening and would otherwise have to drive five gated steps and a
    // briefing to reach it. tools/test-tutorial-flow.mjs covers the real route. There is no
    // player-facing path here: the only way in without this parameter is the console.
    if (new URLSearchParams(location.search).has('skipTutorial')) {
      this.firstGameStarted = true;
      this.startBattle();
      return;
    }
    this.tutorial = new TutorialSequence(this.shipScene);
    this.tutorial.onComplete = () => this.beginFirstGame();
    this.tutorial.start();
  }

  /**
   * The handover between the tutorial and the first game. Reached only from the console the
   * tutorial walked the player to: booting navigation is what puts the contact on the scan, which
   * is what the threat-response puzzle is a response to.
   */
  private async beginFirstGame(): Promise<void> {
    if (this.firstGameStarted) return;
    this.firstGameStarted = true;
    this.tutorial = null;
    if (!this.shipScene) return;

    this.shipScene.player.enabled = false;
    InputManager.exitPointerLock();
    UIManager.setLookPromptEnabled(false);
    UIManager.setCrosshairVisible(false);
    UIManager.setPrompt(null);
    gameState.setObjective('Answer the contact.');

    UIManager.showLetterbox(true);
    UIManager.showCaption('Navigation online. Reserve power routed to long-range scan.', 2600);
    await wait(2500);
    UIManager.showCaption('Contact — unidentified vessel, closing fast.', 2400);
    await wait(2100);
    UIManager.clearCaption();
    UIManager.showLetterbox(false);
    // The caption fades over 0.6s and the bars retract over 0.9s. Letting both finish keeps the
    // briefing from arriving on top of the line it is a response to.
    await wait(950);
    showBattleBriefing(() => this.startBattle());
  }

  private startBattle(): void {
    if (!this.shipScene) return;
    this.shipScene.player.enabled = false;
    InputManager.exitPointerLock();
    const battle = new BattlePuzzle();
    battle.onWin = () => {
      if (this.shipScene) this.shipScene.player.enabled = true;
      UIManager.setCrosshairVisible(true);
      this.transitionToGalaxyReveal();
    };
    battle.start();
  }

  private async transitionToGalaxyReveal(): Promise<void> {
    await UIManager.fadeToBlack();
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
