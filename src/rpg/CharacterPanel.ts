import type { AttributeKey } from '../core/GameState';
import { gameState } from '../core/GameState';
import { bus } from '../core/EventBus';
import { PanelManager } from '../ui/PanelManager';
import { UIManager } from '../ui/UIManager';
import { SaveSystem } from '../core/SaveSystem';

const ATTRIBUTE_INFO: Record<AttributeKey, { label: string; description: string }> = {
  insight: { label: 'Insight', description: 'Connects disparate clues into new conclusions on the evidence board.' },
  archaeology: { label: 'Archaeology', description: 'Reveals the true meaning of artifacts, ruins, and symbol systems.' },
  engineering: { label: 'Engineering', description: 'Understands and safely manipulates ancient and ship mechanisms.' },
  traversal: { label: 'Traversal', description: 'Opens riskier climbs, ledges, and shortcuts through the environment.' },
  persuasion: { label: 'Persuasion', description: 'Unlocks additional dialogue options and hidden information from NPCs.' },
  perception: { label: 'Perception', description: 'Reveals hidden objects, clues, and environmental anomalies.' },
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
      e.preventDefault();
      // The panel's own close-hint reads "TAB or ESC to close" -- Tab was only ever wired to
      // open it, never to close it back (Escape happened to work only because PanelManager's
      // own global listener handles it independently of this handler).
      // Checking activeId (not just isOpen) so Tab switches TO this panel from a different one
      // (e.g. Settings) instead of just closing whatever else happens to be open.
      if (PanelManager.isOpen && PanelManager.activeId === 'character') PanelManager.close();
      else this.open();
    }
  };

  init(): void {
    window.addEventListener('keydown', this.keyHandler);
    bus.on('level:up', (level: number) => UIManager.toast(`Level up! You are now level ${level}. Skill point available.`));
  }

  open(): void {
    this.render();
  }

  private render(): void {
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.style.width = '520px';

    const heading = document.createElement('h2');
    heading.textContent = `Explorer — Level ${gameState.data.level}`;
    panel.appendChild(heading);

    const sub = document.createElement('div');
    sub.className = 'subtitle';
    sub.textContent = `${gameState.data.xp} / ${gameState.data.level * 100} XP to next level${gameState.data.unspentPoints > 0 ? ` — ${gameState.data.unspentPoints} unspent point(s)` : ''}`;
    panel.appendChild(sub);

    const keys = Object.keys(ATTRIBUTE_INFO) as AttributeKey[];
    for (const key of keys) {
      const info = ATTRIBUTE_INFO[key];
      const value = gameState.data.attributes[key];
      const row = document.createElement('div');
      row.className = 'repair-row';
      row.style.alignItems = 'flex-start';
      row.innerHTML = `
        <div style="flex:1;">
          <div class="name"><span class="hud-icon">${ATTRIBUTE_ICON[key]}</span>${info.label} <span style="color:var(--accent)">${value}</span></div>
          <div class="status" style="margin-top:2px;">${info.description}</div>
        </div>`;
      panel.appendChild(row);
    }

    const saveRow = document.createElement('div');
    saveRow.style.cssText = 'display:flex; gap:10px; margin-top:18px;';
    const saveBtn = document.createElement('button');
    saveBtn.className = 'text-btn';
    saveBtn.textContent = 'Save Progress';
    saveBtn.onclick = () => {
      SaveSystem.save();
      UIManager.toast('Progress saved.');
    };
    const loadBtn = document.createElement('button');
    loadBtn.className = 'text-btn';
    loadBtn.textContent = 'Load Last Save';
    loadBtn.disabled = !SaveSystem.hasSave();
    loadBtn.onclick = () => {
      if (SaveSystem.load()) {
        UIManager.toast('Save loaded.');
        this.render();
      }
    };
    saveRow.appendChild(saveBtn);
    saveRow.appendChild(loadBtn);
    panel.appendChild(saveRow);

    const hint = document.createElement('div');
    hint.className = 'close-hint';
    hint.textContent = 'TAB or ESC to close';
    panel.appendChild(hint);

    PanelManager.open(panel, undefined, undefined, 'character');
  }

  dispose(): void {
    window.removeEventListener('keydown', this.keyHandler);
  }
}

export const CharacterPanel = new CharacterPanelImpl();
