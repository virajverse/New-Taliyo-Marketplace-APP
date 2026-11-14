import type { Metadata, Viewport } from 'next';
import './globals.css';
import HydrationGuard from '@/components/HydrationGuard';
import SystemSettingsGate from '@/components/SystemSettingsGate';
import PwaInstallProvider from '@/components/PwaInstallProvider';

export const metadata: Metadata = {
  title: 'Taliyo Marketplace — Turn Ideas into Real Digital Products',
  description: 'Websites, Apps, AI Solutions and Complete Software Systems — Built by Verified Experts.',
  applicationName: 'Taliyo Marketplace',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Taliyo',
  },
  icons: {
    icon: '/icons/icon-192.png',
    shortcut: '/icons/icon-192.png',
    apple: '/icons/icon-192.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#07070d',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var doc = document.documentElement;
                  if (doc && doc.hasAttribute('data-theme')) doc.removeAttribute('data-theme');
                  var s = doc && doc.getAttribute('style');
                  if (s && (s.indexOf('--white') !== -1 || s.indexOf('--font-family') !== -1 || s.indexOf('020c25') !== -1)) {
                    doc.removeAttribute('style');
                  }
                } catch (e) {}
                try {
                  window.addEventListener('beforeinstallprompt', function(e) {
                    try { e.preventDefault(); } catch (err) {}
                    try { window.__bip = e; } catch (err) {}
                    try { window.dispatchEvent(new Event('bipready')); } catch (err) {}
                  });
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body
        className="min-h-screen bg-[#07070d] text-white selection:bg-purple-500 selection:text-white"
        suppressHydrationWarning
      >
        <HydrationGuard />
        <SystemSettingsGate />
        <PwaInstallProvider>{children}</PwaInstallProvider>
      </body>
    </html>
  );
}
