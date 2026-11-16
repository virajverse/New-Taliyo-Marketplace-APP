import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { enforceRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

function clampString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'tracking');
  if (limited) return limited;

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const safeDeviceId = clampString(body?.device_id, 128);
    if (!safeDeviceId) {
      return NextResponse.json({ error: 'device_id required' }, { status: 400 });
    }

    const userAgent = clampString(body?.ua, 512) || (req.headers.get('user-agent') || '').slice(0, 512) || null;
    const safePlatform = clampString(body?.platform, 64);
    const safeLang = clampString(body?.lang, 32);
    const safeUtmSource = clampString(body?.utm_source, 128);
    const safeUtmMedium = clampString(body?.utm_medium, 128);
    const safeUtmCampaign = clampString(body?.utm_campaign, 128);
    const safeRef = clampString(body?.ref, 512);
    const safeSource = clampString(body?.source, 128);
    const safeUserId = clampString(body?.user_id, 64);
    const safeUserEmail = clampString(body?.user_email, 255);
    const safeEvent = clampString(body?.event, 64);
    const safeType = clampString(body?.type, 64);

    if (!safeEvent && !safeType) {
      return NextResponse.json({ error: 'event or type required' }, { status: 400 });
    }

    const writes: PromiseLike<unknown>[] = [];

    if (safeEvent) {
      writes.push(
        supabaseAdmin.from('pwa_installs').insert([
          {
            device_id: safeDeviceId,
            event: safeEvent,
            ua: userAgent,
            platform: safePlatform,
            lang: safeLang,
            utm_source: safeUtmSource,
            utm_medium: safeUtmMedium,
            utm_campaign: safeUtmCampaign,
            ref: safeRef,
            source: safeSource,
            user_id: safeUserId,
            user_email: safeUserEmail,
          },
        ]),
      );
    }

    if (safeType) {
      writes.push(
        supabaseAdmin.from('pwa_install_events').insert([
          {
            device_id: safeDeviceId,
            type: safeType,
            ua: userAgent,
            platform: safePlatform,
            lang: safeLang,
            utm_source: safeUtmSource,
            utm_medium: safeUtmMedium,
            utm_campaign: safeUtmCampaign,
            ref: safeRef,
            user_id: safeUserId,
            user_email: safeUserEmail,
          },
        ]),
      );
    }

    await Promise.allSettled(writes);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
