import { supabase, type UserListing } from '../supabase';
import { buildUniqueSlug } from '../slug';
import { resolveApprovalExpiresAt } from '../listingExpiry';

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
export async function approveUserListing(id: string): Promise<void> {
  const { data: listing, error: fetchErr } = await supabase.from('user_listings').select('*').eq('id', id).single();
  if (fetchErr || !listing) throw new Error('Listing not found');
  const { data: inserted, error: propErr } = await supabase.from('properties').insert({
    slug: buildUniqueSlug(listing.title),
    title: listing.title, description: listing.description,
    price: listing.price, price_unit: listing.price_unit, price_label: listing.price_label,
    listing_type: listing.listing_type ?? 'mua_ban',
    area_sqm: listing.area_sqm, address: listing.address, city: listing.city, district: listing.district, ward: listing.ward,
    area_id: listing.area_id, property_type_id: listing.property_type_id,
    image_url: listing.image_url, images: listing.images, legal_status: listing.legal_status,
    bedrooms: listing.bedrooms, bathrooms: listing.bathrooms, direction: listing.direction,
    contact_name: listing.contact_name, contact_phone: listing.contact_phone,
    amenities: listing.amenities, is_active: true, is_featured: false, is_hot: false,
    latitude: listing.latitude, longitude: listing.longitude,
    vr_tour_url: listing.vr_tour_url, video_url: listing.video_url,
    formatted_address: listing.formatted_address, contact_zalo: listing.contact_zalo,
  }).select('id').single();
  if (propErr) throw propErr;
  const expiresAt = resolveApprovalExpiresAt(listing.expires_at, new Date().toISOString());
  await supabase.from('user_listings').update({ status: 'approved', property_id: inserted?.id ?? null, expires_at: expiresAt }).eq('id', id);

  // Fire-and-forget AI auto-tagging. Gửi session JWT (luồng admin duyệt tin) để
  // Edge Function ai-autotag xác thực admin — anon key sẽ bị từ chối 401.
  if (inserted?.id) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    fetch(`${supabaseUrl}/functions/v1/ai-autotag`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        propertyId: inserted.id,
        title: listing.title,
        description: listing.description,
        city: listing.city,
        district: listing.district,
        listingType: listing.listing_type,
        price: listing.price,
        priceUnit: listing.price_unit,
        areaSqm: listing.area_sqm,
      }),
    }).catch(() => {});
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
