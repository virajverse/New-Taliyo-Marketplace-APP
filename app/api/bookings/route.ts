import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  checkCouponCustomerEligibility,
  evaluateCoupon,
  incrementCouponUsage,
  loadCoupons,
} from '@/lib/couponServer';
import { enforceRateLimit } from '@/lib/rateLimit';
import {
  findExistingBookingWithUtr,
  loadGatewayConfig,
  loadVerifiedUtrPool,
  normalizeUtr,
  saveVerifiedUtrPool,
} from '@/lib/paymentServer';

export const dynamic = 'force-dynamic';

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
};

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    const userId = url.searchParams.get('userId');
    const email = url.searchParams.get('email');

    if (!id && !userId && !email) {
      return NextResponse.json({ data: [] }, { headers: NO_CACHE_HEADERS });
    }

    let query = supabaseAdmin
      .from('bookings')
      .select('*')
      .order('created_at', { ascending: false });

    if (id) {
      query = query.eq('id', id);
    } else {
      const filters: string[] = [];
      if (userId) filters.push(`user_id.eq.${userId}`);
      if (email) {
        filters.push(`email.eq.${email}`);
        filters.push(`customer_email.eq.${email}`);
      }
      query = query.or(filters.join(','));
    }

    const { data, error } = await query;

    if (error) {
      console.warn('Bookings query notice:', error);
      return NextResponse.json({ data: [] }, { headers: NO_CACHE_HEADERS });
    }

    return NextResponse.json({ data: data || [] }, { headers: NO_CACHE_HEADERS });
  } catch (err: unknown) {
    console.error('Error fetching bookings:', err);
    return NextResponse.json({ data: [] }, { headers: NO_CACHE_HEADERS });
  }
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'bookings');
  if (limited) return limited;

  try {
    const body = await req.json();
    const paymentMethod = String(body.payment_method || body.paymentMethod || 'upi').toLowerCase();
    const orderRef = String(body.order_ref || body.orderRef || '').trim();
    const rawCouponCode = body.coupon_code ? String(body.coupon_code).toUpperCase().trim() : null;
    let couponCode: string | null = null;
    let discountAmount = 0;
    const advanceAmount = Number(body.advance_amount || 0) || 0;

    if (rawCouponCode) {
      const allCoupons = await loadCoupons();
      let cartItemsArr: Array<{ price?: number | string; quantity?: number | string }> = [];
      try {
        cartItemsArr =
          typeof body.cart_items === 'string'
            ? JSON.parse(body.cart_items)
            : Array.isArray(body.cart_items)
            ? body.cart_items
            : [];
      } catch {
        cartItemsArr = [];
      }
      const cartSubtotal = Array.isArray(cartItemsArr)
        ? cartItemsArr.reduce(
            (sum, item) => sum + (Number(item?.price || 0) * (Number(item?.quantity || 1) || 1)),
            0,
          )
        : 0;
      const orderAmountBeforeDiscount =
        cartSubtotal > 0
          ? cartSubtotal
          : Number(body.order_subtotal || 0) ||
            Number(body.final_price || 0) + (Number(body.discount_amount || 0) || 0);
      const check = evaluateCoupon(allCoupons, rawCouponCode, orderAmountBeforeDiscount);
      if (!check.valid) {
        return NextResponse.json({ error: check.message }, { status: 400 });
      }
      const customerEmail = body.email || body.customer_email || null;
      const eligibility = await checkCouponCustomerEligibility(
        check.coupon,
        body.user_id || null,
        customerEmail,
      );
      if (!eligibility.ok) {
        return NextResponse.json(
          { error: eligibility.reason || `You are not eligible for coupon '${check.code}'` },
          { status: 400 },
        );
      }
      couponCode = check.code;
      discountAmount = check.discountAmount;
    }

    // Extract explicit UTR or parse from requirements fallback
    let rawUtr = String(body.utr || body.transaction_id || '').trim();
    if (!rawUtr && typeof body.requirements === 'string') {
      const m = body.requirements.match(/UTR\s*[:#-]?\s*([A-Za-z0-9]{8,24})/i);
      if (m) rawUtr = m[1];
    }

    const gatewayConfig = await loadGatewayConfig();
    let finalStatus: 'pending' | 'confirmed' = 'pending';
    let autoVerified = false;
    let verifiedSource: string | null = null;
    let cleanUtr = rawUtr;

    if (rawUtr) {
      const check = normalizeUtr(rawUtr, paymentMethod);
      if (!check.valid) {
        return NextResponse.json(
          { error: check.reason || 'Valid transaction UTR / Reference required' },
          { status: 400 }
        );
      }
      cleanUtr = check.clean;

      const duplicate = await findExistingBookingWithUtr(cleanUtr);
      if (duplicate) {
        return NextResponse.json(
          {
            error: `Duplicate UTR: Reference ${cleanUtr} is already used in Order #${String(duplicate.id).slice(0, 8)}`,
          },
          { status: 409 }
        );
      }

      if (gatewayConfig.autoVerifyEnabled) {
        const pool = await loadVerifiedUtrPool();
        const poolEntry = pool.find((entry) => entry.utr === cleanUtr);
        if (poolEntry) {
          const expectedAmt = advanceAmount || Number(body.final_price || 0);
          const amtMatches =
            !poolEntry.amount ||
            !expectedAmt ||
            Math.abs(Number(poolEntry.amount) - expectedAmt) <= 5 ||
            Math.abs(Number(poolEntry.amount) - Number(body.final_price || 0)) <= 5;

          if (amtMatches) {
            finalStatus = 'confirmed';
            autoVerified = true;
            verifiedSource = poolEntry.source || 'Settlement Pool';
          }
        }
      }
    }

    let existingNotesObj: Record<string, unknown> = {};
    if (body.additional_notes) {
      try {
        existingNotesObj =
          typeof body.additional_notes === 'string'
            ? JSON.parse(body.additional_notes)
            : body.additional_notes;
      } catch {
        existingNotesObj = {};
      }
    }

    const timeline = Array.isArray(existingNotesObj.timeline) ? [...existingNotesObj.timeline] : [];
    if (autoVerified) {
      timeline.push({
        step: 4,
        label: 'Advance Paid',
        note: `Auto-Verified at checkout via ${verifiedSource} (UTR: ${cleanUtr})`,
        at: new Date().toISOString(),
      });
    }

    const structuredNotes = {
      ...existingNotesObj,
      timeline,
      paymentMethod,
      orderRef: orderRef || null,
      utr: cleanUtr || null,
      couponCode,
      discountAmount,
      advanceAmount,
      paymentVerified: autoVerified,
      verifiedUtr: autoVerified ? cleanUtr : null,
      verifiedBy: autoVerified ? verifiedSource : null,
      verifiedAt: autoVerified ? new Date().toISOString() : null,
    };

    const payload = {
      service_title: body.service_title || 'Custom Service Order',
      service_price: String(body.service_price || body.final_price || '0'),
      provider_name: body.provider_name || 'Taliyo Technologies',
      full_name: body.full_name || body.customer_name || 'Guest Customer',
      customer_name: body.customer_name || body.full_name || 'Guest Customer',
      email: body.email || body.customer_email || null,
      customer_email: body.customer_email || body.email || null,
      phone: body.phone || body.customer_phone || body.whatsapp_number || null,
      customer_phone: body.customer_phone || body.phone || body.whatsapp_number || null,
      whatsapp_number: body.whatsapp_number || body.phone || null,
      requirements: body.requirements || 'Standard Delivery',
      cart_items: typeof body.cart_items === 'string' ? body.cart_items : JSON.stringify(body.cart_items || []),
      status: finalStatus,
      final_price: Number(body.final_price) || 0,
      user_id: body.user_id || null,
      additional_notes: JSON.stringify(structuredNotes),
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from('bookings')
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.error('Booking insert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (autoVerified && cleanUtr && data?.id) {
      const pool = await loadVerifiedUtrPool();
      const updatedPool = pool.map((entry) =>
        entry.utr === cleanUtr ? { ...entry, matchedBookingId: data.id } : entry
      );
      await saveVerifiedUtrPool(updatedPool);
    }

    if (couponCode) {
      await incrementCouponUsage(couponCode);
    }

    // Record conversion in order_clicks & analytics so Old Admin /tracking and /metrics stay live
    try {
      const uuidMatch =
        Array.isArray(body.cart_items) &&
        body.cart_items.find((i: { id?: string; service_id?: string }) =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            String(i?.service_id || i?.id || ''),
          ),
        );
      const trackedServiceId = uuidMatch ? String(uuidMatch.service_id || uuidMatch.id) : null;
      await Promise.allSettled([
        supabaseAdmin.from('order_clicks').insert([
          {
            service_id: trackedServiceId,
            user_agent: (req.headers.get('user-agent') || '').slice(0, 500) || null,
            created_at: new Date().toISOString(),
          },
        ]),
        supabaseAdmin.from('analytics').insert([
          {
            service_id: trackedServiceId,
            event_type: 'order_created',
            event_data: {
              booking_id: data?.id || null,
              payment_method: paymentMethod,
              coupon_code: couponCode,
              final_price: payload.final_price,
            },
            user_agent: (req.headers.get('user-agent') || '').slice(0, 500) || null,
            created_at: new Date().toISOString(),
          },
        ]),
      ]);
    } catch {}

    return NextResponse.json({ data, autoVerified, verifiedSource }, { status: 201 });
  } catch (err: unknown) {
    console.error('Error creating booking:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const id = String(body.id || '').trim();
    const userId = body.userId ? String(body.userId).trim() : '';
    const email = body.email ? String(body.email).trim().toLowerCase() : '';
    const action = String(body.action || '').trim();

    if (!id || action !== 'cancel' || (!userId && !email)) {
      return NextResponse.json({ error: 'Valid booking id, action, and user credentials required' }, { status: 400 });
    }

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('bookings')
      .select('id, user_id, email, customer_email, status')
      .eq('id', id)
      .maybeSingle();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const matchesOwner =
      (userId && existing.user_id === userId) ||
      (email &&
        (String(existing.email || '').toLowerCase() === email ||
          String(existing.customer_email || '').toLowerCase() === email));

    if (!matchesOwner) {
      return NextResponse.json({ error: 'Not authorized to modify this order' }, { status: 403 });
    }

    if (existing.status === 'delivered' || existing.status === 'completed' || existing.status === 'cancelled') {
      return NextResponse.json({ error: `Cannot cancel order with status "${existing.status}"` }, { status: 400 });
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ data: updated, success: true });
  } catch (err: unknown) {
    console.error('Error updating booking:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
