import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  return NextResponse.json(
    { error: 'AI Project Advisor is currently unavailable (Coming Soon).' },
    { status: 503 },
  );
}
