import type { AttributeKey } from '../core/GameState';
import { gameState } from '../core/GameState';
import { bus } from '../core/EventBus';
import { PanelManager } from '../ui/PanelManager';
import { UIManager } from '../ui/UIManager';
import { SaveSystem } from '../core/SaveSystem';
import { AudioSystem } from '../audio/AudioSystem';

// Each description names where the stat actually matters, so the sheet teaches the player what a
// point buys. Keep these true to the code: every line below is checked somewhere in a level.
const ATTRIBUTE_INFO: Record<AttributeKey, { label: string; description: string }> = {
  insight: { label: 'Insight', description: 'Puts what you have learned into words: deeper questions and better offers in conversation.' },
  archaeology: { label: 'Archaeology', description: 'Reads Kindling script: boundary glyphs, carvings, the plate under the Anchorage.' },
  engineering: { label: 'Engineering', description: 'Reads machines: the load stamped on a breaker, a fair trade for a repair.' },
  traversal: { label: 'Traversal', description: 'Climbs and squeezes: tight ducts and steep shortcuts.' },
  persuasion: { label: 'Persuasion', description: 'Finds the words: questions and offers people won’t hear from a stranger.' },
  perception: { label: 'Perception', description: 'Notices things: the first colour of a rite, circuits that switched themselves on.' },
};

const ATTRIBUTE_ICON: Record<AttributeKey, string> = {
  insight: `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="3" cy="4" r="1.6"/><circle cx="13" cy="4" r="1.6"/><circle cx="8" cy="12" r="1.6"/><path d="M4.3 5 7 10.8M11.7 5 9 10.8"/></svg>`,
  archaeology: `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M2.5 6 5 2.5h6L13.5 6 8 14 2.5 6Z"/><path d="M2.5 6h11"/></svg>`,
  engineering: `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="8" cy="8" r="2.3"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/></svg>`,
  traversal: `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M2 13 6 6l3 3.5L13 3"/></svg>`,
  persuasion: `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M2.5 3.5h11v7h-6L4 13v-2.5H2.5v-7Z"/></svg>`,
  perception: `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z"/><circle cx="8" cy="8" r="1.8"/></svg>`,
};

class CharacterPanelImpl {
  private keyHandler = (e: KeyboardEvent) => {
    if (e.code === 'Tab') {
      // Inside another panel or on the title, Tab is the keyboard's way between buttons: leave it be.
      if (document.body.classList.contains('title-open')) return;
      if (PanelManager.isOpen && PanelManager.activeId !== 'character') return;
      e.preventDefault();
      // Checking activeId (not just isOpen) so Tab switches TO this panel from a different one
      // (e.g. Settings) instead of just closing whatever else happens to be open.
      if (PanelManager.isOpen && PanelManager.activeId === 'character') PanelManager.close();
      else this.open();
    }
  };

  init(): void {
    window.addEventListener('keydown', this.keyHandler);
    // Refresh an open sheet when stats change underneath it.
    bus.on('attribute:changed', () => {
      if (PanelManager.isOpen && PanelManager.activeId === 'character') this.render();
    });
  }

  open(): void {
    this.render();
  }

  private render(): void {
    const d = gameState.data;
    const panel = document.createElement('div');
    panel.className = 'panel character-panel';

    panel.innerHTML = `<div class="eyebrow">Survey lead</div><h2>Level ${d.level}</h2>
      <div class="char-xp"><span class="bar"><span class="bar-fill" style="transform:scaleX(${Math.min(1, d.xp / (d.level * 100))})"></span></span>
      <span>${d.xp} / ${d.level * 100} XP</span></div>`;
    if (d.unspentPoints > 0) {
      const note = document.createElement('p');
      note.className = 'char-points';
      note.textContent = `${d.unspentPoints} skill point${d.unspentPoints > 1 ? 's' : ''} to spend. Using a skill also raises it.`;
      panel.appendChild(note);
    } else {
      const note = document.createElement('p');
      note.className = 'subtitle';
      note.textContent = 'Skills grow as you use them, and each level brings a point to spend.';
      panel.appendChild(note);
    }

    const list = document.createElement('div');
    list.className = 'char-stats';
    for (const key of Object.keys(ATTRIBUTE_INFO) as AttributeKey[]) {
      const info = ATTRIBUTE_INFO[key];
      const row = document.createElement('div');
      row.className = 'char-stat';
      row.innerHTML = `<span class="hud-icon">${ATTRIBUTE_ICON[key]}</span>
        <div class="char-stat-body"><div class="char-stat-name">${info.label}</div><div class="char-stat-desc">${info.description}</div></div>
        <div class="char-stat-value">${d.attributes[key]}</div>`;
      if (d.unspentPoints > 0) {
        const plus = document.createElement('button');
        plus.className = 'btn secondary';
        plus.textContent = '+1';
        plus.setAttribute('aria-label', `Spend a point on ${info.label}`);
        plus.onmouseenter = () => AudioSystem.playHover();
        plus.onclick = () => {
          if (gameState.spendPoint(key)) {
            AudioSystem.playCollect();
            UIManager.toast(`${info.label} is now ${gameState.data.attributes[key]}.`, 'learn');
          }
        };
        row.appendChild(plus);
      }
      list.appendChild(row);
    }
    panel.appendChild(list);

    const actions = document.createElement('div');
    actions.className = 'char-actions';
    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn secondary';
    saveBtn.textContent = 'Save now';
    saveBtn.onclick = () => {
      SaveSystem.save();
      AudioSystem.playConfirm();
      UIManager.toast('Progress saved. The game also saves on its own at every milestone.');
    };
    actions.appendChild(saveBtn);
    panel.appendChild(actions);

    const hint = document.createElement('div');
    hint.className = 'panel-foot';
    hint.innerHTML = '<span class="keycap">Tab</span> or <span class="keycap" style="margin-left:.5em">Esc</span> close';
    panel.appendChild(hint);

    if (PanelManager.isOpen && PanelManager.activeId === 'character') PanelManager.setContent(panel);
    else PanelManager.open(panel, undefined, undefined, 'character');
  }

  dispose(): void {
    window.removeEventListener('keydown', this.keyHandler);
  }
}

export const CharacterPanel = new CharacterPanelImpl();
