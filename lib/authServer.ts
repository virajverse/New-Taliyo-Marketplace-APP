import type { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export interface VerifiedAuthUser {
  id: string;
  email: string | null;
  emailConfirmed: boolean;
  isBlocked: boolean;
}

export async function resolveAuthUserFromRequest(
  req: NextRequest | Request,
): Promise<{ user: VerifiedAuthUser | null; error?: string; status?: number }> {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!token) {
    return { user: null, error: 'Authentication required', status: 401 };
  }

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    const u = data?.user;
    if (error || !u?.id) {
      return { user: null, error: 'Invalid or expired session', status: 401 };
    }

    const appMeta = (u.app_metadata || {}) as Record<string, unknown>;
    const isBlocked = Boolean(appMeta.blocked);
    if (isBlocked) {
      return { user: null, error: 'Account is blocked', status: 403 };
    }

    return {
      user: {
        id: u.id,
        email: u.email ? u.email.toLowerCase() : null,
        emailConfirmed: Boolean(u.email_confirmed_at),
        isBlocked,
      },
    };
  } catch {
    return { user: null, error: 'Unable to verify session', status: 401 };
  }
}
