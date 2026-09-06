import type { Engine } from './Engine';
import { ShipInteriorScene } from '../ship/ShipInteriorScene';
import { BattlePuzzle } from '../ship/BattlePuzzle';
import { UIManager } from '../ui/UIManager';
import { gameState } from './GameState';
import { InputManager } from './InputManager';
import { bus } from './EventBus';
import { SaveSystem } from './SaveSystem';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class GameFlow {
  private engine: Engine;
  private shipScene: ShipInteriorScene | null = null;

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
    this.runOpening();
  }

  private async runOpening(): Promise<void> {
    await wait(1400);
    UIManager.showLetterbox(true);
    UIManager.showCaption('Life support online. Navigation and hyperdrive: dark.', 2400);
    await wait(2400);
    UIManager.showCaption('Unidentified contact detected on long-range scan.', 2200);
    await wait(1900);
    UIManager.showLetterbox(false);
    UIManager.clearCaption();
    this.startBattle();
  }

  private startBattle(): void {
    if (!this.shipScene) return;
    this.shipScene.player.enabled = false;
    InputManager.exitPointerLock();
    const battle = new BattlePuzzle();
    battle.onWin = () => {
      if (this.shipScene) this.shipScene.player.enabled = true;
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
