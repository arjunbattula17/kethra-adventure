import { t } from '../content/strings';
import type { StringKey } from '../content/strings';
import { PanelManager } from './PanelManager';
import { SettingsPanel } from './SettingsPanel';
import { AudioSystem } from '../audio/AudioSystem';

/**
 * The title screen: the first thing a judge sees. Plain DOM and CSS, so it appears instantly while
 * nothing 3D has loaded yet, and the first click on it is what unlocks audio (browsers block sound
 * until the page gets a gesture).
 *
 * Continue / New Game / Controls / Credits / Settings. Controls and Credits open in the shared
 * panel system; the controls list is the one source for every key the game uses (keep it in step
 * with the code, see README.md), and Credits carries the attribution the CC BY assets require.
 */

const CONTROLS: ReadonlyArray<readonly [StringKey, string[]]> = [
  ['controls.look', ['Mouse']],
  ['controls.move', ['W', 'A', 'S', 'D']],
  ['controls.sprint', ['Shift']],
  ['controls.jump', ['Space']],
  ['controls.crouch', ['C']],
  ['controls.interact', ['E']],
  ['controls.character', ['Tab']],
  ['controls.settings', ['O']],
  ['controls.close', ['Esc']],
  ['controls.skip', ['Space', 'Enter']],
];

const CREDIT_KEYS: StringKey[] = [
  'credits.freighter',
  'credits.planets',
  'credits.kits',
  'credits.textures',
  'credits.font',
  'credits.three',
  'credits.original',
];

interface TitleOptions {
  hasSave: boolean;
  onContinue: () => void;
  onNewGame: () => void;
}

export const TitleScreen = {
  show(opts: TitleOptions): void {
    const root = document.createElement('div');
    root.className = 'title-screen';
    root.innerHTML = `
      <div class="title-stars"></div>
      <div class="title-stars far"></div>
      <div class="title-glow"></div>
      <div class="title-planet"></div>
      <div class="title-inner">
        <div class="title-kicker"></div>
        <h1 class="title-name"></h1>
        <div class="title-rule"></div>
        <p class="title-tagline"></p>
        <nav class="title-menu"></nav>
      </div>
      <div class="title-foot"></div>`;
    // Key art: Kethra itself, from the same surface map the 3D planet and the chart use.
    (root.querySelector('.title-planet') as HTMLDivElement).style.backgroundImage = `url(${import.meta.env.BASE_URL}textures/planets/kethra_day.jpg)`;
    root.querySelector('.title-kicker')!.textContent = t('title.kicker');
    root.querySelector('.title-name')!.textContent = t('title.name');
    root.querySelector('.title-tagline')!.textContent = t('title.tagline');
    root.querySelector('.title-foot')!.textContent = t('title.foot');

    const menu = root.querySelector('.title-menu')!;
    PanelManager.relockPointerOnClose = false;
    const close = (then: () => void) => {
      PanelManager.relockPointerOnClose = true;
      root.classList.add('leaving');
      window.setTimeout(() => {
        root.remove();
        then();
      }, 450);
    };
    const add = (key: StringKey, primary: boolean, onClick: () => void) => {
      const b = document.createElement('button');
      b.className = `title-btn${primary ? ' primary' : ''}`;
      b.textContent = t(key);
      b.onclick = () => {
        AudioSystem.playUiClick();
        onClick();
      };
      menu.appendChild(b);
      return b;
    };
    if (opts.hasSave) add('title.continue', true, () => close(opts.onContinue));
    add('title.newGame', !opts.hasSave, () => close(opts.onNewGame));
    add('title.controls', false, () => this.showControls());
    add('title.credits', false, () => this.showCredits());
    add('title.settings', false, () => SettingsPanel.open());

    document.body.appendChild(root);
    (menu.querySelector('.title-btn') as HTMLButtonElement | null)?.focus();
  },

  showControls(): void {
    const panel = document.createElement('div');
    panel.className = 'panel title-panel';
    const h = document.createElement('h2');
    h.textContent = t('title.controls');
    panel.appendChild(h);
    const list = document.createElement('dl');
    list.className = 'controls-list';
    for (const [key, keys] of CONTROLS) {
      const dt = document.createElement('dt');
      dt.textContent = t(key);
      const dd = document.createElement('dd');
      for (const k of keys) {
        const kbd = document.createElement('kbd');
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
    PanelManager.open(panel);
  },

  showCredits(): void {
    const panel = document.createElement('div');
    panel.className = 'panel title-panel';
    const h = document.createElement('h2');
    h.textContent = t('title.credits');
    panel.appendChild(h);
    for (const key of CREDIT_KEYS) {
      const p = document.createElement('p');
      p.className = 'credit-line';
      p.textContent = t(key);
      panel.appendChild(p);
    }
    this.closeHint(panel);
    PanelManager.open(panel);
  },

  closeHint(panel: HTMLElement): void {
    const hint = document.createElement('div');
    hint.className = 'close-hint';
    hint.textContent = t('title.closeHint');
    panel.appendChild(hint);
  },
};
