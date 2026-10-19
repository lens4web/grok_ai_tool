import type { Metadata } from 'next';
import { translate, type Locale } from './i18n';

// Public URLs must stay independent of forwarded Host headers and local build origins.
export const SITE_URL = 'https://grok.lens4web.com';
export const SITE_NAME = 'Grok Personal AI';

export function pageMetadata(locale: Locale): Metadata {
  const title = `${SITE_NAME} — ${translate(locale, 'Site tagline')}`;
  const description = translate(locale, 'Site description');
  const image = { url: '/social-card.png', width: 1200, height: 630, alt: SITE_NAME };
  return {
    metadataBase: new URL(SITE_URL),
    applicationName: SITE_NAME,
    authors: [{ name: 'lens4web', url: 'https://lens4web.com/' }],
    title,
    description,
    alternates: { canonical: '/' },
    robots: { index: true, follow: true },
    openGraph: { type: 'website', url: '/', siteName: SITE_NAME, title, description, images: [image] },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
    appleWebApp: { capable: true, title: 'Grok AI', statusBarStyle: 'default' },
  };
}

export function websiteSchema(locale: Locale) {
  return { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE_NAME, url: SITE_URL + '/', inLanguage: locale, description: translate(locale, 'Site description'), author: { '@type': 'Organization', name: 'lens4web', url: 'https://lens4web.com/' } };
}
