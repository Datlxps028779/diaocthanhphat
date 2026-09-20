import type { MetadataRoute } from 'next';
import { createClient } from '@supabase/supabase-js';
import { evaluateAreaSeo, evaluateCompositeAreaSeo, getAreaDetails } from '@/lib/areaSeo';
import { evaluateNeighborhoodSeo } from '@/lib/neighborhoodSeo';
import { NEWS_CATEGORY_SLUGS } from '@/lib/newsCategories';
import type { ListingType } from '@/lib/areaPath';
import type { PropertyTypeSeoGroup } from '@/lib/propertyTypeGroups';
import { buildProductPath, isCanonicalProductSource } from '@/lib/productPath';
import { buildLocalityCandidatesFromSnapshot } from '@/lib/localitySitemapGate';
import type { Area } from '@/lib/supabase';
import { isValidSlug } from '@/lib/slug';
import { buildLocalityGeoAreaAllowlist } from '@/lib/localityNewsMatch';
import { serverGetLocalityNews } from '@/lib/supabase-server';

// This is the sitemap submitted to Search Console, so it must never emit a preview
// or deployment origin even when generated during a preview build.
const SITE_URL = 'https://chonhaviet.com';

// Sitemap động — Next tự phục vụ tại /sitemap.xml. Fetch server-side bằng anon key.
// Revalidate 5 phút để landing/product mới xuất hiện nhanh nhưng không biến sitemap
// thành truy vấn DB mỗi request.
export const revalidate = 300;

export type AreaSitemapListing = {
  id: string;
  area_id: string | null;
  district_id?: string | null;
  district: string | null;
  property_type_id: string | null;
  listing_type: ListingType | null;
  title?: string | null;
  updated_at?: string | null;
};

const SITEMAP_PAGE_SIZE = 1000;

type QueryPageResult<T> = { data: T[] | null; error: { message?: string } | null };

type NewsSitemapSource = { id: string; slug?: string | null; updated_at?: string | null };

export function buildNewsSitemapEntries(news: NewsSitemapSource[]): MetadataRoute.Sitemap {
  return news.flatMap((article) => {
    const slug = article.slug?.trim();
    // Search Visibility excludes malformed News slugs. Keep sitemap in the same
    // policy instead of falling back to a raw slug or UUID that is not canonical.
    if (!isValidSlug(slug)) return [];
    return [{
      url: `${SITE_URL}/tin-tuc/${slug}`,
      lastModified: article.updated_at ? new Date(article.updated_at) : undefined,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    }];
  });
}

async function fetchAllRows<T>(loadPage: (from: number, to: number) => PromiseLike<QueryPageResult<T>>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += SITEMAP_PAGE_SIZE) {
    const result = await loadPage(from, from + SITEMAP_PAGE_SIZE - 1);
    if (result.error) throw result.error;
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < SITEMAP_PAGE_SIZE) return rows;
  }
}

export function shouldIncludeCompositeAreaListing(
  area: Pick<Area, 'name' | 'slug' | 'description'>,
  rows: AreaSitemapListing[],
  districtId: string,
  listingType: ListingType,
  group: PropertyTypeSeoGroup,
  propertyTypeIds: ReadonlySet<string>,
): boolean {
  const matching = rows.filter(row => row.district_id === districtId
    && row.listing_type === listingType
    && row.property_type_id !== null
    && propertyTypeIds.has(row.property_type_id));
  const titles = matching.map(row => row.title?.trim()).filter((value): value is string => !!value);
  const evaluation = evaluateCompositeAreaSeo({
    area,
    propertyTypeSlug: group,
    activeCount: matching.length,
    titledCount: titles.length,
    distinctTitleCount: new Set(titles).size,
    taxonomyValid: matching.length > 0 && matching.every(row => Boolean(row.area_id && row.district_id && row.property_type_id)),
    hasDescription: Boolean(area.description?.trim() || getAreaDetails(area.slug)?.description?.trim()),
  });
  return evaluation.indexable;
}

export function shouldIncludeAreaListingType(
  area: Pick<Area, 'name' | 'slug' | 'description'>,
  rows: AreaSitemapListing[],
  listingType: ListingType,
): boolean {
  const typedRows = rows.filter(row => row.listing_type === listingType);
  const detail = getAreaDetails(area.slug);
  return evaluateAreaSeo({
    area,
    activeListings: typedRows,
    districts: Array.from(new Set(typedRows.map(row => row.district).filter((value): value is string => !!value))),
    propertyTypes: Array.from(new Set(typedRows.map(row => row.property_type_id).filter((value): value is string => !!value))),
    hasDescription: Boolean(area.description?.trim() || detail?.description?.trim()),
  }).indexable;
}

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
    // Chỉ đưa Product đủ thành phần canonical vào sitemap: /{lt}/{areaSlug}/
    // {districtSlug?}/{slug}-pr{code}. Nguồn thiếu một phần canonical bị loại,
    // không fallback sang URL legacy/ID vì Search Visibility cũng loại nguồn đó.
    let propRows: Array<{ id: string; slug?: string | null; updated_at?: string | null; public_code?: number | null; listing_type?: string | null; district?: string | null; areas?: { slug?: string | null } | Array<{ slug?: string | null }> | null }> = [];
    try {
      propRows = await fetchAllRows(from => sb.from('public_properties')
        .select('id,slug,updated_at,public_code,listing_type,district,areas(slug)')
        .eq('is_active', true)
        .range(from, from + SITEMAP_PAGE_SIZE - 1));
    } catch {
      propRows = await fetchAllRows(from => sb.from('public_properties')
        .select('id,updated_at')
        .eq('is_active', true)
        .range(from, from + SITEMAP_PAGE_SIZE - 1));
    }
    for (const p of propRows) {
      const areaRelation = Array.isArray(p.areas) ? p.areas[0] : p.areas;
      if (!isCanonicalProductSource({ ...p, areas: areaRelation })) continue;
      entries.push({
        url: `${SITE_URL}${buildProductPath({ ...p, areas: areaRelation })}`,
        lastModified: p.updated_at ? new Date(p.updated_at) : undefined,
        changeFrequency: 'weekly',
        priority: 0.8,
      });
    }

    const areaPropsRows = await fetchAllRows(from => sb.from('public_properties').select('id,area_id,district_id,district,property_type_id,listing_type,title,updated_at').eq('is_active', true).not('area_id', 'is', null).range(from, from + SITEMAP_PAGE_SIZE - 1));
    const areaProps = areaPropsRows as AreaSitemapListing[];
    const latestTimestamp = (rows: AreaSitemapListing[]): Date | undefined => {
      const timestamps = rows
        .map(row => row.updated_at)
        .filter((value): value is string => !!value)
        .map(value => new Date(value))
        .filter(date => Number.isFinite(date.getTime()));
      return timestamps.length ? new Date(Math.max(...timestamps.map(date => date.getTime()))) : undefined;
    };
    const latestByListingType = (listingType: ListingType): Date | undefined => latestTimestamp(areaProps.filter(row => row.listing_type === listingType));
    const latestAll = latestTimestamp(areaProps);
    for (const entry of entries) {
      const path = new URL(entry.url).pathname;
      const latest = path === '/'
        ? latestAll
        : path === '/mua-ban'
          ? latestByListingType('mua_ban')
          : path === '/cho-thue'
            ? latestByListingType('cho_thue')
            : undefined;
      if (latest) entry.lastModified = latest;
    }


    const [nbRes, nbPropsRes] = await Promise.all([
      sb.from('neighborhoods').select('name,slug,description,created_at').limit(5000),
      sb.from('public_properties').select('id,neighborhood_slug,property_type_id').eq('is_active', true).not('neighborhood_slug', 'is', null).limit(5000),
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
    entries.push(...buildNewsSitemapEntries((news.data ?? []) as NewsSitemapSource[]));

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

    const agentProfiles = await sb.rpc('public_list_indexable_agent_profiles');
    for (const profile of (agentProfiles.data ?? []) as Array<{ slug: string }>) {
      if (!profile.slug?.trim()) continue;
      entries.push({
        url: `${SITE_URL}/nguoi-dang-tin/${encodeURIComponent(profile.slug)}`,
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
    // Địa phương dùng snapshot độc lập bên dưới, kể cả khi nguồn phụ này lỗi.
  }

  entries.push(...await buildLocalitySitemapEntries());
  return entries;
}

// Đọc snapshot đầy đủ rồi chỉ giữ candidate qua gate. Lỗi/không hoàn chỉnh → []:
// sitemap không được công bố một phần phạm vi địa phương bằng dữ liệu cắt.
// Import động để module sitemap vẫn nhẹ khi test chỉ cần phần tĩnh/product.
export async function buildLocalitySitemapEntries(): Promise<MetadataRoute.Sitemap> {
  try {
    const { loadLocalitySnapshot } = await import('@/lib/server/localitySnapshot');
    const snapshot = await loadLocalitySnapshot();
    const localityEntries = buildLocalityCandidatesFromSnapshot(snapshot).map(candidate => ({
      url: `${SITE_URL}${candidate.path}`,
      lastModified: candidate.lastModified ? new Date(candidate.lastModified) : undefined,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }));
    const newsEntries = (await Promise.all(snapshot.areas.map(async area => {
      if (!isValidSlug(area.slug) || !area.name?.trim()) return null;
      const news = await serverGetLocalityNews({
        areaId: area.id,
        geoAreaAllowlist: buildLocalityGeoAreaAllowlist(area.name),
        limit: 3,
      });
      if (!news.available || !news.indexable) return null;
      const latest = news.latestUpdatedAt;

      return {
        url: `${SITE_URL}/khu-vuc/${area.slug}/tin-tuc`,
        lastModified: latest ? new Date(latest) : undefined,
        changeFrequency: 'weekly' as const,
        priority: 0.65,
      };
    }))).filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    return [...localityEntries, ...newsEntries];
  } catch {
    return [];
  }
}
