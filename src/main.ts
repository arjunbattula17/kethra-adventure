import './style.css';
import { Engine } from './core/Engine';
import { UIManager } from './ui/UIManager';
import { PanelManager } from './ui/PanelManager';
import { GameFlow } from './core/GameFlow';
import { JournalSystem } from './journal/JournalSystem';
import { RepairUI } from './ship/RepairUI';
import { MapController } from './galaxy/MapController';
import { CharacterPanel } from './rpg/CharacterPanel';
import { gameState } from './core/GameState';
import { bus } from './core/EventBus';
import { SaveSystem } from './core/SaveSystem';
import { AudioSystem } from './audio/AudioSystem';
import { setActiveEngine } from './core/EngineRegistry';

const appEl = document.getElementById('app')!;
const engine = new Engine(appEl);
setActiveEngine(engine);

UIManager.init();
PanelManager.mount();
AudioSystem.init();
JournalSystem.init();
RepairUI.init();
MapController.init();
CharacterPanel.init();

const params = new URLSearchParams(location.search);
if (params.get('newGame')) SaveSystem.clear();
else if (SaveSystem.hasSave()) {
  SaveSystem.load();
  UIManager.toast('Continuing your saved journey.');
}
if (params.get('skipIntro')) gameState.setFlag('tutorial_battle_complete');
if (params.get('unlockKethra')) {
  gameState.setFlag('galaxy_revealed');
  gameState.setFlag('logs_available');
  gameState.setFlag('damage_assessed');
  if (!gameState.data.planetsUnlocked.includes('kethra')) gameState.data.planetsUnlocked.push('kethra');
}

const flow = new GameFlow(engine);
flow.start();

(window as any).__DEBUG__ = { engine, flow, gameState, bus, mapController: MapController };
