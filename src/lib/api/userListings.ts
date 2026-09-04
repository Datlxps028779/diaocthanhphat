import { supabase, type UserListing, type UserListingLifecycleEvent } from '../supabase';
import { normalizeListingTitle } from '../listingTitle';

function canonicalListingTitle<T extends { title: string; city?: string | null; district?: string | null; ward?: string | null }>(listing: T): T {
  return {
    ...listing,
    title: normalizeListingTitle(listing.title, [listing.city ?? '', listing.district ?? '', listing.ward ?? '']).value,
  };
}

// ─── User Listings ────────────────────────────────────────────────────────────
export async function submitUserListing(listing: Omit<UserListing, 'id' | 'user_id' | 'status' | 'reject_reason' | 'expires_at' | 'property_id' | 'created_at' | 'updated_at' | 'tags' | 'ai_seo_draft' | 'areas' | 'property_types' | 'profiles'>): Promise<void> {
  const { error } = await supabase.from('user_listings').insert(canonicalListingTitle(listing));
  if (error) throw error;
}
export async function getMyListings(): Promise<UserListing[]> {
  const { data } = await supabase
    .from('user_listings')
    .select('*, areas(id,name,slug), property_types(id,name,slug)')
    .order('created_at', { ascending: false });
  return (data ?? []) as UserListing[];
}
export async function deleteMyListing(id: string): Promise<void> {
  const { error } = await supabase.from('user_listings').delete().eq('id', id);
  if (error) throw error;
}
export async function getMyListing(id: string): Promise<UserListing | null> {
  const { data } = await supabase
    .from('user_listings')
    .select('*, areas(id,name,slug), property_types(id,name,slug)')
    .eq('id', id)
    .maybeSingle();
  return (data as UserListing | null) ?? null;
}
// Sửa tin của chính mình. Bất kể trạng thái cũ, sau khi sửa quay về 'pending' để
// duyệt lại (xoá luôn lý do từ chối cũ). RLS user_listings_update_own giới hạn đúng chủ.
export async function updateMyListing(
  id: string,
  listing: Omit<UserListing, 'id' | 'user_id' | 'status' | 'reject_reason' | 'expires_at' | 'property_id' | 'created_at' | 'updated_at' | 'tags' | 'ai_seo_draft' | 'areas' | 'property_types' | 'profiles'>,
): Promise<void> {
  const canonical = canonicalListingTitle(listing);
  const { data, error } = await supabase
    .from('user_listings')
    .update({ ...canonical, status: 'pending', reject_reason: null, expires_at: null, ai_seo_draft: null })
    .eq('id', id)
    .select('id');
  if (error) throw error;
  // RLS có thể lọc mất dòng (không đúng chủ) → update trúng 0 dòng mà không báo lỗi.
  // Bắt trường hợp này để không hiện "thành công" giả trong khi DB không đổi.
  if (!data || data.length === 0) {
    throw new Error('Không cập nhật được tin — bạn không có quyền sửa hoặc tin không tồn tại.');
  }
}
export async function adminGetUserListings(status?: string): Promise<UserListing[]> {
  let q = supabase
    .from('user_listings')
    .select('*, areas(id,name,slug), property_types(id,name,slug)')
    .order('created_at', { ascending: false });
  if (status && status !== 'all') q = q.eq('status', status);
  const { data } = await q;
  return (data ?? []) as UserListing[];
}
export async function adminGetUserListingLifecycle(id: string): Promise<UserListingLifecycleEvent[]> {
  const { data, error } = await supabase
    .from('user_listing_lifecycle_events')
    .select('*')
    .eq('listing_id', id)
    .order('occurred_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as UserListingLifecycleEvent[];
}

// Chỉnh nội dung tin đang chờ duyệt qua RPC whitelist; không cho client đụng
// status/property_id/user_id. Approval vẫn chỉ do approve_user_listing đảm nhiệm.
export async function adminUpdatePendingUserListing(
  id: string,
  patch: Partial<Omit<UserListing, 'id' | 'user_id' | 'status' | 'reject_reason' | 'expires_at' | 'property_id' | 'created_at' | 'updated_at' | 'areas' | 'property_types' | 'profiles'>>,
): Promise<UserListing> {
  const canonicalPatch = typeof patch.title === 'string'
    ? {
        ...patch,
        title: normalizeListingTitle(patch.title, [patch.city ?? '', patch.district ?? '', patch.ward ?? '']).value,
      }
    : patch;
  const { data, error } = await supabase
    .rpc('admin_update_pending_user_listing', { p_listing_id: id, p_patch: canonicalPatch })
    .single();
  if (error) throw error;
  if (!data || typeof data !== 'object' || !('id' in data)) {
    throw new Error('Lưu chỉnh sửa không trả về tin đăng hợp lệ.');
  }
  return data as UserListing;
}

export type CanonicalLocationCorrectionResult = {
  listing_id: string;
  property_id: string;
  city: string;
  district: string | null;
  ward: string | null;
  area_id: string;
  district_id: string;
  ward_id: string;
  status: UserListing['status'];
  expires_at: string | null;
};

const CANONICAL_LOCATION_CORRECTION = {
  listingId: '3be55890-6ab2-455a-b3ef-daebd893f15d',
  propertyId: '823a968b-ec91-474f-8477-b989f1f1e01a',
  city: 'Bình Phước',
  district: 'Chơn Thành',
  ward: 'Nha Bích',
  areaId: '2e1657e8-d1fc-4d70-9eff-00ab3e3fbbe5',
  districtId: '82d73e51-d92b-4a78-bc1b-4939814acbba',
  wardId: 'fa9c6614-5ed7-4fcd-bb86-7dca3dd1f3eb',
} as const;

export function isCanonicalLocationCorrectionCandidate(listing: Pick<UserListing, 'id' | 'status' | 'city' | 'district' | 'ward' | 'area_id' | 'district_id' | 'ward_id' | 'neighborhood_slug' | 'expires_at'>): boolean {
  return listing.id === CANONICAL_LOCATION_CORRECTION.listingId
    && listing.status === 'approved'
    && typeof listing.expires_at === 'string'
    && new Date(listing.expires_at).getTime() > Date.now()
    && listing.city === 'Đồng Nai'
    && listing.district === null
    && listing.ward === 'Nha Bích'
    && listing.area_id === 'd1a0469f-acdc-4262-9f19-617c98e917fd'
    && listing.district_id === null
    && listing.ward_id === null
    && listing.neighborhood_slug === null;
}

export function isCanonicalLocationCorrectionResult(value: unknown): value is CanonicalLocationCorrectionResult {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return row.listing_id === CANONICAL_LOCATION_CORRECTION.listingId
    && row.property_id === CANONICAL_LOCATION_CORRECTION.propertyId
    && row.city === CANONICAL_LOCATION_CORRECTION.city
    && row.district === CANONICAL_LOCATION_CORRECTION.district
    && row.ward === CANONICAL_LOCATION_CORRECTION.ward
    && row.area_id === CANONICAL_LOCATION_CORRECTION.areaId
    && row.district_id === CANONICAL_LOCATION_CORRECTION.districtId
    && row.ward_id === CANONICAL_LOCATION_CORRECTION.wardId
    && row.status === 'approved'
    && typeof row.expires_at === 'string';
}

export async function adminCorrectCanonicalLocationConflict(): Promise<CanonicalLocationCorrectionResult> {
  const { data, error } = await supabase
    .rpc('admin_correct_canonical_location_conflict')
    .single();
  if (error) throw error;

  if (!isCanonicalLocationCorrectionResult(data)) {
    throw new Error('Correction trả về location hoặc identity không đúng mục tiêu.');
  }

  return data;
}

interface ApprovedListingProperty {
  property_id: string;
  title: string;
  description: string | null;
  city: string;
  district: string | null;
  listing_type: string;
  price: number;
  price_unit: string;
  area_sqm: number | null;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

export function isApprovedListingProperty(value: unknown): value is ApprovedListingProperty {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.property_id === 'string' && row.property_id.length > 0
    && typeof row.title === 'string'
    && typeof row.city === 'string'
    && (row.listing_type === 'mua_ban' || row.listing_type === 'cho_thue' || row.listing_type === 'can_mua' || row.listing_type === 'can_thue')
    && typeof row.price === 'number'
    && Number.isFinite(row.price)
    && typeof row.price_unit === 'string'
    && isNullableString(row.description)
    && isNullableString(row.district)
    && (row.area_sqm === null || (typeof row.area_sqm === 'number' && Number.isFinite(row.area_sqm)));
}

function hasApprovedPropertyId(value: unknown): value is { property_id: string } {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.property_id === 'string' && row.property_id.length > 0;
}

export async function applyUserListingSeoDraft(id: string): Promise<void> {
  const { error } = await supabase.rpc('admin_apply_user_listing_ai_seo', { p_listing_id: id });
  if (error) throw error;
}

export async function rejectUserListingSeoDraft(id: string): Promise<void> {
  const { error } = await supabase.rpc('admin_reject_user_listing_ai_seo', { p_listing_id: id });
  if (error) throw error;
}

export async function approveUserListing(id: string): Promise<void> {
  const { data, error } = await supabase
    .rpc('approve_user_listing', { p_listing_id: id })
    .single();
  if (error) throw error;

  if (!hasApprovedPropertyId(data)) {
    throw new Error('Duyệt tin không trả về property_id hợp lệ.');
  }
}

export async function rejectUserListing(id: string, reason: string): Promise<void> {
  const { error } = await supabase.from('user_listings').update({ status: 'rejected', reject_reason: reason, ai_seo_draft: null }).eq('id', id);
  if (error) throw error;
}

// User tự gia hạn tin đã hết hạn (hoặc sắp hết hạn): đưa về 'pending' để admin
// duyệt lại → duyệt xong nhận hạn mới 60 ngày. RLS user_listings_update_own buộc
// status sau khi sửa = 'pending' nên user không thể tự kéo dài hạn mà không qua duyệt.
// .select() bắt trường hợp RLS lọc mất dòng (0-row update mà không báo lỗi).
export async function renewMyListing(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('user_listings')
    .update({ status: 'pending', reject_reason: null, expires_at: null })
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('Không gia hạn được tin — bạn không có quyền hoặc tin không tồn tại.');
  }
}

// Admin đặt/đổi ngày hết hạn cho 1 tin (form chỉnh sửa BĐS). Chỉ đổi expires_at,
// giữ nguyên status. RLS user_listings_admin_update (is_admin) cho phép.
export async function adminSetExpiry(id: string, expiresAtISO: string | null): Promise<void> {
  const { error } = await supabase.from('user_listings').update({ expires_at: expiresAtISO }).eq('id', id);
  if (error) throw error;
}

// ─── Bulk operations ──────────────────────────────────────────────────────────
// Duyệt hàng loạt vẫn gọi RPC riêng cho từng tin để giữ khóa và lifecycle atomic.
// Trả số tin duyệt thành công.
export async function bulkApproveUserListings(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const results = await Promise.allSettled(ids.map(id => approveUserListing(id)));
  const ok = results.filter(r => r.status === 'fulfilled').length;
  if (ok < ids.length) console.error(`[api] bulkApprove: ${ids.length - ok}/${ids.length} tin thất bại`);
  return ok;
}

// Từ chối hàng loạt là update thuần → gộp 1 câu .in().
export async function bulkRejectUserListings(ids: string[], reason: string): Promise<number> {
  if (ids.length === 0) return 0;
  const { error, count } = await supabase
    .from('user_listings')
    .update({ status: 'rejected', reject_reason: reason, ai_seo_draft: null }, { count: 'exact' })
    .in('id', ids);
  if (error) throw error;
  return count ?? ids.length;
}
