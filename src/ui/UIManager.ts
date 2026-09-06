import { bus } from '../core/EventBus';
import { gameState } from '../core/GameState';
import { InputManager } from '../core/InputManager';
import { PanelManager } from './PanelManager';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

const ICON_OBJECTIVE = `<svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="3"/><circle cx="8" cy="8" r="0.6" fill="currentColor" stroke="none"/></svg>`;
const ICON_LEVEL = `<svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor" stroke="none"><path d="M8 1.5l1.8 3.7 4.1.6-3 2.9.7 4.1L8 11l-3.6 1.9.7-4.1-3-2.9 4.1-.6L8 1.5Z"/></svg>`;

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
  lookPrompt = el('div', 'look-prompt');
  loadingEl = el('div', 'loading-indicator');

  init(): void {
    this.root.id = 'ui-root';
    this.crosshair.id = 'crosshair';
    this.interactPrompt.id = 'interact-prompt';
    this.objectiveTracker.id = 'objective-tracker';
    this.statusBar.id = 'status-bar';
    this.toastStack.id = 'toast-stack';
    this.captionEl.id = 'cinematic-caption';
    this.fadeEl.classList.add('fade-black');
    this.lookPrompt.innerHTML = `<div class="look-prompt-inner"><div class="look-prompt-icon">◎</div><div>Click to look around</div></div>`;
    this.loadingEl.innerHTML = `<div class="loading-spinner"></div><div class="loading-text">Loading…</div>`;

    this.objectiveTracker.innerHTML = `<div class="label"><span class="hud-icon">${ICON_OBJECTIVE}</span>Objective</div><div id="objective-text"></div>`;

    document.body.appendChild(this.root);
    this.root.appendChild(this.crosshair);
    this.root.appendChild(this.interactPrompt);
    this.root.appendChild(this.objectiveTracker);
    this.root.appendChild(this.statusBar);
    this.root.appendChild(this.toastStack);
    this.root.appendChild(this.captionEl);
    this.root.appendChild(this.letterboxTop);
    this.root.appendChild(this.letterboxBottom);
    this.root.appendChild(this.lookPrompt);
    document.body.appendChild(this.fadeEl);
    document.body.appendChild(this.loadingEl);

    this.toastStack.classList.add('interactive');
    this.toastStack.style.pointerEvents = 'none';

    this.lookPrompt.addEventListener('click', () => InputManager.requestPointerLock());
    document.addEventListener('pointerlockchange', () => this.refreshLookPrompt());
    document.addEventListener('pointerlockerror', () => {
      this.toast('Click the game to re-enable mouse look.');
    });
    PanelManager.onOpenChange = (open) => this.refreshLookPrompt(open);

    bus.on('objective:changed', (text: string) => this.setObjective(text));
    bus.on('level:up', () => this.refreshStatusBar());
    bus.on('attribute:changed', () => this.refreshStatusBar());
    // A write that localStorage refuses would otherwise only reach the console, and the player
    // would keep playing believing their progress was being kept.
    bus.on('save:failed', () => this.toast('Could not save your progress — browser storage is full.'));
    this.setObjective(gameState.data.objective);
    this.refreshStatusBar();
    this.refreshLookPrompt();
  }

  private lookPromptEnabled = true;
  private letterboxActive = false;
  private captionTimeoutId: number | undefined;

  setLookPromptEnabled(enabled: boolean): void {
    this.lookPromptEnabled = enabled;
    this.refreshLookPrompt();
  }

  private refreshLookPrompt(panelOpenOverride?: boolean): void {
    const panelOpen = panelOpenOverride ?? PanelManager.isOpen;
    const locked = !!document.pointerLockElement;
    this.lookPrompt.classList.toggle('visible', this.lookPromptEnabled && !locked && !panelOpen && !this.letterboxActive);
  }

  refreshStatusBar(): void {
    this.statusBar.innerHTML = `<span class="badge"><span class="hud-icon" style="color:var(--accent)">${ICON_LEVEL}</span>LV ${gameState.data.level}</span><span class="badge">TAB — Character</span><span class="badge">O — Settings</span>`;
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
    this.letterboxActive = show;
    this.refreshLookPrompt();
  }

  setCrosshairVisible(v: boolean): void {
    this.crosshair.classList.toggle('hidden', !v);
  }

  showCaption(text: string, duration = 3200): void {
    this.captionEl.textContent = text;
    this.captionEl.classList.add('visible');
    window.clearTimeout(this.captionTimeoutId);
    this.captionTimeoutId = window.setTimeout(() => this.captionEl.classList.remove('visible'), duration);
  }

  clearCaption(): void {
    this.captionEl.classList.remove('visible');
  }

  showLoading(): void {
    this.loadingEl.classList.add('visible');
  }

  hideLoading(): void {
    this.loadingEl.classList.remove('visible');
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
