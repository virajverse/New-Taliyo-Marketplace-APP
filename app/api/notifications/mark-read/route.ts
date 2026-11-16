import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { resolveAuthUserFromRequest } from '@/lib/authServer';
import { bumpCacheVersions, invalidateCachePrefix } from '@/lib/redisCache';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const auth = await resolveAuthUserFromRequest(req);
    if (!auth.user) {
      return NextResponse.json(
        { error: auth.error || 'Authentication required' },
        { status: auth.status || 401 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      id?: string;
      ids?: string[];
      all?: boolean;
    };

    if (body.all) {
      await supabaseAdmin
        .from('notifications')
        .update({ is_read: true })
        .neq('type', 'admin_alert')
        .or(`user_id.is.null,user_id.eq.${auth.user.id}`);
    } else if (Array.isArray(body.ids) && body.ids.length > 0) {
      await supabaseAdmin
        .from('notifications')
        .update({ is_read: true })
        .in('id', body.ids.map(String))
        .neq('type', 'admin_alert')
        .or(`user_id.is.null,user_id.eq.${auth.user.id}`);
    } else if (body.id) {
      await supabaseAdmin
        .from('notifications')
        .update({ is_read: true })
        .eq('id', String(body.id))
        .neq('type', 'admin_alert')
        .or(`user_id.is.null,user_id.eq.${auth.user.id}`);
    } else {
      return NextResponse.json({ error: 'Notification id, ids, or all=true required' }, { status: 400 });
    }

    await Promise.all([
      invalidateCachePrefix('taliyo:notifications:'),
      bumpCacheVersions('notifications'),
    ]);

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
