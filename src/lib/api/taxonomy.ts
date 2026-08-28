import { supabase, type Area, type District, type Ward, type Neighborhood, type PropertyType, type NewsCategoryRow } from '../supabase';
import type { TaxonomyGeo } from '../taxonomyGeo';

export async function getTaxonomyGeo(entityIds: string[]): Promise<TaxonomyGeo[]> {
  const ids = [...new Set(entityIds.filter(Boolean))];
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('taxonomy_geo')
    .select('entity_type, entity_id, bounds, center_lat, center_lng, geojson, source, source_year, administrative_vintage')
    .in('entity_id', ids)
    .eq('is_published', true)
    .eq('administrative_vintage', 'legacy_pre_merger');
  if (error) {
    // Chưa seed geometry không được làm hỏng form; LocationPicker sẽ báo rõ thiếu dữ liệu.
    return [];
  }
  return (data ?? []) as TaxonomyGeo[];
}
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

// ─── News Categories (Danh mục tin tức) ─────────────────────────────────────────
export async function getNewsCategories(): Promise<NewsCategoryRow[]> {
  const { data } = await supabase.from('news_categories').select('*').order('order_index');
  return (data ?? []) as NewsCategoryRow[];
}
export async function adminCreateNewsCategory(c: Omit<NewsCategoryRow, 'id' | 'created_at' | 'updated_at'>): Promise<void> {
  const { error } = await supabase.from('news_categories').insert(c);
  if (error) throw error;
}
export async function adminReorderNewsCategories(items: Array<{ id: string; order_index: number }>): Promise<void> {
  const results = await Promise.all(items.map(item =>
    supabase.from('news_categories').update({ order_index: item.order_index }).eq('id', item.id),
  ));
  const failed = results.find(result => result.error);
  if (failed?.error) throw failed.error;
}
// Cập nhật danh mục. Nếu đổi label/slug so với giá trị cũ → gọi RPC rename_news_category
// (atomic: đổi label/slug + cascade news.category cũ→mới), rồi update các trường còn lại
// (badge_color/seo_description/order_index). Không đổi label/slug → update thường.
export async function adminUpdateNewsCategory(
  id: string,
  c: Partial<NewsCategoryRow>,
  oldLabel?: string,
  oldSlug?: string,
): Promise<void> {
  const labelChanged = oldLabel != null && c.label != null && c.label !== oldLabel;
  const slugChanged = oldSlug != null && c.slug != null && c.slug !== oldSlug;
  if (labelChanged || slugChanged) {
    const { error: rpcError } = await supabase.rpc('rename_news_category', {
      p_id: id,
      p_old_label: oldLabel,
      p_new_label: c.label ?? oldLabel,
      p_new_slug: c.slug ?? oldSlug,
    });
    if (rpcError) throw rpcError;
    const { label: _label, slug: _slug, ...rest } = c;
    if (Object.keys(rest).length) {
      const { error } = await supabase.from('news_categories').update(rest).eq('id', id);
      if (error) throw error;
    }
    return;
  }
  const { error } = await supabase.from('news_categories').update(c).eq('id', id);
  if (error) throw error;
}
// Xoá danh mục — CHẶN nếu còn bài viết mang nhãn này (tránh bài mồ côi khỏi route).
export async function adminDeleteNewsCategory(id: string, label: string): Promise<void> {
  const { count, error: countError } = await supabase
    .from('news').select('id', { count: 'exact', head: true }).eq('category', label);
  if (countError) throw countError;
  if ((count ?? 0) > 0) {
    throw new Error(`Danh mục "${label}" còn ${count} bài viết. Hãy chuyển hoặc xoá bài trước khi xoá danh mục.`);
  }
  const { error } = await supabase.from('news_categories').delete().eq('id', id);
  if (error) throw error;
}
