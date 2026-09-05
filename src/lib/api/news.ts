import { supabase, type NewsArticle, type NewsListItem, type NewsPageResult } from '../supabase';
import { buildUniqueSlug } from '../slug';
import { newsRevalidationSnapshot, revalidateNewsContent } from './contentRevalidation';

export const NEWS_PER_PAGE = 12;

const NEWS_LIST_SELECT = 'id,title,slug,excerpt,image_url,category,author,views,focus_keywords,geo_area,created_at,updated_at';

// ─── News ─────────────────────────────────────────────────────────────────────
export async function getNews(category?: string, limit = 20): Promise<NewsArticle[]> {
  let q = supabase.from('news').select('*').eq('is_published', true).order('created_at', { ascending: false }).limit(limit);
  if (category && category !== 'Tất cả') q = q.eq('category', category);
  const { data } = await q;
  return (data ?? []) as NewsArticle[];
}

export async function getNewsPage({
  category,
  page = 1,
  limit = NEWS_PER_PAGE,
}: {
  category?: string;
  page?: number;
  limit?: number;
} = {}): Promise<NewsPageResult> {
  let q = supabase
    .from('news')
    .select(NEWS_LIST_SELECT, { count: 'exact' })
    .eq('is_published', true)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

  if (category && category !== 'Tất cả') q = q.eq('category', category);

  const { data, error, count } = await q.range((page - 1) * limit, page * limit - 1);
  if (error) throw error;
  return { data: (data ?? []) as NewsListItem[], total: count ?? 0 };
}

export async function getMostViewedNews(limit = 8): Promise<NewsListItem[]> {
  const { data } = await supabase
    .from('news')
    .select(NEWS_LIST_SELECT)
    .eq('is_published', true)
    .order('views', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);
  return (data ?? []) as NewsListItem[];
}
export async function getNewsById(id: string): Promise<NewsArticle | null> {
  // Pure read — tăng view tách ra incrementNewsView, bắn 1 lần khi mount ở tầng UI.
  const { data } = await supabase.from('news').select('*').eq('id', id).maybeSingle();
  return data as NewsArticle | null;
}

// Resolve bài liên quan chọn tay theo id (có thể khác category). Chỉ lấy bài đã đăng.
export async function getNewsByIds(ids: string[]): Promise<NewsArticle[]> {
  if (ids.length === 0) return [];
  const { data } = await supabase.from('news').select('*').in('id', ids).eq('is_published', true);
  return (data ?? []) as NewsArticle[];
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
  const { data } = await supabase
    .from('news')
    .select('*')
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });
  return (data ?? []) as NewsArticle[];
}
// Client writes contain editorial fields only; generated structured data remains server-owned.
export type NewsWrite = Omit<NewsArticle, 'id' | 'created_at' | 'updated_at' | 'views' | 'schema_markup'>;

export async function createNews(n: NewsWrite): Promise<NewsArticle> {
  // Slug auto từ tiêu đề (+ hậu tố chống trùng). Chỉ dùng slug nhập tay khi admin
  // chủ động điền — còn lại luôn sinh tự động để đảm bảo chuẩn SEO.
  const slug = (n.slug && n.slug.trim()) || buildUniqueSlug(n.title);
  const { schema_markup: _schemaMarkup, ...safePayload } = n as NewsWrite & { schema_markup?: unknown };
  const { data, error } = await supabase.from('news').insert({ ...safePayload, slug }).select().single();
  if (error) throw error;
  const article = data as NewsArticle;
  await revalidateNewsContent('create', [{ current: newsRevalidationSnapshot(article) }]);
  return article;
}
export async function updateNews(id: string, n: Partial<Omit<NewsArticle, 'schema_markup'>>): Promise<NewsArticle> {
  const { data: previousData, error: previousError } = await supabase
    .from('news')
    .select('id,slug,category,is_published')
    .eq('id', id)
    .maybeSingle();
  if (previousError) throw previousError;
  const { schema_markup: _schemaMarkup, ...safePatch } = n as typeof n & { schema_markup?: unknown };
  const { data, error } = await supabase
    .from('news')
    .update({ ...safePatch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  const article = data as NewsArticle;
  await revalidateNewsContent('update', [{
    previous: previousData ? newsRevalidationSnapshot(previousData) : undefined,
    current: newsRevalidationSnapshot(article),
  }]);
  return article;
}
export async function deleteNews(id: string): Promise<void> {
  const { data: previousData, error: previousError } = await supabase
    .from('news')
    .select('id,slug,category,is_published')
    .eq('id', id)
    .maybeSingle();
  if (previousError) throw previousError;
  const { error } = await supabase.from('news').delete().eq('id', id);
  if (error) throw error;
  if (previousData) {
    await revalidateNewsContent('delete', [{ previous: newsRevalidationSnapshot(previousData) }]);
  }
}

// ─── Bulk operations ──────────────────────────────────────────────────────────
const NEWS_REVALIDATION_SELECT = 'id,slug,category,is_published';
type NewsRevalidationSnapshotRow = Pick<NewsArticle, 'id' | 'slug' | 'category' | 'is_published'>;

async function getNewsRevalidationRows(ids: string[]): Promise<NewsRevalidationSnapshotRow[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from('news').select(NEWS_REVALIDATION_SELECT).in('id', ids);
  if (error) throw error;
  return (data ?? []) as NewsRevalidationSnapshotRow[];
}

// Cập nhật/xóa nhiều bài trong 1 câu (.in) thay vì lặp N request. Trả số dòng ảnh
// hưởng để UI báo lại. Whitelist cột cập nhật để tránh set nhầm field.
export async function bulkUpdateNews(
  ids: string[],
  patch: Partial<Pick<NewsArticle, 'is_published'>>,
): Promise<number> {
  if (ids.length === 0) return 0;
  const previousRows = await getNewsRevalidationRows(ids);
  const { error, count } = await supabase
    .from('news')
    .update({ ...patch, updated_at: new Date().toISOString() }, { count: 'exact' })
    .in('id', ids);
  if (error) throw error;
  const currentRows = await getNewsRevalidationRows(ids);
  await revalidateNewsContent('bulk', previousRows.map(previous => ({
    previous: newsRevalidationSnapshot(previous),
    current: currentRows.find(current => current.id === previous.id)
      ? newsRevalidationSnapshot(currentRows.find(current => current.id === previous.id)!)
      : undefined,
  })));
  return count ?? ids.length;
}

export async function bulkDeleteNews(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const previousRows = await getNewsRevalidationRows(ids);
  const { error, count } = await supabase
    .from('news')
    .delete({ count: 'exact' })
    .in('id', ids);
  if (error) throw error;
  if (previousRows.length > 0) {
    await revalidateNewsContent('bulk', previousRows.map(previous => ({ previous: newsRevalidationSnapshot(previous) })));
  }
  return count ?? ids.length;
}
