import { supabase, type Area, type District, type Ward, type Neighborhood, type PropertyType } from '../supabase';

// ─── Areas ────────────────────────────────────────────────────────────────────
export async function getAreas(): Promise<Area[]> {
  const { data } = await supabase.from('areas').select('*').order('order_index');
  return data ?? [];
}

// ─── Districts ─────────────────────────────────────────────────────────────────
export async function getDistricts(areaId?: string): Promise<District[]> {
  let q = supabase.from('districts').select('*').order('order_index');
  if (areaId) q = q.eq('area_id', areaId);
  const { data } = await q;
  return (data ?? []) as District[];
}
export async function adminCreateDistrict(d: Omit<District, 'id' | 'created_at'>): Promise<void> {
  const { error } = await supabase.from('districts').insert(d);
  if (error) throw error;
}
export async function adminUpdateDistrict(id: string, d: Partial<District>): Promise<void> {
  const { error } = await supabase.from('districts').update(d).eq('id', id);
  if (error) throw error;
}
export async function adminDeleteDistrict(id: string): Promise<void> {
  const { error } = await supabase.from('districts').delete().eq('id', id);
  if (error) throw error;
}
export async function updateArea(id: string, a: Partial<Area>): Promise<void> {
  const { error } = await supabase.from('areas').update(a).eq('id', id);
  if (error) throw error;
}

// ─── Wards (Phường/Xã) ──────────────────────────────────────────────────────────
export async function getWards(districtId?: string): Promise<Ward[]> {
  let q = supabase.from('wards').select('*').order('order_index');
  if (districtId) q = q.eq('district_id', districtId);
  const { data } = await q;
  return (data ?? []) as Ward[];
}

// ─── Neighborhoods (Khu dân cư) ─────────────────────────────────────────────────
export async function getNeighborhoods(wardId?: string): Promise<Neighborhood[]> {
  let q = supabase.from('neighborhoods').select('*').order('order_index');
  if (wardId) q = q.eq('ward_id', wardId);
  const { data } = await q;
  return (data ?? []) as Neighborhood[];
}
export async function adminCreateNeighborhood(n: Omit<Neighborhood, 'id' | 'created_at'>): Promise<void> {
  const { error } = await supabase.from('neighborhoods').insert(n);
  if (error) throw error;
}
// Cập nhật khu dân cư. Nếu admin đổi slug (n.slug khác oldSlug) → gọi RPC atomic
// cascade đồng bộ slug sang properties/user_listings + khóa trang nội dung, rồi mới
// update các trường còn lại. Không đổi slug → update thường như cũ.
export async function adminUpdateNeighborhood(id: string, n: Partial<Neighborhood>, oldSlug?: string): Promise<void> {
  if (oldSlug && n.slug && n.slug !== oldSlug) {
    const { error: rpcError } = await supabase.rpc('rename_neighborhood_slug', { p_id: id, p_old: oldSlug, p_new: n.slug });
    if (rpcError) throw rpcError;
    const { slug: _slug, ...rest } = n;
    if (Object.keys(rest).length) {
      const { error } = await supabase.from('neighborhoods').update(rest).eq('id', id);
      if (error) throw error;
    }
    return;
  }
  const { error } = await supabase.from('neighborhoods').update(n).eq('id', id);
  if (error) throw error;
}
// Xóa khu dân cư + trang container 'khu-dan-cu:<slug>' (page_blocks pillar/FAQ tự
// cascade theo FK ON DELETE CASCADE). Truyền slug để dọn trang, tránh để trang mồ côi
// như trước (adminDeleteNeighborhood cũ chỉ xóa dòng neighborhoods).
export async function adminDeleteNeighborhood(id: string, slug?: string): Promise<void> {
  const { error } = await supabase.from('neighborhoods').delete().eq('id', id);
  if (error) throw error;
  if (slug?.trim()) {
    await supabase.from('managed_pages').delete().eq('slug', `khu-dan-cu:${slug}`);
  }
}

// ─── Property Types ───────────────────────────────────────────────────────────
export async function getPropertyTypes(): Promise<PropertyType[]> {
  const { data } = await supabase.from('property_types').select('*').order('name');
  return data ?? [];
}
