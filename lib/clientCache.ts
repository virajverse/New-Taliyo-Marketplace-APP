export type ClientCacheScope =
  | 'catalog'
  | 'banners'
  | 'settings'
  | 'coupons'
  | 'reviews'
  | 'notifications';

interface CachedRecord<T> {
  data: T;
  scope: ClientCacheScope;
  version: number;
  fetchedAt: number;
}

type ScopeVersions = Partial<Record<ClientCacheScope, number>>;

const ENTRY_PREFIX = 'taliyo:swr:entry:';
const VERSIONS_STORAGE_KEY = 'taliyo:swr:versions';
const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000;
const VERSION_COOLDOWN_MS = 8 * 1000;
const ACTIVE_POLL_INTERVAL_MS = 25 * 1000;

const memoryEntries = new Map<string, CachedRecord<unknown>>();
const inFlightFetches = new Map<string, Promise<unknown>>();
const scopeSubscribers = new Map<ClientCacheScope, Set<() => void>>();

let cachedVersions: ScopeVersions | null = null;
let lastVersionCheckAt = 0;
let inFlightVersionSync: Promise<ScopeVersions> | null = null;
let lifecycleAttached = false;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof sessionStorage !== 'undefined';
}

function loadStoredVersions(): ScopeVersions {
  if (cachedVersions) return cachedVersions;
  if (!isBrowser()) return {};
  try {
    const raw = sessionStorage.getItem(VERSIONS_STORAGE_KEY);
    cachedVersions = raw ? (JSON.parse(raw) as ScopeVersions) : {};
  } catch {
    cachedVersions = {};
  }
  return cachedVersions;
}

function saveStoredVersions(next: ScopeVersions): void {
  cachedVersions = next;
  if (!isBrowser()) return;
  try {
    sessionStorage.setItem(VERSIONS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage quota failures
  }
}

function readCachedEntry<T>(url: string): CachedRecord<T> | null {
  const mem = memoryEntries.get(url);
  if (mem) return mem as CachedRecord<T>;
  if (!isBrowser()) return null;
  try {
    const raw = sessionStorage.getItem(`${ENTRY_PREFIX}${url}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedRecord<T>;
    if (!parsed || typeof parsed.fetchedAt !== 'number') return null;
    memoryEntries.set(url, parsed);
    return parsed;
  } catch {
    return null;
  }
}

function writeCachedEntry<T>(url: string, record: CachedRecord<T>): void {
  memoryEntries.set(url, record);
  if (!isBrowser()) return;
  try {
    sessionStorage.setItem(`${ENTRY_PREFIX}${url}`, JSON.stringify(record));
  } catch {
    // ignore storage quota failures
  }
}

/**
 * Purges client memory + sessionStorage entries belonging to one scope (or all scopes).
 */
export function invalidateClientCache(scope: ClientCacheScope | 'all'): void {
  for (const [url, rec] of Array.from(memoryEntries.entries())) {
    if (scope === 'all' || rec.scope === scope) {
      memoryEntries.delete(url);
    }
  }

  if (isBrowser()) {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (!key || !key.startsWith(ENTRY_PREFIX)) continue;
        if (scope === 'all') {
          keysToRemove.push(key);
          continue;
        }
        const raw = sessionStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as { scope?: ClientCacheScope };
        if (parsed?.scope === scope) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => sessionStorage.removeItem(k));
    } catch {
      // ignore storage access issues
    }
  }

  const scopesToNotify: ClientCacheScope[] =
    scope === 'all'
      ? (Array.from(scopeSubscribers.keys()) as ClientCacheScope[])
      : [scope];

  scopesToNotify.forEach((s) => {
    scopeSubscribers.get(s)?.forEach((fn) => fn());
  });
}

function attachGlobalVersionLifecycle(): void {
  if (lifecycleAttached || !isBrowser()) return;
  lifecycleAttached = true;

  const triggerCheck = () => {
    if (document.visibilityState === 'visible') {
      void syncCacheVersions(false);
    }
  };

  window.addEventListener('focus', triggerCheck);
  document.addEventListener('visibilitychange', triggerCheck);
  window.setInterval(() => {
    if (document.visibilityState === 'visible' && scopeSubscribers.size > 0) {
      void syncCacheVersions(false);
    }
  }, ACTIVE_POLL_INTERVAL_MS);
}

/**
 * Checks /api/cache/version (throttled & single-flight) and auto-invalidates any changed scope.
 */
export async function syncCacheVersions(force = false): Promise<ScopeVersions> {
  const prev = loadStoredVersions();
  const now = Date.now();

  if (!force && now - lastVersionCheckAt < VERSION_COOLDOWN_MS && Object.keys(prev).length > 0) {
    return prev;
  }

  if (inFlightVersionSync) {
    return inFlightVersionSync;
  }

  inFlightVersionSync = (async () => {
    try {
      const res = await fetch('/api/cache/version', { cache: 'no-store' });
      if (!res.ok) return prev;
      const json = (await res.json()) as { versions?: ScopeVersions };
      const incoming = json.versions || {};
      lastVersionCheckAt = Date.now();

      const changedScopes: ClientCacheScope[] = [];
      const merged: ScopeVersions = { ...prev };

      (Object.keys(incoming) as ClientCacheScope[]).forEach((scope) => {
        const nextVer = Number(incoming[scope] || 1);
        const prevVer = Number(prev[scope] || 0);
        if (prevVer > 0 && nextVer > prevVer) {
          changedScopes.push(scope);
        }
        merged[scope] = nextVer;
      });

      saveStoredVersions(merged);
      changedScopes.forEach((s) => invalidateClientCache(s));
      return merged;
    } catch {
      return prev;
    } finally {
      inFlightVersionSync = null;
    }
  })();

  return inFlightVersionSync;
}

async function fetchJsonSingleFlight<T>(url: string): Promise<T> {
  const existing = inFlightFetches.get(url);
  if (existing) return existing as Promise<T>;

  const promise = (async () => {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`Request failed (${res.status}) for ${url}`);
    }
    return (await res.json()) as T;
  })();

  inFlightFetches.set(url, promise);
  try {
    return await promise;
  } finally {
    inFlightFetches.delete(url);
  }
}

/**
 * Subscribes a UI component to version-aware SWR data for `url`:
 * - Delivers cached memory/sessionStorage payload synchronously on mount (0ms).
 * - Only hits network on cold miss, TTL expiry, or when Admin bumps `scope` version.
 * - Live-refetches automatically if Admin mutates `scope` while user is active.
 */
export function subscribeSmartFetch<T>(
  url: string,
  scope: ClientCacheScope,
  onData: (data: T, meta: { fromCache: boolean }) => void,
  opts?: { maxAgeMs?: number; onError?: (err: unknown) => void },
): () => void {
  attachGlobalVersionLifecycle();

  const maxAgeMs = opts?.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  let unmounted = false;

  const deliverCachedIfAvailable = () => {
    const entry = readCachedEntry<T>(url);
    if (!entry) return false;
    onData(entry.data, { fromCache: true });
    return true;
  };

  const ensureFresh = async () => {
    try {
      const versions = await syncCacheVersions(false);
      if (unmounted) return;

      const latestVersion = Number(versions[scope] || 1);
      const cached = readCachedEntry<T>(url);
      const isFreshEnough =
        cached !== null &&
        cached.version >= latestVersion &&
        Date.now() - cached.fetchedAt < maxAgeMs;

      if (isFreshEnough) return;

      const fresh = await fetchJsonSingleFlight<T>(url);
      if (unmounted) return;

      const postVersions = loadStoredVersions();
      const stampedVersion = Math.max(latestVersion, Number(postVersions[scope] || 1));
      writeCachedEntry<T>(url, {
        data: fresh,
        scope,
        version: stampedVersion,
        fetchedAt: Date.now(),
      });
      onData(fresh, { fromCache: false });
    } catch (err) {
      if (!unmounted && opts?.onError) {
        opts.onError(err);
      }
    }
  };

  deliverCachedIfAvailable();
  void ensureFresh();

  let subs = scopeSubscribers.get(scope);
  if (!subs) {
    subs = new Set();
    scopeSubscribers.set(scope, subs);
  }
  const onScopeChanged = () => {
    if (!unmounted) void ensureFresh();
  };
  subs.add(onScopeChanged);

  return () => {
    unmounted = true;
    subs?.delete(onScopeChanged);
  };
}
