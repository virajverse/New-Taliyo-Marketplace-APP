import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { bumpCacheVersions, cachedFetch, invalidateCacheKeys, invalidateCachePrefix } from '@/lib/redisCache';
import { enforceRateLimit } from '@/lib/rateLimit';
import { resolveAuthUserFromRequest } from '@/lib/authServer';

export const dynamic = 'force-dynamic';

const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const REVALIDATE_HEADERS = {
  'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
};

export async function GET() {
  try {
    const { data, cacheLayer } = await cachedFetch('taliyo:reviews:approved', 120, async () => {
      const { data: rows, error } = await supabaseAdmin
        .from('reviews')
        .select('id, service_id, customer_name, rating, review_text, is_approved, is_featured, created_at')
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
    const auth = await resolveAuthUserFromRequest(req);
    if (!auth.user) {
      return NextResponse.json(
        { error: auth.error || 'Please sign in to submit a verified review.' },
        { status: auth.status || 401 },
      );
    }
    const authUser = auth.user;

    const body = await req.json().catch(() => ({}));
    const rawBookingId = String(body.bookingId || body.booking_id || '').trim();
    const ratingNumber = Number(body.rating);
    const reviewText = String(body.review_text || body.reviewText || '').trim();
    const customerNameInput = String(body.customer_name || '').trim();

    if (!Number.isFinite(ratingNumber) || ratingNumber < 1 || ratingNumber > 5) {
      return NextResponse.json({ error: 'Rating must be between 1 and 5' }, { status: 400 });
    }
    if (!reviewText) {
      return NextResponse.json({ error: 'Review text is required' }, { status: 400 });
    }

    // Locate a verified booking belonging to the authenticated user
    let verifiedBooking: {
      id: string;
      user_id?: string | null;
      email?: string | null;
      customer_email?: string | null;
      service_id?: string | null;
      full_name?: string | null;
      customer_name?: string | null;
    } | null = null;

    if (rawBookingId) {
      if (!UUID_REGEX.test(rawBookingId)) {
        return NextResponse.json({ error: 'Invalid bookingId' }, { status: 400 });
      }
      const { data: bookingRow } = await supabaseAdmin
        .from('bookings')
        .select('id, user_id, email, customer_email, service_id, full_name, customer_name')
        .eq('id', rawBookingId)
        .maybeSingle();

      if (!bookingRow) {
        return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
      }

      const isOwner =
        bookingRow.user_id === authUser.id ||
        (Boolean(authUser.email) &&
          (String(bookingRow.email || '').trim().toLowerCase() === authUser.email ||
            String(bookingRow.customer_email || '').trim().toLowerCase() === authUser.email));

      if (!isOwner) {
        return NextResponse.json({ error: 'You cannot review this booking' }, { status: 403 });
      }
      verifiedBooking = bookingRow;
    } else {
      const filters: string[] = [`user_id.eq.${authUser.id}`];
      if (authUser.email) {
        filters.push(`email.eq.${authUser.email}`);
        filters.push(`customer_email.eq.${authUser.email}`);
      }
      const { data: userBookings } = await supabaseAdmin
        .from('bookings')
        .select('id, user_id, email, customer_email, service_id, full_name, customer_name, status')
        .or(filters.join(','))
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(1);

      if (!userBookings || userBookings.length === 0) {
        return NextResponse.json(
          { error: 'Verified purchase required: please place an order before submitting a review.' },
          { status: 403 },
        );
      }
      verifiedBooking = userBookings[0];
    }

    const serviceId = verifiedBooking.service_id || null;
    const resolvedName =
      customerNameInput || verifiedBooking.customer_name || verifiedBooking.full_name || 'Verified Client';
    const resolvedEmail = verifiedBooking.customer_email || verifiedBooking.email || authUser.email;

    const { data: existingReview } = await supabaseAdmin
      .from('reviews')
      .select('id')
      .eq('booking_id', verifiedBooking.id)
      .maybeSingle();

    let savedReview = null;
    if (existingReview?.id) {
      const { data: updated, error: updateErr } = await supabaseAdmin
        .from('reviews')
        .update({
          rating: ratingNumber,
          review_text: reviewText,
          service_id: serviceId,
          customer_name: resolvedName,
          customer_email: resolvedEmail,
          is_approved: true,
        })
        .eq('id', existingReview.id)
        .select()
        .single();
      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }
      savedReview = updated;
    } else {
      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from('reviews')
        .insert([
          {
            booking_id: verifiedBooking.id,
            service_id: serviceId,
            customer_name: resolvedName,
            customer_email: resolvedEmail,
            rating: ratingNumber,
            review_text: reviewText,
            is_approved: true,
            is_featured: false,
            created_at: new Date().toISOString(),
          },
        ])
        .select()
        .single();
      if (insertErr) {
        return NextResponse.json({ error: insertErr.message }, { status: 500 });
      }
      savedReview = inserted;
    }

    // Recalculate rating_average & rating_count on the linked service (ported from Old App)
    if (serviceId) {
      try {
        const { data: approvedReviews } = await supabaseAdmin
          .from('reviews')
          .select('rating')
          .eq('service_id', serviceId)
          .eq('is_approved', true);
        if (Array.isArray(approvedReviews)) {
          const validRatings = approvedReviews
            .map((r: { rating?: number | null }) => Number(r?.rating))
            .filter((n) => Number.isFinite(n) && n >= 1 && n <= 5);
          const count = validRatings.length;
          const avg = count > 0 ? Number((validRatings.reduce((a, b) => a + b, 0) / count).toFixed(2)) : 0;
          await supabaseAdmin
            .from('services')
            .update({ rating_average: avg, rating_count: count })
            .eq('id', serviceId);
        }
      } catch (aggErr) {
        console.warn('Service rating aggregate notice:', aggErr);
      }
    }

    await Promise.all([
      invalidateCacheKeys('taliyo:reviews:approved'),
      invalidateCachePrefix('taliyo:catalog:'),
      bumpCacheVersions('reviews'),
      bumpCacheVersions('catalog'),
    ]);

    return NextResponse.json({ data: savedReview }, { status: 201 });
  } catch (err: unknown) {
    console.error('Error posting review:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
