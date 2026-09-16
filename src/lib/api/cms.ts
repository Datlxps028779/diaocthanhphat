import { supabase, type Property, type FeaturedSection, type FeaturedSectionItem, type PageSection, type ManagedPage, type PageBlock } from '../supabase';
import { revalidateHomeContent, revalidateNeighborhoodContent, revalidateRouteContent, routeRevalidationSnapshot, neighborhoodRevalidationSnapshot } from './contentRevalidation';

async function revalidatePageBlockContent(pageSlug: string): Promise<void> {
  if (pageSlug.startsWith('khu-dan-cu:')) {
    const neighborhoodSlug = pageSlug.slice('khu-dan-cu:'.length);
    const { data, error } = await supabase
      .from('neighborhoods')
      .select('id,slug,area_id')
      .eq('slug', neighborhoodSlug)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      await revalidateNeighborhoodContent('update', [{ current: neighborhoodRevalidationSnapshot(data) }]);
    }
    return;
  }
  await revalidateRouteContent('update', [{ current: routeRevalidationSnapshot(`/trang/${pageSlug}`) }]);
}

// ─── Featured Sections (public) ───────────────────────────────────────────────
export async function getFeaturedSections(): Promise<FeaturedSection[]> {
  const { data } = await supabase
    .from('featured_sections')
    .select('*')
    .eq('is_active', true)
    .order('order_index');
  return (data ?? []) as FeaturedSection[];
}

export async function getPropertiesForSection(section: FeaturedSection): Promise<Property[]> {
  if (section.mode === 'manual') {
    const { data } = await supabase
      .from('featured_section_items')
      .select('order_index, properties!inner(*, areas(id,name,slug), property_types(id,name,slug))')
      .eq('section_id', section.id)
      .eq('properties.is_active', true)
      .order('order_index');
    return ((data ?? []) as unknown as FeaturedSectionItem[])
      .map(item => item.properties)
      .filter((p): p is Property => p != null && p.is_active === true);
  }

  // NOTE: Tạm đọc trực tiếp bảng `properties` (join areas + property_types).
  // MV mv_active_properties đã tạo trong DB (8 dòng, quyền anon OK) nhưng PostgREST
  // schema cache không nhận diện được (404 PGRST205) dù đã NOTIFY / restart / COMMENT.
  // Rollback về base table để trang chủ chạy ổn định; sẽ bật lại MV sau qua RPC
  // (function luôn được PostgREST expose ổn định, tránh lỗi cache view).
  let q = supabase
    .from('properties')
    .select('*, areas(id,name,slug), property_types(id,name,slug)')
    .eq('is_active', true);

  if (section.filter_area_id) q = q.eq('area_id', section.filter_area_id);
  if (section.filter_district) q = q.eq('district', section.filter_district);
  if (section.filter_ward) q = q.eq('ward', section.filter_ward);
  if (section.filter_listing_type && section.filter_listing_type !== '') q = q.eq('listing_type', section.filter_listing_type);
  if (section.filter_property_type_id) q = q.eq('property_type_id', section.filter_property_type_id);
  if (section.filter_is_hot) q = q.eq('is_hot', true);
  if (section.filter_is_featured) q = q.eq('is_featured', true);

  const priceColumn = section.filter_listing_type === 'cho_thue' ? 'price_per_month' : 'price';
  if (section.auto_sort === 'price_asc') q = q.order(priceColumn, { ascending: true });
  else if (section.auto_sort === 'price_desc') q = q.order(priceColumn, { ascending: false });
  else if (section.auto_sort === 'views') q = q.order('views', { ascending: false });
  else q = q.order('created_at', { ascending: false });

  q = q.limit(section.display_count);
  const { data } = await q;
  return (data ?? []) as Property[];
}

// ─── Featured Sections (admin) ────────────────────────────────────────────────
export async function adminGetFeaturedSections(): Promise<FeaturedSection[]> {
  const { data } = await supabase.from('featured_sections').select('*').order('order_index');
  return (data ?? []) as FeaturedSection[];
}

export async function adminCreateFeaturedSection(s: Omit<FeaturedSection, 'id' | 'created_at' | 'updated_at'>): Promise<FeaturedSection> {
  const { data, error } = await supabase.from('featured_sections').insert(s).select().single();
  if (error) throw error;
  await revalidateHomeContent();
  return data as FeaturedSection;
}

export async function adminUpdateFeaturedSection(id: string, s: Partial<FeaturedSection>): Promise<void> {
  const { error } = await supabase.from('featured_sections').update({ ...s, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
  await revalidateHomeContent();
}

export async function adminDeleteFeaturedSection(id: string): Promise<void> {
  const { error } = await supabase.from('featured_sections').delete().eq('id', id);
  if (error) throw error;
  await revalidateHomeContent();
}

export async function adminGetSectionItems(sectionId: string): Promise<FeaturedSectionItem[]> {
  const { data } = await supabase
    .from('featured_section_items')
    .select('*, properties(id, title, image_url, price, price_label, price_unit, city, district)')
    .eq('section_id', sectionId)
    .order('order_index');
  return (data ?? []) as FeaturedSectionItem[];
}

export async function adminSetSectionItems(sectionId: string, propertyIds: string[]): Promise<void> {
  const { error: deleteError } = await supabase.from('featured_section_items').delete().eq('section_id', sectionId);
  if (deleteError) throw deleteError;
  if (propertyIds.length === 0) {
    await revalidateHomeContent();
    return;
  }
  const items = propertyIds.map((property_id, i) => ({ section_id: sectionId, property_id, order_index: i }));
  const { error } = await supabase.from('featured_section_items').insert(items);
  if (error) throw error;
  await revalidateHomeContent();
}

// ─── Managed Pages ────────────────────────────────────────────────────────────
export async function getManagedPages(): Promise<ManagedPage[]> {
  const { data } = await supabase.from('managed_pages').select('*').order('order_index', { ascending: true });
  return (data ?? []) as ManagedPage[];
}

export async function getPageBlocks(slug: string): Promise<PageBlock[]> {
  const { data } = await supabase.from('page_blocks').select('*').eq('page_slug', slug).order('order_index', { ascending: true });
  return (data ?? []) as PageBlock[];
}

export function pageBlocksToMap(blocks: PageBlock[]): Record<string, Record<string, string>> {
  const map: Record<string, Record<string, string>> = {};
  for (const b of blocks) {
    if (!map[b.section]) map[b.section] = {};
    map[b.section][b.key] = b.value ?? '';
  }
  return map;
}

export async function adminGetAllManagedPages(): Promise<ManagedPage[]> {
  const { data } = await supabase.from('managed_pages').select('*').order('order_index', { ascending: true });
  return (data ?? []) as ManagedPage[];
}

export async function adminCreateManagedPage(page: Omit<ManagedPage, 'id' | 'created_at' | 'updated_at'>): Promise<ManagedPage> {
  const { data, error } = await supabase.from('managed_pages').insert(page).select().single();
  if (error) throw error;
  await revalidatePageBlockContent(data.slug);
  return data as ManagedPage;
}

// Đảm bảo tồn tại 1 trang "chứa" (managed_pages) cho các namespace page_blocks không
// phải trang công khai — vd nội dung khu dân cư dùng slug "khu-dan-cu:<slug>".
// page_blocks.page_slug có FK tới managed_pages(slug); thiếu parent → insert block fail.
// Trang ẩn: is_active=false (route /trang/ tự notFound) + is_system=true (vắng sitemap
// + không hiện ở danh sách trang tùy biến). Idempotent: onConflict slug bỏ qua.
export async function adminEnsureManagedPage(slug: string, title: string): Promise<void> {
  const { error } = await supabase.from('managed_pages')
    .upsert({ slug, title, is_active: false, is_system: true }, { onConflict: 'slug', ignoreDuplicates: true });
  if (error) throw error;
}

export async function adminUpdateManagedPage(id: string, updates: Partial<ManagedPage>): Promise<void> {
  const { data: previous, error: previousError } = await supabase.from('managed_pages').select('slug').eq('id', id).maybeSingle();
  if (previousError) throw previousError;
  const { error } = await supabase.from('managed_pages').update(updates).eq('id', id);
  if (error) throw error;
  const { data: current, error: currentError } = await supabase.from('managed_pages').select('slug').eq('id', id).maybeSingle();
  if (currentError) throw currentError;
  const paths = [previous?.slug, current?.slug]
    .filter((slug): slug is string => Boolean(slug))
    .map(slug => ({ current: routeRevalidationSnapshot(`/trang/${slug}`) }));
  if (paths.length) await revalidateRouteContent('update', paths);
}

export async function adminDeleteManagedPage(id: string): Promise<void> {
  const { data: previous, error: previousError } = await supabase.from('managed_pages').select('slug').eq('id', id).maybeSingle();
  if (previousError) throw previousError;
  const { error } = await supabase.from('managed_pages').delete().eq('id', id);
  if (error) throw error;
  if (previous?.slug) {
    await revalidateRouteContent('delete', [{ previous: routeRevalidationSnapshot(`/trang/${previous.slug}`) }]);
  }
}

export async function adminGetPageBlocks(slug: string): Promise<PageBlock[]> {
  const { data } = await supabase.from('page_blocks').select('*').eq('page_slug', slug).order('section').order('order_index');
  return (data ?? []) as PageBlock[];
}

export async function adminSavePageBlock(block: Omit<PageBlock, 'id' | 'created_at' | 'updated_at'>): Promise<void> {
  const { error } = await supabase.from('page_blocks')
    .upsert({ ...block }, { onConflict: 'page_slug,section,key' });
  if (error) throw error;
  await revalidatePageBlockContent(block.page_slug);
}

export async function adminDeletePageBlock(id: string): Promise<void> {
  const { data: block, error: readError } = await supabase.from('page_blocks').select('page_slug').eq('id', id).maybeSingle();
  if (readError) throw readError;
  const { error } = await supabase.from('page_blocks').delete().eq('id', id);
  if (error) throw error;
  if (block?.page_slug) await revalidatePageBlockContent(block.page_slug);
}

export async function adminSaveAllPageBlocks(_slug: string, blocks: Omit<PageBlock, 'id' | 'created_at' | 'updated_at'>[]): Promise<void> {
  for (const b of blocks) {
    const { error } = await supabase.from('page_blocks')
      .upsert({ ...b }, { onConflict: 'page_slug,section,key' });
    if (error) throw error;
  }
  const slugs = [...new Set(blocks.map(block => block.page_slug))];
  await Promise.all(slugs.map(revalidatePageBlockContent));
}

export type AdminPageSectionInput = {
  id: string;
  is_visible?: boolean;
  order_index?: number;
  settings?: Record<string, unknown>;
  expected_updated_at?: string;
};

export class HomePageLayoutNoRowsError extends Error {
  readonly code = 'PAGE_SECTIONS_NO_ROWS';
  constructor() {
    super('Chưa có cấu hình trang chủ trong page_sections.');
    this.name = 'HomePageLayoutNoRowsError';
  }
}

export class AdminPageLayoutError extends Error {
  constructor(
    message: string,
    readonly stage: 'preflight' | 'write' | 'revalidation',
    readonly persistedIds: string[] = [],
    readonly failedId: string | null = null,
  ) {
    super(message);
    this.name = 'AdminPageLayoutError';
  }
}

export async function getPageLayout(): Promise<PageSection[]> {
  const { data, error } = await supabase.from('page_sections').select('*').order('order_index', { ascending: true });
  if (error) throw error;
  if (!data?.length) throw new HomePageLayoutNoRowsError();
  return data as PageSection[];
}

// Các hàng được ghi tuần tự, không phải một giao dịch atomic.
export async function adminSavePageLayout(sections: AdminPageSectionInput[]): Promise<PageSection[]> {
  if (!sections.length) return [];
  const ids = [...new Set(sections.map(section => section.id))];
  if (ids.length !== sections.length) throw new AdminPageLayoutError('Danh sách lưu có section trùng.', 'preflight');
  const { data, error } = await supabase.from('page_sections').select('*').in('id', ids);
  if (error) throw new AdminPageLayoutError(`Không đọc được cấu hình: ${error.message}`, 'preflight');
  const existing = new Map(((data ?? []) as PageSection[]).map(row => [row.id, row]));
  for (const section of sections) {
    const row = existing.get(section.id);
    if (!row) throw new AdminPageLayoutError(`Không tìm thấy section ${section.id}.`, 'preflight', [], section.id);
    if (section.expected_updated_at !== undefined && section.expected_updated_at !== row.updated_at) {
      throw new AdminPageLayoutError(`Cấu hình ${section.id} đã thay đổi. Hãy tải lại trước khi lưu.`, 'preflight', [], section.id);
    }
  }
  const persisted: PageSection[] = [];
  for (const section of sections) {
    const patch: Record<string, unknown> = {};
    if (section.is_visible !== undefined) patch.is_visible = section.is_visible;
    if (section.order_index !== undefined) patch.order_index = section.order_index;
    if (section.settings !== undefined) patch.settings = section.settings;
    if (!Object.keys(patch).length) continue;
    patch.updated_at = new Date().toISOString();
    const { data: updated, error: writeError } = await supabase.from('page_sections')
      .update(patch).eq('id', section.id)
      .eq('updated_at', existing.get(section.id)!.updated_at).select('*').single();
    if (writeError || !updated || updated.id !== section.id) {
      throw new AdminPageLayoutError(
        `Không lưu được ${section.id}: ${writeError?.message ?? 'không có hàng được cập nhật; quyền ghi hoặc phiên bản đã thay đổi'}. Đã ghi: ${persisted.map(row => row.id).join(', ') || 'chưa có'}.`,
        'write', persisted.map(row => row.id), section.id,
      );
    }
    persisted.push(updated as PageSection);
  }
  if (persisted.length) {
    try {
      await revalidateHomeContent();
    } catch (cause) {
      throw new AdminPageLayoutError(
        `Đã lưu cấu hình nhưng chưa làm mới cache trang chủ: ${cause instanceof Error ? cause.message : String(cause)}.`,
        'revalidation', persisted.map(row => row.id),
      );
    }
  }
  return persisted;
}
