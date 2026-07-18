import { supabase, type Property, type FeaturedSection, type FeaturedSectionItem, type PageSection, type ManagedPage, type PageBlock } from '../supabase';

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

  if (section.auto_sort === 'price_asc') q = q.order('price', { ascending: true });
  else if (section.auto_sort === 'price_desc') q = q.order('price', { ascending: false });
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
  return data as FeaturedSection;
}

export async function adminUpdateFeaturedSection(id: string, s: Partial<FeaturedSection>): Promise<void> {
  const { error } = await supabase.from('featured_sections').update({ ...s, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function adminDeleteFeaturedSection(id: string): Promise<void> {
  const { error } = await supabase.from('featured_sections').delete().eq('id', id);
  if (error) throw error;
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
  await supabase.from('featured_section_items').delete().eq('section_id', sectionId);
  if (propertyIds.length === 0) return;
  const items = propertyIds.map((property_id, i) => ({ section_id: sectionId, property_id, order_index: i }));
  const { error } = await supabase.from('featured_section_items').insert(items);
  if (error) throw error;
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
  return data as ManagedPage;
}

export async function adminUpdateManagedPage(id: string, updates: Partial<ManagedPage>): Promise<void> {
  const { error } = await supabase.from('managed_pages').update(updates).eq('id', id);
  if (error) throw error;
}

export async function adminDeleteManagedPage(id: string): Promise<void> {
  const { error } = await supabase.from('managed_pages').delete().eq('id', id);
  if (error) throw error;
}

export async function adminGetPageBlocks(slug: string): Promise<PageBlock[]> {
  const { data } = await supabase.from('page_blocks').select('*').eq('page_slug', slug).order('section').order('order_index');
  return (data ?? []) as PageBlock[];
}

export async function adminSavePageBlock(block: Omit<PageBlock, 'id' | 'created_at' | 'updated_at'>): Promise<void> {
  const { error } = await supabase.from('page_blocks')
    .upsert({ ...block }, { onConflict: 'page_slug,section,key' });
  if (error) throw error;
}

export async function adminDeletePageBlock(id: string): Promise<void> {
  const { error } = await supabase.from('page_blocks').delete().eq('id', id);
  if (error) throw error;
}

export async function adminSaveAllPageBlocks(_slug: string, blocks: Omit<PageBlock, 'id' | 'created_at' | 'updated_at'>[]): Promise<void> {
  for (const b of blocks) {
    const { error } = await supabase.from('page_blocks')
      .upsert({ ...b }, { onConflict: 'page_slug,section,key' });
    if (error) throw error;
  }
}

export async function getPageLayout(): Promise<PageSection[]> {
  const { data } = await supabase.from('page_sections').select('*').order('order_index', { ascending: true });
  return (data ?? []) as PageSection[];
}

export async function adminSavePageLayout(sections: Pick<PageSection, 'id' | 'is_visible' | 'order_index' | 'settings'>[]): Promise<void> {
  for (const s of sections) {
    const { error } = await supabase.from('page_sections')
      .update({ is_visible: s.is_visible, order_index: s.order_index, settings: s.settings })
      .eq('id', s.id);
    if (error) throw error;
  }
}
