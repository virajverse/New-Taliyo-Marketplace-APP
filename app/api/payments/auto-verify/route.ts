import { NextRequest, NextResponse } from 'next/server';
import {
  doesAmountMatchExpected,
  extractAmountFromPayload,
  extractUtrFromPayload,
  findExistingBookingWithUtr,
  isIncomingCreditNotification,
  loadGatewayConfig,
  loadVerifiedUtrPool,
  markBookingConfirmedWithUtr,
  safeCompareSecrets,
  saveVerifiedUtrPool,
  VerifiedUtrEntry,
} from '@/lib/paymentServer';
import { sendAdminNotification } from '@/lib/notifications';
import { bumpCacheVersions, invalidateCachePrefix } from '@/lib/redisCache';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const config = await loadGatewayConfig();
    if (!config.autoVerifyWebhookSecret) {
      return NextResponse.json(
        { error: 'webhook_secret_not_configured' },
        { status: 503 }
      );
    }

    const headerSecret = req.headers.get('x-webhook-secret') || '';
    const authHeader = req.headers.get('authorization') || '';
    const bearerSecret = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : '';
    const provided = headerSecret || bearerSecret;

    if (!safeCompareSecrets(provided, config.autoVerifyWebhookSecret)) {
      return NextResponse.json({ error: 'unauthorized_webhook' }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const creditCheck = isIncomingCreditNotification(body);
    if (!creditCheck.allowed) {
      return NextResponse.json({
        ok: true,
        ignored: true,
        reason: creditCheck.reason || 'non_credit_message',
      });
    }

    const utr = extractUtrFromPayload(body);

    if (!/^[A-Z0-9]{8,22}$/.test(utr)) {
      return NextResponse.json(
        { error: 'invalid_or_missing_utr_reference' },
        { status: 400 }
      );
    }

    const amount = extractAmountFromPayload(body);
    const sender = String(body.sender || body.vpa || '').slice(0, 80);
    const source = String(body.source || 'Bank/UPI Settlement Webhook').slice(0, 60);

    let matchedBookingId: string | null = null;
    let bookingConfirmedNow = false;
    let amountMismatch = false;

    const existingBooking = await findExistingBookingWithUtr(utr);
    if (existingBooking) {
      matchedBookingId = existingBooking.id;
      let notesObj: Record<string, unknown> = {};
      try {
        notesObj = existingBooking.additional_notes ? JSON.parse(String(existingBooking.additional_notes)) : {};
      } catch {
        notesObj = {};
      }

      const isBalanceRef =
        Boolean(notesObj.balancePendingReview) &&
        String(notesObj.balanceUtr || '').toUpperCase() === utr.toUpperCase();
      const expectedAmt = isBalanceRef
        ? Number(notesObj.balanceAmount || 0)
        : Number(existingBooking.final_price || 0);

      if (doesAmountMatchExpected(amount, expectedAmt) && (existingBooking.status === 'pending' || isBalanceRef)) {
        await markBookingConfirmedWithUtr(existingBooking, utr, source);
        bookingConfirmedNow = true;
        await Promise.allSettled([
          sendAdminNotification(
            `Auto-Verified Settlement (#${String(existingBooking.id).slice(0, 8)})`,
            `Received ₹${amount.toLocaleString('en-IN')} via ${source} (Ref: ${utr}). Order automatically confirmed.`,
          ),
          invalidateCachePrefix('taliyo:notifications:'),
          bumpCacheVersions('notifications'),
        ]);
      } else if (expectedAmt > 0 && amount > 0 && !doesAmountMatchExpected(amount, expectedAmt)) {
        amountMismatch = true;
      }
    }

    const pool = await loadVerifiedUtrPool();
    const entry: VerifiedUtrEntry = {
      utr,
      amount,
      sender,
      source,
      receivedAt: new Date().toISOString(),
      matchedBookingId,
    };

    const nextPool = [entry, ...pool.filter((item) => item.utr !== utr)].slice(0, 100);
    await saveVerifiedUtrPool(nextPool);

    return NextResponse.json({
      ok: true,
      utr,
      matchedBookingId,
      bookingConfirmedNow,
      amountMismatch,
      storedInPool: true,
    });
  } catch (err) {
    console.error('auto-verify webhook error:', err);
    return NextResponse.json(
      { error: 'webhook_processing_failed' },
      { status: 500 }
    );
  }
}
