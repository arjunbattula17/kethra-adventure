import { bus } from './EventBus';

export type AttributeKey =
  | 'insight'
  | 'archaeology'
  | 'engineering'
  | 'traversal'
  | 'persuasion'
  | 'perception';

export type ShipSystemKey =
  | 'navigation'
  | 'communications'
  | 'hyperdrive'
  | 'shields'
  | 'lifeSupport'
  | 'scanner'
  | 'powerDistribution';

export interface ShipSystemState {
  label: string;
  damaged: boolean;
  repaired: boolean;
  progress: number; // 0-100
  requiredResource: string | null;
  requiredAmount: number;
  haveAmount: number;
}

export interface JournalLogEntry {
  id: string;
  title: string;
  body: string;
  corrupted: boolean;
  timestamp: string;
  unlocked: boolean;
}

export interface Clue {
  id: string;
  title: string;
  summary: string;
  source: string;
}

export interface ClueConnection {
  a: string;
  b: string;
  insight: string;
}

export interface SceneId {
  scene:
    | 'ship_interior'
    | 'battle_tutorial'
    | 'galaxy_reveal'
    | 'galaxy_map'
    | 'planet_kethra';
}

export interface GameStateData {
  scene: SceneId['scene'];
  flags: string[];
  attributes: Record<AttributeKey, number>;
  xp: number;
  level: number;
  unspentPoints: number;
  shipSystems: Record<ShipSystemKey, ShipSystemState>;
  inventory: string[];
  journalLogs: JournalLogEntry[];
  clues: Clue[];
  clueConnections: ClueConnection[];
  objective: string;
  planetsUnlocked: string[];
  playerPosition: { x: number; y: number; z: number } | null;
}

function defaultShipSystems(): Record<ShipSystemKey, ShipSystemState> {
  return {
    navigation: { label: 'Navigation Array', damaged: true, repaired: false, progress: 0, requiredResource: 'resonant_crystal', requiredAmount: 3, haveAmount: 0 },
    communications: { label: 'Long-Range Comms', damaged: true, repaired: false, progress: 0, requiredResource: 'conduit_alloy', requiredAmount: 2, haveAmount: 0 },
    hyperdrive: { label: 'Hyperdrive Core', damaged: true, repaired: false, progress: 0, requiredResource: 'stellar_core_shard', requiredAmount: 1, haveAmount: 0 },
    shields: { label: 'Deflector Shields', damaged: true, repaired: false, progress: 0, requiredResource: 'conduit_alloy', requiredAmount: 3, haveAmount: 0 },
    lifeSupport: { label: 'Life Support', damaged: false, repaired: true, progress: 100, requiredResource: null, requiredAmount: 0, haveAmount: 0 },
    scanner: { label: 'Deep Scanner', damaged: true, repaired: false, progress: 0, requiredResource: 'resonant_crystal', requiredAmount: 1, haveAmount: 0 },
    powerDistribution: { label: 'Power Distribution', damaged: true, repaired: false, progress: 40, requiredResource: 'conduit_alloy', requiredAmount: 1, haveAmount: 0 },
  };
}

function defaultAttributes(): Record<AttributeKey, number> {
  return { insight: 1, archaeology: 1, engineering: 1, traversal: 1, persuasion: 1, perception: 1 };
}

function defaultState(): GameStateData {
  return {
    scene: 'ship_interior',
    flags: [],
    attributes: defaultAttributes(),
    xp: 0,
    level: 1,
    unspentPoints: 0,
    shipSystems: defaultShipSystems(),
    inventory: [],
    journalLogs: [],
    clues: [],
    clueConnections: [],
    objective: 'Systems rebooting...',
    planetsUnlocked: [],
    playerPosition: null,
  };
}

/**
 * Backfills a parsed save against the current shape.
 *
 * loadFrom used to assign the parsed JSON straight onto `data`, so a save written before a field
 * existed left that field `undefined` and the first read of it threw — and the save shape has kept
 * changing. Starting from the defaults and copying across only what is present and the right type
 * means an old save loads with new fields at their defaults rather than crashing, and a corrupt one
 * degrades to a playable state instead of a TypeError.
 *
 * The two keyed records are merged per key, not wholesale, so an attribute or ship system added
 * after a save was written gets its default entry instead of being missing. Ship systems keep their
 * progress from the save but take `label` from the current code, since that is content rather than
 * player state.
 */
function migrateSave(raw: unknown): GameStateData {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  const saved = raw as Record<string, unknown>;

  const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const str = (v: unknown, d: string): string => (typeof v === 'string' ? v : d);
  const arr = <T,>(v: unknown, d: T[]): T[] => (Array.isArray(v) ? (v as T[]) : d);

  base.scene = str(saved.scene, base.scene) as GameStateData['scene'];
  base.objective = str(saved.objective, base.objective);
  base.xp = Math.max(0, num(saved.xp, base.xp));
  // Clamped to at least 1: gainXp's threshold is level * 100, so a level of 0 from a corrupt save
  // would make its loop never terminate.
  base.level = Math.max(1, Math.floor(num(saved.level, base.level)));
  base.unspentPoints = Math.max(0, Math.floor(num(saved.unspentPoints, base.unspentPoints)));
  base.flags = arr<string>(saved.flags, base.flags);
  base.inventory = arr<string>(saved.inventory, base.inventory);
  base.journalLogs = arr<JournalLogEntry>(saved.journalLogs, base.journalLogs);
  base.clues = arr<Clue>(saved.clues, base.clues);
  base.clueConnections = arr<ClueConnection>(saved.clueConnections, base.clueConnections);
  base.planetsUnlocked = arr<string>(saved.planetsUnlocked, base.planetsUnlocked);

  const pos = saved.playerPosition as GameStateData['playerPosition'];
  base.playerPosition =
    pos && typeof pos === 'object' && typeof pos.x === 'number' && typeof pos.y === 'number' && typeof pos.z === 'number'
      ? { x: pos.x, y: pos.y, z: pos.z }
      : null;

  const savedAttributes = (saved.attributes ?? {}) as Record<string, unknown>;
  for (const key of Object.keys(base.attributes) as AttributeKey[]) {
    base.attributes[key] = num(savedAttributes[key], base.attributes[key]);
  }

  const savedSystems = (saved.shipSystems ?? {}) as Record<string, unknown>;
  for (const key of Object.keys(base.shipSystems) as ShipSystemKey[]) {
    const entry = savedSystems[key];
    if (entry && typeof entry === 'object') {
      base.shipSystems[key] = { ...base.shipSystems[key], ...(entry as Partial<ShipSystemState>), label: base.shipSystems[key].label };
    }
  }

  return base;
}

export class GameState {
  data: GameStateData = defaultState();

  hasFlag(flag: string): boolean {
    return this.data.flags.includes(flag);
  }

  setFlag(flag: string): void {
    if (!this.hasFlag(flag)) {
      this.data.flags.push(flag);
      bus.emit('flag:set', flag);
    }
  }

  setObjective(text: string): void {
    this.data.objective = text;
    bus.emit('objective:changed', text);
  }

  addAttributeXp(key: AttributeKey, amount: number): void {
    this.data.attributes[key] += amount;
    bus.emit('attribute:changed', { key, value: this.data.attributes[key] });
    this.gainXp(amount * 10);
  }

  gainXp(amount: number): void {
    this.data.xp += amount;
    // A loop, not a single check: a grant large enough to cross two thresholds at once used to
    // award one level and carry the rest as xp, quietly under-levelling the player. Terminates
    // because the threshold grows with each level and xp only falls; migrateSave clamps level to
    // at least 1 so the threshold can never be zero.
    for (let nextLevelAt = this.data.level * 100; this.data.xp >= nextLevelAt; nextLevelAt = this.data.level * 100) {
      this.data.xp -= nextLevelAt;
      this.data.level += 1;
      this.data.unspentPoints += 1;
      bus.emit('level:up', this.data.level);
    }
    bus.emit('xp:changed', this.data.xp);
  }

  addClue(clue: Clue): void {
    if (this.data.clues.find((c) => c.id === clue.id)) return;
    this.data.clues.push(clue);
    bus.emit('clue:added', clue);
  }

  connectClues(a: string, b: string, insight: string): void {
    this.data.clueConnections.push({ a, b, insight });
    bus.emit('clue:connected', { a, b, insight });
  }

  unlockLog(id: string): void {
    const log = this.data.journalLogs.find((l) => l.id === id);
    if (log) {
      log.unlocked = true;
      bus.emit('log:unlocked', log);
    }
  }

  addResource(resource: string, amount: number): void {
    for (const key of Object.keys(this.data.shipSystems) as ShipSystemKey[]) {
      const sys = this.data.shipSystems[key];
      if (sys.requiredResource === resource) {
        sys.haveAmount = Math.min(sys.requiredAmount, sys.haveAmount + amount);
      }
    }
    bus.emit('resource:added', { resource, amount });
  }

  canRepair(key: ShipSystemKey): boolean {
    const sys = this.data.shipSystems[key];
    return sys.damaged && !sys.repaired && sys.haveAmount >= sys.requiredAmount;
  }

  repairSystem(key: ShipSystemKey): boolean {
    if (!this.canRepair(key)) return false;
    const sys = this.data.shipSystems[key];
    sys.repaired = true;
    sys.damaged = false;
    sys.progress = 100;
    sys.haveAmount = 0;
    bus.emit('ship:repaired', key);
    return true;
  }

  toJSON(): string {
    return JSON.stringify(this.data);
  }

  loadFrom(json: string): void {
    this.data = migrateSave(JSON.parse(json));
    bus.emit('state:loaded', this.data);
  }
}

export const gameState = new GameState();
