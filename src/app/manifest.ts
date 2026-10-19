import type { MetadataRoute } from 'next';
import { SITE_NAME } from '../lib/site';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/', name: SITE_NAME, short_name: 'Grok AI', start_url: '/', scope: '/', display: 'standalone',
    background_color: '#f5f7fb', theme_color: '#2563eb',
    icons: [
      { src: '/app-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/app-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/app-icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
