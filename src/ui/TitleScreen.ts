import { t } from '../content/strings';
import type { StringKey } from '../content/strings';
import { PanelManager } from './PanelManager';
import { SettingsPanel } from './SettingsPanel';
import { AudioSystem } from '../audio/AudioSystem';
import { BINDINGS, BINDING_ORDER } from '../content/controls';
import type { BindingId } from '../content/controls';
import { ChapterSelect } from './ChapterSelect';
import type { Engine } from '../core/Engine';
import { PACE } from '../core/prepare';
import { motion } from '../motion';
import type { TitleScene } from '../galaxy/title/TitleScene';
import type { KethraTitleScene } from '../galaxy/title/kethraTitle';
import { createDevour, prepareDevour } from './titleDevour';
import { prepareSingularitySound, startSingularitySound } from '../audio/singularitySound';
import { UIManager } from './UIManager';

/**
 * The title screen: the first thing a judge sees. The menu is plain DOM and CSS, and the first click
 * on it is what unlocks audio (browsers block sound until the page gets a gesture).
 *
 * Behind it, once the engine exists (boot.ts), runs the 3D backdrop: the survey cruiser over Kethra at
 * sunrise (galaxy/title/kethraTitle.ts), for every player. The astronaut by ringed Isilthe
 * (galaxy/title/TitleScene.ts) is kept as an alternative and shown only with ?title=isilthe
 * (pickBackdrop). Only the one picked is downloaded and built. The page shows only a dark sky of its own
 * until the backdrop's first frame; then the menu and the backdrop come in together, in one fade
 * (reveal). Should the backdrop fail, or not arrive within REVEAL_CAP_MS, the menu comes in over that
 * sky alone. Nothing on the menu loops.
 *
 * Continue / New game / Chapters / Controls / Settings. Continue is shown but disabled when there is no
 * save to go back to, with the reason under it. Chapters and Controls open in the shared panel system;
 * Controls prints src/content/controls.ts, the same table the player code reads its keys from. Arrow
 * keys (or W/S) move through the menu; Enter or Space picks. The credits, including the attribution the
 * CC BY assets require, roll at the end of the game (EndingScene).
 *
 * New game leaves another way when the ship-over-Kethra backdrop is up: a black hole opens in its sky and
 * eats the picture and the menu (collapse; galaxy/title/singularity), and the game loads in the dark it
 * leaves (UIManager.enterVoid).
 */

interface TitleOptions {
  /** Whether a save was loaded (Continue works). */
  hasSave: boolean;
  /** Why Continue is off, when it is. */
  saveState: 'none' | 'loaded' | 'unreadable';
  onContinue: () => void;
  onNewGame: () => void;
}

/** The wordmark, drawn on a 776 x 100 grid: wide geometric capitals, the A as an open lambda. One path,
 * nonzero fill (the R's counter winds the other way). */
const WORDMARK =
  'M0 0H22V100H0Z M22 40L80 0H116L22 64Z M46 47.7L70 31.4L118 100H84Z ' +
  'M142 0H238V20H164V40H226V59H164V80H238V100H142Z ' +
  'M262 0H366V20H325V100H303V20H262Z ' +
  'M390 0H412V40H472V0H494V100H472V59H412V100H390Z ' +
  'M518 0H596Q626 0 626 30V33Q626 62 596 62H584L624 100H594L556 62H540V100H518Z M540 20V42H594Q604 42 604 33V30Q604 20 594 20Z ' +
  'M650 100L702 0H724L776 100H750L713 26L676 100Z';

const ICONS: Record<'continue' | 'newGame' | 'chapters' | 'controls' | 'settings' | 'chevron', string> = {
  continue: '<path d="M7 4.6v14.8L19.2 12z" fill="currentColor"/>',
  newGame:
    '<path d="M7.6 8h8.8a4.4 4.4 0 0 1 4.2 3.1l1.1 3.8a2.5 2.5 0 0 1-4.3 2.3L15.6 15H8.4l-1.8 2.2a2.5 2.5 0 0 1-4.3-2.3l1.1-3.8A4.4 4.4 0 0 1 7.6 8z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>' +
    '<path d="M7.6 10.4v3.2M6 12h3.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="15.6" cy="11" r="1" fill="currentColor"/><circle cx="17.6" cy="13" r="1" fill="currentColor"/>',
  // A course through three stops, one per level.
  chapters:
    '<path d="M5.4 18.2C9.6 18.2 8 12 12 12s2.6-6.2 6.6-6.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="0.1 3.1"/>' +
    '<circle cx="5" cy="18.4" r="2.1" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="2.1" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="19" cy="5.6" r="2.1" fill="currentColor"/>',
  controls:
    '<rect x="2.6" y="6.4" width="18.8" height="11.2" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
    '<path d="M6.2 10h.01M9.1 10h.01M12 10h.01M14.9 10h.01M17.8 10h.01M6.2 13.4h.01M17.8 13.4h.01M8.8 14.2h6.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  settings:
    '<path d="M3.5 7h9.5M17 7h3.5M3.5 12h3M11 12h9.5M3.5 17h11M18.5 17h2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
    '<circle cx="15" cy="7" r="2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="8.8" cy="12" r="2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="16.6" cy="17" r="2" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  chevron: '<path d="M9 5.5l6.5 6.5L9 18.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
};

function icon(name: keyof typeof ICONS, cls: string): string {
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
}

/** The kicker's emblem: a compass star in a ring, its north point running out through the ring. */
const EMBLEM = `<svg class="ts-emblem" viewBox="0 0 48 64" aria-hidden="true"><path d="M24 2v14M24 48v14" stroke="currentColor" stroke-width="1.2" opacity="0.7"/><circle cx="24" cy="32" r="15.5" fill="none" stroke="currentColor" stroke-width="1.4" opacity="0.8"/><path d="M24 13l2.4 16.6L43 32l-16.6 2.4L24 51l-2.4-16.6L5 32l16.6-2.4z" fill="currentColor"/></svg>`;

/** Corner furniture (decorative): a bracket line over the top right, a scope in a bracket at the bottom left, a rule under the bottom right. */
const HUD_TOP = `<svg class="ts-hud-line" viewBox="0 0 400 20" preserveAspectRatio="none" aria-hidden="true"><path d="M0 19H22L40 1H400" fill="none" stroke="currentColor" stroke-width="1"/></svg>`;
const HUD_SCOPE = `<svg class="ts-hud-scope" viewBox="0 0 72 72" aria-hidden="true"><circle cx="36" cy="36" r="31" fill="none" stroke="currentColor" stroke-width="1" opacity="0.55"/><circle cx="36" cy="36" r="20" fill="none" stroke="currentColor" stroke-width="1" opacity="0.4"/><path d="M58 22A26 26 0 0 1 58 50" fill="none" stroke="currentColor" stroke-width="2" opacity="0.9"/><path d="M36 36H64" stroke="currentColor" stroke-width="1" opacity="0.5"/><circle cx="36" cy="36" r="3.4" fill="currentColor"/><circle cx="52" cy="36" r="1.6" fill="currentColor"/></svg>`;
const HUD_BRACKET = `<svg class="ts-hud-bracket" viewBox="0 0 300 100" preserveAspectRatio="none" aria-hidden="true"><path d="M30 2H170M2 30V72L16 86H120M200 98H300" fill="none" stroke="currentColor" stroke-width="1"/></svg>`;
const HUD_RULE = `<svg class="ts-hud-line" viewBox="0 0 400 20" preserveAspectRatio="none" aria-hidden="true"><path d="M0 19H360L378 1H400" fill="none" stroke="currentColor" stroke-width="1"/></svg>`;
const SPARK = `<svg class="ts-spark" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0l1.3 6.7L16 8l-6.7 1.3L8 16l-1.3-6.7L0 8l6.7-1.3z" fill="currentColor"/></svg>`;

let root: HTMLDivElement | null = null;
let scene: TitleScene | KethraTitleScene | null = null;

const isilthe = () => new URLSearchParams(location.search).get('title') === 'isilthe';

/**
 * The backdrop: the ship over Kethra, with or without a save. The URL flag ?title=isilthe shows the
 * astronaut by Isilthe instead (kept for later use; captures and checks).
 */
function pickBackdrop() {
  return isilthe()
    ? import('../galaxy/title/TitleScene').then((m) => ({ preload: m.preloadTitle, make: (): TitleScene | KethraTitleScene => new m.TitleScene() }))
    : import('../galaxy/title/kethraTitle').then((m) => ({ preload: m.preloadKethraTitle, make: (): TitleScene | KethraTitleScene => new m.KethraTitleScene() }));
}
let chosen: ReturnType<typeof pickBackdrop> | null = null;
let backdropStarted = false;
let revealed = false;
let revealCap = 0;
let chaptersOnReveal = false;

/** When, after the backdrop's first frame, New game's black hole readies its lens: once the ship is in. */
const PRELINK_AFTER_MS = 6000;

/** The longest the page waits for the backdrop before showing the menu without it. */
const REVEAL_CAP_MS = 9000;
let leaving = false;
let stopMusic: ((fadeSeconds?: number) => void) | null = null;
let buttons: HTMLButtonElement[] = [];
let selected: HTMLButtonElement | null = null;
const listeners: [EventTarget, string, EventListener][] = [];

function listen<K extends keyof WindowEventMap>(target: Window, type: K, fn: (e: WindowEventMap[K]) => void): void {
  target.addEventListener(type, fn as EventListener);
  listeners.push([target, type, fn as EventListener]);
}

function wordmark(): string {
  return `
    <svg class="ts-wordmark" viewBox="0 0 776 100" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="ts-metal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#ffffff"/>
          <stop offset="0.5" stop-color="#eaf6ff"/>
          <stop offset="0.53" stop-color="#bcd3e4"/>
          <stop offset="1" stop-color="#deedf9"/>
        </linearGradient>
      </defs>
      <path class="ts-glyphs" d="${WORDMARK}" fill="url(#ts-metal)"/>
    </svg>`;
}

function orbit(): { back: string; front: string } {
  // Coordinates shared with the wordmark (776 x 100): the ring is tilted, passes behind the letters on
  // its far side and in front of them on its near side, and a star of light sits at the A's foot.
  const arc = (sweep: 0 | 1) => `M-86 50A474 66 0 0 ${sweep} 862 50`;
  return {
    back: `<svg class="ts-orbit ts-orbit-back" viewBox="-110 -70 996 240" aria-hidden="true"><g transform="rotate(-8 388 50)"><path d="${arc(1)}" class="ts-orbit-line"/></g></svg>`,
    front: `<svg class="ts-orbit ts-orbit-front" viewBox="-110 -70 996 240" aria-hidden="true"><defs><linearGradient id="ts-orbit-grad" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#35bfff" stop-opacity="0"/><stop offset="0.35" stop-color="#35bfff" stop-opacity="0.55"/><stop offset="1" stop-color="#ddf6ff" stop-opacity="0.95"/></linearGradient></defs><g transform="rotate(-8 388 50)"><path d="${arc(0)}" class="ts-orbit-line"/></g><g transform="translate(774 98)"><g class="ts-flare"><circle r="7" class="ts-flare-halo"/><path d="M0-16L1.6-1.6L16 0L1.6 1.6L0 16L-1.6 1.6L-16 0L-1.6-1.6Z"/></g></g></svg>`,
  };
}

export const TitleScreen = {
  show(opts: TitleOptions): void {
    leaving = false;
    revealed = false;
    const el = document.createElement('div');
    root = el;
    el.className = 'title-screen';
    // Nothing on it can be reached until it is revealed with the backdrop.
    el.inert = true;
    const rings = orbit();
    el.innerHTML = `
      <div class="ts-fallback" aria-hidden="true"><div class="title-stars"></div><div class="title-stars far"></div></div>
      <div class="ts-scrim" aria-hidden="true"></div>
      <main class="ts-column">
        <div class="ts-kicker">${EMBLEM}<span></span></div>
        <h1 class="ts-title"><span class="visually-hidden"></span>${rings.back}${wordmark()}${rings.front}</h1>
        <p class="ts-tagline"></p>
        <nav class="ts-menu title-menu"></nav>
      </main>
      <div class="ts-hud" aria-hidden="true">
        <div class="ts-hud-track">${HUD_TOP}<span class="ts-hud-words"></span></div>
        <div class="ts-hud-place">${HUD_BRACKET}<span class="ts-hud-scope-wrap">${HUD_SCOPE}<span class="ts-hud-ping"></span></span><span class="ts-hud-place-text"><b></b><span></span><i class="ts-hud-signal"></i></span></div>
        <div class="ts-hud-end"><span class="ts-hud-end-text"></span>${SPARK}${HUD_RULE}</div>
      </div>`;
    el.querySelector('.ts-kicker span')!.textContent = t('title.kicker');
    el.querySelector('.ts-title .visually-hidden')!.textContent = t('title.name');
    el.querySelector('.ts-tagline')!.textContent = t('title.tagline');
    const words = el.querySelector('.ts-hud-words')!;
    t('title.hudTrack')
      .split('//')
      .forEach((w, i) => {
        if (i) words.appendChild(Object.assign(document.createElement('i'), { textContent: '//' }));
        words.appendChild(Object.assign(document.createElement('span'), { textContent: w.trim() }));
      });
    el.querySelector('.ts-hud-place-text b')!.textContent = t('title.hudPlace');
    el.querySelector('.ts-hud-place-text span')!.textContent = t('title.hudPlaceSub');
    el.querySelector('.ts-hud-end-text')!.textContent = t('title.hudEnd');
    el.querySelector('.ts-hud-signal')!.textContent = t('title.hudSignal');

    const menu = el.querySelector('.ts-menu')!;
    menu.setAttribute('aria-label', t('title.menuLabel'));
    PanelManager.relockPointerOnClose = false;
    buttons = [];
    const add = (key: StringKey, iconName: keyof typeof ICONS, onPick: (b: HTMLButtonElement) => void, disabledNote?: string) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'title-btn';
      // Frame (hairline, glass fill, the lit fill when selected), the icon, the label, the chevron.
      b.innerHTML =
        '<span class="tb-frame" aria-hidden="true"><span class="tb-fill"></span><span class="tb-lit"></span></span>' +
        `${icon(iconName, 'tb-icon')}<span class="tb-text"><span class="tb-label"></span></span>${icon('chevron', 'tb-chevron')}`;
      b.querySelector('.tb-label')!.textContent = t(key);
      if (disabledNote) {
        b.disabled = true;
        const note = document.createElement('span');
        note.className = 'tb-note';
        note.textContent = disabledNote;
        b.querySelector('.tb-text')!.appendChild(note);
      }
      b.addEventListener('pointerenter', () => {
        if (!b.disabled) b.focus({ preventScroll: true });
      });
      b.addEventListener('focus', () => select(b));
      b.addEventListener('click', () => {
        if (b.disabled || leaving) return;
        b.classList.remove('is-pressed');
        // Restart the press flash even on a quick second click.
        void b.offsetWidth;
        b.classList.add('is-pressed');
        onPick(b);
      });
      menu.appendChild(b);
      buttons.push(b);
      return b;
    };
    add('title.continue', 'continue', () => this.leave(opts.onContinue), opts.hasSave ? undefined : t(opts.saveState === 'unreadable' ? 'title.saveUnreadable' : 'title.noSave'));
    add('title.newGame', 'newGame', (b) => this.collapse(opts.onNewGame, b));
    add('title.chapters', 'chapters', (b) => {
      AudioSystem.playUiClick();
      ChapterSelect.open();
      returnFocusOnClose(b);
    });
    add('title.controls', 'controls', (b) => {
      AudioSystem.playUiClick();
      this.showControls(b);
    });
    add('title.settings', 'settings', (b) => {
      AudioSystem.playUiClick();
      SettingsPanel.open();
      returnFocusOnClose(b);
    });

    document.body.appendChild(el);
    // The ship-over-Kethra backdrop can end New game with its black hole: the menu is made ready to be
    // eaten now, while it is invisible (titleDevour.ts).
    if (!isilthe()) prepareDevour(el);
    // The ending's Chapters button arrives here with the list asked for; it opens with the menu.
    chaptersOnReveal = location.hash === '#chapters';
    if (chaptersOnReveal) history.replaceState(null, '', location.pathname + location.search);
    // The backdrop's code and maps start downloading now; it is built once the engine exists.
    chosen = pickBackdrop();
    void chosen.then((m) => m.preload()).catch(() => {});
    select(buttons.find((b) => !b.disabled)!, true);
    revealCap = window.setTimeout(reveal, REVEAL_CAP_MS);

    listen(window, 'pointerdown', () => {
      // Audio unlocks on this same gesture (AudioSystem.init); the title's bed starts with it.
      startTitleMusic();
    });
    listen(window, 'keydown', (e) => {
      startTitleMusic();
      if (PanelManager.isOpen || leaving || !revealed) return;
      const step = e.code === 'ArrowDown' || e.code === 'KeyS' ? 1 : e.code === 'ArrowUp' || e.code === 'KeyW' ? -1 : 0;
      if (step) {
        e.preventDefault();
        moveSelection(step);
      } else if (e.code === 'Home' || e.code === 'End') {
        e.preventDefault();
        const enabled = buttons.filter((b) => !b.disabled);
        (e.code === 'Home' ? enabled[0] : enabled[enabled.length - 1])?.focus({ preventScroll: true });
      }
    });
  },

  /**
   * Starts the 3D backdrop, once the engine exists (boot.ts calls this from its idle start-up). It is
   * prepared in the background at the playing pace, then made the engine's scene; a click that comes
   * first simply finds it not there yet, and it is dropped. Resolves once it is on screen (or given up).
   */
  async startBackdrop(engine: Engine): Promise<void> {
    if (!root || leaving || backdropStarted) return;
    backdropStarted = true;
    try {
      const { make } = await (chosen ?? pickBackdrop());
      if (!root || leaving) return;
      const next = make();
      try {
        await engine.prepareScene(next, { pacer: engine.newPacer(PACE.playing) });
      } catch (err) {
        next.dispose();
        throw err;
      }
      if (!root || leaving) {
        next.dispose();
        return;
      }
      // Its first frame is complete: the menu and the backdrop come in together (CSS, .backdrop-live).
      next.onFirstFrame = () => {
        root?.classList.add('backdrop-live');
        reveal();
        // New game's black hole links its lens once the ship has come in and the browser is idle.
        if ('prelink' in next) {
          const ship = next;
          window.setTimeout(() => {
            if ('requestIdleCallback' in window) requestIdleCallback(() => !leaving && ship.prelink(), { timeout: 3000 });
            else if (!leaving) ship.prelink();
          }, PRELINK_AFTER_MS);
        }
      };
      // Only Isilthe's backdrop sends its signal.
      if ('onSignal' in next) next.onSignal = signal;
      await engine.setScene(() => next, { prepared: true, quiet: true });
      engine.start();
      scene = next;
    } catch (err) {
      // The menu works the same without it, over its own night sky.
      console.warn('[title] the 3D backdrop is unavailable', err);
      reveal();
    }
  },

  /** Continue or New game: the backdrop and the menu leave together, then `then` runs. */
  leave(then: () => void): void {
    if (leaving || !root) return;
    leaving = true;
    const el = root;
    PanelManager.relockPointerOnClose = true;
    AudioSystem.playLaunch();
    stopMusic?.();
    stopMusic = null;
    window.clearTimeout(revealCap);
    el.classList.add('leaving');
    for (const [target, type, fn] of listeners.splice(0)) target.removeEventListener(type, fn);
    const outro = new Promise<void>((resolve) => window.setTimeout(resolve, motion.reduced ? 300 : 560));
    // The scene's own fade can't finish in a hidden tab (no frames); the timer caps the wait.
    const backdrop = scene ? Promise.race([scene.leave(), new Promise<void>((resolve) => window.setTimeout(resolve, 1200))]) : Promise.resolve();
    void Promise.all([outro, backdrop]).then(() => {
      el.remove();
      root = null;
      scene = null;
      chosen = null;
      buttons = [];
      selected = null;
      then();
    });
  },

  /**
   * New game: the black hole (galaxy/title/singularity). The backdrop's scene runs the event and reports
   * every frame; the menu is torn apart with it (titleDevour.ts) and the sound follows the same clock
   * (singularitySound.ts). It ends on black: the screen is covered (UIManager.enterVoid) before anything
   * is removed, then `then` starts the game in that dark. Without the ship-over-Kethra backdrop on
   * screen (still coming, failed, or the Isilthe one) New game leaves the usual way.
   */
  collapse(then: () => void, pressed: HTMLButtonElement): void {
    if (leaving || !root) return;
    const live = scene && 'collapse' in scene && root.classList.contains('backdrop-live') ? scene : null;
    if (!live) {
      this.leave(then);
      return;
    }
    leaving = true;
    const el = root;
    PanelManager.relockPointerOnClose = true;
    window.clearTimeout(revealCap);
    for (const [target, type, fn] of listeners.splice(0)) target.removeEventListener(type, fn);
    // The music stops dead: the quiet is the first sign.
    stopMusic?.(0.12);
    stopMusic = null;
    const sound = startSingularitySound();
    el.classList.add('collapsing');
    el.inert = true;
    document.body.classList.add('title-collapsing');
    const devour = createDevour(el, pressed, motion.reduced);
    devour.onTear = (pan, size) => sound.whoosh(pan, size);
    // A key or a click hurries it along.
    const hurry = () => live.hurry();
    window.addEventListener('keydown', hurry);
    window.addEventListener('pointerdown', hurry);
    let lastFrame = performance.now();
    const event = live.collapse({
      onFrame: (f) => {
        lastFrame = performance.now();
        devour.frame(f);
        sound.frame(f.t);
      },
      onCue: (c) => {
        sound.cue(c);
        devour.cue(c);
      },
    });
    // A hidden tab draws no frames, so the event waits with it; this only catches frames stopping in a
    // visible one (a lost GPU), so the game still starts.
    let watch = 0;
    const stalled = new Promise<void>((resolve) => {
      const check = () => {
        if (!document.hidden && performance.now() - lastFrame > 4000) resolve();
        else watch = window.setTimeout(check, 1000);
      };
      watch = window.setTimeout(check, 1000);
    });
    void Promise.race([event, stalled]).then(() => {
      window.clearTimeout(watch);
      window.removeEventListener('keydown', hurry);
      window.removeEventListener('pointerdown', hurry);
      document.body.classList.remove('title-collapsing');
      UIManager.enterVoid();
      sound.stop();
      el.remove();
      root = null;
      scene = null;
      chosen = null;
      buttons = [];
      selected = null;
      then();
    });
  },

  showControls(opener?: HTMLButtonElement): void {
    const panel = document.createElement('div');
    panel.className = 'panel title-panel';
    const h = document.createElement('h2');
    h.textContent = t('title.controls');
    panel.appendChild(h);
    const list = document.createElement('dl');
    list.className = 'controls-list';
    for (const id of BINDING_ORDER as BindingId[]) {
      const b = BINDINGS[id];
      const dt = document.createElement('dt');
      dt.textContent = b.action;
      const dd = document.createElement('dd');
      for (const k of b.keys) {
        const kbd = document.createElement('span');
        kbd.className = 'keycap';
        kbd.textContent = k;
        dd.appendChild(kbd);
      }
      list.append(dt, dd);
    }
    panel.appendChild(list);
    const note = document.createElement('p');
    note.className = 'title-panel-note';
    note.textContent = t('controls.note');
    panel.appendChild(note);
    this.closeHint(panel);
    PanelManager.open(panel, opener ? () => restoreFocus(opener) : undefined);
  },

  closeHint(panel: HTMLElement): void {
    const hint = document.createElement('div');
    hint.className = 'panel-foot';
    hint.innerHTML = '<span class="keycap">Esc</span> close';
    panel.appendChild(hint);
  },
};

/** Shows the menu (and lets it be used), with the backdrop when it has arrived; once. */
function reveal(): void {
  if (revealed || !root || leaving) return;
  revealed = true;
  window.clearTimeout(revealCap);
  root.inert = false;
  root.classList.add('revealed');
  (selected ?? buttons.find((b) => !b.disabled))?.focus({ preventScroll: true });
  if (chaptersOnReveal) {
    chaptersOnReveal = false;
    ChapterSelect.open();
    if (selected) returnFocusOnClose(selected);
  }
}

let signalTimer = 0;

/** Isilthe's signal reached the backdrop's rings: the corner scope picks it up, with a faint chirp once sound is on. */
function signal(): void {
  if (!root || !revealed || leaving || PanelManager.isOpen) return;
  const place = root.querySelector('.ts-hud-place');
  if (!place) return;
  place.classList.remove('signal');
  // Restart the one-shot animation even if the last one is still running.
  void (place as HTMLElement).offsetWidth;
  place.classList.add('signal');
  window.clearTimeout(signalTimer);
  signalTimer = window.setTimeout(() => place.classList.remove('signal'), 2600);
  if (stopMusic) AudioSystem.playSignal();
}

/** Marks one menu item as the selected one (hover and keyboard focus are the same thing here). */
function select(b: HTMLButtonElement, quiet = false): void {
  if (selected === b || b.disabled) return;
  selected?.classList.remove('is-selected');
  selected = b;
  b.classList.add('is-selected');
  if (!quiet) AudioSystem.playHover();
}

function moveSelection(step: number): void {
  const enabled = buttons.filter((b) => !b.disabled);
  if (!enabled.length) return;
  const at = selected ? enabled.indexOf(selected) : -1;
  enabled[(at + step + enabled.length) % enabled.length].focus({ preventScroll: true });
}

function restoreFocus(b: HTMLButtonElement): void {
  if (!root || leaving) return;
  b.focus({ preventScroll: true });
}

/** Settings opens through PanelManager without a close callback of its own; watch for it closing. */
function returnFocusOnClose(b: HTMLButtonElement): void {
  const poll = () => {
    if (!root || leaving) return;
    if (PanelManager.isOpen) window.setTimeout(poll, 150);
    else restoreFocus(b);
  };
  window.setTimeout(poll, 150);
}

function startTitleMusic(): void {
  if (stopMusic || leaving || !root) return;
  stopMusic = AudioSystem.startMusic('title');
  // Sound is on: the black hole's noise and reverb are made while the title waits, not at the click.
  if (!isilthe()) prepareSingularitySound();
}
