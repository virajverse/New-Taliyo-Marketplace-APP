'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Check,
  User,
  Moon,
  RotateCcw,
  Headphones,
  LogOut,
  ChevronRight,
  CheckCircle2,
  X,
  Lock,
  FileText,
} from 'lucide-react';
import BottomNav from '@/components/BottomNav';
import { supabase } from '@/lib/supabaseClient';
import { invalidateClientCache } from '@/lib/clientCache';

export default function SettingsPage() {
  const router = useRouter();

  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string>('');
  const [cachedKeyCount, setCachedKeyCount] = useState<number>(0);

  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);
  const [isLogoutOpen, setIsLogoutOpen] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    function countLocalKeys() {
      try {
        if (typeof window === 'undefined') return;
        const keys = [
          'taliyo_dismissed_notifications',
          'taliyo_checkout_draft',
          'taliyo_saved_addresses',
          'taliyo_saved_payments',
        ];
        const present = keys.filter((k) => Boolean(localStorage.getItem(k))).length;
        setCachedKeyCount(present);
      } catch {
        setCachedKeyCount(0);
      }
    }

    async function loadUser() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user?.email) {
          setCurrentUserEmail(user.email);
          const { data: profile } = await supabase
            .from('profiles')
            .select('name, phone')
            .eq('id', user.id)
            .maybeSingle();

          const resolvedName =
            profile?.name ||
            user.user_metadata?.full_name ||
            user.email.split('@')[0] ||
            'Client';
          const resolvedPhone = profile?.phone || user.phone || '';

          setCurrentUserName(resolvedName);
          setEditName(resolvedName);
          setEditPhone(resolvedPhone);
        }
      } catch (e) {
        console.warn('Auth check notice:', e);
      }
    }

    countLocalKeys();
    loadUser();
  }, []);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUserEmail) return;
    setIsSavingProfile(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await Promise.all([
          supabase.from('profiles').upsert({
            id: user.id,
            name: editName,
            phone: editPhone,
            updated_at: new Date().toISOString(),
          }),
          supabase.auth.updateUser({
            data: { full_name: editName, phone: editPhone },
          }),
        ]);
      }
      setCurrentUserName(editName);
      showToast('Profile information saved successfully!');
      setIsEditProfileOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save profile';
      showToast(msg);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSendResetEmail = async () => {
    if (!currentUserEmail) return;
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(currentUserEmail, {
        redirectTo: `${window.location.origin}/auth/callback?type=recovery&next=/reset-password?mode=update`,
      });
      if (error) throw error;
      showToast(`Password reset link sent to ${currentUserEmail}!`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send reset link';
      showToast(msg);
    }
  };

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUserEmail) {
      showToast('Please sign in first to update your password');
      return;
    }
    if (newPassword.length < 6) {
      showToast('Password must be at least 6 characters long');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('New passwords do not match');
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      showToast('Password updated successfully!');
      setNewPassword('');
      setConfirmPassword('');
      setIsSecurityModalOpen(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update password';
      showToast(message || 'Failed to update password');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleClearCache = () => {
    try {
      localStorage.removeItem('taliyo_dismissed_notifications');
      localStorage.removeItem('taliyo_checkout_draft');
      localStorage.removeItem('taliyo_saved_addresses');
      localStorage.removeItem('taliyo_saved_payments');
      invalidateClientCache('all');
      setCachedKeyCount(0);
      showToast('Temporary app cache cleared (Cart & Wishlist kept safe).');
    } catch {
      showToast('Temporary app cache cleared.');
    }
  };

  const handleLogout = async () => {
    setIsLogoutOpen(false);
    try {
      await supabase.auth.signOut();
      localStorage.removeItem('taliyo_saved_addresses');
      localStorage.removeItem('taliyo_saved_payments');
      localStorage.removeItem('taliyo_cart');
      window.dispatchEvent(new Event('taliyo_cart_updated'));
    } catch (e) {
      console.warn('Sign out notice:', e);
    }
    showToast('Signed out successfully.');
    setTimeout(() => router.push('/login'), 800);
  };

  return (
    <div className="min-h-screen bg-[#07070d] text-white flex flex-col relative pb-32">
      {toastMsg && (
        <div className="fixed top-16 inset-x-0 z-50 flex justify-center px-4 animate-in fade-in slide-in-from-top-3 duration-250 pointer-events-none">
          <div className="bg-[#0b0d1e]/80 backdrop-blur-xl border border-emerald-500/20 text-emerald-200 text-xs font-medium px-3.5 py-1.5 rounded-full shadow-[0_4px_20px_rgba(0,0,0,0.5),0_0_10px_rgba(16,185,129,0.1)] flex items-center gap-2 pointer-events-auto transition-all">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="leading-tight">{toastMsg}</span>
          </div>
        </div>
      )}

      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-[#07070d]/90 backdrop-blur-xl border-b border-purple-500/10 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            aria-label="Go Back"
            className="w-10 h-10 rounded-full bg-[#121429] border border-purple-500/20 flex items-center justify-center text-gray-300 hover:text-white hover:border-purple-500/40 hover:bg-[#1a1d3d] transition-all shadow-sm cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight leading-tight">
              Settings
            </h1>
            <p className="text-xs text-gray-400 leading-tight">
              Account security, local cache & legal info
            </p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-xl w-full mx-auto px-4 pt-4 flex flex-col gap-5">
        {/* Top App Brand Card */}
        <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-r from-[#1c0d3d]/90 via-[#130b2c]/90 to-[#0c0d1e]/90 border border-purple-500/25 p-4 shadow-[0_12px_36px_rgba(0,0,0,0.55)] flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="relative flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-600 via-fuchsia-600 to-pink-500 shadow-md shadow-purple-900/40 p-0.5">
              <div className="w-full h-full bg-white rounded-[14px] overflow-hidden flex items-center justify-center">
                <Image
                  src="/icons/icon-192.png"
                  alt="Taliyo Marketplace"
                  width={48}
                  height={48}
                  className="w-full h-full object-cover scale-110"
                />
              </div>
            </div>

            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Taliyo Marketplace
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {currentUserEmail ? `Signed in as ${currentUserName}` : 'Browsing as Guest'}
              </p>
            </div>
          </div>

          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-semibold shadow-sm">
            <Check className="w-3.5 h-3.5" />
            Live Sync
          </span>
        </div>

        {/* Section 1: Account & Security */}
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-1">
            Account & Security
          </h3>
          <div className="rounded-[22px] bg-[#0f1123]/95 border border-purple-500/15 divide-y divide-purple-500/10 overflow-hidden shadow-sm">
            {currentUserEmail ? (
              <button
                type="button"
                onClick={() => setIsEditProfileOpen(true)}
                className="w-full flex items-center justify-between p-3.5 hover:bg-[#161833] transition-colors group cursor-pointer text-left"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-[#2a1740] border border-purple-500/25 flex items-center justify-center text-purple-300 shrink-0 group-hover:scale-105 transition-transform">
                    <User className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white group-hover:text-purple-200 transition-colors">
                      Edit Profile Details
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5 truncate">
                      {currentUserName} ({currentUserEmail})
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-white transition-colors shrink-0 ml-2" />
              </button>
            ) : (
              <Link
                href="/login?next=/settings"
                className="flex items-center justify-between p-3.5 hover:bg-[#161833] transition-colors group cursor-pointer"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-[#2a1740] border border-purple-500/25 flex items-center justify-center text-purple-300 shrink-0">
                    <User className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">Sign In to Edit Profile</div>
                    <div className="text-xs text-gray-400 mt-0.5 truncate">
                      Update your account name, contact and email
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-white transition-colors shrink-0 ml-2" />
              </Link>
            )}

            {currentUserEmail ? (
              <button
                onClick={() => setIsSecurityModalOpen(true)}
                className="w-full flex items-center justify-between p-3.5 hover:bg-[#161833] transition-colors group cursor-pointer text-left"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-[#2a1740] border border-purple-500/25 flex items-center justify-center text-cyan-300 shrink-0 group-hover:scale-105 transition-transform">
                    <Lock className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white group-hover:text-cyan-200 transition-colors">
                      Change Password
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5 truncate">
                      Update your account login password
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-white transition-colors shrink-0 ml-2" />
              </button>
            ) : (
              <Link
                href="/login"
                className="w-full flex items-center justify-between p-3.5 hover:bg-[#161833] transition-colors group cursor-pointer text-left"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-[#2a1740] border border-purple-500/25 flex items-center justify-center text-cyan-300 shrink-0">
                    <Lock className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">Sign In or Create Account</div>
                    <div className="text-xs text-gray-400 mt-0.5 truncate">
                      Access orders, synced wishlist and password controls
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-white transition-colors shrink-0 ml-2" />
              </Link>
            )}
          </div>
        </div>

        {/* Section 2: Appearance & Local Cache */}
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-1">
            Appearance & Storage
          </h3>
          <div className="rounded-[22px] bg-[#0f1123]/95 border border-purple-500/15 divide-y divide-purple-500/10 overflow-hidden shadow-sm">
            <div
              onClick={() => showToast('OLED Dark Mode is active for optimal battery and high-contrast clarity.')}
              className="flex items-center justify-between p-3.5 hover:bg-[#161833] transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-10 h-10 rounded-full bg-[#2a1740] border border-purple-500/25 flex items-center justify-center text-fuchsia-300 shrink-0">
                  <Moon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white">App Theme</div>
                  <div className="text-xs text-gray-400 mt-0.5 truncate">Dark Mode (OLED optimized)</div>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-purple-600/20 border border-purple-500/30 text-purple-200 text-[11px] font-semibold shrink-0 ml-2">
                Active (Default)
              </span>
            </div>

            <button
              onClick={handleClearCache}
              className="w-full flex items-center justify-between p-3.5 hover:bg-[#161833] transition-colors group cursor-pointer text-left"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-10 h-10 rounded-full bg-[#2a1740] border border-purple-500/25 flex items-center justify-center text-teal-300 shrink-0">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white group-hover:text-teal-200 transition-colors">
                    Clear Temporary Cache
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5 truncate">
                    Refresh catalog cache &amp; dismissed alerts (keeps Cart safe)
                  </div>
                </div>
              </div>

              <span className="text-xs text-gray-400 group-hover:text-purple-300 font-mono shrink-0 ml-2">
                {cachedKeyCount > 0 ? `${cachedKeyCount} items` : 'Clean'}
              </span>
            </button>
          </div>
        </div>

        {/* Section 3: Support & Legal */}
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-1">
            Support & Legal
          </h3>
          <div className="rounded-[22px] bg-[#0f1123]/95 border border-purple-500/15 divide-y divide-purple-500/10 overflow-hidden shadow-sm">
            <Link
              href="/support"
              className="flex items-center justify-between p-3.5 hover:bg-[#161833] transition-colors group cursor-pointer"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-10 h-10 rounded-full bg-[#2a1740] border border-purple-500/25 flex items-center justify-center text-purple-300 shrink-0">
                  <Headphones className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white group-hover:text-purple-200 transition-colors">
                    Help & Support
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5 truncate">
                    Contact support via phone, WhatsApp or live help desk
                  </div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-white transition-colors shrink-0 ml-2" />
            </Link>

            <Link
              href="/privacy"
              className="flex items-center justify-between p-3.5 hover:bg-[#161833] transition-colors group cursor-pointer"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-10 h-10 rounded-full bg-[#2a1740] border border-purple-500/25 flex items-center justify-center text-cyan-300 shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white group-hover:text-cyan-200 transition-colors">
                    Privacy Policy & Terms
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5 truncate">
                    User agreements, data collection and safety
                  </div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-white transition-colors shrink-0 ml-2" />
            </Link>

            {currentUserEmail && (
              <button
                onClick={() => setIsLogoutOpen(true)}
                className="w-full flex items-center justify-between p-3.5 hover:bg-rose-500/[0.08] transition-colors group cursor-pointer text-left"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-[#4a122e] border border-rose-500/35 flex items-center justify-center text-rose-400 shrink-0">
                    <LogOut className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-rose-400 group-hover:text-rose-300 transition-colors">
                      Log Out
                    </div>
                    <div className="text-xs text-rose-300/60 mt-0.5 truncate">
                      Sign out from this device
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-rose-500/50 group-hover:text-rose-400 transition-colors shrink-0 ml-2" />
              </button>
            )}
          </div>
        </div>
      </main>

      {/* MODAL 0: Edit Profile Details */}
      {isEditProfileOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-md rounded-3xl bg-[#0f1124] border border-purple-500/30 p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-purple-500/15 pb-3">
              <div className="flex items-center gap-2.5">
                <User className="w-5 h-5 text-purple-400" />
                <h3 className="text-lg font-bold text-white">Edit Profile Details</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsEditProfileOpen(false)}
                className="w-8 h-8 rounded-full bg-[#181a33] flex items-center justify-center text-gray-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="flex flex-col gap-3.5">
              <div>
                <label className="text-xs font-semibold text-gray-300 mb-1.5 block">Full Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Your full name"
                  className="w-full px-4 py-2.5 rounded-xl bg-[#161833] border border-purple-500/20 text-white text-sm focus:outline-none focus:border-purple-500 placeholder-gray-500"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-300 mb-1.5 block">Contact Phone Number</label>
                <input
                  type="tel"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="e.g. 9696669964"
                  className="w-full px-4 py-2.5 rounded-xl bg-[#161833] border border-purple-500/20 text-white text-sm focus:outline-none focus:border-purple-500 placeholder-gray-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-400 mb-1.5 block">Registered Email (Locked for security)</label>
                <input
                  type="email"
                  value={currentUserEmail || ''}
                  disabled
                  className="w-full px-4 py-2.5 rounded-xl bg-[#101226] border border-purple-500/10 text-gray-400 text-sm cursor-not-allowed"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsEditProfileOpen(false)}
                  className="px-4 py-2 rounded-xl bg-[#181a33] text-gray-300 text-sm font-semibold hover:bg-[#202242] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingProfile}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white text-sm font-bold shadow-md shadow-fuchsia-600/30 hover:opacity-95 transition-opacity cursor-pointer disabled:opacity-50"
                >
                  {isSavingProfile ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 1: Change Password */}
      {isSecurityModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-md rounded-3xl bg-[#0f1124] border border-purple-500/30 p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-purple-500/15 pb-3">
              <div className="flex items-center gap-2.5">
                <Lock className="w-5 h-5 text-cyan-400" />
                <h3 className="text-lg font-bold text-white">Change Password</h3>
              </div>
              <button
                onClick={() => setIsSecurityModalOpen(false)}
                className="w-8 h-8 rounded-full bg-[#181a33] flex items-center justify-center text-gray-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handlePasswordUpdate} className="flex flex-col gap-3.5">
              <div>
                <label className="text-xs font-semibold text-gray-300 mb-1.5 block">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="w-full px-4 py-2.5 rounded-xl bg-[#161833] border border-purple-500/20 text-white text-sm focus:outline-none focus:border-purple-500 placeholder-gray-500"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-300 mb-1.5 block">Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  className="w-full px-4 py-2.5 rounded-xl bg-[#161833] border border-purple-500/20 text-white text-sm focus:outline-none focus:border-purple-500 placeholder-gray-500"
                  required
                />
              </div>

              <div className="text-[11px] text-gray-400 flex items-center justify-between pt-1">
                <span>Forgot password?</span>
                <button
                  type="button"
                  onClick={handleSendResetEmail}
                  className="text-fuchsia-400 hover:underline font-semibold cursor-pointer"
                >
                  Send Reset Link to Email
                </button>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsSecurityModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-[#181a33] text-gray-300 text-sm font-semibold hover:bg-[#202242] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingPassword}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white text-sm font-bold shadow-md shadow-fuchsia-600/30 hover:opacity-95 transition-opacity cursor-pointer disabled:opacity-50"
                >
                  {isUpdatingPassword ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Logout Confirmation */}
      {isLogoutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-sm rounded-3xl bg-[#0f1124] border border-rose-500/30 p-6 shadow-2xl flex flex-col items-center text-center gap-4">
            <div className="w-14 h-14 rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <LogOut className="w-7 h-7" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-white">Sign Out?</h3>
              <p className="text-xs text-gray-400 mt-1">
                Are you sure you want to log out from your account?
              </p>
            </div>

            <div className="flex items-center gap-3 w-full pt-2">
              <button
                type="button"
                onClick={() => setIsLogoutOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-[#181a33] text-gray-300 text-xs font-semibold hover:bg-[#202242] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-500 transition-colors shadow-lg shadow-rose-600/30 cursor-pointer"
              >
                Log Out
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
