import { supabase, type Area, type District, type Ward, type Neighborhood, type PropertyType, type NewsCategoryRow, type NewsArticle } from '../supabase';
import type { TaxonomyGeo } from '../taxonomyGeo';
import {
  areaRevalidationSnapshot,
  neighborhoodRevalidationSnapshot,
  newsRevalidationSnapshot,
  revalidateAreaContent,
  revalidateNeighborhoodContent,
  revalidateNewsContent,
  revalidateRouteContent,
  routeRevalidationSnapshot,
} from './contentRevalidation';

const NEWS_CATEGORY_REVALIDATION_SELECT = 'id,slug,category,is_published';

async function getNewsCategorySnapshots(label: string | null | undefined): Promise<NewsArticle[]> {
  if (!label) return [];
  const { data, error } = await supabase
    .from('news')
    .select(NEWS_CATEGORY_REVALIDATION_SELECT)
    .eq('category', label);
  if (error) throw error;
  return (data ?? []) as NewsArticle[];
}

async function revalidateNewsCategoryRoutes(slugs: Array<string | null | undefined>): Promise<void> {
  const paths = [
    '/tin-tuc', '/kien-thuc', '/sitemap.xml',
    ...slugs.filter((slug): slug is string => Boolean(slug)).map(slug => `/tin-tuc/danh-muc/${slug}`),
  ];
  await revalidateRouteContent('update', [...new Set(paths)].map(path => ({ current: routeRevalidationSnapshot(path) })));
}

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
export async function updateArea(id: string, a: Partial<Omit<Area, 'schema_markup'>>): Promise<void> {
  const { data: previous, error: previousError } = await supabase.from('areas').select('id,slug').eq('id', id).maybeSingle();
  if (previousError) throw previousError;
  const { schema_markup: _schemaMarkup, ...safePatch } = a as typeof a & { schema_markup?: unknown };
  const { error } = await supabase.from('areas').update(safePatch).eq('id', id);
  if (error) throw error;
  const { data: current, error: currentError } = await supabase.from('areas').select('id,slug').eq('id', id).maybeSingle();
  if (currentError) throw currentError;
  await revalidateAreaContent('update', [{
    previous: previous ? areaRevalidationSnapshot(previous) : undefined,
    current: current ? areaRevalidationSnapshot(current) : undefined,
  }]);
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
export async function adminCreateNeighborhood(n: Omit<Neighborhood, 'id' | 'created_at' | 'schema_markup'>): Promise<void> {
  const { schema_markup: _schemaMarkup, ...safePayload } = n as typeof n & { schema_markup?: unknown };
  const { data: created, error } = await supabase.from('neighborhoods').insert(safePayload).select('id,slug,area_id').single();
  if (error) throw error;
  await revalidateNeighborhoodContent('create', [{ current: neighborhoodRevalidationSnapshot(created) }]);
}
// Cập nhật khu dân cư. Nếu admin đổi slug (n.slug khác oldSlug) → gọi RPC atomic
// cascade đồng bộ slug sang properties/user_listings + khóa trang nội dung, rồi mới
// update các trường còn lại. Không đổi slug → update thường như cũ.
export async function adminUpdateNeighborhood(id: string, n: Partial<Omit<Neighborhood, 'schema_markup'>>, oldSlug?: string): Promise<void> {
  const { data: previous, error: previousError } = await supabase.from('neighborhoods').select('id,slug,area_id').eq('id', id).maybeSingle();
  if (previousError) throw previousError;
  const { schema_markup: _schemaMarkup, ...safePatch } = n as typeof n & { schema_markup?: unknown };
  if (oldSlug && n.slug && n.slug !== oldSlug) {
    const { error: rpcError } = await supabase.rpc('rename_neighborhood_slug', { p_id: id, p_old: oldSlug, p_new: n.slug });
    if (rpcError) throw rpcError;
    const { slug: _slug, ...rest } = safePatch;
    if (Object.keys(rest).length) {
      const { error } = await supabase.from('neighborhoods').update(rest).eq('id', id);
      if (error) throw error;
    }
  } else {
    const { error } = await supabase.from('neighborhoods').update(safePatch).eq('id', id);
    if (error) throw error;
  }
  const { data: current, error: currentError } = await supabase.from('neighborhoods').select('id,slug,area_id').eq('id', id).maybeSingle();
  if (currentError) throw currentError;
  await revalidateNeighborhoodContent('update', [{
    previous: previous ? neighborhoodRevalidationSnapshot(previous) : undefined,
    current: current ? neighborhoodRevalidationSnapshot(current) : undefined,
  }]);
}
// Xóa khu dân cư + trang container 'khu-dan-cu:<slug>' (page_blocks pillar/FAQ tự
// cascade theo FK ON DELETE CASCADE). Truyền slug để dọn trang, tránh để trang mồ côi
// như trước (adminDeleteNeighborhood cũ chỉ xóa dòng neighborhoods).
export async function adminDeleteNeighborhood(id: string, slug?: string): Promise<void> {
  const { data: previous, error: previousError } = await supabase.from('neighborhoods').select('id,slug,area_id').eq('id', id).maybeSingle();
  if (previousError) throw previousError;
  const { error } = await supabase.from('neighborhoods').delete().eq('id', id);
  if (error) throw error;
  if (slug?.trim()) {
    const { error: pageError } = await supabase.from('managed_pages').delete().eq('slug', `khu-dan-cu:${slug}`);
    if (pageError) throw pageError;
  }
  if (previous) {
    await revalidateNeighborhoodContent('delete', [{ previous: neighborhoodRevalidationSnapshot(previous) }]);
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
  const { data, error } = await supabase.from('news_categories').insert(c).select('slug').single();
  if (error) throw error;
  await revalidateNewsCategoryRoutes([data.slug]);
}
export async function adminReorderNewsCategories(items: Array<{ id: string; order_index: number }>): Promise<void> {
  const results = await Promise.all(items.map(item =>
    supabase.from('news_categories').update({ order_index: item.order_index }).eq('id', item.id),
  ));
  const failed = results.find(result => result.error);
  if (failed?.error) throw failed.error;
  await revalidateNewsCategoryRoutes([]);
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
  const { data: previousCategory, error: previousError } = await supabase
    .from('news_categories')
    .select('label,slug')
    .eq('id', id)
    .maybeSingle();
  if (previousError) throw previousError;
  const previousLabel = previousCategory?.label ?? oldLabel;
  const previousSlug = previousCategory?.slug ?? oldSlug;
  const labelChanged = previousLabel != null && c.label != null && c.label !== previousLabel;
  const slugChanged = previousSlug != null && c.slug != null && c.slug !== previousSlug;
  const previousNews = labelChanged ? await getNewsCategorySnapshots(previousLabel) : [];

  if (labelChanged || slugChanged) {
    const { error: rpcError } = await supabase.rpc('rename_news_category', {
      p_id: id,
      p_old_label: previousLabel,
      p_new_label: c.label ?? previousLabel,
      p_new_slug: c.slug ?? previousSlug,
    });
    if (rpcError) throw rpcError;
    const { label: _label, slug: _slug, ...rest } = c;
    if (Object.keys(rest).length) {
      const { error } = await supabase.from('news_categories').update(rest).eq('id', id);
      if (error) throw error;
    }
  } else {
    const { error } = await supabase.from('news_categories').update(c).eq('id', id);
    if (error) throw error;
  }

  const { data: currentCategory, error: currentError } = await supabase
    .from('news_categories')
    .select('label,slug')
    .eq('id', id)
    .maybeSingle();
  if (currentError) throw currentError;
  const currentNews = labelChanged ? await getNewsCategorySnapshots(currentCategory?.label) : [];
  if (previousNews.length || currentNews.length) {
    const targets = new Map<string, { previous?: ReturnType<typeof newsRevalidationSnapshot>; current?: ReturnType<typeof newsRevalidationSnapshot> }>();
    previousNews.forEach(article => {
      targets.set(article.id, { previous: newsRevalidationSnapshot(article) });
    });
    currentNews.forEach(article => {
      const target = targets.get(article.id);
      targets.set(article.id, { ...target, current: newsRevalidationSnapshot(article) });
    });
    await revalidateNewsContent('update', [...targets.values()]);
  }
  await revalidateNewsCategoryRoutes([previousSlug, currentCategory?.slug]);
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
  await revalidateNewsCategoryRoutes([]);
}
