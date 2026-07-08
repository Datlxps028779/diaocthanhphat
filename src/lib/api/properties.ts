import { supabase, type Property } from '../supabase';

// ─── Properties (public) ──────────────────────────────────────────────────────
export async function getAllProperties(filters?: {
  listingType?: string; areaId?: string; typeId?: string; city?: string; keyword?: string;
  district?: string;
  minPrice?: number; maxPrice?: number; minArea?: number; maxArea?: number;
  bedrooms?: string; direction?: string; legal?: string;
  isFeatured?: boolean; isHot?: boolean;
  sort?: 'newest' | 'price_asc' | 'price_desc' | 'views';
  page?: number; limit?: number;
}): Promise<{ data: Property[]; total: number }> {
  let q = supabase
    .from('properties')
    .select('*, areas(id,name,slug), property_types(id,name,slug)', { count: 'exact' })
    .eq('is_active', true);

  if (filters?.listingType && filters.listingType !== 'all') q = q.eq('listing_type', filters.listingType);
  if (filters?.areaId) q = q.eq('area_id', filters.areaId);
  if (filters?.typeId) q = q.eq('property_type_id', filters.typeId);
  if (filters?.city) q = q.eq('city', filters.city);
  if (filters?.district) q = q.eq('district', filters.district);
  if (filters?.keyword) q = q.or(`title.ilike.%${filters.keyword}%,address.ilike.%${filters.keyword}%,city.ilike.%${filters.keyword}%,district.ilike.%${filters.keyword}%`);
  if (filters?.minPrice !== undefined) q = q.gte('price', filters.minPrice);
  if (filters?.maxPrice !== undefined) q = q.lte('price', filters.maxPrice);
  if (filters?.minArea !== undefined) q = q.gte('area_sqm', filters.minArea);
  if (filters?.maxArea !== undefined) q = q.lte('area_sqm', filters.maxArea);
  if (filters?.bedrooms && filters.bedrooms !== 'all') q = q.gte('bedrooms', parseInt(filters.bedrooms));
  if (filters?.direction) q = q.eq('direction', filters.direction);
  if (filters?.legal) q = q.eq('legal_status', filters.legal);
  if (filters?.isFeatured) q = q.eq('is_featured', true);
  if (filters?.isHot) q = q.eq('is_hot', true);

  if (filters?.sort === 'price_asc') q = q.order('price', { ascending: true });
  else if (filters?.sort === 'price_desc') q = q.order('price', { ascending: false });
  else if (filters?.sort === 'views') q = q.order('views', { ascending: false });
  else q = q.order('created_at', { ascending: false });

  const limit = filters?.limit ?? 20;
  const page = filters?.page ?? 1;
  q = q.range((page - 1) * limit, page * limit - 1);

  const { data, error, count } = await q;
  if (error) throw error;
  return { data: (data ?? []) as Property[], total: count ?? 0 };
}

export async function getAllPropertiesForMap(filters?: { areaId?: string; typeId?: string }): Promise<Property[]> {
  let q = supabase
    .from('properties')
    .select('id, title, price, price_label, price_unit, city, district, latitude, longitude, image_url, is_featured, is_hot, area_id, property_type_id')
    .eq('is_active', true)
    .not('latitude', 'is', null);
  if (filters?.areaId) q = q.eq('area_id', filters.areaId);
  if (filters?.typeId) q = q.eq('property_type_id', filters.typeId);
  const { data } = await q.limit(200);
  return (data ?? []) as Property[];
}

export async function getFeaturedProperties(): Promise<Property[]> {
  const { data } = await supabase
    .from('properties')
    .select('*, areas(id,name,slug), property_types(id,name,slug)')
    .eq('is_active', true).eq('is_featured', true)
    .order('created_at', { ascending: false }).limit(12);
  return (data ?? []) as Property[];
}

export async function getHotProperties(): Promise<Property[]> {
  const { data } = await supabase
    .from('properties')
    .select('*, areas(id,name,slug), property_types(id,name,slug)')
    .eq('is_active', true).eq('is_hot', true)
    .order('views', { ascending: false }).limit(8);
  return (data ?? []) as Property[];
}

export async function getRecentProperties(limit = 8): Promise<Property[]> {
  const { data } = await supabase
    .from('properties')
    .select('*, areas(id,name,slug), property_types(id,name,slug)')
    .eq('is_active', true)
    .order('created_at', { ascending: false }).limit(limit);
  return (data ?? []) as Property[];
}

export async function getPropertyById(id: string): Promise<Property | null> {
  // Pure read — KHÔNG tăng view ở đây. Tăng view được tách ra incrementPropertyView
  // và bắn 1 lần khi mount ở tầng UI, để không phụ thuộc cache/refetch của React Query.
  const { data } = await supabase
    .from('properties')
    .select('*, areas(id,name,slug), property_types(id,name,slug)')
    .eq('id', id).maybeSingle();
  return data as Property | null;
}

// URL sản phẩm dạng /bat-dong-san/{slug}-{id}. slug lấy từ tiêu đề (không lưu DB),
// id (UUID) nằm cuối để tra cứu chính xác. Tách UUID ở cuối segment để query theo id.
const TRAILING_UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function extractPropertyId(segment: string): string {
  const m = segment.match(TRAILING_UUID_RE);
  return m ? m[0] : segment;
}
export async function getPropertyByIdOrSlug(idOrSlug: string): Promise<Property | null> {
  const id = extractPropertyId(idOrSlug);
  const { data } = await supabase
    .from('properties')
    .select('*, areas(id,name,slug), property_types(id,name,slug)')
    .eq('id', id).maybeSingle();
  return data as Property | null;
}

// Tăng view atomic (col = col + 1) tránh race. Fallback read-modify-write nếu RPC
// chưa có trên DB. Gọi 1 lần mỗi lượt xem trang (xem PropertyDetailPage).
export async function incrementPropertyView(id: string): Promise<void> {
  const { error: rpcErr } = await supabase.rpc('increment_property_views', { row_id: id });
  if (rpcErr) {
    const { data } = await supabase.from('properties').select('views').eq('id', id).maybeSingle();
    await supabase.from('properties').update({ views: (data?.views ?? 0) + 1 }).eq('id', id);
  }
}

export async function getRelatedProperties(property: Property, limit = 6): Promise<Property[]> {
  const { data } = await supabase
    .from('properties')
    .select('*, areas(id,name,slug), property_types(id,name,slug)')
    .eq('is_active', true).neq('id', property.id)
    .or(`area_id.eq.${property.area_id},property_type_id.eq.${property.property_type_id}`)
    .order('created_at', { ascending: false }).limit(limit);
  return (data ?? []) as Property[];
}

// ─── Properties (admin) ───────────────────────────────────────────────────────
export async function adminGetAllProperties(): Promise<Property[]> {
  const { data } = await supabase
    .from('properties')
    .select('*, areas(id,name,slug), property_types(id,name,slug)')
    .order('created_at', { ascending: false });
  return (data ?? []) as Property[];
}

// Slug SEO từ tiêu đề tiếng Việt (bỏ dấu). KHÔNG cần hậu tố duy nhất vì URL luôn
// kèm id ở cuối (/bat-dong-san/{slug}-{id}) — id mới là khóa tra cứu.
export function buildPropertySlug(title: string): string {
  return (title ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[đ]/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 80) || 'bat-dong-san';
}

// URL chuẩn SEO: /bat-dong-san/{slug}-{id}. Ưu tiên slug lưu trong DB, fallback
// sinh từ tiêu đề nếu tin cũ chưa có slug. id luôn ở cuối để tra cứu chính xác.
export function buildPropertyPath(p: { id: string; slug?: string | null; title?: string }): string {
  const slug = (p.slug && p.slug.trim()) || (p.title ? buildPropertySlug(p.title) : '');
  return slug ? `/bat-dong-san/${slug}-${p.id}` : `/bat-dong-san/${p.id}`;
}

export async function createProperty(p: Omit<Property, 'id' | 'created_at' | 'updated_at' | 'views' | 'areas' | 'property_types'>): Promise<Property> {
  const payload = p.slug ? p : { ...p, slug: buildPropertySlug(p.title) };
  const { data, error } = await supabase.from('properties').insert(payload).select().single();
  if (error) throw error;
  return data as Property;
}
export async function updateProperty(id: string, p: Partial<Property>): Promise<void> {
  const { error } = await supabase.from('properties').update({ ...p, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}
export async function deleteProperty(id: string): Promise<void> {
  const { error } = await supabase.from('properties').delete().eq('id', id);
  if (error) throw error;
}

// ─── Bulk operations (Sprint 3c) ──────────────────────────────────────────────
// Cập nhật/xóa nhiều BĐS trong 1 câu (.in) thay vì lặp N request. Trả số dòng ảnh
// hưởng để UI báo lại. Whitelist cột cập nhật để tránh set nhầm field nhạy cảm.
export async function bulkUpdateProperties(
  ids: string[],
  patch: Partial<Pick<Property, 'is_active' | 'is_hot' | 'is_featured'>>,
): Promise<number> {
  if (ids.length === 0) return 0;
  const { error, count } = await supabase
    .from('properties')
    .update({ ...patch, updated_at: new Date().toISOString() }, { count: 'exact' })
    .in('id', ids);
  if (error) throw error;
  return count ?? ids.length;
}

export async function bulkDeleteProperties(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const { error, count } = await supabase
    .from('properties')
    .delete({ count: 'exact' })
    .in('id', ids);
  if (error) throw error;
  return count ?? ids.length;
}
