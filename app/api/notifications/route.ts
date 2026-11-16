import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { bumpCacheVersions, cachedFetch, invalidateCachePrefix } from '@/lib/redisCache';
import { resolveAuthUserFromRequest } from '@/lib/authServer';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    let verifiedUserId = '';

    if (authHeader.startsWith('Bearer ')) {
      const auth = await resolveAuthUserFromRequest(req);
      if (auth.user) {
        verifiedUserId = auth.user.id;
      } else {
        return NextResponse.json(
          { data: [], error: auth.error || 'Unauthorized' },
          { status: auth.status || 401 },
        );
      }
    }

    // Never trust arbitrary ?userId= without valid JWT — guests only see public broadcasts (user_id IS NULL)
    const cacheKey = verifiedUserId
      ? `taliyo:notifications:user:${verifiedUserId}`
      : 'taliyo:notifications:public';

    const { data, cacheLayer } = await cachedFetch(
      cacheKey,
      45,
      async () => {
        let query = supabaseAdmin
          .from('notifications')
          .select('id, title, message, type, related_type, related_id, is_read, created_at, user_id')
          .neq('type', 'admin_alert')
          .order('created_at', { ascending: false })
          .limit(80);

        if (verifiedUserId) {
          query = query.or(`user_id.is.null,user_id.eq.${verifiedUserId}`);
        } else {
          query = query.is('user_id', null);
        }

        const { data: rows, error } = await query;
        if (error) {
          console.warn('Notifications query notice:', error);
          return [];
        }
        return rows || [];
      },
      { l1TtlSeconds: 10 },
    );

    return NextResponse.json(
      { data },
      {
        headers: {
          'Cache-Control': verifiedUserId
            ? 'private, max-age=15'
            : 'public, s-maxage=30, stale-while-revalidate=60',
          'X-Taliyo-Cache': cacheLayer,
        },
      },
    );
  } catch (err: unknown) {
    console.error('Error fetching notifications:', err);
    return NextResponse.json({ data: [] });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await resolveAuthUserFromRequest(req);
    if (!auth.user) {
      return NextResponse.json(
        { error: auth.error || 'Authentication required' },
        { status: auth.status || 401 },
      );
    }
    const verifiedUserId = auth.user.id;

    const body = await req.json();
    const { id, is_read, mark_all } = body;

    if (mark_all) {
      await supabaseAdmin
        .from('notifications')
        .update({ is_read: true })
        .neq('type', 'admin_alert')
        .or(`user_id.is.null,user_id.eq.${verifiedUserId}`);

      await Promise.all([
        invalidateCachePrefix('taliyo:notifications:'),
        bumpCacheVersions('notifications'),
      ]);
      return NextResponse.json({ success: true });
    }

    if (id) {
      await supabaseAdmin
        .from('notifications')
        .update({ is_read: is_read ?? true })
        .eq('id', String(id))
        .neq('type', 'admin_alert')
        .or(`user_id.is.null,user_id.eq.${verifiedUserId}`);

      await Promise.all([
        invalidateCachePrefix('taliyo:notifications:'),
        bumpCacheVersions('notifications'),
      ]);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  } catch (err: unknown) {
    console.error('Error updating notification:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
