type Handler<T = any> = (payload: T) => void;

export class EventBus {
  private listeners = new Map<string, Set<Handler>>();

  on<T = any>(event: string, handler: Handler<T>): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler);
    return () => this.off(event, handler);
  }

  off(event: string, handler: Handler): void {
    this.listeners.get(event)?.delete(handler);
  }

  emit<T = any>(event: string, payload?: T): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const handler of [...set]) handler(payload);
  }
}

export const bus = new EventBus();
