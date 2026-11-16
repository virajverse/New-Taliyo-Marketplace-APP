import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { cachedFetch } from '@/lib/redisCache';

export const dynamic = 'force-dynamic';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function makeHeaders(cacheLayer: string, sMaxAge = 60, swr = 300) {
  return {
    'Cache-Control': `public, s-maxage=${sMaxAge}, stale-while-revalidate=${swr}`,
    'X-Taliyo-Cache': cacheLayer,
  };
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const mode = (url.searchParams.get('mode') || 'featured').trim().toLowerCase();

    if (mode === 'featured') {
      const { data, cacheLayer } = await cachedFetch('taliyo:catalog:featured', 120, async () => {
        const { data: rows, error } = await supabaseAdmin
          .from('services')
          .select('id, title, price_min, rating_average, rating_count, images, provider_name, slug, is_featured, service_plans(price_min)')
          .eq('is_active', true)
          .limit(6);
        if (error) throw error;
        return rows || [];
      });
      return NextResponse.json({ data }, { headers: makeHeaders(cacheLayer) });
    }

    if (mode === 'categories') {
      const { data, cacheLayer } = await cachedFetch('taliyo:catalog:categories', 180, async () => {
        const { data: rows, error } = await supabaseAdmin
          .from('categories')
          .select('id, name, description, slug, icon, sort_order')
          .eq('is_active', true)
          .order('sort_order', { ascending: true });
        if (error) throw error;
        return rows || [];
      });
      return NextResponse.json({ data }, { headers: makeHeaders(cacheLayer, 90, 300) });
    }

    if (mode === 'category') {
      const rawSlug = (url.searchParams.get('slug') || '').trim();
      if (!rawSlug) {
        return NextResponse.json({ category: null, subcategories: [], services: [] }, { status: 400 });
      }
      const key = `taliyo:catalog:category:${rawSlug.toLowerCase().slice(0, 80)}`;
      const { data, cacheLayer } = await cachedFetch(key, 120, async () => {
        const isUUID = UUID_REGEX.test(rawSlug);
        const { data: category } = isUUID
          ? await supabaseAdmin
              .from('categories')
              .select('*')
              .or(`slug.eq.${rawSlug},id.eq.${rawSlug}`)
              .maybeSingle()
          : await supabaseAdmin
              .from('categories')
              .select('*')
              .eq('slug', rawSlug)
              .maybeSingle();

        if (!category) {
          return { category: null, subcategories: [], services: [] };
        }

        const [{ data: subcats }, { data: catServices }] = await Promise.all([
          supabaseAdmin
            .from('subcategories')
            .select('name, slug')
            .eq('category_id', category.id)
            .eq('is_active', true)
            .order('sort_order', { ascending: true }),
          supabaseAdmin
            .from('services')
            .select('*, service_plans(price_min), subcategories(name)')
            .eq('category_id', category.id)
            .eq('is_active', true),
        ]);

        return {
          category,
          subcategories: subcats || [],
          services: catServices || [],
        };
      });
      return NextResponse.json(data, { headers: makeHeaders(cacheLayer) });
    }

    if (mode === 'search') {
      const { data, cacheLayer } = await cachedFetch('taliyo:catalog:search', 120, async () => {
        const [{ data: catData }, { data: svcData }] = await Promise.all([
          supabaseAdmin
            .from('categories')
            .select('id, name')
            .eq('is_active', true)
            .order('sort_order', { ascending: true }),
          supabaseAdmin
            .from('services')
            .select('*, service_plans(price_min, estimated_delivery_time)')
            .eq('is_active', true),
        ]);
        return {
          categories: catData || [],
          services: svcData || [],
        };
      });
      return NextResponse.json(data, { headers: makeHeaders(cacheLayer) });
    }

    if (mode === 'service') {
      const rawId = (url.searchParams.get('id') || '').trim();
      if (!rawId) {
        return NextResponse.json({ service: null, plans: [], reviews: [] }, { status: 400 });
      }
      const key = `taliyo:catalog:service:${rawId.toLowerCase().slice(0, 100)}`;
      const { data, cacheLayer } = await cachedFetch(key, 90, async () => {
        const isUUID = UUID_REGEX.test(rawId);
        const { data: svc } = isUUID
          ? await supabaseAdmin
              .from('services')
              .select('*')
              .or(`slug.eq.${rawId},id.eq.${rawId}`)
              .maybeSingle()
          : await supabaseAdmin
              .from('services')
              .select('*')
              .eq('slug', rawId)
              .maybeSingle();

        if (!svc) {
          return { service: null, plans: [], reviews: [] };
        }

        const [{ data: plans }, { data: reviews }, catRes, subcatRes, { data: relatedRows }] = await Promise.all([
          supabaseAdmin
            .from('service_plans')
            .select('*')
            .eq('service_id', svc.id)
            .order('sort_order', { ascending: true }),
          supabaseAdmin
            .from('reviews')
            .select('id, service_id, customer_name, rating, review_text, is_approved, is_featured, created_at')
            .eq('is_approved', true)
            .order('created_at', { ascending: false })
            .limit(4),
          svc.category_id
            ? supabaseAdmin
                .from('categories')
                .select('id, name, slug')
                .eq('id', svc.category_id)
                .maybeSingle()
            : Promise.resolve({ data: null }),
          svc.subcategory_id
            ? supabaseAdmin
                .from('subcategories')
                .select('id, name, slug')
                .eq('id', svc.subcategory_id)
                .maybeSingle()
            : Promise.resolve({ data: null }),
          supabaseAdmin
            .from('services')
            .select('id, title, slug, price_min, rating_average, rating_count, images, is_featured, category_id, service_plans(price_min)')
            .eq('is_active', true)
            .neq('id', svc.id)
            .order('is_featured', { ascending: false })
            .limit(8),
        ]);

        const catData = catRes && 'data' in catRes ? catRes.data : null;
        const subcatData = subcatRes && 'data' in subcatRes ? subcatRes.data : null;

        // Prioritize same-category systems first, then top systems
        const sameCategory = (relatedRows || []).filter((r) => r.category_id === svc.category_id);
        const otherCategory = (relatedRows || []).filter((r) => r.category_id !== svc.category_id);
        const sortedRelated = [...sameCategory, ...otherCategory].slice(0, 4);

        return {
          service: svc,
          category: catData,
          subcategory: subcatData,
          relatedServices: sortedRelated,
          plans: plans || [],
          reviews: reviews || [],
        };
      });

      if (!data.service) {
        return NextResponse.json(data, { status: 404, headers: makeHeaders(cacheLayer, 30, 60) });
      }
      return NextResponse.json(data, { headers: makeHeaders(cacheLayer) });
    }

    if (mode === 'milestones') {
      const { data, cacheLayer } = await cachedFetch('taliyo:catalog:milestones', 300, async () => {
        const { data: steps } = await supabaseAdmin
          .from('service_plan_progress_steps')
          .select('*')
          .order('sort_order', { ascending: true })
          .limit(7);
        return steps || [];
      });
      return NextResponse.json({ data }, { headers: makeHeaders(cacheLayer, 120, 600) });
    }

    if (mode === 'by-ids') {
      const rawIds = (url.searchParams.get('ids') || '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => UUID_REGEX.test(s))
        .slice(0, 50);

      if (!rawIds.length) {
        return NextResponse.json({ data: [] }, { headers: makeHeaders('skip', 30, 60) });
      }
      const sortedKey = `taliyo:catalog:ids:${[...rawIds].sort().join(',')}`;
      const { data, cacheLayer } = await cachedFetch(sortedKey, 120, async () => {
        const { data: rows } = await supabaseAdmin
          .from('services')
          .select('*, service_plans(price_min)')
          .in('id', rawIds)
          .eq('is_active', true);
        return rows || [];
      });
      return NextResponse.json({ data }, { headers: makeHeaders(cacheLayer) });
    }

    return NextResponse.json({ error: 'Unknown catalog mode' }, { status: 400 });
  } catch (err) {
    console.error('Catalog API error:', err);
    return NextResponse.json({ error: 'Failed to load catalog' }, { status: 500 });
  }
}
