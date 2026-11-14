import { NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { enforceRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

interface CreateOrderBody {
  amount?: number | string;
  currency?: string;
  receipt?: string;
  notes?: Record<string, string>;
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'paymentOrder');
  if (limited) return limited;

  try {
    const keyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      return NextResponse.json(
        {
          configured: false,
          error:
            'Razorpay merchant keys missing. Set NEXT_PUBLIC_RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env.local.',
        },
        { status: 503 }
      );
    }

    const body = (await req.json()) as CreateOrderBody;
    const amountInRupees = Number(body.amount);

    if (!Number.isFinite(amountInRupees) || amountInRupees <= 0) {
      return NextResponse.json({ error: 'Invalid payment amount' }, { status: 400 });
    }

    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    const amountPaise = Math.round(amountInRupees * 100);
    const receipt = (body.receipt || `tly_${Date.now()}`).slice(0, 40);

    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: body.currency || 'INR',
      receipt,
      notes: body.notes || {},
    });

    return NextResponse.json({
      configured: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId,
    });
  } catch (err: unknown) {
    console.error('Razorpay create-order error:', err);
    const message = err instanceof Error ? err.message : 'Unable to create payment order';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
