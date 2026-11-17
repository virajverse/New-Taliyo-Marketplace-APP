'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import {
  ArrowLeft,
  Calendar,
  Clock,
  CheckCircle2,
  Circle,
  MessageCircle,
  MessageSquare,
  QrCode,
  Building2,
  Smartphone,
  Copy,
  Check,
  Loader2,
  ShieldCheck,
  Star,
  Download,
  RotateCcw,
  RefreshCw,
  X,
} from 'lucide-react';
import BottomNav from '@/components/BottomNav';
import { subscribeSmartFetch } from '@/lib/clientCache';
import { getAuthHeaders } from '@/lib/supabaseClient';
import { PAYMENT_CONFIG, generateUpiUri, triggerHapticFeedback } from '@/lib/paymentConfig';

interface Milestone {
  id: number;
  title: string;
  description: string;
  status: 'completed' | 'in-progress' | 'pending';
  dateLabel?: string;
}

interface BookingInfo {
  id: string;
  orderNumber: string;
  title: string;
  planName: string;
  provider: string;
  startedDate: string;
  targetDate: string;
  status: string;
  imageSrc?: string;
  paymentMethod?: string;
  utr?: string | null;
  paymentVerified?: boolean;
  advanceAmount?: number;
  orderSubtotal?: number;
  remainingBalance?: number;
  balancePaid?: boolean;
  balancePendingReview?: boolean;
  balanceUtr?: string | null;
  files?: Array<{ name: string; url?: string; path?: string }>;
  refundRequest?: {
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
  } | null;
  verifiedPaidAmount?: number;
}

export default function OrderMilestoneTrackerPage() {
  const router = useRouter();
  const params = useParams();
  const rawId = (params?.id as string) || '';

  const [isLoading, setIsLoading] = useState(true);
  const [isNotFound, setIsNotFound] = useState(false);
  const [bookingInfo, setBookingInfo] = useState<BookingInfo>({
    id: rawId,
    orderNumber: rawId ? `#TLY${rawId.slice(0, 6).toUpperCase()}` : '#TLY',
    title: 'Service Order',
    planName: 'Custom Plan',
    provider: 'Taliyo Technologies',
    startedDate: '—',
    targetDate: 'Standard Timeline',
    status: 'pending',
  });

  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [supportWhatsApp, setSupportWhatsApp] = useState('917042523611');
  const [gateway, setGateway] = useState({
    upiId: PAYMENT_CONFIG.upi.id,
    displayId: PAYMENT_CONFIG.upi.displayId,
    payeeName: PAYMENT_CONFIG.upi.payeeName,
    merchantType: PAYMENT_CONFIG.upi.merchantType,
    bankName: PAYMENT_CONFIG.bank.bankName,
    accountName: PAYMENT_CONFIG.bank.accountName,
    accountNumber: PAYMENT_CONFIG.bank.accountNumber,
    ifsc: PAYMENT_CONFIG.bank.ifsc,
  });
  const [balanceMethod, setBalanceMethod] = useState<'upi' | 'bank'>('upi');
  const [balanceUtrInput, setBalanceUtrInput] = useState('');
  const [balanceQrUrl, setBalanceQrUrl] = useState('');
  const [balanceCheck, setBalanceCheck] = useState<{
    valid?: boolean;
    duplicate?: boolean;
    poolMatched?: boolean;
    message?: string;
  } | null>(null);
  const [isCheckingBalanceUtr, setIsCheckingBalanceUtr] = useState(false);
  const [isSubmittingBalance, setIsSubmittingBalance] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [balanceSuccess, setBalanceSuccess] = useState<string | null>(null);
  const [copiedBalanceField, setCopiedBalanceField] = useState<string | null>(null);
  const [isCheckingVerification, setIsCheckingVerification] = useState(false);

  // Return & Refund UI State
  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);
  const [refundReason, setRefundReason] = useState('service_not_started');
  const [refundDetails, setRefundDetails] = useState('');
  const [refundPayoutMethod, setRefundPayoutMethod] = useState<'upi' | 'bank'>('upi');
  const [refundUpiId, setRefundUpiId] = useState('');
  const [refundHolder, setRefundHolder] = useState('');
  const [refundAcc, setRefundAcc] = useState('');
  const [refundIfsc, setRefundIfsc] = useState('');
  const [isSubmittingRefund, setIsSubmittingRefund] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);
  const [refundSuccessMsg, setRefundSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/payment-settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (json?.data) setGateway((prev) => ({ ...prev, ...json.data }));
      })
      .catch(() => {});

    return subscribeSmartFetch<{ settings?: Record<string, string> }>(
      '/api/site-settings',
      'settings',
      (json) => {
        const num = json?.settings?.support_whatsapp;
        if (typeof num === 'string' && num.trim()) {
          setSupportWhatsApp(num.replace(/\D/g, '') || '917042523611');
        }
      },
    );
  }, []);

  useEffect(() => {
    async function loadRealOrder() {
      setIsLoading(true);
      try {
        if (!rawId) return;

        // Fetch booking from API (backed by authenticated owner check + supabaseAdmin)
        const authHeaders = await getAuthHeaders();
        const res = await fetch(`/api/bookings?id=${encodeURIComponent(rawId)}`, {
          cache: 'no-store',
          headers: authHeaders,
        });
        const json = await res.json();
        const booking = json.data && json.data.length > 0 ? json.data[0] : null;

        if (booking) {
          const started = booking.created_at
            ? new Date(booking.created_at).toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })
            : 'Recent';

          const cleanPrice = booking.service_price
            ? booking.service_price.toString().startsWith('₹')
              ? booking.service_price
              : `₹${Number(booking.service_price).toLocaleString('en-IN')}`
            : 'Verified Custom Plan';

          const isCancelledOrder = String(booking.status || '').toLowerCase() === 'cancelled';

          let parsedNotes: Record<string, unknown> = {};
          try {
            parsedNotes = booking.additional_notes ? JSON.parse(String(booking.additional_notes)) : {};
          } catch {
            parsedNotes = {};
          }

          let rawCartArr: Array<Record<string, unknown>> = [];
          try {
            const rawCart = typeof booking.cart_items === 'string' ? JSON.parse(booking.cart_items) : booking.cart_items;
            if (Array.isArray(rawCart)) rawCartArr = rawCart;
          } catch {}

          let realImage: string | undefined = undefined;
          if (rawCartArr.length > 0) {
            const itemImg =
              rawCartArr[0]?.imageSrc ||
              rawCartArr[0]?.images ||
              (Array.isArray(rawCartArr[0]?.images) ? rawCartArr[0].images[0] : null);
            if (itemImg && typeof itemImg === 'string') {
              realImage = itemImg;
            }
          }

          let deliveryDays: number | null =
            typeof parsedNotes.deliveryDays === 'number' ? parsedNotes.deliveryDays : null;
          if (deliveryDays === null && rawCartArr.length > 0) {
            const daysList = rawCartArr
              .map((c) => {
                if (typeof c?.deliveryDays === 'number') return c.deliveryDays;
                if (String(c?.packageName || '').toLowerCase().includes('source code')) return 0;
                return null;
              })
              .filter((v): v is number => v !== null);
            if (daysList.length > 0) deliveryDays = Math.max(...daysList);
          }
          const targetLabel = isCancelledOrder
            ? 'Cancelled'
            : deliveryDays === 0
              ? 'Instant Digital'
              : deliveryDays !== null
                ? `${deliveryDays} Days`
                : '10–14 Days';

          const advanceAmt = Number(parsedNotes.advanceAmount || 0);
          let orderSubtotal = Number(parsedNotes.orderSubtotal || 0);
          if (orderSubtotal <= 0 && rawCartArr.length > 0) {
            const cartSum = rawCartArr.reduce(
              (s, item) => s + Number(item?.price || 0) * (Number(item?.quantity || 1) || 1),
              0,
            );
            orderSubtotal = Math.max(0, cartSum - Number(parsedNotes.discountAmount || 0));
          }
          const remainingBalance =
            !isCancelledOrder && advanceAmt > 0 && orderSubtotal > advanceAmt && !parsedNotes.balancePaid
              ? Math.max(0, orderSubtotal - advanceAmt)
              : 0;

          const bookingFiles = Array.isArray(booking.files)
            ? (booking.files as Array<{ name?: string; url?: string; path?: string }>)
                .filter((f) => f && (f.url || f.path))
                .map((f, idx) => ({
                  name: f.name || f.path || `Deliverable ${idx + 1}`,
                  url: f.url,
                  path: f.path,
                }))
            : [];

          const verifiedInitialAmt = Boolean(parsedNotes.paymentVerified)
            ? Number(parsedNotes.advanceAmount || booking.final_price || 0)
            : 0;
          const verifiedBalanceAmt = Boolean(parsedNotes.balancePaid)
            ? Number(parsedNotes.balanceAmount || 0)
            : 0;
          const verifiedPaidAmount = Math.max(0, Math.round(verifiedInitialAmt + verifiedBalanceAmt));

          setBookingInfo({
            id: booking.id,
            orderNumber: `#TLY${booking.id.slice(0, 6).toUpperCase()}`,
            title: booking.service_title || 'Service Order',
            planName: cleanPrice,
            provider: booking.provider_name || 'Taliyo Technologies',
            startedDate: started,
            targetDate: targetLabel,
            status: booking.status || 'pending',
            imageSrc: realImage,
            paymentMethod: String(parsedNotes.paymentMethod || ''),
            utr: (parsedNotes.utr as string) || null,
            paymentVerified: Boolean(parsedNotes.paymentVerified),
            advanceAmount: advanceAmt,
            orderSubtotal,
            remainingBalance,
            balancePaid: Boolean(parsedNotes.balancePaid),
            balancePendingReview: Boolean(parsedNotes.balancePendingReview),
            balanceUtr: (parsedNotes.balanceUtr as string) || null,
            files: bookingFiles,
            refundRequest: (parsedNotes.refundRequest as BookingInfo['refundRequest']) || null,
            verifiedPaidAmount,
          });

          // Fetch progress steps from Redis-cached catalog API
          const stepsRes = await fetch('/api/catalog?mode=milestones');
          const stepsJson = stepsRes.ok ? await stepsRes.json() : { data: [] };
          const steps = (Array.isArray(stepsJson.data) ? stepsJson.data : []) as Array<{
            label?: string;
            step_key?: string;
          }>;

          const stageDescriptions = [
            'Order scope, requirements, and payment details verified by the project team.',
            'System architecture, database schema, and UI/UX wireframes prepared.',
            'Core modules, frontend interface, and backend APIs built in sprint.',
            'End-to-end quality assurance, device testing, and security checks completed.',
            'Live cloud deployment and 100% source code repository handover.',
          ];

          if (steps && steps.length > 0) {
            const rawStatus = String(booking.status || 'pending').toLowerCase();
            const mappedSteps: Milestone[] = steps.map((s, idx) => {
              let st: Milestone['status'] = 'pending';
              let dateLabel = 'Upcoming';

              if (rawStatus === 'delivered' || rawStatus === 'completed') {
                st = 'completed';
                dateLabel = 'Completed';
              } else if (rawStatus === 'cancelled') {
                st = 'pending';
                dateLabel = 'Cancelled';
              } else if (rawStatus === 'work_started' || rawStatus === 'in_progress') {
                if (idx < 3) {
                  st = 'completed';
                  dateLabel = 'Completed';
                } else if (idx === 3) {
                  st = 'in-progress';
                  dateLabel = 'Current Sprint';
                }
              } else if (rawStatus === 'confirmed') {
                if (idx === 0) {
                  st = 'completed';
                  dateLabel = 'Completed';
                } else if (idx === 1) {
                  st = 'in-progress';
                  dateLabel = 'Current Sprint';
                }
              } else {
                // Pending review / payment verification
                if (idx === 0) {
                  st = 'in-progress';
                  dateLabel = 'Awaiting Verification';
                }
              }

              return {
                id: idx + 1,
                title: s.label || (s.step_key || 'milestone').replace('_', ' ').toUpperCase(),
                description: stageDescriptions[idx] || `Project milestone delivery stage: ${s.label}`,
                status: st,
                dateLabel,
              };
            });
            setMilestones(mappedSteps);
          }
        } else {
          setIsNotFound(true);
        }
      } catch (err) {
        console.error('Failed to load real booking:', err);
        setIsNotFound(true);
      } finally {
        setIsLoading(false);
      }
    }

    loadRealOrder();
  }, [rawId]);

  const completedCount = milestones.filter((m) => m.status === 'completed').length;
  const progressPercentage = milestones.length > 0 ? Math.round((completedCount / milestones.length) * 100) : 0;

  const balanceAmount = Number(bookingInfo.remainingBalance || 0);
  const showBalanceBox =
    balanceAmount > 0 &&
    !bookingInfo.balancePaid &&
    !bookingInfo.balancePendingReview &&
    bookingInfo.status.toLowerCase() !== 'cancelled';

  const balanceUpiUri = useMemo(() => {
    if (!showBalanceBox || !gateway.upiId || balanceAmount <= 0) return '';
    return generateUpiUri({
      upiId: gateway.upiId,
      payeeName: gateway.payeeName,
      amount: balanceAmount,
      orderRef: `${bookingInfo.orderNumber}-BAL`,
      note: `Balance ${bookingInfo.title}`,
    });
  }, [showBalanceBox, gateway.upiId, gateway.payeeName, balanceAmount, bookingInfo.orderNumber, bookingInfo.title]);

  useEffect(() => {
    if (!balanceUpiUri) {
      setBalanceQrUrl('');
      return;
    }
    let mounted = true;
    QRCode.toDataURL(balanceUpiUri, {
      width: 240,
      margin: 1.5,
      color: { dark: '#0f172a', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    })
      .then((url) => {
        if (mounted) setBalanceQrUrl(url);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [balanceUpiUri]);

  const cleanBalanceBankRef = balanceUtrInput.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  useEffect(() => {
    if (!showBalanceBox) return;
    const clean = balanceMethod === 'bank' ? cleanBalanceBankRef : balanceUtrInput.trim();
    const ready = balanceMethod === 'bank' ? clean.length >= 8 : /^\d{12}$/.test(clean);
    if (!ready) {
      setBalanceCheck(null);
      setIsCheckingBalanceUtr(false);
      return;
    }

    let cancelled = false;
    setIsCheckingBalanceUtr(true);
    const timer = setTimeout(() => {
      getAuthHeaders()
        .then((authHeaders) =>
          fetch('/api/payments/verify-utr', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders },
            body: JSON.stringify({ utr: clean, amount: balanceAmount, method: balanceMethod }),
          }),
        )
        .then((r) => r.json())
        .then((data) => {
          if (!cancelled) setBalanceCheck(data);
        })
        .catch(() => {
          if (!cancelled) setBalanceCheck(null);
        })
        .finally(() => {
          if (!cancelled) setIsCheckingBalanceUtr(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [showBalanceBox, balanceMethod, balanceUtrInput, cleanBalanceBankRef, balanceAmount]);

  const handleCopyBalanceField = (key: string, val: string) => {
    try {
      navigator.clipboard.writeText(val);
      setCopiedBalanceField(key);
      setTimeout(() => setCopiedBalanceField(null), 2000);
    } catch {}
  };

  const handleSubmitBalancePayment = async () => {
    const cleanRef = balanceMethod === 'bank' ? cleanBalanceBankRef : balanceUtrInput.trim();
    if (balanceMethod === 'upi' && !/^\d{12}$/.test(cleanRef)) {
      setBalanceError('Please enter your 12-digit UPI UTR / Ref number.');
      return;
    }
    if (balanceMethod === 'bank' && cleanRef.length < 8) {
      setBalanceError('Please enter a valid Bank Reference number (at least 8 characters).');
      return;
    }
    if (isCheckingBalanceUtr) {
      setBalanceError('Verification check in progress, please wait a moment...');
      return;
    }
    if (balanceCheck?.duplicate || balanceCheck?.valid === false) {
      setBalanceError(balanceCheck.message || 'Invalid or duplicate payment reference.');
      return;
    }

    setBalanceError(null);
    setIsSubmittingBalance(true);
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch('/api/bookings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          id: bookingInfo.id,
          action: 'pay_balance',
          payment_method: balanceMethod,
          utr: cleanRef,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setBalanceError(json?.error || 'Could not submit balance payment.');
        return;
      }
      triggerHapticFeedback([100, 50, 100]);
      setBookingInfo((prev) => ({
        ...prev,
        balancePaid: Boolean(json?.balanceAutoVerified),
        balancePendingReview: !json?.balanceAutoVerified,
        balanceUtr: cleanRef,
        remainingBalance: json?.balanceAutoVerified ? 0 : prev.remainingBalance,
      }));
      setBalanceSuccess(
        json?.balanceAutoVerified
          ? `Remaining ₹${balanceAmount.toLocaleString('en-IN')} auto-verified via ${json.verifiedSource || 'Settlement Pool'}!`
          : `Reference ${cleanRef} submitted for admin verification.`,
      );
    } catch {
      setBalanceError('Network error submitting balance payment.');
    } finally {
      setIsSubmittingBalance(false);
    }
  };

  // Live auto-verification polling when order is pending payment confirmation
  useEffect(() => {
    if (!bookingInfo.id || bookingInfo.paymentVerified || bookingInfo.status.toLowerCase() !== 'pending' || !bookingInfo.utr) {
      return;
    }
    let cancelled = false;

    const pollSettlement = async () => {
      try {
        const authHeaders = await getAuthHeaders();
        const res = await fetch(
          `/api/payments/verify-utr?bookingId=${encodeURIComponent(bookingInfo.id)}`,
          { cache: 'no-store', headers: authHeaders },
        );
        const json = await res.json();
        if (!cancelled && json?.verified) {
          triggerHapticFeedback([120, 60, 120]);
          setBookingInfo((prev) => ({
            ...prev,
            status: json.status || 'confirmed',
            paymentVerified: true,
          }));
        }
      } catch {}
    };

    const timer = setInterval(pollSettlement, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [bookingInfo.id, bookingInfo.paymentVerified, bookingInfo.status, bookingInfo.utr]);

  const handleManualVerifyRefresh = async () => {
    if (!bookingInfo.id || isCheckingVerification) return;
    setIsCheckingVerification(true);
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(
        `/api/payments/verify-utr?bookingId=${encodeURIComponent(bookingInfo.id)}`,
        { cache: 'no-store', headers: authHeaders },
      );
      const json = await res.json();
      if (json?.verified) {
        triggerHapticFeedback([120, 60, 120]);
        setBookingInfo((prev) => ({
          ...prev,
          status: json.status || 'confirmed',
          paymentVerified: true,
        }));
      }
    } catch {
    } finally {
      setIsCheckingVerification(false);
    }
  };

  const handleSubmitRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    setRefundError(null);
    setRefundSuccessMsg(null);
    setIsSubmittingRefund(true);
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch('/api/refunds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          bookingId: bookingInfo.id,
          reason: refundReason,
          details: refundDetails.trim(),
          payoutMethod: refundPayoutMethod,
          upiId: refundUpiId.trim(),
          accountHolder: refundHolder.trim(),
          accountNumber: refundAcc.trim(),
          ifsc: refundIfsc.trim().toUpperCase(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setRefundError(json?.error || 'Could not submit return/refund request.');
        return;
      }
      setBookingInfo((prev) => ({ ...prev, refundRequest: json.refundRequest }));
      setRefundSuccessMsg(
        `Return / Refund request ${json.refundRequest?.id} submitted for ₹${Number(
          json.refundRequest?.requestedAmount || 0,
        ).toLocaleString('en-IN')}.`,
      );
      setIsRefundModalOpen(false);
      setRefundDetails('');
    } catch {
      setRefundError('Network error submitting refund request.');
    } finally {
      setIsSubmittingRefund(false);
    }
  };

  const handleWithdrawRefund = async () => {
    if (!bookingInfo.id || isSubmittingRefund) return;
    setIsSubmittingRefund(true);
    setRefundError(null);
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch('/api/refunds', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ bookingId: bookingInfo.id, action: 'withdraw' }),
      });
      const json = await res.json();
      if (res.ok && json.refundRequest) {
        setBookingInfo((prev) => ({ ...prev, refundRequest: json.refundRequest }));
        setRefundSuccessMsg('Refund request withdrawn.');
      } else {
        setRefundError(json?.error || 'Unable to withdraw request.');
      }
    } catch {
      setRefundError('Network error withdrawing refund request.');
    } finally {
      setIsSubmittingRefund(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#07070d] text-white flex flex-col items-center">
      <div className="w-full max-w-xl min-h-screen flex flex-col bg-[#07070d] relative shadow-2xl">
        {/* Sticky Top Header */}
        <header className="sticky top-0 z-40 w-full bg-[#07070d]/90 backdrop-blur-xl border-b border-purple-500/10 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => router.back()}
              aria-label="Go Back"
              className="w-9 h-9 rounded-full bg-[#121326] border border-purple-500/20 flex items-center justify-center text-gray-300 hover:text-white hover:border-purple-400 transition-all cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-base sm:text-lg font-black text-white tracking-tight leading-none">
                Order Milestone Tracker
              </h1>
              <p className="text-[10px] text-purple-200/60 font-medium leading-tight mt-0.5">
                Track real-time progress of your project
              </p>
            </div>
          </div>

          {/* Right Status Pill */}
          {(() => {
            const s = (bookingInfo.status || 'pending').toLowerCase();
            if (s === 'delivered' || s === 'completed') {
              return (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>Delivered</span>
                </div>
              );
            }
            if (s === 'cancelled') {
              return (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-950/70 border border-rose-500/40 text-rose-300 text-[10px] font-bold shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                  <span>Cancelled</span>
                </div>
              );
            }
            if (s === 'pending') {
              return (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-950/70 border border-amber-500/40 text-amber-300 text-[10px] font-bold shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  <span>Pending Review</span>
                </div>
              );
            }
            return (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-950/70 border border-cyan-500/40 text-cyan-300 text-[10px] font-bold shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                <span>{s === 'confirmed' ? 'Confirmed' : 'In Progress'}</span>
              </div>
            );
          })()}
        </header>

        {/* Main Content Area */}
        <main className="flex-1 px-4 pt-3 space-y-4 pb-28">
          {isLoading ? (
            /* Milestone Skeleton Loader */
            <div className="space-y-4 animate-pulse">
              {/* Hero skeleton */}
              <div className="rounded-[24px] bg-[#1c0d3a]/60 border border-purple-500/20 p-4 space-y-3 shadow-xl">
                <div className="flex justify-between items-start gap-3">
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-purple-800/40 rounded-full w-28" />
                    <div className="h-5 bg-purple-700/30 rounded-md w-3/4" />
                    <div className="h-3 bg-purple-900/30 rounded-md w-1/2" />
                  </div>
                  <div className="w-20 h-20 rounded-2xl bg-purple-900/30 shrink-0" />
                </div>
                <div className="h-10 bg-purple-950/50 rounded-xl w-full" />
              </div>

              {/* Progress skeleton */}
              <div className="rounded-[22px] bg-[#121326]/80 border border-purple-500/15 p-4 space-y-2.5">
                <div className="flex justify-between">
                  <div className="h-3 bg-purple-900/30 rounded-md w-32" />
                  <div className="h-4 bg-purple-900/40 rounded-md w-12" />
                </div>
                <div className="h-2 bg-purple-900/25 rounded-full w-full" />
              </div>

              {/* Milestones list skeleton */}
              <div className="space-y-3 pt-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex gap-3 items-center">
                    <div className="w-5 h-5 rounded-full bg-purple-900/40 shrink-0" />
                    <div className="flex-1 h-12 rounded-2xl bg-[#121326]/60 border border-purple-500/10" />
                  </div>
                ))}
              </div>
            </div>
          ) : isNotFound ? (
            <div className="py-16 text-center space-y-3">
              <p className="text-sm font-bold text-white">Order not found</p>
              <p className="text-xs text-gray-400">
                This booking ID could not be loaded from the database.
              </p>
              <Link
                href="/orders"
                className="inline-block px-4 py-2 rounded-full bg-purple-600 text-white text-xs font-bold"
              >
                Back to Orders
              </Link>
            </div>
          ) : (
            <>
              {/* Project Summary Hero Card */}
              <div className="relative rounded-[24px] bg-gradient-to-r from-[#1c0d3a] via-[#140a28] to-[#2c0e4c] border border-purple-500/25 p-4 shadow-xl overflow-hidden">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0 pr-1">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-900/60 border border-purple-400/30 text-purple-200 text-[10px] font-bold mb-1.5">
                  <span>Order ID: {bookingInfo.orderNumber}</span>
                </div>

                <h2 className="text-sm sm:text-base font-extrabold text-white tracking-tight leading-snug">
                  {bookingInfo.title}
                </h2>

                <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-300">
                  <span className="text-purple-300 font-semibold">{bookingInfo.planName}</span>
                  <span className="text-gray-600">•</span>
                  <span className="text-gray-400 text-[10px]">{bookingInfo.provider}</span>
                </div>
              </div>

              {/* Right Project Artwork / Preview */}
              <div className="relative w-20 h-20 sm:w-24 sm:h-24 flex-shrink-0 rounded-2xl overflow-hidden border border-purple-500/30 bg-[#170e30] flex items-center justify-center shadow-lg">
                <Image
                  src={bookingInfo.imageSrc || '/assets/hero_laptop_clean.png'}
                  alt={bookingInfo.title}
                  fill
                  className="object-cover"
                  unoptimized
                />
              </div>
            </div>

            {/* Timeline & Days Left Pill Strip */}
            <div className="mt-3.5 pt-3 border-t border-purple-500/15 flex items-center justify-between text-[10px] gap-2">
              <div className="flex items-center gap-1.5 text-gray-400">
                <Calendar className="w-3.5 h-3.5 text-fuchsia-400" />
                <div>
                  <span className="text-gray-400 block leading-tight">Booked On</span>
                  <span className="font-bold text-white leading-tight">{bookingInfo.startedDate}</span>
                </div>
              </div>

              <div className="w-[1px] h-6 bg-purple-500/20" />

              <div className="flex items-center gap-1.5 text-gray-400 text-right">
                <div>
                  <span className="text-gray-400 block leading-tight">Est. Timeline</span>
                  <span className="font-bold text-white leading-tight">{bookingInfo.targetDate}</span>
                </div>
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
              </div>
            </div>
          </div>

          {/* Overall Progress Card */}
          {bookingInfo.status.toLowerCase() === 'cancelled' ? (
            <div className="rounded-[22px] bg-rose-950/30 border border-rose-500/30 p-4 shadow-lg flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-rose-300 block">
                  Order Cancelled
                </span>
                <span className="text-[11px] text-rose-200/70 block mt-0.5">
                  This booking was cancelled and milestone work has been stopped.
                </span>
              </div>
            </div>
          ) : (
            <div className="rounded-[22px] bg-[#121326]/95 border border-purple-500/20 p-4 shadow-lg space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white block">
                    Overall Progress
                  </span>
                  <span className="text-[10px] text-purple-200/60 block mt-0.5">
                    {completedCount} of {milestones.length} Milestones Completed
                  </span>
                </div>

                <span className="text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-300 via-pink-300 to-white">
                  {progressPercentage}%
                </span>
              </div>

              {/* Glowing Gradient Progress Bar */}
              <div className="w-full h-2 rounded-full bg-[#1b1035] overflow-hidden p-0.5">
                <div
                  className="h-full bg-gradient-to-r from-purple-600 via-fuchsia-500 to-pink-500 rounded-full shadow-[0_0_15px_rgba(217,70,239,0.5)] transition-all duration-700"
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>
            </div>
          )}

          {/* Vertical Milestones Timeline */}
          <div className="space-y-3 pt-1">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-1">
              Project Milestones
            </h3>

            <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-[2px] before:bg-gradient-to-b before:from-purple-500 before:via-fuchsia-500 before:to-gray-800">
              {milestones.map((milestone) => (
                <div key={milestone.id} className="relative group">
                  {/* Status Node Icon Indicator */}
                  <div className="absolute -left-6 top-1">
                    {milestone.status === 'completed' && (
                      <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-white ring-4 ring-[#07070d] shadow-sm shadow-emerald-500/50">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </div>
                    )}

                    {milestone.status === 'in-progress' && (
                      <div className="w-5 h-5 rounded-full bg-fuchsia-500 flex items-center justify-center text-white ring-4 ring-[#07070d] shadow-[0_0_12px_rgba(217,70,239,0.7)] animate-pulse">
                        <span className="w-2 h-2 rounded-full bg-white" />
                      </div>
                    )}

                    {milestone.status === 'pending' && (
                      <div className="w-5 h-5 rounded-full bg-[#1c1d38] border border-gray-600 flex items-center justify-center text-gray-400 ring-4 ring-[#07070d]">
                        <Circle className="w-2.5 h-2.5" />
                      </div>
                    )}
                  </div>

                  {/* Milestone Card Content */}
                  <div
                    className={`rounded-2xl p-3.5 border transition-all duration-200 ${
                      milestone.status === 'in-progress'
                        ? 'bg-[#181135]/95 border-fuchsia-500/40 shadow-lg shadow-purple-950/40'
                        : milestone.status === 'completed'
                        ? 'bg-[#121326]/90 border-purple-500/20'
                        : 'bg-[#0f1021]/60 border-purple-500/10 opacity-75'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-purple-300">
                            Stage {milestone.id}
                          </span>
                          {milestone.status === 'in-progress' && (
                            <span className="px-2 py-0.2 rounded-full bg-fuchsia-950/80 border border-fuchsia-500/40 text-fuchsia-300 text-[9px] font-extrabold animate-pulse">
                              Active
                            </span>
                          )}
                        </div>

                        <h4 className="text-xs sm:text-sm font-extrabold text-white mt-0.5">
                          {milestone.title}
                        </h4>
                      </div>

                      {milestone.dateLabel && (
                        <span className="text-[10px] text-gray-400 font-mono shrink-0">
                          {milestone.dateLabel}
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-gray-300 mt-1 leading-relaxed">
                      {milestone.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Payment & Balance Verification Section (Custom UPI / Bank Auto-Verify) */}
          {(bookingInfo.utr || showBalanceBox || bookingInfo.balancePendingReview || bookingInfo.balancePaid) && (
            <div className="rounded-[22px] bg-[#121326]/95 border border-purple-500/25 p-4 space-y-3 shadow-lg">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-xs font-extrabold text-white">Payment Verification</span>
                </div>
                {bookingInfo.balancePaid || bookingInfo.paymentVerified ? (
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/35 text-emerald-300 text-[10px] font-bold">
                    {bookingInfo.balancePaid && Number(bookingInfo.advanceAmount || 0) > 0
                      ? 'Full Balance Verified'
                      : 'Auto-Verified'}
                  </span>
                ) : bookingInfo.balancePendingReview ? (
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-400/35 text-amber-300 text-[10px] font-bold">
                    Balance Verifying
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-400/35 text-amber-300 text-[10px] font-bold">
                    Pending Real Settlement (Unconfirmed)
                  </span>
                )}
              </div>

              {!bookingInfo.paymentVerified && bookingInfo.status.toLowerCase() === 'pending' && bookingInfo.utr && (
                <div className="p-2.5 rounded-xl bg-amber-950/35 border border-amber-500/30 flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-amber-200/90 leading-snug">
                    Order confirm tab hoga jab real Bank/UPI payment receive verify hoga.
                  </span>
                  <button
                    type="button"
                    onClick={handleManualVerifyRefresh}
                    disabled={isCheckingVerification}
                    className="shrink-0 px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-200 font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-60"
                  >
                    <RefreshCw className={`w-3 h-3 ${isCheckingVerification ? 'animate-spin' : ''}`} />
                    <span>Verify</span>
                  </button>
                </div>
              )}

              {bookingInfo.utr && (
                <div className="text-[11px] text-gray-300 flex items-center justify-between bg-[#0c0d1c] rounded-xl px-3 py-2 border border-purple-500/15">
                  <span>Initial Ref / UTR ({(bookingInfo.paymentMethod || 'upi').toUpperCase()})</span>
                  <span className="font-mono font-bold text-purple-200">{bookingInfo.utr}</span>
                </div>
              )}

              {bookingInfo.balanceUtr && (
                <div className="text-[11px] text-gray-300 flex items-center justify-between bg-[#0c0d1c] rounded-xl px-3 py-2 border border-purple-500/15">
                  <span>Balance Ref / UTR</span>
                  <span className="font-mono font-bold text-emerald-300">{bookingInfo.balanceUtr}</span>
                </div>
              )}

              {balanceSuccess && (
                <div className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-500/35 text-xs text-emerald-300 font-semibold">
                  {balanceSuccess}
                </div>
              )}

              {showBalanceBox && (
                <div className="pt-2 border-t border-purple-500/15 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-bold text-amber-300 block">
                        Remaining Balance Due
                      </span>
                      <span className="text-[10px] text-gray-400">
                        Pay balance via your verified UPI QR or Bank NEFT/IMPS
                      </span>
                    </div>
                    <span className="text-base font-black text-white">
                      ₹{balanceAmount.toLocaleString('en-IN')}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#0c0d1c] border border-purple-500/20">
                    <button
                      type="button"
                      onClick={() => {
                        setBalanceMethod('upi');
                        setBalanceError(null);
                        setBalanceCheck(null);
                      }}
                      className={`py-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                        balanceMethod === 'upi'
                          ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>UPI QR Auto-Verify</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBalanceMethod('bank');
                        setBalanceError(null);
                        setBalanceCheck(null);
                      }}
                      className={`py-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                        balanceMethod === 'bank'
                          ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      <Building2 className="w-3.5 h-3.5" />
                      <span>Bank NEFT / IMPS</span>
                    </button>
                  </div>

                  {balanceMethod === 'upi' ? (
                    <div className="flex flex-col items-center gap-2.5 bg-[#0c0d1c] rounded-2xl p-3 border border-purple-500/15">
                      {balanceQrUrl && (
                        <div className="p-2 rounded-2xl bg-white">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={balanceQrUrl} alt="Balance UPI QR" className="w-36 h-36 object-contain" />
                        </div>
                      )}
                      <div className="w-full flex items-center justify-between gap-2 text-[11px] px-2">
                        <span className="text-gray-400">VPA: <strong className="text-purple-200 font-mono">{gateway.displayId}</strong></span>
                        <button
                          type="button"
                          onClick={() => handleCopyBalanceField('upi', gateway.upiId)}
                          className="inline-flex items-center gap-1 text-fuchsia-400 font-bold cursor-pointer"
                        >
                          {copiedBalanceField === 'upi' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          <span>Copy</span>
                        </button>
                      </div>
                      {balanceUpiUri && (
                        <a
                          href={balanceUpiUri}
                          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-xs font-extrabold flex items-center justify-center gap-1.5"
                        >
                          <Smartphone className="w-3.5 h-3.5" />
                          <span>Open UPI App (₹{balanceAmount.toLocaleString('en-IN')})</span>
                        </a>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1.5 bg-[#0c0d1c] rounded-2xl p-3 border border-purple-500/15 text-[11px]">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Bank</span>
                        <span className="font-bold text-white">{gateway.bankName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">A/C No</span>
                        <button
                          type="button"
                          onClick={() => handleCopyBalanceField('acc', gateway.accountNumber)}
                          className="font-mono font-bold text-purple-200 inline-flex items-center gap-1 cursor-pointer"
                        >
                          <span>{gateway.accountNumber}</span>
                          {copiedBalanceField === 'acc' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-fuchsia-400" />}
                        </button>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">IFSC</span>
                        <button
                          type="button"
                          onClick={() => handleCopyBalanceField('ifsc', gateway.ifsc)}
                          className="font-mono font-bold text-white inline-flex items-center gap-1 cursor-pointer"
                        >
                          <span>{gateway.ifsc}</span>
                          {copiedBalanceField === 'ifsc' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-fuchsia-400" />}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <input
                      type="text"
                      inputMode={balanceMethod === 'upi' ? 'numeric' : 'text'}
                      maxLength={balanceMethod === 'upi' ? 12 : 22}
                      placeholder={
                        balanceMethod === 'upi'
                          ? 'Enter 12-digit UPI UTR ID'
                          : 'Enter NEFT / IMPS Ref Number (8-22 chars)'
                      }
                      value={balanceUtrInput}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setBalanceUtrInput(
                          balanceMethod === 'upi'
                            ? raw.replace(/\D/g, '').slice(0, 12)
                            : raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 22),
                        );
                        setBalanceError(null);
                      }}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#171936] border border-purple-500/25 text-white placeholder-gray-500 text-xs font-mono focus:outline-none focus:border-purple-400"
                    />
                    {isCheckingBalanceUtr && (
                      <p className="text-[11px] text-purple-300 font-semibold flex items-center gap-1.5">
                        <Loader2 className="w-3 h-3 animate-spin" /> Checking reference against settlement pool...
                      </p>
                    )}
                    {!isCheckingBalanceUtr && balanceCheck?.message && (
                      <p className={`text-[11px] font-semibold ${balanceCheck.duplicate || balanceCheck.valid === false ? 'text-rose-400' : 'text-emerald-300'}`}>
                        {balanceCheck.message}
                      </p>
                    )}
                    {balanceError && <p className="text-[11px] text-rose-400 font-semibold">{balanceError}</p>}

                    <button
                      type="button"
                      disabled={isSubmittingBalance}
                      onClick={handleSubmitBalancePayment}
                      className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                    >
                      {isSubmittingBalance ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      <span>Submit Balance Reference</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Deliverables Section (when uploaded) */}
          {bookingInfo.files && bookingInfo.files.length > 0 && (
            <div className="rounded-[22px] bg-[#121326]/95 border border-purple-500/25 p-4 space-y-2.5 shadow-lg">
              <span className="text-xs font-extrabold text-white block">Deliverables & Files</span>
              <div className="space-y-2">
                {bookingInfo.files.map((file, idx) =>
                  file.url ? (
                    <a
                      key={idx}
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#0c0d1c] border border-purple-500/20 text-xs text-purple-200 hover:border-purple-400"
                    >
                      <span className="truncate font-semibold">{file.name}</span>
                      <Download className="w-3.5 h-3.5 text-fuchsia-400 shrink-0" />
                    </a>
                  ) : (
                    <div
                      key={idx}
                      className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#0c0d1c] border border-purple-500/15 text-xs text-gray-300"
                    >
                      <span className="truncate">{file.name}</span>
                    </div>
                  ),
                )}
              </div>
            </div>
          )}

          {/* Return & Refund Center */}
          <div className="rounded-[22px] bg-[#121326]/95 border border-purple-500/25 p-4 space-y-3 shadow-lg">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-fuchsia-400 shrink-0" />
                <span className="text-xs font-extrabold text-white">Return & Refund Protection</span>
              </div>
              {bookingInfo.refundRequest && (
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase ${
                    bookingInfo.refundRequest.status === 'refunded'
                      ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
                      : bookingInfo.refundRequest.status === 'rejected' || bookingInfo.refundRequest.status === 'withdrawn'
                        ? 'bg-rose-500/15 border-rose-400/40 text-rose-300'
                        : 'bg-amber-500/15 border-amber-400/40 text-amber-300'
                  }`}
                >
                  {bookingInfo.refundRequest.status.replace('_', ' ')}
                </span>
              )}
            </div>

            {refundSuccessMsg && (
              <div className="p-2.5 rounded-xl bg-emerald-950/45 border border-emerald-500/35 text-[11px] text-emerald-300 font-semibold">
                {refundSuccessMsg}
              </div>
            )}

            {bookingInfo.refundRequest && bookingInfo.refundRequest.status !== 'withdrawn' ? (
              <div className="space-y-2 text-[11px] bg-[#0c0d1c] rounded-xl p-3 border border-purple-500/15">
                <div className="flex justify-between">
                  <span className="text-gray-400">Refund ID</span>
                  <span className="font-mono font-bold text-purple-200">{bookingInfo.refundRequest.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Verified Refund Amount</span>
                  <span className="font-bold text-emerald-400">
                    ₹{Number(bookingInfo.refundRequest.requestedAmount || 0).toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-400 shrink-0">Payout To</span>
                  <span className="font-mono text-white text-right truncate">
                    {bookingInfo.refundRequest.payoutDestination}
                  </span>
                </div>
                {bookingInfo.refundRequest.refundUtr && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Refund Credit UTR</span>
                    <span className="font-mono font-bold text-emerald-300">{bookingInfo.refundRequest.refundUtr}</span>
                  </div>
                )}
                {bookingInfo.refundRequest.status === 'requested' && (
                  <button
                    type="button"
                    disabled={isSubmittingRefund}
                    onClick={handleWithdrawRefund}
                    className="w-full mt-1 py-2 rounded-xl bg-[#181936] border border-purple-500/25 text-gray-300 hover:text-rose-300 text-[11px] font-bold cursor-pointer disabled:opacity-60"
                  >
                    Withdraw Refund Request
                  </button>
                )}
              </div>
            ) : (bookingInfo.verifiedPaidAmount || 0) > 0 ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] text-gray-300 leading-relaxed">
                  Verified Paid: <strong className="text-white">₹{Number(bookingInfo.verifiedPaidAmount).toLocaleString('en-IN')}</strong>. Eligible for milestone return / refund review.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setRefundError(null);
                    setIsRefundModalOpen(true);
                  }}
                  className="shrink-0 px-3 py-2 rounded-xl bg-purple-600/25 border border-purple-400/40 hover:bg-purple-600/40 text-purple-200 text-[11px] font-bold cursor-pointer"
                >
                  Request Return / Refund
                </button>
              </div>
            ) : (
              <p className="text-[11px] text-gray-400 leading-relaxed">
                No verified settled payment recorded yet. Pending/unverified orders can be cancelled anytime from Orders with ₹0 deduction.
              </p>
            )}
          </div>

          {/* Return / Refund Request Modal */}
          {isRefundModalOpen && (
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
              <form
                onSubmit={handleSubmitRefund}
                className="w-full max-w-md rounded-3xl bg-[#121326] border border-purple-500/30 p-5 space-y-3.5 shadow-2xl"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-black text-white">Request Return / Refund</h3>
                    <p className="text-[11px] text-gray-400">
                      Max Verified Refund: ₹{Number(bookingInfo.verifiedPaidAmount || 0).toLocaleString('en-IN')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsRefundModalOpen(false)}
                    aria-label="Close Refund Modal"
                    className="w-8 h-8 rounded-full bg-[#1b1c36] flex items-center justify-center text-gray-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-purple-200 block">Reason</label>
                  <select
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-[#171936] border border-purple-500/25 text-white text-xs focus:outline-none focus:border-purple-400"
                  >
                    <option value="service_not_started">Work not started within promised SLA</option>
                    <option value="milestone_mismatch">Deliverable / milestone did not match scope</option>
                    <option value="quality_issue">Technical / code quality issue unresolved</option>
                    <option value="duplicate_payment">Duplicate payment deducted</option>
                    <option value="cancelled_paid_order">Order cancelled after verified payment</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-purple-200 block">Details (min 10 chars)</label>
                  <textarea
                    rows={3}
                    required
                    minLength={10}
                    placeholder="Explain the issue or milestone mismatch..."
                    value={refundDetails}
                    onChange={(e) => setRefundDetails(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#171936] border border-purple-500/25 text-white placeholder-gray-500 text-xs focus:outline-none focus:border-purple-400 resize-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-purple-200 block">Refund Payout Destination</label>
                  <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#0c0d1c] border border-purple-500/20">
                    <button
                      type="button"
                      onClick={() => setRefundPayoutMethod('upi')}
                      className={`py-1.5 rounded-lg text-[11px] font-bold cursor-pointer ${
                        refundPayoutMethod === 'upi' ? 'bg-purple-600 text-white' : 'text-gray-400'
                      }`}
                    >
                      UPI ID
                    </button>
                    <button
                      type="button"
                      onClick={() => setRefundPayoutMethod('bank')}
                      className={`py-1.5 rounded-lg text-[11px] font-bold cursor-pointer ${
                        refundPayoutMethod === 'bank' ? 'bg-purple-600 text-white' : 'text-gray-400'
                      }`}
                    >
                      Bank Account
                    </button>
                  </div>

                  {refundPayoutMethod === 'upi' ? (
                    <input
                      type="text"
                      required
                      placeholder="Your UPI ID (e.g. name@okicici)"
                      value={refundUpiId}
                      onChange={(e) => setRefundUpiId(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-[#171936] border border-purple-500/25 text-white placeholder-gray-500 text-xs font-mono focus:outline-none focus:border-purple-400"
                    />
                  ) : (
                    <div className="space-y-2">
                      <input
                        type="text"
                        required
                        placeholder="Account Holder Name"
                        value={refundHolder}
                        onChange={(e) => setRefundHolder(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-[#171936] border border-purple-500/25 text-white placeholder-gray-500 text-xs focus:outline-none"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          required
                          placeholder="Account Number"
                          value={refundAcc}
                          onChange={(e) => setRefundAcc(e.target.value.replace(/\D/g, '').slice(0, 24))}
                          className="w-full px-3 py-2 rounded-xl bg-[#171936] border border-purple-500/25 text-white placeholder-gray-500 text-xs font-mono focus:outline-none"
                        />
                        <input
                          type="text"
                          required
                          maxLength={11}
                          placeholder="IFSC Code"
                          value={refundIfsc}
                          onChange={(e) => setRefundIfsc(e.target.value.toUpperCase().slice(0, 11))}
                          className="w-full px-3 py-2 rounded-xl bg-[#171936] border border-purple-500/25 text-white placeholder-gray-500 text-xs font-mono focus:outline-none"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {refundError && <p className="text-[11px] text-rose-400 font-semibold">{refundError}</p>}

                <button
                  type="submit"
                  disabled={isSubmittingRefund}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white text-xs font-extrabold cursor-pointer disabled:opacity-60"
                >
                  {isSubmittingRefund ? 'Submitting Request...' : 'Submit Return / Refund Request'}
                </button>
              </form>
            </div>
          )}

          {/* Quick Actions Strip */}
          <div className="pt-2 grid grid-cols-2 gap-2.5">
            <Link
              href={`/support?orderId=${encodeURIComponent(bookingInfo.orderNumber)}&title=${encodeURIComponent(bookingInfo.title)}`}
              className="py-3 px-3 rounded-2xl bg-[#14102c] border border-purple-500/25 hover:border-purple-400 text-purple-200 hover:text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95"
            >
              <MessageSquare className="w-4 h-4 text-fuchsia-400" />
              <span>Support Chat</span>
            </Link>

            <a
              href={`https://wa.me/${supportWhatsApp}?text=${encodeURIComponent(`Hello Taliyo Support, I need an update on Order ${bookingInfo.orderNumber}.`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="py-3 px-3 rounded-2xl bg-[#0e1f18] border border-emerald-500/30 hover:border-emerald-400 text-emerald-300 hover:text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95"
            >
              <MessageCircle className="w-4 h-4 text-emerald-400" />
              <span>Direct WhatsApp</span>
            </a>

            {(bookingInfo.status.toLowerCase() === 'delivered' || bookingInfo.status.toLowerCase() === 'completed') && (
              <Link
                href="/reviews"
                className="col-span-2 py-3 px-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all"
              >
                <Star className="w-4 h-4" />
                <span>Rate This Service</span>
              </Link>
            )}
          </div>
        </>
      )}
    </main>

        {/* Floating Bottom Navigation */}
        <BottomNav />
      </div>
    </div>
  );
}
