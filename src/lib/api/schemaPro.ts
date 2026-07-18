import { supabase, type SeoRouteOverride, type Area, type NewsArticle, type Property } from '../supabase';

export const SEO_ROUTE_PATHS = ['/', '/danh-sach', '/mua-ban', '/cho-thue', '/khu-vuc', '/tin-tuc', '/ve-chung-toi'] as const;

export async function adminGetSeoRouteOverrides(): Promise<SeoRouteOverride[]> {
  const { data, error } = await supabase
    .from('seo_route_overrides')
    .select('*')
    .order('path');
  if (error) throw error;
  return (data ?? []) as SeoRouteOverride[];
}

export async function adminUpsertSeoRouteOverride(row: Partial<SeoRouteOverride> & { path: string }): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('seo_route_overrides')
    .upsert({
      path: row.path,
      meta_title: row.meta_title ?? null,
      meta_description: row.meta_description ?? null,
      focus_keywords: row.focus_keywords ?? null,
      canonical_path: row.canonical_path ?? null,
      robots_index: row.robots_index ?? true,
      robots_follow: row.robots_follow ?? true,
      schema_markup: row.schema_markup ?? null,
      updated_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'path' });
  if (error) throw error;
}

export async function adminGetSeoAudit(): Promise<{
  properties: Property[];
  news: NewsArticle[];
  areas: Area[];
}> {
  const [propertiesRes, newsRes, areasRes] = await Promise.all([
    supabase
      .from('properties')
      .select('*')
      .eq('is_active', true)
      .or('image_url.is.null,description.is.null,meta_description.is.null,latitude.is.null,longitude.is.null')
      .limit(30),
    supabase
      .from('news')
      .select('*')
      .eq('is_published', true)
      .or('excerpt.is.null,image_url.is.null,meta_description.is.null')
      .limit(30),
    supabase
      .from('areas')
      .select('*')
      .or('description.is.null,meta_description.is.null')
      .limit(30),
  ]);
  if (propertiesRes.error) throw propertiesRes.error;
  if (newsRes.error) throw newsRes.error;
  if (areasRes.error) throw areasRes.error;
  return {
    properties: (propertiesRes.data ?? []) as Property[],
    news: (newsRes.data ?? []) as NewsArticle[],
    areas: (areasRes.data ?? []) as Area[],
  };
}
