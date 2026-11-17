import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { enforceRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

const uuidRegex =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'tracking');
  if (limited) return limited;

  try {
    const body = (await req.json().catch(() => ({}))) as { id?: string; type?: string };
    const id = body?.id;
    const type = body?.type;

    if (!id || typeof id !== 'string' || (type !== 'impression' && type !== 'click')) {
      return NextResponse.json({ ok: false, error: 'Invalid payload' }, { status: 400 });
    }

    if (!uuidRegex.test(id)) {
      return NextResponse.json({ ok: true, logged: false });
    }

    const fwd = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
    const userIp = (fwd || req.headers.get('x-real-ip') || '').slice(0, 120) || undefined;
    const userAgent = (req.headers.get('user-agent') || '').slice(0, 500) || undefined;

    const { error } = await supabaseAdmin.from('banner_events').insert([
      {
        banner_id: id,
        event_type: type,
        user_agent: userAgent,
        ip_address: userIp,
      },
    ]);

    if (error) {
      // Fallback for 2-column minimal banner_events table or missing optional columns
      const { error: fallbackErr } = await supabaseAdmin.from('banner_events').insert([
        {
          banner_id: id,
          event_type: type,
        },
      ]);
      if (fallbackErr) {
        console.warn('Banner telemetry skipped:', fallbackErr.message);
        return NextResponse.json({ ok: true, logged: false });
      }
    }

    return NextResponse.json({ ok: true, logged: true });
  } catch (err: unknown) {
    console.warn('Banner track non-fatal error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: true, logged: false });
  }
}
