import { supabase, type UserListing } from '../supabase';

// ─── User Listings ────────────────────────────────────────────────────────────
export async function submitUserListing(listing: Omit<UserListing, 'id' | 'user_id' | 'status' | 'reject_reason' | 'expires_at' | 'property_id' | 'created_at' | 'updated_at' | 'areas' | 'property_types' | 'profiles'>): Promise<void> {
  const { error } = await supabase.from('user_listings').insert(listing);
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
  listing: Omit<UserListing, 'id' | 'user_id' | 'status' | 'reject_reason' | 'expires_at' | 'property_id' | 'created_at' | 'updated_at' | 'areas' | 'property_types' | 'profiles'>,
): Promise<void> {
  const { data, error } = await supabase
    .from('user_listings')
    .update({ ...listing, status: 'pending', reject_reason: null, expires_at: null })
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
// RPC return shape. The database locks the listing then inserts its public
// property and updates lifecycle state in one transaction; the browser never
// constructs an approval insert itself.
export interface ApprovedListingProperty {
  property_id: string;
  title: string;
  description: string | null;
  city: string;
  district: string | null;
  // Database constraint also permits historical can_mua/can_thue values.
  listing_type: string;
  price: number;
  price_unit: string;
  area_sqm: number | null;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

// Supabase RPC results are untyped at runtime. Validate the committed database
// result before passing it to optional AI enrichment so a schema mismatch cannot
// create a malformed Edge Function request after an otherwise valid approval.
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

async function autoTagApprovedProperty(approved: ApprovedListingProperty): Promise<void> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) return;

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!token) return;

    await fetch(`${supabaseUrl}/functions/v1/ai-autotag`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        propertyId: approved.property_id,
        title: approved.title,
        description: approved.description,
        city: approved.city,
        district: approved.district,
        listingType: approved.listing_type,
        price: approved.price,
        priceUnit: approved.price_unit,
        areaSqm: approved.area_sqm,
      }),
    });
  } catch {
    // AI is enrichment only. A failed request must never report a committed
    // approval as failed or make an admin retry the lifecycle transition.
  }
}

function hasApprovedPropertyId(value: unknown): value is { property_id: string } {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.property_id === 'string' && row.property_id.length > 0;
}

export async function approveUserListing(id: string): Promise<void> {
  const { data, error } = await supabase
    .rpc('approve_user_listing', { p_listing_id: id })
    .single();
  if (error) throw error;

  if (!hasApprovedPropertyId(data)) {
    throw new Error('Duyệt tin không trả về property_id hợp lệ.');
  }

  // The RPC has committed at this point. A malformed optional enrichment payload
  // must not make the Admin UI treat that successful lifecycle transition as a
  // failure and retry it; skip autotagging instead.
  if (isApprovedListingProperty(data)) {
    void autoTagApprovedProperty(data);
  } else {
    console.warn('[api] Approval committed but AI autotag payload was invalid.');
  }
}
export async function rejectUserListing(id: string, reason: string): Promise<void> {
  const { error } = await supabase.from('user_listings').update({ status: 'rejected', reject_reason: reason }).eq('id', id);
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
// Duyệt hàng loạt KHÔNG gộp được thành 1 câu: mỗi tin phải insert sang properties
// + bắn AI autotag, nên lặp approveUserListing và chịu lỗi cục bộ (allSettled).
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
    .update({ status: 'rejected', reject_reason: reason }, { count: 'exact' })
    .in('id', ids);
  if (error) throw error;
  return count ?? ids.length;
}
