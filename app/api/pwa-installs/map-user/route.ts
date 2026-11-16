import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { enforceRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    const device_id = clampString(body?.device_id, 128);
    const user_id = clampString(body?.user_id, 64);
    const user_email = clampString(body?.user_email, 255);

    if (!device_id || !user_id || !UUID_REGEX.test(user_id)) {
      return NextResponse.json({ error: 'Valid device_id and user_id required' }, { status: 400 });
    }

    const updates = { user_id, user_email: user_email || null };

    const [a, b] = await Promise.allSettled([
      supabaseAdmin
        .from('pwa_installs')
        .update(updates)
        .eq('device_id', device_id)
        .is('user_id', null),
      supabaseAdmin
        .from('pwa_install_events')
        .update(updates)
        .eq('device_id', device_id)
        .is('user_id', null),
    ]);

    return NextResponse.json({
      ok: true,
      updated_installs: a.status === 'fulfilled' ? a.value.count || null : null,
      updated_events: b.status === 'fulfilled' ? b.value.count || null : null,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
