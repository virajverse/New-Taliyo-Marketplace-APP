'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Share, PlusSquare, X, Smartphone } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms?: string[];
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface RelatedApp {
  platform?: string;
}

interface PwaWindow extends Window {
  __bip?: BeforeInstallPromptEvent | null;
  __bipSetup?: boolean;
}

interface PwaInstallContextValue {
  canInstallNative: boolean;
  isIos: boolean;
  isInstalled: boolean;
  triggerInstall: () => Promise<void>;
}

const PwaInstallContext = createContext<PwaInstallContextValue>({
  canInstallNative: false,
  isIos: false,
  isInstalled: false,
  triggerInstall: async () => {},
});

export function usePwaInstall() {
  return useContext(PwaInstallContext);
}

export default function PwaInstallProvider({ children }: { children: React.ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const pwaWin = window as PwaWindow;
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIsInstalled(standalone);

    const ua = window.navigator.userAgent || '';
    const iosDevice = /iPhone|iPad|iPod/i.test(ua);
    const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
    setIsIos(iosDevice && isSafari && !standalone);

    if (!standalone) {
      const navWithApps = window.navigator as Navigator & {
        getInstalledRelatedApps?: () => Promise<RelatedApp[]>;
      };
      if (typeof navWithApps.getInstalledRelatedApps === 'function') {
        navWithApps
          .getInstalledRelatedApps()
          .then((apps) => {
            if (Array.isArray(apps) && apps.some((a) => a.platform === 'webapp')) {
              setIsInstalled(true);
              setDeferredPrompt(null);
              pwaWin.__bip = null;
            }
          })
          .catch(() => {});
      }
    }

    if ('serviceWorker' in window.navigator) {
      window.navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .then((reg) => {
          if (reg.waiting) {
            try {
              reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            } catch {}
          }
          try {
            reg.update().catch(() => {});
          } catch {}
        })
        .catch(() => {});
    }

    // Adopt early pre-hydration prompt captured in layout <head>
    if (pwaWin.__bip) {
      setDeferredPrompt(pwaWin.__bip);
    }

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const bip = e as BeforeInstallPromptEvent;
      pwaWin.__bip = bip;
      setDeferredPrompt(bip);
    };

    const onBipReady = () => {
      if (pwaWin.__bip) {
        setDeferredPrompt(pwaWin.__bip);
      }
    };

    const onAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      pwaWin.__bip = null;
      setGuideOpen(false);
    };

    const mm = window.matchMedia('(display-mode: standalone)');
    const onDisplayChange = () => {
      if (mm.matches) {
        setIsInstalled(true);
        setDeferredPrompt(null);
        pwaWin.__bip = null;
        setGuideOpen(false);
      }
    };

    if (!pwaWin.__bipSetup) {
      window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    }
    window.addEventListener('bipready', onBipReady);
    window.addEventListener('appinstalled', onAppInstalled);
    mm.addEventListener('change', onDisplayChange);

    return () => {
      if (!pwaWin.__bipSetup) {
        window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      }
      window.removeEventListener('bipready', onBipReady);
      window.removeEventListener('appinstalled', onAppInstalled);
      mm.removeEventListener('change', onDisplayChange);
    };
  }, []);

  const triggerInstall = useCallback(async () => {
    if (isInstalled) return;
    const pwaWin = typeof window !== 'undefined' ? (window as PwaWindow) : null;
    const activePrompt = deferredPrompt || pwaWin?.__bip || null;

    if (activePrompt) {
      try {
        await activePrompt.prompt();
        const choice = await activePrompt.userChoice;
        if (pwaWin) pwaWin.__bip = null;
        setDeferredPrompt(null);
        if (choice?.outcome === 'accepted') {
          setIsInstalled(true);
        }
        return;
      } catch {
        if (pwaWin) pwaWin.__bip = null;
        setDeferredPrompt(null);
      }
    }

    if (isIos) {
      setGuideOpen(true);
    }
  }, [deferredPrompt, isInstalled, isIos]);

  return (
    <PwaInstallContext.Provider
      value={{
        canInstallNative: Boolean(deferredPrompt),
        isIos,
        isInstalled,
        triggerInstall,
      }}
    >
      {children}

      {guideOpen && isIos && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-[#0f1123] border border-purple-500/30 p-5 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-600 to-fuchsia-600 flex items-center justify-center text-white shrink-0">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Install Taliyo Marketplace</h3>
                  <p className="text-xs text-gray-400">Get instant app access from your home screen</p>
                </div>
              </div>
              <button
                onClick={() => setGuideOpen(false)}
                aria-label="Close"
                className="p-1.5 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <ol className="space-y-2.5 text-xs text-gray-300 bg-[#15172e] rounded-2xl p-3.5 border border-purple-500/15">
              <li className="flex items-center gap-2.5">
                <Share className="w-4 h-4 text-purple-400 shrink-0" />
                <span>Tap the <strong>Share</strong> button in Safari&apos;s toolbar.</span>
              </li>
              <li className="flex items-center gap-2.5">
                <PlusSquare className="w-4 h-4 text-purple-400 shrink-0" />
                <span>Scroll down and select <strong>Add to Home Screen</strong>.</span>
              </li>
            </ol>

            <button
              onClick={() => setGuideOpen(false)}
              className="w-full py-2.5 rounded-2xl bg-gradient-to-r from-purple-600 to-fuchsia-600 text-xs font-bold text-white hover:opacity-95 transition-opacity"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </PwaInstallContext.Provider>
  );
}
