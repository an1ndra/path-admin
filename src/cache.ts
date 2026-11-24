/**
 * A tiny in-memory data cache shared by the page hooks. The admin console is a
 * single-user control surface, so a full query library would be overkill; this
 * exists to make revisiting a page show its last data while the fresh request
 * runs in the background.
 */
const store = new Map<string, unknown>();

export function cacheGet<T>(key: string): T | undefined {
  return store.get(key) as T | undefined;
}

export function cacheSet<T>(key: string, value: T): void {
  store.set(key, value);
}

/** Cleared whenever the session changes so one token never sees another's data. */
export function cacheClear(): void {
  store.clear();
}
