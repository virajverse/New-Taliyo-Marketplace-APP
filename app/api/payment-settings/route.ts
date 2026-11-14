import { NextResponse } from 'next/server';
import { loadGatewayConfig, stripSecretConfig } from '@/lib/paymentServer';
import { cachedFetch } from '@/lib/redisCache';

export const dynamic = 'force-dynamic';

const REVALIDATE_HEADERS = {
  'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
};

export async function GET() {
  try {
    const { data, cacheLayer } = await cachedFetch('taliyo:payment-settings', 120, async () => {
      const config = await loadGatewayConfig();
      return stripSecretConfig(config);
    });
    return NextResponse.json(
      { data },
      { headers: { ...REVALIDATE_HEADERS, 'X-Taliyo-Cache': cacheLayer } }
    );
  } catch (err) {
    console.error('Public payment-settings GET error:', err);
    return NextResponse.json(
      { error: 'failed_to_load_payment_settings' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
