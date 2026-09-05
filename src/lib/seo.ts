import type { Metadata } from 'next';
import type { Property, NewsArticle } from './supabase';
import { buildSeoImageGallery, FALLBACK_PROPERTY_IMAGE, normalizeSeoImageUrl } from './propertyImages';
import { formatPropertyPrice as formatListingPropertyPrice, priceToVnd } from './listingPrice';
import { absoluteUrl, getSiteUrl, normalizePublicImageUrl, publicCanonicalUrl } from './siteUrl';
import { stripHtml, isHtmlContent } from './markdown';
import { buildProductPath } from './productPath';
import { parseLegacyPropertyVideo, youtubeEmbedUrl, youtubeThumbnailUrl } from './videoMedia';
import { normalizeListingTitle } from './listingTitle';
import { SITE_IDENTITY, normalizeSiteBrandText } from './siteIdentity';
import { clampSeoTitle } from './seoText';
import { classifyPropertySegment } from './propertySpecs';

const SITE_URL = getSiteUrl();
const SITE_NAME = SITE_IDENTITY.name;

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
  const name = SITE_NAME;
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
// Ảnh OG mặc định cho các route không tự cung cấp ảnh. Thiếu thẻ này thì FB/Zalo
// hiện thẻ trắng khi chia sẻ. Admin đổi được qua site setting 'og_image'.
export const DEFAULT_OG_IMAGE = FALLBACK_PROPERTY_IMAGE;

export function staticPageMetadata(opts: { title: string; description: string; path: string; ogImage?: string }): Metadata {
  const { title, description, path, ogImage } = opts;
  const normalizedTitle = normalizeSiteBrandText(title);
  const ogTtl = ogTitle(normalizedTitle);
  const ogDesc = ogDescription(description);
  const images = [{ url: ogImage || DEFAULT_OG_IMAGE, width: 1200, height: 630, alt: ogTtl }];
  return {
    title: normalizedTitle,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: 'website',
      title: ogTtl,
      description: ogDesc,
      url: path,
      siteName: SITE_NAME,
      locale: 'vi_VN',
      images,
    },
    twitter: { card: 'summary_large_image', title: ogTtl, description: ogDesc, images: [ogImage || DEFAULT_OG_IMAGE] },
  };
}

// Kẹp chuỗi về khoảng SEO mong muốn, cắt theo ranh giới từ + thêm "…" khi vượt max.
// Chỉ dùng cho thẻ <title>/meta description (SEO cần đúng độ dài để tránh Google cắt).
function clampText(text: string, min: number, max: number): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > min ? cut.slice(0, lastSpace) : cut).trim() + '…';
}

// og:title — KHÔNG kẹp "…" như thẻ <title> SEO. FB/Zalo tự cắt khi hiển thị; ta chỉ
// chặn trần rộng (110) cắt theo ranh giới từ, KHÔNG thêm "…" giữa chừng (trước đây
// dùng chung title kẹp 65 nên share ra bị "sót chữ" trông phản cảm).
export function ogTitle(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length <= 110) return t;
  const cut = t.slice(0, 110);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 60 ? cut.slice(0, lastSpace) : cut).trim();
}

// og:description — dài hơn meta description SEO (FB/Zalo hiển thị được ~200-300 ký
// tự). Cắt theo ranh giới từ, chỉ thêm "…" khi thật sự bị cắt (nội dung còn tiếp).
export function ogDescription(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length <= 300) return t;
  const cut = t.slice(0, 300);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 200 ? cut.slice(0, lastSpace) : cut).trim() + '…';
}

function formatPropertyPrice(p: Property): string {
  return formatListingPropertyPrice(p);
}

function buildPropertyFloorSize(p: Property): Record<string, unknown> | undefined {
  if (p.area_sqm == null || p.area_sqm <= 0) return undefined;
  const segment = classifyPropertySegment(p.property_types);
  if (segment === 'land' || segment === 'other') return undefined;
  return { '@type': 'QuantitativeValue', value: p.area_sqm, unitCode: 'MTK' };
}

// ─── Property → Metadata (Next.js Metadata API) ───────────────────────────────
// Thay cho applyPropertySeo cũ (vốn thao tác DOM). Ưu tiên meta_title/description
// nhập tay, fallback tự sinh deterministic từ dữ liệu thật (loại BĐS + địa danh +
// giá + diện tích), kẹp đúng độ dài SEO để tránh thin/duplicate giữa các tin.
export function buildPropertyMetadata(p: Property): Metadata {
  const listingTitle = normalizeListingTitle(p.title).value;
  const priceStr = formatPropertyPrice(p);
  const typeLabel = p.property_types?.name?.trim() || '';
  const location = [p.district?.trim(), p.city?.trim() || 'Bình Dương'].filter(Boolean).join(', ');
  const listingVerb = p.listing_type === 'cho_thue' ? 'Cho thuê' : 'Bán';

  const titleSource = [`${listingVerb} ${typeLabel || 'bất động sản'}`.trim(), listingTitle, priceStr ? `giá ${priceStr}` : '']
    .filter(Boolean).join(' - ');
  const fallbackTitle = clampText(titleSource, 45, 65);
  const title = normalizeSiteBrandText(p.meta_title?.trim() || fallbackTitle);
  // og:title dùng title đầy đủ (không kẹp "…" như thẻ <title> SEO) để share ra FB/Zalo
  // không bị "sót chữ". Ưu tiên meta_title admin nhập, else nguồn title chưa kẹp.
  const ogTtl = ogTitle(normalizeSiteBrandText(p.meta_title?.trim() || titleSource));

  const descParts = [
    `${typeLabel || 'Bất động sản'} ${listingTitle}${location ? ` tại ${location}` : ''}.`,
    p.area_sqm ? `Diện tích ${p.area_sqm}m².` : '',
    p.bedrooms ? `${p.bedrooms} phòng ngủ.` : '',
    priceStr ? `Giá ${priceStr}.` : '',
    p.legal_status?.trim() ? `Pháp lý ${p.legal_status.trim()}.` : '',
    'Liên hệ xem nhà và tư vấn miễn phí.',
  ].filter(Boolean).join(' ');
  const plainDesc = p.description?.trim()
    ? (isHtmlContent(p.description) ? stripHtml(p.description) : p.description).trim()
    : '';
  const description = p.meta_description?.trim()
    || (plainDesc ? clampText(plainDesc, 120, 160) : clampText(descParts, 120, 160));
  // og:description nới dài hơn meta SEO (FB/Zalo hiển thị được nhiều chữ hơn).
  const ogDesc = ogDescription(p.meta_description?.trim() || plainDesc || descParts);

  const keywords = p.focus_keywords?.trim()
    || [typeLabel || 'bất động sản', p.district?.trim(), p.city?.trim() || 'Bình Dương', listingTitle]
      .filter(Boolean).join(', ');
  const path = buildProductPath(p);
  // OG image: luôn có ảnh (fallback khi tin thiếu ảnh) + ép URL tuyệt đối. Zalo/FB
  // bỏ qua ảnh nếu không phải absolute URL rõ ràng → share ra không hiện thumbnail.
  const realGallery = buildSeoImageGallery(p.image_url, p.images, { max: 1 });
  const ogImage = realGallery[0] || FALLBACK_PROPERTY_IMAGE;

  return {
    title,
    description,
    keywords,
    alternates: { canonical: path },
    openGraph: {
      type: 'article',
      title: ogTtl,
      description: ogDesc,
      url: absoluteUrl(path),
      siteName: SITE_NAME,
      locale: 'vi_VN',
      images: [{ url: ogImage, width: 1200, height: 630, alt: ogTtl }],
    },
    twitter: { card: 'summary_large_image', title: ogTtl, description: ogDesc, images: [ogImage] },
  };
}

// JSON-LD RealEstateListing từ public property snapshot. Schema này là contract v1:
// chỉ dữ liệu canonical và các URL do builder kiểm soát được phép xuất hiện.
export function buildPropertyJsonLd(p: Property): Record<string, unknown> {
  const listingTitle = normalizeListingTitle(p.title).value;
  const url = publicCanonicalUrl(buildProductPath(p));
  const gallery = buildSeoImageGallery(p.image_url, p.images);
  const video = buildPropertyVideoObject(p);
  const floorSize = buildPropertyFloorSize(p);
  // GEO/local: dựng tên địa danh từ dữ liệu thật (phường → quận → thành phố). Chỉ
  // thêm contentLocation/spatialCoverage/about/areaServed khi có dữ liệu, không bịa.
  const placeParts = [p.ward, p.district, p.city].map(s => s?.trim()).filter(Boolean) as string[];
  const geoName = placeParts.join(', ');
  const localityEntity = (p.district?.trim() || p.ward?.trim() || '');
  const vndPrice = priceToVnd(p);
  const base: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    '@id': `${url}#realestatelisting`,
    name: listingTitle,
    description: p.description ? (isHtmlContent(p.description) ? stripHtml(p.description) : p.description) : undefined,
    url,
    mainEntityOfPage: url,
    datePosted: p.created_at,
    dateModified: p.updated_at,
    ...(gallery.length > 0 ? { image: gallery } : {}),
    ...(p.bedrooms != null ? { numberOfRooms: p.bedrooms } : {}),
    ...(vndPrice != null ? {
      offers: {
        '@type': 'Offer',
        price: vndPrice,
        priceCurrency: 'VND',
        availability: 'https://schema.org/InStock',
      },
    } : {}),
    ...(floorSize ? { floorSize } : {}),
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

  return base;
}

function buildPropertyVideoObject(p: Property): Record<string, unknown> | null {
  const video = parseLegacyPropertyVideo(p.video_url, `Video: ${p.title}`);
  if (!video) return null;
  const plainDesc = p.description
    ? (isHtmlContent(p.description) ? stripHtml(p.description) : p.description).trim()
    : '';
  const base = {
    '@type': 'VideoObject',
    name: `Video: ${p.title}`,
    description: plainDesc || p.title,
    uploadDate: p.created_at,
  };
  if (video.kind === 'youtube') {
    return {
      ...base,
      thumbnailUrl: youtubeThumbnailUrl(video.videoId),
      embedUrl: youtubeEmbedUrl(video),
    };
  }
  const gallery = buildSeoImageGallery(p.image_url, p.images, { max: 1 });
  const thumb = gallery[0];
  if (!thumb) return null;
  return { ...base, thumbnailUrl: thumb, contentUrl: video.src };
}

// ─── News → Metadata ──────────────────────────────────────────────────────────
// Meta description tự sinh từ đoạn đầu bài khi admin bỏ trống excerpt/meta_description.
function newsDescriptionFromBody(content?: string | null): string {
  const raw = (content ?? '').trim();
  if (!raw) return '';
  const plain = (isHtmlContent(raw) ? stripHtml(raw) : raw).replace(/\s+/g, ' ').trim();
  if (!plain) return '';
  return plain.length > 155 ? `${plain.slice(0, 152).trimEnd()}…` : plain;
}

// Keywords tự sinh: gộp khu vực/entity GEO để bám địa phương, tránh keyword generic.
function newsKeywordsFallback(a: NewsArticle): string {
  const parts = [a.title, a.geo_area, a.geo_entity, a.category, 'tin tức bất động sản']
    .map(p => (p ?? '').trim())
    .filter(Boolean);
  return [...new Set(parts)].join(', ');
}

export function buildNewsMetadata(a: NewsArticle): Metadata {
  const title = clampSeoTitle(normalizeSiteBrandText(a.meta_title || a.title));
  const description = a.meta_description || a.excerpt || newsDescriptionFromBody(a.content) || a.title;
  const path = `/tin-tuc/${a.slug || a.id}`;
  // og:title ưu tiên headline đầy đủ a.title (meta_title đã bị kẹp ~60 ký tự cho SEO
  // nên share ra FB/Zalo bị cụt giữa chữ). <title> bên dưới vẫn dùng title=meta_title.
  const ogTtl = ogTitle(a.title?.trim() || title);
  // og:description dùng nội dung dài hơn meta SEO: ưu tiên meta_description/excerpt admin
  // nhập, else nới từ đoạn đầu thân bài (FB/Zalo hiển thị được nhiều chữ hơn).
  const plainBody = (isHtmlContent(a.content ?? '') ? stripHtml(a.content ?? '') : (a.content ?? '')).replace(/\s+/g, ' ').trim();
  const ogDesc = ogDescription(a.meta_description?.trim() || a.excerpt?.trim() || plainBody || a.title);
  // OG image: luôn có ảnh (fallback khi bài thiếu ảnh) + ép URL tuyệt đối cho Zalo/FB.
  const ogImage = normalizePublicImageUrl(a.image_url) || FALLBACK_PROPERTY_IMAGE;
  return {
    title,
    description,
    keywords: a.focus_keywords || newsKeywordsFallback(a),
    alternates: { canonical: path },
    openGraph: {
      type: 'article',
      title: ogTtl,
      description: ogDesc,
      url: absoluteUrl(path),
      siteName: SITE_NAME,
      locale: 'vi_VN',
      images: [{ url: ogImage, width: 1200, height: 630, alt: ogTtl }],
      publishedTime: a.published_at || a.created_at,
    },
    twitter: { card: 'summary_large_image', title: ogTtl, description: ogDesc, images: [ogImage] },
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
  const citations = (Array.isArray(a.citations) ? a.citations : [])
    .filter(c => c && c.url && /^https?:\/\//i.test(c.url))
    .map(c => ({ '@type': 'CreativeWork', name: c.title || c.url, url: c.url }));
  const image = normalizeSeoImageUrl(a.image_url);
  const base: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    '@id': `${url}#article`,
    headline: a.title,
    description: a.meta_description ?? a.excerpt ?? undefined,
    ...(image ? { image } : {}),
    datePublished: a.published_at || a.created_at,
    dateModified: a.updated_at,
    author: {
      '@type': a.author_type === 'Person' ? 'Person' : 'Organization',
      name: a.author || SITE_NAME,
      ...(a.author_role?.trim() ? { jobTitle: a.author_role.trim() } : {}),
    },
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
    ...(a.as_of_date ? { temporalCoverage: a.as_of_date } : {}),
    ...(a.reviewer_name?.trim() ? {
      reviewedBy: {
        '@type': 'Person',
        name: a.reviewer_name.trim(),
        ...(a.reviewer_role?.trim() ? { jobTitle: a.reviewer_role.trim() } : {}),
      },
    } : {}),
    ...(a.source_note?.trim() ? { comment: a.source_note.trim() } : {}),
    ...(citations.length ? { citation: citations } : {}),
    speakable: { '@type': 'SpeakableSpecification', cssSelector: ['.article-headline', '.article-excerpt'] },
    contentLocation: { '@type': 'Place', name: geoName },
    spatialCoverage: { '@type': 'Place', name: geoName },
  };
  return base;
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
      item: publicCanonicalUrl(it.path),
    })),
  };
}
