import type { NewsArticle, Property } from './supabase';
import { normalizePublicImageUrl } from './siteUrl';

export const FALLBACK_PROPERTY_IMAGE = 'https://images.pexels.com/photos/106399/pexels-photo-106399.jpeg';

type GalleryOptions = { includeFallback?: boolean; max?: number };

export function normalizeSeoImageUrl(url: string | null | undefined): string {
  const normalized = normalizePublicImageUrl(url);
  return normalized && normalized !== FALLBACK_PROPERTY_IMAGE ? normalized : normalized;
}

export function buildSeoImageGallery(
  imageUrl: string | null | undefined,
  images: Array<string | null | undefined> | null | undefined,
  options: GalleryOptions = {},
): string[] {
  const { includeFallback = false, max } = options;
  const seen = new Set<string>();
  const gallery: string[] = [];
  for (const raw of [imageUrl, ...(images ?? [])]) {
    const url = normalizeSeoImageUrl(raw);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    gallery.push(url);
    if (max && gallery.length >= max) return gallery;
  }
  if (includeFallback && gallery.length === 0) return [FALLBACK_PROPERTY_IMAGE];
  return gallery;
}

export function buildPropertyGallery(
  imageUrl: string | null | undefined,
  images: Array<string | null | undefined> | null | undefined,
): string[] {
  const gallery = buildSeoImageGallery(imageUrl, images);
  return gallery.length > 0 ? gallery : [FALLBACK_PROPERTY_IMAGE];
}

export function buildPropertyImageAlt(property: Pick<Property, 'title' | 'ward' | 'district' | 'city'>, index?: number): string {
  const location = [property.ward, property.district, property.city]
    .map(s => s?.trim())
    .filter(Boolean)
    .join(', ');
  const base = [property.title?.trim(), location ? `tại ${location}` : ''].filter(Boolean).join(' ');
  return [base || 'Ảnh bất động sản', index != null ? `- ảnh ${index + 1}` : ''].filter(Boolean).join(' ');
}

export function buildNewsImageAlt(article: Pick<NewsArticle, 'title' | 'category' | 'geo_area'>): string {
  const context = [article.category?.trim(), article.geo_area?.trim()].filter(Boolean).join(' - ');
  return `Ảnh minh họa bài viết: ${article.title}${context ? ` (${context})` : ''}`;
}
