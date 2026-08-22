import type { AttributeKey } from '../core/GameState';
import { gameState } from '../core/GameState';
import { PanelManager } from '../ui/PanelManager';

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

class DialogueSystemImpl {
  private tree: DialogueTree | null = null;
  private currentNodeId = '';
  onClose: (() => void) | null = null;

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

    for (const opt of displayOptions) {
      const btn = document.createElement('button');
      btn.className = 'dialogue-option';
      const locked = opt.requires && gameState.data.attributes[opt.requires.attribute] < opt.requires.min;
      if (locked) {
        btn.classList.add('locked');
        btn.innerHTML = `<span class="tag">${opt.requires!.attribute} ${opt.requires!.min}+</span>${opt.lockedHint ?? opt.text}`;
      } else {
        if (opt.requires) {
          btn.innerHTML = `<span class="tag">${opt.requires.attribute}</span>${opt.text}`;
        } else {
          btn.textContent = opt.text;
        }
        btn.onclick = () => {
          opt.onChoose?.();
          this.goto(opt.next);
        };
      }
      options.appendChild(btn);
    }
    panel.appendChild(options);

    PanelManager.open(panel, () => {
      this.tree = null;
    });
  }
}

export const DialogueSystem = new DialogueSystemImpl();
