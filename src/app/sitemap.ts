import type { MetadataRoute } from 'next';
import { SITE_URL } from '../lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  // Only the public root has a real URL; language/model preferences are not separate pages.
  return [{ url: `${SITE_URL}/` }];
}
