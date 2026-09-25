import { InputManager } from '../core/InputManager';

export type PanelCloseHandler = () => void;

class PanelManagerImpl {
  private overlay: HTMLDivElement;
  private content: HTMLDivElement;
  private openCallback: PanelCloseHandler | null = null;
  private escapeInterceptor: (() => void) | null = null;
  isOpen = false;
  onOpenChange: (open: boolean) => void = () => {};
  /** Identifies which panel is currently open (e.g. 'character', 'settings') so a global toggle
   * keybinding can tell "close my own panel" apart from "switch from a different one" instead of
   * only ever seeing the single shared isOpen flag. Null when no panel, or an id-less one, is open. */
  activeId: string | null = null;
  /** Whether closing a panel hands the mouse back to the game view. Off while the title screen is
   * up: re-locking there captured the mouse behind the menu, so the cursor vanished and no title
   * button could be clicked until Esc. */
  relockPointerOnClose = true;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'panel-overlay interactive';
    this.content = document.createElement('div');
    this.overlay.appendChild(this.content);
    document.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape' || !this.isOpen) return;
      if (this.escapeInterceptor) this.escapeInterceptor();
      else this.close();
    });
  }

  mount(): void {
    document.getElementById('ui-root')!.appendChild(this.overlay);
  }

  /**
   * onEscape: when provided, Escape calls this instead of close() — used for multi-level UIs
   * (e.g. planet map -> solar system map) where Escape should navigate back a level rather
   * than exit entirely. The interceptor is responsible for calling close() itself when the
   * back-navigation reaches the top level.
   */
  open(panelHtml: HTMLElement, onClose?: PanelCloseHandler, onEscape?: () => void, id?: string): void {
    this.content.innerHTML = '';
    this.content.appendChild(panelHtml);
    this.overlay.classList.add('visible');
    this.isOpen = true;
    this.activeId = id ?? null;
    this.openCallback = onClose ?? null;
    this.escapeInterceptor = onEscape ?? null;
    InputManager.exitPointerLock();
    this.onOpenChange(true);
  }

  /** Swap the panel's content without closing/reopening (no pointer-lock or state churn). */
  setContent(panelHtml: HTMLElement): void {
    this.content.innerHTML = '';
    this.content.appendChild(panelHtml);
  }

  close(): void {
    if (!this.isOpen) return;
    this.overlay.classList.remove('visible');
    this.isOpen = false;
    this.activeId = null;
    this.escapeInterceptor = null;
    this.onOpenChange(false);
    this.openCallback?.();
    this.openCallback = null;
    this.content.innerHTML = '';
    if (this.relockPointerOnClose) InputManager.requestPointerLock();
  }
}

export const PanelManager = new PanelManagerImpl();
