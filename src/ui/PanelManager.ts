import { InputManager } from '../core/InputManager';
import { motion, DUR, EXIT_FACTOR } from '../motion';

export type PanelCloseHandler = () => void;

class PanelManagerImpl {
  private overlay: HTMLDivElement;
  private content: HTMLDivElement;
  private openCallback: PanelCloseHandler | null = null;
  private escapeInterceptor: (() => void) | null = null;
  /** Clears the content once a closing panel has finished animating out. */
  private clearTimer: { cancel(): void } | null = null;
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
      // Marked handled, so the pause menu doesn't take the same Esc as a request to open.
      e.preventDefault();
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
   *
   * Opening over another panel closes that one first, so its own close handler runs (its render
   * loop stops, a conversation ends properly) instead of being silently dropped.
   */
  open(panelHtml: HTMLElement, onClose?: PanelCloseHandler, onEscape?: () => void, id?: string): void {
    const replacing = this.isOpen;
    if (replacing) {
      const previous = this.openCallback;
      this.openCallback = null;
      previous?.();
    }
    this.clearTimer?.cancel();
    this.clearTimer = null;
    if (replacing) this.morphTo(panelHtml);
    else {
      this.content.innerHTML = '';
      this.content.appendChild(panelHtml);
      motion.ui.animate(panelHtml, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { dur: 'medium' });
    }
    this.overlay.classList.add('visible');
    this.isOpen = true;
    this.activeId = id ?? null;
    this.openCallback = onClose ?? null;
    this.escapeInterceptor = onEscape ?? null;
    InputManager.exitPointerLock();
    if (!replacing) this.onOpenChange(true);
  }

  /** Swap the panel's content in place (a new page of the same panel): no entrance replayed. */
  setContent(panelHtml: HTMLElement): void {
    this.morphTo(panelHtml);
  }

  /**
   * Shows `next` in place of the current content: the frame grows or shrinks from the old size to
   * the new while the new content fades up, so the panel never leaves and re-enters.
   */
  private morphTo(next: HTMLElement): void {
    const from = (this.content.firstElementChild as HTMLElement | null)?.getBoundingClientRect();
    this.content.innerHTML = '';
    this.content.appendChild(next);
    for (const child of next.children) motion.ui.animate(child, [{ opacity: 0 }, { opacity: 1 }], { dur: 'small', delay: DUR.micro, fill: 'backwards' });
    if (!from?.width) return;
    const to = next.getBoundingClientRect();
    if (Math.abs(from.width - to.width) < 1 && Math.abs(from.height - to.height) < 1) return;
    next.style.overflow = 'hidden';
    const a = motion.ui.animate(
      next,
      [
        { width: `${from.width}px`, height: `${from.height}px` },
        { width: `${to.width}px`, height: `${to.height}px` },
      ],
      { dur: 'small', ease: 'standard' },
    );
    const done = () => next.style.removeProperty('overflow');
    a.finished.then(done, done);
  }

  /**
   * Closes the open panel. With an id, only that panel: a timer set by one panel can't close
   * whatever the player opened on top of it since. The state changes at once (the game resumes);
   * the panel's picture animates out and is removed after.
   */
  close(id?: string): void {
    if (!this.isOpen) return;
    if (id !== undefined && this.activeId !== id) return;
    const callback = this.openCallback;
    this.overlay.classList.remove('visible');
    this.isOpen = false;
    this.activeId = null;
    this.escapeInterceptor = null;
    this.openCallback = null;
    const leaving = this.content.firstElementChild;
    if (leaving) motion.ui.animate(leaving, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(4px)' }], { dur: 'medium', exit: true, fill: 'forwards' });
    this.clearTimer = motion.ui.after(DUR.medium * EXIT_FACTOR, () => {
      if (!this.isOpen) this.content.innerHTML = '';
      this.clearTimer = null;
    });
    this.onOpenChange(false);
    callback?.();
    // The callback may have opened the next panel; only hand the mouse back if nothing did.
    if (!this.isOpen && this.relockPointerOnClose) InputManager.requestPointerLock();
  }
}

export const PanelManager = new PanelManagerImpl();
