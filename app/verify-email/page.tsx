'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Mail,
  RotateCcw,
  CheckCircle2,
  ExternalLink,
  Headphones,
  Home,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

export default function VerifyEmailPage() {
  const router = useRouter();

  const [email, setEmail] = useState('your registered email');
  const [countdown, setCountdown] = useState(45);
  const [isResending, setIsResending] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    async function resolveEmail() {
      if (typeof window !== 'undefined') {
        const sp = new URLSearchParams(window.location.search);
        const e = sp.get('email');
        if (e) {
          setEmail(e);
          return;
        }
      }
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email) setEmail(user.email);
      } catch {}
    }
    resolveEmail();
  }, []);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleResend = async () => {
    if (countdown > 0 || isResending || !email || email === 'your registered email') {
      if (!email || email === 'your registered email') {
        showToast('No email address detected. Please log in or sign up again.');
      }
      return;
    }
    setIsResending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
      });
      if (error) throw error;
      showToast(`Verification link resent to ${email}`);
      setCountdown(60);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not resend verification email.';
      showToast(msg);
    } finally {
      setIsResending(false);
    }
  };

  const handleOpenEmail = () => {
    const domain = email.includes('@') ? email.split('@')[1]?.toLowerCase() : '';
    let inboxUrl = 'https://mail.google.com';
    if (domain?.includes('outlook') || domain?.includes('hotmail') || domain?.includes('live')) {
      inboxUrl = 'https://outlook.live.com/mail/';
    } else if (domain?.includes('yahoo')) {
      inboxUrl = 'https://mail.yahoo.com';
    }
    showToast('Opening your email inbox...');
    window.open(inboxUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="min-h-screen bg-[#07070d] text-white flex flex-col justify-between relative px-4 py-6">
      {/* Light Glassmorphic Toast Notification */}
      {toastMsg && (
        <div className="fixed top-16 inset-x-0 z-50 flex justify-center px-4 animate-in fade-in slide-in-from-top-3 duration-250 pointer-events-none">
          <div className="bg-[#0b0d1e]/80 backdrop-blur-xl border border-emerald-500/20 text-emerald-200 text-xs font-medium px-3.5 py-1.5 rounded-full shadow-[0_4px_20px_rgba(0,0,0,0.5),0_0_10px_rgba(16,185,129,0.1)] flex items-center gap-2 pointer-events-auto transition-all">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="leading-tight">{toastMsg}</span>
          </div>
        </div>
      )}

      {/* Top Header */}
      <div className="max-w-md w-full mx-auto flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Go Back"
          className="w-10 h-10 rounded-full bg-[#121429] border border-purple-500/20 flex items-center justify-center text-gray-300 hover:text-white hover:border-purple-500/40 hover:bg-[#1a1d3d] transition-all shadow-sm cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <Link
          href="/"
          className="text-xs font-semibold text-gray-400 hover:text-white transition-colors"
        >
          Skip to Home
        </Link>
      </div>

      {/* Center Content Card */}
      <div className="max-w-md w-full mx-auto flex flex-col items-center text-center gap-6 my-auto pt-4 pb-6">
        {/* Brand Header */}
        <div className="flex flex-col items-center">
          <div className="relative flex items-center justify-center w-14 h-14 rounded-3xl bg-gradient-to-br from-purple-600 via-fuchsia-600 to-pink-500 shadow-xl shadow-purple-900/40 p-0.5 mb-3">
            <div className="w-full h-full bg-white rounded-[22px] overflow-hidden flex items-center justify-center">
              <Image
                src="/icons/icon-192.png"
                alt="Taliyo Marketplace"
                width={56}
                height={56}
                className="w-full h-full object-cover scale-110"
                priority
              />
            </div>
          </div>

          <h1 className="text-2xl font-black text-white tracking-tight">
            Taliyo Marketplace
          </h1>
          <p className="text-xs text-gray-400 tracking-wider uppercase font-semibold mt-1">
            Digital Services &amp; Systems Marketplace
          </p>
        </div>

        {/* Verification Card */}
        <div className="w-full relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#160b33]/90 via-[#100a26]/90 to-[#0c0d1e]/90 border border-purple-500/25 p-6 sm:p-7 shadow-[0_12px_36px_rgba(0,0,0,0.55)] flex flex-col items-center text-center gap-4">
          {/* Animated Mail Icon with Glowing Halo */}
          <div className="relative my-2">
            <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-purple-600 to-fuchsia-500 blur-2xl opacity-40 animate-pulse" />
            <div className="relative w-20 h-20 rounded-3xl bg-[#1b1038] border border-purple-500/30 flex items-center justify-center text-fuchsia-400 shadow-xl shadow-purple-900/50">
              <Mail className="w-10 h-10" />
            </div>
          </div>

          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              Verify Your Email
            </h2>
            <p className="text-xs text-gray-300/85 mt-2 max-w-xs mx-auto leading-relaxed">
              We&apos;ve sent a verification link to your email address:
            </p>
            <div className="inline-block mt-2 px-3 py-1 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300 font-mono text-xs font-semibold">
              {email}
            </div>
            <p className="text-[11px] text-gray-400 mt-2 max-w-xs mx-auto leading-relaxed">
              Please check your inbox and click the link to verify your account.
            </p>
          </div>

          {/* Open Email Button */}
          <button
            type="button"
            onClick={handleOpenEmail}
            className="w-full mt-2 py-3 rounded-xl bg-gradient-to-r from-purple-600 via-fuchsia-600 to-pink-500 text-white text-xs font-bold shadow-lg shadow-fuchsia-600/30 hover:opacity-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <ExternalLink className="w-4 h-4" />
            <span>Open Email App</span>
          </button>

          {/* Resend Subcard */}
          <div className="w-full mt-2 pt-4 border-t border-purple-500/15 flex flex-col items-center gap-2">
            <p className="text-xs font-semibold text-gray-300">
              Didn&apos;t receive the email?
            </p>
            <p className="text-[11px] text-gray-400 max-w-xs">
              Check your spam folder or request a new verification link.
            </p>

            <button
              type="button"
              onClick={handleResend}
              disabled={countdown > 0 || isResending}
              className={`mt-1 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                countdown > 0
                  ? 'bg-[#14162e] text-gray-500 border border-purple-500/10 cursor-not-allowed'
                  : 'bg-purple-600/25 border border-purple-500/40 text-purple-200 hover:bg-purple-600/40'
              }`}
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isResending ? 'animate-spin' : ''}`} />
              <span>
                {countdown > 0 ? `Resend Email (${countdown}s)` : 'Resend Email'}
              </span>
            </button>
          </div>
        </div>

        {/* Go to Home Button */}
        <Link
          href="/"
          className="w-full py-3 rounded-2xl bg-[#121429] border border-purple-500/20 text-gray-300 text-xs font-semibold hover:text-white hover:border-purple-500/40 hover:bg-[#181a33] transition-all flex items-center justify-center gap-2 shadow-sm"
        >
          <Home className="w-4 h-4" />
          <span>Go to Home</span>
        </Link>
      </div>

      {/* Support Footer */}
      <div className="max-w-md w-full mx-auto text-center text-xs text-gray-400 flex items-center justify-center gap-1.5">
        <span>Need help?</span>
        <Link
          href="/support"
          className="text-fuchsia-400 hover:text-fuchsia-300 font-semibold flex items-center gap-1"
        >
          <Headphones className="w-3.5 h-3.5" />
          <span>Contact Support</span>
        </Link>
      </div>
    </div>
  );
}
