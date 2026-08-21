import { buildAreaListingPath, type ListingType } from '../areaPath';
import { evaluateAreaSeo, getAreaDetails } from '../areaSeo';
import { evaluateNeighborhoodSeo } from '../neighborhoodSeo';
import { NEWS_CATEGORY_SLUGS } from '../newsCategories';
import { buildProductPath } from '../productPath';
import { absoluteUrl } from '../siteUrl';

export type SearchVisibilityEntityType =
  | 'static'
  | 'property'
  | 'news'
  | 'area'
  | 'area_listing'
  | 'neighborhood'
  | 'news_category'
  | 'managed_page';

export type SearchVisibilityReasonCode =
  | 'ELIGIBLE'
  | 'INACTIVE_PROPERTY'
  | 'UNPUBLISHED_NEWS'
  | 'QUALITY_GATE_FAILED'
  | 'MISSING_REQUIRED_SOURCE'
  | 'UNSUPPORTED_ENTITY';

export interface SearchVisibilityCandidate {
  sourceKey: string;
  entityType: SearchVisibilityEntityType;
  entityId: string | null;
  canonicalPath: string | null;
  canonicalUrl: string | null;
  eligible: boolean;
  reasonCode: SearchVisibilityReasonCode;
  reasonDetail: string | null;
  contentUpdatedAt: string | null;
}

export interface SearchVisibilityProperty {
  id: string;
  slug: string | null;
  public_code: number | null;
  listing_type: string | null;
  district: string | null;
  is_active: boolean;
  updated_at: string | null;
  property_type_id?: string | null;
  areas: { slug: string | null } | null;
  neighborhood_slug?: string | null;
}

export interface SearchVisibilityArea {
  id: string;
  name: string | null;
  slug: string | null;
  description: string | null;
  created_at: string | null;
  updated_at?: string | null;
}

export interface SearchVisibilityNeighborhood {
  id: string;
  name: string | null;
  slug: string | null;
  description: string | null;
  created_at: string | null;
  updated_at?: string | null;
}

export interface SearchVisibilityNews {
  id: string;
  slug: string | null;
  is_published: boolean;
  updated_at: string | null;
}

export interface SearchVisibilityNewsCategory {
  id?: string;
  slug: string | null;
  updated_at?: string | null;
}

export interface SearchVisibilityManagedPage {
  id: string;
  slug: string | null;
  is_active: boolean;
  is_system: boolean;
  updated_at: string | null;
}

export interface SearchVisibilitySources {
  properties: SearchVisibilityProperty[];
  areas: SearchVisibilityArea[];
  neighborhoods: SearchVisibilityNeighborhood[];
  news: SearchVisibilityNews[];
  newsCategories: SearchVisibilityNewsCategory[];
  managedPages: SearchVisibilityManagedPage[];
}

const STATIC_PATHS = [
  '/', '/danh-sach', '/mua-ban', '/cho-thue', '/du-an', '/dau-tu', '/khu-vuc',
  '/khu-dan-cu', '/du-lieu-gia', '/dinh-gia', '/so-sanh', '/tin-tuc', '/kien-thuc',
  '/ve-chung-toi',
] as const;

const AREA_LISTING_TYPES: ListingType[] = ['mua_ban', 'cho_thue'];

function validSlug(value: string | null | undefined): value is string {
  return Boolean(value?.trim() && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.trim()));
}

function candidate(input: Omit<SearchVisibilityCandidate, 'canonicalUrl'>): SearchVisibilityCandidate {
  return {
    ...input,
    canonicalUrl: input.canonicalPath ? absoluteUrl(input.canonicalPath) : null,
  };
}

function excluded(
  sourceKey: string,
  entityType: SearchVisibilityEntityType,
  entityId: string | null,
  reasonCode: Exclude<SearchVisibilityReasonCode, 'ELIGIBLE'>,
  reasonDetail: string,
  contentUpdatedAt: string | null,
  canonicalPath: string | null = null,
): SearchVisibilityCandidate {
  return candidate({
    sourceKey,
    entityType,
    entityId,
    canonicalPath,
    eligible: false,
    reasonCode,
    reasonDetail,
    contentUpdatedAt,
  });
}

function eligible(
  sourceKey: string,
  entityType: SearchVisibilityEntityType,
  entityId: string | null,
  canonicalPath: string,
  contentUpdatedAt: string | null,
): SearchVisibilityCandidate {
  return candidate({
    sourceKey,
    entityType,
    entityId,
    canonicalPath,
    eligible: true,
    reasonCode: 'ELIGIBLE',
    reasonDetail: null,
    contentUpdatedAt,
  });
}

function buildAreaCandidates(area: SearchVisibilityArea, properties: SearchVisibilityProperty[]): SearchVisibilityCandidate[] {
  const sourceKey = `area:${area.id}`;
  if (!validSlug(area.slug) || !area.name?.trim()) {
    return [excluded(sourceKey, 'area', area.id, 'MISSING_REQUIRED_SOURCE', 'Khu vực thiếu slug hoặc tên hợp lệ.', area.updated_at ?? area.created_at)];
  }

  const rows = properties.filter(property => property.is_active && property.areas?.slug === area.slug);
  const evaluation = evaluateAreaSeo({
    area: { name: area.name, slug: area.slug },
    activeListings: rows.map(row => ({ id: row.id, district: row.district, property_type_id: row.property_type_id ?? null })),
    districts: rows.map(row => row.district).filter((value): value is string => Boolean(value?.trim())),
    propertyTypes: rows.map(row => row.property_type_id).filter((value): value is string => Boolean(value?.trim())),
    hasDescription: Boolean(area.description?.trim() || getAreaDetails(area.slug)?.description?.trim()),
  });
  if (!evaluation.indexable) {
    return [excluded(sourceKey, 'area', area.id, 'QUALITY_GATE_FAILED', evaluation.reasons.join(', '), area.updated_at ?? area.created_at)];
  }

  const updatedAt = area.updated_at ?? area.created_at;
  return [
    eligible(sourceKey, 'area', area.id, `/khu-vuc/${area.slug}`, updatedAt),
    ...AREA_LISTING_TYPES.map(listingType => eligible(
      `area_listing:${listingType}:${area.id}`,
      'area_listing',
      area.id,
      buildAreaListingPath({ listingType, areaSlug: area.slug as string }),
      updatedAt,
    )),
  ];
}

function buildNeighborhoodCandidate(neighborhood: SearchVisibilityNeighborhood, properties: SearchVisibilityProperty[]): SearchVisibilityCandidate {
  const sourceKey = `neighborhood:${neighborhood.id}`;
  if (!validSlug(neighborhood.slug) || !neighborhood.name?.trim()) {
    return excluded(sourceKey, 'neighborhood', neighborhood.id, 'MISSING_REQUIRED_SOURCE', 'Khu dân cư thiếu slug hoặc tên hợp lệ.', neighborhood.updated_at ?? neighborhood.created_at);
  }
  const matching = properties.filter(property => property.neighborhood_slug === neighborhood.slug && property.is_active);
  const evaluation = evaluateNeighborhoodSeo({
    neighborhood: { name: neighborhood.name, slug: neighborhood.slug },
    activeListings: matching.map(row => ({ id: row.id })),
    propertyTypes: matching.map(row => row.property_type_id).filter((value): value is string => Boolean(value?.trim())),
    hasDescription: Boolean(neighborhood.description?.trim()),
  });
  if (!evaluation.indexable) {
    return excluded(sourceKey, 'neighborhood', neighborhood.id, 'QUALITY_GATE_FAILED', evaluation.reasons.join(', '), neighborhood.updated_at ?? neighborhood.created_at);
  }
  return eligible(sourceKey, 'neighborhood', neighborhood.id, `/khu-dan-cu/${neighborhood.slug}`, neighborhood.updated_at ?? neighborhood.created_at);
}

function staticSourceKey(path: string): string {
  return `static:${path === '/' ? 'home' : path.slice(1).replaceAll('/', '_')}`;
}

export function buildSearchVisibilityCandidates(sources: SearchVisibilitySources): SearchVisibilityCandidate[] {
  const candidates: SearchVisibilityCandidate[] = [
    ...STATIC_PATHS.map(path => eligible(staticSourceKey(path), 'static', null, path, null)),
    ...NEWS_CATEGORY_SLUGS.map(slug => eligible(`news_category:static:${slug}`, 'news_category', null, `/tin-tuc/danh-muc/${slug}`, null)),
  ];

  for (const property of sources.properties) {
    const key = `property:${property.id}`;
    if (!property.is_active) {
      candidates.push(excluded(key, 'property', property.id, 'INACTIVE_PROPERTY', 'Tin đăng không còn active.', property.updated_at));
      continue;
    }
    const path = buildProductPath(property);
    const hasCanonicalParts = Boolean(
      property.public_code && validSlug(property.slug) && validSlug(property.areas?.slug)
      && (property.listing_type === 'mua_ban' || property.listing_type === 'cho_thue'),
    );
    candidates.push(hasCanonicalParts
      ? eligible(key, 'property', property.id, path, property.updated_at)
      : excluded(key, 'property', property.id, 'MISSING_REQUIRED_SOURCE', 'Tin active thiếu thành phần URL canonical.', property.updated_at, path));
  }

  for (const area of sources.areas) candidates.push(...buildAreaCandidates(area, sources.properties));
  for (const neighborhood of sources.neighborhoods) candidates.push(buildNeighborhoodCandidate(neighborhood, sources.properties));

  for (const article of sources.news) {
    const key = `news:${article.id}`;
    if (!article.is_published) {
      candidates.push(excluded(key, 'news', article.id, 'UNPUBLISHED_NEWS', 'Bài viết chưa published.', article.updated_at));
    } else if (!validSlug(article.slug)) {
      candidates.push(excluded(key, 'news', article.id, 'MISSING_REQUIRED_SOURCE', 'Bài viết published thiếu slug hợp lệ.', article.updated_at));
    } else {
      candidates.push(eligible(key, 'news', article.id, `/tin-tuc/${article.slug}`, article.updated_at));
    }
  }

  const staticCategories = new Set(NEWS_CATEGORY_SLUGS);
  for (const category of sources.newsCategories) {
    if (!validSlug(category.slug) || staticCategories.has(category.slug)) continue;
    candidates.push(eligible(`news_category:${category.id ?? category.slug}`, 'news_category', category.id ?? null, `/tin-tuc/danh-muc/${category.slug}`, category.updated_at ?? null));
  }

  for (const page of sources.managedPages) {
    const key = `managed_page:${page.id}`;
    if (!page.is_active || page.is_system) {
      candidates.push(excluded(key, 'managed_page', page.id, 'UNSUPPORTED_ENTITY', page.is_system ? 'Trang hệ thống không được public sitemap.' : 'Trang quản lý không active.', page.updated_at));
    } else if (!validSlug(page.slug)) {
      candidates.push(excluded(key, 'managed_page', page.id, 'MISSING_REQUIRED_SOURCE', 'Trang public thiếu slug hợp lệ.', page.updated_at));
    } else {
      candidates.push(eligible(key, 'managed_page', page.id, `/trang/${page.slug}`, page.updated_at));
    }
  }

  return candidates.sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));
}

export function summarizeSearchVisibility(candidates: SearchVisibilityCandidate[]) {
  const byReason: Record<string, number> = {};
  const byEntity: Record<string, { eligible: number; excluded: number }> = {};
  for (const item of candidates) {
    byReason[item.reasonCode] = (byReason[item.reasonCode] ?? 0) + 1;
    const entry = byEntity[item.entityType] ?? { eligible: 0, excluded: 0 };
    if (item.eligible) entry.eligible += 1;
    else entry.excluded += 1;
    byEntity[item.entityType] = entry;
  }
  return {
    total: candidates.length,
    eligible: candidates.filter(item => item.eligible).length,
    excluded: candidates.filter(item => !item.eligible).length,
    byReason,
    byEntity,
  };
}
