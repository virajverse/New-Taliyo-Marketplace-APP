import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { bumpCacheVersions, cachedFetch, invalidateCacheKeys, invalidateCachePrefix } from '@/lib/redisCache';
import { enforceRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

const REVALIDATE_HEADERS = {
  'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
};

export async function GET() {
  try {
    const { data, cacheLayer } = await cachedFetch('taliyo:reviews:approved', 120, async () => {
      const { data: rows, error } = await supabaseAdmin
        .from('reviews')
        .select('id, customer_name, customer_email, rating, review_text, is_approved, is_featured, created_at')
        .eq('is_approved', true)
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Reviews query notice:', error);
        return [];
      }
      return rows || [];
    });

    return NextResponse.json(
      { data },
      { headers: { ...REVALIDATE_HEADERS, 'X-Taliyo-Cache': cacheLayer } },
    );
  } catch (err: unknown) {
    console.error('Error fetching reviews:', err);
    return NextResponse.json({ data: [] }, { headers: REVALIDATE_HEADERS });
  }
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'reviewsPost');
  if (limited) return limited;

  try {
    const body = await req.json();
    const { customer_name, customer_email, rating, review_text, is_featured } = body;

    if (!customer_name || !rating) {
      return NextResponse.json({ error: 'Name and rating are required' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('reviews')
      .insert([
        {
          customer_name: String(customer_name).trim(),
          customer_email: customer_email ? String(customer_email).trim() : null,
          rating: Number(rating) || 5,
          review_text: review_text ? String(review_text).trim() : null,
          is_approved: true, // Auto-approve or set for moderation
          is_featured: !!is_featured,
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('Reviews insert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await Promise.all([
      invalidateCacheKeys('taliyo:reviews:approved'),
      invalidateCachePrefix('taliyo:catalog:service:'),
      bumpCacheVersions('reviews'),
    ]);

    return NextResponse.json({ data }, { status: 201 });
  } catch (err: unknown) {
    console.error('Error posting review:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
