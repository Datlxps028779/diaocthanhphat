import type { Metadata } from 'next';
import type { Property, NewsArticle } from './supabase';
import { buildPropertyGallery, FALLBACK_PROPERTY_IMAGE } from './propertyImages';
import { absoluteUrl, getSiteUrl } from './siteUrl';
import { mergeSchema } from './schemaValidation';
import { stripHtml, isHtmlContent } from './markdown';

const SITE_URL = getSiteUrl();
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

// ─── LocalBusiness/Organization JSON-LD (site-wide) ───────────────────────────
// Làm giàu từ site_settings (địa chỉ/điện thoại/email/logo/social). Chỉ thêm field
// khi giá trị non-empty để tránh schema rỗng bị Google phạt rich result.
export function buildLocalBusinessJsonLd(settings: Record<string, string>): Record<string, unknown> {
  const get = (k: string) => (settings[k] ?? '').trim();
  const name = get('site_name') || SITE_NAME;
  const email = get('email') || get('email_contact');
  const logo = get('site_logo_url') || get('og_image');
  const sameAs = [
    get('facebook_url'), get('youtube_url'), get('tiktok_url'),
    get('social_facebook'), get('social_youtube'), get('social_tiktok'),
    get('social_instagram'), get('social_telegram'),
  ].filter(Boolean);

  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateAgent',
    '@id': `${SITE_URL}/#organization`,
    name,
    url: SITE_URL,
    areaServed: get('geo_area_served') || 'Bình Dương, Việt Nam',
    description: get('organization_description') || get('footer_description')
      || 'Mua bán, cho thuê bất động sản, đất nền sổ đỏ chính chủ tại Bình Dương và khu vực lân cận.',
  };
  if (get('organization_legal_name')) ld.legalName = get('organization_legal_name');
  if (get('knows_about')) ld.knowsAbout = get('knows_about').split(',').map(s => s.trim()).filter(Boolean);
  if (get('phone_main')) ld.telephone = get('phone_main');
  if (email) ld.email = email;
  if (logo) ld.logo = logo;
  if (logo) ld.image = logo;
  if (get('address')) {
    ld.address = {
      '@type': 'PostalAddress',
      streetAddress: get('address'),
      addressRegion: 'Bình Dương',
      addressCountry: 'VN',
    };
  }
  if (sameAs.length > 0) ld.sameAs = sameAs;
  return ld;
}

// ─── Static page → Metadata (DRY cho các route tĩnh) ──────────────────────────
// Bổ sung OG/Twitter riêng cho từng trang (trước đây static route chỉ có
// title/description/canonical → share ra FB/Zalo hiện thẻ generic của site).
export function staticPageMetadata(opts: { title: string; description: string; path: string; ogImage?: string }): Metadata {
  const { title, description, path, ogImage } = opts;
  const images = ogImage ? [{ url: ogImage, width: 1200, height: 630 }] : undefined;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: 'website',
      title,
      description,
      url: path,
      siteName: SITE_NAME,
      locale: 'vi_VN',
      images,
    },
    twitter: { card: 'summary_large_image', title, description, images: ogImage ? [ogImage] : undefined },
  };
}

// Kẹp chuỗi về khoảng SEO mong muốn, cắt theo ranh giới từ + thêm "…" khi vượt max.
function clampText(text: string, min: number, max: number): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > min ? cut.slice(0, lastSpace) : cut).trim() + '…';
}

function formatPropertyPrice(p: Property): string {
  if (p.listing_type === 'cho_thue' && p.price_per_month) return `${p.price_per_month} triệu/tháng`;
  if (p.price) return `${p.price} ${p.price_unit ?? 'tỷ'}`;
  return '';
}

// ─── Property → Metadata (Next.js Metadata API) ───────────────────────────────
// Thay cho applyPropertySeo cũ (vốn thao tác DOM). Ưu tiên meta_title/description
// nhập tay, fallback tự sinh deterministic từ dữ liệu thật (loại BĐS + địa danh +
// giá + diện tích), kẹp đúng độ dài SEO để tránh thin/duplicate giữa các tin.
export function buildPropertyMetadata(p: Property): Metadata {
  const priceStr = formatPropertyPrice(p);
  const typeLabel = p.property_types?.name?.trim() || '';
  const location = [p.district?.trim(), p.city?.trim() || 'Bình Dương'].filter(Boolean).join(', ');
  const listingVerb = p.listing_type === 'cho_thue' ? 'Cho thuê' : 'Bán';

  const fallbackTitle = clampText(
    [`${listingVerb} ${typeLabel || 'bất động sản'}`.trim(), p.title, priceStr ? `giá ${priceStr}` : '']
      .filter(Boolean).join(' - '),
    45, 65,
  );
  const title = p.meta_title?.trim() || fallbackTitle;

  const descParts = [
    `${typeLabel || 'Bất động sản'} ${p.title}${location ? ` tại ${location}` : ''}.`,
    p.area_sqm ? `Diện tích ${p.area_sqm}m².` : '',
    p.bedrooms ? `${p.bedrooms} phòng ngủ.` : '',
    priceStr ? `Giá ${priceStr}.` : '',
    p.legal_status?.trim() ? `Pháp lý ${p.legal_status.trim()}.` : '',
    'Liên hệ xem nhà và tư vấn miễn phí.',
  ].filter(Boolean).join(' ');
  const description = p.meta_description?.trim()
    || (p.description?.trim() ? clampText(p.description, 120, 160) : clampText(descParts, 120, 160));

  const keywords = p.focus_keywords?.trim()
    || [typeLabel || 'bất động sản', p.district?.trim(), p.city?.trim() || 'Bình Dương', p.title]
      .filter(Boolean).join(', ');
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
  const url = absoluteUrl(`/bat-dong-san/${(p.slug && p.slug.trim()) || p.id}`);
  const gallery = buildPropertyGallery(p.image_url, p.images).filter(u => u !== FALLBACK_PROPERTY_IMAGE);
  const video = buildPropertyVideoObject(p);
  // GEO/local: dựng tên địa danh từ dữ liệu thật (phường → quận → thành phố). Chỉ
  // thêm contentLocation/spatialCoverage/about/areaServed khi có dữ liệu, không bịa.
  const placeParts = [p.ward, p.district, p.city].map(s => s?.trim()).filter(Boolean) as string[];
  const geoName = placeParts.join(', ');
  const localityEntity = (p.district?.trim() || p.ward?.trim() || '');
  const base: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    '@id': `${url}#realestatelisting`,
    name: p.title,
    description: p.description ?? undefined,
    url,
    mainEntityOfPage: url,
    datePosted: p.created_at,
    dateModified: p.updated_at,
    ...(gallery.length > 0 ? { image: gallery } : {}),
    ...(p.bedrooms != null ? { numberOfRooms: p.bedrooms } : {}),
    ...(p.price ? {
      offers: {
        '@type': 'Offer',
        price: p.listing_type === 'cho_thue' && p.price_per_month ? p.price_per_month : p.price,
        priceCurrency: 'VND',
        availability: 'https://schema.org/InStock',
      },
    } : {}),
    ...(p.area_sqm ? {
      floorSize: { '@type': 'QuantitativeValue', value: p.area_sqm, unitCode: 'MTK' },
    } : {}),
    address: {
      '@type': 'PostalAddress',
      streetAddress: p.address ?? p.formatted_address ?? undefined,
      addressLocality: p.district ?? undefined,
      addressRegion: p.city ?? 'Bình Dương',
      addressCountry: 'VN',
    },
    ...(p.latitude && p.longitude ? {
      geo: { '@type': 'GeoCoordinates', latitude: p.latitude, longitude: p.longitude },
    } : {}),
    ...(geoName ? {
      contentLocation: { '@type': 'Place', name: geoName },
      spatialCoverage: { '@type': 'Place', name: geoName },
    } : {}),
    ...(localityEntity ? { about: [{ '@type': 'Place', name: localityEntity }] } : {}),
    ...(p.city?.trim() || p.district?.trim() ? { areaServed: (p.district?.trim() || p.city?.trim()) } : {}),
    ...(video ? { video } : {}),
  };

  return mergeSchema(base, p.schema_markup, 'property', [
    '@context', '@type', '@id', 'name', 'url', 'mainEntityOfPage', 'datePosted', 'dateModified', 'offers', 'address', 'geo',
    'contentLocation', 'spatialCoverage', 'about', 'areaServed',
  ]).schema;
}

function youtubeId(u: string): string | null {
  const m = u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

function buildPropertyVideoObject(p: Property): Record<string, unknown> | null {
  const src = p.video_url?.trim();
  if (!src) return null;
  const base = {
    '@type': 'VideoObject',
    name: `Video: ${p.title}`,
    description: p.description ?? p.title,
    uploadDate: p.created_at,
  };
  const yt = youtubeId(src);
  if (yt) {
    return {
      ...base,
      thumbnailUrl: `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`,
      embedUrl: `https://www.youtube.com/embed/${yt}`,
    };
  }
  const thumb = p.image_url?.trim();
  if (!thumb) return null;
  return { ...base, thumbnailUrl: thumb, contentUrl: src };
}

// ─── News → Metadata ──────────────────────────────────────────────────────────
export function buildNewsMetadata(a: NewsArticle): Metadata {
  const title = a.meta_title || a.title;
  const description = a.meta_description || a.excerpt || a.title;
  const path = `/tin-tuc/${a.slug || a.id}`;
  const images = a.image_url ? [{ url: a.image_url, width: 1200, height: 630 }] : undefined;
  return {
    title,
    description,
    keywords: a.focus_keywords || `tin tức bất động sản, ${a.title}`,
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

export function buildNewsJsonLd(a: NewsArticle, settings?: Record<string, string>): Record<string, unknown> {
  const url = absoluteUrl(`/tin-tuc/${a.slug || a.id}`);
  const rawBody = a.content ?? '';
  const plainBody = rawBody ? (isHtmlContent(rawBody) ? stripHtml(rawBody) : rawBody).trim() : '';
  const wordCount = plainBody ? plainBody.split(/\s+/).filter(Boolean).length : 0;
  const keywords = (a.focus_keywords ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const geoName = (a.geo_area?.trim() || settings?.geo_area_served || '').trim() || 'Bình Dương, Việt Nam';
  const geoEntity = a.geo_entity?.trim() || undefined;
  const geoNotes = a.geo_notes?.trim() || undefined;
  const citations = (a.citations ?? [])
    .filter(c => c && c.url && /^https?:\/\//i.test(c.url))
    .map(c => ({ '@type': 'CreativeWork', name: c.title || c.url, url: c.url }));
  const base: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    '@id': `${url}#article`,
    headline: a.title,
    description: a.excerpt ?? a.meta_description ?? undefined,
    image: a.image_url ?? undefined,
    datePublished: a.created_at,
    dateModified: a.updated_at,
    author: { '@type': 'Organization', name: a.author || SITE_NAME },
    publisher: { '@type': 'Organization', '@id': `${SITE_URL}/#organization`, name: SITE_NAME },
    mainEntityOfPage: url,
    url,
    inLanguage: 'vi-VN',
    ...(plainBody ? { articleBody: plainBody.slice(0, 5000) } : {}),
    ...(wordCount ? { wordCount } : {}),
    ...(keywords.length ? { keywords } : {}),
    ...(a.geo_area ? { articleSection: a.geo_area } : {}),
    ...(geoEntity ? { about: [{ '@type': 'Thing', name: geoEntity }] } : {}),
    ...(geoNotes ? { mentions: [{ '@type': 'Thing', name: geoNotes }] } : {}),
    ...(citations.length ? { citation: citations } : {}),
    speakable: { '@type': 'SpeakableSpecification', cssSelector: ['.article-headline', '.article-excerpt'] },
    contentLocation: { '@type': 'Place', name: geoName },
    spatialCoverage: { '@type': 'Place', name: geoName },
  };
  return mergeSchema(base, a.schema_markup, 'news', [
    '@context', '@type', '@id', 'headline', 'url', 'mainEntityOfPage', 'datePublished', 'dateModified', 'publisher',
    'inLanguage', 'articleBody', 'wordCount', 'contentLocation', 'spatialCoverage', 'articleSection', 'about', 'mentions', 'citation',
  ]).schema;
}

export const buildArticleJsonLd = buildNewsJsonLd;

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
