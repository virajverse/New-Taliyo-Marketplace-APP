import { supabase } from '@/lib/supabaseClient';

const GUEST_WISHLIST_KEY = 'taliyo_guest_wishlist';

export function getGuestWishlistIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(GUEST_WISHLIST_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function setGuestWishlistIds(ids: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(GUEST_WISHLIST_KEY, JSON.stringify(Array.from(new Set(ids))));
    window.dispatchEvent(new Event('taliyo_wishlist_updated'));
  } catch {}
}

/**
 * Fetches saved service IDs for the current user (Supabase `wishlists` if signed in, else `localStorage`).
 */
export async function fetchSavedWishlistServiceIds(): Promise<{
  userId: string | null;
  serviceIds: string[];
}> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user?.id) {
      const { data } = await supabase
        .from('wishlists')
        .select('service_id')
        .eq('user_id', user.id);
      const dbIds = (data || [])
        .map((row: { service_id?: string }) => row.service_id)
        .filter((id): id is string => Boolean(id));
      return { userId: user.id, serviceIds: dbIds };
    }
  } catch {}

  return { userId: null, serviceIds: getGuestWishlistIds() };
}

/**
 * Toggles a service in the user's wishlist (persisted to Supabase when signed in, or `localStorage` for guests).
 */
export async function toggleWishlistService(
  serviceId: string,
  currentlySaved: boolean
): Promise<boolean> {
  const nextState = !currentlySaved;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user?.id) {
      if (nextState) {
        const { data: existing } = await supabase
          .from('wishlists')
          .select('id')
          .eq('user_id', user.id)
          .eq('service_id', serviceId)
          .maybeSingle();
        if (!existing) {
          await supabase.from('wishlists').insert({ user_id: user.id, service_id: serviceId });
        }
      } else {
        await supabase
          .from('wishlists')
          .delete()
          .eq('user_id', user.id)
          .eq('service_id', serviceId);
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('taliyo_wishlist_updated'));
      }
      return nextState;
    }
  } catch {}

  const current = getGuestWishlistIds();
  const updated = nextState
    ? Array.from(new Set([...current, serviceId]))
    : current.filter((id) => id !== serviceId);
  setGuestWishlistIds(updated);
  return nextState;
}
