/**
 * What the debug harness can do to whatever mini-game or puzzle is running: win it or fail it on
 * the spot. A game registers itself while it runs and unregisters when it ends. With no harness
 * loaded this is one variable and costs nothing.
 */
export interface MiniGameHooks {
  name: string;
  win(): void;
  fail(): void;
}

let active: MiniGameHooks | null = null;

export function registerMiniGame(hooks: MiniGameHooks): () => void {
  active = hooks;
  return () => {
    if (active === hooks) active = null;
  };
}

export function activeMiniGame(): MiniGameHooks | null {
  return active;
}
