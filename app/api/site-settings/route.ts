import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { cachedFetch } from '@/lib/redisCache';

export const dynamic = 'force-dynamic';

const REVALIDATE_HEADERS = {
  'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
};

const PRIVATE_KEYS = new Set(['verified_utr_pool']);

export async function GET() {
  try {
    const { data: payload, cacheLayer } = await cachedFetch(
      'taliyo:site-settings',
      120,
      async () => {
        const [{ data, error }, { data: publicRows }] = await Promise.all([
          supabaseAdmin.from('site_settings').select('key, value, updated_at'),
          supabaseAdmin
            .from('settings')
            .select('key, value, updated_at')
            .eq('is_public', true),
        ]);

        if (error) {
          console.warn('Supabase site_settings query notice:', error);
          return { data: [], settings: {} };
        }

        const safeRows = (data || [])
          .filter((row: { key: string; value: string }) => !PRIVATE_KEYS.has(row.key))
          .map((row: { key: string; value: string; updated_at?: string }) => {
            if (row.key === 'payment_gateway_config' && row.value) {
              try {
                const parsed = JSON.parse(row.value) as Record<string, unknown>;
                delete parsed.autoVerifyWebhookSecret;
                return { ...row, value: JSON.stringify(parsed) };
              } catch {
                return { ...row, value: '{}' };
              }
            }
            return row;
          });

        const settingsMap: Record<string, string> = {};
        const mergedRows: Array<{ key: string; value: string; updated_at?: string }> = [];
        const seenKeys = new Set<string>();

        safeRows.forEach((row: { key: string; value: string; updated_at?: string }) => {
          settingsMap[row.key] = row.value;
          seenKeys.add(row.key);
          mergedRows.push(row);
        });

        (publicRows || []).forEach((row: { key: string; value: string; updated_at?: string }) => {
          if (!row?.key || PRIVATE_KEYS.has(row.key) || seenKeys.has(row.key)) return;
          settingsMap[row.key] = row.value;
          seenKeys.add(row.key);
          mergedRows.push(row);
        });

        return { data: mergedRows, settings: settingsMap };
      },
      { cacheEmpty: false },
    );

    return NextResponse.json(payload, {
      headers: { ...REVALIDATE_HEADERS, 'X-Taliyo-Cache': cacheLayer },
    });
  } catch (err: unknown) {
    console.error('Error fetching site_settings:', err);
    return NextResponse.json({ data: [], settings: {} }, { headers: REVALIDATE_HEADERS });
  }
}
