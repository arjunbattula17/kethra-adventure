import { InputManager } from '../core/InputManager';

export type PanelCloseHandler = () => void;

class PanelManagerImpl {
  private overlay: HTMLDivElement;
  private content: HTMLDivElement;
  private openCallback: PanelCloseHandler | null = null;
  isOpen = false;
  onOpenChange: (open: boolean) => void = () => {};

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'panel-overlay interactive';
    this.content = document.createElement('div');
    this.overlay.appendChild(this.content);
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.isOpen) this.close();
    });
  }

  mount(): void {
    document.getElementById('ui-root')!.appendChild(this.overlay);
  }

  open(panelHtml: HTMLElement, onClose?: PanelCloseHandler): void {
    this.content.innerHTML = '';
    this.content.appendChild(panelHtml);
    this.overlay.classList.add('visible');
    this.isOpen = true;
    this.openCallback = onClose ?? null;
    InputManager.exitPointerLock();
    this.onOpenChange(true);
  }

  close(): void {
    if (!this.isOpen) return;
    this.overlay.classList.remove('visible');
    this.isOpen = false;
    this.onOpenChange(false);
    this.openCallback?.();
    this.openCallback = null;
    this.content.innerHTML = '';
    InputManager.requestPointerLock();
  }
}

export const PanelManager = new PanelManagerImpl();
