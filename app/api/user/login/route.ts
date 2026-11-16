import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { enforceRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

const uuidRegex =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function getClientIp(req: NextRequest): string | null {
  const fwd = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  const ip = fwd || req.headers.get('x-real-ip') || '';
  return ip ? ip.slice(0, 120) : null;
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'authSignup');
  if (limited) return limited;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      userId?: string;
      email?: string;
      phone?: string;
    };
    const rawUserId = typeof body?.userId === 'string' ? body.userId.trim() : null;
    const rawEmail = typeof body?.email === 'string' ? body.email.trim() : null;
    const rawPhone = typeof body?.phone === 'string' ? body.phone.trim() : null;

    const userId = rawUserId && uuidRegex.test(rawUserId) ? rawUserId : null;
    const email = rawEmail && rawEmail.length <= 255 ? rawEmail : null;
    const phone = rawPhone && rawPhone.length <= 32 ? rawPhone : null;

    if (!userId && !email) {
      return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from('analytics').insert({
      service_id: null,
      event_type: 'user_login',
      event_data: { user_id: userId, email, phone },
      user_ip: getClientIp(req),
      user_agent: (req.headers.get('user-agent') || '').slice(0, 500) || null,
      referrer: (req.headers.get('referer') || '').slice(0, 500) || null,
      created_at: new Date().toISOString(),
    });

    if (error) {
      return NextResponse.json({ ok: false, error: 'insert_failed' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 });
  }
}
