import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { resolveAuthUserFromRequest } from '@/lib/authServer';
import { enforceRateLimit } from '@/lib/rateLimit';
import { sendAdminNotification } from '@/lib/notifications';
import { bumpCacheVersions, invalidateCachePrefix } from '@/lib/redisCache';

export const dynamic = 'force-dynamic';

const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const VALID_REASONS = new Set([
  'service_not_started',
  'milestone_mismatch',
  'quality_issue',
  'duplicate_payment',
  'cancelled_paid_order',
  'other',
]);

export interface RefundRequestRecord {
  id: string;
  status: 'requested' | 'under_review' | 'approved' | 'refunded' | 'rejected' | 'withdrawn';
  requestedAmount: number;
  reason: string;
  details: string;
  payoutMethod: 'upi' | 'bank';
  payoutDestination: string;
  refundUtr?: string | null;
  adminNote?: string | null;
  requestedAt: string;
  updatedAt: string;
}

function parseNotes(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  try {
    return typeof raw === 'string'
      ? (JSON.parse(raw) as Record<string, unknown>)
      : (raw as Record<string, unknown>);
  } catch {
    return {};
  }
}

function computeVerifiedPaidAmount(
  booking: { final_price?: number | null; status?: string | null },
  notesObj: Record<string, unknown>,
): number {
  const initialVerified = Boolean(notesObj.paymentVerified);
  let total = 0;

  if (initialVerified) {
    const initialAmt = Number(notesObj.advanceAmount || booking.final_price || 0);
    if (initialAmt > 0) total += initialAmt;
  }

  if (Boolean(notesObj.balancePaid) && Number(notesObj.balanceAmount || 0) > 0) {
    total += Number(notesObj.balanceAmount || 0);
  }

  return Math.max(0, Math.round(total));
}

function isBookingOwner(
  booking: { user_id?: string | null; email?: string | null; customer_email?: string | null },
  authUser: { id: string; email?: string | null },
): boolean {
  if (booking.user_id) return booking.user_id === authUser.id;
  const email = (authUser.email || '').trim().toLowerCase();
  if (!email) return false;
  return (
    String(booking.email || '').trim().toLowerCase() === email ||
    String(booking.customer_email || '').trim().toLowerCase() === email
  );
}

export async function GET(req: NextRequest) {
  try {
    const auth = await resolveAuthUserFromRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: auth.status || 401 });
    }

    const bookingId = new URL(req.url).searchParams.get('bookingId')?.trim() || '';
    if (!bookingId || !UUID_REGEX.test(bookingId)) {
      return NextResponse.json({ error: 'Valid bookingId required' }, { status: 400 });
    }

    const { data: booking, error } = await supabaseAdmin
      .from('bookings')
      .select('id, user_id, email, customer_email, status, final_price, additional_notes')
      .eq('id', bookingId)
      .maybeSingle();

    if (error || !booking) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (!isBookingOwner(booking, auth.user)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const notesObj = parseNotes(booking.additional_notes);
    const verifiedPaidAmount = computeVerifiedPaidAmount(booking, notesObj);
    const refundRequest = (notesObj.refundRequest as RefundRequestRecord | undefined) || null;

    let eligible = verifiedPaidAmount > 0;
    let reasonIfIneligible: string | null = null;
    if (!eligible) {
      reasonIfIneligible =
        'No verified payment settlement is recorded on this order yet. Unverified pending orders can be cancelled with ₹0 charge.';
    } else if (
      refundRequest &&
      ['requested', 'under_review', 'approved', 'refunded'].includes(refundRequest.status)
    ) {
      eligible = false;
      reasonIfIneligible = `Refund status is already "${refundRequest.status}".`;
    }

    return NextResponse.json({
      eligible,
      verifiedPaidAmount,
      reasonIfIneligible,
      refundRequest,
      bookingStatus: booking.status,
    });
  } catch (err) {
    console.error('Refund GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'bookings');
  if (limited) return limited;

  try {
    const auth = await resolveAuthUserFromRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: auth.status || 401 });
    }
    const authUser = auth.user;

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const bookingId = String(body.bookingId || body.id || '').trim();
    const reason = String(body.reason || '').trim();
    const details = String(body.details || '').trim().slice(0, 1000);
    const payoutMethod = String(body.payoutMethod || 'upi').toLowerCase();

    if (!bookingId || !UUID_REGEX.test(bookingId)) {
      return NextResponse.json({ error: 'Valid bookingId required' }, { status: 400 });
    }
    if (!VALID_REASONS.has(reason)) {
      return NextResponse.json({ error: 'Please select a valid return/refund reason' }, { status: 400 });
    }
    if (details.length < 10) {
      return NextResponse.json(
        { error: 'Please describe the return/refund reason in at least 10 characters.' },
        { status: 400 },
      );
    }

    let payoutDestination = '';
    if (payoutMethod === 'upi') {
      const upiId = String(body.upiId || '').trim();
      if (!/^[\w.-]{2,64}@[a-zA-Z0-9]{2,32}$/.test(upiId)) {
        return NextResponse.json(
          { error: 'Please enter a valid UPI ID (e.g. name@okaxis) for receiving the refund.' },
          { status: 400 },
        );
      }
      payoutDestination = upiId;
    } else if (payoutMethod === 'bank') {
      const holder = String(body.accountHolder || '').trim();
      const acc = String(body.accountNumber || '').replace(/\s+/g, '');
      const ifsc = String(body.ifsc || '').trim().toUpperCase();
      if (!holder || !/^\d{6,24}$/.test(acc) || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
        return NextResponse.json(
          { error: 'Valid Account Holder name, 6-24 digit Account Number, and 11-char IFSC are required.' },
          { status: 400 },
        );
      }
      payoutDestination = `${holder} • A/C ${acc} • IFSC ${ifsc}`;
    } else {
      return NextResponse.json({ error: 'Supported payout methods: upi or bank' }, { status: 400 });
    }

    const { data: booking, error } = await supabaseAdmin
      .from('bookings')
      .select('id, user_id, email, customer_email, service_id, service_title, status, final_price, additional_notes')
      .eq('id', bookingId)
      .maybeSingle();

    if (error || !booking) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    if (!isBookingOwner(booking, authUser)) {
      return NextResponse.json({ error: 'Not authorized for this order' }, { status: 403 });
    }

    const notesObj = parseNotes(booking.additional_notes);
    const existingRefund = notesObj.refundRequest as RefundRequestRecord | undefined;
    if (
      existingRefund &&
      ['requested', 'under_review', 'approved', 'refunded'].includes(existingRefund.status)
    ) {
      return NextResponse.json(
        { error: `A refund request (${existingRefund.id}) is already ${existingRefund.status}.` },
        { status: 409 },
      );
    }

    const verifiedPaidAmount = computeVerifiedPaidAmount(booking, notesObj);
    if (verifiedPaidAmount <= 0) {
      return NextResponse.json(
        {
          error:
            'No verified payment settlement exists for this order. Pending unverified orders can simply be cancelled with ₹0 deduction.',
        },
        { status: 400 },
      );
    }

    const nowIso = new Date().toISOString();
    const refundRecord: RefundRequestRecord = {
      id: `RFD-${Date.now().toString().slice(-6)}`,
      status: 'requested',
      requestedAmount: verifiedPaidAmount,
      reason,
      details,
      payoutMethod: payoutMethod as 'upi' | 'bank',
      payoutDestination,
      requestedAt: nowIso,
      updatedAt: nowIso,
    };

    const existingTimeline = Array.isArray(notesObj.timeline) ? [...notesObj.timeline] : [];
    existingTimeline.push({
      step: 6,
      label: 'Return / Refund Requested',
      note: `${refundRecord.id} for ₹${verifiedPaidAmount.toLocaleString('en-IN')} via ${payoutMethod.toUpperCase()} (${reason})`,
      at: nowIso,
    });

    const updatedNotes = {
      ...notesObj,
      timeline: existingTimeline,
      refundRequest: refundRecord,
    };

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('bookings')
      .update({
        additional_notes: JSON.stringify(updatedNotes),
        updated_at: nowIso,
      })
      .eq('id', bookingId)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    await Promise.allSettled([
      supabaseAdmin.from('notifications').insert({
        user_id: authUser.id,
        type: 'order',
        related_type: 'booking',
        related_id: bookingId,
        title: `Return / Refund Requested (${refundRecord.id})`,
        message: `Refund request for ₹${verifiedPaidAmount.toLocaleString('en-IN')} on "${booking.service_title || 'Order'}" submitted to ${payoutDestination}.`,
        is_read: false,
      }),
      sendAdminNotification(
        `Refund Request: ${refundRecord.id}`,
        `Order #${bookingId.slice(0, 8)} (${booking.service_title || 'Order'}) | Verified Paid: ₹${verifiedPaidAmount.toLocaleString('en-IN')} | Reason: ${reason} | Dest: ${payoutDestination}`,
      ),
      supabaseAdmin.from('analytics').insert([
        {
          service_id: booking.service_id || null,
          event_type: 'refund_requested',
          event_data: {
            booking_id: bookingId,
            refund_id: refundRecord.id,
            amount: verifiedPaidAmount,
            reason,
          },
          user_agent: (req.headers.get('user-agent') || '').slice(0, 500) || null,
          created_at: nowIso,
        },
      ]),
      invalidateCachePrefix('taliyo:notifications:'),
      bumpCacheVersions('notifications'),
    ]);

    return NextResponse.json({ data: updated, refundRequest: refundRecord, success: true }, { status: 201 });
  } catch (err) {
    console.error('Refund POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await resolveAuthUserFromRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: auth.status || 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const bookingId = String(body.bookingId || body.id || '').trim();
    const action = String(body.action || '').trim();

    if (!bookingId || !UUID_REGEX.test(bookingId) || action !== 'withdraw') {
      return NextResponse.json({ error: 'Valid bookingId and withdraw action required' }, { status: 400 });
    }

    const { data: booking } = await supabaseAdmin
      .from('bookings')
      .select('id, user_id, email, customer_email, service_title, additional_notes')
      .eq('id', bookingId)
      .maybeSingle();

    if (!booking) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    if (!isBookingOwner(booking, auth.user)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const notesObj = parseNotes(booking.additional_notes);
    const existingRefund = notesObj.refundRequest as RefundRequestRecord | undefined;
    if (!existingRefund || existingRefund.status !== 'requested') {
      return NextResponse.json(
        { error: 'Only pending refund requests can be withdrawn.' },
        { status: 400 },
      );
    }

    const nowIso = new Date().toISOString();
    const withdrawn: RefundRequestRecord = {
      ...existingRefund,
      status: 'withdrawn',
      updatedAt: nowIso,
    };

    const existingTimeline = Array.isArray(notesObj.timeline) ? [...notesObj.timeline] : [];
    existingTimeline.push({
      step: 6,
      label: 'Refund Request Withdrawn',
      note: `${existingRefund.id} withdrawn by customer`,
      at: nowIso,
    });

    const { error: updateErr } = await supabaseAdmin
      .from('bookings')
      .update({
        additional_notes: JSON.stringify({
          ...notesObj,
          timeline: existingTimeline,
          refundRequest: withdrawn,
        }),
        updated_at: nowIso,
      })
      .eq('id', bookingId);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ refundRequest: withdrawn, success: true });
  } catch (err) {
    console.error('Refund PATCH error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
