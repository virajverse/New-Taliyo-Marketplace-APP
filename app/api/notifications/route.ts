import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { bumpCacheVersions, cachedFetch, invalidateCachePrefix } from '@/lib/redisCache';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get('userId')?.trim() || '';
    const cacheKey = userId ? `taliyo:notifications:user:${userId}` : 'taliyo:notifications:public';

    const { data, cacheLayer } = await cachedFetch(
      cacheKey,
      45,
      async () => {
        let query = supabaseAdmin
          .from('notifications')
          .select('id, title, message, type, related_type, related_id, is_read, created_at, user_id')
          .neq('type', 'admin_alert')
          .order('created_at', { ascending: false });

        if (userId) {
          query = query.or(`user_id.is.null,user_id.eq.${userId}`);
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
          'Cache-Control': userId ? 'private, max-age=15' : 'public, s-maxage=30, stale-while-revalidate=60',
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
    const body = await req.json();
    const { id, is_read, mark_all, userId } = body;

    if (mark_all) {
      let query = supabaseAdmin
        .from('notifications')
        .update({ is_read: true })
        .neq('type', 'admin_alert');

      if (userId) {
        query = query.or(`user_id.is.null,user_id.eq.${String(userId)}`);
      } else {
        query = query.is('user_id', null);
      }

      await query;
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
        .eq('id', id);
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
