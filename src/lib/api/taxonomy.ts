import { supabase, type Area, type District, type Ward, type Neighborhood, type PropertyType, type NewsCategoryRow, type NewsArticle, type Property } from '../supabase';
import type { TaxonomyGeo } from '../taxonomyGeo';
import { isSafePublicSlugSegment } from '../slug';
import { adminRefreshRagIndex } from './aiRag';
import {
  areaRevalidationSnapshot,
  neighborhoodRevalidationSnapshot,
  propertyRevalidationSnapshot,
  revalidatePropertyContent,
  newsRevalidationSnapshot,
  revalidateAreaContent,
  revalidateNeighborhoodContent,
  revalidateNewsContent,
  revalidateRouteContent,
  routeRevalidationSnapshot,
} from './contentRevalidation';

const NEWS_CATEGORY_REVALIDATION_SELECT = 'id,slug,category,is_published,updated_at';
const PROPERTY_REVALIDATION_SELECT = 'id,slug,public_code,listing_type,district,district_id,property_type_id,area_id,neighborhood_slug,is_active,updated_at';

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
    ...slugs.filter((slug): slug is string => isSafePublicSlugSegment(slug)).map(slug => `/tin-tuc/danh-muc/${slug.trim()}`),
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
async function getPropertySnapshotsByFilter(column: 'area_id' | 'district_id' | 'property_type_id', value: string): Promise<Property[]> {
  const { data, error } = await supabase
    .from('properties')
    .select(PROPERTY_REVALIDATION_SELECT)
    .eq(column, value);
  if (error) throw error;
  return (data ?? []) as Property[];
}

function mergePropertyRevalidationTargets(
  previous: Property[],
  current: Property[],
  context?: { previous?: { area_slug?: string | null; property_type_slug?: string | null }; current?: { area_slug?: string | null; property_type_slug?: string | null } },
) {
  const targets = new Map<string, { previous?: ReturnType<typeof propertyRevalidationSnapshot>; current?: ReturnType<typeof propertyRevalidationSnapshot> }>();
  previous.forEach(row => targets.set(row.id, { previous: propertyRevalidationSnapshot(row, context?.previous) }));
  current.forEach(row => targets.set(row.id, {
    ...targets.get(row.id),
    current: propertyRevalidationSnapshot(row, context?.current),
  }));
  return [...targets.values()];
}

async function revalidatePropertyTaxonomySurface(
  targets: ReturnType<typeof mergePropertyRevalidationTargets>,
  areaIds: string[] = [],
): Promise<void> {
  if (targets.length) await revalidatePropertyContent('bulk', targets);
  const uniqueAreaIds = [...new Set(areaIds.filter(Boolean))];
  let areaPaths: string[] = [];
  if (uniqueAreaIds.length > 0) {
    const { data, error } = await supabase.from('areas').select('slug').in('id', uniqueAreaIds);
    if (error) throw error;
    areaPaths = (data ?? [])
      .map(row => row.slug)
      .filter((slug): slug is string => isSafePublicSlugSegment(slug))
      .flatMap(slug => [`/khu-vuc/${slug.trim()}`, `/mua-ban/${slug.trim()}`, `/cho-thue/${slug.trim()}`]);
  }
  await revalidateRouteContent('update', [
    '/khu-vuc', '/khu-dan-cu', '/danh-sach', '/mua-ban', '/cho-thue',
    ...areaPaths,
  ].map(path => ({ current: routeRevalidationSnapshot(path) })));
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
  await revalidatePropertyTaxonomySurface([], [d.area_id]);
}
export async function adminUpdateDistrict(id: string, d: Partial<District>): Promise<void> {
  const { data: previousDistrict, error: previousDistrictError } = await supabase
    .from('districts').select('area_id').eq('id', id).maybeSingle();
  if (previousDistrictError) throw previousDistrictError;
  const previous = await getPropertySnapshotsByFilter('district_id', id);
  const { error } = await supabase.from('districts').update(d).eq('id', id);
  if (error) throw error;
  const current = await getPropertySnapshotsByFilter('district_id', id);
  await revalidatePropertyTaxonomySurface(mergePropertyRevalidationTargets(previous, current), [previousDistrict?.area_id, d.area_id].filter((value): value is string => Boolean(value)));
}
export async function adminDeleteDistrict(id: string): Promise<void> {
  const { data: previousDistrict, error: previousDistrictError } = await supabase
    .from('districts').select('area_id').eq('id', id).maybeSingle();
  if (previousDistrictError) throw previousDistrictError;
  const previous = await getPropertySnapshotsByFilter('district_id', id);
  const { error } = await supabase.from('districts').delete().eq('id', id);
  if (error) throw error;
  await revalidatePropertyTaxonomySurface(mergePropertyRevalidationTargets(previous, []), [previousDistrict?.area_id].filter((value): value is string => Boolean(value)));
}
export async function updateArea(id: string, a: Partial<Omit<Area, 'schema_markup'>>): Promise<void> {
  const { data: previous, error: previousError } = await supabase.from('areas').select('id,slug').eq('id', id).maybeSingle();
  if (previousError) throw previousError;
  const previousProperties = previous?.slug && a.slug && a.slug !== previous.slug
    ? await getPropertySnapshotsByFilter('area_id', id)
    : [];
  const { schema_markup: _schemaMarkup, ...safePatch } = a as typeof a & { schema_markup?: unknown };
  const { error } = await supabase.from('areas').update(safePatch).eq('id', id);
  if (error) throw error;
  const { data: current, error: currentError } = await supabase.from('areas').select('id,slug').eq('id', id).maybeSingle();
  if (currentError) throw currentError;
  if (previousProperties.length || (previous?.slug && current?.slug && previous.slug !== current.slug)) {
    const currentProperties = await getPropertySnapshotsByFilter('area_id', id);
    await revalidatePropertyContent('bulk', mergePropertyRevalidationTargets(previousProperties, currentProperties, {
      previous: { area_slug: previous?.slug },
      current: { area_slug: current?.slug },
    }));
  }
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

export async function adminCreatePropertyType(type: Omit<PropertyType, 'id' | 'created_at'>): Promise<void> {
  const { error } = await supabase.from('property_types').insert(type);
  if (error) throw error;
  await revalidatePropertyTaxonomySurface([]);
  await adminRefreshRagIndex('property_types');
}

export async function adminUpdatePropertyType(id: string, updates: Partial<PropertyType>): Promise<void> {
  const { data: previousType, error: previousTypeError } = await supabase.from('property_types').select('slug').eq('id', id).maybeSingle();
  if (previousTypeError) throw previousTypeError;
  const previous = await getPropertySnapshotsByFilter('property_type_id', id);
  const { error } = await supabase.from('property_types').update(updates).eq('id', id);
  if (error) throw error;
  const current = await getPropertySnapshotsByFilter('property_type_id', id);
  const currentType = await supabase.from('property_types').select('slug').eq('id', id).maybeSingle();
  if (currentType.error) throw currentType.error;
  await revalidatePropertyTaxonomySurface(mergePropertyRevalidationTargets(previous, current, {
    previous: { property_type_slug: previousType?.slug },
    current: { property_type_slug: currentType.data?.slug },
  }));
  await adminRefreshRagIndex('property_types');
}

export async function adminDeletePropertyType(id: string): Promise<void> {
  const previous = await getPropertySnapshotsByFilter('property_type_id', id);
  const { error } = await supabase.from('property_types').delete().eq('id', id);
  if (error) throw error;
  await revalidatePropertyTaxonomySurface(mergePropertyRevalidationTargets(previous, []));
  await adminRefreshRagIndex('property_types');
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
  await adminRefreshRagIndex('news_categories');
}
export async function adminReorderNewsCategories(items: Array<{ id: string; order_index: number }>): Promise<void> {
  const results = await Promise.all(items.map(item =>
    supabase.from('news_categories').update({ order_index: item.order_index }).eq('id', item.id),
  ));
  const failed = results.find(result => result.error);
  if (failed?.error) throw failed.error;
  await revalidateNewsCategoryRoutes([]);
  await adminRefreshRagIndex('news_categories');
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
  await adminRefreshRagIndex('news_categories');
}
// Xoá danh mục — CHẶN nếu còn bài viết mang nhãn này (tránh bài mồ côi khỏi route).
export async function adminDeleteNewsCategory(id: string, label: string): Promise<void> {
  const { data: previousCategory, error: previousCategoryError } = await supabase
    .from('news_categories').select('slug').eq('id', id).maybeSingle();
  if (previousCategoryError) throw previousCategoryError;
  const { count, error: countError } = await supabase
    .from('news').select('id', { count: 'exact', head: true }).eq('category', label);
  if (countError) throw countError;
  if ((count ?? 0) > 0) {
    throw new Error(`Danh mục "${label}" còn ${count} bài viết. Hãy chuyển hoặc xoá bài trước khi xoá danh mục.`);
  }
  const { error } = await supabase.from('news_categories').delete().eq('id', id);
  if (error) throw error;
  await revalidateNewsCategoryRoutes([previousCategory?.slug]);
  await adminRefreshRagIndex('news_categories');
}
