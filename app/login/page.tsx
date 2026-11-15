'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Mail,
  Lock,
  Eye,
  EyeOff,
  User,
  CheckCircle2,
  ShieldCheck,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawNext = searchParams.get('next') || '/profile';
  const safeNext = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/profile';
  const isCheckoutRedirect = safeNext.startsWith('/checkout');

  // Mode: 'login' | 'signup'
  const [mode, setMode] = useState<'login' | 'signup'>('login');

  // Form State
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'error'>('success');

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToastType(type);
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!password || password.length < 6) {
      showToast('Password must be at least 6 characters.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === 'signup') {
        const res = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: emailOrPhone,
            password,
            fullName,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Signup failed');

        await supabase.auth.signInWithPassword({
          email: emailOrPhone,
          password,
        });

        showToast(
          isCheckoutRedirect
            ? 'Account created! Returning to checkout...'
            : 'Account created successfully! Welcome!',
          'success',
        );
        setTimeout(() => router.replace(safeNext), 800);
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: emailOrPhone,
          password,
        });
        if (error) throw error;
        showToast(
          isCheckoutRedirect
            ? 'Signed in! Returning to checkout...'
            : 'Welcome back! Logging you in...',
          'success',
        );
        setTimeout(() => router.replace(safeNext), 800);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication failed';
      showToast(msg, 'error');
      setIsSubmitting(false);
    }
  };

  const handleOAuthLogin = async (provider: 'google' | 'apple') => {
    try {
      const callbackUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: callbackUrl,
        },
      });
      if (error) throw error;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'OAuth sign-in failed';
      showToast(msg, 'error');
    }
  };

  return (
    <div className="min-h-screen bg-[#07070d] text-white flex flex-col justify-between relative px-4 py-6">
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

      {/* Top Header Back Navigation */}
      <div className="max-w-md w-full mx-auto flex items-center justify-between">
        <button
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
          Skip for now
        </Link>
      </div>

      {/* Central Login / Signup Card */}
      <div className="max-w-md w-full mx-auto flex flex-col gap-6 my-auto pt-4 pb-6">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center">
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
            Discover • Buy • Get Services
          </p>
        </div>

        {/* Mode Segmented Tab Switch */}
        {isCheckoutRedirect && (
          <div className="rounded-2xl bg-emerald-950/40 border border-emerald-500/30 px-3.5 py-2.5 flex items-center gap-2.5 text-xs text-emerald-200">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="leading-snug">
              Your cart &amp; checkout details are saved. Sign in to complete payment.
            </span>
          </div>
        )}

        <div className="p-1 rounded-2xl bg-[#121429] border border-purple-500/20 grid grid-cols-2 gap-1">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              mode === 'login'
                ? 'bg-gradient-to-r from-purple-600 via-fuchsia-600 to-pink-500 text-white shadow-md shadow-fuchsia-600/30'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => setMode('signup')}
            className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              mode === 'signup'
                ? 'bg-gradient-to-r from-purple-600 via-fuchsia-600 to-pink-500 text-white shadow-md shadow-fuchsia-600/30'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Sign Up
          </button>
        </div>

        {/* Form Container */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#160b33]/90 via-[#100a26]/90 to-[#0c0d1e]/90 border border-purple-500/25 p-5 sm:p-6 shadow-[0_12px_36px_rgba(0,0,0,0.55)]">
          {/* Greeting */}
          <div className="mb-5">
            <h2 className="text-lg font-bold text-white tracking-tight">
              {mode === 'login' ? 'Welcome Back' : 'Create an Account'}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {mode === 'login'
                ? 'Login to your Taliyo account'
                : 'Join Taliyo Marketplace and explore top services'}
            </p>
          </div>

          {/* Inputs Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            {mode === 'signup' && (
              <div>
                <label className="text-xs font-semibold text-gray-300 mb-1.5 block">
                  Full Name
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-purple-400">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Viraj Srivastav"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#161833] border border-purple-500/20 text-white text-sm focus:outline-none focus:border-purple-500"
                    required
                  />
                </div>
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-gray-300 mb-1.5 block">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-purple-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  value={emailOrPhone}
                  onChange={(e) => setEmailOrPhone(e.target.value)}
                  placeholder="name@email.com"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#161833] border border-purple-500/20 text-white text-sm focus:outline-none focus:border-purple-500"
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-300 mb-1.5 block">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-purple-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-[#161833] border border-purple-500/20 text-white text-sm focus:outline-none focus:border-purple-500"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Checkbox & Forgot Password */}
            <div className="flex items-center justify-between text-xs pt-1">
              <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-purple-500/30 text-purple-600 focus:ring-0 accent-purple-600 cursor-pointer"
                />
                <span>Remember me</span>
              </label>

              {mode === 'login' && (
                <Link
                  href="/reset-password"
                  className="text-purple-300 hover:text-fuchsia-300 font-semibold cursor-pointer"
                >
                  Forgot password?
                </Link>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-2 py-3 rounded-xl bg-gradient-to-r from-purple-600 via-fuchsia-600 to-pink-500 text-white text-sm font-bold shadow-lg shadow-fuchsia-600/30 hover:opacity-95 disabled:opacity-60 transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>
                {isSubmitting
                  ? mode === 'login'
                    ? 'Signing in...'
                    : 'Creating Account...'
                  : mode === 'login'
                  ? 'Login'
                  : 'Create Account'}
              </span>
            </button>
          </form>

          {/* Social Login Divider */}
          <div className="relative flex items-center justify-center my-5">
            <div className="border-t border-purple-500/15 w-full" />
            <span className="bg-[#120a26] px-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider absolute">
              or continue with
            </span>
          </div>

          {/* Social Buttons */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => handleOAuthLogin('google')}
              className="py-2.5 px-3 rounded-xl bg-[#161833] border border-purple-500/20 hover:border-purple-500/40 text-xs font-semibold text-gray-200 flex items-center justify-center gap-2 hover:bg-[#1d2042] transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#EA4335"
                  d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.4 9 5 12 5z"
                />
                <path
                  fill="#4285F4"
                  d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 12.3 0 15s.7 5.3 1.9 7.7l3.7-2.9z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2-6.4-4.8L1.9 16.4C3.7 20.1 7.5 23 12 23z"
                />
              </svg>
              <span>Google</span>
            </button>

            <button
              type="button"
              onClick={() => handleOAuthLogin('apple')}
              className="py-2.5 px-3 rounded-xl bg-[#161833] border border-purple-500/20 hover:border-purple-500/40 text-xs font-semibold text-gray-200 flex items-center justify-center gap-2 hover:bg-[#1d2042] transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4 fill-white" viewBox="0 0 170 170">
                <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.69-3.04-7.66-7.85-11.91-14.42-7.5-11.63-13.32-24.87-17.47-39.73-4.14-14.86-6.22-28.79-6.22-41.81 0-16.14 4.13-29.56 12.39-40.26 8.26-10.7 18.66-16.18 31.21-16.43 4.8 0 10.37 1.34 16.71 4.02 6.33 2.68 10.5 4.08 12.51 4.2 2.23 0 6.64-1.4 13.23-4.2 6.59-2.8 12.28-4.13 17.07-4.01 12.06.63 21.9 4.85 29.54 12.67 7.64 7.82 12.44 17.74 14.4 29.77-10.71 6.5-16.01 15.54-15.9 27.13.11 10.28 4.17 18.82 12.18 25.62 4.13 3.5 8.92 5.95 14.38 7.34-2.24 6.77-4.97 13.6-8.2 20.49zM119.22 33.74c0-7.7 2.76-15.02 8.28-21.96 5.52-6.94 12.33-11.23 20.44-12.87 1.12 7.7-1.44 15.11-7.68 22.23-6.24 7.12-13.24 11.27-21.04 12.45-.11-.46-.11-1.07-.11-1.85z" />
              </svg>
              <span>Apple</span>
            </button>
          </div>
        </div>

        {/* Toggle Mode Footer */}
        <div className="text-center text-xs text-gray-400">
          {mode === 'login' ? (
            <span>
              New to Taliyo?{' '}
              <button
                type="button"
                onClick={() => setMode('signup')}
                className="text-fuchsia-400 hover:text-fuchsia-300 font-bold underline underline-offset-2 cursor-pointer"
              >
                Create an account
              </button>
            </span>
          ) : (
            <span>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => setMode('login')}
                className="text-fuchsia-400 hover:text-fuchsia-300 font-bold underline underline-offset-2 cursor-pointer"
              >
                Login here
              </button>
            </span>
          )}
        </div>
      </div>

      {/* Terms Footer */}
      <div className="max-w-md w-full mx-auto text-center text-[11px] text-gray-500">
        By signing in, you agree to our{' '}
        <Link href="/privacy" className="text-gray-400 hover:underline">
          Terms of Service
        </Link>{' '}
        and{' '}
        <Link href="/privacy" className="text-gray-400 hover:underline">
          Privacy Policy
        </Link>
        .
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#07070d]" />}>
      <LoginPageContent />
    </Suspense>
  );
}
