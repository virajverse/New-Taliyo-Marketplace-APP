import { NextResponse } from 'next/server';
import { getCacheVersions } from '@/lib/redisCache';

export const dynamic = 'force-dynamic';

/**
 * Ultra-lightweight cache version manifest so client SWR layers know immediately
 * when Admin updated banners, catalog, settings, reviews, coupons, or notifications.
 */
export async function GET() {
  try {
    const versions = await getCacheVersions();
    return NextResponse.json(
      { versions, ts: Date.now() },
      { headers: { 'Cache-Control': 'no-store, max-age=0, must-revalidate' } },
    );
  } catch {
    return NextResponse.json(
      {
        versions: {
          catalog: 1,
          banners: 1,
          settings: 1,
          coupons: 1,
          reviews: 1,
          notifications: 1,
        },
        ts: Date.now(),
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0, must-revalidate' } },
    );
  }
}
