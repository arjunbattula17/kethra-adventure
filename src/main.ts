import './style.css';
import { Engine } from './core/Engine';
import { UIManager } from './ui/UIManager';
import { PanelManager } from './ui/PanelManager';
import { GameFlow } from './core/GameFlow';
import { JournalSystem } from './journal/JournalSystem';
import { RepairUI } from './ship/RepairUI';
import { GalaxyMapUI } from './galaxy/GalaxyMapUI';
import { CharacterPanel } from './rpg/CharacterPanel';
import { gameState } from './core/GameState';
import { bus } from './core/EventBus';

const appEl = document.getElementById('app')!;
const engine = new Engine(appEl);

UIManager.init();
PanelManager.mount();
JournalSystem.init();
RepairUI.init();
GalaxyMapUI.init();
CharacterPanel.init();

const params = new URLSearchParams(location.search);
if (params.get('skipIntro')) gameState.setFlag('tutorial_battle_complete');
if (params.get('unlockKethra')) {
  gameState.setFlag('galaxy_revealed');
  gameState.setFlag('logs_available');
  gameState.setFlag('damage_assessed');
  if (!gameState.data.planetsUnlocked.includes('kethra')) gameState.data.planetsUnlocked.push('kethra');
}

const flow = new GameFlow(engine);
flow.start();

(window as any).__DEBUG__ = { engine, flow, gameState, bus };
