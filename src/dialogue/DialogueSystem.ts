import type { AttributeKey } from '../core/GameState';
import { gameState } from '../core/GameState';
import { PanelManager } from '../ui/PanelManager';
import { AudioSystem } from '../audio/AudioSystem';

export interface DialogueOption {
  text: string;
  next: string | null;
  requires?: { attribute: AttributeKey; min: number };
  lockedHint?: string;
  onChoose?: () => void;
}

export interface DialogueNode {
  id: string;
  speaker: string;
  text: string;
  options: DialogueOption[];
  onEnter?: () => void;
}

export interface DialogueTree {
  id: string;
  startNode: string;
  nodes: Record<string, DialogueNode>;
}

const LOCK_ICON = `<span class="hud-icon"><svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="3.5" y="7" width="9" height="6.5" rx="1"/><path d="M5.5 7V4.8a2.5 2.5 0 0 1 5 0V7"/></svg></span>`;

class DialogueSystemImpl {
  private tree: DialogueTree | null = null;
  private currentNodeId = '';
  private choices: (() => void)[] = [];
  onClose: (() => void) | null = null;

  constructor() {
    // Keyboard-only play: number keys pick an option (1 is the first). Enter works on the focused one.
    window.addEventListener('keydown', (e) => {
      if (!this.tree || e.repeat) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= this.choices.length) {
        e.preventDefault();
        this.choices[n - 1]();
      }
    });
  }

  isActive(): boolean {
    return this.tree !== null;
  }

  start(tree: DialogueTree, onClose?: () => void): void {
    this.tree = tree;
    this.currentNodeId = tree.startNode;
    this.onClose = onClose ?? null;
    this.render();
  }

  private goto(nodeId: string | null): void {
    if (!this.tree || nodeId === null) {
      this.end();
      return;
    }
    this.currentNodeId = nodeId;
    const node = this.tree.nodes[nodeId];
    node?.onEnter?.();
    this.render();
  }

  private end(): void {
    this.tree = null;
    PanelManager.close();
    this.onClose?.();
    this.onClose = null;
  }

  private render(): void {
    if (!this.tree) return;
    const node = this.tree.nodes[this.currentNodeId];
    if (!node) {
      this.end();
      return;
    }

    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.id = 'dialogue-panel';

    const speaker = document.createElement('div');
    speaker.id = 'dialogue-speaker';
    speaker.textContent = node.speaker;
    panel.appendChild(speaker);

    const text = document.createElement('div');
    text.id = 'dialogue-text';
    text.textContent = node.text;
    panel.appendChild(text);

    const options = document.createElement('div');
    options.id = 'dialogue-options';

    const displayOptions = node.options.length > 0 ? node.options : [{ text: 'End conversation.', next: null } as DialogueOption];

    this.choices = [];
    for (const opt of displayOptions) {
      const btn = document.createElement('button');
      btn.className = 'dialogue-option';
      const locked = opt.requires && gameState.data.attributes[opt.requires.attribute] < opt.requires.min;
      const label = document.createElement('span');
      if (locked) {
        btn.classList.add('locked');
        btn.disabled = true;
        btn.innerHTML = `<span class="tag">${LOCK_ICON}${opt.requires!.attribute} ${opt.requires!.min}</span>`;
        label.textContent = opt.lockedHint ?? opt.text;
      } else {
        const choose = () => {
          AudioSystem.playConfirm();
          opt.onChoose?.();
          this.goto(opt.next);
        };
        this.choices.push(choose);
        btn.innerHTML = `<span class="opt-num">${this.choices.length}</span>${opt.requires ? `<span class="tag">${opt.requires.attribute}</span>` : ''}`;
        label.textContent = opt.text;
        btn.onmouseenter = () => AudioSystem.playHover();
        btn.onclick = choose;
      }
      btn.appendChild(label);
      options.appendChild(btn);
    }
    panel.appendChild(options);

    if (PanelManager.isOpen && PanelManager.activeId === 'dialogue') PanelManager.setContent(panel);
    else PanelManager.open(panel, () => {
      this.tree = null;
      this.choices = [];
    }, undefined, 'dialogue');
    (options.querySelector('.dialogue-option:not(.locked)') as HTMLButtonElement | null)?.focus({ preventScroll: true });
  }
}

export const DialogueSystem = new DialogueSystemImpl();
