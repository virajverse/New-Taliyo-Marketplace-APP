import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { cachedFetch } from '@/lib/redisCache';
import { enforceRateLimit } from '@/lib/rateLimit';
import { isCouponRedeemable, isPublicCouponForViewer, loadCoupons } from '@/lib/couponServer';
import { loadGatewayConfig, stripSecretConfig } from '@/lib/paymentServer';
import { resolveAuthUserFromRequest } from '@/lib/authServer';
import { sendAdminNotification } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

interface SupportAction {
  label: string;
  href: string;
}

interface SupportOrderCard {
  id: string;
  shortId: string;
  title: string;
  status: string;
  amount: number;
  paymentVerified: boolean;
  createdAt: string;
}

interface SupportServiceCard {
  id: string;
  slug?: string | null;
  title: string;
  priceMin: number;
  delivery?: string | null;
}

export interface SupportReplyPayload {
  reply: string;
  category: string;
  matched: boolean;
  escalateToWhatsApp: boolean;
  whatsappUrl: string;
  actions?: SupportAction[];
  orders?: SupportOrderCard[];
  services?: SupportServiceCard[];
  followUps?: string[];
}

interface CachedCatalogSnapshot {
  services: Array<{
    id: string;
    slug?: string | null;
    title: string;
    description?: string | null;
    price_min?: number | null;
    tags?: string[] | null;
    service_plans?: Array<{ price_min?: number | null; estimated_delivery_time?: string | null }>;
  }>;
  categories: Array<{ id: string; name: string; slug?: string | null }>;
  supportWhatsApp: string;
  supportPhone: string;
}

async function getSupportSnapshot(): Promise<CachedCatalogSnapshot> {
  const { data } = await cachedFetch<CachedCatalogSnapshot>('taliyo:support:snapshot', 120, async () => {
    const [{ data: svcs }, { data: cats }, { data: settings }] = await Promise.all([
      supabaseAdmin
        .from('services')
        .select('id, slug, title, description, price_min, service_plans(price_min, estimated_delivery_time)')
        .eq('is_active', true)
        .limit(50),
      supabaseAdmin
        .from('categories')
        .select('id, name, slug')
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
      supabaseAdmin
        .from('site_settings')
        .select('key, value')
        .in('key', ['support_whatsapp', 'support_phone']),
    ]);

    const settingsMap: Record<string, string> = {};
    (settings || []).forEach((row: { key: string; value: string }) => {
      if (row?.key) settingsMap[row.key] = row.value;
    });

    return {
      services: svcs || [],
      categories: cats || [],
      supportWhatsApp: (settingsMap.support_whatsapp || process.env.ADMIN_WHATSAPP_NUMBER || '917042523611').replace(/\D/g, ''),
      supportPhone: settingsMap.support_phone || '+917042523611',
    };
  });

  return data;
}

function buildWhatsAppTicketUrl(
  waNumber: string,
  topic: string,
  message: string,
  email?: string | null,
): string {
  const cleanPhone = (waNumber || '917042523611').replace(/\D/g, '') || '917042523611';
  const lines = [
    'Hi Taliyo Support Team,',
    `Topic: ${topic || 'General Support'}`,
    ...(email ? [`Account: ${email}`] : []),
    `Query: ${message}`,
  ];
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(lines.join('\n'))}`;
}

function includesAny(text: string, words: string[]): boolean {
  return words.some((w) => text.includes(w));
}

function formatOrderCards(rows: Array<Record<string, unknown>>): SupportOrderCard[] {
  return rows.slice(0, 3).map((row) => {
    let paymentVerified = false;
    try {
      const notes =
        typeof row.additional_notes === 'string'
          ? JSON.parse(row.additional_notes)
          : (row.additional_notes as Record<string, unknown> | null);
      paymentVerified = Boolean(notes?.paymentVerified);
    } catch {}

    return {
      id: String(row.id || ''),
      shortId: String(row.id || '').slice(0, 8).toUpperCase(),
      title: String(row.service_title || 'Service Order'),
      status: String(row.status || 'pending'),
      amount: Number(row.final_price || 0),
      paymentVerified,
      createdAt: String(row.created_at || ''),
    };
  });
}

async function lookupOrders(userId?: string | null, email?: string | null, explicitId?: string | null) {
  if (!userId && !email) return [];

  if (explicitId) {
    const { data } = await supabaseAdmin
      .from('bookings')
      .select('id, user_id, email, customer_email, service_title, status, final_price, created_at, additional_notes')
      .eq('id', explicitId)
      .limit(1);
    const owned = (data || []).filter(
      (r: Record<string, unknown>) =>
        (userId && r.user_id === userId) ||
        (email && (String(r.email || '').toLowerCase() === email.toLowerCase() || String(r.customer_email || '').toLowerCase() === email.toLowerCase())),
    );
    return formatOrdersOrEmpty(owned);
  }

  const filters: string[] = [];
  if (userId) filters.push(`user_id.eq.${userId}`);
  if (email) {
    filters.push(`email.eq.${email}`);
    filters.push(`customer_email.eq.${email}`);
  }

  const { data } = await supabaseAdmin
    .from('bookings')
    .select('id, service_title, status, final_price, created_at, additional_notes')
    .or(filters.join(','))
    .order('created_at', { ascending: false })
    .limit(3);

  return formatOrdersOrEmpty(data);
}

function formatOrdersOrEmpty(data: Array<Record<string, unknown>> | null): SupportOrderCard[] {
  if (!data || data.length === 0) return [];
  return formatOrderCards(data);
}

function findMatchingServices(
  snapshot: CachedCatalogSnapshot,
  query: string,
): SupportServiceCard[] {
  const tokens = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !['how', 'much', 'what', 'cost', 'price', 'for', 'the', 'hai', 'kya', 'chahiye', 'need', 'want', 'build'].includes(t));

  if (tokens.length === 0) {
    return snapshot.services.slice(0, 3).map((s) => ({
      id: s.id,
      slug: s.slug,
      title: s.title,
      priceMin: Number(s.service_plans?.[0]?.price_min ?? s.price_min ?? 0),
      delivery: s.service_plans?.[0]?.estimated_delivery_time || null,
    }));
  }

  const scored = snapshot.services
    .map((s) => {
      const hay = `${s.title} ${s.description || ''}`.toLowerCase();
      let score = 0;
      for (const tok of tokens) {
        if (s.title.toLowerCase().includes(tok)) score += 3;
        else if (hay.includes(tok)) score += 1;
      }
      return { service: s, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return scored.map(({ service: s }) => ({
    id: s.id,
    slug: s.slug,
    title: s.title,
    priceMin: Number(s.service_plans?.[0]?.price_min ?? s.price_min ?? 0),
    delivery: s.service_plans?.[0]?.estimated_delivery_time || null,
  }));
}

async function buildSupportReply(params: {
  message: string;
  topic: string;
  userId: string | null;
  email: string | null;
  snapshot: CachedCatalogSnapshot;
  whatsappUrl: string;
}): Promise<SupportReplyPayload> {
  const { message, userId, email, snapshot, whatsappUrl } = params;
  const lower = message.toLowerCase();

  // 1. Direct Human / WhatsApp / Escalation / Technical Bug / Urgent
  if (
    includesAny(lower, [
      'whatsapp',
      'human',
      'agent',
      'team',
      'call me',
      'phone call',
      'talk to',
      'baat karni',
      'insaan',
      'urgent',
      'bug',
      'error',
      'crash',
      'not working',
      'kaam nahi',
      'issue aa raha',
      'complaint',
    ])
  ) {
    return {
      category: 'Direct Escalation',
      matched: false,
      escalateToWhatsApp: true,
      whatsappUrl,
      reply:
        'This looks best handled directly by our support team. Tap "Continue on WhatsApp" below — your topic and question are already pre-filled so you get fast human help!',
      actions: [{ label: 'Open Help & FAQ', href: '/help' }],
      followUps: ['Track my latest order', 'Show active coupons', 'UPI payment steps'],
    };
  }

  // 2. Greetings / Capabilities
  if (
    /^(hi|hello|hey|hii|namaste|helo|good morning|good evening|help|start)\b/i.test(lower) &&
    lower.split(/\s+/).length <= 4
  ) {
    return {
      category: 'Welcome',
      matched: true,
      escalateToWhatsApp: false,
      whatsappUrl,
      reply:
        'Hi! Welcome to Taliyo Support. I can help you check live Order Status, active Coupons, UPI/UTR payment verification, Service pricing, or connect you directly on WhatsApp.',
      followUps: [
        'Track my latest order',
        'Show active coupons',
        'How does UPI & advance payment work?',
        'Website / App pricing',
      ],
    };
  }

  // 3. Refunds, Cancellations & Revisions
  if (includesAny(lower, ['refund', 'cancel', 'money back', 'wapas', 'dispute', 'revision', 'change'])) {
    return {
      category: 'Refunds & Revisions',
      matched: true,
      escalateToWhatsApp: true,
      whatsappUrl,
      reply:
        'We follow a 100% milestone-based guarantee: if an agreed milestone fails specifications, you can request revisions or a refund review. For immediate refund/revision review on an active booking, tap WhatsApp below so our team resolves it directly.',
      actions: [
        { label: 'My Orders', href: '/orders' },
        { label: 'Refund Policy FAQ', href: '/help' },
      ],
      followUps: ['Track my latest order', 'How does UPI & advance payment work?'],
    };
  }

  // 4. Order Status / Tracking / Delivery
  const uuidMatch = message.match(UUID_REGEX);
  if (
    uuidMatch ||
    includesAny(lower, ['order', 'booking', 'track', 'status', 'milestone', 'delivery', 'kaha', 'kab tak', 'eta'])
  ) {
    const orders = await lookupOrders(userId, email, uuidMatch?.[0] || null);

    if (orders.length > 0) {
      const latest = orders[0];
      return {
        category: 'Order Tracking',
        matched: true,
        escalateToWhatsApp: false,
        whatsappUrl,
        reply: `Here is your live order summary — latest order #${latest.shortId} (${latest.title}) is currently "${latest.status.toUpperCase()}"${latest.paymentVerified ? ' with verified payment' : ''}. Tap any order or open Orders to view milestones.`,
        orders,
        actions: [{ label: 'Open My Orders', href: '/orders' }],
        followUps: ['Request revision / update on WhatsApp', 'How does milestone delivery work?'],
      };
    }

    return {
      category: 'Order Tracking',
      matched: true,
      escalateToWhatsApp: true,
      whatsappUrl,
      reply: userId || email
        ? 'No active bookings were found under this account yet. If you booked with another email/phone or want live status, share your Order ID directly on WhatsApp below.'
        : 'Sign in or track live order milestones on the Orders page. Want our team to check an order right now? Tap WhatsApp below!',
      actions: [{ label: 'Go to Orders', href: '/orders' }],
      followUps: ['Show active coupons', 'Browse Services'],
    };
  }

  // 5. Coupons & Offers
  if (includesAny(lower, ['coupon', 'promo', 'discount', 'offer', 'code', 'voucher', 'sasta'])) {
    const allCoupons = await loadCoupons();
    const active = allCoupons.filter((c) => isCouponRedeemable(c).ok && isPublicCouponForViewer(c, email));
    const summary =
      active.length > 0
        ? active
            .slice(0, 4)
            .map((c) => {
              const label =
                c.discount_type === 'percentage'
                  ? `${c.discount_value}% OFF`
                  : `₹${Number(c.discount_value || 0).toLocaleString('en-IN')} OFF`;
              const min = Number(c.min_order_amount || 0);
              return `• ${String(c.code || '').toUpperCase()} — ${label}${min > 0 ? ` (Min order ₹${min.toLocaleString('en-IN')})` : ''}`;
            })
            .join('\n')
        : 'No active public promo codes right now. Message us on WhatsApp for custom bundle or startup pricing!';

    return {
      category: 'Coupons & Discounts',
      matched: true,
      escalateToWhatsApp: active.length === 0,
      whatsappUrl,
      reply:
        active.length > 0
          ? `Currently active coupons you can apply at checkout:\n${summary}`
          : summary,
      actions: [
        { label: 'Explore Services', href: '/categories' },
        { label: 'Go to Checkout', href: '/checkout' },
      ],
      followUps: ['How does UPI & advance payment work?', 'Website / App pricing'],
    };
  }

  // 6. Payment, UPI, UTR Verification
  if (includesAny(lower, ['pay', 'payment', 'upi', 'utr', 'qr', 'gpay', 'phonepe', 'paytm', 'bank', 'card', 'razorpay', 'advance', 'verify', 'transaction'])) {
    const { data: gateway } = await cachedFetch('taliyo:payment-settings', 120, async () => {
      const cfg = await loadGatewayConfig();
      return stripSecretConfig(cfg);
    });

    const isFailure = includesAny(lower, ['fail', 'stuck', 'pending', 'not verified', 'deduct', 'cut', 'double']);
    const advancePct = gateway?.advancePercent ?? 30;
    const upiId = gateway?.displayId || gateway?.upiId || 'Configured UPI';

    return {
      category: 'Payment & Billing',
      matched: true,
      escalateToWhatsApp: isFailure,
      whatsappUrl,
      reply: isFailure
        ? `If your payment was deducted or your UTR verification is still pending, please tap "Continue on WhatsApp" below and share your 12-digit UTR screenshot — our billing team verifies it manually right away.`
        : `We accept UPI (${upiId})${gateway?.allowCardFallback ? ' and Cards/NetBanking' : ''}. Standard bookings start with a ${advancePct}% advance; submit your 12-digit UTR number at checkout for instant/priority verification.`,
      actions: [{ label: 'Go to Checkout', href: '/checkout' }],
      followUps: ['Payment stuck / UTR not verified', 'Show active coupons', 'Refund policy'],
    };
  }

  // 7. Services & Pricing Search (Live from Cached Supabase Catalog)
  if (includesAny(lower, ['price', 'cost', 'rate', 'kitna', 'budget', 'plan', 'website', 'app', 'crm', 'erp', 'saas', 'ecommerce', 'automation', 'chatbot', 'ai', 'design', 'seo', 'custom', 'service', 'build'])) {
    const matchedServices = findMatchingServices(snapshot, message);
    const isCustom = includesAny(lower, ['custom', 'quote', 'enterprise', 'tailor']);

    if (matchedServices.length > 0 && !isCustom) {
      const listText = matchedServices
        .map(
          (s) =>
            `• ${s.title} — Starting ₹${s.priceMin.toLocaleString('en-IN')}${s.delivery ? ` (${s.delivery})` : ''}`,
        )
        .join('\n');

      return {
        category: 'Services & Pricing',
        matched: true,
        escalateToWhatsApp: false,
        whatsappUrl,
        reply: `Here are matching live services from our catalog:\n${listText}\n\nTap a service below to inspect full plans & deliverables, or chat on WhatsApp for custom requirements.`,
        services: matchedServices,
        actions: [{ label: 'Browse All Categories', href: '/categories' }],
        followUps: ['Need a custom quote on WhatsApp', 'Show active coupons'],
      };
    }
  }

  // 8. Account, Profile, Wishlist & Privacy
  if (includesAny(lower, ['account', 'profile', 'login', 'sign', 'password', 'email', 'phone', 'wishlist', 'privacy', 'source code', 'ip'])) {
    return {
      category: 'Account & Policies',
      matched: true,
      escalateToWhatsApp: false,
      whatsappUrl,
      reply:
        'You can update your name, contact phone, password, and notification preferences in Profile & Settings. 100% source code & IP rights transfer to you upon final project delivery (see Privacy & IP Policy).',
      actions: [
        { label: 'My Profile', href: '/profile' },
        { label: 'App Settings', href: '/settings' },
        { label: 'Privacy & IP', href: '/privacy' },
      ],
      followUps: ['Track my latest order', 'Show active coupons'],
    };
  }

  // 9. Smart Fallback -> Direct WhatsApp Hand-off with Context!
  return {
    category: 'WhatsApp Team Hand-off',
    matched: false,
    escalateToWhatsApp: true,
    whatsappUrl,
    reply:
      'I want to make sure you get the exact right answer! For custom or detailed questions like this, please tap "Continue on WhatsApp" below — your question is already pre-filled for our team.',
    actions: [
      { label: 'Browse Services', href: '/categories' },
      { label: 'Help & FAQ', href: '/help' },
    ],
    followUps: ['Track my latest order', 'Show active coupons', 'How does UPI & advance payment work?'],
  };
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'advisor');
  if (limited) return limited;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      message?: string;
      topic?: string;
      conversationId?: string | null;
      deviceId?: string | null;
    };

    const message = String(body.message || '').trim();
    const topic = String(body.topic || 'General Support').trim();
    let conversationId = body.conversationId ? String(body.conversationId).trim() : null;
    const deviceId = String(body.deviceId || 'web-support').slice(0, 128);

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // Resolve authenticated user strictly from Bearer token so order lookup cannot be spoofed
    let userId: string | null = null;
    let email: string | null = null;
    if ((req.headers.get('authorization') || '').startsWith('Bearer ')) {
      const auth = await resolveAuthUserFromRequest(req);
      if (auth.user) {
        userId = auth.user.id;
        email = auth.user.email;
      }
    }

    const snapshot = await getSupportSnapshot();
    const whatsappUrl = buildWhatsAppTicketUrl(snapshot.supportWhatsApp, topic, message, email);

    const payload = await buildSupportReply({
      message,
      topic,
      userId,
      email,
      snapshot,
      whatsappUrl,
    });

    // Persist support chat log in ai_conversations & ai_messages + notify admin on escalations (ported from Old App)
    try {
      const now = new Date().toISOString();
      if (!conversationId || !UUID_REGEX.test(conversationId)) {
        const { data: conv } = await supabaseAdmin
          .from('ai_conversations')
          .insert([{ user_id: userId, device_id: deviceId, status: 'support', last_message_at: now }])
          .select('id')
          .single();
        if (conv?.id) conversationId = String(conv.id);
      } else {
        await supabaseAdmin
          .from('ai_conversations')
          .update({ last_message_at: now, updated_at: now })
          .eq('id', conversationId);
      }

      if (conversationId) {
        await supabaseAdmin.from('ai_messages').insert([
          { conversation_id: conversationId, sender_type: 'user', content: `[${topic}] ${message}` },
          { conversation_id: conversationId, sender_type: 'ai', content: payload.reply },
        ]);
      }

      if (payload.escalateToWhatsApp) {
        void sendAdminNotification(
          `Support Escalation: ${topic}`,
          `Customer (${email || userId || 'Guest'}): ${message.slice(0, 300)}`,
        );
      }
    } catch (logErr) {
      console.warn('Support DB/admin log notice:', logErr);
    }

    return NextResponse.json({ ...payload, conversationId });
  } catch (err) {
    console.error('Support API error:', err);
    return NextResponse.json({ error: 'Unable to process support request' }, { status: 500 });
  }
}
