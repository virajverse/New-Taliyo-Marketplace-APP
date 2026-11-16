import { NextResponse, NextRequest } from 'next/server';
import { checkCouponCustomerEligibility, evaluateCoupon, loadCoupons } from '@/lib/couponServer';
import { enforceRateLimit } from '@/lib/rateLimit';
import { resolveAuthUserFromRequest } from '@/lib/authServer';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'couponValidate');
  if (limited) return limited;

  try {
    const body = await req.json();
    const rawCode = String(body.code || '').trim().toUpperCase();
    const orderAmount = Number(body.orderAmount) || 0;

    // Never trust client-supplied userId/email for coupon eligibility probing
    let verifiedUserId: string | null = null;
    let verifiedEmail: string | null = null;
    if ((req.headers.get('authorization') || '').startsWith('Bearer ')) {
      const auth = await resolveAuthUserFromRequest(req);
      if (auth.user) {
        verifiedUserId = auth.user.id;
        verifiedEmail = auth.user.email;
      }
    }

    if (!rawCode) {
      return NextResponse.json({ valid: false, message: 'Please enter a coupon code' }, { status: 400 });
    }

    const allCoupons = await loadCoupons();
    if (!allCoupons.length) {
      return NextResponse.json({ valid: false, message: 'Coupon code not found' });
    }

    const result = evaluateCoupon(allCoupons, rawCode, orderAmount);
    if (!result.valid) {
      return NextResponse.json({ valid: false, message: result.message });
    }

    const eligibility = await checkCouponCustomerEligibility(
      result.coupon,
      verifiedUserId,
      verifiedEmail,
    );
    if (!eligibility.ok) {
      return NextResponse.json({
        valid: false,
        message: eligibility.reason || `You are not eligible for coupon '${result.code}'`,
      });
    }

    return NextResponse.json({
      valid: true,
      code: result.code,
      discountType: result.discountType,
      discountValue: result.discountValue,
      discountAmount: result.discountAmount,
      finalAmount: result.finalAmount,
      message: result.message,
    });
  } catch (err: unknown) {
    console.error('Coupon validation error:', err);
    return NextResponse.json({ valid: false, message: 'Server validation error' }, { status: 500 });
  }
}
