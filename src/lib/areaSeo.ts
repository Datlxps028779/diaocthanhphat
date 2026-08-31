import type { Metadata } from 'next';
import type { Area, Property, PriceStat } from './supabase';
import { absoluteUrl } from './siteUrl';
import { mergeSchema } from './schemaValidation';
import type { FaqItem } from './propertyFaq';
import { buildPriceAnswer } from './priceStatsFormat';
import { ogTitle, ogDescription } from './seo';
import { buildProductPath } from './productPath';
import { SITE_IDENTITY, normalizeSiteBrandText } from './siteIdentity';
const SITE_NAME = SITE_IDENTITY.name;

export const MIN_AREA_LISTINGS_FOR_INDEX = 5;

export interface AreaDetail {
  heroImage: string;
  description: string;
  infrastructure: string[];
  investmentTypes: string[];
  priceRange: string;
  growthPct: number;
  riskLevel: string;
  highlights: string[];
  centerLat: number;
  centerLng: number;
  zoom: number;
}

// Curated area facts are intentionally not kept in source code. Area descriptions,
// images and other public claims must be entered and reviewed in the admin data model.
export function getAreaDetails(_slug: string | null | undefined): AreaDetail | null {
  return null;
}

export function areaSummaryFromData(area: Pick<Area, 'name' | 'description'>, detail: Pick<AreaDetail, 'description'> | null): string {
  const dbDescription = area.description?.trim();
  if (dbDescription) return dbDescription;
  const detailDescription = detail?.description?.trim();
  return detailDescription ?? '';
}

export interface AreaSeoInput {
  area: Pick<Area, 'name' | 'slug'>;
  activeListings: Pick<Property, 'id' | 'district' | 'property_type_id'>[];
  districts: string[];
  propertyTypes: string[];
  hasDescription: boolean;
}

export interface AreaSeoEvaluation {
  indexable: boolean;
  robots: { index: boolean; follow: boolean };
  reasons: string[];
}

export function evaluateAreaSeo(input: AreaSeoInput): AreaSeoEvaluation {
  const reasons: string[] = [];
  if (!input.area.slug?.trim()) reasons.push('missing_slug');
  if (!input.area.name?.trim()) reasons.push('missing_name');
  if (!input.hasDescription) reasons.push('missing_unique_description');
  if (input.activeListings.length < MIN_AREA_LISTINGS_FOR_INDEX) reasons.push('not_enough_active_listings');

  const districtSignals = new Set(input.districts.filter(Boolean));
  const typeSignals = new Set(input.propertyTypes.filter(Boolean));
  const hasDistinctSignals = districtSignals.size >= 2 || typeSignals.size >= 2 || input.activeListings.length >= MIN_AREA_LISTINGS_FOR_INDEX;
  if (!hasDistinctSignals) reasons.push('not_enough_distinct_signals');

  const indexable = reasons.length === 0;
  return { indexable, robots: { index: indexable, follow: true }, reasons };
}

export function buildAreaMetadata(area: Area, summary: string, evaluation: AreaSeoEvaluation): Metadata {
  const fallbackDescription = summary.length > 155 ? `${summary.slice(0, 152).trim()}...` : summary;
  const title = normalizeSiteBrandText(area.meta_title || `Bất động sản ${area.name}`);
  const description = area.meta_description || fallbackDescription;
  const path = `/khu-vuc/${area.slug}`;
  // og:title/description tách khỏi thẻ SEO: dùng nguồn đầy đủ (summary chưa kẹp) để
  // share ra FB/Zalo không "sót chữ". og:desc nới dài hơn meta SEO.
  const ogTtl = ogTitle(title);
  const ogDesc = ogDescription(area.meta_description?.trim() || summary);
  const images = area.image_url ? [{ url: area.image_url, width: 1200, height: 630, alt: ogTtl }] : undefined;
  return {
    title,
    description,
    keywords: area.focus_keywords || undefined,
    alternates: { canonical: path },
    robots: evaluation.robots,
    openGraph: {
      type: 'website',
      title: ogTtl,
      description: ogDesc,
      url: path,
      siteName: SITE_NAME,
      locale: 'vi_VN',
      images,
    },
    twitter: { card: 'summary_large_image', title: ogTtl, description: ogDesc, images: area.image_url ? [area.image_url] : undefined },
  };
}

export function buildAreaCollectionJsonLd(
  area: Area,
  listings: Array<Pick<Property, 'id' | 'title' | 'slug'> & Partial<Pick<Property, 'public_code' | 'listing_type' | 'district' | 'areas'>>>,
  context?: { path: string; name: string },
): Record<string, unknown> {
  const areaUrl = absoluteUrl(context?.path ?? `/khu-vuc/${area.slug}`);
  const base: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${areaUrl}#collection`,
    name: context?.name ?? `Bất động sản ${area.name}`,
    url: areaUrl,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: listings.map((p, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: p.title,
        url: absoluteUrl(buildProductPath(p)),
      })),
    },
  };
  return mergeSchema(base, area.schema_markup, 'area', ['@context', '@type', '@id', 'name', 'url', 'mainEntity']).schema;
}

// FAQ tự-sinh cho trang khu vực — CHỈ từ dữ liệu thật (giá tổng hợp, số tin, hạ tầng
// từ AreaDetail). Câu nào thiếu dữ liệu thì bỏ, không bịa. Trả [] khi không đủ.
export function buildAreaFaq(
  area: Pick<Area, 'name'>,
  opts: { activeCount: number; priceStats: PriceStat[]; detail: AreaDetail | null; summary: string },
): FaqItem[] {
  const items: FaqItem[] = [];
  const { activeCount, priceStats, detail, summary } = opts;

  const priceAnswer = buildPriceAnswer(area.name, priceStats, 'mua_ban') ?? buildPriceAnswer(area.name, priceStats, 'cho_thue');
  if (priceAnswer) {
    items.push({ question: `Giá nhà đất ${area.name} hiện bao nhiêu?`, answer: priceAnswer });
  }

  if (activeCount > 0) {
    items.push({
      question: `${area.name} hiện có bao nhiêu tin bất động sản đang bán?`,
      answer: `Hiện có ${activeCount} tin bất động sản đang hoạt động tại ${area.name}, được cập nhật liên tục từ tin đăng thực tế.`,
    });
  }

  if (detail?.infrastructure?.length) {
    items.push({
      question: `Hạ tầng nổi bật tại ${area.name} gồm những gì?`,
      answer: `Các dự án hạ tầng nổi bật: ${detail.infrastructure.slice(0, 5).join(', ')}.`,
    });
  }

  if (detail?.investmentTypes?.length) {
    items.push({
      question: `Nên đầu tư loại hình bất động sản nào tại ${area.name}?`,
      answer: `Các loại hình phù hợp: ${detail.investmentTypes.slice(0, 5).join(', ')}. ${summary}`.trim(),
    });
  }

  return items;
}
