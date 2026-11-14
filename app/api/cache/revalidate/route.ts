import { NextRequest, NextResponse } from 'next/server';
import {
  bumpCacheVersions,
  invalidateCacheKeys,
  invalidateCachePrefix,
  type CacheScope,
} from '@/lib/redisCache';

export const dynamic = 'force-dynamic';

/**
 * Allows Admin / webhook callers with ADMIN_API_TOKEN to purge Redis + L1 caches immediately
 * and bump the corresponding scope version so active clients auto-refresh.
 */
export async function POST(req: NextRequest) {
  try {
    const token = process.env.ADMIN_API_TOKEN?.trim();
    const authHeader = req.headers.get('authorization') || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

    if (!token || bearer !== token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      scope?: 'all' | CacheScope;
    };
    const scope = body.scope || 'all';

    if (scope === 'all' || scope === 'catalog') {
      await invalidateCachePrefix('taliyo:catalog:');
      await invalidateCacheKeys('taliyo:support:snapshot');
    }
    if (scope === 'all' || scope === 'settings') {
      await invalidateCacheKeys('taliyo:site-settings', 'taliyo:payment-settings');
    }
    if (scope === 'all' || scope === 'coupons') {
      await invalidateCacheKeys('taliyo:coupons:list', 'taliyo:coupons:active');
    }
    if (scope === 'all' || scope === 'banners') {
      await invalidateCacheKeys('taliyo:banners:active');
    }
    if (scope === 'all' || scope === 'reviews') {
      await invalidateCacheKeys('taliyo:reviews:approved');
      await invalidateCachePrefix('taliyo:catalog:service:');
    }
    if (scope === 'all' || scope === 'notifications') {
      await invalidateCachePrefix('taliyo:notifications:');
    }

    const versions = await bumpCacheVersions(scope);

    return NextResponse.json({ ok: true, cleared: scope, versions });
  } catch (err) {
    console.error('Cache revalidate error:', err);
    return NextResponse.json({ error: 'Failed to revalidate cache' }, { status: 500 });
  }
}
