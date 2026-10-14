/**
 * Runs `load` again after a failure, backing off between attempts: a request dropped by shaky wifi
 * gets another chance before a scene gives up on the file. A file that is really missing fails every
 * attempt and the last error is thrown.
 */
export async function withRetry<T>(load: () => Promise<T>, delaysMs: readonly number[] = [800, 2400]): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await load();
    } catch (err) {
      if (attempt >= delaysMs.length) throw err;
      await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt]));
    }
  }
}

/**
 * Caches a load by key, but not its failure: a rejected load is dropped from `cache`, so the next
 * caller fetches again instead of replaying the error for the rest of the session.
 */
export function cachedLoad<T>(cache: Map<string, Promise<T>>, key: string, load: () => Promise<T>): Promise<T> {
  let pending = cache.get(key);
  if (!pending) {
    const created = withRetry(load);
    pending = created;
    cache.set(key, created);
    created.catch(() => {
      if (cache.get(key) === created) cache.delete(key);
    });
  }
  return pending;
}
