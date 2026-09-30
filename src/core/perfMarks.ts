/**
 * Named spans on the browser's performance timeline (User Timing). tools/startup-profile.mjs reads
 * them to build the start-up timeline, and they show up in the DevTools Performance panel under
 * "Timings". A measure costs microseconds, so they stay in the production build.
 */
export function span(name: string, start: number, end = performance.now()): void {
  try {
    performance.measure(name, { start, end });
  } catch {
    // Engines without measure options: the timeline is diagnostics only.
  }
}

export function mark(name: string): void {
  try {
    performance.mark(name);
  } catch {
    // as above
  }
}

export function timed<T>(name: string, fn: () => T): T {
  const start = performance.now();
  try {
    return fn();
  } finally {
    span(name, start);
  }
}

export async function timedAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    span(name, start);
  }
}
