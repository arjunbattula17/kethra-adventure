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
import { mulberry32 } from './core/rng';
import { motion } from './motion';
import { activeMiniGame } from './debug/hooks';
import { InputManager } from './core/InputManager';
import { DISCOVERIES } from './content/discoveries';
import { Survey } from './journal/Survey';
import { Chapters, CHAPTERS } from './core/chapters';
import { mark, timed } from './core/perfMarks';

/**
 * New game's black hole ends on black; with a save loaded the page then reloads clean (onNewGame). This
 * mark carries that dark across the reload: index.html paints the empty page black, boot keeps the screen
 * covered. Session storage, so it can't outlive the tab.
 */
const VOID_MARK = 'kethra_void';
function markVoid(): void {
  try {
    sessionStorage.setItem(VOID_MARK, '1');
  } catch {
    // Without storage the reload shows the usual loading screen.
  }
}
function takeVoidMark(): boolean {
  try {
    const had = sessionStorage.getItem(VOID_MARK) === '1';
    sessionStorage.removeItem(VOID_MARK);
    return had;
  } catch {
    return false;
  }
}

/**
 * Starts the game: the title screen first, then the 3D engine behind it. Called by main.ts once it has
 * checked that WebGL 2 works (which it does while this module downloads).
 */
export function startGame(): void {
  mark('boot:start');
  const params = new URLSearchParams(location.search);
  // ?seed=N makes every random stream repeatable (the debug harness and the capture tools use it).
  const seedParam = params.get('seed');
  if (seedParam !== null) Math.random = mulberry32(Number(seedParam) || 1);
  loadFonts();
  const appEl = document.getElementById('app')!;

  UIManager.init();
  // Back from New game's black hole with a save to clear (onNewGame below): the dark it left carries on
  // through the reload, and the game fades up out of it.
  if (params.has('newGame') && takeVoidMark()) UIManager.enterVoid();
  PanelManager.mount();
  AudioSystem.init();
  JournalSystem.init();
  ShipLibrary.init();
  RepairUI.init();
  MapController.init();
  CharacterPanel.init();
  SettingsPanel.init();

  // The test and capture tools boot with these flags and skip the title screen; so does New Game
  // from the title itself, which reboots with ?newGame=1 when a save is loaded.
  const bootFlags = ['newGame', 'skipIntro', 'skipTutorial', 'unlockKethra', 'unlockVessek', 'jump', 'chapter'].some((k) => params.has(k));
  // load() returns false on unreadable JSON. It used to be called for its side effect and the success
  // toast shown regardless, so a corrupt save told the player their journey had been restored and
  // then dropped them into a fresh game. The toast now waits for the player to press Continue.
  let savedJourney: 'none' | 'loaded' | 'unreadable' = 'none';
  // ?chapter=<id> starts the journey over at that chapter (the title's and the ending's Chapters).
  const chapterParam = params.get('chapter');
  const chapter = CHAPTERS.find((c) => c.id === chapterParam && Chapters.offered(c.id))?.id ?? null;
  let chapterLevel: 'kethra' | 'vessek' | null = null;
  if (params.get('newGame') || chapter) {
    SaveSystem.clear();
    if (chapter) chapterLevel = Chapters.begin(chapter);
    // Drop the flag from the address bar, so a later reload continues instead of wiping progress.
    params.delete('newGame');
    params.delete('chapter');
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

  /**
   * The 3D engine: the WebGL context, the shared environment lighting, post-processing. On a first visit
   * to an Intel UHD laptop that was over a second of work, and it used to run before anything was on
   * screen, so the title appeared a second or more late (docs/PERF_LOG.md, 2026-09-28). The title is
   * plain DOM and needs none of it: it goes up first. The engine is made when the title has been up a
   * moment and the browser is idle, or at the first click that needs it, whichever comes first.
   * Everything that needs the engine (the flow, the pause menu, a saved graphics choice) is set up with it.
   */
  let engine!: Engine;
  let flow!: GameFlow;
  let engineStarted = false;
  function ensureEngine(): void {
    if (engineStarted) return;
    engineStarted = true;
    engine = timed('boot:engine', () => new Engine(appEl));
    setActiveEngine(engine);
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
    SettingsPanel.engineReady();
    if (tierParam === 'low' || tierParam === 'medium' || tierParam === 'high') {
      engine.setManualQualityTier(tierParam);
    }
    flow = new GameFlow(engine);
    InputManager.mouseLookWanted = () => engine.getCurrentScene()?.mouseLook !== false;
    PauseMenu.init({
      canPause: () => !document.body.classList.contains('title-open') && !document.body.classList.contains('ending-open') && !UIManager.isCinematic() && !!engine.getCurrentScene(),
      // Aboard the Wren the finds are offered once the course is plotted, so the line waits for that too.
      survey: () => {
        if (flow.state === 'wren') return gameState.hasFlag('galaxy_revealed') ? `${Survey.line('wren')} aboard the Wren` : null;
        return flow.state === 'kethra' || flow.state === 'vessek' ? `${Survey.line(flow.state)} here` : null;
      },
      canRestart: () => flow.canRestartLevel(),
      restartLevel: () => void flow.restartLevel(),
      quitToTitle: (evenIfUnsaved) => {
        if (!SaveSystem.save() && !evenIfUnsaved) return false;
        location.assign(location.pathname);
        return true;
      },
    });
    // A read-only probe for the test tools (tools/*.mjs). The interactive harness only loads with ?debug.
    (window as any).__DEBUG__ = { engine, flow, gameState, bus, audio: AudioSystem, mapController: MapController, levels: ['kethra', 'vessek'], motion, miniGame: activeMiniGame, survey: DISCOVERIES, chapters: Chapters };
    if (params.has('debug')) void import('./debug/DebugHarness').then(({ startDebugHarness }) => startDebugHarness(engine, flow));
    // The performance readout for any machine (debug/PerfOverlay.ts): the backquote key toggles it,
    // ?fps opens it at load. Loaded on first use; closed, it costs nothing.
    const togglePerf = () => void import('./debug/PerfOverlay').then(({ togglePerfOverlay }) => togglePerfOverlay(engine));
    window.addEventListener('keydown', (e) => {
      const target = e.target as HTMLElement | null;
      if (e.code === 'Backquote' && !e.repeat && !(target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable))) togglePerf();
    });
    if (params.has('fps')) togglePerf();
  }

  if (bootFlags) {
    ensureEngine();
    if (savedJourney === 'loaded') UIManager.toast(t('toast.continue'));
    // ?jump=<state> goes straight on to a state once the boot has settled (the debug harness's F1).
    const jump = params.get('jump');
    if (chapterLevel) void flow.startAt(chapterLevel);
    else
      void flow.start().then(() => {
        if (jump === 'tutorial' || jump === 'reveal' || jump === 'kethra' || jump === 'vessek' || jump === 'ending') void flow.debugGo(jump);
      });
  } else {
    document.body.classList.add('title-open');
    TitleScreen.show({
      hasSave: savedJourney === 'loaded',
      saveState: savedJourney,
      onContinue: () => {
        mark('title:continue');
        document.body.classList.remove('title-open');
        UIManager.toast(t('toast.continue'));
        ensureEngine();
        void flow.start();
      },
      onNewGame: () => {
        mark('title:newGame');
        document.body.classList.remove('title-open');
        // Nothing loaded: start fresh right here. A loaded save is already in memory, so reboot clean.
        if (savedJourney === 'none') {
          ensureEngine();
          void flow.start();
        } else {
          markVoid();
          location.search = '?newGame=1';
        }
      },
    });
    mark('title:shown');
    // While the title waits, each when the browser is idle: the engine and the title's 3D backdrop
    // (TitleScreen.startBackdrop), and alongside it the downloads the first scene needs
    // (GameFlow.prefetchWhileTitleWaits), then the environment map (Engine.ensureEnvironment), which
    // only the game's scenes use. Both decode or compile, and on an Intel UHD laptop either one running
    // with the backdrop on screen hitched it (docs/PERF_LOG.md, 2026-10-16 and 17): the prefetch
    // dropped 5-6 frames of 120-150 ms through the backdrop's arrival, and the map, made once the
    // backdrop was up, put frames over 50 ms on it in most runs. Made here, the map is done 0.8-1.2 s
    // before the backdrop's first frame, at the cost of that frame coming ~0.1-0.3 s later. The map
    // used to wait for the backdrop because, made alongside it, it doubled the backdrop's bakes: that
    // was its GGX filter's unrolled compile, which Environment.ts no longer has. None of them starts the
    // game: only a click on the title does, and a click that comes first simply finds them still to do.
    // The engine waits ~0.6 s: made at once, it spent ~0.4 s blocked on the GPU process, which is still
    // setting up the WebGL context main.ts created (glContext.ts).
    const whenIdle = (run: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(run, { timeout: 1500 }) : setTimeout(run, 300));
    setTimeout(
      () =>
        whenIdle(() => {
          ensureEngine();
          void TitleScreen.startBackdrop(engine);
          whenIdle(() => {
            flow.prefetchWhileTitleWaits(savedJourney === 'loaded' ? 'continue' : 'newGame');
            whenIdle(() => void engine.ensureEnvironment());
          });
        }),
      600,
    );
  }
  if (savedJourney === 'unreadable') UIManager.toast(t('toast.saveUnreadable'));

  // A hidden tab stops drawing (browsers already pause requestAnimationFrame) and stops making sound.
  document.addEventListener('visibilitychange', () => AudioSystem.setSuspended(document.hidden));
  // Switching away mid-play pauses, so the player comes back to a menu rather than a moving game.
  window.addEventListener('blur', () => PauseMenu.request());
}
