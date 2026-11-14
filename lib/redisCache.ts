import { Redis } from '@upstash/redis';

export type CacheScope =
  | 'catalog'
  | 'banners'
  | 'settings'
  | 'coupons'
  | 'reviews'
  | 'notifications';

export const CACHE_SCOPES: readonly CacheScope[] = [
  'catalog',
  'banners',
  'settings',
  'coupons',
  'reviews',
  'notifications',
];

const VERSIONS_KEY = 'taliyo:cache:versions';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const MAX_L1_ENTRIES = 500;
const globalForCache = globalThis as typeof globalThis & {
  __taliyoRedisClient?: Redis | null;
  __taliyoL1Cache?: Map<string, CacheEntry<unknown>>;
  __taliyoInFlight?: Map<string, Promise<unknown>>;
  __taliyoCacheVersions?: Record<CacheScope, number>;
};

const l1Cache = (globalForCache.__taliyoL1Cache ??= new Map<string, CacheEntry<unknown>>());
const inFlight = (globalForCache.__taliyoInFlight ??= new Map<string, Promise<unknown>>());
const localVersions = (globalForCache.__taliyoCacheVersions ??= {
  catalog: 1,
  banners: 1,
  settings: 1,
  coupons: 1,
  reviews: 1,
  notifications: 1,
});

/**
 * Returns a singleton Upstash REST Redis client when configured, or null if absent.
 */
export function getRedisClient(): Redis | null {
  if (globalForCache.__taliyoRedisClient !== undefined) {
    return globalForCache.__taliyoRedisClient;
  }

  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) {
    globalForCache.__taliyoRedisClient = null;
    return null;
  }

  globalForCache.__taliyoRedisClient = new Redis({ url, token });
  return globalForCache.__taliyoRedisClient;
}

function setL1<T>(key: string, value: T, ttlSeconds: number): void {
  if (ttlSeconds <= 0) return;
  if (l1Cache.size >= MAX_L1_ENTRIES) {
    const oldestKey = l1Cache.keys().next().value;
    if (oldestKey) l1Cache.delete(oldestKey);
  }
  l1Cache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

function getL1<T>(key: string): T | null {
  const entry = l1Cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    l1Cache.delete(key);
    return null;
  }
  return entry.value as T;
}

function ttlWithJitter(ttlSeconds: number): number {
  const jitter = 0.9 + Math.random() * 0.2;
  return Math.max(1, Math.round(ttlSeconds * jitter));
}

/**
 * Two-tier cache (short L1 per-worker memory + L2 Upstash Redis) with single-flight coalescing
 * to absorb 10k-20k concurrent requests without cache stampedes or DB overload.
 */
export async function cachedFetch<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
  opts?: { l1TtlSeconds?: number; cacheEmpty?: boolean },
): Promise<{ data: T; cacheLayer: 'l1' | 'redis' | 'origin' }> {
  const l1Ttl = opts?.l1TtlSeconds ?? Math.min(15, ttlSeconds);
  const cacheEmpty = opts?.cacheEmpty ?? true;

  const l1Hit = getL1<T>(key);
  if (l1Hit !== null) {
    return { data: l1Hit, cacheLayer: 'l1' };
  }

  const redis = getRedisClient();
  if (redis) {
    try {
      const redisHit = await redis.get<T>(key);
      if (redisHit !== null && redisHit !== undefined) {
        setL1(key, redisHit, l1Ttl);
        return { data: redisHit, cacheLayer: 'redis' };
      }
    } catch (err) {
      console.warn(`Redis GET notice [${key}]:`, err);
    }
  }

  // Coalesce concurrent misses on the same worker into a single origin load
  const pending = inFlight.get(key);
  if (pending) {
    const shared = (await pending) as T;
    return { data: shared, cacheLayer: 'l1' };
  }

  const loadPromise = (async () => {
    const fresh = await loader();
    const isEmpty =
      fresh === null ||
      fresh === undefined ||
      (Array.isArray(fresh) && fresh.length === 0);

    if (cacheEmpty || !isEmpty) {
      const effectiveTtl = isEmpty ? Math.min(15, ttlSeconds) : ttlSeconds;
      const effectiveL1Ttl = isEmpty ? Math.min(10, l1Ttl) : l1Ttl;
      setL1(key, fresh, effectiveL1Ttl);
      if (redis) {
        try {
          await redis.set(key, fresh, { ex: ttlWithJitter(effectiveTtl) });
        } catch (err) {
          console.warn(`Redis SET notice [${key}]:`, err);
        }
      }
    }
    return fresh;
  })();

  inFlight.set(key, loadPromise);
  try {
    const fresh = await loadPromise;
    return { data: fresh, cacheLayer: 'origin' };
  } finally {
    inFlight.delete(key);
  }
}

/**
 * Deletes specific cache keys from both L1 memory and Upstash Redis.
 */
export async function invalidateCacheKeys(...keys: string[]): Promise<void> {
  if (!keys.length) return;
  keys.forEach((k) => l1Cache.delete(k));

  const redis = getRedisClient();
  if (!redis) return;
  try {
    await redis.unlink(...keys);
  } catch (err) {
    console.warn('Redis UNLINK notice:', err);
  }
}

/**
 * Scans and unlinks all cache keys matching a prefix (never uses blocking KEYS).
 */
export async function invalidateCachePrefix(prefix: string): Promise<void> {
  for (const k of Array.from(l1Cache.keys())) {
    if (k.startsWith(prefix)) l1Cache.delete(k);
  }

  const redis = getRedisClient();
  if (!redis) return;

  try {
    let cursor = '0';
    const match = `${prefix}*`;
    do {
      const [nextCursor, found] = await redis.scan(cursor, { match, count: 100 });
      cursor = String(nextCursor);
      if (Array.isArray(found) && found.length > 0) {
        await redis.unlink(...found);
      }
    } while (cursor !== '0');
  } catch (err) {
    console.warn(`Redis SCAN/UNLINK notice [${prefix}]:`, err);
  }
}

/**
 * Reads current monotonic version numbers per cache scope from L1 / Redis.
 * Clients poll /api/cache/version cheaply so cached views auto-refresh as soon as Admin mutates data.
 */
export async function getCacheVersions(): Promise<Record<CacheScope, number>> {
  const cached = getL1<Record<CacheScope, number>>(VERSIONS_KEY);
  if (cached) {
    return { ...cached };
  }

  const redis = getRedisClient();
  if (redis) {
    try {
      const raw = await redis.hgetall<Record<string, string | number>>(VERSIONS_KEY);
      const merged: Record<CacheScope, number> = { ...localVersions };
      if (raw) {
        for (const s of CACHE_SCOPES) {
          const parsed = Number(raw[s]);
          if (Number.isFinite(parsed) && parsed > 0) {
            merged[s] = Math.max(merged[s], parsed);
            localVersions[s] = merged[s];
          }
        }
      }
      setL1(VERSIONS_KEY, merged, 3);
      return { ...merged };
    } catch (err) {
      console.warn('Redis HGETALL versions notice:', err);
    }
  }

  setL1(VERSIONS_KEY, { ...localVersions }, 3);
  return { ...localVersions };
}

/**
 * Bumps one or all scope version numbers in both L1 memory and Redis.
 */
export async function bumpCacheVersions(
  scope: CacheScope | 'all' = 'all',
): Promise<Record<CacheScope, number>> {
  const scopesToBump: readonly CacheScope[] = scope === 'all' ? CACHE_SCOPES : [scope];
  const now = Date.now();
  const updates: Record<string, number> = {};

  for (const s of scopesToBump) {
    const nextVersion = Math.max(now, (localVersions[s] || 0) + 1);
    localVersions[s] = nextVersion;
    updates[s] = nextVersion;
  }

  l1Cache.delete(VERSIONS_KEY);

  const redis = getRedisClient();
  if (redis && Object.keys(updates).length > 0) {
    try {
      await redis.hset(VERSIONS_KEY, updates);
    } catch (err) {
      console.warn('Redis HSET versions notice:', err);
    }
  }

  setL1(VERSIONS_KEY, { ...localVersions }, 3);
  return { ...localVersions };
}
