import { gameState } from '../../core/GameState';
import { UIManager } from '../../ui/UIManager';
import { PanelManager } from '../../ui/PanelManager';
import { KETHRA_TRUE_SEQUENCE } from './kethraLore';
import { AudioSystem } from '../../audio/AudioSystem';

const COLOR_INFO: Record<string, { label: string; hex: string }> = {
  azure: { label: 'Azure', hex: '#4f8fd9' },
  verdant: { label: 'Verdant', hex: '#4fd98a' },
  amber: { label: 'Amber', hex: '#d9a441' },
  crimson: { label: 'Crimson', hex: '#d9524f' },
  violet: { label: 'Violet', hex: '#a04fd9' },
};

const PALETTE = Array.from(new Set([...KETHRA_TRUE_SEQUENCE, 'crimson', 'violet'])).slice(0, 5);

export class KethraMechanismPuzzle {
  private inputIndex = 0;
  onSolved: () => void = () => {};

  open(): void {
    if (gameState.hasFlag('kethra_mechanism_solved')) {
      UIManager.toast('The Cistern Heart is already resonating steadily.');
      return;
    }
    const fragmentsRead = ['kethra_fragment_1_read', 'kethra_fragment_2_read', 'kethra_fragment_3_read'].filter(
      (flag) => gameState.hasFlag(flag),
    ).length;
    if (fragmentsRead === 0) {
      UIManager.toast('The console is inert. Perhaps the old inscriptions around the terraces hold the sequence.');
      return;
    }
    this.inputIndex = 0;
    this.render();
  }

  private render(): void {
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.id = 'power-puzzle-panel';

    const heading = document.createElement('h2');
    heading.textContent = 'The Cistern Heart';
    panel.appendChild(heading);

    const sub = document.createElement('div');
    sub.className = 'subtitle';
    sub.textContent = 'Set the resonance crystals to the sequence recorded in the old inscriptions.';
    panel.appendChild(sub);

    const indicator = document.createElement('div');
    indicator.id = 'threat-indicator';
    indicator.textContent = `Sequence: ${this.inputIndex}/${KETHRA_TRUE_SEQUENCE.length} set`;
    panel.appendChild(indicator);

    const nodesEl = document.createElement('div');
    nodesEl.id = 'power-nodes';
    for (const color of PALETTE) {
      const info = COLOR_INFO[color] ?? { label: color, hex: '#888888' };
      const el = document.createElement('div');
      el.className = 'power-node';
      el.innerHTML = `<div class="icon" style="color:${info.hex}">◈</div><div class="name">${info.label}</div>`;
      el.onclick = () => this.handleInput(color);
      nodesEl.appendChild(el);
    }
    panel.appendChild(nodesEl);

    const hint = document.createElement('div');
    hint.className = 'close-hint';
    hint.textContent = 'ESC to close';
    panel.appendChild(hint);

    PanelManager.open(panel);
  }

  private handleInput(color: string): void {
    if (color === KETHRA_TRUE_SEQUENCE[this.inputIndex]) {
      this.inputIndex++;
      if (this.inputIndex >= KETHRA_TRUE_SEQUENCE.length) {
        this.solve();
      } else {
        this.render();
      }
    } else {
      AudioSystem.playError();
      UIManager.toast('The crystal flickers and dims — that resonance is wrong.');
      this.inputIndex = 0;
      this.render();
    }
  }

  private solve(): void {
    PanelManager.close();
    gameState.setFlag('kethra_mechanism_solved');
    gameState.addResource('resonant_crystal', 3);
    gameState.addAttributeXp('archaeology', 2);
    AudioSystem.playChime();
    UIManager.toast('The Cistern Heart wakes. Water and light flow through the terraces once more.');
    this.onSolved();
  }
}
