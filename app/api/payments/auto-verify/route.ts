import { NextRequest, NextResponse } from 'next/server';
import {
  extractUtrFromPayload,
  findExistingBookingWithUtr,
  loadGatewayConfig,
  loadVerifiedUtrPool,
  markBookingConfirmedWithUtr,
  safeCompareSecrets,
  saveVerifiedUtrPool,
  VerifiedUtrEntry,
} from '@/lib/paymentServer';

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
    const utr = extractUtrFromPayload(body);

    if (!/^\d{12}$/.test(utr)) {
      return NextResponse.json(
        { error: 'invalid_or_missing_12_digit_utr' },
        { status: 400 }
      );
    }

    const amount = Number(body.amount || 0) || 0;
    const sender = String(body.sender || body.vpa || '').slice(0, 80);
    const source = String(body.source || 'Paytm Webhook').slice(0, 60);

    let matchedBookingId: string | null = null;
    let bookingConfirmedNow = false;

    const existingBooking = await findExistingBookingWithUtr(utr);
    if (existingBooking) {
      matchedBookingId = existingBooking.id;
      if (existingBooking.status === 'pending') {
        await markBookingConfirmedWithUtr(existingBooking, utr, source);
        bookingConfirmedNow = true;
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
