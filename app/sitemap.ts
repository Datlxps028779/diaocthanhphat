import type { MetadataRoute } from 'next';
import { createClient } from '@supabase/supabase-js';
import { evaluateAreaSeo, getAreaDetails } from '@/lib/areaSeo';
import { evaluateNeighborhoodSeo } from '@/lib/neighborhoodSeo';
import { NEWS_CATEGORY_SLUGS } from '@/lib/newsCategories';
import { buildAreaListingPath, type ListingType } from '@/lib/areaPath';
import { buildProductPath } from '@/lib/productPath';

// This is the sitemap submitted to Search Console, so it must never emit a preview
// or deployment origin even when generated during a preview build.
const SITE_URL = 'https://chonhaviet.com';
const AREA_LISTING_TYPES: ListingType[] = ['mua_ban', 'cho_thue'];

// Sitemap động — Next tự phục vụ tại /sitemap.xml. Fetch server-side bằng anon key.
// Revalidate mỗi giờ để tin mới xuất hiện mà không cần rebuild.
export const revalidate = 3600;

const STATIC: MetadataRoute.Sitemap = [
  { url: `${SITE_URL}/`, changeFrequency: 'daily', priority: 1.0 },
  { url: `${SITE_URL}/danh-sach`, changeFrequency: 'daily', priority: 0.9 },
  { url: `${SITE_URL}/mua-ban`, changeFrequency: 'daily', priority: 0.9 },
  { url: `${SITE_URL}/cho-thue`, changeFrequency: 'daily', priority: 0.9 },
  { url: `${SITE_URL}/du-an`, changeFrequency: 'weekly', priority: 0.7 },
  { url: `${SITE_URL}/dau-tu`, changeFrequency: 'weekly', priority: 0.7 },
  { url: `${SITE_URL}/khu-vuc`, changeFrequency: 'weekly', priority: 0.6 },
  { url: `${SITE_URL}/khu-dan-cu`, changeFrequency: 'weekly', priority: 0.6 },
  { url: `${SITE_URL}/du-lieu-gia`, changeFrequency: 'daily', priority: 0.7 },
  { url: `${SITE_URL}/dinh-gia`, changeFrequency: 'weekly', priority: 0.6 },
  { url: `${SITE_URL}/so-sanh`, changeFrequency: 'weekly', priority: 0.6 },
  { url: `${SITE_URL}/tin-tuc`, changeFrequency: 'daily', priority: 0.7 },
  { url: `${SITE_URL}/kien-thuc`, changeFrequency: 'weekly', priority: 0.6 },
  ...NEWS_CATEGORY_SLUGS.map((slug) => ({
    url: `${SITE_URL}/tin-tuc/danh-muc/${slug}`,
    changeFrequency: 'weekly' as const,
    priority: 0.55,
  })),
  { url: `${SITE_URL}/ve-chung-toi`, changeFrequency: 'monthly', priority: 0.5 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return STATIC;

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const entries: MetadataRoute.Sitemap = [...STATIC];

  try {
    // Lấy đủ field để buildProductPath dựng URL mới /{lt}/{areaSlug}/{districtSlug?}/
    // {slug}-pr{code}. Tin thiếu public_code/areas.slug/listing_type → fallback URL cũ
    // (buildProductPath tự xử lý). Fallback select gọn nếu cột mới chưa tồn tại.
    let propRows: Array<{ id: string; slug?: string | null; updated_at?: string | null; public_code?: number | null; listing_type?: string | null; district?: string | null; areas?: { slug?: string | null } | null }> = [];
    const full = await sb.from('properties').select('id,slug,updated_at,public_code,listing_type,district,areas(slug)').eq('is_active', true).limit(5000);
    if (full.error) {
      const noSlug = await sb.from('properties').select('id,updated_at').eq('is_active', true).limit(5000);
      propRows = (noSlug.data ?? []) as typeof propRows;
    } else {
      propRows = (full.data ?? []) as typeof propRows;
    }
    for (const p of propRows) {
      entries.push({
        url: `${SITE_URL}${buildProductPath(p)}`,
        lastModified: p.updated_at ? new Date(p.updated_at) : undefined,
        changeFrequency: 'weekly',
        priority: 0.8,
      });
    }

    const [areasRes, areaPropsRes] = await Promise.all([
      sb.from('areas').select('id,name,slug,description,created_at').limit(5000),
      sb.from('properties').select('id,area_id,district,property_type_id').eq('is_active', true).not('area_id', 'is', null).limit(5000),
    ]);
    const areaProps = (areaPropsRes.data ?? []) as Array<{ id: string; area_id: string | null; district: string | null; property_type_id: string | null }>;
    for (const area of (areasRes.data ?? []) as Array<{ id: string; name: string; slug: string; description: string | null; created_at?: string | null }>) {
      const rows = areaProps.filter(p => p.area_id === area.id);
      const detail = getAreaDetails(area.slug);
      const evaluation = evaluateAreaSeo({
        area,
        activeListings: rows,
        districts: Array.from(new Set(rows.map(r => r.district).filter((v): v is string => !!v))),
        propertyTypes: Array.from(new Set(rows.map(r => r.property_type_id).filter((v): v is string => !!v))),
        hasDescription: Boolean(area.description?.trim() || detail?.description?.trim()),
      });
      if (evaluation.indexable) {
        const lastModified = area.created_at ? new Date(area.created_at) : undefined;
        entries.push({
          url: `${SITE_URL}/khu-vuc/${area.slug}`,
          lastModified,
          changeFrequency: 'weekly',
          priority: 0.65,
        });
        // URL listing area-level mới: /mua-ban/{areaSlug}, /cho-thue/{areaSlug}.
        // Chỉ đưa vào sitemap khi area đã qua quality-gate. District-level hiện noindex
        // có chủ đích nên không đưa vào sitemap để tránh sitemap chứa URL noindex.
        for (const listingType of AREA_LISTING_TYPES) {
          entries.push({
            url: `${SITE_URL}${buildAreaListingPath({ listingType, areaSlug: area.slug })}`,
            lastModified,
            changeFrequency: 'daily',
            priority: 0.72,
          });
        }
      }
    }

    const [nbRes, nbPropsRes] = await Promise.all([
      sb.from('neighborhoods').select('name,slug,description,created_at').limit(5000),
      sb.from('properties').select('id,neighborhood_slug,property_type_id').eq('is_active', true).not('neighborhood_slug', 'is', null).limit(5000),
    ]);
    const nbProps = (nbPropsRes.data ?? []) as Array<{ id: string; neighborhood_slug: string | null; property_type_id: string | null }>;
    for (const nb of (nbRes.data ?? []) as Array<{ name: string; slug: string; description: string | null; created_at?: string | null }>) {
      const rows = nbProps.filter(p => p.neighborhood_slug === nb.slug);
      const evaluation = evaluateNeighborhoodSeo({
        neighborhood: nb,
        activeListings: rows,
        propertyTypes: Array.from(new Set(rows.map(r => r.property_type_id).filter((v): v is string => !!v))),
        hasDescription: Boolean(nb.description?.trim()),
      });
      if (evaluation.indexable) {
        entries.push({
          url: `${SITE_URL}/khu-dan-cu/${nb.slug}`,
          lastModified: nb.created_at ? new Date(nb.created_at) : undefined,
          changeFrequency: 'weekly',
          priority: 0.6,
        });
      }
    }

    const news = await sb.from('news').select('id,slug,updated_at').eq('is_published', true).limit(5000);
    for (const n of (news.data ?? []) as Array<{ id: string; slug?: string | null; updated_at?: string | null }>) {
      const seg = (n.slug && String(n.slug).trim()) || n.id;
      entries.push({
        url: `${SITE_URL}/tin-tuc/${seg}`,
        lastModified: n.updated_at ? new Date(n.updated_at) : undefined,
        changeFrequency: 'weekly',
        priority: 0.6,
      });
    }

    // Danh mục tin tức động (news_categories): thêm các slug chưa có trong STATIC (STATIC
    // đã liệt 5 slug gốc). Danh mục admin thêm mới sẽ vào sitemap sau revalidate.
    const staticCatSlugs = new Set(NEWS_CATEGORY_SLUGS);
    const catRows = await sb.from('news_categories').select('slug').limit(500);
    for (const c of (catRows.data ?? []) as Array<{ slug: string }>) {
      if (!c.slug || staticCatSlugs.has(c.slug)) continue;
      entries.push({
        url: `${SITE_URL}/tin-tuc/danh-muc/${c.slug}`,
        changeFrequency: 'weekly',
        priority: 0.55,
      });
    }

    const pages = await sb.from('managed_pages').select('slug,updated_at').eq('is_active', true).eq('is_system', false).limit(5000);
    for (const page of (pages.data ?? []) as Array<{ slug: string; updated_at?: string | null }>) {
      entries.push({
        url: `${SITE_URL}/trang/${page.slug}`,
        lastModified: page.updated_at ? new Date(page.updated_at) : undefined,
        changeFrequency: 'monthly',
        priority: 0.45,
      });
    }
  } catch {
    return STATIC;
  }

  return entries;
}
