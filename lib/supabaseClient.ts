import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function setCookie(name: string, value: string, remember: boolean) {
  if (typeof document === 'undefined') return;
  try {
    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
    const maxAge = remember ? `; max-age=${30 * 24 * 60 * 60}` : '';
    const secure = isHttps ? '; Secure' : '';
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/${maxAge}; SameSite=Lax${secure}`;
    document.cookie = `sb-auth-token=1; path=/${maxAge}; SameSite=Lax${secure}`;
  } catch {}
}

function clearCookie(name: string) {
  if (typeof document === 'undefined') return;
  try {
    document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
    document.cookie = `sb-auth-token=; path=/; max-age=0; SameSite=Lax`;
  } catch {}
}

const dynamicStorage: StorageAdapter = {
  getItem(key: string): string | null {
    if (typeof window === 'undefined') return null;
    try {
      const useLocal = (localStorage.getItem('rememberMe') || 'true') === 'true';
      const primary = useLocal ? localStorage : sessionStorage;
      const secondary = useLocal ? sessionStorage : localStorage;
      const val = primary.getItem(key) ?? secondary.getItem(key);
      if (val) {
        if ((key.includes('auth-token') || key.startsWith('sb-')) && !document.cookie.includes('sb-auth-token=')) {
          setCookie(key, val, useLocal);
        }
        return val;
      }
    } catch {
      try {
        const val = localStorage.getItem(key);
        if (val) return val;
      } catch {}
      try {
        const val = sessionStorage.getItem(key);
        if (val) return val;
      } catch {}
    }

    try {
      const cookies = document.cookie.split(';');
      for (const cookie of cookies) {
        const eqIdx = cookie.indexOf('=');
        if (eqIdx === -1) continue;
        const k = cookie.slice(0, eqIdx).trim();
        const v = cookie.slice(eqIdx + 1).trim();
        if (k === key && v) {
          return decodeURIComponent(v);
        }
      }
    } catch {}
    return null;
  },
  setItem(key: string, value: string): void {
    if (typeof window === 'undefined') return;
    try {
      const useLocal = (localStorage.getItem('rememberMe') || 'true') === 'true';
      const store = useLocal ? localStorage : sessionStorage;
      store.setItem(key, value);
      if (key.includes('auth-token') || key.startsWith('sb-')) {
        setCookie(key, value, useLocal);
      }
    } catch {}
  },
  removeItem(key: string): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(key);
    } catch {}
    try {
      sessionStorage.removeItem(key);
    } catch {}
    if (key.includes('auth-token') || key.startsWith('sb-')) {
      clearCookie(key);
    }
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: dynamicStorage,
  },
});

export async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (token) {
      return { Authorization: `Bearer ${token}` };
    }
  } catch {}
  return {};
}

export function trackUserLoginAndPwaMap(userId?: string | null, email?: string | null) {
  if (typeof window === 'undefined' || (!userId && !email)) return;
  try {
    fetch('/api/user/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: userId || null, email: email || null }),
      keepalive: true,
    }).catch(() => {});

    const deviceId = localStorage.getItem('pwa_device_id');
    if (deviceId && userId) {
      fetch('/api/pwa-installs/map-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: deviceId,
          user_id: userId,
          user_email: email || null,
        }),
        keepalive: true,
      }).catch(() => {});
    }
  } catch {}
}
