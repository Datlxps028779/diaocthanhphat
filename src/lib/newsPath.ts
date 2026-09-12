import { isValidSlug } from './slug';

export type NewsPathSource = { slug?: string | null };

/**
 * Canonical public path for a published news article.
 *
 * News UUIDs are lookup keys only; they are never a public SEO fallback. A
 * missing/malformed slug must be excluded from public links, sitemap and
 * structured-data URLs until an editor fixes the source row.
 */
export function buildNewsPath(source: NewsPathSource): string | null {
  const slug = source.slug?.trim();
  return isValidSlug(slug) ? `/tin-tuc/${slug}` : null;
}

export function isCanonicalNewsSource(source: NewsPathSource): boolean {
  return buildNewsPath(source) !== null;
}
