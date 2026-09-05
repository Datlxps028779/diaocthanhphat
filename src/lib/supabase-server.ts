import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { unstable_cache, unstable_noStore as noStore } from 'next/cache';
import type { Property, NewsArticle, NewsListItem, NewsPageResult, Area, District, Ward, Neighborhood, PriceStat, PriceStatScope, SeoRouteOverride, ManagedPage, PageBlock, MenuItem, NewsCategoryRow, PublicAgentProfile, PublicAgentListing } from './supabase';
import { NEWS_CATEGORIES, categoryToSlug } from './newsCategories';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './env';
import { LISTINGS_PER_PAGE } from './router';
import { pickRelated } from './relatedNews';
import type { LocationTaxonomy } from './neighborhoodLocation';
import { rankNewsProperties, type RankedNewsProperty } from './newsPropertyDiscovery';

// Client Supabase dùng phía SERVER (RSC / generateMetadata / route handler).
// Tạo MỚI mỗi lần gọi, KHÔNG singleton và KHÔNG persist session — tránh chia sẻ
// state giữa các request. Đọc env qua helper (chấp nhận cả NEXT_PUBLIC_* lẫn VITE_*).
function serverClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function serverGetPublicAgentProfile(slug: string): Promise<PublicAgentProfile | null> {
  try {
    const { data, error } = await serverClient().rpc('public_get_agent_profile', { p_slug: slug });
    if (error) return null;
    return (data ?? null) as PublicAgentProfile | null;
  } catch {
    return null;
  }
}

export async function serverGetPublicAgentProfileListings(slug: string): Promise<PublicAgentListing[]> {
  try {
    const { data, error } = await serverClient().rpc('public_get_agent_profile_listings', { p_slug: slug });
    if (error || !Array.isArray(data)) return [];
    return data as PublicAgentListing[];
  } catch {
    return [];
  }
}

export async function serverGetIndexableAgentProfiles(): Promise<Array<{ slug: string }>> {
  try {
    const { data, error } = await serverClient().rpc('public_list_indexable_agent_profiles');
    if (error || !Array.isArray(data)) return [];
    return data as Array<{ slug: string }>;
  } catch {
    return [];
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PROPERTY_SELECT = 'id, title, description, price, price_unit, price_label, price_per_month, loan_support, listing_type, area_sqm, address, city, district, ward, area_id, district_id, ward_id, property_type_id, neighborhood_slug, image_url, images, badge, badge_color, legal_status, is_featured, is_hot, is_active, is_verified, views, bedrooms, bathrooms, floor_count, floor_number, direction, road_width, frontage, amenities, latitude, longitude, formatted_address, vr_tour_url, video_url, tags, meta_title, meta_description, focus_keywords, slug, public_code, faq, created_at, updated_at, areas(id,name,slug), property_types(id,name,slug)';

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
    return (data ?? []) as unknown as Property[];
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
    return (data ?? []) as unknown as Property[];
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
    return (data ?? []) as unknown as Property[];
  } catch {
    return [];
  }
}

export type ServerNewsPropertyDiscovery = {
  properties: RankedNewsProperty[];
  locationLabel: string | null;
};

// Tin BĐS bên dưới bài viết chỉ dùng foreign key taxonomy đã được trigger DB
// kiểm tra. Không suy đoán từ geo_area/geo_entity hoặc từ keyword/nội dung bài.
export async function serverGetNewsContextualProperties(
  article: Pick<NewsArticle, 'area_id' | 'district_id' | 'ward_id' | 'neighborhood_id'>,
  limit = 4,
): Promise<ServerNewsPropertyDiscovery> {
  const areaId = article.area_id ?? '';
  if (!areaId || limit <= 0) return { properties: [], locationLabel: null };

  try {
    const sb = serverClient();
    const [areaResult, districtResult, wardResult, neighborhoodResult] = await Promise.all([
      sb.from('areas').select('id,name').eq('id', areaId).maybeSingle(),
      article.district_id
        ? sb.from('districts').select('id,name').eq('id', article.district_id).maybeSingle()
        : Promise.resolve({ data: null }),
      article.ward_id
        ? sb.from('wards').select('id,name').eq('id', article.ward_id).maybeSingle()
        : Promise.resolve({ data: null }),
      article.neighborhood_id
        ? sb.from('neighborhoods').select('id,name,slug').eq('id', article.neighborhood_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const area = areaResult.data as Pick<Area, 'id' | 'name'> | null;
    const district = districtResult.data as Pick<District, 'id' | 'name'> | null;
    const ward = wardResult.data as Pick<Ward, 'id' | 'name'> | null;
    const neighborhood = neighborhoodResult.data as Pick<Neighborhood, 'id' | 'name' | 'slug'> | null;
    const recent = () => sb.from('properties')
      .select(PROPERTY_SELECT)
      .eq('is_active', true)
      .eq('area_id', areaId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit);
    const [neighborhoodResultProperties, wardResultProperties, districtResultProperties, areaResultProperties] = await Promise.all([
      neighborhood?.slug ? recent().eq('neighborhood_slug', neighborhood.slug) : Promise.resolve({ data: [] as unknown[] }),
      ward?.name && article.district_id
        ? recent().eq('district_id', article.district_id).ilike('ward', ward.name)
        : Promise.resolve({ data: [] as unknown[] }),
      article.district_id ? recent().eq('district_id', article.district_id) : Promise.resolve({ data: [] as unknown[] }),
      recent(),
    ]);
    const candidates = [
      ...(neighborhoodResultProperties.data ?? []),
      ...(wardResultProperties.data ?? []),
      ...(districtResultProperties.data ?? []),
      ...(areaResultProperties.data ?? []),
    ] as Property[];
    const properties = rankNewsProperties(
      candidates,
      { areaId, districtId: article.district_id, wardName: ward?.name, neighborhoodSlug: neighborhood?.slug },
      limit,
    );
    return {
      properties,
      locationLabel: neighborhood?.name ?? district?.name ?? area?.name ?? null,
    };
  } catch {
    return { properties: [], locationLabel: null };
  }
}

// Listing lượt-xem-đầu (không filter) để crawler thấy danh sách; filter/sort chạy client.
// Đây là tồn kho sống: không để Next Data Cache giữ response PostgREST cũ giữa các
// lần build/deploy. Ba route gọi helper này vì thế được render động để số lượng và
// trang đầu phản ánh DB tại request hiện tại.
export async function serverGetListings(listingType?: 'mua_ban' | 'cho_thue', limit = LISTINGS_PER_PAGE): Promise<{ data: Property[]; total: number }> {
  noStore();
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
    return { data: (data ?? []) as unknown as Property[], total: count ?? 0 };
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

export interface ServerAreaListingScope {
  listingType?: 'mua_ban' | 'cho_thue';
  district?: string;
}

export async function serverGetAreaListings(areaId: string, limit = 12, scope: ServerAreaListingScope = {}): Promise<Property[]> {
  try {
    const sb = serverClient();
    let q = sb
      .from('properties')
      .select(PROPERTY_SELECT)
      .eq('is_active', true)
      .eq('area_id', areaId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit);
    if (scope.listingType) q = q.eq('listing_type', scope.listingType);
    if (scope.district) q = q.eq('district', scope.district);
    const { data } = await q;
    return (data ?? []) as unknown as Property[];
  } catch {
    return [];
  }
}

export async function serverGetAreaStats(areaId: string, scope: ServerAreaListingScope = {}): Promise<{ districts: string[]; propertyTypes: string[]; activeCount: number }> {
  try {
    const sb = serverClient();
    let q = sb
      .from('properties')
      .select('district, property_type_id', { count: 'exact' })
      .eq('is_active', true)
      .eq('area_id', areaId)
      .limit(500);
    if (scope.listingType) q = q.eq('listing_type', scope.listingType);
    if (scope.district) q = q.eq('district', scope.district);
    const { data, count } = await q;
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
    return (data ?? []) as unknown as Property[];
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
  // News location is assigned in Admin and must take effect on the next public
  // request; do not let the RSC data cache keep an old location/recommendation.
  noStore();
  try {
    const sb = serverClient();
    const col = UUID_RE.test(idOrSlug) ? 'id' : 'slug';
    const { data } = await sb.from('news').select('*').eq(col, idOrSlug).eq('is_published', true).maybeSingle();
    return data as NewsArticle | null;
  } catch {
    return null;
  }
}

const RELATED_NEWS_SELECT = 'id,title,slug,excerpt,image_url,category,author,views,focus_keywords,geo_area,created_at,updated_at';

// Bài liên quan cuối trang tin: ưu tiên related_ids do biên tập chọn, sau đó bù theo
// category/keyword/độ mới bằng policy chung. Chỉ lấy bài public, không tự link bài đang đọc.
export async function serverGetRelatedNews(article: NewsArticle, limit = 3): Promise<NewsListItem[]> {
  try {
    const sb = serverClient();
    const manualIds = Array.isArray(article.related_ids) ? article.related_ids.filter(Boolean) : [];
    const categoryQuery = sb
      .from('news')
      .select(RELATED_NEWS_SELECT)
      .eq('is_published', true)
      .eq('category', article.category)
      .neq('id', article.id)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(100);
    const manualQuery = manualIds.length > 0
      ? sb
        .from('news')
        .select(RELATED_NEWS_SELECT)
        .eq('is_published', true)
        .neq('id', article.id)
        .in('id', manualIds)
      : Promise.resolve({ data: [] as unknown[] });
    const [categoryResult, manualResult] = await Promise.all([categoryQuery, manualQuery]);
    const pool = new Map<string, NewsArticle>();
    for (const item of [...(categoryResult.data ?? []), ...(manualResult.data ?? [])]) {
      const news = item as unknown as NewsArticle;
      pool.set(news.id, news);
    }

    return pickRelated(article, manualIds, Array.from(pool.values()), limit, Date.now()) as NewsListItem[];
  } catch {
    return [];
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
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit);
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
  show_in_news_sections: true,
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
  noStore();
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
