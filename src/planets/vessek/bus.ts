/**
 * The Anchorage's ring bus (docs/DESIGN.md §6, "the ring bus, in the world"), with no rendering in
 * it: the circuits, their loads and dependencies, the physical levers' rules, the auto-reset
 * circuits and their lockouts, the rehearsal pulse and the frost clock. The scene turns levers in
 * the world into calls here and draws what this reports. Self-contained, so tools/test-bus-sim.mjs
 * can load it into Node.
 *
 * The rules an engineer would face on a real overloaded bus:
 *  - The bus carries CAPACITY units. Asking for more trips it, and everything but the regulator
 *    drops.
 *  - A circuit won't close without the circuits it needs.
 *  - Two circuits (the dock lights and the Lantern Bay's hall lamps, the lamps of twenty-one ships)
 *    switch themselves back on a while after they go off, unless they are locked out at their
 *    junction boxes in the ducts. That is what trips the bus after the pulse.
 */
export type CircuitId = 'regulator' | 'lamps' | 'dock' | 'fans' | 'school' | 'pumps' | 'heaters' | 'scrubbers';

export interface Circuit {
  id: CircuitId;
  name: string;
  load: number;
  needs: CircuitId[];
  /** Seconds after going off that it switches itself back on; 0 if it never does. */
  autoReset: number;
}

export const CAPACITY = 6;

export const CIRCUITS: Record<CircuitId, Circuit> = {
  regulator: { id: 'regulator', name: 'Bus regulator', load: 1, needs: [], autoReset: 0 },
  lamps: { id: 'lamps', name: 'Lantern Bay hall lamps', load: 2, needs: ['regulator'], autoReset: 22 },
  dock: { id: 'dock', name: 'Dock lights', load: 1, needs: ['regulator'], autoReset: 14 },
  fans: { id: 'fans', name: 'Duct fans', load: 1, needs: ['regulator'], autoReset: 0 },
  school: { id: 'school', name: 'School hold lamps', load: 2, needs: ['regulator'], autoReset: 0 },
  pumps: { id: 'pumps', name: 'Circulation pumps', load: 2, needs: ['regulator'], autoReset: 0 },
  heaters: { id: 'heaters', name: 'Hydroponics heaters', load: 2, needs: ['regulator', 'pumps'], autoReset: 0 },
  scrubbers: { id: 'scrubbers', name: 'Air scrubbers', load: 1, needs: ['regulator'], autoReset: 0 },
};
export const CIRCUIT_IDS = Object.keys(CIRCUITS) as CircuitId[];

/** The ring before the pulse: 5 of 6 units, so the school's lamps need something else switched off. */
export const NORMAL: CircuitId[] = ['regulator', 'lamps', 'dock', 'fans'];
/** Saving the bay: the heaters (and the pumps they need) and the scrubbers, together exactly 6. */
export const GOAL: CircuitId[] = ['heaters', 'scrubbers'];
export const FROST_SECONDS = 150;
/** A trip during the crisis costs the bay this much warmth. */
export const TRIP_PENALTY = 10;

export type BusEvent =
  | { kind: 'on' | 'off'; id: CircuitId }
  | { kind: 'refused'; id: CircuitId; missing: CircuitId[] }
  | { kind: 'trip'; id: CircuitId; load: number }
  | { kind: 'autoReset'; id: CircuitId }
  | { kind: 'restored' }
  | { kind: 'frostOut' };

export type BusPhase = 'normal' | 'crisis' | 'restored';

export class RingBus {
  phase: BusPhase = 'normal';
  on = new Set<CircuitId>(NORMAL);
  /** Auto-reset circuits locked out at their junction boxes: they stay off. */
  locked = new Set<CircuitId>();
  /** Seconds until each auto-reset circuit that is off switches itself back on. */
  timers = new Map<CircuitId, number>();
  frost = { remaining: FROST_SECONDS, total: FROST_SECONDS };
  trips = 0;

  load(): number {
    let sum = 0;
    for (const id of this.on) sum += CIRCUITS[id].load;
    return sum;
  }

  isOn(id: CircuitId): boolean {
    return this.on.has(id);
  }

  goalMet(): boolean {
    return GOAL.every((id) => this.on.has(id));
  }

  /** What a lever does when it is thrown to `on`. */
  throwLever(id: CircuitId, on: boolean): BusEvent {
    if (!on) {
      if (!this.on.has(id)) return { kind: 'off', id };
      this.on.delete(id);
      // Whatever needed it drops with it.
      for (const other of CIRCUIT_IDS) if (this.on.has(other) && CIRCUITS[other].needs.includes(id)) this.throwLever(other, false);
      this.armReset(id);
      return { kind: 'off', id };
    }
    if (this.on.has(id)) return { kind: 'on', id };
    const missing = CIRCUITS[id].needs.filter((n) => !this.on.has(n));
    if (missing.length) return { kind: 'refused', id, missing };
    return this.close(id);
  }

  /** Closes a circuit, tripping the bus if it would carry too much. */
  private close(id: CircuitId): BusEvent {
    const load = this.load() + CIRCUITS[id].load;
    if (load > CAPACITY) {
      this.trip();
      return { kind: 'trip', id, load };
    }
    this.on.add(id);
    this.timers.delete(id);
    return { kind: 'on', id };
  }

  /** Everything but the regulator drops; the auto-resets start their count again. */
  private trip(): void {
    this.trips++;
    for (const id of [...this.on]) if (id !== 'regulator') this.on.delete(id);
    for (const id of CIRCUIT_IDS) this.armReset(id);
    if (this.phase === 'crisis') this.frost.remaining = Math.max(0.01, this.frost.remaining - TRIP_PENALTY);
  }

  private armReset(id: CircuitId): void {
    const t = CIRCUITS[id].autoReset;
    if (t > 0 && !this.locked.has(id) && !this.on.has(id)) this.timers.set(id, t);
  }

  /** Throws a junction box's lockout: that circuit never switches itself back on. */
  lockOut(id: CircuitId): void {
    if (!CIRCUITS[id].autoReset) return;
    this.locked.add(id);
    this.timers.delete(id);
  }

  /**
   * The rehearsal pulse: every grid browns out; the regulator survives. The auto-reset circuits
   * start counting back, and the bay starts to freeze.
   */
  pulse(): void {
    this.phase = 'crisis';
    this.on = new Set<CircuitId>(['regulator']);
    this.timers.clear();
    for (const id of CIRCUIT_IDS) this.armReset(id);
    this.frost.remaining = this.frost.total;
  }

  /** The kind failure: the backup warmers buy another try. Back to just after the pulse; lockouts stay. */
  retry(): void {
    this.pulse();
  }

  /** Advances the auto-resets and, during the crisis, the frost. Returns what happened. */
  update(dt: number): BusEvent[] {
    const events: BusEvent[] = [];
    for (const [id, t] of [...this.timers]) {
      const next = t - dt;
      if (next > 0) {
        this.timers.set(id, next);
        continue;
      }
      this.timers.delete(id);
      if (this.on.has(id) || this.locked.has(id)) continue;
      if (CIRCUITS[id].needs.some((n) => !this.on.has(n))) continue;
      const e = this.close(id);
      events.push(e.kind === 'trip' ? e : { kind: 'autoReset', id });
    }
    if (this.phase === 'crisis') {
      if (this.goalMet()) {
        this.phase = 'restored';
        this.timers.clear();
        events.push({ kind: 'restored' });
      } else {
        this.frost.remaining -= dt;
        if (this.frost.remaining <= 0) {
          this.retry();
          events.push({ kind: 'frostOut' });
        }
      }
    }
    return events;
  }
}
