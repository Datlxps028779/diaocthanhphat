import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { unstable_cache } from 'next/cache';
import type { Property, NewsArticle, NewsListItem, NewsPageResult, Area, District, Neighborhood, PriceStat, PriceStatScope, SeoRouteOverride, ManagedPage, PageBlock, MenuItem, NewsCategoryRow } from './supabase';
import { NEWS_CATEGORIES, categoryToSlug } from './newsCategories';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './env';
import { LISTINGS_PER_PAGE } from './router';
import type { LocationTaxonomy } from './neighborhoodLocation';

// Client Supabase dùng phía SERVER (RSC / generateMetadata / route handler).
// Tạo MỚI mỗi lần gọi, KHÔNG singleton và KHÔNG persist session — tránh chia sẻ
// state giữa các request. Đọc env qua helper (chấp nhận cả NEXT_PUBLIC_* lẫn VITE_*).
function serverClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PROPERTY_SELECT = '*, areas(id,name,slug), property_types(id,name,slug)';

// Tra cứu 1 BĐS theo slug (URL mới) hoặc UUID (link cũ) — dùng cho generateMetadata
// + prefetch initialData ở trang chi tiết. Bọc try/catch: Supabase timeout/rate-limit
// không được throw ra RSC (sẽ văng error boundary "Đã có lỗi xảy ra"); trả null →
// trang gọi notFound() hoặc render bằng client fetch.
export async function serverGetPropertyByIdOrSlug(idOrSlug: string): Promise<Property | null> {
  try {
    const sb = serverClient();
    const col = UUID_RE.test(idOrSlug) ? 'id' : 'slug';
    // Lọc is_active: tin đã ẩn/từ chối/xóa → null → trang gọi notFound() (404),
    // không render thành trang sống (tránh Google index tin đã gỡ). Chuẩn SEO.
    const { data } = await sb
      .from('properties')
      .select(PROPERTY_SELECT)
      .eq(col, idOrSlug)
      .eq('is_active', true)
      .maybeSingle();
    return data as Property | null;
  } catch {
    return null;
  }
}

// Resolve theo public_code (đuôi pr{số} ổn định trên URL mới). Là "chìa khoá thật":
// đổi tiêu đề/khu vực không đổi code → link không vỡ, route tự 301 về canonical mới.
export async function serverGetPropertyByPublicCode(code: number): Promise<Property | null> {
  try {
    const sb = serverClient();
    const { data } = await sb
      .from('properties')
      .select(PROPERTY_SELECT)
      .eq('public_code', code)
      .eq('is_active', true)
      .maybeSingle();
    return data as Property | null;
  } catch {
    return null;
  }
}

export async function serverGetFeaturedProperties(): Promise<Property[]> {
  try {
    const sb = serverClient();
    const { data } = await sb
      .from('properties')
      .select(PROPERTY_SELECT)
      .eq('is_active', true).eq('is_featured', true)
      .order('created_at', { ascending: false }).limit(12);
    return (data ?? []) as Property[];
  } catch {
    return [];
  }
}

export async function serverGetHotProperties(): Promise<Property[]> {
  try {
    const sb = serverClient();
    const { data } = await sb
      .from('properties')
      .select(PROPERTY_SELECT)
      .eq('is_active', true).eq('is_hot', true)
      .order('views', { ascending: false }).limit(8);
    return (data ?? []) as Property[];
  } catch {
    return [];
  }
}

export async function serverGetRecentProperties(limit = 8): Promise<Property[]> {
  try {
    const sb = serverClient();
    const { data } = await sb
      .from('properties')
      .select(PROPERTY_SELECT)
      .eq('is_active', true)
      .order('created_at', { ascending: false }).limit(limit);
    return (data ?? []) as Property[];
  } catch {
    return [];
  }
}

// Listing lượt-xem-đầu (không filter) để crawler thấy danh sách; filter/sort chạy client.
export async function serverGetListings(listingType?: 'mua_ban' | 'cho_thue', limit = LISTINGS_PER_PAGE): Promise<{ data: Property[]; total: number }> {
  try {
    const sb = serverClient();
    let q = sb
      .from('properties')
      .select(PROPERTY_SELECT, { count: 'exact' })
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit);
    if (listingType) q = q.eq('listing_type', listingType);
    const { data, count } = await q;
    return { data: (data ?? []) as Property[], total: count ?? 0 };
  } catch {
    return { data: [], total: 0 };
  }
}

export async function serverGetAreas(): Promise<Area[]> {
  try {
    const sb = serverClient();
    const { data } = await sb.from('areas').select('*').order('order_index', { ascending: true });
    return (data ?? []) as Area[];
  } catch {
    return [];
  }
}

export async function serverGetAreaBySlug(slug: string): Promise<Area | null> {
  try {
    const sb = serverClient();
    const { data } = await sb.from('areas').select('*').eq('slug', slug).maybeSingle();
    return (data as Area | null) ?? null;
  } catch {
    return null;
  }
}

export async function serverGetAreaListings(areaId: string, limit = 12): Promise<Property[]> {
  try {
    const sb = serverClient();
    const { data } = await sb
      .from('properties')
      .select(PROPERTY_SELECT)
      .eq('is_active', true)
      .eq('area_id', areaId)
      .order('created_at', { ascending: false })
      .limit(limit);
    return (data ?? []) as Property[];
  } catch {
    return [];
  }
}

export async function serverGetAreaStats(areaId: string): Promise<{ districts: string[]; propertyTypes: string[]; activeCount: number }> {
  try {
    const sb = serverClient();
    const { data, count } = await sb
      .from('properties')
      .select('district, property_type_id', { count: 'exact' })
      .eq('is_active', true)
      .eq('area_id', areaId)
      .limit(500);
    const rows = (data ?? []) as Array<{ district: string | null; property_type_id: string | null }>;
    return {
      districts: Array.from(new Set(rows.map(r => r.district).filter((v): v is string => !!v))),
      propertyTypes: Array.from(new Set(rows.map(r => r.property_type_id).filter((v): v is string => !!v))),
      activeCount: count ?? rows.length,
    };
  } catch {
    return { districts: [], propertyTypes: [], activeCount: 0 };
  }
}

// Districts (Quận/Huyện) của 1 area — resolve districtSlug trên URL path khu vực
// (/cho-thue/binh-duong/di-an) về id + name thật. Bám khuôn area helpers ở trên.
export async function serverGetDistrictsByArea(areaId: string): Promise<District[]> {
  try {
    const sb = serverClient();
    const { data } = await sb.from('districts').select('*').eq('area_id', areaId).order('order_index', { ascending: true });
    return (data ?? []) as District[];
  } catch {
    return [];
  }
}

// Khu dân cư (Entity Page /khu-dan-cu/{slug}). Bám khuôn area helpers ở trên.
export async function serverGetNeighborhoods(): Promise<Neighborhood[]> {
  try {
    const sb = serverClient();
    const { data } = await sb.from('neighborhoods').select('*').order('order_index', { ascending: true });
    return (data ?? []) as Neighborhood[];
  } catch {
    return [];
  }
}

// Taxonomy 3 cấp cho trang khu dân cư (nhóm theo tỉnh, hiện nhãn đủ cấp). Một lượt
// gọi 3 bảng nhỏ, rẻ hơn join lồng và dùng lại được cho resolveNeighborhoodLocation.
export async function serverGetLocationTaxonomy(): Promise<LocationTaxonomy> {
  try {
    const sb = serverClient();
    const [areas, districts, wards] = await Promise.all([
      sb.from('areas').select('id,name,slug').order('order_index', { ascending: true }),
      sb.from('districts').select('id,area_id,name,slug').order('order_index', { ascending: true }),
      sb.from('wards').select('id,district_id,name,slug').order('order_index', { ascending: true }),
    ]);
    return {
      areas: (areas.data ?? []) as LocationTaxonomy['areas'],
      districts: (districts.data ?? []) as LocationTaxonomy['districts'],
      wards: (wards.data ?? []) as LocationTaxonomy['wards'],
    };
  } catch {
    return { areas: [], districts: [], wards: [] };
  }
}

export async function serverGetNeighborhoodBySlug(slug: string): Promise<Neighborhood | null> {
  try {
    const sb = serverClient();
    const { data } = await sb.from('neighborhoods').select('*').eq('slug', slug).maybeSingle();
    return (data as Neighborhood | null) ?? null;
  } catch {
    return null;
  }
}

export async function serverGetNeighborhoodListings(slug: string, limit = 12): Promise<Property[]> {
  try {
    const sb = serverClient();
    const { data } = await sb
      .from('properties')
      .select(PROPERTY_SELECT)
      .eq('is_active', true)
      .eq('neighborhood_slug', slug)
      .order('created_at', { ascending: false })
      .limit(limit);
    return (data ?? []) as Property[];
  } catch {
    return [];
  }
}

export async function serverGetNeighborhoodStats(slug: string): Promise<{ propertyTypes: string[]; activeCount: number }> {
  try {
    const sb = serverClient();
    const { data, count } = await sb
      .from('properties')
      .select('property_type_id', { count: 'exact' })
      .eq('is_active', true)
      .eq('neighborhood_slug', slug)
      .limit(500);
    const rows = (data ?? []) as Array<{ property_type_id: string | null }>;
    return {
      propertyTypes: Array.from(new Set(rows.map(r => r.property_type_id).filter((v): v is string => !!v))),
      activeCount: count ?? rows.length,
    };
  } catch {
    return { propertyTypes: [], activeCount: 0 };
  }
}

// Dữ liệu giá đã tổng hợp (price_stats) cho 1 scope_key — dùng render Answer Block giá.
export async function serverGetPriceStats(scope: PriceStatScope, scopeKey: string): Promise<PriceStat[]> {
  try {
    const sb = serverClient();
    const { data } = await sb
      .from('price_stats')
      .select('*')
      .eq('scope', scope)
      .eq('scope_key', scopeKey);
    return (data ?? []) as PriceStat[];
  } catch {
    return [];
  }
}

// Giá theo từng phường/xã của 1 khu vực (Tỉnh). Chuỗi: districts(area_id) →
// wards(district_id) → price_stats(scope='ward', scope_key=ward.slug). Chỉ trả về
// phường có ít nhất 1 nhóm giá đủ mẫu (RPC đã gate >=3). Sắp theo tên phường.
export type WardPriceStats = { name: string; slug: string; stats: PriceStat[] };
export async function serverGetAreaWardPriceStats(areaId: string): Promise<WardPriceStats[]> {
  try {
    const sb = serverClient();
    const { data: districts } = await sb.from('districts').select('id').eq('area_id', areaId);
    const districtIds = (districts ?? []).map(d => (d as { id: string }).id);
    if (districtIds.length === 0) return [];

    const { data: wards } = await sb.from('wards').select('name, slug').in('district_id', districtIds).order('order_index');
    const wardRows = (wards ?? []) as Array<{ name: string; slug: string }>;
    if (wardRows.length === 0) return [];

    const { data: stats } = await sb
      .from('price_stats')
      .select('*')
      .eq('scope', 'ward')
      .in('scope_key', wardRows.map(w => w.slug));
    const priceRows = (stats ?? []) as PriceStat[];
    if (priceRows.length === 0) return [];

    const byWard = new Map<string, PriceStat[]>();
    for (const s of priceRows) {
      const arr = byWard.get(s.scope_key) ?? [];
      arr.push(s);
      byWard.set(s.scope_key, arr);
    }
    return wardRows
      .filter(w => byWard.has(w.slug))
      .map(w => ({ name: w.name, slug: w.slug, stats: byWard.get(w.slug)! }))
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  } catch {
    return [];
  }
}

// Toàn bộ dữ liệu giá đã tổng hợp — cho hub /du-lieu-gia. Caller tự nhóm theo scope/scope_key.
export async function serverGetAllPriceStats(): Promise<PriceStat[]> {
  try {
    const sb = serverClient();
    const { data } = await sb.from('price_stats').select('*').order('sample_count', { ascending: false }).limit(2000);
    return (data ?? []) as PriceStat[];
  } catch {
    return [];
  }
}

// Menu điều hướng động — cho SSR Header. Rỗng → FE fallback về menu hardcode.
export async function serverGetMenuItems(): Promise<MenuItem[]> {
  try {
    const sb = serverClient();
    const { data } = await sb.from('menu_items').select('*').order('order_index');
    return (data ?? []) as MenuItem[];
  } catch {
    return [];
  }
}

// News: URL /tin-tuc/{slug} tra theo slug; fallback id nếu là UUID.
export async function serverGetNewsByIdOrSlug(idOrSlug: string): Promise<NewsArticle | null> {
  try {
    const sb = serverClient();
    const col = UUID_RE.test(idOrSlug) ? 'id' : 'slug';
    const { data } = await sb.from('news').select('*').eq(col, idOrSlug).eq('is_published', true).maybeSingle();
    return data as NewsArticle | null;
  } catch {
    return null;
  }
}

// Bài viết gắn với 1 entity (khu dân cư/khu vực) qua cột geo_entity — dùng cho
// topic cluster: entity page liệt kê bài vệ tinh trỏ về nó.
export async function serverGetNewsByGeoEntity(entity: string, limit = 6): Promise<NewsArticle[]> {
  try {
    const sb = serverClient();
    const { data } = await sb
      .from('news').select('*')
      .eq('is_published', true)
      .eq('geo_entity', entity)
      .order('created_at', { ascending: false }).limit(limit);
    return (data ?? []) as NewsArticle[];
  } catch {
    return [];
  }
}

export async function serverGetNews(limit = 20, category?: string): Promise<NewsArticle[]> {
  try {
    const sb = serverClient();
    let q = sb
      .from('news').select('*')
      .eq('is_published', true)
      .order('created_at', { ascending: false }).limit(limit);
    if (category && category !== 'Tất cả') q = q.eq('category', category);
    const { data } = await q;
    return (data ?? []) as NewsArticle[];
  } catch {
    return [];
  }
}

const NEWS_LIST_SELECT = 'id,title,slug,excerpt,image_url,category,author,views,focus_keywords,geo_area,created_at,updated_at';

export async function serverGetNewsPage({
  category,
  page = 1,
  limit = 12,
}: {
  category?: string;
  page?: number;
  limit?: number;
} = {}): Promise<NewsPageResult> {
  try {
    const sb = serverClient();
    let q = sb
      .from('news')
      .select(NEWS_LIST_SELECT, { count: 'exact' })
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });
    if (category && category !== 'Tất cả') q = q.eq('category', category);
    const { data, error, count } = await q.range((page - 1) * limit, page * limit - 1);
    if (error) return { data: [], total: 0 };
    return { data: (data ?? []) as NewsListItem[], total: count ?? 0 };
  } catch {
    return { data: [], total: 0 };
  }
}

export async function serverGetMostViewedNews(limit = 8): Promise<NewsListItem[]> {
  try {
    const sb = serverClient();
    const { data } = await sb
      .from('news')
      .select(NEWS_LIST_SELECT)
      .eq('is_published', true)
      .order('views', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit);
    return (data ?? []) as NewsListItem[];
  } catch {
    return [];
  }
}

// Danh mục tin tức phía server (build-time cho generateStaticParams/sitemap + metadata
// route danh mục). Fallback về danh sách tĩnh newsCategories.ts khi bảng rỗng/lỗi, để
// route/sitemap vẫn có 5 danh mục cũ ngay cả trước khi chạy migration production.
const STATIC_NEWS_CATEGORY_FALLBACK: NewsCategoryRow[] = NEWS_CATEGORIES.map((label, i) => ({
  id: `static-${i}`,
  label,
  slug: categoryToSlug(label) ?? '',
  badge_color: 'slate',
  seo_description: null,
  order_index: i,
  created_at: '',
  updated_at: '',
}));

export async function serverGetNewsCategories(): Promise<NewsCategoryRow[]> {
  try {
    const sb = serverClient();
    const { data, error } = await sb.from('news_categories').select('*').order('order_index');
    if (error || !data || data.length === 0) return STATIC_NEWS_CATEGORY_FALLBACK;
    return data as NewsCategoryRow[];
  } catch {
    return STATIC_NEWS_CATEGORY_FALLBACK;
  }
}

// Đọc site_settings phía server cho layout (làm giàu JSON-LD LocalBusiness). Trả {}
// nếu lỗi để layout không vỡ khi DB gặp sự cố.
export async function serverGetSiteSettings(): Promise<Record<string, string>> {
  try {
    const sb = serverClient();
    const { data } = await sb.from('site_settings').select('key, value');
    const map: Record<string, string> = {};
    for (const row of (data ?? []) as Array<{ key: string; value: string | null }>) {
      map[row.key] = row.value ?? '';
    }
    return map;
  } catch {
    return {};
  }
}

export async function serverGetManagedPage(slug: string): Promise<ManagedPage | null> {
  try {
    const sb = serverClient();
    const { data } = await sb
      .from('managed_pages')
      .select('*')
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle();
    return (data as ManagedPage | null) ?? null;
  } catch {
    return null;
  }
}

export async function serverGetPageBlocks(slug: string): Promise<PageBlock[]> {
  try {
    const sb = serverClient();
    const { data } = await sb
      .from('page_blocks')
      .select('*')
      .eq('page_slug', slug)
      .order('section')
      .order('order_index');
    return (data ?? []) as PageBlock[];
  } catch {
    return [];
  }
}

// Đọc 1 dòng seo_route_overrides theo path (RLS public SELECT). Trả null khi lỗi
// hoặc không có dòng → caller fallback về staticPageMetadata. Bọc unstable_cache
// để generateMetadata và Page() không đọc DB 2 lần trong cùng request; cache theo
// path và tag 'seo-route' để ISR revalidate theo revalidate của route.
export const serverGetSeoRouteOverride = unstable_cache(
  async (path: string): Promise<SeoRouteOverride | null> => {
    try {
      const sb = serverClient();
      const { data } = await sb
        .from('seo_route_overrides')
        .select('*')
        .eq('path', path)
        .maybeSingle();
      return (data as SeoRouteOverride | null) ?? null;
    } catch {
      return null;
    }
  },
  ['seo-route-override'],
  { tags: ['seo-route'] },
);
