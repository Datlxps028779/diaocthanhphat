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

export function buildRouteMetadata({
  path,
  fallback,
  override,
}: {
  path: string;
  fallback: RouteFallback;
  override: SeoRouteOverride | null;
}): Metadata {
  const base = staticPageMetadata({
    title: override?.meta_title?.trim() || fallback.title,
    description: override?.meta_description?.trim() || fallback.description,
    path,
    ogImage: fallback.ogImage,
  });
  const keywords = override?.focus_keywords?.trim() || undefined;
  const canonical = canonicalPath(override?.canonical_path?.trim() || path);
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
  const title = override?.meta_title?.trim() || fallback.title;
  const description = override?.meta_description?.trim() || fallback.description;
  const base = buildAutoSchema(
    'route',
    {
      title,
      description,
      focus_keywords: override?.focus_keywords || '',
      path,
    },
    { basePath: path, routeType: fallback.routeType },
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
