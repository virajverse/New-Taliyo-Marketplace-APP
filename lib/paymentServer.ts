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
 * Ensures unstructured SMS/notification payload represents an incoming CREDIT (never a debit/OTP/failure).
 */
export function isIncomingCreditNotification(body: Record<string, unknown>): {
  allowed: boolean;
  reason?: string;
} {
  const text = String(body.message || body.text || body.body || '').trim();
  if (!text) {
    // Structured API/webhook payload (explicit utr + amount) without raw SMS text
    return { allowed: true };
  }

  const lower = text.toLowerCase();
  if (/\b(otp|one time password|verification code|failed|declined|reversed|bounced|refunded)\b/i.test(lower)) {
    return { allowed: false, reason: 'ignored_non_credit_sms' };
  }

  const hasCreditKeyword = /\b(credit|credited|received|deposited|cr\b|payment received|paid you|sent you)\b/i.test(lower);
  const hasDebitKeyword = /\b(debited|debit|spent|withdrawn|paid to|sent to|transferred to|dr\b|purchase of)\b/i.test(lower);

  if (hasDebitKeyword && !hasCreditKeyword) {
    return { allowed: false, reason: 'ignored_debit_sms' };
  }
  if (!hasCreditKeyword && !body.utr && !body.rrn && !body.transactionId) {
    return { allowed: false, reason: 'missing_credit_confirmation_keyword' };
  }

  return { allowed: true };
}

/**
 * Extracts a 12-digit UPI UTR or 8-22 char NEFT/IMPS/RTGS reference from ANY bank SMS/webhook payload.
 */
export function extractUtrFromPayload(body: Record<string, unknown>): string {
  const rawDirect = String(body.utr || body.rrn || body.ref || body.transactionId || '').trim();
  const digitsOnly = rawDirect.replace(/\D/g, '');
  if (/^\d{12}$/.test(digitsOnly)) return digitsOnly;

  const alphaDirect = rawDirect.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (/^(?=[A-Z0-9]*\d)[A-Z0-9]{8,22}$/.test(alphaDirect)) return alphaDirect;

  const text = String(body.message || body.text || body.body || '');
  const numericMatch =
    text.match(/(?:UTR|Ref(?:erence)?(?:\s*(?:No|ID))?|RRN|UPI(?:\s*Ref)?|IMPS(?:\s*Ref)?)[:\s#/-]*([0-9]{12})/i) ||
    text.match(/(?:UPI|IMPS)\/(?:CR|DR|P2A|P2M)?\/([0-9]{12})/i) ||
    text.match(/\b([0-9]{12})\b/);
  if (numericMatch) return numericMatch[1];

  const isIfscLike = (val: string) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(val.toUpperCase());
  const bankMatches = text.matchAll(
    /(?:IMPS|NEFT|RTGS|UTR|Ref(?:erence)?(?:\s*(?:No|ID))?)[A-Za-z\s:#/-]{0,12}?\b((?=[A-Za-z0-9]*\d)[A-Za-z0-9]{8,22})\b/gi,
  );
  for (const m of bankMatches) {
    const candidate = (m[1] || '').toUpperCase();
    if (candidate && !isIfscLike(candidate)) {
      return candidate;
    }
  }
  return '';
}

/**
 * Extracts received credit amount from explicit field or Bank/UPI SMS notification text.
 */
export function extractAmountFromPayload(body: Record<string, unknown>): number {
  const direct = Number(
    String(body.amount ?? body.amt ?? body.TXNAMOUNT ?? '').replace(/,/g, ''),
  );
  if (Number.isFinite(direct) && direct > 0) return direct;

  const text = String(body.message || body.text || body.body || '');
  const cleanedText = text.replace(/(?:Avl\.?\s*Bal|Avail\.?\s*Bal|Balance)[^.;\n]*/gi, '');

  const creditAmtMatch =
    cleanedText.match(/(?:credited|received|deposited|with|of)\s*(?:Rs\.?|INR|₹)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i) ||
    cleanedText.match(/(?:Rs\.?|INR|₹)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:has\s+been\s+)?(?:credited|received|deposited)/i) ||
    cleanedText.match(/(?:Rs\.?|INR|₹)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);

  if (creditAmtMatch) {
    const parsed = Number(creditAmtMatch[1].replace(/,/g, ''));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 0;
}

export function doesAmountMatchExpected(receivedAmount: number, expectedAmount: number): boolean {
  if (!Number.isFinite(receivedAmount) || receivedAmount <= 0) return false;
  if (!Number.isFinite(expectedAmount) || expectedAmount <= 0) return false;
  return Math.abs(receivedAmount - expectedAmount) <= 5;
}

export async function findExistingBookingWithUtr(cleanUtr: string) {
  const safeUtr = String(cleanUtr || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 24);
  if (!safeUtr || safeUtr.length < 8) return null;

  const { data } = await supabaseAdmin
    .from('bookings')
    .select('id, user_id, service_title, status, requirements, additional_notes, final_price')
    .neq('status', 'cancelled')
    .or(`requirements.ilike.%${safeUtr}%,additional_notes.ilike.%${safeUtr}%`)
    .order('created_at', { ascending: false })
    .limit(5);

  if (!data || data.length === 0) return null;
  return data[0];
}

export async function markBookingConfirmedWithUtr(
  booking: { id: string; user_id?: string | null; service_title?: string | null; additional_notes?: string | null },
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
  const isBalanceSettlement =
    Boolean(notesObj.balancePendingReview) &&
    String(notesObj.balanceUtr || '').toUpperCase() === cleanUtr.toUpperCase();

  const nextTimeline = [
    ...existingTimeline,
    isBalanceSettlement
      ? {
          step: 5,
          label: 'Balance Auto-Verified',
          note: `Remaining balance verified via ${source} (Ref: ${cleanUtr})`,
          at: new Date().toISOString(),
        }
      : {
          step: 4,
          label: 'Payment Verified & Confirmed',
          note: `Real payment verified via ${source} (UTR: ${cleanUtr})`,
          at: new Date().toISOString(),
        },
  ];

  const updatedNotes = isBalanceSettlement
    ? {
        ...notesObj,
        timeline: nextTimeline,
        balancePaid: true,
        balancePendingReview: false,
        balanceVerifiedBy: source,
        balanceVerifiedAt: new Date().toISOString(),
      }
    : {
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

  if (booking.user_id) {
    await supabaseAdmin.from('notifications').insert({
      user_id: booking.user_id,
      type: 'order',
      related_type: 'booking',
      related_id: booking.id,
      title: isBalanceSettlement ? 'Balance Payment Auto-Verified' : 'Payment Verified & Order Confirmed',
      message: isBalanceSettlement
        ? `Remaining balance for "${booking.service_title || 'Order'}" verified via ${source} (Ref: ${cleanUtr}).`
        : `Real payment received for "${booking.service_title || 'Order'}" (Ref: ${cleanUtr}). Your order is now confirmed!`,
      is_read: false,
    });
  }

  return data;
}

export function safeCompareSecrets(a: string, b: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
