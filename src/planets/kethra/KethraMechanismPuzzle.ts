import { gameState } from '../../core/GameState';
import { UIManager } from '../../ui/UIManager';
import { PanelManager } from '../../ui/PanelManager';
import { KETHRA_TRUE_SEQUENCE, KETHRA_RITUAL_SEQUENCE } from './kethraLore';
import { AudioSystem } from '../../audio/AudioSystem';
import { drawRiteGlyph, RITE } from './grove';

// Each colour also has its own glyph shape (drawn by grove.ts), so the Rite can be sung without
// telling colours apart (BACKLOG B-11). The two decoys have glyphs of their own.
const COLOR_INFO: Record<string, { label: string; hex: string }> = {
  azure: { label: 'Azure', hex: `#${RITE.azure.toString(16)}` },
  verdant: { label: 'Verdant', hex: `#${RITE.verdant.toString(16)}` },
  amber: { label: 'Amber', hex: `#${RITE.amber.toString(16)}` },
  crimson: { label: 'Ember', hex: '#e07a6e' },
  violet: { label: 'Dusk', hex: '#b9a6e8' },
};

function glyphCanvas(color: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 112;
  c.height = 112;
  const ctx = c.getContext('2d')!;
  ctx.strokeStyle = COLOR_INFO[color]?.hex ?? '#888';
  if (color === 'azure' || color === 'amber' || color === 'verdant') {
    drawRiteGlyph(ctx, color, 56, 56, 40);
  } else {
    // Decoys: a broken ring and a crossed square.
    ctx.lineWidth = 6;
    ctx.beginPath();
    if (color === 'crimson') {
      ctx.arc(56, 56, 32, 0.4, Math.PI * 1.6);
    } else {
      ctx.rect(26, 26, 60, 60);
      ctx.moveTo(26, 26);
      ctx.lineTo(86, 86);
    }
    ctx.stroke();
  }
  return c;
}

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

    const eyebrow = document.createElement('div');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = 'The call-stone';
    const heading = document.createElement('h2');
    heading.textContent = 'Sing the Rite of Three Breaths';
    panel.append(eyebrow, heading);

    const sub = document.createElement('div');
    sub.className = 'subtitle';
    sub.textContent = 'Call three colours in the order the old inscriptions give. Each one is a breath.';
    panel.appendChild(sub);

    if (this.inputIndex === 0 && gameState.data.attributes.perception >= 3) {
      const firstColor = COLOR_INFO[KETHRA_TRUE_SEQUENCE[0]]?.label ?? KETHRA_TRUE_SEQUENCE[0];
      const perceptionHint = document.createElement('div');
      perceptionHint.className = 'subtitle';
      perceptionHint.style.color = 'var(--grove)';
      perceptionHint.textContent = `Your trained eye catches it first: the sequence begins with ${firstColor}.`;
      panel.appendChild(perceptionHint);
    }

    const progress = document.createElement('div');
    progress.className = 'rite-progress';
    progress.setAttribute('aria-label', `${this.inputIndex} of ${KETHRA_TRUE_SEQUENCE.length} breaths held`);
    for (let i = 0; i < KETHRA_TRUE_SEQUENCE.length; i++) {
      const bar = document.createElement('span');
      if (i < this.inputIndex) bar.className = 'set';
      progress.appendChild(bar);
    }
    panel.appendChild(progress);

    const nodesEl = document.createElement('div');
    nodesEl.className = 'rite-nodes';
    PALETTE.forEach((color, i) => {
      const info = COLOR_INFO[color] ?? { label: color, hex: '#888888' };
      const el = document.createElement('button');
      el.className = 'rite-node';
      el.setAttribute('aria-label', `${info.label} (key ${i + 1})`);
      el.appendChild(glyphCanvas(color));
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = `${i + 1} · ${info.label}`;
      el.appendChild(name);
      el.onmouseenter = () => AudioSystem.playHover();
      el.onclick = () => this.handleInput(color);
      nodesEl.appendChild(el);
    });
    panel.appendChild(nodesEl);

    const hint = document.createElement('div');
    hint.className = 'panel-foot';
    hint.innerHTML = 'Number keys pick a colour · <span class="keycap" style="margin-left:.5em">Esc</span> step back';
    panel.appendChild(hint);

    if (PanelManager.isOpen && PanelManager.activeId === 'rite') PanelManager.setContent(panel);
    else PanelManager.open(panel, () => window.removeEventListener('keydown', this.keys), undefined, 'rite');
    window.removeEventListener('keydown', this.keys);
    window.addEventListener('keydown', this.keys);
    (nodesEl.firstChild as HTMLButtonElement).focus({ preventScroll: true });
  }

  private keys = (e: KeyboardEvent) => {
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= PALETTE.length) this.handleInput(PALETTE[n - 1]);
  };

  private handleInput(color: string): void {
    if (color === KETHRA_TRUE_SEQUENCE[this.inputIndex]) {
      AudioSystem.playTone([329.63, 440, 659.25][this.inputIndex] ?? 440, 0.5, 'sine', 0.08);
      this.inputIndex++;
      if (this.inputIndex >= KETHRA_TRUE_SEQUENCE.length) {
        this.solve();
      } else {
        this.render();
      }
    } else {
      AudioSystem.playError();
      const held = this.inputIndex;
      const isRitualMatch = color === KETHRA_RITUAL_SEQUENCE[this.inputIndex];
      if (isRitualMatch) {
        UIManager.toast(
          held > 0
            ? `${held} resonance${held === 1 ? '' : 's'} held — but this is the Rite as the Aiveth still perform it, and it has never once worked.`
            : 'That matches the Rite the Aiveth still perform — and it has never once worked.',
        );
      } else if (held > 0) {
        UIManager.toast(`${held} resonance${held === 1 ? '' : 's'} held before this one broke the pattern.`);
      } else {
        UIManager.toast('The crystal flickers and dims — that resonance is wrong.');
      }
      this.inputIndex = 0;
      this.render();
    }
  }

  private solve(): void {
    window.removeEventListener('keydown', this.keys);
    PanelManager.close();
    gameState.setFlag('kethra_mechanism_solved');
    gameState.addResource('resonant_crystal', 3);
    gameState.addAttributeXp('archaeology', 2);
    AudioSystem.playSuccess();
    UIManager.toast('The Cistern Heart wakes. Water and light flow back up the terraces.', 'learn');
    this.onSolved();
  }
}
