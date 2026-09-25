import { bus } from '../core/EventBus';
import { gameState } from '../core/GameState';
import { PanelManager } from '../ui/PanelManager';
import { UIManager } from '../ui/UIManager';
import { AudioSystem } from '../audio/AudioSystem';
import { getActiveEngine } from '../core/EngineRegistry';
import { NAV } from '../content/tuning';
import { PLANETS } from './planetData';
import type { PlanetDefinition } from './planetData';
import { STRINGS, format, t } from '../content/strings';
import type { StringKey } from '../content/strings';
import { KETHRA_MAP } from '../planets/kethra/kethraMapData';
import { VESSEK_MAP } from '../planets/vessek/vessekMapData';
import type { PlanetMapConfig, PlanetMapPoi, PoiKind } from '../planets/PlanetMapData';

/**
 * The navigation map: a solar chart of the system and a surface chart per surveyed world, beside a
 * dossier panel for whatever is selected.
 *
 * The chart is a 2D canvas redrawn every frame (orbits animate, the ship pings); everything that
 * is text-heavy or clickable as a control (the dossier, its buttons, the survey list) is DOM, built
 * only when the selection changes. Travel happens here: "Set course" closes the map and emits
 * galaxy:travel_to, which GameFlow turns into the fade and the scene change.
 */

const PLANET_MAPS: Record<string, PlanetMapConfig> = {
  kethra: KETHRA_MAP,
  vessek: VESSEK_MAP,
};
/** Worlds GameFlow.travelToPlanet can actually take the player to. */
const TRAVEL_READY = new Set(['kethra', 'vessek']);

interface HitTarget {
  x: number;
  y: number;
  r: number;
  id: string;
  onClick: () => void;
}

const ICON_SOLAR = `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="8" cy="8" r="1.6" fill="currentColor" stroke="none"/><ellipse cx="8" cy="8" rx="7" ry="3"/></svg>`;
const ICON_PLANET = `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="8" cy="8" r="5.5"/><path d="M2.5 8h11M8 2.5c2.2 2 2.2 8.6 0 11M8 2.5c-2.2 2-2.2 8.6 0 11"/></svg>`;

/** Each point-of-interest kind has a colour AND a shape, so the chart reads without colour vision. */
const POI_COLOR: Record<PoiKind, string> = {
  npc: '#e8c27a',
  lore: '#9fb2e6',
  objective: '#d9a441',
  hazard: '#e07a6e',
  landing: '#7cc9e0',
  resource: '#8fd08f',
};
const POI_ORDER: PoiKind[] = ['objective', 'npc', 'lore', 'resource', 'hazard', 'landing'];

// Chart palette (ART_BIBLE.md): cool steel dominant, amber for attention.
const INK = '#eae2d0';
const INK_DIM = 'rgba(234,226,208,0.55)';
const AMBER = '#d9a441';
const CYAN = '#7cc9e0';
const ORBIT_SQUASH = 0.46;
const FONT = 'Rajdhani, "Segoe UI", system-ui, sans-serif';

class MapControllerImpl {
  private view: 'solar' | 'planet' = 'solar';
  private currentPlanetId: string | null = null;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private sidebar!: HTMLDivElement;
  private hitTargets: HitTarget[] = [];
  private rafId = 0;
  private zoom = 1;
  private wasPlayerEnabled = true;
  private startTime = 0;
  private hoveredId: string | null = null;
  private selectedId: string | null = null;
  private resizeObserver: ResizeObserver | null = null;
  // The chart draws each surveyed world with its real surface map (the same equirects the 3D
  // planets render with), so a destination looks like a place, not a coloured dot.
  private planetImages = new Map<string, HTMLImageElement>();

  init(): void {
    bus.on('ui:open_galaxy_map', () => this.open());
  }

  private open(): void {
    this.view = 'solar';
    this.currentPlanetId = null;
    this.startTime = performance.now();
    for (const p of PLANETS) {
      if (!this.planetImages.has(p.id)) {
        const img = new Image();
        img.src = `${import.meta.env.BASE_URL}textures/planets/${p.id}_day.jpg`;
        this.planetImages.set(p.id, img);
      }
    }
    // Open on the most useful world: somewhere you can go that isn't where you are.
    const here = this.currentSceneLocation();
    this.selectedId =
      PLANETS.find((p) => this.isUnlocked(p.id) && p.id !== here)?.id ?? here ?? PLANETS[0].id;
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

  private isUnlocked(id: string): boolean {
    return gameState.data.planetsUnlocked.includes(id);
  }

  /** Which world the player is standing on in the live 3D game, if any (distinct from the chart
   * being browsed). */
  private currentSceneLocation(): string | null {
    const kind = (getActiveEngine()?.getCurrentScene() as { kind?: string } | null)?.kind;
    if (kind === 'KethraScene') return 'kethra';
    if (kind === 'VessekScene') return 'vessek';
    return null;
  }

  private render(): void {
    const wrap = document.createElement('div');
    wrap.className = 'map-panel map-fade-in';

    const chart = document.createElement('div');
    chart.className = 'map-chart';
    const canvas = document.createElement('canvas');
    canvas.className = 'map-canvas';
    chart.appendChild(canvas);
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;

    const planet = this.view === 'planet' ? PLANET_MAPS[this.currentPlanetId!] : null;
    const header = document.createElement('div');
    header.className = 'map-header';
    header.innerHTML = planet
      ? `<div class="map-crumb">${t('map.solar.title')} /</div><div class="map-title-row"><span class="hud-icon">${ICON_PLANET}</span><div class="map-title">${planet.name}</div></div><div class="map-subtitle">${planet.tagline}</div>`
      : `<div class="map-title-row"><span class="hud-icon">${ICON_SOLAR}</span><div class="map-title">${t('map.solar.title')}</div></div><div class="map-subtitle">${t('map.solar.subtitle')}</div>`;
    chart.appendChild(header);

    if (!planet) chart.appendChild(this.buildLegend());

    const hint = document.createElement('div');
    hint.className = 'map-hint';
    hint.textContent = planet ? t('map.hint.surface') : t('map.hint.solar');
    chart.appendChild(hint);

    const sidebar = document.createElement('div');
    sidebar.className = 'map-dossier';
    this.sidebar = sidebar;

    wrap.append(chart, sidebar);

    PanelManager.open(
      wrap,
      () => {
        cancelAnimationFrame(this.rafId);
        this.resizeObserver?.disconnect();
        this.setActivePlayer(true);
      },
      () => this.handleEscape(),
    );

    const resize = () => {
      const rect = chart.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * window.devicePixelRatio));
      canvas.height = Math.max(1, Math.round(rect.height * window.devicePixelRatio));
    };
    resize();
    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(resize);
    this.resizeObserver.observe(chart);

    canvas.addEventListener('click', (e) => this.handleClick(e));
    canvas.addEventListener('mousemove', (e) => this.handleHover(e));
    canvas.addEventListener('mouseleave', () => { this.hoveredId = null; });
    if (planet) canvas.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });

    this.renderSidebar();

    cancelAnimationFrame(this.rafId);
    const loop = () => {
      this.rafId = requestAnimationFrame(loop);
      if (planet) this.drawPlanetMap(planet);
      else this.drawSolarSystem();
    };
    loop();
  }

  private buildLegend(): HTMLDivElement {
    const legend = document.createElement('div');
    legend.className = 'map-legend';
    const row = (swatch: string, key: StringKey) => `<div class="map-legend-row"><span class="map-swatch ${swatch}"></span>${t(key)}</div>`;
    legend.innerHTML =
      row('surveyed', 'map.legend.surveyed') +
      row('unsurveyed', 'map.legend.unsurveyed') +
      row('wren', 'map.legend.wren') +
      row('range', 'map.legend.range') +
      row('belt', 'map.legend.belt');
    return legend;
  }

  // ---------------------------------------------------------------------------------------------
  // Dossier (DOM, rebuilt on selection change)

  private renderSidebar(): void {
    const s = this.sidebar;
    s.innerHTML = '';
    if (this.view === 'planet') this.renderSurveyDossier(s, PLANET_MAPS[this.currentPlanetId!]);
    else this.renderWorldDossier(s, PLANETS.find((p) => p.id === this.selectedId) ?? PLANETS[0]);
  }

  private renderWorldDossier(s: HTMLDivElement, p: PlanetDefinition): void {
    const unlocked = this.isUnlocked(p.id);
    const here = this.currentSceneLocation() === p.id;

    const portrait = document.createElement('div');
    portrait.className = `map-portrait${unlocked ? '' : ' unresolved'}`;
    if (unlocked) portrait.style.backgroundImage = `url(${import.meta.env.BASE_URL}textures/planets/${p.id}_day.jpg)`;
    if (p.hasRing) portrait.classList.add('ringed');
    s.appendChild(portrait);

    const name = document.createElement('div');
    name.className = 'map-dossier-name';
    name.textContent = unlocked ? p.name : t('map.contact.unresolved');
    s.appendChild(name);

    const status = document.createElement('div');
    status.className = `map-status ${here ? 'here' : unlocked ? 'ok' : 'locked'}`;
    status.textContent = here ? t('map.status.here') : unlocked ? t('map.status.inRange') : t('map.status.outOfRange');
    s.appendChild(status);

    const blurb = document.createElement('p');
    blurb.className = 'map-dossier-blurb';
    const note = `map.uncharted.${p.id}`;
    blurb.textContent = unlocked ? p.tagline : t(note in STRINGS ? (note as StringKey) : 'map.uncharted.default');
    s.appendChild(blurb);
    if (unlocked && note in STRINGS) {
      const scan = document.createElement('p');
      scan.className = 'map-dossier-scan';
      scan.textContent = t(note as StringKey);
      s.appendChild(scan);
    }

    const distance = Math.abs(p.orbitRadius - (here ? p.orbitRadius : NAV.SHIP_ORBIT_MKM));
    const days = distance / NAV.CRUISE_MKM_PER_DAY;
    const data: [StringKey, string][] = [
      ['map.data.orbit', `${p.orbitRadius} Mkm`],
      ['map.data.distance', here ? t('map.data.unknown') : `${distance} Mkm`],
      ['map.data.flight', unlocked && !here ? format('map.data.flightValue', { days: +days.toFixed(1), margin: NAV.MARGIN_DAYS }) : t('map.data.unknown')],
      ['map.data.rings', p.hasRing ? t('map.data.yes') : t('map.data.no')],
    ];
    const dl = document.createElement('dl');
    dl.className = 'map-data';
    for (const [k, v] of data) {
      const dt = document.createElement('dt');
      dt.textContent = t(k);
      const dd = document.createElement('dd');
      dd.textContent = v;
      dl.append(dt, dd);
    }
    s.appendChild(dl);

    const actions = document.createElement('div');
    actions.className = 'map-actions';
    const course = this.button(
      here ? t('map.action.here') : !unlocked ? t('map.action.noRange') : TRAVEL_READY.has(p.id) ? t('map.action.setCourse') : t('map.action.notReady'),
      'primary',
      () => this.setCourse(p.id),
    );
    course.disabled = here || !unlocked || !TRAVEL_READY.has(p.id);
    actions.appendChild(course);
    if (unlocked && PLANET_MAPS[p.id]) actions.appendChild(this.button(t('map.action.surface'), 'secondary', () => this.openPlanet(p.id)));
    s.appendChild(actions);
  }

  private renderSurveyDossier(s: HTMLDivElement, config: PlanetMapConfig): void {
    const here = this.currentSceneLocation() === config.planetId;
    const name = document.createElement('div');
    name.className = 'map-dossier-name';
    name.textContent = config.name;
    s.appendChild(name);
    const status = document.createElement('div');
    status.className = `map-status ${here ? 'here' : 'ok'}`;
    status.textContent = here ? t('map.status.here') : t('map.status.inRange');
    s.appendChild(status);

    if (gameState.data.objective) {
      const obj = document.createElement('div');
      obj.className = 'map-objective';
      obj.innerHTML = `<div class="map-section-label">${t('map.survey.objective')}</div>`;
      const text = document.createElement('div');
      text.textContent = gameState.data.objective;
      obj.appendChild(text);
      s.appendChild(obj);
    }

    const label = document.createElement('div');
    label.className = 'map-section-label';
    const found = config.pois.filter((p) => this.poiDiscovered(p)).length;
    label.textContent = `${t('map.survey.title')} · ${found}/${config.pois.length}`;
    s.appendChild(label);

    const list = document.createElement('ul');
    list.className = 'map-survey';
    const sorted = [...config.pois].sort((a, b) => POI_ORDER.indexOf(a.kind) - POI_ORDER.indexOf(b.kind));
    for (const poi of sorted) {
      const discovered = this.poiDiscovered(poi);
      const li = document.createElement('li');
      li.className = discovered ? '' : 'undiscovered';
      if (this.selectedId === poi.id) li.classList.add('selected');
      li.innerHTML = `<span class="map-poi-glyph ${poi.kind}"></span>`;
      li.appendChild(document.createTextNode(discovered ? poi.label : t('map.poi.unexplored')));
      li.onclick = () => this.selectPoi(poi.id);
      list.appendChild(li);
    }
    s.appendChild(list);

    const actions = document.createElement('div');
    actions.className = 'map-actions';
    const course = this.button(here ? t('map.action.here') : t('map.action.setCourse'), 'primary', () => this.setCourse(config.planetId));
    course.disabled = here || !TRAVEL_READY.has(config.planetId);
    actions.append(course, this.button(t('map.action.back'), 'secondary', () => this.handleEscape()));
    s.appendChild(actions);
  }

  private button(label: string, kind: 'primary' | 'secondary', onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = `map-btn ${kind}`;
    b.textContent = label;
    b.onclick = onClick;
    return b;
  }

  private poiDiscovered(poi: PlanetMapPoi): boolean {
    return !poi.discoveredFlag || gameState.hasFlag(poi.discoveredFlag);
  }

  // ---------------------------------------------------------------------------------------------
  // Input and navigation

  private setCourse(planetId: string): void {
    AudioSystem.playChime();
    PanelManager.close();
    bus.emit('galaxy:travel_to', planetId);
  }

  private selectWorld(id: string): void {
    if (this.selectedId === id) return;
    this.selectedId = id;
    AudioSystem.playUiClick();
    this.renderSidebar();
  }

  private selectPoi(id: string): void {
    this.selectedId = id;
    AudioSystem.playUiClick();
    this.renderSidebar();
  }

  private handleEscape(): void {
    if (this.view === 'planet') {
      this.view = 'solar';
      this.selectedId = this.currentPlanetId;
      this.currentPlanetId = null;
      AudioSystem.playUiClick();
      this.render();
    } else {
      PanelManager.close();
    }
  }

  private handleWheel(e: WheelEvent): void {
    e.preventDefault();
    this.zoom = Math.min(2.4, Math.max(0.8, this.zoom - e.deltaY * 0.001));
  }

  private toCanvasSpace(e: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio;
    return { x: (e.clientX - rect.left) * dpr, y: (e.clientY - rect.top) * dpr };
  }

  private hitAt(e: MouseEvent): HitTarget | null {
    const { x, y } = this.toCanvasSpace(e);
    for (const target of this.hitTargets) if (Math.hypot(target.x - x, target.y - y) <= target.r) return target;
    return null;
  }

  private handleClick(e: MouseEvent): void {
    this.hitAt(e)?.onClick();
  }

  private handleHover(e: MouseEvent): void {
    const found = this.hitAt(e);
    this.hoveredId = found?.id ?? null;
    this.canvas.style.cursor = found ? 'pointer' : 'default';
  }

  private openPlanet(planetId: string): void {
    if (!PLANET_MAPS[planetId]) {
      const note = `map.uncharted.${planetId}`;
      UIManager.toast(t(note in STRINGS ? (note as StringKey) : 'map.uncharted.default'));
      return;
    }
    this.view = 'planet';
    this.currentPlanetId = planetId;
    this.selectedId = null;
    this.zoom = 1;
    AudioSystem.playChime();
    this.render();
  }

  // ---------------------------------------------------------------------------------------------
  // Solar chart

  private drawSolarSystem(): void {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    const dpr = window.devicePixelRatio;
    const time = (performance.now() - this.startTime) / 1000;
    this.hitTargets = [];

    this.drawBackdrop(w, h, '#101521', '#05070c');

    const cx = w * 0.5;
    const cy = h * 0.54;
    const maxOrbit = Math.max(...PLANETS.map((p) => p.orbitRadius));
    const scale = Math.min(w * 0.42, (h * 0.36) / ORBIT_SQUASH) / maxOrbit;
    const ellipse = (r: number) => {
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * scale, r * scale * ORBIT_SQUASH, 0, 0, Math.PI * 2);
    };
    const at = (orbit: number, angle: number) => ({
      x: cx + Math.cos(angle) * orbit * scale,
      y: cy + Math.sin(angle) * orbit * scale * ORBIT_SQUASH,
    });

    // Polar grid: bearing spokes and range rings every 30 Mkm, the chart's measuring layer.
    ctx.save();
    ctx.strokeStyle = 'rgba(160,180,220,0.06)';
    ctx.lineWidth = dpr;
    for (let r = 30; r <= maxOrbit + 20; r += 30) {
      ellipse(r);
      ctx.stroke();
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const edge = at(maxOrbit + 18, a);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(edge.x, edge.y);
      ctx.stroke();
    }
    ctx.restore();

    // Asteroid belt: a band of stable specks between two dotted edges.
    ctx.save();
    ctx.fillStyle = 'rgba(200,190,170,0.38)';
    for (let i = 0; i < 420; i++) {
      const a = ((i * 137.508) % 360) * (Math.PI / 180) + time * 0.01;
      const r = NAV.BELT_INNER_MKM + ((i * 7919) % 1000) / 1000 * (NAV.BELT_OUTER_MKM - NAV.BELT_INNER_MKM);
      const p = at(r, a);
      const size = (i % 5 === 0 ? 1.6 : 1) * dpr;
      ctx.fillRect(p.x, p.y, size, size);
    }
    ctx.restore();

    // Scanner range: between the furthest surveyed orbit and the nearest unsurveyed one.
    const unlockedOrbits = PLANETS.filter((p) => this.isUnlocked(p.id)).map((p) => p.orbitRadius);
    const lockedOrbits = PLANETS.filter((p) => !this.isUnlocked(p.id)).map((p) => p.orbitRadius);
    if (lockedOrbits.length > 0) {
      const inner = unlockedOrbits.length > 0 ? Math.max(...unlockedOrbits) : NAV.SHIP_ORBIT_MKM;
      const range = (inner + Math.min(...lockedOrbits)) / 2;
      ctx.save();
      ctx.strokeStyle = 'rgba(217,164,65,0.35)';
      ctx.lineWidth = 1.2 * dpr;
      ctx.setLineDash([6 * dpr, 7 * dpr]);
      ctx.lineDashOffset = -time * 4 * dpr;
      ellipse(range);
      ctx.stroke();
      ctx.restore();
      this.label(t('map.legend.range').toUpperCase(), cx, cy - range * scale * ORBIT_SQUASH - 8 * dpr, 10, 'rgba(217,164,65,0.7)');
    }

    // Orbits.
    for (const p of PLANETS) {
      const unlocked = this.isUnlocked(p.id);
      ctx.save();
      if (!unlocked) ctx.setLineDash([3 * dpr, 6 * dpr]);
      ctx.strokeStyle = unlocked ? 'rgba(190,205,230,0.32)' : 'rgba(180,190,220,0.14)';
      ctx.lineWidth = dpr;
      ellipse(p.orbitRadius);
      ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.strokeStyle = 'rgba(124,201,224,0.22)';
    ctx.setLineDash([2 * dpr, 4 * dpr]);
    ctx.lineWidth = dpr;
    ellipse(NAV.SHIP_ORBIT_MKM);
    ctx.stroke();
    ctx.restore();

    this.drawStar(cx, cy, dpr, time);

    // The Wren: on its parking orbit, or at the world it's landed on.
    const here = PLANETS.find((p) => p.id === this.currentSceneLocation());
    const wren = here ? at(here.orbitRadius, here.orbitAngle) : at(NAV.SHIP_ORBIT_MKM, 0.95);
    const selected = PLANETS.find((p) => p.id === this.selectedId);

    // Course line to the selected reachable world, with its distance and flight time.
    if (selected && this.isUnlocked(selected.id) && selected !== here) {
      const target = at(selected.orbitRadius, selected.orbitAngle);
      ctx.save();
      ctx.strokeStyle = 'rgba(217,164,65,0.75)';
      ctx.lineWidth = 1.5 * dpr;
      ctx.setLineDash([8 * dpr, 6 * dpr]);
      ctx.lineDashOffset = -time * 14 * dpr;
      ctx.beginPath();
      ctx.moveTo(wren.x, wren.y);
      ctx.lineTo(target.x, target.y);
      ctx.stroke();
      ctx.restore();
      const dist = Math.abs(selected.orbitRadius - (here ? here.orbitRadius : NAV.SHIP_ORBIT_MKM));
      const along = { x: wren.x + (target.x - wren.x) * 0.38, y: wren.y + (target.y - wren.y) * 0.38 };
      this.chip(`${dist} Mkm · ${+(dist / NAV.CRUISE_MKM_PER_DAY).toFixed(1)} d`, along.x, along.y - 22 * dpr, AMBER);
    }

    for (const p of PLANETS) this.drawWorld(p, at(p.orbitRadius, p.orbitAngle), dpr, time);

    this.drawWren(wren.x, wren.y, dpr, time);
    this.drawVignette(w, h, cx, cy);
  }

  private drawStar(cx: number, cy: number, dpr: number, time: number): void {
    const ctx = this.ctx;
    const r = 16 * dpr;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(time * 0.04);
    ctx.strokeStyle = 'rgba(255,220,160,0.08)';
    ctx.lineWidth = 2 * dpr;
    for (let i = 0; i < 8; i++) {
      ctx.rotate(Math.PI / 4);
      ctx.beginPath();
      ctx.moveTo(r * 1.6, 0);
      ctx.lineTo(r * 4.2, 0);
      ctx.stroke();
    }
    ctx.restore();
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 5);
    glow.addColorStop(0, 'rgba(255,220,160,0.85)');
    glow.addColorStop(0.3, 'rgba(217,164,65,0.3)');
    glow.addColorStop(1, 'rgba(217,164,65,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 5, 0, Math.PI * 2);
    ctx.fill();
    const disc = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
    disc.addColorStop(0, '#fff6e0');
    disc.addColorStop(0.7, '#ffe3ab');
    disc.addColorStop(1, '#e8b96a');
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawWorld(p: PlanetDefinition, pos: { x: number; y: number }, dpr: number, time: number): void {
    const ctx = this.ctx;
    const unlocked = this.isUnlocked(p.id);
    const hovered = this.hoveredId === p.id;
    const selected = this.selectedId === p.id;
    const radius = (unlocked ? 22 : 13) * dpr * (hovered ? 1.08 : 1);
    const hex = `#${p.color.toString(16).padStart(6, '0')}`;
    const img = this.planetImages.get(p.id);

    if (unlocked) {
      const glow = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, radius * 3);
      glow.addColorStop(0, this.hexToRgba(hex, hovered || selected ? 0.55 : 0.4));
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius * 3, 0, Math.PI * 2);
      ctx.fill();
    }

    if (unlocked && img?.complete && img.naturalWidth > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.clip();
      const crop = img.naturalHeight;
      // Slow rotation: the square crop slides across the equirect.
      const offset = ((time * 6) % (img.naturalWidth - crop));
      ctx.drawImage(img, offset, 0, crop, crop, pos.x - radius, pos.y - radius, radius * 2, radius * 2);
      const toStar = Math.atan2(this.canvas.height * 0.54 - pos.y, this.canvas.width * 0.5 - pos.x);
      const shade = ctx.createRadialGradient(
        pos.x + Math.cos(toStar) * radius * 0.5, pos.y + Math.sin(toStar) * radius * 0.5, radius * 0.2,
        pos.x, pos.y, radius * 1.35,
      );
      shade.addColorStop(0, 'rgba(255,240,215,0.14)');
      shade.addColorStop(0.55, 'rgba(0,0,0,0.05)');
      shade.addColorStop(1, 'rgba(2,4,10,0.75)');
      ctx.fillStyle = shade;
      ctx.fillRect(pos.x - radius, pos.y - radius, radius * 2, radius * 2);
      ctx.restore();
    } else {
      // Unresolved: a dim body with no surface detail; the scanner hasn't resolved it.
      ctx.save();
      ctx.globalAlpha = unlocked ? 1 : 0.45;
      const body = ctx.createRadialGradient(pos.x - radius * 0.3, pos.y - radius * 0.3, 0, pos.x, pos.y, radius);
      body.addColorStop(0, this.hexToRgba(hex, 0.9));
      body.addColorStop(1, this.hexToRgba(hex, 0.25));
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.strokeStyle = selected ? AMBER : unlocked ? 'rgba(234,226,208,0.7)' : 'rgba(234,226,208,0.28)';
    ctx.lineWidth = (selected ? 1.8 : 1.1) * dpr;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.stroke();

    if (p.hasRing) {
      ctx.strokeStyle = unlocked ? 'rgba(234,226,208,0.55)' : 'rgba(234,226,208,0.22)';
      ctx.lineWidth = 1.2 * dpr;
      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y, radius * 1.75, radius * 0.55, -0.35, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (selected) this.drawBrackets(pos.x, pos.y, radius * 1.55, dpr, time);
    else if (hovered) {
      ctx.strokeStyle = 'rgba(217,164,65,0.55)';
      ctx.lineWidth = 1.2 * dpr;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius * 1.45, 0, Math.PI * 2);
      ctx.stroke();
    }

    const name = unlocked ? p.name.toUpperCase() : t('map.contact.unresolved').toUpperCase();
    this.label(name, pos.x, pos.y + radius + 18 * dpr, unlocked ? 14 : 11, selected ? '#ffe9c2' : unlocked ? INK : INK_DIM, 0.12);

    this.hitTargets.push({ x: pos.x, y: pos.y, r: Math.max(radius * 2, 30 * dpr), id: p.id, onClick: () => this.selectWorld(p.id) });
  }

  /** Four amber corner ticks around the selection, breathing slightly. */
  private drawBrackets(x: number, y: number, r: number, dpr: number, time: number): void {
    const ctx = this.ctx;
    const s = r * (1 + 0.04 * Math.sin(time * 3));
    const len = s * 0.4;
    ctx.save();
    ctx.strokeStyle = AMBER;
    ctx.lineWidth = 1.8 * dpr;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      ctx.beginPath();
      ctx.moveTo(x + sx * s, y + sy * (s - len));
      ctx.lineTo(x + sx * s, y + sy * s);
      ctx.lineTo(x + sx * (s - len), y + sy * s);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawWren(x: number, y: number, dpr: number, time: number): void {
    const ctx = this.ctx;
    const ping = (time * 0.55) % 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = `rgba(124,201,224,${(0.55 * (1 - ping)).toFixed(3)})`;
    ctx.lineWidth = 1.2 * dpr;
    ctx.beginPath();
    ctx.arc(0, 0, (7 + ping * 18) * dpr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = CYAN;
    ctx.strokeStyle = '#05070c';
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    ctx.moveTo(0, -8 * dpr);
    ctx.lineTo(6 * dpr, 7 * dpr);
    ctx.lineTo(0, 4 * dpr);
    ctx.lineTo(-6 * dpr, 7 * dpr);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.restore();
    this.label(t('map.label.wren'), x, y + 22 * dpr, 11, CYAN, 0.2);
  }

  // ---------------------------------------------------------------------------------------------
  // Surface chart

  /** Uniform world-to-canvas mapping (the old chart stretched X and Z by different amounts). */
  private surfaceTransform(config: PlanetMapConfig, w: number, h: number) {
    const { minX, maxX, minZ, maxZ } = config.bounds;
    const scale = Math.min(w / (maxX - minX), h / (maxZ - minZ)) * 0.86 * this.zoom;
    const midX = (minX + maxX) / 2;
    const midZ = (minZ + maxZ) / 2;
    return {
      scale,
      at: (x: number, z: number) => ({ x: w / 2 + (x - midX) * scale, y: h / 2 + (midZ - z) * scale }),
    };
  }

  private drawPlanetMap(config: PlanetMapConfig): void {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    const dpr = window.devicePixelRatio;
    const time = (performance.now() - this.startTime) / 1000;
    this.hitTargets = [];

    this.drawBackdrop(w, h, '#0f2019', '#050b09');
    const { scale, at } = this.surfaceTransform(config, w, h);

    // Survey grid in world metres: 5 m minor lines, 10 m majors.
    ctx.save();
    const origin = at(0, 0);
    for (let m = -40; m <= 40; m += 5) {
      ctx.strokeStyle = m % 10 === 0 ? 'rgba(140,200,170,0.09)' : 'rgba(140,200,170,0.04)';
      ctx.lineWidth = dpr;
      const gx = origin.x + m * scale;
      const gy = origin.y + m * scale;
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, h);
      ctx.moveTo(0, gy);
      ctx.lineTo(w, gy);
      ctx.stroke();
    }
    ctx.restore();

    // Canopy glow: stable bioluminescent specks, so the grove reads as alive around the terraces.
    ctx.save();
    for (let i = 0; i < 260; i++) {
      const wx = config.bounds.minX + (((i * 7919) % 1000) / 1000) * (config.bounds.maxX - config.bounds.minX);
      const wz = config.bounds.minZ + (((i * 104729) % 1000) / 1000) * (config.bounds.maxZ - config.bounds.minZ);
      const p = at(wx, wz);
      const pulse = 0.5 + 0.5 * Math.sin(time * 0.8 + i);
      ctx.fillStyle = `rgba(110,230,170,${(0.08 + 0.12 * pulse).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, (1 + (i % 3)) * dpr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Terrain: slabs drawn to scale, lighter as they rise, ramps hatched.
    const terrain = [...(config.terrain ?? [])].sort((a, b) => a.elevation - b.elevation);
    for (const slab of terrain) {
      const tl = at(slab.x - slab.w / 2, slab.z + slab.d / 2);
      const sw = slab.w * scale;
      const sh = slab.d * scale;
      const lift = Math.min(1, slab.elevation / 2.4);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = 10 * dpr;
      ctx.shadowOffsetY = 3 * dpr * (1 + lift * 2);
      ctx.fillStyle = slab.kind === 'ramp'
        ? `rgba(120,150,135,${0.28 + lift * 0.2})`
        : `rgba(${Math.round(64 + lift * 40)},${Math.round(92 + lift * 40)},${Math.round(80 + lift * 30)},0.85)`;
      this.roundRect(tl.x, tl.y, sw, sh, (slab.kind === 'ramp' ? 2 : 6) * dpr);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = slab.kind === 'ramp' ? 'rgba(180,220,195,0.25)' : 'rgba(190,230,205,0.45)';
      ctx.lineWidth = dpr;
      this.roundRect(tl.x, tl.y, sw, sh, (slab.kind === 'ramp' ? 2 : 6) * dpr);
      ctx.stroke();
      if (slab.kind === 'ramp') {
        // Hatching along the slope direction marks a way up.
        ctx.save();
        this.roundRect(tl.x, tl.y, sw, sh, 2 * dpr);
        ctx.clip();
        ctx.strokeStyle = 'rgba(190,230,205,0.18)';
        const step = 5 * dpr;
        const alongX = slab.w > slab.d;
        for (let o = 0; o < (alongX ? sw : sh); o += step) {
          ctx.beginPath();
          if (alongX) { ctx.moveTo(tl.x + o, tl.y); ctx.lineTo(tl.x + o, tl.y + sh); } else { ctx.moveTo(tl.x, tl.y + o); ctx.lineTo(tl.x + sw, tl.y + o); }
          ctx.stroke();
        }
        ctx.restore();
      } else if (slab.labelKey && slab.labelKey in STRINGS) {
        this.label(t(slab.labelKey as StringKey).toUpperCase(), tl.x + sw / 2, tl.y + 14 * dpr, 10, 'rgba(200,235,215,0.5)', 0.18);
      }
    }

    // POIs, with a dark halo so they read against any terrain. Glyphs first, labels after, so no
    // glyph ever covers a label; each label takes the first free slot around its glyph.
    const labels: { text: string; x: number; y: number; r: number; color: string; priority: boolean }[] = [];
    for (const poi of config.pois) {
      const discovered = this.poiDiscovered(poi);
      const p = at(poi.x, poi.z);
      const hovered = this.hoveredId === poi.id;
      const selected = this.selectedId === poi.id;
      const r = (hovered || selected ? 9 : 8) * dpr;
      ctx.save();
      ctx.fillStyle = 'rgba(5,11,9,0.8)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 1.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = discovered ? 1 : 0.4;
      this.drawPoiGlyph(p.x, p.y, r, poi.kind, POI_COLOR[poi.kind]);
      ctx.restore();
      if (selected) this.drawBrackets(p.x, p.y, r * 2, dpr, time);
      if (discovered || hovered || selected) {
        labels.push({ text: discovered ? poi.label : t('map.poi.unexplored'), x: p.x, y: p.y, r, color: discovered ? INK : INK_DIM, priority: hovered || selected });
      }
      this.hitTargets.push({ x: p.x, y: p.y, r: r * 2.4, id: poi.id, onClick: () => this.selectPoi(poi.id) });
    }

    this.placeLabels(labels, dpr, config.pois.map((poi) => { const q = at(poi.x, poi.z); const g = 14 * dpr; return { x0: q.x - g, y0: q.y - g, x1: q.x + g, y1: q.y + g }; }));

    // Live player position and facing.
    const scene = getActiveEngine()?.getCurrentScene() as { player?: { rig: { position: { x: number; z: number } }; yaw: number } } | null;
    if (scene?.player && this.currentSceneLocation() === config.planetId) {
      const pos = scene.player.rig.position;
      const p = at(pos.x, pos.z);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(scene.player.yaw);
      const cone = ctx.createRadialGradient(0, 0, 0, 0, 0, 46 * dpr);
      cone.addColorStop(0, 'rgba(255,227,171,0.35)');
      cone.addColorStop(1, 'rgba(255,227,171,0)');
      ctx.fillStyle = cone;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 46 * dpr, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffe3ab';
      ctx.strokeStyle = '#05070c';
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      ctx.moveTo(0, -10 * dpr);
      ctx.lineTo(7 * dpr, 9 * dpr);
      ctx.lineTo(0, 5 * dpr);
      ctx.lineTo(-7 * dpr, 9 * dpr);
      ctx.closePath();
      ctx.stroke();
      ctx.fill();
      ctx.restore();
    }

    this.drawScaleBar(w, h, scale, dpr);
    this.drawCompass(w, dpr);
    this.drawVignette(w, h, w / 2, h / 2);
  }

  private drawScaleBar(w: number, h: number, scale: number, dpr: number): void {
    const ctx = this.ctx;
    const len = 10 * scale;
    const x = w - len - 28 * dpr;
    const y = h - 44 * dpr;
    ctx.save();
    ctx.strokeStyle = INK_DIM;
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    ctx.moveTo(x, y - 5 * dpr);
    ctx.lineTo(x, y);
    ctx.lineTo(x + len, y);
    ctx.lineTo(x + len, y - 5 * dpr);
    ctx.stroke();
    ctx.restore();
    this.label(t('map.scale'), x + len / 2, y - 9 * dpr, 11, INK_DIM);
  }

  private drawCompass(w: number, dpr: number): void {
    const ctx = this.ctx;
    const x = w - 40 * dpr;
    const y = 44 * dpr;
    ctx.save();
    ctx.strokeStyle = 'rgba(234,226,208,0.35)';
    ctx.lineWidth = dpr;
    ctx.beginPath();
    ctx.arc(x, y, 16 * dpr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = AMBER;
    ctx.beginPath();
    ctx.moveTo(x, y - 13 * dpr);
    ctx.lineTo(x + 4 * dpr, y);
    ctx.lineTo(x - 4 * dpr, y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    this.label('N', x, y + 30 * dpr, 11, INK_DIM);
  }

  // ---------------------------------------------------------------------------------------------
  // Shared drawing

  private drawBackdrop(w: number, h: number, inner: string, outer: string): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);
    const bg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
    bg.addColorStop(0, inner);
    bg.addColorStop(1, outer);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    // Stable starfield / speckle (index-hashed, not random per frame).
    ctx.save();
    for (let i = 0; i < 260; i++) {
      ctx.globalAlpha = 0.12 + ((i * 31) % 100) / 100 * 0.3;
      ctx.fillStyle = '#dfe6f5';
      const s = (i % 9 === 0 ? 1.5 : 0.8) * window.devicePixelRatio;
      ctx.fillRect(((i * 97) % 1000) / 1000 * w, ((i * 53 + 17) % 1000) / 1000 * h, s, s);
    }
    ctx.restore();
  }

  private drawVignette(w: number, h: number, cx: number, cy: number): void {
    const vig = this.ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.38, cx, cy, Math.max(w, h) * 0.75);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(2,3,7,0.5)');
    this.ctx.fillStyle = vig;
    this.ctx.fillRect(0, 0, w, h);
  }

  private label(text: string, x: number, y: number, px: number, color: string, tracking = 0.06): void {
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio;
    ctx.save();
    ctx.font = `600 ${px * dpr}px ${FONT}`;
    ctx.letterSpacing = `${(px * tracking * dpr).toFixed(1)}px`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 6 * dpr;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  /** Places chip labels without overlaps: hovered/selected first, then below, above, right, left of
   * each glyph, avoiding other labels and every glyph; a label with no free slot is dropped (hover or
   * selection still shows it, since those place first). */
  private placeLabels(
    items: { text: string; x: number; y: number; r: number; color: string; priority: boolean }[],
    dpr: number,
    obstacles: { x0: number; y0: number; x1: number; y1: number }[],
  ): void {
    // Glyphs count as taken space too, so a label never hides another point of interest.
    const placed = [...obstacles];
    const overlaps = (b: { x0: number; y0: number; x1: number; y1: number }) =>
      placed.some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0);
    const ordered = [...items].sort((a, b) => Number(b.priority) - Number(a.priority));
    for (const it of ordered) {
      const { w, h } = this.chipSize(it.text);
      const gap = it.r + 8 * dpr;
      const slots = [
        { x: it.x, y: it.y + gap + h / 2 },
        { x: it.x, y: it.y - gap - h / 2 },
        { x: it.x + gap + w / 2, y: it.y },
        { x: it.x - gap - w / 2, y: it.y },
      ];
      const slot = slots.find((c) => !overlaps({ x0: c.x - w / 2, y0: c.y - h / 2, x1: c.x + w / 2, y1: c.y + h / 2 }));
      if (!slot) continue;
      placed.push({ x0: slot.x - w / 2, y0: slot.y - h / 2, x1: slot.x + w / 2, y1: slot.y + h / 2 });
      this.chip(it.text, slot.x, slot.y, it.color);
    }
  }

  private chipSize(text: string): { w: number; h: number } {
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio;
    ctx.save();
    ctx.font = `600 ${12 * dpr}px ${FONT}`;
    ctx.letterSpacing = `${(0.6 * dpr).toFixed(1)}px`;
    const w = ctx.measureText(text).width + 14 * dpr;
    ctx.restore();
    return { w: w + 4 * dpr, h: 22 * dpr };
  }

  /** A label on a dark rounded backing, for text that must read over busy map content. */
  private chip(text: string, x: number, y: number, color: string): void {
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio;
    ctx.save();
    ctx.font = `600 ${12 * dpr}px ${FONT}`;
    ctx.letterSpacing = `${(0.6 * dpr).toFixed(1)}px`;
    const tw = ctx.measureText(text).width;
    const padX = 7 * dpr;
    const bh = 18 * dpr;
    ctx.fillStyle = 'rgba(8,10,14,0.78)';
    this.roundRect(x - tw / 2 - padX, y - bh / 2, tw + padX * 2, bh, 4 * dpr);
    ctx.fill();
    ctx.strokeStyle = 'rgba(234,226,208,0.12)';
    ctx.lineWidth = dpr;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(text, x, y + 0.5 * dpr);
    ctx.restore();
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
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
        ctx.lineTo(x + r, y + r * 0.8);
        ctx.lineTo(x - r, y + r * 0.8);
        ctx.closePath();
        break;
      case 'lore':
        ctx.rect(x - r * 0.7, y - r, r * 1.4, r * 2);
        break;
      case 'resource':
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i - Math.PI / 2;
          if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
          else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
        ctx.closePath();
        break;
      case 'landing':
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.moveTo(x + r * 0.45, y);
        ctx.arc(x, y, r * 0.45, 0, Math.PI * 2, true);
        break;
      default:
        ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fill('evenodd');
    ctx.stroke();
  }

  private hexToRgba(hex: string, alpha: number): string {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
  }
}

export const MapController = new MapControllerImpl();
