import { bus } from '../core/EventBus';
import { gameState } from '../core/GameState';
import { InputManager } from '../core/InputManager';
import { PanelManager } from './PanelManager';
import { t } from '../content/strings';
import type { StringKey } from '../content/strings';
import { AudioSystem } from '../audio/AudioSystem';
import { motion, DUR, EXIT_FACTOR } from '../motion';

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
  private loadingLoreTimer: { cancel(): void } | null = null;
  private captionTimer: { cancel(): void } | null = null;
  /** Level plus progress through it (2.35 = level 2, 35%): one continuous value, so a level-up
   * fills the bar, wraps and keeps going instead of fighting a second animation. */
  private shownProgress = { value: -1 };
  private cardTimers: { cancel(): void }[] = [];
  private cardEarly: (() => void) | null = null;
  private scanAnims: Animation[] = [];

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
        <div class="hud-level"><span class="eyebrow">Level</span><span class="hud-level-n num"></span>
          <span class="bar xp"><span class="bar-fill"></span></span><span class="hud-points num"></span></div>
        <div class="hud-keys"><span><span class="keycap">Tab</span>Character</span><span><span class="keycap">O</span>Settings</span><span><span class="keycap">Esc</span>Pause</span></div>`;
    }
    const points = gameState.data.unspentPoints;
    (this.statusBar.querySelector('.hud-points') as HTMLElement).textContent = points > 0 ? `+${points} point${points > 1 ? 's' : ''}` : '';
    const target = level + Math.min(0.999, xp / (level * 100));
    const levelEl = this.statusBar.querySelector('.hud-level-n') as HTMLElement;
    const fill = this.statusBar.querySelector('.xp .bar-fill') as HTMLElement;
    const draw = () => {
      const v = this.shownProgress.value;
      levelEl.textContent = String(Math.floor(v));
      fill.style.transform = `scaleX(${v - Math.floor(v)})`;
    };
    // First draw, a loaded save, or reduced motion: show the value outright.
    if (this.shownProgress.value < 0 || motion.reduced) {
      this.shownProgress.value = target;
      draw();
      return;
    }
    // Retargets from wherever the bar is now, so back-to-back level-up and XP events chain smoothly.
    const from = this.shownProgress.value;
    this.xpTween?.cancel();
    this.xpTween = motion.ui.tween({
      duration: DUR.medium + Math.min(0.4, Math.abs(target - from) * 0.3),
      update: (e) => {
        this.shownProgress.value = from + (target - from) * e;
        draw();
      },
    });
  }
  private xpTween: { cancel(): void } | null = null;

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
    motion.ui.animate(t, [{ opacity: 0, transform: 'translateX(-8px)' }, { opacity: 1, transform: 'none' }], { dur: 'small' });
    // At most four lines of news at once: the oldest still on screen leaves early.
    const live = [...this.toastStack.children].filter((c) => !c.classList.contains('leaving'));
    if (live.length > 4) this.dismissToast(live[0] as HTMLElement);
    const hold = 2.6 + message.split(' ').length * 0.18;
    motion.ui.after(hold, () => this.dismissToast(t));
  }

  private dismissToast(t: HTMLElement): void {
    if (t.classList.contains('leaving') || !t.isConnected) return;
    t.classList.add('leaving');
    const a = motion.ui.animate(t, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-4px)' }], { dur: 'small', exit: true, fill: 'forwards' });
    a.finished.then(() => t.remove(), () => t.remove());
  }

  /** A HUD meter under the objective (the Anchorage's frost clock). Null hides it. */
  setMeter(label: string | null, fraction: number): void {
    this.meterEl.classList.toggle('visible', label !== null);
    if (label === null) return;
    (this.meterEl.querySelector('.meter-label') as HTMLElement).textContent = label;
    (this.meterEl.querySelector('.bar-fill') as HTMLElement).style.transform = `scaleX(${Math.max(0, Math.min(1, fraction))})`;
    this.meterEl.classList.toggle('low', fraction < 0.25);
  }

  /**
   * The white sky's light, over everything for a moment. Reduced motion keeps it short and dim, and
   * the flash guard refuses it outright if three full-screen flashes already landed this second.
   */
  whiteFlash(seconds = 0.9): void {
    if (!motion.requestFlash()) return;
    const reduced = motion.reduced;
    motion.ui.animate(
      this.flashEl,
      reduced ? [{ opacity: 0 }, { opacity: 0.35 }, { opacity: 0 }] : [{ opacity: 0 }, { opacity: 0.92, offset: 0.25 }, { opacity: 0 }],
      { dur: reduced ? 0.3 : seconds, reduced: 'keep' },
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
    // A new card owns the timers: the previous card's hide can't cut this one short.
    for (const timer of this.cardTimers) timer.cancel();
    this.cardTimers = [];
    if (this.cardEarly) {
      window.removeEventListener('keydown', this.cardEarly);
      window.removeEventListener('pointerdown', this.cardEarly);
      this.cardEarly = null;
    }
    this.cardEl.classList.remove('visible');
    void this.cardEl.offsetWidth;
    this.cardEl.classList.add('visible');
    const hide = () => {
      this.cardEl.classList.remove('visible');
      if (this.cardEarly) {
        window.removeEventListener('keydown', this.cardEarly);
        window.removeEventListener('pointerdown', this.cardEarly);
        this.cardEarly = null;
      }
    };
    const early = () => this.cardTimers.push(motion.ui.after(0.25, hide));
    this.cardTimers.push(
      motion.ui.after(0.8, () => {
        this.cardEarly = early;
        window.addEventListener('keydown', early, { once: true });
        window.addEventListener('pointerdown', early, { once: true });
      }),
      motion.ui.after((card.hold ?? 5200) / 1000, hide),
    );
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
    this.captionTimer?.cancel();
    this.captionTimer = motion.ui.after(duration / 1000, () => this.captionEl.classList.remove('visible'));
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
    this.loadingLoreTimer?.cancel();
    this.loadingLoreTimer = motion.ui.every(7, next);
    this.setLoadingProgress(0, '');
    this.loadingEl.classList.add('visible');
  }

  /** Real progress for the loading bar: a fraction and what is happening. */
  setLoadingProgress(fraction: number, what: string): void {
    (this.loadingEl.querySelector('.loading-fill') as HTMLElement).style.transform = `scaleX(${Math.max(0.02, Math.min(1, fraction))})`;
    (this.loadingEl.querySelector('.loading-text') as HTMLElement).textContent = what;
  }

  hideLoading(): void {
    this.loadingLoreTimer?.cancel();
    this.loadingLoreTimer = null;
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
    await this.scan('in');
  }

  /**
   * The Wren's scan line crossing the screen (a medium panel's time in, the exit fraction of it
   * out). A new scan cancels one still running, so back-to-back scene changes never stack.
   * Reduced motion swaps the sweep for a short cross-fade.
   */
  private async scan(dir: 'in' | 'out'): Promise<void> {
    const cover = this.fadeEl.querySelector('.scan-cover') as HTMLElement;
    const line = this.fadeEl.querySelector('.scan-line') as HTMLElement;
    for (const a of this.scanAnims) a.cancel();
    this.fadeEl.classList.toggle('covered', dir === 'out');
    const covered = 'inset(0 0 0 0)';
    const clear = 'inset(100% 0 0 0)';
    if (motion.reduced) {
      cover.style.clipPath = covered;
      const a = motion.ui.animate(cover, dir === 'out' ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }], { dur: 'small', exit: dir === 'out', fill: 'forwards' });
      this.scanAnims = [a];
      await a.finished.catch(() => {});
      cover.style.clipPath = dir === 'out' ? covered : clear;
      return;
    }
    cover.style.opacity = '1';
    const frames =
      dir === 'out'
        ? [{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0% 0)' }]
        : [{ clipPath: 'inset(0% 0 0 0)' }, { clipPath: clear }];
    const opts = { dur: DUR.medium * (dir === 'out' ? EXIT_FACTOR : 1), ease: dir === 'out' ? ('accelerate' as const) : ('decelerate' as const), reduced: 'keep' as const };
    const a = motion.ui.animate(cover, frames, { ...opts, fill: 'forwards' });
    const b = motion.ui.animate(line, [{ top: '0%', opacity: 1 }, { top: '100%', opacity: 1 }], opts);
    this.scanAnims = [a, b];
    const done = await a.finished.then(() => true, () => false);
    if (!done) return;
    cover.style.clipPath = dir === 'out' ? covered : clear;
    a.cancel();
  }

  skillCheckPopup(text: string, success: boolean): void {
    this.toast(text, success ? 'learn' : 'fail');
  }
}

export const UIManager = new UIManagerImpl();
