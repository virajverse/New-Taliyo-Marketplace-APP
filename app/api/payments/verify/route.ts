import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface VerifyBody {
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
}

export async function POST(req: NextRequest) {
  try {
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
      return NextResponse.json(
        { verified: false, error: 'RAZORPAY_KEY_SECRET is not configured' },
        { status: 503 }
      );
    }

    const body = (await req.json()) as VerifyBody;
    const orderId = body.razorpay_order_id || '';
    const paymentId = body.razorpay_payment_id || '';
    const signature = body.razorpay_signature || '';

    if (!orderId || !paymentId || !signature) {
      return NextResponse.json(
        { verified: false, error: 'Missing Razorpay verification parameters' },
        { status: 400 }
      );
    }

    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    const expectedBuf = Buffer.from(expectedSignature, 'utf8');
    const receivedBuf = Buffer.from(signature, 'utf8');

    const isValid =
      expectedBuf.length === receivedBuf.length &&
      crypto.timingSafeEqual(expectedBuf, receivedBuf);

    if (!isValid) {
      return NextResponse.json({ verified: false, error: 'Invalid payment signature' }, { status: 400 });
    }

    return NextResponse.json({
      verified: true,
      orderId,
      paymentId,
    });
  } catch (err: unknown) {
    console.error('Razorpay verify error:', err);
    const message = err instanceof Error ? err.message : 'Payment verification failed';
    return NextResponse.json({ verified: false, error: message }, { status: 500 });
  }
}
