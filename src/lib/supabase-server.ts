import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { unstable_cache } from 'next/cache';
import type { Property, NewsArticle, Area, SeoRouteOverride } from './supabase';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './env';

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
export async function serverGetListings(listingType?: 'mua_ban' | 'cho_thue', limit = 20): Promise<Property[]> {
  try {
    const sb = serverClient();
    let q = sb
      .from('properties')
      .select(PROPERTY_SELECT)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (listingType) q = q.eq('listing_type', listingType);
    const { data } = await q;
    return (data ?? []) as Property[];
  } catch {
    return [];
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
