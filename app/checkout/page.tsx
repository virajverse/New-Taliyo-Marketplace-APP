'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import {
  ArrowLeft,
  ShieldCheck,
  Lock,
  Clock,
  Tag,
  CheckCircle2,
  QrCode,
  Building2,
  Smartphone,
  Download,
  Copy,
  Check,
  HelpCircle,
  ArrowRight,
  Loader2,
  ShoppingBag,
  Edit3,
} from 'lucide-react';
import { supabase, getAuthHeaders } from '@/lib/supabaseClient';
import { PAYMENT_CONFIG, generateUpiUri, triggerHapticFeedback } from '@/lib/paymentConfig';

interface CartItem {
  id: string;
  slug?: string;
  title: string;
  subtitle?: string;
  packageName?: string;
  deliveryDays?: number;
  price: number;
  usdPrice?: number;
  quantity: number;
  imageSrc?: string;
}

type CheckoutStep = 1 | 2 | 3;
type PaymentMethod = 'upi' | 'advance' | 'bank';

const CHECKOUT_DRAFT_KEY = 'taliyo_checkout_draft';

interface CheckoutDraft {
  fullName?: string;
  email?: string;
  whatsapp?: string;
  notes?: string;
  couponInput?: string;
  appliedCoupon?: {
    code: string;
    discountAmount: number;
    discountType: string;
    discountValue: number;
    message: string;
  } | null;
  paymentMethod?: PaymentMethod;
  resumeToPayment?: boolean;
}

export default function CheckoutPage() {
  const router = useRouter();

  const [items, setItems] = useState<CartItem[]>([]);
  const [currency, setCurrency] = useState<'INR' | 'USD'>('INR');
  const [isLoaded, setIsLoaded] = useState(false);
  const [authUser, setAuthUser] = useState<{ id: string; email?: string | null } | null>(null);
  const [authReady, setAuthReady] = useState(false);

  // Step & Timer
  const [step, setStep] = useState<CheckoutStep>(1);
  const [secondsLeft, setSecondsLeft] = useState(600); // 10:00 payment session timer
  const [orderRef, setOrderRef] = useState('TL-2026-INIT');
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null);

  // Contact & Notes
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [notes, setNotes] = useState('');
  const [step1Error, setStep1Error] = useState<string | null>(null);

  // Coupon State
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discountAmount: number;
    discountType: string;
    discountValue: number;
    message: string;
  } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);
  const [availableCoupons, setAvailableCoupons] = useState<
    Array<{
      code: string;
      description?: string;
      discount_type?: string;
      discount_value?: number;
      min_order_amount?: number;
    }>
  >([]);
  const [showCouponsList, setShowCouponsList] = useState(false);

  // Payment State
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('upi');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [utr, setUtr] = useState('');
  const [showUtrHelp, setShowUtrHelp] = useState(false);
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [copiedAcc, setCopiedAcc] = useState(false);
  const [copiedIfsc, setCopiedIfsc] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [gateway, setGateway] = useState({
    upiId: PAYMENT_CONFIG.upi.id,
    displayId: PAYMENT_CONFIG.upi.displayId,
    payeeName: PAYMENT_CONFIG.upi.payeeName,
    merchantType: PAYMENT_CONFIG.upi.merchantType,
    bankName: PAYMENT_CONFIG.bank.bankName,
    accountName: PAYMENT_CONFIG.bank.accountName,
    accountNumber: PAYMENT_CONFIG.bank.accountNumber,
    ifsc: PAYMENT_CONFIG.bank.ifsc,
    advancePercent: 30,
    autoVerifyEnabled: true,
  });
  const [utrCheck, setUtrCheck] = useState<{
    valid?: boolean;
    duplicate?: boolean;
    poolMatched?: boolean;
    status?: string;
    message?: string;
    source?: string;
  } | null>(null);
  const [isCheckingUtr, setIsCheckingUtr] = useState(false);
  const [autoVerifiedResult, setAutoVerifiedResult] = useState<{
    verified: boolean;
    source?: string;
  } | null>(null);

  // Load Cart Items, Restore Draft, Prefill Auth Profile & Sync Live Admin Payment Settings
  useEffect(() => {
    fetch('/api/payment-settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (json?.data) {
          setGateway((prev) => ({ ...prev, ...json.data }));
        }
      })
      .catch(() => {
        // fallback to default config
      });

    getAuthHeaders()
      .then((authHeaders) => fetch('/api/coupons', { headers: authHeaders }))
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (Array.isArray(json?.data)) {
          setAvailableCoupons(json.data);
        }
      })
      .catch(() => {});

    let loadedDraft: CheckoutDraft | null = null;

    try {
      const savedCurr = localStorage.getItem('taliyo_currency');
      if (savedCurr === 'USD' || savedCurr === 'INR') {
        setCurrency(savedCurr);
      }

      const stored = localStorage.getItem('taliyo_cart');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setItems(parsed);
        }
      }

      const rawDraft = localStorage.getItem(CHECKOUT_DRAFT_KEY);
      if (rawDraft) {
        loadedDraft = JSON.parse(rawDraft) as CheckoutDraft;
        if (loadedDraft.fullName) setFullName(loadedDraft.fullName);
        if (loadedDraft.email) setEmail(loadedDraft.email);
        if (loadedDraft.whatsapp) setWhatsapp(loadedDraft.whatsapp);
        if (loadedDraft.notes) setNotes(loadedDraft.notes);
        if (loadedDraft.couponInput) setCouponInput(loadedDraft.couponInput);
        if (loadedDraft.appliedCoupon) setAppliedCoupon(loadedDraft.appliedCoupon);
        if (loadedDraft.paymentMethod) setPaymentMethod(loadedDraft.paymentMethod);
      }
    } catch {
      // ignore storage error
    } finally {
      setIsLoaded(true);
    }

    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    setOrderRef(`TL-${Date.now().toString().slice(-6)}-${rand}`);

    async function loadUser() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          setAuthUser({ id: user.id, email: user.email });
          const resolvedName = loadedDraft?.fullName || user.user_metadata?.full_name || '';
          const resolvedEmail = loadedDraft?.email || user.email || '';
          const resolvedPhone = loadedDraft?.whatsapp || user.user_metadata?.phone || '';

          if (!loadedDraft?.fullName && resolvedName) setFullName(resolvedName);
          if (!loadedDraft?.email && resolvedEmail) setEmail(resolvedEmail);
          if (!loadedDraft?.whatsapp && resolvedPhone) setWhatsapp(resolvedPhone);

          if (
            loadedDraft?.resumeToPayment &&
            resolvedName.trim() &&
            resolvedEmail.trim() &&
            resolvedPhone.trim()
          ) {
            setSecondsLeft(600);
            setStep(2);
            try {
              localStorage.setItem(
                CHECKOUT_DRAFT_KEY,
                JSON.stringify({ ...loadedDraft, resumeToPayment: false })
              );
            } catch {
              // ignore
            }
          }
        } else {
          setAuthUser(null);
        }
      } catch {
        setAuthUser(null);
      } finally {
        setAuthReady(true);
      }
    }
    loadUser();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setAuthUser({ id: session.user.id, email: session.user.email });
        setFullName((prev) => prev || session.user.user_metadata?.full_name || '');
        setEmail((prev) => prev || session.user.email || '');
        setWhatsapp((prev) => prev || session.user.user_metadata?.phone || '');
      } else {
        setAuthUser(null);
      }
      setAuthReady(true);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  // Auto-persist checkout draft so nothing is lost across login or page reloads
  useEffect(() => {
    if (!isLoaded || step === 3) return;
    try {
      const existingRaw = localStorage.getItem(CHECKOUT_DRAFT_KEY);
      const existing = existingRaw ? (JSON.parse(existingRaw) as CheckoutDraft) : {};
      const draft: CheckoutDraft = {
        fullName,
        email,
        whatsapp,
        notes,
        couponInput,
        appliedCoupon,
        paymentMethod,
        resumeToPayment: Boolean(existing.resumeToPayment),
      };
      localStorage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // ignore storage error
    }
  }, [isLoaded, step, fullName, email, whatsapp, notes, couponInput, appliedCoupon, paymentMethod]);

  const redirectToLoginForPayment = (resumeToPayment: boolean) => {
    try {
      const draft: CheckoutDraft = {
        fullName,
        email,
        whatsapp,
        notes,
        couponInput,
        appliedCoupon,
        paymentMethod,
        resumeToPayment,
      };
      localStorage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // ignore storage error
    }
    router.push('/login?next=/checkout');
  };

  // Session Countdown Timer
  useEffect(() => {
    if (step !== 2) return;
    const interval = setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [step]);

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const subtotal = useMemo(
    () => items.reduce((acc, item) => acc + (Number(item.price) || 0) * (Number(item.quantity) || 1), 0),
    [items]
  );

  const usdSubtotal = useMemo(
    () =>
      items.reduce((acc, item) => {
        const unitInr = Number(item.price) || 0;
        const unitUsd =
          item.usdPrice && item.usdPrice > 0
            ? Number(item.usdPrice)
            : unitInr > 0
              ? Math.max(19, Math.round(unitInr / 83))
              : 0;
        return acc + unitUsd * (Number(item.quantity) || 1);
      }, 0),
    [items],
  );

  const finalPayable = appliedCoupon ? Math.max(0, subtotal - appliedCoupon.discountAmount) : subtotal;
  const advanceRatio = (gateway.advancePercent || 30) / 100;
  const payableNow = paymentMethod === 'advance' ? Math.round(finalPayable * advanceRatio) : finalPayable;
  const usdRatio = subtotal > 0 ? payableNow / subtotal : 0;
  const usdPayableApprox = subtotal > 0 ? Math.max(1, Math.round(usdSubtotal * usdRatio)) : 0;

  const handleCurrencyChange = (next: 'INR' | 'USD') => {
    setCurrency(next);
    try {
      localStorage.setItem('taliyo_currency', next);
    } catch {}
  };

  // Re-verify restored/applied coupon once customer auth & email resolve so user-specific rules catch ineligible accounts before payment
  useEffect(() => {
    if (!authReady || !authUser || !appliedCoupon || subtotal <= 0) return;
    let cancelled = false;
    const customerEmail = (email || authUser.email || '').trim() || null;

    getAuthHeaders()
      .then((authHeaders) =>
        fetch('/api/coupons/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({
            code: appliedCoupon.code,
            orderAmount: subtotal,
            userId: authUser.id,
            email: customerEmail,
          }),
        }),
      )
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (!json?.valid) {
          setAppliedCoupon(null);
          setCouponError(json?.message || `Coupon '${appliedCoupon.code}' is not eligible for this account`);
          setStep(1);
        }
      })
      .catch(() => {
        // ignore transient network check
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, authUser?.id]);

  // Real NPCI UPI Deep Link & QR Code routed to live configured Merchant VPA
  const upiUri = useMemo(() => {
    if (payableNow <= 0 || !gateway.upiId) return '';
    return generateUpiUri({
      upiId: gateway.upiId,
      payeeName: gateway.payeeName,
      amount: payableNow,
      orderRef,
      note: items[0]?.title || 'Taliyo Order',
    });
  }, [gateway.upiId, gateway.payeeName, payableNow, orderRef, items]);

  useEffect(() => {
    if (!upiUri) {
      setQrDataUrl('');
      return;
    }
    let isMounted = true;
    QRCode.toDataURL(upiUri, {
      width: 320,
      margin: 1.5,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    })
      .then((url) => {
        if (isMounted) setQrDataUrl(url);
      })
      .catch((err) => console.error('QR generation failed:', err));

    return () => {
      isMounted = false;
    };
  }, [upiUri]);

  const handleApplyCoupon = async () => {
    if (!couponInput.trim()) return;
    setIsValidatingCoupon(true);
    setCouponError(null);

    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch('/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          code: couponInput.trim(),
          orderAmount: subtotal,
          userId: authUser?.id || null,
          email: (email || authUser?.email || '').trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.valid) {
        setCouponError(json.message || 'Invalid or expired coupon code');
        setAppliedCoupon(null);
      } else {
        setAppliedCoupon({
          code: json.code,
          discountAmount: json.discountAmount,
          discountType: json.discountType,
          discountValue: json.discountValue,
          message: json.message,
        });
        setCouponError(null);
      }
    } catch {
      setCouponError('Network error validating coupon');
    } finally {
      setIsValidatingCoupon(false);
    }
  };

  const handleContinueToPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim() || !whatsapp.trim()) {
      setStep1Error('Please fill your Full Name, Email, and WhatsApp Number.');
      return;
    }
    setStep1Error(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.id) {
        redirectToLoginForPayment(true);
        return;
      }
      setAuthUser({ id: user.id, email: user.email });
    } catch {
      redirectToLoginForPayment(true);
      return;
    }

    setSecondsLeft(600);
    setStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCopy = (text: string, setter: (v: boolean) => void) => {
    try {
      navigator.clipboard.writeText(text);
      setter(true);
      setTimeout(() => setter(false), 2000);
    } catch {
      // ignore
    }
  };

  const isUtrTwelveDigits = /^\d{12}$/.test(utr.trim());
  const cleanBankRef = utr.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const isBankRefValid = cleanBankRef.length >= 8;

  // Auto-Verify UTR / Bank Reference Check for UPI, 30% Advance, and Bank Transfer
  useEffect(() => {
    const clean = paymentMethod === 'bank' ? cleanBankRef : utr.trim();
    const readyToVerify =
      paymentMethod === 'bank' ? clean.length >= 8 : /^\d{12}$/.test(clean);

    if (!readyToVerify || finalPayable <= 0) {
      setUtrCheck(null);
      setIsCheckingUtr(false);
      return;
    }

    let cancelled = false;
    setIsCheckingUtr(true);

    const timer = setTimeout(() => {
      getAuthHeaders()
        .then((authHeaders) =>
          fetch('/api/payments/verify-utr', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders },
            body: JSON.stringify({ utr: clean, amount: payableNow, method: paymentMethod }),
          }),
        )
        .then((r) => r.json())
        .then((data) => {
          if (!cancelled) setUtrCheck(data);
        })
        .catch(() => {
          if (!cancelled) setUtrCheck(null);
        })
        .finally(() => {
          if (!cancelled) setIsCheckingUtr(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [utr, cleanBankRef, payableNow, finalPayable, paymentMethod]);

  const handleConfirmPayment = async () => {
    if (finalPayable > 0) {
      if ((paymentMethod === 'upi' || paymentMethod === 'advance') && !/^\d{12}$/.test(utr.trim())) {
        setSubmitError('Please enter your 12-digit UPI UTR / Reference ID from your payment receipt to confirm.');
        return;
      }
      if (paymentMethod === 'bank' && cleanBankRef.length < 8) {
        setSubmitError('Please enter a valid NEFT / IMPS / RTGS Reference Number (at least 8 characters).');
        return;
      }
    }

    if (isCheckingUtr) {
      setSubmitError('Please wait a moment while we verify your payment reference...');
      return;
    }

    if (utrCheck?.duplicate) {
      setSubmitError(utrCheck.message || 'This payment reference has already been used on another order.');
      return;
    }

    if (finalPayable > 0 && utrCheck && utrCheck.valid === false) {
      setSubmitError(utrCheck.message || 'Invalid payment reference. Please check and re-enter.');
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.id) {
        setIsSubmitting(false);
        redirectToLoginForPayment(true);
        return;
      }

      const submittedRef = paymentMethod === 'bank' ? cleanBankRef : utr.trim();
      const titleSummary = items.map((i) => i.title).join(', ');
      const paymentDetails = `Ref: ${orderRef} | Method: ${paymentMethod.toUpperCase()} (${
        paymentMethod === 'bank' ? `${gateway.bankName || 'NEFT/IMPS'} • ${gateway.accountNumber}` : gateway.upiId
      })${submittedRef ? ` | UTR: ${submittedRef}` : ''}`;
      const couponNote = appliedCoupon
        ? ` | Coupon: ${appliedCoupon.code} (-₹${appliedCoupon.discountAmount.toLocaleString('en-IN')})`
        : '';

      const authHeaders = await getAuthHeaders();
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          service_title: titleSummary || 'Service Order',
          service_price: String(payableNow),
          provider_name: 'Taliyo Technologies',
          full_name: fullName.trim(),
          customer_name: fullName.trim(),
          email: email.trim(),
          customer_email: email.trim(),
          phone: whatsapp.trim(),
          customer_phone: whatsapp.trim(),
          whatsapp_number: whatsapp.trim(),
          requirements: `${paymentDetails}${couponNote}\nNotes: ${notes.trim() || 'Standard Delivery'}`,
          cart_items: items,
          status: 'pending',
          order_subtotal: subtotal,
          final_price: payableNow,
          payment_method: paymentMethod,
          order_ref: orderRef,
          utr: submittedRef || null,
          advance_amount: paymentMethod === 'advance' ? payableNow : 0,
          coupon_code: appliedCoupon ? appliedCoupon.code : null,
          discount_amount: appliedCoupon ? appliedCoupon.discountAmount : 0,
          user_id: user?.id || null,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Unable to save booking');
      }

      const insertedId = json?.data?.id || null;
      setPlacedOrderId(insertedId);
      setAutoVerifiedResult({
        verified: Boolean(json?.autoVerified),
        source: json?.verifiedSource || undefined,
      });
      triggerHapticFeedback([120, 60, 120]);

      try {
        localStorage.removeItem('taliyo_cart');
        localStorage.removeItem(CHECKOUT_DRAFT_KEY);
        window.dispatchEvent(new Event('taliyo_cart_updated'));
      } catch {
        // ignore
      }

      setStep(3);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong while placing order';
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-[#07070d] text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-7 h-7 animate-spin text-purple-400" />
          <span className="text-xs font-medium text-gray-400">Initializing Secure Checkout...</span>
        </div>
      </div>
    );
  }

  if (items.length === 0 && step !== 3) {
    return (
      <div className="min-h-screen bg-[#07070d] text-white flex flex-col items-center justify-center px-4 text-center">
        <div className="w-full max-w-sm p-6 rounded-3xl bg-[#101124] border border-purple-500/20 space-y-4 shadow-2xl">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-purple-900/30 border border-purple-500/30 flex items-center justify-center text-purple-300">
            <ShoppingBag className="w-7 h-7" />
          </div>
          <h1 className="text-base font-extrabold text-white">Your Checkout Cart is Empty</h1>
          <p className="text-xs text-gray-400 leading-relaxed">
            Select a service or package first to proceed to checkout.
          </p>
          <Link
            href="/categories"
            className="w-full py-3 rounded-full bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white font-bold text-xs flex items-center justify-center gap-2"
          >
            <span>Explore Services</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#07070d] text-white flex flex-col items-center pb-14">
      <div className="w-full max-w-xl min-h-screen flex flex-col bg-[#07070d] relative">
        {/* Checkout Header */}
        <header className="sticky top-0 z-40 bg-[#090915]/95 backdrop-blur-xl border-b border-purple-500/15 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {step !== 3 && (
              <button
                type="button"
                onClick={() => (step === 2 ? setStep(1) : router.back())}
                aria-label="Go Back"
                className="w-9 h-9 rounded-full bg-[#14152c] border border-purple-500/20 flex items-center justify-center text-gray-300 hover:text-white transition-all cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div>
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-extrabold tracking-tight text-white">
                  Taliyo Verified Pay
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
                <Lock className="w-2.5 h-2.5 text-purple-400" />
                <span>256-bit Encrypted • Ref #{orderRef}</span>
              </div>
            </div>
          </div>

          {step === 2 ? (
            secondsLeft > 0 ? (
              <div className="px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-400/30 text-amber-300 text-[11px] font-mono font-bold flex items-center gap-1.5">
                <Clock className="w-3 h-3 animate-pulse" />
                <span>{formatTimer(secondsLeft)}</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setSecondsLeft(600)}
                className="px-2.5 py-1 rounded-full bg-rose-500/20 border border-rose-400/40 text-rose-300 hover:text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer"
              >
                <Clock className="w-3 h-3" />
                <span>Session Expired • Tap to Refresh</span>
              </button>
            )
          ) : step === 1 ? (
            <div className="px-2.5 py-1 rounded-full bg-purple-900/30 border border-purple-500/30 text-purple-200 text-[10px] font-bold">
              Step 1 of 2
            </div>
          ) : (
            <div className="px-2.5 py-1 rounded-full bg-emerald-950/50 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold">
              Confirmed
            </div>
          )}
        </header>

        {/* STEP 1: Order Review, Contact Details & Promo Coupon */}
        {step === 1 && (
          <form onSubmit={handleContinueToPayment} className="flex-1 px-4 pt-4 space-y-4">
            {/* Order Summary Card */}
            <div className="rounded-3xl bg-[#101126] border border-purple-500/25 p-4 space-y-3 shadow-lg">
              <div className="flex items-center justify-between border-b border-purple-500/15 pb-2.5 gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-purple-300">
                  Order Summary ({items.length} {items.length === 1 ? 'Item' : 'Items'})
                </span>
                <div className="flex items-center gap-2">
                  <div className="flex items-center rounded-full bg-[#171936] border border-purple-500/25 p-0.5 text-[10px] font-bold">
                    <button
                      type="button"
                      onClick={() => handleCurrencyChange('INR')}
                      className={`px-2 py-0.5 rounded-full transition-all cursor-pointer ${
                        currency === 'INR' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      ₹ INR
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCurrencyChange('USD')}
                      className={`px-2 py-0.5 rounded-full transition-all cursor-pointer ${
                        currency === 'USD' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      $ USD
                    </button>
                  </div>
                  <span className="text-[11px] text-emerald-400 font-semibold hidden sm:inline">0% Fee</span>
                </div>
              </div>

              <div className="space-y-2.5">
                {items.map((item) => {
                  const lineInr = (item.price || 0) * (item.quantity || 1);
                  const unitUsd =
                    item.usdPrice && item.usdPrice > 0
                      ? item.usdPrice
                      : item.price > 0
                        ? Math.max(19, Math.round(item.price / 83))
                        : 0;
                  const lineUsd = unitUsd * (item.quantity || 1);
                  return (
                    <div key={item.id} className="flex items-start justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <p className="font-bold text-white truncate">{item.title}</p>
                        <p className="text-[11px] text-gray-400">
                          {item.packageName || 'Standard Plan'} • Qty {item.quantity || 1}
                          {typeof item.deliveryDays === 'number' && (
                            <> • {item.deliveryDays === 0 ? 'Instant Digital' : `${item.deliveryDays} Days`}</>
                          )}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-bold text-white block">
                          {currency === 'USD' ? `$${lineUsd.toLocaleString('en-US')} USD` : `₹${lineInr.toLocaleString('en-IN')}`}
                        </span>
                        {currency === 'USD' && lineInr > 0 && (
                          <span className="text-[10px] text-gray-400">₹{lineInr.toLocaleString('en-IN')}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pt-2.5 border-t border-purple-500/15 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-gray-300 block">Payable Total</span>
                  {currency === 'USD' && (
                    <span className="text-[10px] text-gray-400 block">
                      UPI / NEFT settles in ₹{finalPayable.toLocaleString('en-IN')} INR
                    </span>
                  )}
                </div>
                {appliedCoupon ? (
                  <div className="text-right">
                    <span className="text-xs text-gray-500 line-through mr-2">
                      ₹{subtotal.toLocaleString('en-IN')}
                    </span>
                    <span className="text-lg font-black text-emerald-400">
                      ₹{finalPayable.toLocaleString('en-IN')}
                    </span>
                  </div>
                ) : (
                  <div className="text-right">
                    <span className="text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-300 to-white">
                      {currency === 'USD'
                        ? `$${usdSubtotal.toLocaleString('en-US')} USD`
                        : `₹${subtotal.toLocaleString('en-IN')}`}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Promo / Coupon Code */}
            <div className="rounded-3xl bg-[#101126] border border-purple-500/20 p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-300 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-fuchsia-400" />
                  Promo / Coupon Code
                </span>
                {appliedCoupon && (
                  <button
                    type="button"
                    onClick={() => {
                      setAppliedCoupon(null);
                      setCouponInput('');
                      setCouponError(null);
                    }}
                    className="text-[11px] font-bold text-rose-400 hover:text-rose-300 cursor-pointer"
                  >
                    Remove
                  </button>
                )}
              </div>

              {appliedCoupon ? (
                <div className="flex items-center justify-between p-3 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div>
                      <span className="font-mono font-bold text-emerald-200">{appliedCoupon.code}</span>
                      <span className="text-[10px] text-emerald-400/80 block">{appliedCoupon.message}</span>
                    </div>
                  </div>
                  <span className="font-extrabold text-sm">
                    - ₹{appliedCoupon.discountAmount.toLocaleString('en-IN')}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Enter code (e.g. WELCOME10)"
                    value={couponInput}
                    onChange={(e) => {
                      setCouponInput(e.target.value.toUpperCase());
                      setCouponError(null);
                    }}
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#171936] border border-purple-500/25 text-white placeholder-gray-500 text-xs font-mono font-bold uppercase focus:outline-none focus:border-purple-400"
                  />
                  <button
                    type="button"
                    onClick={handleApplyCoupon}
                    disabled={isValidatingCoupon || !couponInput.trim()}
                    className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shrink-0"
                  >
                    {isValidatingCoupon ? 'Checking...' : 'Apply'}
                  </button>
                </div>
              )}

              {couponError && <p className="text-[11px] text-rose-400 font-medium">{couponError}</p>}

              {!appliedCoupon && availableCoupons.length > 0 && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setShowCouponsList((prev) => !prev)}
                    className="text-[11px] font-bold text-fuchsia-400 hover:text-fuchsia-300 cursor-pointer"
                  >
                    {showCouponsList ? 'Hide Available Coupons ↑' : `View Available Coupons (${availableCoupons.length}) →`}
                  </button>
                  {showCouponsList && (
                    <div className="mt-2 space-y-1.5">
                      {availableCoupons.map((c) => (
                        <div
                          key={c.code}
                          className="p-2.5 rounded-xl bg-[#171936] border border-purple-500/20 flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0">
                            <span className="font-mono font-bold text-purple-200 block">{c.code}</span>
                            <span className="text-[10px] text-gray-400 block truncate">
                              {c.description ||
                                (c.discount_type === 'percentage'
                                  ? `${c.discount_value}% OFF`
                                  : `₹${c.discount_value} OFF`)}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setCouponInput(c.code);
                              setCouponError(null);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-purple-600/30 border border-purple-400/40 text-purple-200 hover:text-white text-[10px] font-bold shrink-0 cursor-pointer"
                          >
                            Use Code
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Client Contact Details */}
            <div className="rounded-3xl bg-[#101126] border border-purple-500/20 p-4 space-y-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-300 block">
                Client Contact & Delivery Info
              </span>

              <input
                type="text"
                required
                placeholder="Your Full Name *"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#171936] border border-purple-500/25 text-white placeholder-gray-500 text-xs focus:outline-none focus:border-purple-400"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="email"
                  required
                  placeholder="Email Address *"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#171936] border border-purple-500/25 text-white placeholder-gray-500 text-xs focus:outline-none focus:border-purple-400"
                />
                <input
                  type="tel"
                  required
                  placeholder="WhatsApp Number *"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#171936] border border-purple-500/25 text-white placeholder-gray-500 text-xs focus:outline-none focus:border-purple-400"
                />
              </div>

              <textarea
                rows={2}
                placeholder="Project notes or delivery instructions (optional)..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-[#171936] border border-purple-500/25 text-white placeholder-gray-500 text-xs focus:outline-none focus:border-purple-400 resize-none"
              />

              {step1Error && <p className="text-xs text-rose-400 font-semibold">{step1Error}</p>}
            </div>

            {authReady && !authUser && (
              <div className="rounded-3xl bg-[#150f30] border border-fuchsia-500/35 p-4 flex items-center justify-between gap-3 shadow-lg">
                <div className="min-w-0">
                  <p className="text-xs font-extrabold text-white flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-fuchsia-400 shrink-0" />
                    <span>Sign in before payment</span>
                  </p>
                  <p className="text-[11px] text-purple-200/75 mt-0.5 leading-snug">
                    Your cart &amp; coupon stay saved. Sign in to link this order to your account.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => redirectToLoginForPayment(false)}
                  className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white text-[11px] font-extrabold shrink-0 hover:opacity-95 transition-all cursor-pointer"
                >
                  Sign In
                </button>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3.5 rounded-full bg-gradient-to-r from-purple-600 via-fuchsia-600 to-pink-500 text-white font-extrabold text-sm shadow-[0_0_25px_rgba(217,70,239,0.45)] hover:opacity-95 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>
                {authReady && !authUser
                  ? `Sign In & Continue to Payment (₹${finalPayable.toLocaleString('en-IN')})`
                  : `Continue to Payment (₹${finalPayable.toLocaleString('en-IN')})`}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* STEP 2: Dedicated Cardless Payment Gateway Interface */}
        {step === 2 && (
          <div className="flex-1 px-4 pt-4 space-y-4">
            {/* Compact Amount & Edit Banner */}
            <div className="rounded-2xl bg-[#12132b] border border-purple-500/25 px-4 py-3 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-gray-400 uppercase font-semibold block">
                  {finalPayable === 0
                    ? 'Custom Quote Request'
                    : paymentMethod === 'advance'
                    ? `${gateway.advancePercent || 30}% Advance Due Now`
                    : 'Exact Amount Locked'}
                </span>
                <span className="text-xl font-black text-white">
                  {finalPayable === 0
                    ? 'Custom Quote (₹0 Due Now)'
                    : `₹${payableNow.toLocaleString('en-IN')}`}
                </span>
                {currency === 'USD' && finalPayable > 0 && (
                  <span className="text-[10px] text-purple-300 font-semibold block">
                    Approx. ${usdPayableApprox.toLocaleString('en-US')} USD
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-3 py-1.5 rounded-full bg-[#1c1e42] border border-purple-500/30 text-purple-200 text-[11px] font-bold flex items-center gap-1 hover:text-white cursor-pointer"
              >
                <Edit3 className="w-3 h-3" />
                <span>Edit Info</span>
              </button>
            </div>

            {finalPayable === 0 ? (
              <div className="rounded-3xl bg-[#101126] border border-purple-500/30 p-5 text-center space-y-3 shadow-xl">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-400/30 text-emerald-300 text-[11px] font-bold">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>No Advance Payment Required</span>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed">
                  {appliedCoupon
                    ? 'Your coupon covers 100% of this order subtotal. Submit below to lock your booking immediately.'
                    : 'This item is priced as a Custom Quote. Submit your booking request below and our team will share a detailed proposal on WhatsApp.'}
                </p>
              </div>
            ) : (
            <>
            {/* Cardless Payment Tabs */}
            <div className="grid grid-cols-3 gap-1.5 p-1.5 rounded-2xl bg-[#111226] border border-purple-500/20">
              <button
                type="button"
                onClick={() => {
                  setPaymentMethod('upi');
                  setSubmitError(null);
                  setUtrCheck(null);
                }}
                className={`py-2.5 px-2 rounded-xl text-xs font-bold flex flex-col items-center gap-1 transition-all cursor-pointer ${
                  paymentMethod === 'upi'
                    ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-md'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <QrCode className="w-4 h-4" />
                <span>UPI QR</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPaymentMethod('advance');
                  setSubmitError(null);
                  setUtrCheck(null);
                }}
                className={`py-2.5 px-2 rounded-xl text-xs font-bold flex flex-col items-center gap-1 transition-all cursor-pointer ${
                  paymentMethod === 'advance'
                    ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-md'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Clock className="w-4 h-4" />
                <span>{gateway.advancePercent || 30}% Adv</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPaymentMethod('bank');
                  setSubmitError(null);
                  setUtrCheck(null);
                }}
                className={`py-2.5 px-2 rounded-xl text-xs font-bold flex flex-col items-center gap-1 transition-all cursor-pointer ${
                  paymentMethod === 'bank'
                    ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-md'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Building2 className="w-4 h-4" />
                <span>Bank NEFT</span>
              </button>
            </div>

            {/* UPI QR & 30% Advance UPI Interface */}
            {(paymentMethod === 'upi' || paymentMethod === 'advance') && (
              <div className="rounded-3xl bg-[#101126] border border-purple-500/30 p-5 flex flex-col items-center text-center space-y-4 shadow-xl">
                {paymentMethod === 'advance' && (
                  <div className="w-full p-2.5 rounded-xl bg-amber-500/10 border border-amber-400/25 text-amber-200 text-[11px] font-medium">
                    Pay {gateway.advancePercent || 30}% (₹{payableNow.toLocaleString('en-IN')}) now to kick off work; remaining {100 - (gateway.advancePercent || 30)}% on milestones.
                  </div>
                )}

                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-400/30 text-emerald-300 text-[11px] font-bold">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>{gateway.merchantType} • 0% Fee</span>
                </div>

                {/* Elevated Scanner Frame */}
                <div className="relative p-3 rounded-3xl bg-white shadow-[0_0_40px_rgba(168,85,247,0.22)]">
                  {/* Scanner Corner Brackets */}
                  <span className="absolute -top-1 -left-1 w-5 h-5 border-t-[3px] border-l-[3px] border-fuchsia-500 rounded-tl-xl" />
                  <span className="absolute -top-1 -right-1 w-5 h-5 border-t-[3px] border-r-[3px] border-fuchsia-500 rounded-tr-xl" />
                  <span className="absolute -bottom-1 -left-1 w-5 h-5 border-b-[3px] border-l-[3px] border-fuchsia-500 rounded-bl-xl" />
                  <span className="absolute -bottom-1 -right-1 w-5 h-5 border-b-[3px] border-r-[3px] border-fuchsia-500 rounded-br-xl" />

                  <div className="w-48 h-48 flex items-center justify-center">
                    {qrDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={qrDataUrl}
                        alt="Paytm Merchant UPI QR Code"
                        className="w-full h-full object-contain rounded-xl"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-slate-400">
                        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
                        <span className="text-[10px] font-bold">Generating QR...</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Supported Apps Strip */}
                <div className="flex items-center justify-center gap-2 flex-wrap text-[10px] font-bold text-gray-300">
                  <span className="px-2.5 py-1 rounded-lg bg-[#181936] border border-purple-500/20">GPay</span>
                  <span className="px-2.5 py-1 rounded-lg bg-[#181936] border border-purple-500/20">PhonePe</span>
                  <span className="px-2.5 py-1 rounded-lg bg-[#181936] border border-purple-500/20">Paytm</span>
                  <span className="px-2.5 py-1 rounded-lg bg-[#181936] border border-purple-500/20">BHIM</span>
                </div>

                {/* Primary Actions: 1-Tap Pay & Save QR */}
                <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <a
                    href={upiUri}
                    className="py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-extrabold flex items-center justify-center gap-2 shadow-lg transition-all"
                  >
                    <Smartphone className="w-4 h-4" />
                    <span>Open UPI App</span>
                  </a>

                  {qrDataUrl && (
                    <a
                      href={qrDataUrl}
                      download={`taliyo-pay-${orderRef}.png`}
                      className="py-3 px-4 rounded-xl bg-[#181a38] hover:bg-[#21244d] border border-purple-500/30 text-purple-100 text-xs font-bold flex items-center justify-center gap-2 transition-all"
                    >
                      <Download className="w-4 h-4 text-fuchsia-400" />
                      <span>Save QR Image</span>
                    </a>
                  )}
                </div>

                {/* Copyable Verified Merchant VPA */}
                <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#171936] border border-purple-500/25">
                  <span className="text-[11px] text-gray-400">UPI ID:</span>
                  <span className="text-xs font-mono font-bold text-purple-200">
                    {gateway.displayId}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(gateway.upiId, setCopiedUpi)}
                    aria-label="Copy UPI ID"
                    className="text-fuchsia-400 hover:text-fuchsia-300 cursor-pointer"
                  >
                    {copiedUpi ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {/* 12-Digit UTR Verification Input */}
                <div className="w-full pt-2 border-t border-purple-500/15 space-y-2 text-left">
                  <div className="flex items-center justify-between">
                    <label htmlFor="checkout-utr" className="text-xs font-bold text-white">
                      Enter 12-Digit UTR / Ref ID
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowUtrHelp(!showUtrHelp)}
                      className="text-[11px] text-purple-300 hover:text-white font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                      <span>Where to find?</span>
                    </button>
                  </div>

                  {showUtrHelp && (
                    <div className="p-3 rounded-xl bg-[#171936] border border-purple-500/25 text-[11px] text-gray-300 leading-relaxed">
                      After completing your payment on GPay, PhonePe, Paytm or BHIM, copy the 12-digit <strong>&quot;UPI Ref No / UTR&quot;</strong> from the payment receipt and enter it below (e.g. <code className="text-purple-200">402319876543</code>).
                    </div>
                  )}

                  <input
                    id="checkout-utr"
                    type="text"
                    inputMode="numeric"
                    maxLength={12}
                    placeholder="e.g. 402319876543 (12 digits)"
                    value={utr}
                    onChange={(e) => {
                      setUtr(e.target.value.replace(/\D/g, '').slice(0, 12));
                      setSubmitError(null);
                    }}
                    className={`w-full px-3.5 py-3 rounded-xl bg-[#171936] border text-white placeholder-gray-500 text-sm font-mono tracking-wider focus:outline-none transition-all ${
                      utrCheck?.duplicate || utrCheck?.valid === false
                        ? 'border-rose-500/60 focus:border-rose-400'
                        : isUtrTwelveDigits
                          ? 'border-emerald-500/60 focus:border-emerald-400'
                          : 'border-purple-500/25 focus:border-purple-400'
                    }`}
                  />

                  {isCheckingUtr && (
                    <p className="text-[11px] text-purple-300 font-semibold flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking UTR against settlement pool...
                    </p>
                  )}

                  {!isCheckingUtr && isUtrTwelveDigits && utrCheck && (
                    <p
                      className={`text-[11px] font-semibold flex items-center gap-1.5 ${
                        utrCheck.duplicate || utrCheck.valid === false
                          ? 'text-rose-400'
                          : utrCheck.poolMatched
                            ? 'text-emerald-300'
                            : 'text-emerald-400'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>{utrCheck.message}</span>
                    </p>
                  )}

                  {!isCheckingUtr && isUtrTwelveDigits && !utrCheck && (
                    <p className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Valid 12-digit UTR format verified
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Bank Transfer Option */}
            {paymentMethod === 'bank' && (
              <div className="rounded-3xl bg-[#101126] border border-purple-500/30 p-5 space-y-3 text-xs">
                <div className="flex items-center justify-between pb-1">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-400/30 text-emerald-300 text-[10px] font-bold">
                    <ShieldCheck className="w-3 h-3" />
                    <span>IMPS / NEFT / RTGS • Auto-Verification</span>
                  </span>
                </div>

                <div className="flex justify-between items-center py-1.5 border-b border-purple-500/10">
                  <span className="text-gray-400">Bank Name</span>
                  <span className="font-bold text-white">{gateway.bankName}</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-purple-500/10">
                  <span className="text-gray-400">Account Name</span>
                  <span className="font-bold text-white">{gateway.accountName}</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-purple-500/10">
                  <span className="text-gray-400">Account Number</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-purple-200">{gateway.accountNumber}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(gateway.accountNumber, setCopiedAcc)}
                      aria-label="Copy Account Number"
                      className="text-fuchsia-400 cursor-pointer"
                    >
                      {copiedAcc ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-purple-500/10">
                  <span className="text-gray-400">IFSC Code</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-white">{gateway.ifsc}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(gateway.ifsc, setCopiedIfsc)}
                      aria-label="Copy IFSC Code"
                      className="text-fuchsia-400 cursor-pointer"
                    >
                      {copiedIfsc ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="pt-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <label htmlFor="bank-utr" className="text-xs font-bold text-white block">
                      NEFT / IMPS / RTGS Reference Number
                    </label>
                    <span className="text-[10px] text-gray-400">8–22 chars</span>
                  </div>
                  <input
                    id="bank-utr"
                    type="text"
                    maxLength={22}
                    placeholder="e.g. HDFC261116987654"
                    value={utr}
                    onChange={(e) => {
                      setUtr(e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 22));
                      setSubmitError(null);
                    }}
                    className={`w-full px-3.5 py-2.5 rounded-xl bg-[#171936] border text-white placeholder-gray-500 text-xs font-mono tracking-wider focus:outline-none transition-all ${
                      utrCheck?.duplicate || utrCheck?.valid === false
                        ? 'border-rose-500/60 focus:border-rose-400'
                        : isBankRefValid
                          ? 'border-emerald-500/60 focus:border-emerald-400'
                          : 'border-purple-500/25 focus:border-purple-400'
                    }`}
                  />

                  {isCheckingUtr && (
                    <p className="text-[11px] text-purple-300 font-semibold flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking reference against settlement pool...
                    </p>
                  )}

                  {!isCheckingUtr && isBankRefValid && utrCheck && (
                    <p
                      className={`text-[11px] font-semibold flex items-center gap-1.5 ${
                        utrCheck.duplicate || utrCheck.valid === false
                          ? 'text-rose-400'
                          : utrCheck.poolMatched
                            ? 'text-emerald-300'
                            : 'text-emerald-400'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>{utrCheck.message}</span>
                    </p>
                  )}
                </div>
              </div>
            )}
            </>
            )}

            {submitError && (
              <div className="p-3 rounded-2xl bg-rose-950/50 border border-rose-500/40 text-xs text-rose-300 font-medium text-center">
                {submitError}
              </div>
            )}

            <button
              type="button"
              onClick={handleConfirmPayment}
              disabled={isSubmitting}
              className="w-full py-3.5 rounded-full bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 text-slate-950 font-black text-sm shadow-[0_0_25px_rgba(16,185,129,0.4)] hover:opacity-95 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{finalPayable === 0 ? 'Submitting Order Request...' : 'Submitting Payment Verification...'}</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {finalPayable === 0
                      ? 'Submit Quote Order Request (₹0 Payable Now)'
                      : `I Have Paid • Confirm Order (₹${payableNow.toLocaleString('en-IN')})`}
                  </span>
                </>
              )}
            </button>
          </div>
        )}

        {/* STEP 3: Payment Submitted & Confirmed Receipt */}
        {step === 3 && (
          <div className="flex-1 px-4 pt-10 flex flex-col items-center text-center space-y-5">
            <div className="w-20 h-20 rounded-full bg-emerald-500/15 border-2 border-emerald-400/50 flex items-center justify-center text-emerald-400 shadow-[0_0_40px_rgba(16,185,129,0.25)]">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div className="space-y-1.5">
              <h1 className="text-xl font-black text-white">
                {autoVerifiedResult?.verified
                  ? 'Payment Auto-Verified & Confirmed!'
                  : 'Order Submitted Successfully!'}
              </h1>
              <p className="text-xs text-gray-400 max-w-xs mx-auto leading-relaxed">
                {autoVerifiedResult?.verified
                  ? `Your UTR (${utr.trim()}) matched our settlement records — your project booking is now confirmed.`
                  : 'Your payment verification request and order details have been saved. Our team will verify and start your project shortly.'}
              </p>
            </div>

            <div className="w-full rounded-3xl bg-[#101126] border border-purple-500/25 p-4 space-y-2.5 text-xs text-left">
              <div className="flex justify-between">
                <span className="text-gray-400">Verification Status</span>
                {autoVerifiedResult?.verified ? (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 font-bold text-[11px]">
                    Auto-Verified
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-400/30 text-amber-300 font-bold text-[11px]">
                    Pending Verification
                  </span>
                )}
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Reference ID</span>
                <span className="font-mono font-bold text-white">{orderRef}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Amount Submitted</span>
                <span className="font-bold text-emerald-400">₹{payableNow.toLocaleString('en-IN')}</span>
              </div>
              {utr.trim() && (
                <div className="flex justify-between">
                  <span className="text-gray-400">UTR / Ref ID</span>
                  <span className="font-mono font-bold text-purple-200">{utr.trim()}</span>
                </div>
              )}
              {appliedCoupon && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Coupon Applied</span>
                  <span className="font-mono font-bold text-emerald-300">{appliedCoupon.code}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-400">Merchant Destination</span>
                <span className="font-mono text-gray-200">{gateway.displayId}</span>
              </div>
            </div>

            <div className="w-full space-y-2.5 pt-2">
              <button
                type="button"
                onClick={() => router.push(placedOrderId ? `/orders/${placedOrderId}` : '/orders')}
                className="w-full py-3.5 rounded-full bg-gradient-to-r from-purple-600 via-fuchsia-600 to-pink-500 text-white font-extrabold text-sm shadow-lg flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Track My Order Live</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <Link
                href="/"
                className="w-full py-3 rounded-full bg-[#151733] border border-purple-500/20 text-gray-300 hover:text-white font-bold text-xs flex items-center justify-center"
              >
                Back to Marketplace
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
