import { t } from '../content/strings';
import type { StringKey } from '../content/strings';
import { PanelManager } from './PanelManager';
import { SettingsPanel } from './SettingsPanel';
import { AudioSystem } from '../audio/AudioSystem';
import { BINDINGS, BINDING_ORDER } from '../content/controls';
import type { BindingId } from '../content/controls';
import type { Engine } from '../core/Engine';
import { PACE } from '../core/prepare';
import { motion } from '../motion';
import type { TitleScene } from '../galaxy/title/TitleScene';

/**
 * The title screen: the first thing a judge sees. The menu is plain DOM and CSS, so it is up and
 * clickable at once while nothing 3D has loaded, and the first click on it is what unlocks audio
 * (browsers block sound until the page gets a gesture).
 *
 * Behind it, once the engine exists (boot.ts), runs the 3D backdrop (galaxy/title/TitleScene.ts):
 * sunrise over Kethra's limb, inside the belt. Until its first frame the menu shows a starfield of its
 * own, so a slow machine sees a calm night sky, never a blank. The menu's opening (kicker, wordmark,
 * then each button) plays on its own clock from the moment the page shows; a key or a click finishes
 * it at once, and nothing in it blocks input. The menu's ornamental loops (the wordmark's light sweep,
 * the orbit's comet, light running along the selected button) wait for `ts-live`, set once the
 * backdrop has settled, so they never repaint while the engine is starting.
 *
 * Continue / New game / Controls / Settings. Continue is shown but disabled when there is no save to
 * go back to, with the reason under it. Controls opens in the shared panel system and prints
 * src/content/controls.ts, the same table the player code reads its keys from. Arrow keys (or W/S)
 * move through the menu; Enter or Space picks. The credits, including the attribution the CC BY assets
 * require, roll at the end of the game (EndingScene).
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
 * nonzero fill (the R's counter winds the other way), so it can also serve as a clip path. */
const WORDMARK =
  'M0 0H22V100H0Z M22 40L80 0H116L22 64Z M46 47.7L70 31.4L118 100H84Z ' +
  'M142 0H238V20H164V40H226V59H164V80H238V100H142Z ' +
  'M262 0H366V20H325V100H303V20H262Z ' +
  'M390 0H412V40H472V0H494V100H472V59H412V100H390Z ' +
  'M518 0H596Q626 0 626 30V33Q626 62 596 62H584L624 100H594L556 62H540V100H518Z M540 20V42H594Q604 42 604 33V30Q604 20 594 20Z ' +
  'M650 100L702 0H724L776 100H750L713 26L676 100Z';

const ICONS: Record<'continue' | 'newGame' | 'controls' | 'settings' | 'chevron', string> = {
  continue: '<path d="M8 5.2v13.6L18.8 12z" fill="currentColor"/>',
  newGame:
    '<path d="M7.6 8h8.8a4.4 4.4 0 0 1 4.2 3.1l1.1 3.8a2.5 2.5 0 0 1-4.3 2.3L15.6 15H8.4l-1.8 2.2a2.5 2.5 0 0 1-4.3-2.3l1.1-3.8A4.4 4.4 0 0 1 7.6 8z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>' +
    '<path d="M7.6 10.4v3.2M6 12h3.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="15.6" cy="11" r="1" fill="currentColor"/><circle cx="17.6" cy="13" r="1" fill="currentColor"/>',
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

/** The kicker's emblem: a compass star in a ring. */
const EMBLEM = `<svg class="ts-emblem" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="15.5" fill="none" stroke="currentColor" stroke-width="1.4" opacity="0.8"/><path d="M24 3l2.6 18.4L45 24l-18.4 2.6L24 45l-2.6-18.4L3 24l18.4-2.6z" fill="currentColor"/></svg>`;

let root: HTMLDivElement | null = null;
let scene: TitleScene | null = null;
let backdropStarted = false;
let leaving = false;
let revealDone = false;
let stopMusic: (() => void) | null = null;
let buttons: HTMLButtonElement[] = [];
let selected: HTMLButtonElement | null = null;
const listeners: [EventTarget, string, EventListener][] = [];

function listen<K extends keyof WindowEventMap>(target: Window, type: K, fn: (e: WindowEventMap[K]) => void): void {
  target.addEventListener(type, fn as EventListener);
  listeners.push([target, type, fn as EventListener]);
}

function wordmark(): string {
  // Two copies: the lit letters, and a clipped band of light that sweeps across them now and then.
  return `
    <svg class="ts-wordmark" viewBox="0 0 776 100" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="ts-metal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#ffffff"/>
          <stop offset="0.5" stop-color="#eaf6ff"/>
          <stop offset="0.53" stop-color="#bcd3e4"/>
          <stop offset="1" stop-color="#deedf9"/>
        </linearGradient>
        <linearGradient id="ts-sweep-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#ddf6ff" stop-opacity="0"/>
          <stop offset="0.5" stop-color="#ffffff" stop-opacity="0.95"/>
          <stop offset="1" stop-color="#ddf6ff" stop-opacity="0"/>
        </linearGradient>
        <clipPath id="ts-letters"><path d="${WORDMARK}"/></clipPath>
      </defs>
      <path class="ts-glyphs" d="${WORDMARK}" fill="url(#ts-metal)"/>
      <g clip-path="url(#ts-letters)"><rect class="ts-sweep" x="-200" y="-20" width="150" height="140" fill="url(#ts-sweep-grad)" transform="skewX(-18)"/></g>
    </svg>`;
}

function orbit(): { back: string; front: string } {
  // Coordinates shared with the wordmark (776 x 100): the ring is tilted, passes behind the letters on
  // its far side and in front of them on its near side, where a point of light travels it.
  const arc = (sweep: 0 | 1) => `M-86 50A474 66 0 0 ${sweep} 862 50`;
  return {
    back: `<svg class="ts-orbit ts-orbit-back" viewBox="-110 -70 996 240" aria-hidden="true"><g transform="rotate(-8 388 50)"><path d="${arc(1)}" class="ts-orbit-line"/></g></svg>`,
    front: `<svg class="ts-orbit ts-orbit-front" viewBox="-110 -70 996 240" aria-hidden="true"><defs><linearGradient id="ts-orbit-grad" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#35bfff" stop-opacity="0"/><stop offset="0.35" stop-color="#35bfff" stop-opacity="0.55"/><stop offset="1" stop-color="#ddf6ff" stop-opacity="0.95"/></linearGradient></defs><g transform="rotate(-8 388 50)"><path d="${arc(0)}" class="ts-orbit-line"/><path d="${arc(0)}" class="ts-comet ts-comet-wide" pathLength="1000"/><path d="${arc(0)}" class="ts-comet" pathLength="1000"/></g><g transform="translate(774 98)"><g class="ts-flare"><circle r="7" class="ts-flare-halo"/><path d="M0-16L1.6-1.6L16 0L1.6 1.6L0 16L-1.6 1.6L-16 0L-1.6-1.6Z"/></g></g></svg>`,
  };
}

export const TitleScreen = {
  show(opts: TitleOptions): void {
    leaving = false;
    revealDone = false;
    const el = document.createElement('div');
    root = el;
    el.className = 'title-screen';
    const rings = orbit();
    el.innerHTML = `
      <div class="ts-fallback" aria-hidden="true"><div class="title-stars"></div><div class="title-stars far"></div></div>
      <div class="ts-scrim" aria-hidden="true"></div>
      <main class="ts-column">
        <div class="ts-kicker ts-reveal">${EMBLEM}<span></span></div>
        <h1 class="ts-title ts-reveal"><span class="visually-hidden"></span>${rings.back}${wordmark()}${rings.front}</h1>
        <nav class="ts-menu title-menu"></nav>
      </main>`;
    el.querySelector('.ts-kicker span')!.textContent = t('title.kicker');
    el.querySelector('.ts-title .visually-hidden')!.textContent = t('title.name');

    const menu = el.querySelector('.ts-menu')!;
    menu.setAttribute('aria-label', t('title.menuLabel'));
    PanelManager.relockPointerOnClose = false;
    buttons = [];
    const add = (key: StringKey, iconName: keyof typeof ICONS, onPick: (b: HTMLButtonElement) => void, disabledNote?: string) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'title-btn';
      b.style.setProperty('--i', String(buttons.length));
      // Frame (hairline, glass fill, lit fill, top highlight, two runs of light, a sheen), the icon in its
      // socket, the label, three signal ticks and the chevron, and the glowing caps at both points.
      b.innerHTML =
        '<span class="tb-frame" aria-hidden="true"><span class="tb-fill"></span><span class="tb-lit"></span><span class="tb-shine"></span><span class="tb-flow"></span><span class="tb-flow tb-flow-low"></span><span class="tb-sheen"></span></span>' +
        `<span class="tb-socket" aria-hidden="true">${icon(iconName, 'tb-icon')}</span><span class="tb-text"><span class="tb-label"></span></span>` +
        `<span class="tb-ticks" aria-hidden="true"><i></i><i></i><i></i></span>${icon('chevron', 'tb-chevron')}<span class="tb-cap tb-cap-l" aria-hidden="true"></span><span class="tb-cap tb-cap-r" aria-hidden="true"></span>`;
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
    add('title.newGame', 'newGame', () => this.leave(opts.onNewGame));
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
    // The backdrop's code and maps start downloading now; it is built once the engine exists.
    void import('../galaxy/title/TitleScene').then((m) => m.preloadTitle()).catch(() => {});
    const first = buttons.find((b) => !b.disabled)!;
    select(first, true);
    first.focus({ preventScroll: true });

    // The opening ends on its own once the last element is in (~2 s), or at once on a key or click.
    window.setTimeout(() => (revealDone = true), 2600);
    // The loops start once the backdrop has settled (startBackdrop), or after 6 s without one.
    window.setTimeout(goLive, 6000);
    const skip = () => {
      if (revealDone) return;
      revealDone = true;
      root?.classList.add('ts-skip');
      scene?.skipReveal();
    };
    listen(window, 'pointerdown', () => {
      skip();
      // Audio unlocks on this same gesture (AudioSystem.init); the title's bed starts with it.
      startTitleMusic();
    });
    listen(window, 'keydown', (e) => {
      skip();
      startTitleMusic();
      if (PanelManager.isOpen || leaving) return;
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
    listen(window, 'pointermove', (e) => {
      scene?.setPointer((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    });
  },

  /**
   * Starts the 3D backdrop, once the engine exists (boot.ts calls this from its idle start-up). It is
   * prepared in the background at the playing pace, then made the engine's scene; a click that comes
   * first simply finds it not there yet, and it is dropped.
   */
  async startBackdrop(engine: Engine): Promise<void> {
    if (!root || leaving || backdropStarted) return;
    backdropStarted = true;
    try {
      const { TitleScene } = await import('../galaxy/title/TitleScene');
      if (!root || leaving) return;
      const next = new TitleScene();
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
      next.onFirstFrame = () => {
        root?.classList.add('backdrop-live');
        window.setTimeout(goLive, 1500);
      };
      await engine.setScene(() => next, { prepared: true, quiet: true });
      engine.start();
      scene = next;
    } catch (err) {
      // The menu works the same without it, over its own starfield.
      console.warn('[title] the 3D backdrop is unavailable', err);
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
    el.classList.add('leaving');
    for (const [target, type, fn] of listeners.splice(0)) target.removeEventListener(type, fn);
    const outro = new Promise<void>((resolve) => window.setTimeout(resolve, motion.reduced ? 300 : 560));
    // The scene's own fade can't finish in a hidden tab (no frames); the timer caps the wait.
    const backdrop = scene ? Promise.race([scene.leave(), new Promise<void>((resolve) => window.setTimeout(resolve, 1200))]) : Promise.resolve();
    void Promise.all([outro, backdrop]).then(() => {
      el.remove();
      root = null;
      scene = null;
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

/** Marks one menu item as the selected one (hover and keyboard focus are the same thing here). */
function select(b: HTMLButtonElement, quiet = false): void {
  if (selected === b || b.disabled) return;
  selected?.classList.remove('is-selected');
  selected = b;
  b.classList.add('is-selected');
  if (!quiet) scene?.nudge();
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

function goLive(): void {
  root?.classList.add('ts-live');
}

function startTitleMusic(): void {
  if (stopMusic || leaving || !root) return;
  stopMusic = AudioSystem.startMusic('title');
}
