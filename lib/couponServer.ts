import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { cachedFetch, invalidateCacheKeys } from '@/lib/redisCache';

export const COUPONS_SETTING_KEY = 'platform_coupons';

export interface CouponRecord {
  id?: string;
  code?: string;
  description?: string;
  discount_type?: 'percentage' | 'fixed' | string;
  discount_value?: number | string;
  min_order_amount?: number | string;
  max_discount_amount?: number | string | null;
  starts_at?: string | null;
  expiry_date?: string | null;
  usage_limit?: number | string | null;
  used_count?: number | string | null;
  one_per_user?: boolean;
  first_order_only?: boolean;
  allowed_emails?: string[] | string | null;
  is_private?: boolean;
  is_active?: boolean;
  updated_at?: string;
  [key: string]: unknown;
}

export function parseAllowedEmails(raw?: string[] | string | null): string[] {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : String(raw).split(/[,;\n\s]+/);
  return Array.from(
    new Set(
      list
        .map((e) => String(e || '').trim().toLowerCase())
        .filter((e) => e.includes('@')),
    ),
  );
}

function parseCouponBoundaryDate(rawValue: string, boundary: 'start' | 'end'): Date {
  const clean = rawValue.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return new Date(`${clean}${boundary === 'start' ? 'T00:00:00+05:30' : 'T23:59:59+05:30'}`);
  }
  return new Date(clean);
}

export async function loadCoupons(): Promise<CouponRecord[]> {
  try {
    const { data } = await cachedFetch(
      'taliyo:coupons:list',
      60,
      async () => {
        const { data: row, error } = await supabaseAdmin
          .from('site_settings')
          .select('value')
          .eq('key', COUPONS_SETTING_KEY)
          .maybeSingle();

        if (error || !row?.value) return [];
        const parsed = JSON.parse(row.value);
        return Array.isArray(parsed) ? (parsed as CouponRecord[]) : [];
      },
      { l1TtlSeconds: 10 },
    );
    return data;
  } catch {
    return [];
  }
}

export async function saveCoupons(list: CouponRecord[]): Promise<void> {
  await supabaseAdmin
    .from('site_settings')
    .upsert(
      {
        key: COUPONS_SETTING_KEY,
        value: JSON.stringify(list),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' },
    );
  await invalidateCacheKeys('taliyo:coupons:list', 'taliyo:coupons:active', 'taliyo:site-settings');
}

export function isCouponRedeemable(c: CouponRecord, now = new Date()): { ok: boolean; reason?: string } {
  const code = String(c.code || '').toUpperCase();
  if (!c.is_active) return { ok: false, reason: `Coupon '${code}' is currently disabled` };
  if (c.starts_at) {
    const rawStart = String(c.starts_at).trim();
    const startDt = parseCouponBoundaryDate(rawStart, 'start');
    if (!Number.isNaN(startDt.getTime()) && startDt > now) {
      return { ok: false, reason: `Coupon '${code}' is not active yet (starts ${rawStart})` };
    }
  }
  if (c.expiry_date) {
    const rawExpiry = String(c.expiry_date).trim();
    const expiryDt = parseCouponBoundaryDate(rawExpiry, 'end');
    if (!Number.isNaN(expiryDt.getTime()) && expiryDt < now) {
      return { ok: false, reason: `Coupon '${code}' has expired` };
    }
  }
  const limit = c.usage_limit ? Number(c.usage_limit) : 0;
  const used = Number(c.used_count || 0);
  if (limit > 0 && used >= limit) {
    return { ok: false, reason: `Coupon '${code}' usage limit reached` };
  }
  return { ok: true };
}

/**
 * Determines whether a coupon should be listed in public offers for a viewer.
 * Private coupons stay hidden from listings; targeted coupons appear only for matching emails.
 */
export function isPublicCouponForViewer(c: CouponRecord, viewerEmail?: string | null): boolean {
  if (c.is_private) return false;
  const allowed = parseAllowedEmails(c.allowed_emails);
  if (allowed.length === 0) return true;
  const cleanViewer = viewerEmail ? String(viewerEmail).trim().toLowerCase() : '';
  return Boolean(cleanViewer && allowed.includes(cleanViewer));
}

function buildBookingCustomerFilter(cleanUserId: string, cleanEmail: string): string {
  if (cleanUserId && cleanEmail) {
    return `user_id.eq.${cleanUserId},email.eq.${cleanEmail},customer_email.eq.${cleanEmail}`;
  }
  if (cleanUserId) {
    return `user_id.eq.${cleanUserId}`;
  }
  return `email.eq.${cleanEmail},customer_email.eq.${cleanEmail}`;
}

/**
 * Checks whether a customer has any prior non-cancelled booking (used for first-order-only coupons).
 */
export async function hasCustomerPriorOrders(
  userId?: string | null,
  email?: string | null,
): Promise<boolean> {
  const cleanUserId = userId ? String(userId).trim() : '';
  const cleanEmail = email ? String(email).trim().toLowerCase() : '';
  if (!cleanUserId && !cleanEmail) return false;

  try {
    const { count, error } = await supabaseAdmin
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .neq('status', 'cancelled')
      .or(buildBookingCustomerFilter(cleanUserId, cleanEmail));

    if (error) return false;
    return (count || 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Enforces audience & per-customer eligibility rules (allowed emails, first order only, one per user).
 */
export async function checkCouponCustomerEligibility(
  coupon: CouponRecord,
  userId?: string | null,
  email?: string | null,
): Promise<{ ok: boolean; reason?: string }> {
  const code = String(coupon.code || '').trim().toUpperCase();
  const cleanUserId = userId ? String(userId).trim() : '';
  const cleanEmail = email ? String(email).trim().toLowerCase() : '';

  const allowed = parseAllowedEmails(coupon.allowed_emails);
  if (allowed.length > 0) {
    if (!cleanEmail) {
      return {
        ok: false,
        reason: `Enter your email or sign in to check eligibility for '${code}'`,
      };
    }
    if (!allowed.includes(cleanEmail)) {
      return {
        ok: false,
        reason: `Coupon '${code}' is restricted to selected customer accounts`,
      };
    }
  }

  if (coupon.first_order_only) {
    if (!cleanUserId && !cleanEmail) {
      return {
        ok: false,
        reason: `Sign in or enter your email to verify first-order eligibility for '${code}'`,
      };
    }
    const hasPrior = await hasCustomerPriorOrders(cleanUserId, cleanEmail);
    if (hasPrior) {
      return {
        ok: false,
        reason: `Coupon '${code}' is valid on first orders only`,
      };
    }
  }

  if (coupon.one_per_user && (cleanUserId || cleanEmail)) {
    const alreadyUsed = await hasUserUsedCoupon(code, cleanUserId, cleanEmail);
    if (alreadyUsed) {
      return {
        ok: false,
        reason: `Coupon '${code}' has already been used on your account`,
      };
    }
  }

  return { ok: true };
}

/**
 * Checks whether a given user (by user_id or email) has already redeemed this coupon on any non-cancelled booking.
 */
export async function hasUserUsedCoupon(
  rawCode: string,
  userId?: string | null,
  email?: string | null,
): Promise<boolean> {
  const cleanCode = String(rawCode || '').trim().toUpperCase();
  const cleanUserId = userId ? String(userId).trim() : '';
  const cleanEmail = email ? String(email).trim().toLowerCase() : '';
  if (!cleanCode || (!cleanUserId && !cleanEmail)) return false;

  try {
    let query = supabaseAdmin
      .from('bookings')
      .select('id, status, additional_notes')
      .neq('status', 'cancelled')
      .limit(100);

    if (cleanUserId && cleanEmail) {
      query = query.or(`user_id.eq.${cleanUserId},email.eq.${cleanEmail},customer_email.eq.${cleanEmail}`);
    } else if (cleanUserId) {
      query = query.eq('user_id', cleanUserId);
    } else {
      query = query.or(`email.eq.${cleanEmail},customer_email.eq.${cleanEmail}`);
    }

    const { data, error } = await query;
    if (error || !Array.isArray(data)) return false;

    return data.some((row) => {
      if (!row?.additional_notes) return false;
      try {
        const parsed =
          typeof row.additional_notes === 'string'
            ? (JSON.parse(row.additional_notes) as { couponCode?: string })
            : (row.additional_notes as { couponCode?: string });
        return String(parsed?.couponCode || '').toUpperCase() === cleanCode;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

export function evaluateCoupon(
  allCoupons: CouponRecord[],
  rawCode: string,
  orderAmount: number,
):
  | {
      valid: true;
      coupon: CouponRecord;
      code: string;
      discountType: string;
      discountValue: number;
      discountAmount: number;
      finalAmount: number;
      message: string;
    }
  | { valid: false; message: string } {
  const cleanCode = String(rawCode || '').trim().toUpperCase();
  if (!cleanCode) return { valid: false, message: 'Please enter a coupon code' };

  const coupon = allCoupons.find((c) => String(c.code || '').toUpperCase() === cleanCode);
  if (!coupon) return { valid: false, message: `Coupon '${cleanCode}' is not valid` };

  const status = isCouponRedeemable(coupon);
  if (!status.ok) return { valid: false, message: status.reason || 'Coupon unavailable' };

  const minAmt = Number(coupon.min_order_amount || 0);
  if (minAmt > 0 && orderAmount < minAmt) {
    return {
      valid: false,
      message: `Minimum order amount of ₹${minAmt.toLocaleString('en-IN')} required for this coupon`,
    };
  }

  const val = Number(coupon.discount_value || 0);
  let discountAmount = 0;
  if (coupon.discount_type === 'percentage') {
    discountAmount = Math.round((orderAmount * val) / 100);
    const maxCap = coupon.max_discount_amount ? Number(coupon.max_discount_amount) : 0;
    if (maxCap > 0 && discountAmount > maxCap) {
      discountAmount = maxCap;
    }
  } else {
    discountAmount = Math.min(val, orderAmount);
  }

  const finalAmount = Math.max(0, orderAmount - discountAmount);
  const message =
    coupon.discount_type === 'percentage'
      ? `Coupon applied! You saved ${val}% (₹${discountAmount.toLocaleString('en-IN')})`
      : `Coupon applied! You saved ₹${discountAmount.toLocaleString('en-IN')}`;

  return {
    valid: true,
    coupon,
    code: String(coupon.code || cleanCode),
    discountType: String(coupon.discount_type || 'fixed'),
    discountValue: val,
    discountAmount,
    finalAmount,
    message,
  };
}

export async function incrementCouponUsage(rawCode: string): Promise<void> {
  const cleanCode = String(rawCode || '').trim().toUpperCase();
  if (!cleanCode) return;
  try {
    const list = await loadCoupons();
    let changed = false;
    const next = list.map((c) => {
      if (String(c.code || '').toUpperCase() === cleanCode) {
        changed = true;
        return {
          ...c,
          used_count: Number(c.used_count || 0) + 1,
          updated_at: new Date().toISOString(),
        };
      }
      return c;
    });
    if (changed) await saveCoupons(next);
  } catch (e) {
    console.warn('Coupon usage increment notice:', e);
  }
}
