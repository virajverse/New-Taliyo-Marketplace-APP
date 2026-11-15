'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { CheckCircle2, Loader2, AlertCircle, ArrowRight } from 'lucide-react';
import Link from 'next/link';

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Verifying your credentials and signing in...');

  useEffect(() => {
    let isMounted = true;

    async function handleAuth() {
      try {
        const nextParam = searchParams.get('next') || '/profile';
        const typeParam = searchParams.get('type');
        const resolvedNext =
          typeParam === 'recovery' ? '/reset-password?mode=update' : nextParam;
        const safeNext =
          resolvedNext.startsWith('/') && !resolvedNext.startsWith('//')
            ? resolvedNext
            : '/profile';
        const isCheckout = safeNext.startsWith('/checkout');

        // 1. Check existing session
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        if (session) {
          if (isMounted) {
            setStatus('success');
            setMessage(
              isCheckout
                ? 'Signed in! Returning you to checkout payment...'
                : 'Authentication successful! Redirecting to your profile...'
            );
          }
          setTimeout(() => {
            router.replace(safeNext);
          }, 800);
          return;
        }

        // 2. Listen for auth state change (e.g. OAuth hash processing)
        const { data: authListener } = supabase.auth.onAuthStateChange(
          async (event, currentSession) => {
            if (currentSession && isMounted) {
              setStatus('success');
              setMessage('Sign-in complete. Redirecting...');
              setTimeout(() => {
                router.replace(safeNext);
              }, 600);
            }
          }
        );

        // Fallback timeout if no session is captured
        const timer = setTimeout(() => {
          if (isMounted && status === 'loading') {
            const type = searchParams.get('type');
            if (type === 'recovery') {
              setStatus('success');
              setMessage('Recovery verified! Redirecting to set new password...');
              setTimeout(() => router.replace('/reset-password?mode=update'), 1000);
            } else if (type === 'signup') {
              setStatus('success');
              setMessage('Email verified! Redirecting to login...');
              setTimeout(() => router.replace('/login'), 1200);
            } else {
              setStatus('error');
              setMessage('Could not complete automated sign-in. Please log in manually.');
            }
          }
        }, 4000);

        return () => {
          authListener.subscription.unsubscribe();
          clearTimeout(timer);
        };
      } catch (err: unknown) {
        if (isMounted) {
          setStatus('error');
          const errMsg = err instanceof Error ? err.message : 'Authentication encountered an error.';
          setMessage(errMsg);
        }
      }
    }

    handleAuth();

    return () => {
      isMounted = false;
    };
  }, [router, searchParams, status]);

  return (
    <div className="min-h-screen bg-[#070510] text-white flex flex-col justify-center items-center px-4 relative overflow-hidden">
      {/* Background Ambient Glow */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-80 h-80 rounded-full bg-purple-700/20 blur-3xl" />
      </div>

      <div className="max-w-xs sm:max-w-sm w-full rounded-[28px] bg-[#120d2b]/95 border border-purple-500/35 p-6 sm:p-8 shadow-2xl backdrop-blur-xl flex flex-col items-center text-center gap-5 relative z-10 mx-auto">
        {/* Status Icon */}
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg">
          {status === 'loading' && (
            <div className="w-16 h-16 rounded-2xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-fuchsia-400 animate-spin" />
            </div>
          )}
          {status === 'success' && (
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
          )}
          {status === 'error' && (
            <div className="w-16 h-16 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-rose-400" />
            </div>
          )}
        </div>

        <div>
          <h1 className="text-xl font-extrabold text-white tracking-tight">
            {status === 'loading' && 'Authenticating...'}
            {status === 'success' && 'Sign-in Verified!'}
            {status === 'error' && 'Authentication Notice'}
          </h1>
          <p className="text-xs sm:text-sm text-purple-200/80 mt-2 leading-relaxed">
            {message}
          </p>
        </div>

        {status === 'error' && (
          <div className="pt-2 flex flex-col gap-2 w-full">
            <Link
              href="/login"
              className="w-full py-3 rounded-full bg-gradient-to-r from-purple-600 via-fuchsia-600 to-pink-500 text-white text-xs font-bold shadow-lg hover:opacity-95 transition-all flex items-center justify-center gap-2"
            >
              <span>Back to Login</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/"
              className="text-xs text-gray-400 hover:text-white transition-colors"
            >
              Go to Home
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#07070d] text-white flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-fuchsia-400 animate-spin" />
            <p className="text-xs text-purple-300/80">Securing session...</p>
          </div>
        </div>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
