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

export class GameState {
  data: GameStateData = {
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
    const nextLevelAt = this.data.level * 100;
    if (this.data.xp >= nextLevelAt) {
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
    const parsed = JSON.parse(json) as GameStateData;
    this.data = parsed;
    bus.emit('state:loaded', this.data);
  }
}

export const gameState = new GameState();
