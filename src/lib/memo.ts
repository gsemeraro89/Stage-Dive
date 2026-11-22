// A small in-memory cache for page data that changes rarely (lists, counts, menus).
// The site runs as one small server, so a per-process cache is enough, and unlike Next's
// unstable_cache it keeps Dates as Dates. Data is at most TTL old; nothing here is per visitor.
// Capped (least recently used out first): the Render server has 512 MB, and one entry per band,
// venue or query would otherwise grow without limit as the catalogue grows.

const TTL_MS = Number(process.env.PAGE_CACHE_SECONDS ?? 300) * 1000;
/** Most entries kept at once. */
export const MEMO_MAX_ENTRIES = 150;
const store = new Map<string, { expires: number; value: Promise<unknown> }>();

/** Off in tests (each test changes the database) and when PAGE_CACHE_SECONDS=0. */
const enabled = () => !process.env.VITEST && TTL_MS > 0;

/** Keep one entry, dropping expired entries and then the least recently used ones beyond the cap. */
export function remember<T>(key: string, value: Promise<T>, now = Date.now(), ttl = TTL_MS, max = MEMO_MAX_ENTRIES): Promise<T> {
  store.delete(key);
  store.set(key, { expires: now + ttl, value });
  value.catch(() => store.delete(key));
  if (store.size > max) {
    for (const [k, v] of store) if (v.expires <= now) store.delete(k);
    // A Map keeps insertion order and a hit re-inserts its key, so the first keys are the least recently used.
    for (const k of store.keys()) {
      if (store.size <= max) break;
      store.delete(k);
    }
  }
  return value;
}

/** A live entry, marked as just used; undefined when missing or expired. */
export function recall<T>(key: string, now = Date.now()): Promise<T> | undefined {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (hit.expires <= now) {
    store.delete(key);
    return undefined;
  }
  store.delete(key);
  store.set(key, hit);
  return hit.value as Promise<T>;
}

/**
 * Wrap an async function so its result is reused for TTL per set of arguments (or `ttlMs`, for data only
 * used by pages rebuilt less often, e.g. hourly). A call that fails is not kept. Concurrent calls share
 * one database round trip.
 */
export function cached<A extends unknown[], R>(name: string, fn: (...args: A) => Promise<R>, ttlMs = TTL_MS): (...args: A) => Promise<R> {
  return (...args: A) => {
    if (!enabled()) return fn(...args);
    const key = `${name}:${JSON.stringify(args)}`;
    return recall<R>(key) ?? remember(key, fn(...args), Date.now(), ttlMs);
  };
}

/** How many entries are kept (for tests). */
export function cacheSize(): number {
  return store.size;
}

/** For tests. */
export function clearCache() {
  store.clear();
}
