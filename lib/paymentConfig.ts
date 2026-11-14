/**
 * Taliyo Marketplace - Payment Gateway & Haptic Configuration
 */

export const PAYMENT_CONFIG = {
  upi: {
    // Live merchant VPA comes from Admin Payment Settings (/api/payment-settings) or env
    id: process.env.NEXT_PUBLIC_UPI_ID || '',
    displayId: process.env.NEXT_PUBLIC_UPI_DISPLAY_ID || process.env.NEXT_PUBLIC_UPI_ID || '',
    payeeName: process.env.NEXT_PUBLIC_UPI_NAME || 'Taliyo Technologies',
    merchantType: 'Verified Merchant',
  },
  bank: {
    accountName: process.env.NEXT_PUBLIC_BANK_ACCOUNT_NAME || 'Taliyo Technologies',
    accountNumber: process.env.NEXT_PUBLIC_BANK_ACCOUNT_NO || '',
    ifsc: process.env.NEXT_PUBLIC_BANK_IFSC || '',
    bankName: process.env.NEXT_PUBLIC_BANK_NAME || '',
  },
  razorpay: {
    keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '',
    enabled: Boolean(process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID),
  },
};

export interface GenerateUpiUriParams {
  upiId?: string;
  payeeName?: string;
  amount: number;
  orderRef: string;
  note?: string;
}

/**
 * Builds standard NPCI-compliant UPI payment intent URI
 * Schema: upi://pay?pa=...&pn=...&am=...&cu=INR&tn=...&tr=...
 */
export function generateUpiUri({
  upiId = PAYMENT_CONFIG.upi.id,
  payeeName = PAYMENT_CONFIG.upi.payeeName,
  amount,
  orderRef,
  note = 'Taliyo Order',
}: GenerateUpiUriParams): string {
  const safeAmount = Number.isFinite(amount) && amount > 0 ? amount.toFixed(2) : '1.00';
  const cleanRef = orderRef.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 35) || 'ORDER';
  const cleanNote = note.replace(/[^a-zA-Z0-9 -]/g, '').slice(0, 40) || 'Order';

  const params = new URLSearchParams({
    pa: upiId,
    pn: payeeName,
    am: safeAmount,
    cu: 'INR',
    tn: cleanNote,
    tr: cleanRef,
  });

  return `upi://pay?${params.toString()}`;
}

/**
 * Triggers mobile browser haptic vibration when supported by the client device.
 */
export function triggerHapticFeedback(pattern: number | number[] = [120, 60, 120]): boolean {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      return navigator.vibrate(pattern);
    } catch {
      return false;
    }
  }
  return false;
}
