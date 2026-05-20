// Lightweight in-memory TTL cache for heavy read-only aggregations.
// Use cached(key, ttlMs, loader) — repeated calls within the TTL window
// return the same Promise (request coalescing) or cached value.
//
// IMPORTANT: This cache is only safe for read-only computed data. Mutation
// endpoints must invalidate explicitly via cacheInvalidate(prefix). Never
// cache mutation responses themselves.

type Entry<T> = {
  value: T;
  expiresAt: number;
};

type Pending<T> = {
  promise: Promise<T>;
  // Pending entries do not have an expiresAt — they resolve into a real Entry.
};

const cache = new Map<string, Entry<unknown>>();
const pending = new Map<string, Pending<unknown>>();

export async function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const existing = cache.get(key) as Entry<T> | undefined;
  if (existing && existing.expiresAt > now) {
    return existing.value;
  }
  const inflight = pending.get(key) as Pending<T> | undefined;
  if (inflight) return inflight.promise;

  const promise = (async () => {
    try {
      const value = await loader();
      cache.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    } finally {
      pending.delete(key);
    }
  })();
  pending.set(key, { promise });
  return promise;
}

// Synchronous variant for non-async heavy work (e.g. CSV parsing). Falls back
// to recomputing if the cached value is stale.
export function cachedSync<T>(key: string, ttlMs: number, loader: () => T): T {
  const existing = cache.get(key) as Entry<T> | undefined;
  if (existing && existing.expiresAt > Date.now()) {
    return existing.value;
  }
  const value = loader();
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

// Invalidate every cached entry whose key starts with the given prefix.
// Use for mutation endpoints that change the underlying data.
export function cacheInvalidate(prefix: string): number {
  const keysToDelete: string[] = [];
  cache.forEach((_, key) => {
    if (key.startsWith(prefix)) keysToDelete.push(key);
  });
  keysToDelete.forEach(key => cache.delete(key));
  return keysToDelete.length;
}

export function cacheClear(): void {
  cache.clear();
  pending.clear();
}
