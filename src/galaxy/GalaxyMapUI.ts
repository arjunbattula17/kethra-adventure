import { gameState } from '../core/GameState';
import { bus } from '../core/EventBus';
import { PanelManager } from '../ui/PanelManager';
import { PLANETS } from './planetData';

class GalaxyMapUIImpl {
  init(): void {
    bus.on('ui:open_galaxy_map', () => this.open());
  }

  open(): void {
    this.render();
  }

  private render(): void {
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.style.position = 'relative';
    panel.style.padding = '24px';

    const heading = document.createElement('h2');
    heading.textContent = 'Galaxy Map';
    panel.appendChild(heading);
    const sub = document.createElement('div');
    sub.className = 'subtitle';
    sub.textContent = 'Select a destination. Scanner range limits how far you can safely travel.';
    panel.appendChild(sub);

    const map = document.createElement('div');
    map.id = 'galaxy-map-panel';

    const sunEl = document.createElement('div');
    sunEl.style.cssText = 'position:absolute; left:8%; top:15%; width:36px; height:36px; border-radius:50%; background:radial-gradient(circle, #ffe3ab, #d9a441); box-shadow: 0 0 30px rgba(217,164,65,0.6);';
    map.appendChild(sunEl);

    for (const p of PLANETS) {
      const unlocked = gameState.data.planetsUnlocked.includes(p.id);
      const node = document.createElement('div');
      node.className = 'planet-node' + (unlocked ? '' : ' locked');
      node.style.left = `${p.mapX}%`;
      node.style.top = `${p.mapY}%`;
      node.style.background = `radial-gradient(circle at 35% 30%, #${(p.color + 0x222222).toString(16).padStart(6, '0')}, #${p.color.toString(16).padStart(6, '0')})`;
      node.innerHTML = `<div class="planet-label">${p.name}${unlocked ? '' : ' — out of range'}</div>`;
      if (unlocked) {
        node.onclick = () => {
          PanelManager.close();
          bus.emit('galaxy:travel_to', p.id);
        };
      }
      map.appendChild(node);
    }

    panel.appendChild(map);

    const hint = document.createElement('div');
    hint.className = 'close-hint';
    hint.textContent = 'ESC to close';
    panel.appendChild(hint);

    PanelManager.open(panel);
  }
}

export const GalaxyMapUI = new GalaxyMapUIImpl();
