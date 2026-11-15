import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Taliyo Marketplace',
    short_name: 'Taliyo',
    description: 'Websites, Apps, Automation and Custom Software Services.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#07070d',
    theme_color: '#07070d',
    prefer_related_applications: false,
    related_applications: [
      {
        platform: 'webapp',
        url: 'https://app.taliyotechnologies.com/manifest.webmanifest',
      },
    ],
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
