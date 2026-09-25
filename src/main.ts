import './style.css';
import { loadFonts } from './core/loadFonts';
import { Engine } from './core/Engine';
import { UIManager } from './ui/UIManager';
import { PanelManager } from './ui/PanelManager';
import { GameFlow } from './core/GameFlow';
import { JournalSystem } from './journal/JournalSystem';
import { ShipLibrary } from './journal/shipLibrary';
import { RepairUI } from './ship/RepairUI';
import { MapController } from './galaxy/MapController';
import { CharacterPanel } from './rpg/CharacterPanel';
import { SettingsPanel } from './ui/SettingsPanel';
import { gameState } from './core/GameState';
import { bus } from './core/EventBus';
import { SaveSystem } from './core/SaveSystem';
import { AudioSystem } from './audio/AudioSystem';
import { setActiveEngine } from './core/EngineRegistry';
import { TitleScreen } from './ui/TitleScreen';
import { PauseMenu } from './ui/PauseMenu';
import { t } from './content/strings';


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
ShipLibrary.init();
RepairUI.init();
MapController.init();
CharacterPanel.init();
SettingsPanel.init();

const params = new URLSearchParams(location.search);
// The test and capture tools boot with these flags and skip the title screen; so does New Game
// from the title itself, which reboots with ?newGame=1 when a save is loaded.
const bootFlags = ['newGame', 'skipIntro', 'skipTutorial', 'unlockKethra', 'unlockVessek'].some((k) => params.has(k));
// load() returns false on unreadable JSON. It used to be called for its side effect and the success
// toast shown regardless, so a corrupt save told the player their journey had been restored and
// then dropped them into a fresh game. The toast now waits for the player to press Continue.
let savedJourney: 'none' | 'loaded' | 'unreadable' = 'none';
if (params.get('newGame')) {
  SaveSystem.clear();
  // Drop the flag from the address bar, so a later reload continues instead of wiping progress.
  params.delete('newGame');
  history.replaceState(null, '', location.pathname + (params.size ? `?${params}` : '') + location.hash);
} else if (SaveSystem.hasSave()) {
  savedJourney = SaveSystem.load() ? 'loaded' : 'unreadable';
}
if (params.get('skipIntro')) gameState.setFlag('tutorial_battle_complete');
// Pins the quality tier for this session, bypassing both the hardware guess and the runtime
// downgrade monitor. For the capture/trace harnesses in tools/ (the GPU-aware guess correctly
// classifies their software renderer as 'low', which would strip bloom from every screenshot)
// and for anyone who wants to force a tier from the URL.
const tierParam = params.get('tier');
if (tierParam === 'low' || tierParam === 'medium' || tierParam === 'high') {
  engine.setManualQualityTier(tierParam);
}
if (params.get('unlockKethra')) {
  gameState.setFlag('galaxy_revealed');
  gameState.setFlag('logs_available');
  gameState.setFlag('damage_assessed');
  if (!gameState.data.planetsUnlocked.includes('kethra')) gameState.data.planetsUnlocked.push('kethra');
}

// ?unlockVessek: a save as it would stand after level 2 (the Heart woken, the Deep Scanner fixed),
// for the harnesses in tools/ that test level 3 without replaying levels 1 and 2.
if (params.get('unlockVessek')) {
  for (const f of ['galaxy_revealed', 'logs_available', 'damage_assessed', 'kethra_mechanism_solved', 'kethra_warden_met']) gameState.setFlag(f);
  for (const p of ['kethra', 'vessek']) if (!gameState.data.planetsUnlocked.includes(p)) gameState.data.planetsUnlocked.push(p);
  gameState.data.shipSystems.scanner.repaired = true;
  gameState.data.shipSystems.scanner.damaged = false;
}

const flow = new GameFlow(engine);
PauseMenu.init({
  canPause: () => !document.body.classList.contains('title-open') && !document.body.classList.contains('ending-open') && !UIManager.isCinematic() && !!engine.getCurrentScene(),
  canRestart: () => flow.canRestartLevel(),
  restartLevel: () => void flow.restartLevel(),
  quitToTitle: () => {
    SaveSystem.save();
    location.assign(location.pathname);
  },
});
if (bootFlags) {
  if (savedJourney === 'loaded') UIManager.toast(t('toast.continue'));
  flow.start();
} else {
  document.body.classList.add('title-open');
  TitleScreen.show({
    hasSave: savedJourney === 'loaded',
    onContinue: () => {
      document.body.classList.remove('title-open');
      UIManager.toast(t('toast.continue'));
      flow.start();
    },
    onNewGame: () => {
      document.body.classList.remove('title-open');
      // Nothing loaded: start fresh right here. A loaded save is already in memory, so reboot clean.
      if (savedJourney === 'none') flow.start();
      else location.search = '?newGame=1';
    },
  });
}
if (savedJourney === 'unreadable') UIManager.toast(t('toast.saveUnreadable'));

(window as any).__DEBUG__ = { engine, flow, gameState, bus, mapController: MapController, levels: ['kethra', 'vessek'] };
