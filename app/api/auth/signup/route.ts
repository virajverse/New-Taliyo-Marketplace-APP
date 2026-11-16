import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { enforceRateLimit } from '@/lib/rateLimit';
import { isDisposableEmail } from '@/lib/disposableEmail';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'authSignup');
  if (limited) return limited;

  try {
    // Check admin-panel `allowRegistrations` setting before creating new account
    try {
      const { data: sysRow } = await supabaseAdmin
        .from('site_settings')
        .select('value')
        .eq('key', 'admin_system_settings')
        .maybeSingle();
      if (sysRow?.value) {
        const parsed = JSON.parse(sysRow.value) as { allowRegistrations?: boolean };
        if (parsed.allowRegistrations === false) {
          return NextResponse.json(
            { error: 'Registrations are currently paused by the administrator.' },
            { status: 403 },
          );
        }
      }
    } catch {
      // Allow signup fallback if setting absent or unparseable
    }

    const { email, password, fullName, phone } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    if (typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }

    if (await isDisposableEmail(email)) {
      return NextResponse.json(
        { error: 'Disposable or temporary email addresses are not allowed.' },
        { status: 400 },
      );
    }

    if (typeof password !== 'string' || password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters.' },
        { status: 400 },
      );
    }

    const displayName =
      typeof fullName === 'string' && fullName.trim().length > 0
        ? fullName.trim()
        : String(email).split('@')[0] || 'Client';

    // Create user via admin API with email auto-confirmed
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: displayName,
        phone: phone || null,
      },
    });

    if (error) {
      // If user already exists, return helpful notice
      if (error.message?.includes('already been registered') || error.message?.includes('User already registered')) {
        return NextResponse.json({ error: 'User already exists. Please login.' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Also ensure profile row is created/upserted in public.profiles
    if (data?.user?.id) {
      try {
        await supabaseAdmin.from('profiles').upsert([
          {
            id: data.user.id,
            name: displayName,
            phone: phone || null,
            updated_at: new Date().toISOString(),
          },
        ]);
      } catch (profErr) {
        console.warn('Profile upsert notice:', profErr);
      }
    }

    return NextResponse.json({
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email,
        name: displayName,
      },
    });
  } catch (err: unknown) {
    console.error('Signup error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
