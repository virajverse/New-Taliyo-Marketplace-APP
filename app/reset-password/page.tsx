'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Mail,
  Send,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Lock,
  LogIn,
  KeyRound,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

export default function ResetPasswordPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'error'>('success');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get('mode') === 'update' || window.location.hash.includes('type=recovery')) {
        setIsRecoveryMode(true);
      }
    }
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecoveryMode(true);
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToastType(type);
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const handleSendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?type=recovery&next=/reset-password?mode=update`,
      });
      if (error) throw error;
      setIsSubmitted(true);
      showToast(`Password reset link sent to ${email}`, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send reset link';
      showToast(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      showToast('Password must be at least 6 characters long.', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('Passwords do not match.', 'error');
      return;
    }
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      showToast('Password updated successfully! Redirecting...', 'success');
      setTimeout(() => router.replace('/profile'), 1000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update password';
      showToast(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070510] text-white flex flex-col justify-between items-center relative overflow-hidden px-4 py-6 selection:bg-purple-500 selection:text-white">
      {/* Light Glassmorphic Toast Notification */}
      {toastMsg && (
        <div className="fixed top-16 inset-x-0 z-50 flex justify-center px-4 animate-in fade-in slide-in-from-top-3 duration-250 pointer-events-none">
          <div
            className={`bg-[#0b0d1e]/90 backdrop-blur-xl text-xs font-medium px-3.5 py-2 rounded-full shadow-lg flex items-center gap-2 pointer-events-auto transition-all border ${
              toastType === 'error'
                ? 'border-rose-500/40 text-rose-200'
                : 'border-emerald-500/30 text-emerald-200'
            }`}
          >
            {toastType === 'error' ? (
              <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            )}
            <span className="leading-tight">{toastMsg}</span>
          </div>
        </div>
      )}

      {/* Top Header Bar */}
      <div className="w-full max-w-sm flex items-center justify-between z-10">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Go Back"
          className="w-10 h-10 rounded-full bg-[#120c29]/90 border border-purple-500/25 flex items-center justify-center text-gray-300 hover:text-white hover:border-purple-400 hover:bg-[#1b123d] transition-all shadow-sm cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="w-10 h-10" />
      </div>

      {/* Central Content Column */}
      <div className="w-full max-w-sm flex flex-col items-center gap-5 my-auto py-2 z-10">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center">
          <div className="relative mb-3 w-14 h-14 rounded-2xl overflow-hidden border border-purple-400/30 shadow-lg shadow-purple-950/60">
            <Image
              src="/icons/icon-192.png"
              alt="Taliyo Marketplace"
              width={56}
              height={56}
              className="w-full h-full object-cover scale-110"
              priority
            />
          </div>

          <h1 className="text-2xl font-black text-white tracking-tight">
            Taliyo Marketplace
          </h1>
          <p className="text-[11px] font-semibold text-purple-200/70 tracking-wider uppercase mt-1">
            Digital Services &amp; Systems Marketplace
          </p>
        </div>

        {/* Form Glass Card */}
        <div className="w-full rounded-[32px] bg-gradient-to-b from-[#160c33]/90 to-[#0e0724]/90 border border-purple-500/35 p-6 sm:p-7 shadow-[0_16px_45px_rgba(0,0,0,0.65)] backdrop-blur-xl flex flex-col items-center text-center gap-4 relative overflow-hidden">
          <div className="w-14 h-14 rounded-2xl bg-[#1d113d] border border-purple-400/30 flex items-center justify-center text-fuchsia-300 shadow-inner">
            <KeyRound className="w-7 h-7" />
          </div>

          <div>
            <h2 className="text-xl font-extrabold text-white tracking-tight">
              {isRecoveryMode ? 'Set New Password' : 'Reset Password'}
            </h2>
            <p className="text-xs text-purple-200/80 mt-1.5 leading-relaxed max-w-xs mx-auto">
              {isRecoveryMode
                ? 'Enter and confirm your new password below to secure your account.'
                : "Enter your email address and we'll send you a link to create a new password."}
            </p>
          </div>

          {isRecoveryMode ? (
            <form onSubmit={handleUpdatePassword} className="w-full flex flex-col gap-3.5 mt-1 text-left">
              <div className="relative w-full">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-purple-300">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New password (min. 6 characters)"
                  className="w-full pl-10 pr-4 py-3 rounded-2xl bg-[#14122e]/85 border border-purple-500/30 text-white placeholder:text-gray-400 text-xs sm:text-sm focus:outline-none focus:border-purple-400"
                  required
                />
              </div>
              <div className="relative w-full">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-purple-300">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="w-full pl-10 pr-4 py-3 rounded-2xl bg-[#14122e]/85 border border-purple-500/30 text-white placeholder:text-gray-400 text-xs sm:text-sm focus:outline-none focus:border-purple-400"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 rounded-full bg-gradient-to-r from-[#8324e9] via-[#9e27ee] to-[#bd2ef3] text-white text-xs sm:text-sm font-bold shadow-[0_0_25px_rgba(168,85,247,0.45)] hover:opacity-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70"
              >
                <span>{isLoading ? 'Updating Password...' : 'Save New Password'}</span>
              </button>
            </form>
          ) : !isSubmitted ? (
            <form onSubmit={handleSendLink} className="w-full flex flex-col gap-3.5 mt-1">
              <div className="relative w-full">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-purple-300">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email address"
                  className="w-full pl-10 pr-4 py-3 rounded-2xl bg-[#14122e]/85 border border-purple-500/30 text-white placeholder:text-gray-400 text-xs sm:text-sm focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400/50 transition-all shadow-inner"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 rounded-full bg-gradient-to-r from-[#8324e9] via-[#9e27ee] to-[#bd2ef3] text-white text-xs sm:text-sm font-bold shadow-[0_0_25px_rgba(168,85,247,0.45)] hover:shadow-[0_0_35px_rgba(168,85,247,0.65)] hover:scale-[1.01] active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70"
              >
                <Send className="w-4 h-4 -rotate-12" />
                <span>{isLoading ? 'Sending...' : 'Send Reset Link'}</span>
              </button>
            </form>
          ) : (
            <div className="w-full p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex flex-col items-center gap-2 mt-1">
              <CheckCircle2 className="w-7 h-7 text-emerald-400" />
              <p className="text-xs font-semibold text-emerald-300">
                Reset Link Dispatched
              </p>
              <p className="text-[11px] text-gray-300 leading-relaxed">
                Instructions have been sent to <span className="text-white font-mono">{email}</span>. Please check your inbox and spam folder.
              </p>
              <button
                type="button"
                onClick={() => setIsSubmitted(false)}
                className="mt-1 text-xs font-bold text-fuchsia-400 hover:text-fuchsia-300 underline cursor-pointer"
              >
                Send to a different email
              </button>
            </div>
          )}

          {/* Divider with 'Remember your password?' */}
          <div className="flex items-center gap-3 w-full my-1">
            <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-purple-500/30 to-purple-500/30" />
            <span className="text-[11px] text-gray-300/85 whitespace-nowrap">
              Remember your password?
            </span>
            <div className="h-[1px] flex-1 bg-gradient-to-l from-transparent via-purple-500/30 to-purple-500/30" />
          </div>

          {/* Back to Login Pill Button */}
          <Link
            href="/login"
            className="w-full max-w-[200px] py-2.5 rounded-full bg-[#181135]/80 border border-purple-500/35 hover:border-purple-400 text-purple-200 hover:text-white text-xs font-bold flex items-center justify-center gap-2 transition-all hover:bg-[#231a4a]/80 active:scale-95 shadow-sm"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Back to Login</span>
          </Link>
        </div>

        {/* Security Assurance Badge (Centered) */}
        <div className="flex flex-col items-center text-center gap-1.5 pt-1">
          <div className="w-8 h-8 rounded-full bg-purple-900/40 border border-purple-400/40 flex items-center justify-center text-purple-300 shadow-[0_0_12px_rgba(168,85,247,0.35)]">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <h3 className="text-xs font-bold text-white tracking-wide">
            Your account is safe with us
          </h3>
          <p className="text-[11px] text-purple-200/70 max-w-xs leading-relaxed">
            We follow industry-grade security to keep your data protected.
          </p>
        </div>
      </div>

      {/* Empty bottom spacer for balanced flex layout */}
      <div className="h-2 z-10" />
    </div>
  );
}
