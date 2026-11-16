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
import { resolveAuthUserFromRequest } from '@/lib/authServer';
import { sendAdminNotification } from '@/lib/notifications';
import { bumpCacheVersions, invalidateCachePrefix } from '@/lib/redisCache';
import { getSourceCodeSpec } from '@/lib/sourceCodePricing';

export const dynamic = 'force-dynamic';

const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
};

interface CartItemInput {
  id?: string;
  service_id?: string;
  slug?: string;
  title?: string;
  packageName?: string;
  deliveryDays?: number;
  price?: number | string;
  quantity?: number | string;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await resolveAuthUserFromRequest(req);
    if (!auth.user) {
      return NextResponse.json(
        { data: [], error: auth.error || 'Authentication required' },
        { status: auth.status || 401, headers: NO_CACHE_HEADERS },
      );
    }

    const url = new URL(req.url);
    const id = url.searchParams.get('id')?.trim() || '';

    if (id) {
      if (!UUID_REGEX.test(id)) {
        return NextResponse.json({ data: [], error: 'Invalid booking id' }, { status: 400, headers: NO_CACHE_HEADERS });
      }
      const { data: row, error } = await supabaseAdmin
        .from('bookings')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error || !row) {
        return NextResponse.json({ data: [], error: 'Order not found' }, { status: 404, headers: NO_CACHE_HEADERS });
      }

      const authEmail = auth.user.email;
      const isOwner = row.user_id
        ? row.user_id === auth.user.id
        : Boolean(authEmail) &&
          (String(row.email || '').trim().toLowerCase() === authEmail ||
            String(row.customer_email || '').trim().toLowerCase() === authEmail);

      if (!isOwner) {
        return NextResponse.json({ data: [], error: 'Forbidden' }, { status: 403, headers: NO_CACHE_HEADERS });
      }

      return NextResponse.json({ data: [row] }, { headers: NO_CACHE_HEADERS });
    }

    const filters: string[] = [`user_id.eq.${auth.user.id}`];
    if (auth.user.email) {
      filters.push(`email.eq.${auth.user.email}`);
      filters.push(`customer_email.eq.${auth.user.email}`);
    }

    const { data, error } = await supabaseAdmin
      .from('bookings')
      .select('*')
      .or(filters.join(','))
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Bookings query notice:', error);
      return NextResponse.json({ data: [] }, { headers: NO_CACHE_HEADERS });
    }

    return NextResponse.json({ data: data || [] }, { headers: NO_CACHE_HEADERS });
  } catch (err: unknown) {
    console.error('Error fetching bookings:', err);
    return NextResponse.json({ data: [] }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'bookings');
  if (limited) return limited;

  try {
    const auth = await resolveAuthUserFromRequest(req);
    if (!auth.user) {
      return NextResponse.json(
        { error: auth.error || 'Please sign in to place an order' },
        { status: auth.status || 401 },
      );
    }
    const authUser = auth.user;

    const body = await req.json();
    const paymentMethod = String(body.payment_method || body.paymentMethod || 'upi').toLowerCase();
    const orderRef = String(body.order_ref || body.orderRef || '').trim();
    const rawCouponCode = body.coupon_code ? String(body.coupon_code).toUpperCase().trim() : null;

    let cartItemsArr: CartItemInput[] = [];
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

    // Resolve primary service_id UUID from body or cart items & verify authoritative prices from DB
    let service_id: string | null =
      typeof body.service_id === 'string' && UUID_REGEX.test(body.service_id.trim())
        ? body.service_id.trim()
        : null;

    let verifiedSubtotal = 0;
    let verifiedItemCount = 0;

    if (Array.isArray(cartItemsArr) && cartItemsArr.length > 0) {
      for (const item of cartItemsArr) {
        const qty = Math.max(1, Math.min(20, Number(item?.quantity || 1) || 1));
        const rawCandidate = String(item?.service_id || item?.slug || item?.id || '').trim();
        const cleanedSlug = rawCandidate.startsWith('cart-')
          ? rawCandidate.replace(/^cart-/, '').replace(/-(Source Code|Starter|Business|Professional|Standard|Enterprise|Plan \d+)$/i, '')
          : rawCandidate;

        let matchedSvc: {
          id: string;
          slug?: string | null;
          price_min?: number | null;
          service_plans?: Array<{ level?: string | null; price_min?: number | null }>;
        } | null = null;

        if (UUID_REGEX.test(cleanedSlug)) {
          const { data } = await supabaseAdmin
            .from('services')
            .select('id, slug, price_min, service_plans(level, price_min)')
            .eq('id', cleanedSlug)
            .maybeSingle();
          matchedSvc = data;
        } else if (cleanedSlug) {
          const { data } = await supabaseAdmin
            .from('services')
            .select('id, slug, price_min, service_plans(level, price_min)')
            .eq('slug', cleanedSlug)
            .maybeSingle();
          matchedSvc = data;
        }

        if (matchedSvc) {
          if (!service_id) service_id = matchedSvc.id;
          const pkgName = String(item?.packageName || '').toLowerCase();
          const plans = Array.isArray(matchedSvc.service_plans) ? matchedSvc.service_plans : [];

          let authoritativeUnitPrice = Number(item?.price || 0) || 0;
          if (pkgName.includes('source code') || pkgName.includes('theme')) {
            const spec = getSourceCodeSpec(matchedSvc.slug || cleanedSlug, Number(matchedSvc.price_min || 0));
            authoritativeUnitPrice = spec.sourceCodeInr;
          } else if (plans.length > 0) {
            const matchedPlan = plans.find((p) => pkgName && String(p.level || '').toLowerCase() === pkgName);
            if (matchedPlan && Number(matchedPlan.price_min || 0) > 0) {
              authoritativeUnitPrice = Number(matchedPlan.price_min);
            } else {
              const planPrices = plans.map((p) => Number(p.price_min || 0)).filter((v) => v > 0);
              const floor = planPrices.length ? Math.min(...planPrices) : Number(matchedSvc.price_min || 0);
              if (floor > 0 && authoritativeUnitPrice < floor) {
                authoritativeUnitPrice = floor;
              }
            }
          }
          verifiedSubtotal += authoritativeUnitPrice * qty;
          verifiedItemCount++;
        } else {
          const clientUnit = Math.max(0, Number(item?.price || 0) || 0);
          verifiedSubtotal += clientUnit * qty;
        }
      }
    } else if (service_id) {
      const { data: svc } = await supabaseAdmin
        .from('services')
        .select('id')
        .eq('id', service_id)
        .maybeSingle();
      if (!svc) service_id = null;
    }

    const clientSubtotal = Array.isArray(cartItemsArr)
      ? cartItemsArr.reduce((sum, item) => sum + (Number(item?.price || 0) * (Number(item?.quantity || 1) || 1)), 0)
      : 0;
    const orderAmountBeforeDiscount =
      verifiedItemCount > 0 && verifiedSubtotal > 0
        ? verifiedSubtotal
        : clientSubtotal > 0
        ? clientSubtotal
        : Number(body.order_subtotal || 0) ||
          Number(body.final_price || 0) + (Number(body.discount_amount || 0) || 0);

    let couponCode: string | null = null;
    let discountAmount = 0;

    if (rawCouponCode) {
      const allCoupons = await loadCoupons();
      const check = evaluateCoupon(allCoupons, rawCouponCode, orderAmountBeforeDiscount);
      if (!check.valid) {
        return NextResponse.json({ error: check.message }, { status: 400 });
      }
      const customerEmail = authUser.email || body.email || body.customer_email || null;
      const eligibility = await checkCouponCustomerEligibility(
        check.coupon,
        authUser.id,
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

    const gatewayConfig = await loadGatewayConfig();
    const afterDiscount = Math.max(0, orderAmountBeforeDiscount - discountAmount);
    const advanceRatio = (gatewayConfig.advancePercent || 30) / 100;
    const serverPayableNow =
      paymentMethod === 'advance' ? Math.round(afterDiscount * advanceRatio) : afterDiscount;
    const advanceAmount = paymentMethod === 'advance' ? serverPayableNow : 0;
    const finalPriceToPersist = serverPayableNow > 0 || afterDiscount === 0
      ? serverPayableNow
      : Number(body.final_price) || 0;

    // Extract explicit UTR or parse from requirements fallback
    let rawUtr = String(body.utr || body.transaction_id || '').trim();
    if (!rawUtr && typeof body.requirements === 'string') {
      const m = body.requirements.match(/UTR\s*[:#-]?\s*([A-Za-z0-9]{8,24})/i);
      if (m) rawUtr = m[1];
    }

    let finalStatus: 'pending' | 'confirmed' = 'pending';
    let autoVerified = false;
    let verifiedSource: string | null = null;
    let cleanUtr = rawUtr;

    if (finalPriceToPersist > 0 && ['upi', 'advance', 'bank'].includes(paymentMethod) && !rawUtr) {
      return NextResponse.json(
        { error: 'Transaction UTR / Bank Reference number is required for paid orders.' },
        { status: 400 },
      );
    }

    if (rawUtr) {
      const check = normalizeUtr(rawUtr, paymentMethod);
      if (!check.valid) {
        return NextResponse.json(
          { error: check.reason || 'Valid transaction UTR / Reference required' },
          { status: 400 },
        );
      }
      cleanUtr = check.clean;

      const duplicate = await findExistingBookingWithUtr(cleanUtr);
      if (duplicate) {
        return NextResponse.json(
          {
            error: `Duplicate UTR: Reference ${cleanUtr} is already used in Order #${String(duplicate.id).slice(0, 8)}`,
          },
          { status: 409 },
        );
      }

      if (gatewayConfig.autoVerifyEnabled) {
        const pool = await loadVerifiedUtrPool();
        const poolEntry = pool.find((entry) => entry.utr === cleanUtr);
        if (poolEntry) {
          const expectedAmt = advanceAmount || finalPriceToPersist;
          const amtMatches =
            !poolEntry.amount ||
            !expectedAmt ||
            Math.abs(Number(poolEntry.amount) - expectedAmt) <= 5 ||
            Math.abs(Number(poolEntry.amount) - finalPriceToPersist) <= 5;

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

    const deliveryDaysValues = Array.isArray(cartItemsArr)
      ? cartItemsArr
          .map((item) => (typeof item?.deliveryDays === 'number' && item.deliveryDays >= 0 ? item.deliveryDays : null))
          .filter((v): v is number => v !== null)
      : [];
    const resolvedDeliveryDays =
      deliveryDaysValues.length > 0 ? Math.max(...deliveryDaysValues) : null;

    const structuredNotes = {
      ...existingNotesObj,
      timeline,
      paymentMethod,
      orderRef: orderRef || null,
      utr: cleanUtr || null,
      couponCode,
      discountAmount,
      orderSubtotal: afterDiscount,
      advanceAmount,
      deliveryDays: resolvedDeliveryDays,
      balancePaid: advanceAmount <= 0 || afterDiscount <= advanceAmount,
      paymentVerified: autoVerified,
      verifiedUtr: autoVerified ? cleanUtr : null,
      verifiedBy: autoVerified ? verifiedSource : null,
      verifiedAt: autoVerified ? new Date().toISOString() : null,
    };

    const resolvedCustomerEmail = body.email || body.customer_email || authUser.email || null;
    const payload = {
      service_id,
      service_title: body.service_title || 'Custom Service Order',
      service_price: String(finalPriceToPersist),
      provider_name: body.provider_name || 'Taliyo Technologies',
      full_name: body.full_name || body.customer_name || 'Guest Customer',
      customer_name: body.customer_name || body.full_name || 'Guest Customer',
      email: resolvedCustomerEmail,
      customer_email: resolvedCustomerEmail,
      phone: body.phone || body.customer_phone || body.whatsapp_number || null,
      customer_phone: body.customer_phone || body.phone || body.whatsapp_number || null,
      whatsapp_number: body.whatsapp_number || body.phone || null,
      requirements: body.requirements || 'Standard Delivery',
      cart_items: typeof body.cart_items === 'string' ? body.cart_items : JSON.stringify(cartItemsArr),
      status: finalStatus,
      final_price: finalPriceToPersist,
      user_id: authUser.id,
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
        entry.utr === cleanUtr ? { ...entry, matchedBookingId: data.id } : entry,
      );
      await saveVerifiedUtrPool(updatedPool);
    }

    if (couponCode) {
      await incrementCouponUsage(couponCode);
    }

    // Customer & Admin notifications + analytics tracking (matching Old App workflow)
    const customerNotifMsg = autoVerified
      ? `Payment verified for "${payload.service_title}" (UTR: ${cleanUtr}). Your order #${String(data.id).slice(0, 6).toUpperCase()} is confirmed!`
      : cleanUtr
      ? `Your order "${payload.service_title}" was received with UTR ${cleanUtr}. Verification is in progress.`
      : `Your order "${payload.service_title}" has been placed. Our team will reach out shortly.`;

    const adminWhatsappNumber =
      (process.env.ADMIN_WHATSAPP_NUMBER || process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP || '').replace(/\D/g, '');
    const adminWaMsg = `New Order #${String(data.id).slice(0, 6).toUpperCase()}\nService: ${payload.service_title}\nCustomer: ${payload.full_name} (${payload.phone || 'N/A'})\nAmount: ₹${finalPriceToPersist.toLocaleString('en-IN')}\nMethod: ${paymentMethod.toUpperCase()}${cleanUtr ? ` | UTR: ${cleanUtr}` : ''}`;
    const adminWhatsappUrl = adminWhatsappNumber
      ? `https://wa.me/${adminWhatsappNumber}?text=${encodeURIComponent(adminWaMsg)}`
      : null;

    await Promise.allSettled([
      supabaseAdmin.from('notifications').insert({
        user_id: authUser.id,
        type: 'order',
        related_type: 'booking',
        related_id: data.id,
        title: autoVerified ? 'Payment Verified & Order Confirmed' : cleanUtr ? 'Payment Submitted for Verification' : 'Order Placed Successfully',
        message: customerNotifMsg,
        is_read: false,
      }),
      sendAdminNotification(
        `New Order: ${payload.service_title}`,
        `Customer: ${payload.full_name} (${payload.phone || payload.email || 'N/A'}) | Payable: ₹${finalPriceToPersist.toLocaleString('en-IN')} | Method: ${paymentMethod.toUpperCase()}${cleanUtr ? ` (UTR: ${cleanUtr})` : ''}`,
      ),
      supabaseAdmin.from('order_clicks').insert([
        {
          service_id,
          user_agent: (req.headers.get('user-agent') || '').slice(0, 500) || null,
          created_at: new Date().toISOString(),
        },
      ]),
      supabaseAdmin.from('analytics').insert([
        {
          service_id,
          event_type: 'order_created',
          event_data: {
            booking_id: data?.id || null,
            payment_method: paymentMethod,
            coupon_code: couponCode,
            final_price: finalPriceToPersist,
            auto_verified: autoVerified,
          },
          user_agent: (req.headers.get('user-agent') || '').slice(0, 500) || null,
          created_at: new Date().toISOString(),
        },
      ]),
      invalidateCachePrefix('taliyo:notifications:'),
      bumpCacheVersions('notifications'),
    ]);

    return NextResponse.json(
      { data, autoVerified, verifiedSource, adminWhatsappUrl },
      { status: 201 },
    );
  } catch (err: unknown) {
    console.error('Error creating booking:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await resolveAuthUserFromRequest(req);
    if (!auth.user) {
      return NextResponse.json(
        { error: auth.error || 'Unauthorized' },
        { status: auth.status || 401 },
      );
    }
    const authUser = auth.user;

    const body = await req.json();
    const id = String(body.id || body.bookingId || '').trim();
    const action = String(body.action || '').trim();

    if (!id || !UUID_REGEX.test(id) || (action !== 'cancel' && action !== 'pay_balance')) {
      return NextResponse.json(
        { error: 'Valid booking id and action required' },
        { status: 400 },
      );
    }

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('bookings')
      .select('id, user_id, email, customer_email, status, service_title, final_price, additional_notes, cart_items')
      .eq('id', id)
      .maybeSingle();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const matchesOwner = existing.user_id
      ? existing.user_id === authUser.id
      : Boolean(authUser.email) &&
        (String(existing.email || '').trim().toLowerCase() === authUser.email ||
          String(existing.customer_email || '').trim().toLowerCase() === authUser.email);

    if (!matchesOwner) {
      return NextResponse.json({ error: 'Not authorized to modify this order' }, { status: 403 });
    }

    if (action === 'pay_balance') {
      if (String(existing.status || '').toLowerCase() === 'cancelled') {
        return NextResponse.json({ error: 'Cannot pay balance on a cancelled order' }, { status: 400 });
      }

      let notesObj: Record<string, unknown> = {};
      try {
        notesObj = existing.additional_notes ? JSON.parse(String(existing.additional_notes)) : {};
      } catch {
        notesObj = {};
      }

      const advancePaid = Number(notesObj.advanceAmount || existing.final_price || 0);
      let orderSubtotal = Number(notesObj.orderSubtotal || 0);
      if (orderSubtotal <= 0 && existing.cart_items) {
        try {
          const rawCart =
            typeof existing.cart_items === 'string'
              ? JSON.parse(existing.cart_items)
              : existing.cart_items;
          if (Array.isArray(rawCart)) {
            const cartSum = rawCart.reduce(
              (s, item) => s + (Number(item?.price || 0) * (Number(item?.quantity || 1) || 1)),
              0,
            );
            orderSubtotal = Math.max(0, cartSum - Number(notesObj.discountAmount || 0));
          }
        } catch {}
      }
      const remainingBalance = Math.max(0, orderSubtotal - advancePaid);

      if (notesObj.balancePaid || remainingBalance <= 0) {
        return NextResponse.json({ error: 'No remaining balance due on this order.' }, { status: 400 });
      }

      const balanceMethod = String(body.payment_method || body.method || 'upi').toLowerCase();
      if (balanceMethod !== 'upi' && balanceMethod !== 'bank') {
        return NextResponse.json(
          { error: 'Only verified UPI or Bank NEFT/IMPS balance payments are supported.' },
          { status: 400 },
        );
      }

      const rawUtr = String(body.utr || body.transaction_id || '').trim();
      const check = normalizeUtr(rawUtr, balanceMethod);
      if (!check.valid) {
        return NextResponse.json(
          { error: check.reason || 'Valid transaction UTR / Reference required' },
          { status: 400 },
        );
      }
      const cleanUtr = check.clean;

      const duplicate = await findExistingBookingWithUtr(cleanUtr);
      if (duplicate) {
        return NextResponse.json(
          {
            error: `Duplicate UTR: Reference ${cleanUtr} is already used in Order #${String(duplicate.id).slice(0, 8)}`,
          },
          { status: 409 },
        );
      }

      const gatewayConfig = await loadGatewayConfig();
      let balanceAutoVerified = false;
      let balanceSource: string | null = null;

      if (gatewayConfig.autoVerifyEnabled) {
        const pool = await loadVerifiedUtrPool();
        const poolEntry = pool.find((entry) => entry.utr === cleanUtr);
        if (poolEntry) {
          const amtMatches =
            !poolEntry.amount ||
            Math.abs(Number(poolEntry.amount) - remainingBalance) <= 5;
          if (amtMatches) {
            balanceAutoVerified = true;
            balanceSource = poolEntry.source || 'Settlement Pool';
            const updatedPool = pool.map((entry) =>
              entry.utr === cleanUtr ? { ...entry, matchedBookingId: existing.id } : entry,
            );
            await saveVerifiedUtrPool(updatedPool);
          }
        }
      }

      const existingTimeline = Array.isArray(notesObj.timeline) ? [...notesObj.timeline] : [];
      existingTimeline.push({
        step: 5,
        label: balanceAutoVerified ? 'Balance Auto-Verified' : 'Balance Submitted',
        note: balanceAutoVerified
          ? `Remaining ₹${remainingBalance.toLocaleString('en-IN')} auto-verified via ${balanceSource} (Ref: ${cleanUtr})`
          : `Remaining ₹${remainingBalance.toLocaleString('en-IN')} submitted via ${balanceMethod.toUpperCase()} (Ref: ${cleanUtr})`,
        at: new Date().toISOString(),
      });

      const updatedNotes = {
        ...notesObj,
        timeline: existingTimeline,
        balancePaid: balanceAutoVerified,
        balancePendingReview: !balanceAutoVerified,
        balanceAmount: remainingBalance,
        balanceMethod,
        balanceUtr: cleanUtr,
        balanceVerifiedBy: balanceSource,
        balanceSubmittedAt: new Date().toISOString(),
      };

      const { data: updated, error: updateError } = await supabaseAdmin
        .from('bookings')
        .update({
          additional_notes: JSON.stringify(updatedNotes),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      await Promise.allSettled([
        supabaseAdmin.from('notifications').insert({
          user_id: authUser.id,
          type: 'order',
          related_type: 'booking',
          related_id: id,
          title: balanceAutoVerified ? 'Balance Payment Auto-Verified' : 'Balance Payment Submitted',
          message: balanceAutoVerified
            ? `Remaining ₹${remainingBalance.toLocaleString('en-IN')} for "${existing.service_title || 'Order'}" verified (Ref: ${cleanUtr}).`
            : `Remaining ₹${remainingBalance.toLocaleString('en-IN')} submitted (Ref: ${cleanUtr}). Admin verification in progress.`,
          is_read: false,
        }),
        sendAdminNotification(
          `Balance Payment: ${existing.service_title || '#' + id.slice(0, 6)}`,
          `Order #${id.slice(0, 8)} | Amount: ₹${remainingBalance.toLocaleString('en-IN')} | Method: ${balanceMethod.toUpperCase()} | Ref: ${cleanUtr} (${balanceAutoVerified ? 'AUTO-VERIFIED' : 'Pending Review'})`,
        ),
        invalidateCachePrefix('taliyo:notifications:'),
        bumpCacheVersions('notifications'),
      ]);

      return NextResponse.json({
        data: updated,
        balanceAutoVerified,
        verifiedSource: balanceSource,
        remainingBalance,
        success: true,
      });
    }

    if (existing.status === 'delivered' || existing.status === 'completed' || existing.status === 'cancelled') {
      return NextResponse.json(
        { error: `Cannot cancel order with status "${existing.status}"` },
        { status: 400 },
      );
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('bookings')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    await Promise.allSettled([
      supabaseAdmin.from('notifications').insert({
        user_id: authUser.id,
        type: 'order',
        related_type: 'booking',
        related_id: id,
        title: 'Order Cancelled',
        message: `Your order "${existing.service_title || '#' + id.slice(0, 6)}" has been cancelled.`,
        is_read: false,
      }),
      sendAdminNotification(
        `Order Cancelled (#${id.slice(0, 8)})`,
        `Order ${id} (${existing.service_title || 'Service'}) was cancelled by ${authUser.email || authUser.id}.`,
      ),
      invalidateCachePrefix('taliyo:notifications:'),
      bumpCacheVersions('notifications'),
    ]);

    return NextResponse.json({ data: updated, success: true });
  } catch (err: unknown) {
    console.error('Error updating booking:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
