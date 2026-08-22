import type { ShipSystemKey } from '../core/GameState';
import { gameState } from '../core/GameState';
import { bus } from '../core/EventBus';
import { PanelManager } from '../ui/PanelManager';
import { UIManager } from '../ui/UIManager';

const ICON_DONE = `<span class="hud-icon"><svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5 6.5 12 13 4.5"/></svg></span>`;
const ICON_READY = `<span class="hud-icon"><svg viewBox="0 0 16 16" width="10" height="10"><circle cx="8" cy="8" r="4" fill="currentColor"/></svg></span>`;
const ICON_PENDING = `<span class="hud-icon"><svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="8" r="4.5"/></svg></span>`;

class RepairUIImpl {
  init(): void {
    bus.on('ui:open_repair', () => this.open());
  }

  open(): void {
    this.render();
  }

  private render(): void {
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.id = 'repair-panel';

    const heading = document.createElement('h2');
    heading.textContent = 'Ship Repair Interface';
    panel.appendChild(heading);

    const sub = document.createElement('div');
    sub.className = 'subtitle';
    sub.textContent = 'Route salvaged materials into damaged systems to restore ship function.';
    panel.appendChild(sub);

    const keys = Object.keys(gameState.data.shipSystems) as ShipSystemKey[];
    for (const key of keys) {
      const sys = gameState.data.shipSystems[key];
      const row = document.createElement('div');
      row.className = 'repair-row';

      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = sys.label;

      const ready = gameState.canRepair(key);
      const status = document.createElement('div');
      status.className = 'status' + (sys.repaired ? ' done' : ready ? ' ready' : '');
      const statusLabel = sys.repaired
        ? 'Operational'
        : sys.requiredResource
          ? `${sys.haveAmount}/${sys.requiredAmount} ${formatResource(sys.requiredResource)}`
          : 'Nominal';
      status.innerHTML = `${sys.repaired ? ICON_DONE : ready ? ICON_READY : ICON_PENDING}<span>${statusLabel}</span>`;

      const barTrack = document.createElement('div');
      barTrack.className = 'bar-track';
      const barFill = document.createElement('div');
      barFill.className = 'bar-fill';
      barFill.style.width = `${sys.progress}%`;
      barTrack.appendChild(barFill);

      const btn = document.createElement('button');
      btn.textContent = sys.repaired ? 'Repaired' : 'Repair';
      btn.disabled = sys.repaired || !gameState.canRepair(key);
      btn.onclick = () => {
        if (gameState.repairSystem(key)) {
          UIManager.toast(`${sys.label} repaired.`);
          this.render();
        }
      };

      row.appendChild(name);
      row.appendChild(status);
      row.appendChild(barTrack);
      row.appendChild(btn);
      panel.appendChild(row);
    }

    const hint = document.createElement('div');
    hint.className = 'close-hint';
    hint.textContent = 'ESC to close';
    panel.appendChild(hint);

    PanelManager.open(panel);
  }
}

function formatResource(id: string): string {
  return id
    .split('_')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

export const RepairUI = new RepairUIImpl();
