import { supabase, type ListingType, type Property } from '../supabase';
import { buildSlug, buildUniqueSlug } from '../slug';
import { buildProductPath } from '../productPath';
import { normalizeAdvisorMatchReasons, type AdvisorMatchReasonCode } from '../rankingPolicy';
import { mergeRelatedPropertyCandidates, rankRelatedProperties, type RelatedProperty } from '../relatedProperties';

export type PropertySort = 'newest' | 'price_asc' | 'price_desc' | 'views' | 'relevance';
export interface PropertyFilters {
  listingType?: string; areaId?: string; typeId?: string; city?: string; keyword?: string;
  district?: string; ward?: string;
  minPrice?: number; maxPrice?: number; minArea?: number; maxArea?: number;
  bedrooms?: string; direction?: string; legal?: string; loan?: boolean;
  isFeatured?: boolean; isHot?: boolean;
  sort?: PropertySort;
  page?: number; limit?: number;
}

// Filter nhận từ URL/RSC trước khi ListingsPage bổ sung paging. `typeSlug` chỉ dùng
// để map taxonomy bất đồng bộ sang typeId, còn các field khác giữ nguyên contract
// parser ↔ client wrapper ↔ màn danh sách.
export type ListingInitialFilters = Omit<PropertyFilters, 'loan' | 'limit'> & {
  typeSlug?: string;
};

export class PropertySearchUnavailableError extends Error {
  constructor() {
    super('Tìm kiếm nâng cao đang tạm thời không khả dụng. Vui lòng thử lại.');
    this.name = 'PropertySearchUnavailableError';
  }
}

// ─── Properties (public) ──────────────────────────────────────────────────────
// Dựng query đã áp đủ filter + sort (chưa phân trang). Tách hàm để retry dùng
// builder mới hoàn toàn — builder PostgREST đã await không dùng lại được.
export interface PublicPropertyFilterOperation {
  method: 'eq' | 'gte' | 'lte' | 'or';
  column?: string;
  value: unknown;
}

export function publicPropertyFilterOperations(filters?: PropertyFilters): PublicPropertyFilterOperation[] {
  const operations: PublicPropertyFilterOperation[] = [];
  if (filters?.listingType && filters.listingType !== 'all') operations.push({ method: 'eq', column: 'listing_type', value: filters.listingType });
  if (filters?.areaId) operations.push({ method: 'eq', column: 'area_id', value: filters.areaId });
  if (filters?.typeId) operations.push({ method: 'eq', column: 'property_type_id', value: filters.typeId });
  if (filters?.city) operations.push({ method: 'eq', column: 'city', value: filters.city });
  if (filters?.district) operations.push({ method: 'eq', column: 'district', value: filters.district });
  if (filters?.ward) operations.push({ method: 'eq', column: 'ward', value: filters.ward });
  if (filters?.keyword) {
    // Sanitize: loại ký tự cấu trúc của PostgREST filter (, ( ) \) để keyword không
    // phá cú pháp .or() và chèn điều kiện lạ (vd lộ tin is_active=false).
    const kw = filters.keyword.replace(/[,()\\%]/g, ' ').replace(/\s+/g, ' ').trim();
    if (kw) operations.push({
      method: 'or',
      value: `title.ilike.%${kw}%,address.ilike.%${kw}%,city.ilike.%${kw}%,district.ilike.%${kw}%`,
    });
  }
  const priceColumn = filters?.listingType === 'cho_thue' ? 'price_per_month' : 'price';
  if (filters?.minPrice !== undefined) operations.push({ method: 'gte', column: priceColumn, value: filters.minPrice });
  if (filters?.maxPrice !== undefined) operations.push({ method: 'lte', column: priceColumn, value: filters.maxPrice });
  if (filters?.minArea !== undefined) operations.push({ method: 'gte', column: 'area_sqm', value: filters.minArea });
  if (filters?.maxArea !== undefined) operations.push({ method: 'lte', column: 'area_sqm', value: filters.maxArea });
  if (filters?.bedrooms && filters.bedrooms !== 'all') operations.push({ method: 'gte', column: 'bedrooms', value: parseInt(filters.bedrooms) });
  if (filters?.direction) operations.push({ method: 'eq', column: 'direction', value: filters.direction });
  if (filters?.legal) operations.push({ method: 'eq', column: 'legal_status', value: filters.legal });
  if (filters?.isFeatured) operations.push({ method: 'eq', column: 'is_featured', value: true });
  if (filters?.isHot) operations.push({ method: 'eq', column: 'is_hot', value: true });
  return operations;
}

function applyPublicPropertyFilters(query: any, filters?: PropertyFilters): any {
  for (const operation of publicPropertyFilterOperations(filters)) {
    if (operation.method === 'or') query = query.or(operation.value as string);
    else query = query[operation.method](operation.column, operation.value);
  }
  return query;
}

function buildPropertyQuery(filters?: PropertyFilters) {
  let q = applyPublicPropertyFilters(
    supabase
      .from('properties')
      .select('*, areas(id,name,slug), property_types(id,name,slug)', { count: 'exact' })
      .eq('is_active', true),
    filters,
  );

  const priceColumn = filters?.listingType === 'cho_thue' ? 'price_per_month' : 'price';
  // nếu không đổi trang có thể lặp hoặc bỏ sót tin.
  if (filters?.sort === 'price_asc') q = q.order(priceColumn, { ascending: true }).order('id', { ascending: true });
  else if (filters?.sort === 'price_desc') q = q.order(priceColumn, { ascending: false }).order('id', { ascending: false });
  else if (filters?.sort === 'views') q = q.order('views', { ascending: false }).order('id', { ascending: false });
  else q = q.order('created_at', { ascending: false }).order('id', { ascending: false });

  return q;
}

export async function getAllProperties(filters?: PropertyFilters): Promise<{ data: Property[]; total: number }> {
  if (filters?.keyword || filters?.sort === 'relevance') {
    return getRankedPropertyMatches(filters);
  }

  const limit = filters?.limit ?? 20;
  const page = filters?.page ?? 1;

  const { data, error, count } = await buildPropertyQuery(filters).range((page - 1) * limit, page * limit - 1);
  if (error) {
    // PGRST103: offset vượt quá số bản ghi — xảy ra với link cũ ?page=N sau khi tin
    // bị gỡ bớt. Đọc lại tổng thật để UI báo đúng số tin thay vì "0 bất động sản".
    if (error.code === 'PGRST103') {
      const { count: realTotal } = await buildPropertyQuery(filters).range(0, 0);
      return { data: [], total: realTotal ?? 0 };
    }
    throw error;
  }
  return { data: (data ?? []) as Property[], total: count ?? 0 };
}

interface RankedMatch { id: string; rank: number; total_count: number }

async function getRankedPropertyMatches(filters: PropertyFilters): Promise<{ data: Property[]; total: number }> {
  const limit = filters.limit ?? 20;
  const page = filters.page ?? 1;
  const bedrooms = filters.bedrooms && filters.bedrooms !== 'all' ? Number(filters.bedrooms) : undefined;
  const { data: matches, error } = await supabase.rpc('search_property_matches', {
    kw: filters.keyword ?? null,
    f_listing_type: filters.listingType && filters.listingType !== 'all' ? filters.listingType : null,
    f_area_id: filters.areaId ?? null,
    f_type_id: filters.typeId ?? null,
    f_city: filters.city ?? null,
    f_district: filters.district ?? null,
    f_ward: filters.ward ?? null,
    f_min_price: filters.minPrice ?? null,
    f_max_price: filters.maxPrice ?? null,
    f_min_area: filters.minArea ?? null,
    f_max_area: filters.maxArea ?? null,
    f_bedrooms: Number.isFinite(bedrooms) ? bedrooms : null,
    f_direction: filters.direction ?? null,
    f_legal: filters.legal ?? null,
    f_featured: filters.isFeatured ?? null,
    f_hot: filters.isHot ?? null,
    f_sort: filters.sort ?? (filters.keyword ? 'relevance' : 'newest'),
    f_limit: limit,
    f_offset: (page - 1) * limit,
  });
  if (error) throw new PropertySearchUnavailableError();
  const rows = (matches ?? []) as RankedMatch[];
  if (rows.length === 0) return { data: [], total: 0 };
  const ids = rows.map(r => r.id);
  const { data, error: detailError } = await supabase
    .from('properties')
    .select('*, areas(id,name,slug), property_types(id,name,slug)')
    .eq('is_active', true)
    .in('id', ids);
  if (detailError) throw new PropertySearchUnavailableError();
  const byId = new Map((data ?? []).map(p => [p.id, p as Property]));
  return { data: ids.map(id => byId.get(id)).filter((p): p is Property => Boolean(p)), total: rows[0]?.total_count ?? rows.length };
}

interface AdvisorMatch {
  id: string;
  score: number;
  intent_score?: number;
  match_reasons?: unknown;
  total_count: number;
}
export type AdvisorMatchedProperty = Property & {
  matchScore: number;
  matchIntentScore: number;
  matchReasons: AdvisorMatchReasonCode[];
};

export function mapAdvisorMatchMetadata(row: AdvisorMatch): Pick<AdvisorMatchedProperty, 'matchScore' | 'matchIntentScore' | 'matchReasons'> {
  return {
    matchScore: Number.isFinite(row.score) ? row.score : 0,
    matchIntentScore: Number.isFinite(row.intent_score) ? row.intent_score! : Number.isFinite(row.score) ? row.score : 0,
    matchReasons: normalizeAdvisorMatchReasons(row.match_reasons),
  };
}

export async function getAdvisorMatches(filters: PropertyFilters): Promise<{ data: AdvisorMatchedProperty[]; total: number }> {
  const targetArea = filters.maxArea ?? filters.minArea ?? null;
  const { data: matches, error } = await supabase.rpc('match_properties_for_advisor', {
    f_listing_type: filters.listingType && filters.listingType !== 'all' ? filters.listingType : null,
    f_area_id: filters.areaId ?? null,
    f_type_id: filters.typeId ?? null,
    f_district: filters.district ?? null,
    f_ward: filters.ward ?? null,
    f_target_price: filters.maxPrice ?? filters.minPrice ?? null,
    f_target_area: targetArea,
    f_want_loan: filters.loan ?? null,
    f_legal: filters.legal ?? null,
    kw: filters.keyword ?? null,
    f_limit: filters.limit ?? 5,
  });
  if (error) throw error;
  const rows = (matches ?? []) as AdvisorMatch[];
  if (rows.length === 0) return { data: [], total: 0 };
  const ids = rows.map(r => r.id);
  const metadata = new Map(rows.map(r => [r.id, mapAdvisorMatchMetadata(r)]));
  const { data, error: detailError } = await supabase
    .from('properties')
    .select('*, areas(id,name,slug), property_types(id,name,slug)')
    .eq('is_active', true)
    .in('id', ids);
  if (detailError) throw detailError;
  const byId = new Map((data ?? []).map(p => [p.id, p as Property]));
  return {
    data: ids
      .map(id => byId.get(id))
      .filter((p): p is Property => Boolean(p))
      .map(p => ({
        ...p,
        ...(metadata.get(p.id) ?? { matchScore: 0, matchIntentScore: 0, matchReasons: [] }),
      })),
    total: rows[0]?.total_count ?? rows.length,
  };
}

export async function getAllPropertiesForMap(filters?: PropertyFilters): Promise<Property[]> {
  const q = applyPublicPropertyFilters(
    supabase
      .from('properties')
      .select('id, title, price, price_per_month, price_label, price_unit, city, district, ward, area_sqm, bedrooms, direction, legal_status, latitude, longitude, image_url, is_featured, is_hot, area_id, property_type_id, listing_type')
      .eq('is_active', true)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null),
    filters,
  );
  const { data, error } = await q.limit(1000);
  if (error) throw error;
  return (data ?? []) as Property[];
}

// Mẫu tham chiếu cho định giá: BĐS cùng khu vực/loại, chỉ lấy field giá + diện tích.
export async function getComps(filters: { areaId?: string; typeId?: string; listingType?: string }): Promise<
  { price: number; price_unit: string; area_sqm: number | null }[]
> {
  let q = supabase
    .from('properties')
    .select('price, price_unit, area_sqm')
    .eq('is_active', true)
    .not('area_sqm', 'is', null)
    .gt('price', 0);
  if (filters.areaId) q = q.eq('area_id', filters.areaId);
  if (filters.typeId) q = q.eq('property_type_id', filters.typeId);
  if (filters.listingType) q = q.eq('listing_type', filters.listingType);
  const { data } = await q.limit(200);
  return (data ?? []) as { price: number; price_unit: string; area_sqm: number | null }[];
}

// Danh sách gọn (chỉ field cần) cho picker gắn BĐS vào lead. Lọc keyword phía client.
export async function getPropertyOptions(limit = 300): Promise<
  { id: string; title: string; price: number; price_unit: string; price_label: string | null; area_sqm: number | null }[]
> {
  const { data } = await supabase
    .from('properties')
    .select('id, title, price, price_unit, price_label, area_sqm')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as { id: string; title: string; price: number; price_unit: string; price_label: string | null; area_sqm: number | null }[];
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
    .eq('id', id)
    .eq('is_active', true)
    .maybeSingle();
  return data as Property | null;
}

// Tra cứu theo id (link UUID cũ vẫn còn lưu hành) HOẶC slug (URL mới chuẩn SEO).
// Segment khớp UUID → query theo id; còn lại → theo slug.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function getPropertyByIdOrSlug(idOrSlug: string): Promise<Property | null> {
  const col = UUID_RE.test(idOrSlug) ? 'id' : 'slug';
  const { data } = await supabase
    .from('properties')
    .select('*, areas(id,name,slug), property_types(id,name,slug)')
    .eq(col, idOrSlug)
    .eq('is_active', true)
    .maybeSingle();
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

// Lấy các tầng liên quan riêng trước khi xếp hạng, để cửa sổ "mới nhất toàn kho"
// không làm rơi tin cũ hơn nhưng cùng quận/loại. Mỗi query vẫn bị chặn payload;
// rankRelatedProperties là nguồn chân lý cuối cùng cho thứ tự hiển thị.
export async function getRelatedProperties(property: Property, limit = 6): Promise<RelatedProperty[]> {
  const candidateLimit = Math.max(24, Math.min(60, limit * 8));
  const select = '*, areas(id,name,slug), property_types(id,name,slug)';
  const baseQuery = () => supabase
    .from('properties')
    .select(select)
    .eq('is_active', true)
    .eq('listing_type', property.listing_type)
    .neq('id', property.id)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(candidateLimit);

  const localQuery = property.area_id && property.district?.trim()
    ? baseQuery().eq('area_id', property.area_id).eq('district', property.district.trim())
    : null;
  const sameAreaQuery = property.area_id
    ? baseQuery().eq('area_id', property.area_id)
    : null;
  const sameTypeQuery = property.property_type_id
    ? baseQuery().eq('property_type_id', property.property_type_id)
    : null;

  const results = await Promise.all([
    localQuery,
    sameAreaQuery,
    sameTypeQuery,
  ].filter(Boolean) as PromiseLike<{ data: Property[] | null }>[]);

  const candidates = mergeRelatedPropertyCandidates(
    ...results.map(result => (result.data ?? []) as Property[]),
  );
  return rankRelatedProperties(property, candidates, limit);
}

// ─── Properties (admin) ───────────────────────────────────────────────────────
export type AdminPropertyStatus = 'all' | 'active' | 'inactive';
export type AdminPropertySort = 'newest' | 'updated' | 'views' | 'price_asc' | 'price_desc';

export interface AdminPropertyFilters {
  keyword?: string;
  listingType?: ListingType | 'all';
  areaId?: string;
  typeId?: string;
  status?: AdminPropertyStatus;
  isFeatured?: boolean;
  isHot?: boolean;
  isVerified?: boolean;
  sort?: AdminPropertySort;
  page?: number;
  limit?: number;
}

export interface AdminPropertyPage {
  data: Property[];
  total: number;
}

const ADMIN_PROPERTY_PAGE_LIMITS = new Set([25, 50, 100]);

// Chuỗi .or() của PostgREST là cú pháp, không phải query parameter được encode tự động.
// Bỏ ký tự cấu trúc để một ô tìm kiếm không thể mở rộng điều kiện truy vấn sang field khác.
export function sanitizeAdminPropertyKeyword(value: string | undefined): string {
  return (value ?? '').replace(/[,().\\%]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
}

export function normalizeAdminPropertyPage(value: number | undefined): number {
  return Number.isSafeInteger(value) && (value ?? 0) > 0 ? value! : 1;
}

export function normalizeAdminPropertyLimit(value: number | undefined): number {
  return value && ADMIN_PROPERTY_PAGE_LIMITS.has(value) ? value : 25;
}

export interface AdminPropertyFilterOperation {
  method: 'eq' | 'gt';
  column: string;
  value: unknown;
}

// `isVerified` is retained as the UI/API filter name for compatibility, but it now
// means an evidence-backed P7 verification that is still within its validity window.
export function adminPropertyFilterOperations(
  filters: AdminPropertyFilters = {},
  now = new Date().toISOString(),
): AdminPropertyFilterOperation[] {
  const operations: AdminPropertyFilterOperation[] = [];
  if (filters.listingType && filters.listingType !== 'all') operations.push({ method: 'eq', column: 'listing_type', value: filters.listingType });
  if (filters.areaId) operations.push({ method: 'eq', column: 'area_id', value: filters.areaId });
  if (filters.typeId) operations.push({ method: 'eq', column: 'property_type_id', value: filters.typeId });
  if (filters.status === 'active') operations.push({ method: 'eq', column: 'is_active', value: true });
  if (filters.status === 'inactive') operations.push({ method: 'eq', column: 'is_active', value: false });
  if (filters.isFeatured) operations.push({ method: 'eq', column: 'is_featured', value: true });
  if (filters.isHot) operations.push({ method: 'eq', column: 'is_hot', value: true });
  if (filters.isVerified) {
    operations.push(
      { method: 'eq', column: 'verification_status', value: 'verified' },
      { method: 'gt', column: 'verified_until', value: now },
    );
  }
  return operations;
}

export function buildAdminPropertyQuery(filters: AdminPropertyFilters = {}) {
  let q = supabase
    .from('properties')
    .select('*, areas(id,name,slug), property_types(id,name,slug)', { count: 'exact' });

  for (const operation of adminPropertyFilterOperations(filters)) {
    q = q[operation.method](operation.column, operation.value);
  }

  const keyword = sanitizeAdminPropertyKeyword(filters.keyword);
  if (keyword) {
    const search = `title.ilike.%${keyword}%,slug.ilike.%${keyword}%,address.ilike.%${keyword}%,city.ilike.%${keyword}%,district.ilike.%${keyword}%,ward.ilike.%${keyword}%`;
    q = q.or(/^\d+$/.test(keyword) ? `${search},public_code.eq.${keyword}` : search);
  }

  if (filters.sort === 'updated') q = q.order('updated_at', { ascending: false }).order('id', { ascending: false });
  else if (filters.sort === 'views') q = q.order('views', { ascending: false }).order('id', { ascending: false });
  else if (filters.sort === 'price_asc') q = q.order('price', { ascending: true }).order('id', { ascending: true });
  else if (filters.sort === 'price_desc') q = q.order('price', { ascending: false }).order('id', { ascending: false });
  else q = q.order('created_at', { ascending: false }).order('id', { ascending: false });

  return q;
}

export async function adminGetPropertiesPage(filters: AdminPropertyFilters = {}): Promise<AdminPropertyPage> {
  const page = normalizeAdminPropertyPage(filters.page);
  const limit = normalizeAdminPropertyLimit(filters.limit);
  const { data, error, count } = await buildAdminPropertyQuery(filters)
    .range((page - 1) * limit, page * limit - 1);
  if (error) throw error;
  return { data: (data ?? []) as Property[], total: count ?? 0 };
}

// Giữ API cũ cho picker/section admin không thuộc danh mục BĐS. PropertiesTab dùng
// adminGetPropertiesPage để không kéo toàn bộ kho dữ liệu về browser.
export async function adminGetAllProperties(): Promise<Property[]> {
  const { data } = await supabase
    .from('properties')
    .select('*, areas(id,name,slug), property_types(id,name,slug)')
    .order('created_at', { ascending: false });
  return (data ?? []) as Property[];
}

// Slug gốc SEO từ tiêu đề tiếng Việt (bỏ dấu, không hậu tố).
// Slug BĐS: delegate về nguồn chung src/lib/slug.ts (một nguồn chân lý duy nhất).
// Giữ tên export cũ để không vỡ import hiện có.
export function buildPropertySlug(title: string): string {
  return buildSlug(title);
}

// Slug SEO kèm hậu tố ngắn để đảm bảo duy nhất mà không cần kiểm tra trùng.
export function buildUniquePropertySlug(title: string): string {
  return buildUniqueSlug(title);
}

// URL chuẩn SEO sản phẩm. Có public_code + areas.slug + listing_type hợp lệ → path mới
// /{lt}/{areaSlug}/{districtSlug?}/{slug}-pr{code} (buildProductPath). Thiếu (tin cũ chưa
// backfill) → fallback /bat-dong-san/{slug||id} — route cũ 301 lo phần còn lại.
export function buildPropertyPath(p: {
  id: string; slug?: string | null;
  public_code?: number | null; listing_type?: string | null;
  district?: string | null; areas?: { slug?: string | null } | null;
}): string {
  return buildProductPath(p);
}

export async function createProperty(p: Omit<Property, 'id' | 'created_at' | 'updated_at' | 'views' | 'areas' | 'property_types'>): Promise<Property> {
  const slug = (p.slug && p.slug.trim()) || buildUniquePropertySlug(p.title);
  const { data, error } = await supabase.from('properties').insert({ ...p, slug }).select().single();
  if (error) throw error;
  return data as Property;
}
export async function updateProperty(id: string, p: Partial<Property>): Promise<Property> {
  const { data, error } = await supabase
    .from('properties')
    .update({ ...p, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as Property;
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
