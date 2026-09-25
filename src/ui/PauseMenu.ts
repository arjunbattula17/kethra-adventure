import { PanelManager } from './PanelManager';
import { InputManager } from '../core/InputManager';
import { gameState } from '../core/GameState';
import { AudioSystem } from '../audio/AudioSystem';
import { SettingsPanel } from './SettingsPanel';
import { TitleScreen } from './TitleScreen';

interface PauseOptions {
  /** Whether pausing makes sense right now (not on the title, not mid-cinematic). */
  canPause: () => boolean;
  /** Whether "Restart level" applies (the player is inside a level, not the Wren's hub). */
  canRestart: () => boolean;
  restartLevel: () => void;
  quitToTitle: () => void;
}

/**
 * The pause menu: Esc during play. Opening a panel already stops the engine (main.ts pauses it
 * whenever PanelManager has a panel up), so pausing is simply this panel. Resume hands the mouse
 * back to the game; the other buttons open the same Settings and Controls screens as the title.
 */
export const PauseMenu = {
  opts: null as PauseOptions | null,

  init(opts: PauseOptions): void {
    this.opts = opts;
    InputManager.onUserUnlock = () => this.request();
    window.addEventListener('keydown', (e) => {
      // Esc with nothing open and the mouse already free (keyboard-only play) also pauses.
      // PanelManager's own Esc handler runs first and closes an open panel instead.
      if (e.code === 'Escape' && !e.defaultPrevented && !PanelManager.isOpen && !document.pointerLockElement) this.request();
    });
  },

  request(): void {
    if (!this.opts?.canPause() || PanelManager.isOpen) return;
    this.open();
  },

  open(): void {
    const opts = this.opts!;
    AudioSystem.playCancel();
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.id = 'pause-panel';
    panel.innerHTML = `<div class="eyebrow">Paused</div><h2>Paused</h2><div class="pause-objective"></div><div class="pause-actions"></div><div class="panel-foot"><span class="keycap">Esc</span> resume</div>`;
    (panel.querySelector('.pause-objective') as HTMLElement).textContent = gameState.data.objective;
    const actions = panel.querySelector('.pause-actions') as HTMLElement;
    const add = (label: string, cls: string, run: () => void) => {
      const b = document.createElement('button');
      b.className = `btn ${cls}`;
      b.textContent = label;
      b.onclick = () => {
        AudioSystem.playConfirm();
        run();
      };
      actions.appendChild(b);
      return b;
    };
    add('Resume', 'primary', () => PanelManager.close());
    add('Settings', 'secondary', () => SettingsPanel.open());
    add('Controls', 'secondary', () => TitleScreen.showControls());
    if (opts.canRestart()) add('Restart this level', 'secondary', () => {
      PanelManager.close();
      opts.restartLevel();
    });
    add('Save and quit to title', 'quiet', () => opts.quitToTitle());
    PanelManager.open(panel, undefined, undefined, 'pause');
    (actions.firstChild as HTMLButtonElement).focus();
  },
};
