import type { Metadata } from 'next';
import type { Property, NewsArticle } from './supabase';

const SITE_URL = process.env.SITE_URL || 'https://diaocthanhphat.com';
const SITE_NAME = 'BĐS Bình Dương';

// Serialize JSON-LD an toàn cho <script>. JSON.stringify KHÔNG escape '<' '>' '&'
// nên chuỗi từ dữ liệu người dùng (vd description có "</script><script>...") sẽ
// thoát khỏi thẻ script → stored XSS. Escape sang \uXXXX để vô hại trong HTML.
export function serializeJsonLd(obj: Record<string, unknown>): string {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

// ─── Property → Metadata (Next.js Metadata API) ───────────────────────────────
// Thay cho applyPropertySeo cũ (vốn thao tác DOM). Ưu tiên meta_title/description
// nhập tay, fallback tự sinh. Canonical dùng SITE_URL (server-safe, không window).
export function buildPropertyMetadata(p: Property): Metadata {
  const priceStr = p.price ? `${p.price} ${p.price_unit ?? 'tỷ'}` : '';
  const title = p.meta_title || `${p.title}${priceStr ? ' - ' + priceStr : ''}`;
  const description = p.meta_description
    || p.description
    || `Bất động sản ${p.title} tại ${p.district ?? ''}, ${p.city ?? 'Bình Dương'}. Giá tốt, pháp lý minh bạch. Liên hệ ngay!`;
  const keywords = p.focus_keywords
    || `bất động sản, ${p.city ?? 'Bình Dương'}, ${p.district ?? ''}, ${p.title}`;
  const path = `/bat-dong-san/${(p.slug && p.slug.trim()) || p.id}`;
  const images = p.image_url ? [{ url: p.image_url, width: 1200, height: 630 }] : undefined;

  return {
    title,
    description,
    keywords,
    alternates: { canonical: path },
    openGraph: {
      type: 'article',
      title,
      description,
      url: path,
      siteName: SITE_NAME,
      locale: 'vi_VN',
      images,
    },
    twitter: { card: 'summary_large_image', title, description, images: p.image_url ? [p.image_url] : undefined },
  };
}

// JSON-LD RealEstateListing. Ưu tiên schema_markup nhập tay trong admin; nếu không
// có thì tự dựng. Render trong page.tsx qua <script type="application/ld+json">.
export function buildPropertyJsonLd(p: Property): Record<string, unknown> {
  if (p.schema_markup && typeof p.schema_markup === 'object' && Object.keys(p.schema_markup).length > 0) {
    return p.schema_markup as Record<string, unknown>;
  }
  const url = `${SITE_URL}/bat-dong-san/${(p.slug && p.slug.trim()) || p.id}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name: p.title,
    description: p.description ?? undefined,
    url,
    image: p.image_url ?? undefined,
    datePosted: p.created_at,
    ...(p.price ? {
      offers: {
        '@type': 'Offer',
        price: p.price,
        priceCurrency: 'VND',
        availability: 'https://schema.org/InStock',
      },
    } : {}),
    ...(p.area_sqm ? {
      floorSize: { '@type': 'QuantitativeValue', value: p.area_sqm, unitCode: 'MTK' },
    } : {}),
    address: {
      '@type': 'PostalAddress',
      addressLocality: p.district ?? undefined,
      addressRegion: p.city ?? 'Bình Dương',
      addressCountry: 'VN',
    },
    ...(p.latitude && p.longitude ? {
      geo: { '@type': 'GeoCoordinates', latitude: p.latitude, longitude: p.longitude },
    } : {}),
  };
}

// ─── News → Metadata ──────────────────────────────────────────────────────────
export function buildNewsMetadata(a: NewsArticle): Metadata {
  const title = a.title;
  const description = a.excerpt || a.title;
  const path = `/tin-tuc/${a.slug || a.id}`;
  const images = a.image_url ? [{ url: a.image_url, width: 1200, height: 630 }] : undefined;
  return {
    title,
    description,
    keywords: `tin tức bất động sản, ${a.title}`,
    alternates: { canonical: path },
    openGraph: {
      type: 'article',
      title,
      description,
      url: path,
      siteName: SITE_NAME,
      locale: 'vi_VN',
      images,
      publishedTime: a.created_at,
    },
    twitter: { card: 'summary_large_image', title, description, images: a.image_url ? [a.image_url] : undefined },
  };
}

export function buildArticleJsonLd(a: NewsArticle): Record<string, unknown> {
  const url = `${SITE_URL}/tin-tuc/${a.slug || a.id}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: a.title,
    description: a.excerpt ?? undefined,
    image: a.image_url ?? undefined,
    datePublished: a.created_at,
    dateModified: a.updated_at,
    author: { '@type': 'Organization', name: a.author || SITE_NAME },
    publisher: { '@type': 'Organization', name: SITE_NAME },
    mainEntityOfPage: url,
    url,
  };
}

// BreadcrumbList JSON-LD — Google hiển thị đường dẫn phân cấp trong kết quả tìm
// kiếm thay vì URL trần, tăng CTR. items: [{name, path}] theo thứ tự gốc → hiện tại.
export function buildBreadcrumbJsonLd(items: { name: string; path: string }[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: `${SITE_URL}${it.path}`,
    })),
  };
}
