import { supabase, type SiteSetting, type SiteContent, type Banner } from '../supabase';

// ─── CMS: Site Settings ───────────────────────────────────────────────────────
export async function getSiteSettings(): Promise<Record<string, string>> {
  const { data } = await supabase.from('site_settings').select('key, value').order('group_name');
  const map: Record<string, string> = {};
  (data ?? []).forEach((row: { key: string; value: string | null }) => { map[row.key] = row.value ?? ''; });
  return map;
}
export async function adminGetAllSiteSettings(): Promise<SiteSetting[]> {
  const { data } = await supabase.from('site_settings').select('*').order('group_name, key');
  return (data ?? []) as SiteSetting[];
}
export async function updateSiteSetting(key: string, value: string): Promise<void> {
  const { error } = await supabase.from('site_settings').update({ value, updated_at: new Date().toISOString() }).eq('key', key);
  if (error) throw error;
}

// ─── CMS: Site Content ────────────────────────────────────────────────────────
export async function getSiteContentBySection(section: string): Promise<Record<string, string>> {
  const { data } = await supabase.from('site_content').select('key, value').eq('section', section).order('order_index');
  const map: Record<string, string> = {};
  (data ?? []).forEach((row: { key: string; value: string | null }) => { map[row.key] = row.value ?? ''; });
  return map;
}
export async function getAllSiteContent(): Promise<Record<string, Record<string, string>>> {
  const { data } = await supabase.from('site_content').select('section, key, value').order('section, order_index');
  const map: Record<string, Record<string, string>> = {};
  (data ?? []).forEach((row: { section: string; key: string; value: string | null }) => {
    if (!map[row.section]) map[row.section] = {};
    map[row.section][row.key] = row.value ?? '';
  });
  return map;
}
export async function adminGetAllSiteContent(): Promise<SiteContent[]> {
  const { data } = await supabase.from('site_content').select('*').order('section, order_index');
  return (data ?? []) as SiteContent[];
}
export async function updateSiteContent(id: string, value: string): Promise<void> {
  const { error } = await supabase.from('site_content').update({ value, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

// ─── CMS: Banners ─────────────────────────────────────────────────────────────
export async function getBanners(position: Banner['position']): Promise<Banner[]> {
  const { data } = await supabase.from('banners').select('*').eq('position', position).eq('is_active', true).order('order_index');
  return (data ?? []) as Banner[];
}
export async function trackBannerImpression(id: string): Promise<void> {
  supabase.rpc('increment_counter', { table_name: 'banners', row_id: id, column_name: 'impressions' }).then(undefined, () => {
    supabase.from('banners').select('impressions').eq('id', id).single()
      .then(({ data }) => supabase.from('banners').update({ impressions: (data?.impressions ?? 0) + 1 }).eq('id', id))
      .then(undefined, () => {});
  });
}
export async function trackBannerClick(id: string): Promise<void> {
  supabase.rpc('increment_counter', { table_name: 'banners', row_id: id, column_name: 'clicks' }).then(undefined, () => {
    supabase.from('banners').select('clicks').eq('id', id).single()
      .then(({ data }) => supabase.from('banners').update({ clicks: (data?.clicks ?? 0) + 1 }).eq('id', id))
      .then(undefined, () => {});
  });
}
export async function adminGetAllBanners(): Promise<Banner[]> {
  const { data } = await supabase.from('banners').select('*').order('position, order_index');
  return (data ?? []) as Banner[];
}
export async function createBanner(b: Omit<Banner, 'id' | 'created_at' | 'updated_at'>): Promise<void> {
  const { error } = await supabase.from('banners').insert(b);
  if (error) throw error;
}
export async function updateBanner(id: string, b: Partial<Banner>): Promise<void> {
  const { error } = await supabase.from('banners').update({ ...b, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}
export async function deleteBanner(id: string): Promise<void> {
  const { error } = await supabase.from('banners').delete().eq('id', id);
  if (error) throw error;
}
