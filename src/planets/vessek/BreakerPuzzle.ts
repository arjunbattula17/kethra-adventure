import { gameState } from '../../core/GameState';
import { PanelManager } from '../../ui/PanelManager';
import { AudioSystem } from '../../audio/AudioSystem';
import { BREAKER_NOTES } from './vessekLore';

/**
 * Level 3's critical-path puzzle: bring the ring's power back after the rehearsal pulse, in time to
 * save the hydroponics bay (LORE.md, Level 3: "restores power in the right order before the
 * hydroponics bay freezes").
 *
 * The rules are the ones an engineer would face on a real overloaded bus:
 *  - The bus carries 6 units. Asking for more trips it, and everything drops.
 *  - Every circuit but the regulator needs the regulator; the heaters also need the pumps.
 *  - Two circuits (dock lights, hall lamps) switch themselves back on after every trip.
 * The goal (heaters and scrubbers running) needs exactly 6 units, so the solution is to switch
 * *off* the lights that came back on their own, including the harbormaster's own hall lamps, and
 * bring the essentials up in dependency order. Every label is a note left by a different crew, so
 * reading the room is how the puzzle is solved.
 *
 * Stats change what the player can see, never whether it can be solved: engineering 2 reads the
 * load rating stamped on each breaker (otherwise a load is learned by switching it on once), and
 * perception 2 notices which circuits came back on by themselves.
 */
export type CircuitId = 'regulator' | 'pumps' | 'heaters' | 'scrubbers' | 'dock' | 'lamps';

interface Circuit {
  id: CircuitId;
  name: string;
  load: number;
  needs: CircuitId[];
  autoReset: boolean;
}

export const CAPACITY = 6;
export const CIRCUITS: Circuit[] = [
  { id: 'regulator', name: 'Bus regulator', load: 1, needs: [], autoReset: false },
  { id: 'pumps', name: 'Circulation pumps', load: 2, needs: ['regulator'], autoReset: false },
  { id: 'heaters', name: 'Hydroponics heaters', load: 2, needs: ['regulator', 'pumps'], autoReset: false },
  { id: 'scrubbers', name: 'Air scrubbers', load: 1, needs: ['regulator'], autoReset: false },
  { id: 'dock', name: 'Dock lights', load: 1, needs: ['regulator'], autoReset: true },
  { id: 'lamps', name: 'Lantern Bay hall lamps', load: 2, needs: ['regulator'], autoReset: true },
];
const GOAL: CircuitId[] = ['heaters', 'scrubbers'];
/** After the pulse the regulator survives, and the two auto-reset circuits snap back on. */
const INITIAL: CircuitId[] = ['regulator', 'dock', 'lamps'];
const TRIP_PENALTY_S = 10;

export interface FrostClock {
  remaining: number;
  total: number;
}

export class BreakerPuzzle {
  private on = new Set<CircuitId>(INITIAL);
  private knownLoads = new Set<CircuitId>();
  private message = '';
  private messageKind: 'info' | 'fail' | 'ok' = 'info';
  private raf = 0;
  private last = 0;
  private root: HTMLElement | null = null;
  onSolved: () => void = () => {};
  /** Ticks the level's frost clock while this panel holds the game paused. */
  tickFrost: (dt: number) => void = () => {};
  frost: FrostClock = { remaining: 150, total: 150 };

  load(): number {
    let sum = 0;
    for (const c of CIRCUITS) if (this.on.has(c.id)) sum += c.load;
    return sum;
  }

  isOn(id: CircuitId): boolean {
    return this.on.has(id);
  }

  /** Back to the state the pulse left: used on a frost-out retry and by the tests. */
  reset(message = ''): void {
    this.on = new Set(INITIAL);
    this.message = message;
    this.messageKind = message ? 'fail' : 'info';
    this.render();
  }

  open(): void {
    this.message = '';
    this.root = document.createElement('div');
    this.root.className = 'panel breaker-panel';
    this.root.id = 'breaker-panel';
    PanelManager.open(this.root, () => {
      cancelAnimationFrame(this.raf);
      this.root = null;
    }, undefined, 'breakers');
    this.render();
    this.last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.tickFrost(dt);
      this.renderFrost();
      if (this.root) this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  toggle(id: CircuitId): void {
    const circuit = CIRCUITS.find((c) => c.id === id)!;
    if (this.on.has(id)) {
      this.on.delete(id);
      // Anything that depends on this circuit drops with it.
      for (const c of CIRCUITS) if (c.needs.includes(id)) this.on.delete(c.id);
      this.say(`${circuit.name} off.`, 'info');
      AudioSystem.playCancel();
    } else {
      const missing = circuit.needs.find((n) => !this.on.has(n));
      if (missing) {
        const need = CIRCUITS.find((c) => c.id === missing)!;
        this.say(
          id === 'heaters' && missing === 'pumps'
            ? 'The heaters click and trip straight back off: no coolant flow. The pumps have to run first.'
            : `${circuit.name} won’t hold without the ${need.name.toLowerCase()}.`,
          'fail',
        );
        AudioSystem.playError();
      } else if (this.load() + circuit.load > CAPACITY) {
        const asked = this.load() + circuit.load;
        this.knownLoads.add(id);
        this.on = new Set(INITIAL);
        this.frost.remaining = Math.max(1, this.frost.remaining - TRIP_PENALTY_S);
        this.say(
          `Overload: that asked for ${asked} units and the bus carries ${CAPACITY}. Everything dropped, and the dock lights and hall lamps came back on by themselves.`,
          'fail',
        );
        AudioSystem.playError();
      } else {
        this.on.add(id);
        this.knownLoads.add(id);
        this.say(`${circuit.name} on.`, 'ok');
        AudioSystem.playConfirm();
      }
    }
    if (GOAL.every((g) => this.on.has(g))) {
      this.render();
      this.solve();
      return;
    }
    this.render();
  }

  private say(text: string, kind: 'info' | 'fail' | 'ok'): void {
    this.message = text;
    this.messageKind = kind;
  }

  private solve(): void {
    cancelAnimationFrame(this.raf);
    AudioSystem.playSuccess();
    window.setTimeout(() => {
      PanelManager.close();
      this.onSolved();
    }, 900);
  }

  private renderFrost(): void {
    const bar = this.root?.querySelector<HTMLElement>('.frost-fill');
    const label = this.root?.querySelector<HTMLElement>('.frost-label');
    if (!bar || !label) return;
    const f = Math.max(0, this.frost.remaining / this.frost.total);
    bar.style.transform = `scaleX(${f})`;
    label.textContent = `Hydroponics bay: ${(1 + 11 * f).toFixed(1)} °C and falling`;
  }

  private render(): void {
    if (!this.root) return;
    const eng = gameState.data.attributes.engineering >= 2;
    const per = gameState.data.attributes.perception >= 2;
    const load = this.load();
    this.root.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'panel-head';
    head.innerHTML = `<div class="eyebrow">Lantern Bay · breaker gallery</div><h2>Bring the ring back</h2>
      <p class="subtitle">Keep the <b>heaters</b> and <b>air scrubbers</b> running. The bus can carry ${CAPACITY} units.</p>`;
    this.root.appendChild(head);

    const frost = document.createElement('div');
    frost.className = 'frost';
    frost.innerHTML = `<div class="frost-label"></div><div class="bar"><div class="frost-fill"></div></div>`;
    this.root.appendChild(frost);

    const meter = document.createElement('div');
    meter.className = 'bus-meter';
    meter.setAttribute('aria-label', `Bus load ${load} of ${CAPACITY}`);
    let cells = '';
    for (let i = 0; i < CAPACITY; i++) cells += `<span class="cell${i < load ? ' used' : ''}"></span>`;
    meter.innerHTML = `<span class="bus-label">Bus load</span><span class="cells">${cells}</span><span class="bus-value">${load} / ${CAPACITY}</span>`;
    this.root.appendChild(meter);

    const list = document.createElement('div');
    list.className = 'breaker-list';
    for (const c of CIRCUITS) {
      const on = this.on.has(c.id);
      const row = document.createElement('div');
      row.className = `breaker${on ? ' on' : ''}${GOAL.includes(c.id) ? ' goal' : ''}`;
      const loadText = eng || this.knownLoads.has(c.id) ? `${c.load} unit${c.load > 1 ? 's' : ''}` : '? units';
      const auto = per && c.autoReset ? '<span class="tag">came back on by itself</span>' : '';
      row.innerHTML = `
        <div class="breaker-state" aria-hidden="true"></div>
        <div class="breaker-body">
          <div class="breaker-name">${c.name} ${auto}</div>
          <div class="breaker-note">“${BREAKER_NOTES[c.id]}”</div>
        </div>
        <div class="breaker-load">${loadText}</div>`;
      const btn = document.createElement('button');
      btn.className = on ? 'btn secondary' : 'btn primary';
      btn.textContent = on ? 'Switch off' : 'Switch on';
      btn.setAttribute('aria-label', `${on ? 'Switch off' : 'Switch on'} ${c.name}`);
      btn.onclick = () => this.toggle(c.id);
      row.appendChild(btn);
      list.appendChild(row);
    }
    this.root.appendChild(list);

    const msg = document.createElement('div');
    msg.className = `breaker-msg ${this.messageKind}`;
    msg.setAttribute('role', 'status');
    msg.textContent = this.message || (eng ? 'You can read the load rating stamped on each breaker.' : 'Each crew left a note on its breaker.');
    this.root.appendChild(msg);

    const foot = document.createElement('div');
    foot.className = 'panel-foot';
    foot.innerHTML = '<span class="keycap">Esc</span> step back';
    this.root.appendChild(foot);
    this.renderFrost();
  }
}
