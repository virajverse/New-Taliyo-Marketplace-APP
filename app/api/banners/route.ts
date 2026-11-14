import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { cachedFetch } from '@/lib/redisCache';

export const dynamic = 'force-dynamic';

const REVALIDATE_HEADERS = {
  'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
};

export async function GET() {
  try {
    const { data, cacheLayer } = await cachedFetch('taliyo:banners:active', 120, async () => {
      const { data: rows, error } = await supabaseAdmin
        .from('banners')
        .select('id, image_url, video_url, cta_text, cta_url, cta_align, target, duration_ms, alt_text, active, sort_order, created_at')
        .eq('active', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Supabase banners query notice:', error);
        return [];
      }
      return rows || [];
    });

    return NextResponse.json(
      { data },
      { headers: { ...REVALIDATE_HEADERS, 'X-Taliyo-Cache': cacheLayer } },
    );
  } catch (err: unknown) {
    console.error('Error fetching banners:', err);
    return NextResponse.json({ data: [] }, { headers: REVALIDATE_HEADERS });
  }
}
