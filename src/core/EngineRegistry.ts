import type { Engine } from './Engine';

let activeEngine: Engine | null = null;

export function setActiveEngine(engine: Engine): void {
  activeEngine = engine;
}

export function getActiveEngine(): Engine | null {
  return activeEngine;
}
