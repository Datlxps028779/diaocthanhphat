import type { Metadata } from 'next';
import type { SeoRouteOverride } from './supabase';
import { staticPageMetadata, buildBreadcrumbJsonLd } from './seo';
import { buildAutoSchema } from './seoAuto';
import { mergeSchema } from './schemaValidation';
import { canonicalPath } from './siteUrl';
import { serverGetSeoRouteOverride } from './supabase-server';

export interface RouteFallback {
  title: string;
  description: string;
  path: string;
  ogImage?: string;
  breadcrumb?: Array<{ name: string; path: string }>;
  routeType?: 'WebPage' | 'CollectionPage' | 'AboutPage' | 'WebSite' | 'FAQPage';
}

const ROUTE_LOCKED_KEYS = ['@context', '@type', '@id', 'url', 'mainEntityOfPage'];

const DYNAMIC_LISTING_QUERY_KEYS = new Set([
  'area', 'type', 'loai', 'district', 'ward', 'legal', 'q', 'sort',
  'minPrice', 'maxPrice', 'minArea', 'maxArea', 'bedrooms', 'direction',
  'featured', 'hot', 'page', 'locationSource',
]);

export function hasDynamicListingQuery(
  searchParams?: Record<string, string | string[] | undefined>,
): boolean {
  return Object.entries(searchParams ?? {}).some(([key, value]) => {
    if (!DYNAMIC_LISTING_QUERY_KEYS.has(key)) return false;
    return Array.isArray(value) ? value.some(Boolean) : Boolean(value);
  });
}

export function noindexDynamicListingMetadata(metadata: Metadata, dynamic: boolean): Metadata {
  return dynamic ? { ...metadata, robots: { index: false, follow: true } } : metadata;
}

// Route overrides must remain same-site path aliases. Query/hash canonical URLs split
// signals and external URLs could make an admin typo point schema/OG off-site.
export function safeRouteCanonicalPath(overridePath: string | null | undefined, fallbackPath: string): string {
  const raw = overridePath?.trim();
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || /[?#]/.test(raw)) return canonicalPath(fallbackPath);
  return canonicalPath(raw);
}

function resolvedRoutePath(path: string, override: SeoRouteOverride | null): string {
  return safeRouteCanonicalPath(override?.canonical_path, path);
}

export function buildRouteMetadata({
  path,
  fallback,
  override,
}: {
  path: string;
  fallback: RouteFallback;
  override: SeoRouteOverride | null;
}): Metadata {
  const canonical = resolvedRoutePath(path, override);
  const base = staticPageMetadata({
    title: override?.meta_title?.trim() || fallback.title,
    description: override?.meta_description?.trim() || fallback.description,
    path: canonical,
    ogImage: fallback.ogImage,
  });
  const keywords = override?.focus_keywords?.trim() || undefined;
  const robots = {
    index: override?.robots_index ?? true,
    follow: override?.robots_follow ?? true,
  };
  return {
    ...base,
    keywords,
    alternates: { canonical },
    robots,
  };
}

export function buildRouteJsonLd({
  path,
  fallback,
  override,
}: {
  path: string;
  fallback: RouteFallback;
  override: SeoRouteOverride | null;
}): Record<string, unknown>[] {
  const canonical = resolvedRoutePath(path, override);
  const title = override?.meta_title?.trim() || fallback.title;
  const description = override?.meta_description?.trim() || fallback.description;
  const base = buildAutoSchema(
    'route',
    {
      title,
      description,
      focus_keywords: override?.focus_keywords || '',
      path: canonical,
    },
    { basePath: canonical, routeType: fallback.routeType },
  );
  const merged = override?.schema_markup
    ? mergeSchema(base, override.schema_markup, 'route', ROUTE_LOCKED_KEYS).schema
    : base;
  const schemas: Record<string, unknown>[] = [merged];
  if (fallback.breadcrumb && fallback.breadcrumb.length > 0) {
    schemas.push(buildBreadcrumbJsonLd(fallback.breadcrumb));
  }
  return schemas;
}

export async function loadRouteSeo(path: string, fallback: RouteFallback): Promise<{
  metadata: Metadata;
  jsonLd: Record<string, unknown>[];
  override: SeoRouteOverride | null;
}> {
  const override = await serverGetSeoRouteOverride(path);
  return {
    metadata: buildRouteMetadata({ path, fallback, override }),
    jsonLd: buildRouteJsonLd({ path, fallback, override }),
    override,
  };
}
