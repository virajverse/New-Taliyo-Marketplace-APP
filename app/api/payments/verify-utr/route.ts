import { NextRequest, NextResponse } from 'next/server';
import {
  findExistingBookingWithUtr,
  loadGatewayConfig,
  loadVerifiedUtrPool,
  normalizeUtr,
} from '@/lib/paymentServer';
import { enforceRateLimit } from '@/lib/rateLimit';
import { resolveAuthUserFromRequest } from '@/lib/authServer';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'paymentOrder');
  if (limited) return limited;

  try {
    const auth = await resolveAuthUserFromRequest(req);
    if (!auth.user) {
      return NextResponse.json(
        {
          valid: false,
          duplicate: false,
          poolMatched: false,
          status: 'unauthorized',
          message: auth.error || 'Please sign in to verify payment reference.',
        },
        { status: auth.status || 401 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const method = String(body.method || 'upi').toLowerCase();
    const expectedAmount = Number(body.amount || 0);

    const { clean, valid, reason } = normalizeUtr(String(body.utr || ''), method);
    if (!valid) {
      return NextResponse.json(
        {
          valid: false,
          duplicate: false,
          poolMatched: false,
          status: 'invalid_format',
          message: reason || 'Invalid UTR format',
        },
        { status: 400 }
      );
    }

    const config = await loadGatewayConfig();
    if (!config.autoVerifyEnabled) {
      return NextResponse.json({
        valid: true,
        duplicate: false,
        poolMatched: false,
        status: 'manual_review',
        utr: clean,
        message: 'UTR syntax valid — queued for Admin manual verification',
      });
    }

    // 1. Duplicate UTR protection across non-cancelled bookings
    const existing = await findExistingBookingWithUtr(clean);
    if (existing) {
      return NextResponse.json(
        {
          valid: false,
          duplicate: true,
          poolMatched: false,
          status: 'duplicate_utr',
          utr: clean,
          message: `This UTR (${clean}) is already linked to Order #${String(existing.id).slice(0, 8)}`,
        },
        { status: 409 }
      );
    }

    // 2. Settlement pool check (instant auto-verify if webhook/admin already logged receipt)
    const pool = await loadVerifiedUtrPool();
    const matched = pool.find((item) => item.utr === clean);

    if (matched) {
      const amountOk =
        !expectedAmount ||
        !matched.amount ||
        Math.abs(Number(matched.amount) - expectedAmount) <= 5;

      if (!amountOk) {
        return NextResponse.json({
          valid: true,
          duplicate: false,
          poolMatched: false,
          status: 'amount_mismatch',
          utr: clean,
          message: `UTR found for ₹${matched.amount}, expected ₹${expectedAmount}. Queued for Admin review.`,
        });
      }

      return NextResponse.json({
        valid: true,
        duplicate: false,
        poolMatched: true,
        status: 'auto_verified',
        utr: clean,
        source: matched.source || 'Settlement Pool',
        message: 'UTR verified against incoming payment settlement! Ready for instant confirmation.',
      });
    }

    return NextResponse.json({
      valid: true,
      duplicate: false,
      poolMatched: false,
      status: 'format_verified_pending',
      utr: clean,
      message: 'Valid 12-digit UTR format & unique — order will submit for merchant verification',
    });
  } catch (err) {
    console.error('verify-utr POST error:', err);
    return NextResponse.json(
      { valid: false, status: 'error', message: 'Verification service error' },
      { status: 500 }
    );
  }
}
