import type { Metadata } from 'next';
import type { Neighborhood, Property } from './supabase';
import { absoluteUrl } from './siteUrl';
import { mergeSchema } from './schemaValidation';
import { ogTitle, ogDescription } from './seo';
import { buildProductPath } from './productPath';

const SITE_NAME = 'BĐS Bình Dương';

// Ngưỡng index thấp hơn area (khu dân cư nhỏ hơn) nhưng vẫn đủ để tránh thin-page.
// Khớp ngưỡng sample của price_stats (3) cho nhất quán.
export const MIN_NEIGHBORHOOD_LISTINGS_FOR_INDEX = 3;

// KHÁC areaSeo: KHÔNG có bản đồ chi tiết hardcode. Nội dung khu dân cư (mô tả,
// tiện ích, hạ tầng, pháp lý…) đến từ DB — cột description + page_blocks admin soạn.
// Tránh bịa dữ liệu (nguyên tắc mục 11 updateweb.md).
export function neighborhoodSummary(n: Pick<Neighborhood, 'name' | 'description'>): string {
  const desc = n.description?.trim();
  if (desc) return desc;
  return `Thông tin khu dân cư ${n.name}: tổng quan, vị trí, giá nhà đất tham khảo, tin đăng mua bán/cho thuê đang hoạt động và tiện ích xung quanh.`;
}

export interface NeighborhoodSeoInput {
  neighborhood: Pick<Neighborhood, 'name' | 'slug'>;
  activeListings: Pick<Property, 'id'>[];
  propertyTypes: string[];
  hasDescription: boolean;
}

export interface NeighborhoodSeoEvaluation {
  indexable: boolean;
  robots: { index: boolean; follow: boolean };
  reasons: string[];
}

// Gate index: có slug/tên/mô tả riêng + đủ tin đăng thật. Thiếu → noindex (nhưng
// follow) và không vào sitemap, để không đẩy trang mỏng lên Google/AI.
export function evaluateNeighborhoodSeo(input: NeighborhoodSeoInput): NeighborhoodSeoEvaluation {
  const reasons: string[] = [];
  if (!input.neighborhood.slug?.trim()) reasons.push('missing_slug');
  if (!input.neighborhood.name?.trim()) reasons.push('missing_name');
  if (!input.hasDescription) reasons.push('missing_unique_description');
  if (input.activeListings.length < MIN_NEIGHBORHOOD_LISTINGS_FOR_INDEX) reasons.push('not_enough_active_listings');

  const indexable = reasons.length === 0;
  return { indexable, robots: { index: indexable, follow: true }, reasons };
}

export function buildNeighborhoodMetadata(n: Neighborhood, summary: string, evaluation: NeighborhoodSeoEvaluation): Metadata {
  const fallbackDescription = summary.length > 155 ? `${summary.slice(0, 152).trim()}...` : summary;
  const title = n.meta_title || `Khu dân cư ${n.name} — giá nhà đất & tin đăng`;
  const description = n.meta_description || fallbackDescription;
  const path = `/khu-dan-cu/${n.slug}`;
  // og:title/description tách khỏi thẻ SEO: dùng nguồn đầy đủ (summary chưa kẹp) để
  // share ra FB/Zalo không "sót chữ". og:desc nới dài hơn meta SEO.
  const ogTtl = ogTitle(title);
  const ogDesc = ogDescription(n.meta_description?.trim() || summary);
  const images = n.image_url ? [{ url: n.image_url, width: 1200, height: 630, alt: ogTtl }] : undefined;
  return {
    title,
    description,
    keywords: n.focus_keywords || undefined,
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
    twitter: { card: 'summary_large_image', title: ogTtl, description: ogDesc, images: n.image_url ? [n.image_url] : undefined },
  };
}

export function buildNeighborhoodCollectionJsonLd(n: Neighborhood, listings: Array<Pick<Property, 'id' | 'title' | 'slug'> & Partial<Pick<Property, 'public_code' | 'listing_type' | 'district' | 'areas'>>>): Record<string, unknown> {
  const url = absoluteUrl(`/khu-dan-cu/${n.slug}`);
  const base: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${url}#collection`,
    name: `Khu dân cư ${n.name}`,
    url,
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
  // Tái dùng target 'area' (đã cho phép CollectionPage/ItemList/Place/BreadcrumbList).
  return mergeSchema(base, n.schema_markup, 'area', ['@context', '@type', '@id', 'name', 'url', 'mainEntity']).schema;
}
