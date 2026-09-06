import './style.css';
import { loadFonts } from './core/loadFonts';
import { Engine } from './core/Engine';
import { UIManager } from './ui/UIManager';
import { PanelManager } from './ui/PanelManager';
import { GameFlow } from './core/GameFlow';
import { JournalSystem } from './journal/JournalSystem';
import { RepairUI } from './ship/RepairUI';
import { MapController } from './galaxy/MapController';
import { CharacterPanel } from './rpg/CharacterPanel';
import { SettingsPanel } from './ui/SettingsPanel';
import { gameState } from './core/GameState';
import { bus } from './core/EventBus';
import { SaveSystem } from './core/SaveSystem';
import { AudioSystem } from './audio/AudioSystem';
import { setActiveEngine } from './core/EngineRegistry';


loadFonts();

const appEl = document.getElementById('app')!;
const engine = new Engine(appEl);
setActiveEngine(engine);

UIManager.init();
PanelManager.mount();
// Every panel (map, journal, character sheet, dialogue, repair) opens through PanelManager, and
// its overlay sits over the 3D view at only partial opacity with a CSS blur -- it was never fully
// hiding the scene, just fading it. But nothing was pausing the *engine* underneath: the full
// render pipeline (shadows, GTAO, bloom) kept running every frame at real cost while completely
// invisible-to-irrelevant behind a menu, since mouse-look/movement are already disabled the moment
// a panel opens (PanelManager.open() calls exitPointerLock()). Pausing here freezes the last frame
// in place -- visually identical under a static blur, since nothing was meant to keep animating
// behind a panel the player's actually looking at -- and stops paying for it.
const uiOnOpenChange = PanelManager.onOpenChange;
PanelManager.onOpenChange = (open) => {
  uiOnOpenChange(open);
  engine.setPaused(open);
};
AudioSystem.init();
JournalSystem.init();
RepairUI.init();
MapController.init();
CharacterPanel.init();
SettingsPanel.init();

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
