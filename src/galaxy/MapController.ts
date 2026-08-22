import { bus } from '../core/EventBus';
import { gameState } from '../core/GameState';
import { PanelManager } from '../ui/PanelManager';
import { UIManager } from '../ui/UIManager';
import { AudioSystem } from '../audio/AudioSystem';
import { getActiveEngine } from '../core/EngineRegistry';
import { PLANETS } from './planetData';
import { KETHRA_MAP } from '../planets/kethra/kethraMapData';
import type { PlanetMapConfig, PoiKind } from '../planets/PlanetMapData';

const PLANET_MAPS: Record<string, PlanetMapConfig> = {
  kethra: KETHRA_MAP,
};

interface HitTarget {
  x: number;
  y: number;
  r: number;
  onClick: () => void;
}

const ICON_SOLAR = `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="8" cy="8" r="1.6" fill="currentColor" stroke="none"/><ellipse cx="8" cy="8" rx="7" ry="3"/></svg>`;
const ICON_PLANET = `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="8" cy="8" r="5.5"/><path d="M2.5 8h11M8 2.5c2.2 2 2.2 8.6 0 11M8 2.5c-2.2 2-2.2 8.6 0 11"/></svg>`;

const POI_COLOR: Record<PoiKind, string> = {
  npc: '#e0b25a',
  lore: '#8a9fd9',
  objective: '#d9a441',
  hazard: '#d9645f',
  landing: '#7cc9e0',
  resource: '#7cbf7c',
};

class MapControllerImpl {
  private view: 'solar' | 'planet' = 'solar';
  private currentPlanetId: string | null = null;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private hitTargets: HitTarget[] = [];
  private rafId = 0;
  private zoom = 1;
  private wasPlayerEnabled = true;
  private startTime = 0;

  init(): void {
    bus.on('ui:open_galaxy_map', () => this.open());
  }

  private open(): void {
    this.view = 'solar';
    this.currentPlanetId = null;
    this.startTime = performance.now();
    this.setActivePlayer(false);
    this.render();
  }

  private setActivePlayer(enabled: boolean): void {
    const scene = getActiveEngine()?.getCurrentScene() as { player?: { enabled: boolean } } | null;
    if (scene?.player) {
      if (!enabled) this.wasPlayerEnabled = scene.player.enabled;
      scene.player.enabled = enabled ? this.wasPlayerEnabled : false;
    }
  }

  private render(): void {
    const wrap = document.createElement('div');
    wrap.className = 'map-fade-in';
    wrap.style.cssText = 'width:90vw; height:86vh; max-width:1400px; position:relative;';

    const canvas = document.createElement('canvas');
    canvas.className = 'map-canvas';
    wrap.appendChild(canvas);
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;

    const header = document.createElement('div');
    header.className = 'map-header';
    header.innerHTML =
      this.view === 'solar'
        ? `<div class="map-title-row"><span class="hud-icon">${ICON_SOLAR}</span><div class="map-title">Navigation — Solar Chart</div></div><div class="map-subtitle">Select a destination</div>`
        : `<div class="map-title-row"><span class="hud-icon">${ICON_PLANET}</span><div class="map-title">${PLANET_MAPS[this.currentPlanetId!].name}</div></div><div class="map-subtitle">${PLANET_MAPS[this.currentPlanetId!].tagline}</div>`;
    wrap.appendChild(header);

    const hint = document.createElement('div');
    hint.className = 'map-hint';
    hint.textContent = this.view === 'solar' ? 'ESC to close' : 'Scroll to zoom · ESC to return to solar chart';
    wrap.appendChild(hint);

    PanelManager.open(
      wrap,
      () => {
        cancelAnimationFrame(this.rafId);
        this.setActivePlayer(true);
      },
      () => this.handleEscape(),
    );

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };
    resize();

    canvas.addEventListener('click', (e) => this.handleClick(e));
    canvas.addEventListener('mousemove', (e) => this.handleHover(e));
    if (this.view === 'planet') {
      canvas.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });
    }

    cancelAnimationFrame(this.rafId);
    const loop = () => {
      this.rafId = requestAnimationFrame(loop);
      if (this.view === 'solar') this.drawSolarSystem();
      else this.drawPlanetMap(PLANET_MAPS[this.currentPlanetId!]);
    };
    loop();
  }

  private handleEscape(): void {
    if (this.view === 'planet') {
      this.view = 'solar';
      this.currentPlanetId = null;
      AudioSystem.playUiClick();
      this.render();
    } else {
      PanelManager.close();
    }
  }

  private handleWheel(e: WheelEvent): void {
    e.preventDefault();
    this.zoom = Math.min(2.2, Math.max(0.7, this.zoom - e.deltaY * 0.001));
  }

  private toCanvasSpace(e: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio;
    return { x: (e.clientX - rect.left) * dpr, y: (e.clientY - rect.top) * dpr };
  }

  private handleClick(e: MouseEvent): void {
    const { x, y } = this.toCanvasSpace(e);
    for (const t of this.hitTargets) {
      const d = Math.hypot(t.x - x, t.y - y);
      if (d <= t.r) {
        t.onClick();
        return;
      }
    }
  }

  private handleHover(e: MouseEvent): void {
    const { x, y } = this.toCanvasSpace(e);
    let found: string | null = null;
    for (const t of this.hitTargets) {
      if (Math.hypot(t.x - x, t.y - y) <= t.r) {
        found = `${t.x},${t.y}`;
        break;
      }
    }
    this.canvas.style.cursor = found ? 'pointer' : 'default';
  }

  // ---------- Solar system view ----------

  private drawSolarSystem(): void {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    this.hitTargets = [];
    const t = (performance.now() - this.startTime) / 1000;

    ctx.clearRect(0, 0, w, h);

    const bg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
    bg.addColorStop(0, '#141824');
    bg.addColorStop(0.6, '#0a0c14');
    bg.addColorStop(1, '#05060a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Ink-wash atmosphere blobs.
    const washes: [number, number, number, string][] = [
      [w * 0.25, h * 0.3, w * 0.32, 'rgba(90,110,160,0.10)'],
      [w * 0.75, h * 0.65, w * 0.28, 'rgba(160,120,90,0.07)'],
      [w * 0.55, h * 0.2, w * 0.22, 'rgba(120,150,140,0.08)'],
    ];
    for (const [wx, wy, wr, color] of washes) {
      const g = ctx.createRadialGradient(wx, wy, 0, wx, wy, wr);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    // Starfield (deterministic pseudo-random via index-based hashing, stable across frames).
    ctx.save();
    for (let i = 0; i < 220; i++) {
      const sx = ((i * 97) % 1000) / 1000 * w;
      const sy = ((i * 53) % 1000) / 1000 * h;
      const twinkle = 0.4 + 0.6 * Math.abs(Math.sin(t * 0.6 + i));
      ctx.globalAlpha = twinkle * 0.5;
      ctx.fillStyle = '#dfe6f5';
      const size = (i % 7 === 0 ? 1.6 : 0.8) * window.devicePixelRatio;
      ctx.fillRect(sx, sy, size, size);
    }
    ctx.restore();

    const cx = w * 0.5;
    const cy = h * 0.52;
    const maxOrbit = Math.max(...PLANETS.map((p) => p.orbitRadius));
    const scale = (Math.min(w, h) * 0.42) / maxOrbit;

    // Sun.
    const sunR = 18 * window.devicePixelRatio;
    const sunGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, sunR * 5);
    sunGlow.addColorStop(0, 'rgba(255,220,160,0.9)');
    sunGlow.addColorStop(0.3, 'rgba(217,164,65,0.35)');
    sunGlow.addColorStop(1, 'rgba(217,164,65,0)');
    ctx.fillStyle = sunGlow;
    ctx.beginPath();
    ctx.arc(cx, cy, sunR * 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffe3ab';
    ctx.beginPath();
    ctx.arc(cx, cy, sunR, 0, Math.PI * 2);
    ctx.fill();

    // Orbit rings + planets.
    for (const p of PLANETS) {
      const orbitR = p.orbitRadius * scale;
      ctx.strokeStyle = 'rgba(180,190,220,0.15)';
      ctx.lineWidth = 1 * window.devicePixelRatio;
      ctx.beginPath();
      ctx.ellipse(cx, cy, orbitR, orbitR * 0.42, 0, 0, Math.PI * 2);
      ctx.stroke();

      const angle = p.orbitAngle;
      const px = cx + Math.cos(angle) * orbitR;
      const py = cy + Math.sin(angle) * orbitR * 0.42;
      const unlocked = gameState.data.planetsUnlocked.includes(p.id);
      const radius = 10 * window.devicePixelRatio;

      if (unlocked) {
        const glow = ctx.createRadialGradient(px, py, 0, px, py, radius * 3);
        glow.addColorStop(0, this.hexToRgba(`#${p.color.toString(16).padStart(6, '0')}`, 0.55));
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(px, py, radius * 3, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = unlocked ? 1 : 0.35;
      ctx.fillStyle = `#${p.color.toString(16).padStart(6, '0')}`;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = unlocked ? '#eae2d0' : 'rgba(234,226,208,0.4)';
      ctx.lineWidth = 1.4 * window.devicePixelRatio;
      ctx.stroke();
      ctx.globalAlpha = 1;

      if (p.hasRing) {
        ctx.strokeStyle = unlocked ? 'rgba(234,226,208,0.6)' : 'rgba(234,226,208,0.2)';
        ctx.lineWidth = 1.2 * window.devicePixelRatio;
        ctx.beginPath();
        ctx.ellipse(px, py, radius * 1.7, radius * 0.6, -0.4, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.font = `${11 * window.devicePixelRatio}px ui-sans-serif, system-ui`;
      ctx.textAlign = 'center';
      ctx.fillStyle = unlocked ? '#eae2d0' : 'rgba(234,226,208,0.45)';
      ctx.fillText(unlocked ? p.name.toUpperCase() : 'UNKNOWN', px, py + radius + 16 * window.devicePixelRatio);
      if (!unlocked) {
        ctx.font = `${9 * window.devicePixelRatio}px ui-sans-serif, system-ui`;
        ctx.fillStyle = 'rgba(217,164,65,0.6)';
        ctx.fillText('OUT OF SCANNER RANGE', px, py + radius + 30 * window.devicePixelRatio);
      }

      this.hitTargets.push({
        x: px,
        y: py,
        r: radius * 2.4,
        onClick: () => {
          if (!unlocked) {
            UIManager.toast('Scanner range insufficient for that destination.');
            return;
          }
          this.openPlanet(p.id);
        },
      });
    }

    // Ship marker: at the currently-active planet if landed, otherwise home/dock position near the sun.
    const onPlanet = PLANETS.find((p) => p.id === this.currentSceneLocation());
    const shipX = onPlanet ? cx + Math.cos(onPlanet.orbitAngle) * onPlanet.orbitRadius * scale : cx;
    const shipY = onPlanet ? cy + Math.sin(onPlanet.orbitAngle) * onPlanet.orbitRadius * scale * 0.42 : cy + 34 * window.devicePixelRatio;
    ctx.save();
    ctx.translate(shipX, shipY - 22 * window.devicePixelRatio);
    ctx.fillStyle = '#7cc9e0';
    ctx.beginPath();
    ctx.moveTo(0, -7 * window.devicePixelRatio);
    ctx.lineTo(5 * window.devicePixelRatio, 7 * window.devicePixelRatio);
    ctx.lineTo(-5 * window.devicePixelRatio, 7 * window.devicePixelRatio);
    ctx.closePath();
    ctx.fill();
    ctx.font = `${9 * window.devicePixelRatio}px ui-sans-serif, system-ui`;
    ctx.fillStyle = '#7cc9e0';
    ctx.textAlign = 'center';
    ctx.fillText('YOUR SHIP', 0, 18 * window.devicePixelRatio);
    ctx.restore();
  }

  /** Which planet the player is actually standing on right now, in the live 3D game — distinct
   * from `currentPlanetId`, which just tracks which detail map the player is browsing. */
  private currentSceneLocation(): string | null {
    const scene = getActiveEngine()?.getCurrentScene();
    if (scene && 'onDepart' in scene) return 'kethra';
    return null;
  }

  private openPlanet(planetId: string): void {
    if (!PLANET_MAPS[planetId]) {
      UIManager.toast('Detailed charts for this world have not been compiled yet.');
      return;
    }
    this.view = 'planet';
    this.currentPlanetId = planetId;
    this.zoom = 1;
    AudioSystem.playChime();
    this.render();
  }

  // ---------- Planet map view ----------

  private worldToMap(config: PlanetMapConfig, x: number, z: number, w: number, h: number): { x: number; y: number } {
    const { minX, maxX, minZ, maxZ } = config.bounds;
    const nx = (x - minX) / (maxX - minX);
    const nz = (z - minZ) / (maxZ - minZ);
    const pad = 0.08;
    const mx = w * (pad + nx * (1 - 2 * pad));
    const my = h * (pad + (1 - nz) * (1 - 2 * pad));
    const cx = w / 2;
    const cy = h / 2;
    return { x: cx + (mx - cx) * this.zoom, y: cy + (my - cy) * this.zoom };
  }

  private drawPlanetMap(config: PlanetMapConfig): void {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    this.hitTargets = [];

    ctx.clearRect(0, 0, w, h);
    const bg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
    bg.addColorStop(0, '#10241c');
    bg.addColorStop(1, '#06100c');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Grid.
    ctx.strokeStyle = 'rgba(120,180,150,0.08)';
    ctx.lineWidth = 1;
    const gridStep = 40 * window.devicePixelRatio * this.zoom;
    for (let gx = w / 2 % gridStep; gx < w; gx += gridStep) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, h);
      ctx.stroke();
    }
    for (let gy = h / 2 % gridStep; gy < h; gy += gridStep) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(w, gy);
      ctx.stroke();
    }

    // Terrain footprint blobs approximating the terraces.
    const terraces: [number, number, number, number][] = [
      [0, 16, 60, 60],
      [0, 2, 90, 90],
      [-16, -2, 55, 50],
      [16, -2, 55, 50],
      [0, -14, 45, 55],
      [-20, -8, 20, 20],
    ];
    for (const [tx, tz, tw, th] of terraces) {
      const p = this.worldToMap(config, tx, tz, w, h);
      ctx.fillStyle = 'rgba(140,190,160,0.14)';
      ctx.strokeStyle = 'rgba(140,190,160,0.3)';
      ctx.lineWidth = 1 * window.devicePixelRatio;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, (tw / 2) * window.devicePixelRatio * this.zoom * 0.055, (th / 2) * window.devicePixelRatio * this.zoom * 0.055, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // POIs.
    for (const poi of config.pois) {
      const discovered = !poi.discoveredFlag || gameState.hasFlag(poi.discoveredFlag);
      const p = this.worldToMap(config, poi.x, poi.z, w, h);
      const color = POI_COLOR[poi.kind];
      const r = 7 * window.devicePixelRatio;

      ctx.globalAlpha = discovered ? 1 : 0.35;
      this.drawPoiGlyph(p.x, p.y, r, poi.kind, color);

      ctx.font = `${10 * window.devicePixelRatio}px ui-sans-serif, system-ui`;
      ctx.textAlign = 'center';
      ctx.fillStyle = discovered ? '#eae2d0' : 'rgba(234,226,208,0.5)';
      ctx.fillText(discovered ? poi.label : '???', p.x, p.y + r + 14 * window.devicePixelRatio);
      ctx.globalAlpha = 1;

      this.hitTargets.push({
        x: p.x,
        y: p.y,
        r: r * 2.2,
        onClick: () => UIManager.toast(discovered ? poi.label : 'Not yet discovered.'),
      });
    }

    // Live player position + facing.
    const scene = getActiveEngine()?.getCurrentScene() as { player?: { rig: { position: { x: number; z: number } }; yaw: number } } | null;
    if (scene?.player) {
      const pos = scene.player.rig.position;
      const p = this.worldToMap(config, pos.x, pos.z, w, h);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(scene.player.yaw);
      ctx.fillStyle = '#ffe3ab';
      ctx.beginPath();
      ctx.moveTo(0, -9 * window.devicePixelRatio);
      ctx.lineTo(6 * window.devicePixelRatio, 8 * window.devicePixelRatio);
      ctx.lineTo(0, 4 * window.devicePixelRatio);
      ctx.lineTo(-6 * window.devicePixelRatio, 8 * window.devicePixelRatio);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawPoiGlyph(x: number, y: number, r: number, kind: PoiKind, color: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.strokeStyle = '#0a0c0a';
    ctx.lineWidth = 1.2 * window.devicePixelRatio;
    ctx.beginPath();
    switch (kind) {
      case 'objective':
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r, y);
        ctx.lineTo(x, y + r);
        ctx.lineTo(x - r, y);
        ctx.closePath();
        break;
      case 'hazard':
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r, y + r);
        ctx.lineTo(x - r, y + r);
        ctx.closePath();
        break;
      case 'landing':
        ctx.arc(x, y, r, 0, Math.PI * 2);
        break;
      case 'lore':
        ctx.rect(x - r * 0.8, y - r, r * 1.6, r * 2);
        break;
      case 'resource':
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i - Math.PI / 2;
          const hx = x + Math.cos(a) * r;
          const hy = y + Math.sin(a) * r;
          if (i === 0) ctx.moveTo(hx, hy);
          else ctx.lineTo(hx, hy);
        }
        ctx.closePath();
        break;
      default:
        ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();
  }

  private hexToRgba(hex: string, alpha: number): string {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }
}

export const MapController = new MapControllerImpl();
