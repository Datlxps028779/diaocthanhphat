import { supabase, type NewsArticle } from '../supabase';

// ─── News ─────────────────────────────────────────────────────────────────────
export async function getNews(category?: string, limit = 20): Promise<NewsArticle[]> {
  let q = supabase.from('news').select('*').eq('is_published', true).order('created_at', { ascending: false }).limit(limit);
  if (category && category !== 'Tất cả') q = q.eq('category', category);
  const { data } = await q;
  return (data ?? []) as NewsArticle[];
}
export async function getNewsById(id: string): Promise<NewsArticle | null> {
  // Pure read — tăng view tách ra incrementNewsView, bắn 1 lần khi mount ở tầng UI.
  const { data } = await supabase.from('news').select('*').eq('id', id).maybeSingle();
  return data as NewsArticle | null;
}

// Tăng view atomic; fallback read-modify-write nếu RPC chưa có trên DB.
export async function incrementNewsView(id: string): Promise<void> {
  const { error: rpcErr } = await supabase.rpc('increment_news_views', { row_id: id });
  if (rpcErr) {
    const { data } = await supabase.from('news').select('views').eq('id', id).maybeSingle();
    await supabase.from('news').update({ views: (data?.views ?? 0) + 1 }).eq('id', id);
  }
}
export async function adminGetAllNews(): Promise<NewsArticle[]> {
  const { data } = await supabase.from('news').select('*').order('created_at', { ascending: false });
  return (data ?? []) as NewsArticle[];
}
export async function createNews(n: Omit<NewsArticle, 'id' | 'created_at' | 'updated_at' | 'views'>): Promise<void> {
  const { error } = await supabase.from('news').insert(n);
  if (error) throw error;
}
export async function updateNews(id: string, n: Partial<NewsArticle>): Promise<void> {
  const { error } = await supabase.from('news').update({ ...n, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}
export async function deleteNews(id: string): Promise<void> {
  const { error } = await supabase.from('news').delete().eq('id', id);
  if (error) throw error;
}
