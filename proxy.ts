import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PROTECTED = [
  '/orders',
  '/order-status',
  '/notifications',
  '/settings',
];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isProtected = PROTECTED.some((p) => pathname === p || pathname.startsWith(p + '/'));
  if (!isProtected) return NextResponse.next();

  const hasSupabaseSession = req.cookies
    .getAll()
    .some(
      (c) =>
        Boolean(c.value) &&
        ((c.name.startsWith('sb-') && c.name.endsWith('-auth-token')) ||
          c.name === 'sb-auth-token' ||
          c.name === 'taliyo_auth'),
    );

  if (hasSupabaseSession) return NextResponse.next();

  const loginUrl = new URL('/login', req.url);
  const nextWithQuery = pathname + (req.nextUrl.search || '');
  loginUrl.searchParams.set('next', nextWithQuery);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    '/orders/:path*',
    '/order-status/:path*',
    '/notifications/:path*',
    '/settings/:path*',
  ],
};
