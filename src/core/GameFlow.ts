import type { Engine } from './Engine';
import { ShipInteriorScene } from '../ship/ShipInteriorScene';
import { GalaxyRevealScene } from '../galaxy/GalaxyRevealScene';
import { BattlePuzzle } from '../ship/BattlePuzzle';
import { UIManager } from '../ui/UIManager';
import { gameState } from './GameState';
import { InputManager } from './InputManager';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class GameFlow {
  private engine: Engine;
  private shipScene: ShipInteriorScene | null = null;

  constructor(engine: Engine) {
    this.engine = engine;
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
    await wait(2200);
    UIManager.showLetterbox(true);
    UIManager.showCaption('Life support: online.', 2000);
    await wait(2000);
    UIManager.showCaption('Navigation: offline. Hyperdrive: offline.', 2200);
    await wait(2200);
    UIManager.showCaption('Unidentified contact detected on long-range scan.', 2400);
    await wait(2000);
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

  private finishReturnToShip(): void {
    gameState.setObjective('Review the travel logs, repair the ship, and chart a course to Kethra.');
    UIManager.toast('New systems online: Travel Logs, Ship Repair, Galaxy Map.');
  }
}
