import { PanelManager } from './PanelManager';
import { AudioSystem } from '../audio/AudioSystem';
import { SaveSystem } from '../core/SaveSystem';
import { Chapters, CHAPTERS } from '../core/chapters';
import type { ChapterId } from '../core/chapters';
import { t } from '../content/strings';

/**
 * The chapter list, opened from the title and from the ending. Choosing one reboots the page with
 * ?chapter=<id> (boot.ts), the same way New Game reboots: the game starts from a clean state.
 * With a journey saved, the first press only arms the row, since starting a chapter replaces it.
 */
export const ChapterSelect = {
  open(): void {
    const panel = document.createElement('div');
    panel.className = 'panel title-panel chapter-select';
    const h = document.createElement('h2');
    h.textContent = t('title.chapters');
    const sub = document.createElement('p');
    sub.className = 'subtitle';
    const hasSave = SaveSystem.hasSave();
    sub.textContent = t(hasSave ? 'chapters.note.replace' : 'chapters.note');
    panel.append(h, sub);

    const list = document.createElement('div');
    list.className = 'chapter-list';
    let armed: ChapterId | null = null;
    for (const chapter of CHAPTERS.filter((c) => Chapters.offered(c.id))) {
      const row = document.createElement('button');
      row.className = 'chapter-row';
      const number = document.createElement('span');
      number.className = 'chapter-number num';
      number.textContent = String(chapter.number);
      const body = document.createElement('span');
      body.className = 'chapter-body';
      const name = document.createElement('span');
      name.className = 'chapter-name';
      name.textContent = chapter.title;
      const line = document.createElement('span');
      line.className = 'chapter-desc';
      line.textContent = chapter.line;
      const from = document.createElement('span');
      from.className = 'chapter-from';
      const fromText = chapter.id === 'wren' ? t('chapters.from.start') : t(Chapters.hasOwn(chapter.id) ? 'chapters.from.own' : 'chapters.from.standIn');
      from.textContent = fromText;
      body.append(name, line, from);
      row.append(number, body);
      row.onmouseenter = () => AudioSystem.playHover();
      row.onclick = () => {
        if (hasSave && armed !== chapter.id) {
          armed = chapter.id;
          AudioSystem.playUiClick();
          for (const other of list.querySelectorAll('.chapter-row')) other.classList.remove('armed');
          row.classList.add('armed');
          for (const other of list.querySelectorAll('.chapter-from')) (other as HTMLElement).textContent = (other as HTMLElement).dataset.text ?? '';
          from.textContent = t('chapters.confirm');
          return;
        }
        AudioSystem.playConfirm();
        location.search = `?chapter=${chapter.id}`;
      };
      from.dataset.text = fromText;
      list.appendChild(row);
    }
    panel.appendChild(list);
    // A held Enter repeats on the focused row: the press that opened the list would arm a chapter
    // and then confirm it, replacing the saved journey.
    list.addEventListener('keydown', (e) => {
      if (e.repeat && (e.key === 'Enter' || e.key === ' ')) e.preventDefault();
    });

    const foot = document.createElement('div');
    foot.className = 'panel-foot';
    foot.innerHTML = '<span class="keycap">Esc</span> close';
    panel.appendChild(foot);
    PanelManager.open(panel, undefined, undefined, 'chapters');
    (list.querySelector('.chapter-row') as HTMLButtonElement).focus();
  },
};
