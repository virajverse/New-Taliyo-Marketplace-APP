import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { enforceRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'tracking');
  if (limited) return limited;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      service_id?: string | null;
      slug?: string | null;
      event_type?: string | null;
      event_data?: Record<string, unknown> | null;
    };

    const rawIdOrSlug = String(body.service_id || body.slug || '').trim();
    let resolvedServiceId: string | null = UUID_REGEX.test(rawIdOrSlug) ? rawIdOrSlug : null;

    if (!resolvedServiceId && rawIdOrSlug) {
      try {
        const { data: svc } = await supabaseAdmin
          .from('services')
          .select('id')
          .eq('slug', rawIdOrSlug)
          .maybeSingle();
        if (svc?.id) resolvedServiceId = String(svc.id);
      } catch {}
    }

    const eventType = String(body.event_type || 'service_click').slice(0, 64);
    const userAgent = (req.headers.get('user-agent') || '').slice(0, 500) || null;
    const referrer = (req.headers.get('referer') || '').slice(0, 500) || null;
    const fwd = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
    const userIp = (fwd || req.headers.get('x-real-ip') || '').slice(0, 120) || null;

    const clickEvents = new Set(['service_click', 'add_to_cart', 'book_now', 'checkout_start', 'order_click']);
    const writes: Array<PromiseLike<unknown>> = [
      supabaseAdmin.from('analytics').insert([
        {
          service_id: resolvedServiceId,
          event_type: eventType,
          event_data: body.event_data || (rawIdOrSlug ? { ref: rawIdOrSlug } : null),
          user_ip: userIp,
          user_agent: userAgent,
          referrer,
          created_at: new Date().toISOString(),
        },
      ]),
    ];

    if (clickEvents.has(eventType)) {
      writes.push(
        supabaseAdmin.from('order_clicks').insert([
          {
            service_id: resolvedServiceId,
            user_agent: userAgent,
            created_at: new Date().toISOString(),
          },
        ]),
      );
    }

    await Promise.allSettled(writes);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.warn('Tracking notice:', err);
    return NextResponse.json({ ok: false });
  }
}
