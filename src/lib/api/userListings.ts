import { supabase, type UserListing } from '../supabase';
import { buildUniqueSlug } from '../slug';

// ─── User Listings ────────────────────────────────────────────────────────────
export async function submitUserListing(listing: Omit<UserListing, 'id' | 'user_id' | 'status' | 'reject_reason' | 'created_at' | 'updated_at' | 'areas' | 'property_types' | 'profiles'>): Promise<void> {
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
    area_sqm: listing.area_sqm, address: listing.address, city: listing.city, district: listing.district,
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
  await supabase.from('user_listings').update({ status: 'approved' }).eq('id', id);

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
