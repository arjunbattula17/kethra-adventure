import { bus } from '../core/EventBus';
import { UIManager } from '../ui/UIManager';
import { gameState } from '../core/GameState';
import { AudioSystem } from '../audio/AudioSystem';

type NodeType = 'shields' | 'scanner' | 'evade';

const NODES: { type: NodeType; label: string; icon: string; hint: string }[] = [
  { type: 'shields', label: 'Shields', icon: '◈', hint: 'Brace against a direct hit.' },
  { type: 'scanner', label: 'Scanner', icon: '◎', hint: 'Read the weak point in their targeting array.' },
  { type: 'evade', label: 'Thrusters', icon: '▲', hint: 'Slip out of their firing arc.' },
];

const TOTAL_ROUNDS = 3;
const TELEGRAPH_MS = 1100;

export class BattlePuzzle {
  private container: HTMLDivElement;
  private round = 0;
  private pattern: NodeType[] = [];
  private inputIndex = 0;
  private phase: 'telegraph' | 'input' | 'success' | 'idle' = 'idle';
  private timerSeconds = 0;
  private timerMax = 1;
  private rafHandle = 0;
  private lastT = 0;
  private active = false;
  onWin: () => void = () => {};

  constructor() {
    this.container = document.createElement('div');
  }

  start(): void {
    this.active = true;
    this.round = 0;
    UIManager.setLookPromptEnabled(false);
    UIManager.showCaption('INCOMING CONTACT — unknown vessel closing fast.', 3400);
    setTimeout(() => this.beginRound(), 2200);
  }

  private beginRound(): void {
    if (!this.active) return;
    this.pattern = [];
    const len = this.round + 1;
    for (let i = 0; i < len; i++) {
      this.pattern.push(NODES[Math.floor(Math.random() * NODES.length)].type);
    }
    this.inputIndex = 0;
    this.phase = 'telegraph';
    this.renderTelegraph(0);
  }

  private renderTelegraph(step: number): void {
    if (!this.active) return;
    if (step >= this.pattern.length) {
      this.phase = 'input';
      this.timerMax = 5 + this.pattern.length * 3.2;
      this.timerSeconds = this.timerMax;
      this.lastT = performance.now();
      this.render();
      this.tick();
      return;
    }
    const nodeType = this.pattern[step];
    const node = NODES.find((n) => n.type === nodeType)!;
    this.renderTelegraphFrame(step, node.label);
    setTimeout(() => this.renderTelegraph(step + 1), TELEGRAPH_MS);
  }

  private renderTelegraphFrame(step: number, label: string): void {
    this.container.innerHTML = '';
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.id = 'power-puzzle-panel';

    const heading = document.createElement('h2');
    heading.textContent = `Round ${this.round + 1} of ${TOTAL_ROUNDS} — Reading Attack Vector`;
    panel.appendChild(heading);

    const indicator = document.createElement('div');
    indicator.id = 'threat-indicator';
    indicator.textContent = `Observe the sequence… (${step + 1}/${this.pattern.length})`;
    panel.appendChild(indicator);

    const big = document.createElement('div');
    big.style.cssText = 'text-align:center; font-size:52px; color: var(--accent); margin: 30px 0; letter-spacing: 0.1em;';
    big.textContent = label.toUpperCase();
    panel.appendChild(big);

    this.mount(panel);
  }

  private render(): void {
    this.container.innerHTML = '';
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.id = 'power-puzzle-panel';

    const heading = document.createElement('h2');
    heading.textContent = `Round ${this.round + 1} of ${TOTAL_ROUNDS} — Redirect Power`;
    panel.appendChild(heading);

    const indicator = document.createElement('div');
    indicator.id = 'threat-indicator';
    indicator.textContent = `Repeat the sequence: ${this.inputIndex}/${this.pattern.length} correct`;
    panel.appendChild(indicator);

    const track = document.createElement('div');
    track.id = 'threat-timer-track';
    const fill = document.createElement('div');
    fill.id = 'threat-timer-fill';
    fill.style.width = `${(this.timerSeconds / this.timerMax) * 100}%`;
    track.appendChild(fill);
    panel.appendChild(track);

    const nodesEl = document.createElement('div');
    nodesEl.id = 'power-nodes';
    for (const node of NODES) {
      const el = document.createElement('div');
      el.className = 'power-node';
      el.innerHTML = `<div class="icon">${node.icon}</div><div class="name">${node.label}</div><div class="pips">${[0, 1, 2].map(() => '<div class="pip filled"></div>').join('')}</div>`;
      el.onclick = () => this.handleInput(node.type);
      nodesEl.appendChild(el);
    }
    panel.appendChild(nodesEl);

    const sub = document.createElement('div');
    sub.className = 'subtitle';
    sub.style.textAlign = 'center';
    sub.textContent = NODES.find((n) => n.type === this.pattern[this.inputIndex])?.hint ?? '';
    panel.appendChild(sub);

    this.mount(panel);
  }

  private tick(): void {
    if (!this.active || this.phase !== 'input') return;
    const now = performance.now();
    const dt = (now - this.lastT) / 1000;
    this.lastT = now;
    this.timerSeconds -= dt;
    if (this.timerSeconds <= 0) {
      this.onMistake('Sequence lost — recalibrating scanners.');
      return;
    }
    const fill = document.getElementById('threat-timer-fill');
    if (fill) fill.style.width = `${Math.max(0, (this.timerSeconds / this.timerMax) * 100)}%`;
    this.rafHandle = requestAnimationFrame(() => this.tick());
  }

  private handleInput(type: NodeType): void {
    if (this.phase !== 'input') return;
    if (type === this.pattern[this.inputIndex]) {
      this.inputIndex++;
      if (this.inputIndex >= this.pattern.length) {
        this.onRoundSuccess();
      } else {
        this.render();
      }
    } else {
      this.onMistake('Wrong system — the enemy adjusted its approach. Try again.');
    }
  }

  private onMistake(message: string): void {
    cancelAnimationFrame(this.rafHandle);
    bus.emit('player:shake', 0.35);
    AudioSystem.playError();
    UIManager.toast(message);
    this.phase = 'idle';
    setTimeout(() => this.beginRound(), 900);
  }

  private onRoundSuccess(): void {
    cancelAnimationFrame(this.rafHandle);
    this.phase = 'success';
    AudioSystem.playChime();
    UIManager.toast('System redirect successful.');
    gameState.addAttributeXp('engineering', 1);
    this.round++;
    if (this.round >= TOTAL_ROUNDS) {
      setTimeout(() => this.finish(), 1200);
    } else {
      setTimeout(() => this.beginRound(), 1400);
    }
  }

  private finish(): void {
    this.active = false;
    this.container.remove();
    gameState.setFlag('tutorial_battle_complete');
    this.onWin();
  }

  private mount(panel: HTMLElement): void {
    this.container.innerHTML = '';
    this.container.appendChild(panel);
    if (!this.container.parentElement) {
      this.container.className = 'panel-overlay visible interactive';
      document.getElementById('ui-root')!.appendChild(this.container);
    }
  }

  dispose(): void {
    this.active = false;
    cancelAnimationFrame(this.rafHandle);
    this.container.remove();
  }
}
