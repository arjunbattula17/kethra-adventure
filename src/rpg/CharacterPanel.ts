import type { AttributeKey } from '../core/GameState';
import { gameState } from '../core/GameState';
import { bus } from '../core/EventBus';
import { PanelManager } from '../ui/PanelManager';
import { UIManager } from '../ui/UIManager';

const ATTRIBUTE_INFO: Record<AttributeKey, { label: string; description: string }> = {
  insight: { label: 'Insight', description: 'Connects disparate clues into new conclusions on the evidence board.' },
  archaeology: { label: 'Archaeology', description: 'Reveals the true meaning of artifacts, ruins, and symbol systems.' },
  engineering: { label: 'Engineering', description: 'Understands and safely manipulates ancient and ship mechanisms.' },
  traversal: { label: 'Traversal', description: 'Opens riskier climbs, ledges, and shortcuts through the environment.' },
  persuasion: { label: 'Persuasion', description: 'Unlocks additional dialogue options and hidden information from NPCs.' },
  perception: { label: 'Perception', description: 'Reveals hidden objects, clues, and environmental anomalies.' },
};

class CharacterPanelImpl {
  private keyHandler = (e: KeyboardEvent) => {
    if (e.code === 'Tab') {
      e.preventDefault();
      if (!PanelManager.isOpen) this.open();
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
          <div class="name">${info.label} <span style="color:var(--accent)">${value}</span></div>
          <div class="status" style="margin-top:2px;">${info.description}</div>
        </div>`;
      panel.appendChild(row);
    }

    const hint = document.createElement('div');
    hint.className = 'close-hint';
    hint.textContent = 'TAB or ESC to close';
    panel.appendChild(hint);

    PanelManager.open(panel);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.keyHandler);
  }
}

export const CharacterPanel = new CharacterPanelImpl();
