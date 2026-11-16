import { NextRequest, NextResponse } from 'next/server';
import {
  isCouponRedeemable,
  isPublicCouponForViewer,
  loadCoupons,
} from '@/lib/couponServer';
import { resolveAuthUserFromRequest } from '@/lib/authServer';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    let viewerEmail: string | null = null;
    if ((req.headers.get('authorization') || '').startsWith('Bearer ')) {
      const auth = await resolveAuthUserFromRequest(req);
      if (auth.user?.email) {
        viewerEmail = auth.user.email;
      }
    }

    const allCoupons = await loadCoupons();
    const now = new Date();
    const visibleCoupons = allCoupons
      .filter((c) => isCouponRedeemable(c, now).ok && isPublicCouponForViewer(c, viewerEmail))
      .map((c) => {
        const safe = { ...c };
        delete safe.allowed_emails;
        return safe;
      });

    return NextResponse.json(
      { data: visibleCoupons },
      {
        headers: {
          'Cache-Control': viewerEmail
            ? 'private, no-store'
            : 'public, s-maxage=30, stale-while-revalidate=60',
        },
      },
    );
  } catch (err: unknown) {
    console.error('Coupons public API error:', err);
    return NextResponse.json({ data: [] });
  }
}
