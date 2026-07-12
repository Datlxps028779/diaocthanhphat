import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Property, NewsArticle } from './supabase';
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
// + prefetch initialData ở trang chi tiết.
export async function serverGetPropertyByIdOrSlug(idOrSlug: string): Promise<Property | null> {
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
}

export async function serverGetFeaturedProperties(): Promise<Property[]> {
  const sb = serverClient();
  const { data } = await sb
    .from('properties')
    .select(PROPERTY_SELECT)
    .eq('is_active', true).eq('is_featured', true)
    .order('created_at', { ascending: false }).limit(12);
  return (data ?? []) as Property[];
}

export async function serverGetHotProperties(): Promise<Property[]> {
  const sb = serverClient();
  const { data } = await sb
    .from('properties')
    .select(PROPERTY_SELECT)
    .eq('is_active', true).eq('is_hot', true)
    .order('views', { ascending: false }).limit(8);
  return (data ?? []) as Property[];
}

export async function serverGetRecentProperties(limit = 8): Promise<Property[]> {
  const sb = serverClient();
  const { data } = await sb
    .from('properties')
    .select(PROPERTY_SELECT)
    .eq('is_active', true)
    .order('created_at', { ascending: false }).limit(limit);
  return (data ?? []) as Property[];
}

// Listing lượt-xem-đầu (không filter) để crawler thấy danh sách; filter/sort chạy client.
export async function serverGetListings(listingType?: 'mua_ban' | 'cho_thue', limit = 20): Promise<Property[]> {
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
}

// News: URL /tin-tuc/{slug} tra theo slug; fallback id nếu là UUID.
export async function serverGetNewsByIdOrSlug(idOrSlug: string): Promise<NewsArticle | null> {
  const sb = serverClient();
  const col = UUID_RE.test(idOrSlug) ? 'id' : 'slug';
  const { data } = await sb.from('news').select('*').eq(col, idOrSlug).maybeSingle();
  return data as NewsArticle | null;
}

export async function serverGetNews(limit = 20): Promise<NewsArticle[]> {
  const sb = serverClient();
  const { data } = await sb
    .from('news').select('*')
    .eq('is_published', true)
    .order('created_at', { ascending: false }).limit(limit);
  return (data ?? []) as NewsArticle[];
}
