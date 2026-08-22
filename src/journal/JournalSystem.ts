import { gameState } from '../core/GameState';
import type { JournalLogEntry } from '../core/GameState';
import { bus } from '../core/EventBus';
import { PanelManager } from '../ui/PanelManager';

const STARTER_LOGS: JournalLogEntry[] = [
  {
    id: 'log_departure',
    title: 'Departure — Personal Log 1',
    body: `"Cleared the outer beacons at 0600. Cargo manifest confirms the survey equipment made it aboard intact this time. Three months chasing a rumor is a long way to go, but if the source is right about what's out past the Kessic Drift, it'll be worth every day of it. Setting a course into the dark."`,
    corrupted: false,
    timestamp: 'Day 1',
    unlocked: true,
  },
  {
    id: 'log_deviation',
    title: 'Course Deviation — Personal Log 14',
    body: `"Something's wrong with the deep-space charts out here. The nav computer keeps re-solving for a route that shouldn't exist — like there's a mass out there that isn't on any survey. I changed heading twice tonight just to convince myself I wasn't imagining the drift."`,
    corrupted: false,
    timestamp: 'Day 14',
    unlocked: true,
  },
  {
    id: 'log_signal',
    title: 'Unknown Signal — Personal Log 22',
    body: `"Picked up ▓▓▓▓ repeating ▓▓▓▓ not in any catalog. Structure to it — too regular for background noise. Recording for ▓▓▓▓ later. Whatever it is, it's close."`,
    corrupted: true,
    timestamp: 'Day 22',
    unlocked: true,
  },
  {
    id: 'log_final',
    title: 'Final Entry Before Silence',
    body: `"▓▓▓▓ the light came from everywhere at once, no direction to point the sensors at. Hull integrity ▓▓▓▓. I don't— [DATA CORRUPTED] —if anyone finds this, we were never supposed to—"`,
    corrupted: true,
    timestamp: 'Day 23',
    unlocked: true,
  },
];

class JournalSystemImpl {
  private view: 'logs' | 'evidence' = 'logs';
  private selectedLogId: string | null = null;
  private selectedClueIds: string[] = [];

  init(): void {
    if (gameState.data.journalLogs.length === 0) {
      gameState.data.journalLogs = STARTER_LOGS.map((l) => ({ ...l }));
    }
    bus.on('ui:open_journal', () => this.open());
  }

  open(view: 'logs' | 'evidence' = 'logs'): void {
    this.view = view;
    this.selectedLogId = gameState.data.journalLogs.find((l) => l.unlocked)?.id ?? null;
    this.render();
  }

  private render(): void {
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.id = 'journal-panel';
    panel.style.position = 'relative';

    const tabs = document.createElement('div');
    tabs.style.cssText = 'position:absolute; top:20px; right:32px; display:flex; gap:8px;';
    for (const v of ['logs', 'evidence'] as const) {
      const btn = document.createElement('button');
      btn.className = 'text-btn';
      btn.style.textDecoration = this.view === v ? 'underline' : 'none';
      btn.style.opacity = this.view === v ? '1' : '0.6';
      btn.textContent = v === 'logs' ? 'Travel Logs' : 'Evidence Board';
      btn.onclick = () => {
        this.view = v;
        this.render();
      };
      tabs.appendChild(btn);
    }
    panel.appendChild(tabs);

    if (this.view === 'logs') {
      panel.appendChild(this.renderLogsView());
    } else {
      panel.appendChild(this.renderEvidenceView());
    }

    const hint = document.createElement('div');
    hint.className = 'close-hint';
    hint.textContent = 'ESC to close';
    panel.appendChild(hint);

    PanelManager.open(panel);
  }

  private renderLogsView(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex; gap:20px; width:100%; height:100%;';

    const heading = document.createElement('h2');
    heading.textContent = 'Travel Logs';
    const sub = document.createElement('div');
    sub.className = 'subtitle';
    sub.textContent = 'Some entries are corrupted — pieces of the truth are still missing.';

    const listCol = document.createElement('div');
    listCol.className = 'journal-col';
    for (const log of gameState.data.journalLogs) {
      if (!log.unlocked) continue;
      const entry = document.createElement('div');
      entry.className = 'journal-entry' + (log.corrupted ? ' corrupted' : '');
      entry.innerHTML = `<div class="title">${log.title}</div><div class="meta">${log.timestamp}${log.corrupted ? ' · corrupted' : ''}</div>`;
      entry.onclick = () => {
        this.selectedLogId = log.id;
        this.render();
      };
      listCol.appendChild(entry);
    }

    const detail = document.createElement('div');
    detail.className = 'journal-detail';
    const selected = gameState.data.journalLogs.find((l) => l.id === this.selectedLogId);
    if (selected) {
      detail.innerHTML = `<strong>${selected.title}</strong><div style="margin-top:10px;">${selected.corrupted ? `<span class="corrupt-text">${selected.body}</span>` : selected.body}</div>`;
    } else {
      detail.textContent = 'No log selected.';
    }

    const container = document.createElement('div');
    container.style.cssText = 'display:flex; flex-direction:column; width:100%;';
    container.appendChild(heading);
    container.appendChild(sub);
    const cols = document.createElement('div');
    cols.style.cssText = 'display:flex; gap:20px; flex:1; overflow:hidden;';
    cols.appendChild(listCol);
    cols.appendChild(detail);
    container.appendChild(cols);
    wrap.appendChild(container);
    return wrap;
  }

  private renderEvidenceView(): HTMLElement {
    const container = document.createElement('div');
    container.style.cssText = 'display:flex; flex-direction:column; width:100%;';

    const heading = document.createElement('h2');
    heading.textContent = 'Evidence Board';
    const sub = document.createElement('div');
    sub.className = 'subtitle';
    sub.textContent = gameState.data.clues.length > 0
      ? 'Select two clues to connect them and record an insight.'
      : 'No clues discovered yet. Explore to find them.';
    container.appendChild(heading);
    container.appendChild(sub);

    const board = document.createElement('div');
    board.id = 'evidence-board';
    for (const clue of gameState.data.clues) {
      const node = document.createElement('span');
      node.className = 'clue-node' + (this.selectedClueIds.includes(clue.id) ? ' selected' : '');
      node.textContent = clue.title;
      node.title = clue.summary;
      node.onclick = () => this.toggleClueSelection(clue.id);
      board.appendChild(node);
    }
    container.appendChild(board);

    const connections = document.createElement('div');
    connections.id = 'evidence-connections';
    if (gameState.data.clueConnections.length > 0) {
      connections.innerHTML =
        '<strong>Connections made:</strong><br>' +
        gameState.data.clueConnections.map((c) => `• ${c.insight}`).join('<br>');
    }
    container.appendChild(connections);

    return container;
  }

  private toggleClueSelection(id: string): void {
    if (this.selectedClueIds.includes(id)) {
      this.selectedClueIds = this.selectedClueIds.filter((c) => c !== id);
    } else {
      this.selectedClueIds.push(id);
      if (this.selectedClueIds.length === 2) {
        const [a, b] = this.selectedClueIds;
        bus.emit('evidence:pair_selected', { a, b });
        this.selectedClueIds = [];
      }
    }
    this.render();
  }
}

export const JournalSystem = new JournalSystemImpl();
