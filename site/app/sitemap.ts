import type { MetadataRoute } from 'next';
import { pageUrl } from '@/lib/site';
import { source } from '@/lib/source';

export const dynamic = 'force-static';

/* /theway/sitemap.xml: the home page and every docs page, at their canonical URLs. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: pageUrl('/') }, ...source.getPages().map((page) => ({ url: pageUrl(page.url) }))];
}
