// A small in-memory cache for page data that changes rarely (lists, counts, menus).
// The site runs as one small server, so a per-process cache is enough, and unlike Next's
// unstable_cache it keeps Dates as Dates. Data is at most TTL old; nothing here is per visitor.

const TTL_MS = Number(process.env.PAGE_CACHE_SECONDS ?? 300) * 1000;
const store = new Map<string, { expires: number; value: Promise<unknown> }>();

/** Off in tests (each test changes the database) and when PAGE_CACHE_SECONDS=0. */
const enabled = () => !process.env.VITEST && TTL_MS > 0;

/**
 * Wrap an async function so its result is reused for TTL per set of arguments. A call that fails is
 * not kept. Concurrent calls share one database round trip.
 */
export function cached<A extends unknown[], R>(name: string, fn: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  return (...args: A) => {
    if (!enabled()) return fn(...args);
    const key = `${name}:${JSON.stringify(args)}`;
    const now = Date.now();
    const hit = store.get(key);
    if (hit && hit.expires > now) return hit.value as Promise<R>;
    const value = fn(...args);
    store.set(key, { expires: now + TTL_MS, value });
    value.catch(() => store.delete(key));
    if (store.size > 500) {
      for (const [k, v] of store) if (v.expires <= now) store.delete(k);
    }
    return value;
  };
}

/** For tests. */
export function clearCache() {
  store.clear();
}
