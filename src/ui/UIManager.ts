import { bus } from '../core/EventBus';
import { gameState } from '../core/GameState';
import { InputManager } from '../core/InputManager';
import { PanelManager } from './PanelManager';
import { t } from '../content/strings';
import type { StringKey } from '../content/strings';
import { AudioSystem } from '../audio/AudioSystem';

const LOADING_LORE: StringKey[] = ['loading.lore.1', 'loading.lore.2', 'loading.lore.3', 'loading.lore.4', 'loading.lore.5', 'loading.lore.6'];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

const ICON_OBJECTIVE = `<svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="3"/><circle cx="8" cy="8" r="0.6" fill="currentColor" stroke="none"/></svg>`;

/**
 * Whose news a toast is (docs/STYLE_BIBLE.md, Components): sea-green for something learned, amber
 * for something the player can now act on, warning for a failure, steel for plain information.
 */
export type ToastKind = 'info' | 'learn' | 'act' | 'fail';

export interface ChapterCard {
  eyebrow: string;
  title: string;
  lines?: string[];
  /** How long it holds, in ms; any key or click dismisses it early. */
  hold?: number;
}

/** Reduced motion: set from the settings menu (or the OS preference) and read everywhere motion is decided. */
export function reducedMotion(): boolean {
  return document.body.classList.contains('reduced-motion');
}

class UIManagerImpl {
  root = el('div');
  crosshair = el('div', 'crosshair');
  interactPrompt = el('div', 'interact-prompt');
  objectiveTracker = el('div', 'hud-frame');
  statusBar = el('div', 'hud-frame');
  toastStack = el('div');
  captionEl = el('div', 'cinematic-caption');
  letterboxTop = el('div', 'letterbox-bar top');
  letterboxBottom = el('div', 'letterbox-bar bottom');
  fadeEl = el('div', 'scan-wipe');
  lookPrompt = el('div', 'look-prompt');
  loadingEl = el('div', 'loading-indicator');
  meterEl = el('div', 'hud-frame hud-meter');
  flashEl = el('div', 'white-flash');
  cardEl = el('div', 'chapter-card');

  init(): void {
    this.root.id = 'ui-root';
    this.crosshair.id = 'crosshair';
    this.interactPrompt.id = 'interact-prompt';
    this.objectiveTracker.id = 'objective-tracker';
    this.statusBar.id = 'status-bar';
    this.toastStack.id = 'toast-stack';
    this.captionEl.id = 'cinematic-caption';
    this.toastStack.setAttribute('role', 'status');
    this.toastStack.setAttribute('aria-live', 'polite');
    this.lookPrompt.innerHTML = `<div class="look-prompt-inner"><span class="keycap">Click</span><span>to look around</span></div>`;
    this.loadingEl.innerHTML = `<div class="loading-title">Loading</div><div class="loading-bar"><div class="loading-fill"></div></div><div class="loading-text"></div><div class="loading-lore"></div>`;
    this.fadeEl.innerHTML = `<div class="scan-cover"></div><div class="scan-line"></div>`;
    this.objectiveTracker.innerHTML = `<div class="eyebrow"><span class="hud-icon">${ICON_OBJECTIVE}</span>Objective</div><div id="objective-text"></div>`;
    this.meterEl.innerHTML = `<div class="meter-label"></div><div class="bar"><div class="bar-fill"></div></div>`;

    document.body.appendChild(this.root);
    this.root.appendChild(this.crosshair);
    this.root.appendChild(this.interactPrompt);
    const hudLeft = el('div', 'hud-left');
    hudLeft.append(this.objectiveTracker, this.meterEl);
    this.root.appendChild(hudLeft);
    this.root.appendChild(this.statusBar);
    this.root.appendChild(this.toastStack);
    this.root.appendChild(this.captionEl);
    this.root.appendChild(this.letterboxTop);
    this.root.appendChild(this.letterboxBottom);
    this.root.appendChild(this.lookPrompt);
    this.root.appendChild(this.cardEl);
    document.body.appendChild(this.flashEl);
    document.body.appendChild(this.fadeEl);
    document.body.appendChild(this.loadingEl);

    this.toastStack.style.pointerEvents = 'none';

    this.lookPrompt.addEventListener('click', () => InputManager.requestPointerLock());
    document.addEventListener('pointerlockchange', () => this.refreshLookPrompt());
    document.addEventListener('pointerlockerror', () => {
      this.toast('Click the game to capture the mouse again.');
    });
    PanelManager.onOpenChange = (open) => this.refreshLookPrompt(open);

    bus.on('objective:changed', (text: string) => this.setObjective(text));
    bus.on('level:up', (level: number) => {
      this.refreshStatusBar();
      this.toast(`Level ${level}. You have a skill point to spend (Tab).`, 'learn');
      AudioSystem.playCollect();
    });
    bus.on('attribute:changed', () => this.refreshStatusBar());
    bus.on('xp:changed', () => this.refreshStatusBar());
    bus.on('state:loaded', () => {
      this.setObjective(gameState.data.objective);
      this.refreshStatusBar();
    });
    // A write that localStorage refuses would otherwise only reach the console, and the player
    // would keep playing believing their progress was being kept.
    bus.on('save:failed', () => this.toast('Could not save your progress: browser storage is full.', 'fail'));
    this.setObjective(gameState.data.objective);
    this.refreshStatusBar();
    this.refreshLookPrompt();
  }

  private lookPromptEnabled = true;
  private letterboxActive = false;
  private loadingLoreIndex = 0;
  private loadingLoreTimer: number | undefined;
  private captionTimeoutId: number | undefined;
  private shownLevel = 0;
  private shownXp = 0;
  private countRaf = 0;

  /** True while a cinematic holds the screen (letterbox up): no pausing into the middle of one. */
  isCinematic(): boolean {
    return this.letterboxActive;
  }

  setLookPromptEnabled(enabled: boolean): void {
    this.lookPromptEnabled = enabled;
    this.refreshLookPrompt();
  }

  private refreshLookPrompt(panelOpenOverride?: boolean): void {
    const panelOpen = panelOpenOverride ?? PanelManager.isOpen;
    const locked = !!document.pointerLockElement;
    this.lookPrompt.classList.toggle('visible', this.lookPromptEnabled && !locked && !panelOpen && !this.letterboxActive);
  }

  /**
   * The key strip (bottom right): the level with an XP bar, then the three keys a player needs
   * mid-game. The XP figure counts up to its new value instead of jumping (STYLE_BIBLE.md, Motion).
   */
  refreshStatusBar(): void {
    const level = gameState.data.level;
    const xp = gameState.data.xp;
    if (!this.statusBar.firstChild) {
      this.statusBar.innerHTML = `
        <div class="hud-level"><span class="eyebrow">Level</span><span class="hud-level-n"></span>
          <span class="bar xp"><span class="bar-fill"></span></span><span class="hud-points"></span></div>
        <div class="hud-keys"><span><span class="keycap">Tab</span>Character</span><span><span class="keycap">O</span>Settings</span><span><span class="keycap">Esc</span>Pause</span></div>`;
      this.shownLevel = level;
      this.shownXp = xp;
    }
    const points = gameState.data.unspentPoints;
    (this.statusBar.querySelector('.hud-points') as HTMLElement).textContent = points > 0 ? `+${points} point${points > 1 ? 's' : ''}` : '';
    const from = { level: this.shownLevel, xp: this.shownXp };
    const start = performance.now();
    const dur = reducedMotion() ? 0 : 400;
    cancelAnimationFrame(this.countRaf);
    const step = (now: number) => {
      const k = dur ? Math.min(1, (now - start) / dur) : 1;
      const e = 1 - Math.pow(1 - k, 3);
      // A level-up empties the bar and refills it; within a level it slides.
      const shownXp = from.level === level ? from.xp + (xp - from.xp) * e : xp * e;
      (this.statusBar.querySelector('.hud-level-n') as HTMLElement).textContent = String(level);
      (this.statusBar.querySelector('.xp .bar-fill') as HTMLElement).style.transform = `scaleX(${Math.min(1, shownXp / (level * 100))})`;
      if (k < 1) this.countRaf = requestAnimationFrame(step);
    };
    this.countRaf = requestAnimationFrame(step);
    this.shownLevel = level;
    this.shownXp = xp;
  }

  setObjective(text: string): void {
    const target = document.getElementById('objective-text');
    if (!target || target.textContent === text) return;
    target.textContent = text;
    // A changed objective gets a brief amber edge so the eye finds it, then settles.
    this.objectiveTracker.classList.remove('updated');
    void this.objectiveTracker.offsetWidth;
    this.objectiveTracker.classList.add('updated');
  }

  setPrompt(label: string | null): void {
    if (label) {
      this.interactPrompt.innerHTML = `<span class="keycap">E</span><span>${label}</span>`;
      this.interactPrompt.classList.add('visible');
      this.crosshair.classList.add('active');
    } else {
      this.interactPrompt.classList.remove('visible');
      this.crosshair.classList.remove('active');
    }
  }

  toast(message: string, kind: ToastKind = 'info'): void {
    const t = el('div', `toast ${kind}`);
    t.textContent = message;
    this.toastStack.appendChild(t);
    // At most four lines of news at once; the oldest goes first.
    while (this.toastStack.children.length > 4) this.toastStack.firstChild?.remove();
    const hold = 2600 + message.split(' ').length * 180;
    setTimeout(() => t.classList.add('out'), hold);
    setTimeout(() => t.remove(), hold + 400);
  }

  /** A HUD meter under the objective (the Anchorage's frost clock). Null hides it. */
  setMeter(label: string | null, fraction: number): void {
    this.meterEl.classList.toggle('visible', label !== null);
    if (label === null) return;
    (this.meterEl.querySelector('.meter-label') as HTMLElement).textContent = label;
    (this.meterEl.querySelector('.bar-fill') as HTMLElement).style.transform = `scaleX(${Math.max(0, Math.min(1, fraction))})`;
    this.meterEl.classList.toggle('low', fraction < 0.25);
  }

  /** The white sky's light, over everything for a moment. Reduced motion keeps it short and dim. */
  whiteFlash(ms = 900): void {
    this.flashEl.animate(
      reducedMotion()
        ? [{ opacity: 0 }, { opacity: 0.35 }, { opacity: 0 }]
        : [{ opacity: 0 }, { opacity: 0.92, offset: 0.25 }, { opacity: 0 }],
      { duration: reducedMotion() ? 300 : ms, easing: 'cubic-bezier(.2,.8,.2,1)' },
    );
  }

  /**
   * A readable document: inscriptions, the ledger, plates. The text the player just found is on
   * screen at once, instead of only being filed in a journal they can't open away from the ship.
   */
  showDocument(title: string, body: string, onClose?: () => void): void {
    const panel = el('div', 'panel doc-panel');
    panel.innerHTML = `<div class="eyebrow">Recorded</div><h2></h2><div class="doc-body"></div><div class="panel-foot"><span class="keycap">Esc</span> close</div>`;
    panel.querySelector('h2')!.textContent = title;
    const bodyEl = panel.querySelector('.doc-body') as HTMLElement;
    for (const para of body.split('\n\n')) {
      const p = el('p');
      p.textContent = para;
      bodyEl.appendChild(p);
    }
    PanelManager.open(panel, onClose, undefined, 'document');
  }

  /**
   * A card in the upper third that names a level on arrival or marks it complete: the transitions
   * between levels carry context instead of just resetting (TSA rubric, Storyline and Flow).
   */
  showChapterCard(card: ChapterCard): void {
    this.cardEl.innerHTML = '';
    const eyebrow = el('div', 'eyebrow');
    eyebrow.textContent = card.eyebrow;
    const title = el('div', 'chapter-title');
    title.textContent = card.title;
    this.cardEl.append(eyebrow, title);
    for (const line of card.lines ?? []) {
      const p = el('div', 'chapter-line');
      p.textContent = line;
      this.cardEl.appendChild(p);
    }
    this.cardEl.classList.remove('visible');
    void this.cardEl.offsetWidth;
    this.cardEl.classList.add('visible');
    const hide = () => {
      this.cardEl.classList.remove('visible');
      window.removeEventListener('keydown', early);
      window.removeEventListener('pointerdown', early);
    };
    const early = () => window.setTimeout(hide, 250);
    window.setTimeout(() => {
      window.addEventListener('keydown', early, { once: true });
      window.addEventListener('pointerdown', early, { once: true });
    }, 800);
    window.setTimeout(hide, card.hold ?? 5200);
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
    this.captionEl.innerHTML = '';
    const span = el('span');
    span.textContent = text;
    this.captionEl.appendChild(span);
    this.captionEl.classList.add('visible');
    window.clearTimeout(this.captionTimeoutId);
    this.captionTimeoutId = window.setTimeout(() => this.captionEl.classList.remove('visible'), duration);
  }

  clearCaption(): void {
    this.captionEl.classList.remove('visible');
  }

  showLoading(): void {
    // A line of lore under the bar, a new one every 7 s, so a long first load (every shader
    // compiles once) at least tells the player something.
    const lore = this.loadingEl.querySelector('.loading-lore');
    const next = () => {
      if (lore) lore.textContent = t(LOADING_LORE[this.loadingLoreIndex++ % LOADING_LORE.length]);
    };
    if (this.loadingEl.classList.contains('visible')) return;
    next();
    window.clearInterval(this.loadingLoreTimer);
    this.loadingLoreTimer = window.setInterval(next, 7000);
    this.setLoadingProgress(0, '');
    this.loadingEl.classList.add('visible');
  }

  /** Real progress for the loading bar: a fraction and what is happening. */
  setLoadingProgress(fraction: number, what: string): void {
    (this.loadingEl.querySelector('.loading-fill') as HTMLElement).style.transform = `scaleX(${Math.max(0.02, Math.min(1, fraction))})`;
    (this.loadingEl.querySelector('.loading-text') as HTMLElement).textContent = what;
  }

  hideLoading(): void {
    window.clearInterval(this.loadingLoreTimer);
    this.loadingEl.classList.remove('visible');
  }

  /**
   * The signature transition (STYLE_BIBLE.md, Motion): the Wren's scan line sweeps down and the
   * world behind it goes dark. Names kept from the fade it replaced, since every scene change in
   * GameFlow already calls these two in pairs.
   */
  async fadeToBlack(): Promise<void> {
    await this.scan('out');
  }

  async fadeFromBlack(): Promise<void> {
    await wait(30);
    await this.scan('in');
  }

  private async scan(dir: 'in' | 'out'): Promise<void> {
    const cover = this.fadeEl.querySelector('.scan-cover') as HTMLElement;
    const line = this.fadeEl.querySelector('.scan-line') as HTMLElement;
    this.fadeEl.classList.toggle('covered', dir === 'out');
    if (reducedMotion()) {
      await cover.animate(dir === 'out' ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: 'forwards' }).finished.catch(() => {});
      cover.style.clipPath = dir === 'out' ? 'inset(0 0 0 0)' : 'inset(100% 0 0 0)';
      return;
    }
    const duration = dir === 'out' ? 260 : 300;
    const easing = dir === 'out' ? 'cubic-bezier(.4,0,1,1)' : 'cubic-bezier(.2,.8,.2,1)';
    const frames =
      dir === 'out'
        ? [{ clipPath: 'inset(0 0 100% 0)', opacity: 1 }, { clipPath: 'inset(0 0 0% 0)', opacity: 1 }]
        : [{ clipPath: 'inset(0% 0 0 0)', opacity: 1 }, { clipPath: 'inset(100% 0 0 0)', opacity: 1 }];
    const a = cover.animate(frames, { duration, easing, fill: 'forwards' });
    line.animate([{ top: '0%', opacity: 1 }, { top: '100%', opacity: 1 }], { duration, easing });
    await a.finished.catch(() => {});
    cover.style.clipPath = dir === 'out' ? 'inset(0 0 0 0)' : 'inset(100% 0 0 0)';
    a.cancel();
  }

  skillCheckPopup(text: string, success: boolean): void {
    this.toast(text, success ? 'learn' : 'fail');
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const UIManager = new UIManagerImpl();
