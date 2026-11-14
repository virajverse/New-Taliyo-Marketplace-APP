import crypto from 'crypto';
import { supabaseAdmin } from './supabaseAdmin';
import { PAYMENT_CONFIG } from './paymentConfig';

export const GATEWAY_SETTING_KEY = 'payment_gateway_config';
export const UTR_POOL_KEY = 'verified_utr_pool';

export interface PublicPaymentGatewayConfig {
  upiId: string;
  displayId: string;
  payeeName: string;
  merchantType: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  ifsc: string;
  advancePercent: number;
  autoVerifyEnabled: boolean;
  allowCardFallback: boolean;
  updatedAt?: string;
}

export interface FullPaymentGatewayConfig extends PublicPaymentGatewayConfig {
  autoVerifyWebhookSecret: string;
}

export interface VerifiedUtrEntry {
  utr: string;
  amount: number;
  sender?: string;
  source?: string;
  receivedAt: string;
  matchedBookingId?: string | null;
}

const DEFAULT_PUBLIC_CONFIG: PublicPaymentGatewayConfig = {
  upiId: PAYMENT_CONFIG.upi.id,
  displayId: PAYMENT_CONFIG.upi.displayId,
  payeeName: PAYMENT_CONFIG.upi.payeeName,
  merchantType: PAYMENT_CONFIG.upi.merchantType,
  bankName: PAYMENT_CONFIG.bank.bankName,
  accountName: PAYMENT_CONFIG.bank.accountName,
  accountNumber: PAYMENT_CONFIG.bank.accountNumber,
  ifsc: PAYMENT_CONFIG.bank.ifsc,
  advancePercent: 30,
  autoVerifyEnabled: true,
  allowCardFallback: false,
};

export async function loadGatewayConfig(): Promise<FullPaymentGatewayConfig> {
  const { data } = await supabaseAdmin
    .from('site_settings')
    .select('value')
    .eq('key', GATEWAY_SETTING_KEY)
    .maybeSingle();

  let parsed: Partial<FullPaymentGatewayConfig> = {};
  if (data?.value) {
    try {
      parsed = JSON.parse(data.value);
    } catch {
      parsed = {};
    }
  }

  return {
    ...DEFAULT_PUBLIC_CONFIG,
    ...parsed,
    autoVerifyWebhookSecret: parsed.autoVerifyWebhookSecret || '',
  };
}

export function stripSecretConfig(cfg: FullPaymentGatewayConfig): PublicPaymentGatewayConfig {
  const safeCopy = { ...cfg } as Partial<FullPaymentGatewayConfig>;
  delete safeCopy.autoVerifyWebhookSecret;
  return safeCopy as PublicPaymentGatewayConfig;
}

export async function loadVerifiedUtrPool(): Promise<VerifiedUtrEntry[]> {
  const { data } = await supabaseAdmin
    .from('site_settings')
    .select('value')
    .eq('key', UTR_POOL_KEY)
    .maybeSingle();

  if (!data?.value) return [];
  try {
    const parsed = JSON.parse(data.value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveVerifiedUtrPool(pool: VerifiedUtrEntry[]): Promise<void> {
  await supabaseAdmin
    .from('site_settings')
    .upsert(
      {
        key: UTR_POOL_KEY,
        value: JSON.stringify(pool.slice(0, 100)),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    );
}

/**
 * Validates NPCI 12-digit numeric UTR (UPI) or 8-22 char alphanumeric bank/card ref.
 */
export function normalizeUtr(raw: string, method = 'upi'): { clean: string; valid: boolean; reason?: string } {
  const trimmed = String(raw || '').trim();
  if (method === 'bank' || method === 'card') {
    const cleanAlpha = trimmed.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (cleanAlpha.length < 8) {
      return { clean: cleanAlpha, valid: false, reason: 'Transaction reference must be at least 8 characters' };
    }
    return { clean: cleanAlpha, valid: true };
  }

  const digits = trimmed.replace(/\D/g, '');
  if (!/^\d{12}$/.test(digits)) {
    return { clean: digits, valid: false, reason: 'Valid 12-digit UPI UTR / Ref number required' };
  }
  return { clean: digits, valid: true };
}

/**
 * Extracts a 12-digit UTR from SMS/notification body text when webhook sends raw message.
 */
export function extractUtrFromPayload(body: Record<string, unknown>): string {
  const direct = String(body.utr || body.rrn || body.ref || body.transactionId || '').replace(/\D/g, '');
  if (/^\d{12}$/.test(direct)) return direct;

  const text = String(body.message || body.text || body.body || '');
  const match = text.match(/(?:UTR|Ref(?:erence)?|RRN|UPI)[:\s#-]*([0-9]{12})/i) || text.match(/\b([0-9]{12})\b/);
  return match ? match[1] : '';
}

export async function findExistingBookingWithUtr(cleanUtr: string) {
  if (!cleanUtr || cleanUtr.length < 8) return null;

  const { data } = await supabaseAdmin
    .from('bookings')
    .select('id, status, requirements, additional_notes, final_price')
    .neq('status', 'cancelled')
    .or(`requirements.ilike.%${cleanUtr}%,additional_notes.ilike.%${cleanUtr}%`)
    .order('created_at', { ascending: false })
    .limit(5);

  if (!data || data.length === 0) return null;
  return data[0];
}

export async function markBookingConfirmedWithUtr(
  booking: { id: string; additional_notes?: string | null },
  cleanUtr: string,
  source: string
) {
  let notesObj: Record<string, unknown> = {};
  try {
    notesObj = booking.additional_notes ? JSON.parse(booking.additional_notes) : {};
  } catch {
    notesObj = {};
  }

  const existingTimeline = Array.isArray(notesObj.timeline) ? notesObj.timeline : [];
  const nextTimeline = [
    ...existingTimeline,
    {
      step: 4,
      label: 'Advance Paid',
      note: `Auto-Verified via ${source} (UTR: ${cleanUtr})`,
      at: new Date().toISOString(),
    },
  ];

  const updatedNotes = {
    ...notesObj,
    timeline: nextTimeline,
    paymentVerified: true,
    verifiedUtr: cleanUtr,
    verifiedBy: source,
    verifiedAt: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from('bookings')
    .update({
      status: 'confirmed',
      additional_notes: JSON.stringify(updatedNotes),
      updated_at: new Date().toISOString(),
    })
    .eq('id', booking.id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export function safeCompareSecrets(a: string, b: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
