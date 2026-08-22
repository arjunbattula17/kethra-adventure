import { bus } from '../core/EventBus';
import { gameState } from '../core/GameState';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

class UIManagerImpl {
  root = el('div');
  crosshair = el('div', 'crosshair');
  interactPrompt = el('div', 'interact-prompt');
  objectiveTracker = el('div');
  statusBar = el('div');
  toastStack = el('div');
  captionEl = el('div', 'cinematic-caption');
  letterboxTop = el('div', 'letterbox-bar top');
  letterboxBottom = el('div', 'letterbox-bar bottom');
  fadeEl = el('div', 'fade-black');

  init(): void {
    this.root.id = 'ui-root';
    this.crosshair.id = 'crosshair';
    this.interactPrompt.id = 'interact-prompt';
    this.objectiveTracker.id = 'objective-tracker';
    this.statusBar.id = 'status-bar';
    this.toastStack.id = 'toast-stack';
    this.captionEl.id = 'cinematic-caption';
    this.fadeEl.classList.add('fade-black');

    this.objectiveTracker.innerHTML = `<div class="label">Objective</div><div id="objective-text"></div>`;

    document.body.appendChild(this.root);
    this.root.appendChild(this.crosshair);
    this.root.appendChild(this.interactPrompt);
    this.root.appendChild(this.objectiveTracker);
    this.root.appendChild(this.statusBar);
    this.root.appendChild(this.toastStack);
    this.root.appendChild(this.captionEl);
    this.root.appendChild(this.letterboxTop);
    this.root.appendChild(this.letterboxBottom);
    document.body.appendChild(this.fadeEl);

    this.toastStack.classList.add('interactive');
    this.toastStack.style.pointerEvents = 'none';

    bus.on('objective:changed', (text: string) => this.setObjective(text));
    bus.on('level:up', () => this.refreshStatusBar());
    bus.on('attribute:changed', () => this.refreshStatusBar());
    this.setObjective(gameState.data.objective);
    this.refreshStatusBar();
  }

  refreshStatusBar(): void {
    this.statusBar.innerHTML = `<span class="badge">LV ${gameState.data.level}</span><span class="badge">TAB — Character</span>`;
  }

  setObjective(text: string): void {
    const target = document.getElementById('objective-text');
    if (target) target.textContent = text;
  }

  setPrompt(label: string | null): void {
    if (label) {
      this.interactPrompt.innerHTML = `<kbd>E</kbd>${label}`;
      this.interactPrompt.classList.add('visible');
      this.crosshair.classList.add('active');
    } else {
      this.interactPrompt.classList.remove('visible');
      this.crosshair.classList.remove('active');
    }
  }

  toast(message: string): void {
    const t = el('div', 'toast', message);
    this.toastStack.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }

  showLetterbox(show: boolean): void {
    this.letterboxTop.classList.toggle('visible', show);
    this.letterboxBottom.classList.toggle('visible', show);
  }

  setCrosshairVisible(v: boolean): void {
    this.crosshair.classList.toggle('hidden', !v);
  }

  showCaption(text: string, duration = 3200): void {
    this.captionEl.textContent = text;
    this.captionEl.classList.add('visible');
    window.clearTimeout((this.captionEl as any)._t);
    (this.captionEl as any)._t = window.setTimeout(() => this.captionEl.classList.remove('visible'), duration);
  }

  clearCaption(): void {
    this.captionEl.classList.remove('visible');
  }

  async fadeToBlack(): Promise<void> {
    this.fadeEl.classList.add('visible');
    await wait(1200);
  }

  async fadeFromBlack(): Promise<void> {
    await wait(50);
    this.fadeEl.classList.remove('visible');
    await wait(1200);
  }

  skillCheckPopup(text: string, success: boolean): void {
    const p = el('div', 'skill-check-result', text);
    p.style.left = '50%';
    p.style.top = '68%';
    p.style.transform = 'translate(-50%, 0)';
    p.style.color = success ? '#7cbf7c' : '#c98a6a';
    this.root.appendChild(p);
    p.style.transition = 'opacity 1.5s ease, transform 1.5s ease';
    requestAnimationFrame(() => {
      p.style.opacity = '0';
      p.style.transform = 'translate(-50%, -30px)';
    });
    setTimeout(() => p.remove(), 1600);
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const UIManager = new UIManagerImpl();
