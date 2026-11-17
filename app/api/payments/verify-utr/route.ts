import { NextRequest, NextResponse } from 'next/server';
import {
  doesAmountMatchExpected,
  findExistingBookingWithUtr,
  loadGatewayConfig,
  loadVerifiedUtrPool,
  markBookingConfirmedWithUtr,
  normalizeUtr,
} from '@/lib/paymentServer';
import { enforceRateLimit } from '@/lib/rateLimit';
import { resolveAuthUserFromRequest } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Live settlement status check for a submitted booking (polls booking & UTR settlement pool).
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await resolveAuthUserFromRequest(req);
    if (!auth.user) {
      return NextResponse.json({ verified: false, error: 'Unauthorized' }, { status: auth.status || 401 });
    }

    const bookingId = new URL(req.url).searchParams.get('bookingId')?.trim() || '';
    if (!bookingId || !UUID_REGEX.test(bookingId)) {
      return NextResponse.json({ verified: false, error: 'Valid bookingId required' }, { status: 400 });
    }

    const { data: booking } = await supabaseAdmin
      .from('bookings')
      .select('id, user_id, email, customer_email, status, service_title, final_price, additional_notes')
      .eq('id', bookingId)
      .maybeSingle();

    if (!booking) {
      return NextResponse.json({ verified: false, error: 'Order not found' }, { status: 404 });
    }

    const matchesOwner = booking.user_id
      ? booking.user_id === auth.user.id
      : Boolean(auth.user.email) &&
        (String(booking.email || '').trim().toLowerCase() === auth.user.email ||
          String(booking.customer_email || '').trim().toLowerCase() === auth.user.email);

    if (!matchesOwner) {
      return NextResponse.json({ verified: false, error: 'Forbidden' }, { status: 403 });
    }

    let notesObj: Record<string, unknown> = {};
    try {
      notesObj = booking.additional_notes ? JSON.parse(String(booking.additional_notes)) : {};
    } catch {
      notesObj = {};
    }

    const alreadyVerified =
      Boolean(notesObj.paymentVerified) ||
      ['confirmed', 'work_started', 'in_progress', 'delivered', 'completed'].includes(
        String(booking.status || '').toLowerCase(),
      );

    if (alreadyVerified) {
      return NextResponse.json({
        verified: true,
        status: booking.status,
        source: notesObj.verifiedBy || 'Verified Settlement',
        utr: notesObj.verifiedUtr || notesObj.utr || null,
      });
    }

    // Re-check incoming settlement pool in case webhook arrived after checkout
    const pendingUtr = String(notesObj.utr || '').trim();
    const expectedAmount = Number(booking.final_price || 0);
    if (pendingUtr && expectedAmount > 0 && booking.status === 'pending') {
      const pool = await loadVerifiedUtrPool();
      const matched = pool.find((item) => item.utr === pendingUtr);
      if (matched && doesAmountMatchExpected(Number(matched.amount || 0), expectedAmount)) {
        const src = matched.source || 'Settlement Pool';
        await markBookingConfirmedWithUtr(booking, pendingUtr, src);
        return NextResponse.json({
          verified: true,
          status: 'confirmed',
          source: src,
          utr: pendingUtr,
        });
      }
    }

    return NextResponse.json({
      verified: false,
      status: booking.status || 'pending',
      utr: pendingUtr || null,
      message: 'Awaiting real bank/UPI credit settlement confirmation',
    });
  } catch (err) {
    console.error('verify-utr GET error:', err);
    return NextResponse.json({ verified: false, status: 'error' }, { status: 500 });
  }
}

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
        doesAmountMatchExpected(Number(matched.amount || 0), expectedAmount);

      if (!amountOk) {
        return NextResponse.json({
          valid: false,
          verified: false,
          duplicate: false,
          poolMatched: false,
          status: 'amount_mismatch',
          utr: clean,
          message: `Settlement amount mismatch: received ₹${matched.amount || 0}, expected ₹${expectedAmount}. Order will NOT auto-confirm.`,
        });
      }

      return NextResponse.json({
        valid: true,
        verified: true,
        duplicate: false,
        poolMatched: true,
        status: 'auto_verified',
        utr: clean,
        source: matched.source || 'Settlement Pool',
        message: 'Real payment received & verified against settlement pool! Ready for instant confirmation.',
      });
    }

    return NextResponse.json({
      valid: true,
      verified: false,
      duplicate: false,
      poolMatched: false,
      status: 'awaiting_settlement',
      utr: clean,
      message: 'No matching bank/UPI credit received yet for this UTR. Order stays Pending (Not Confirmed) until real money receipt matches.',
    });
  } catch (err) {
    console.error('verify-utr POST error:', err);
    return NextResponse.json(
      { valid: false, status: 'error', message: 'Verification service error' },
      { status: 500 }
    );
  }
}
