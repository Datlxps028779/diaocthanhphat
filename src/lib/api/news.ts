import { supabase, type NewsArticle, type NewsListItem, type NewsPageResult } from '../supabase';
import { buildUniqueSlug } from '../slug';
import { newsRevalidationSnapshot, revalidateNewsContent } from './contentRevalidation';

export const NEWS_PER_PAGE = 12;

type NewsPublicationFields = {
  is_published?: boolean;
  published_at?: string | null;
};

export function ensureNewsPublicationTimestamp<T extends object>(
  previous: Pick<NewsArticle, 'is_published' | 'published_at'> | null | undefined,
  patch: T & NewsPublicationFields,
  now = new Date().toISOString(),
): T & NewsPublicationFields {
  if (patch.published_at == null && previous?.published_at) {
    return { ...patch, published_at: previous.published_at };
  }

  const nextIsPublished = patch.is_published ?? previous?.is_published ?? false;
  if (nextIsPublished && !previous?.is_published && patch.published_at == null) {
    return { ...patch, published_at: now };
  }

  return patch;
}

export function getNewsIdsToStampOnBulkPublish(
  rows: Array<Pick<NewsArticle, 'id' | 'is_published' | 'published_at'>>,
): string[] {
  return rows
    .filter(row => !row.is_published && !row.published_at)
    .map(row => row.id);
}

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

export type NewsPublicationResult = {
  ok: boolean;
  mode: 'observe' | 'enforce';
  result?: {
    id: string;
    slug: string;
    category: string;
    is_published: boolean;
    published_at: string | null;
    content_version: number;
    event_id: string | null;
    changed: boolean;
  };
  quality_gate: Record<string, unknown>;
  paths: string[];
};

async function publicationHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    Authorization: `Bearer ${session?.access_token ?? ''}`,
    'Content-Type': 'application/json',
  };
}

export async function setNewsPublicationState(
  id: string,
  publish: boolean,
  expectedContentVersion: number,
): Promise<NewsPublicationResult> {
  const response = await fetch(`/api/admin/news/${encodeURIComponent(id)}/publish`, {
    method: 'POST',
    headers: await publicationHeaders(),
    body: JSON.stringify({ publish, expectedContentVersion }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(json.error ?? 'Không thể cập nhật trạng thái xuất bản.') as Error & { code?: string; quality_gate?: unknown };
    error.code = json.code;
    error.quality_gate = json.quality_gate;
    throw error;
  }
  return json as NewsPublicationResult;
}

const DEFAULT_PUBLICATION_ERROR = 'Không thể cập nhật trạng thái xuất bản.';
const MAX_QUALITY_ISSUE_LINES = 8;

function compactErrorText(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function qualityIssueMessages(qualityGate: unknown): string[] {
  if (!qualityGate || typeof qualityGate !== 'object') return [];
  const issues = (qualityGate as { issues?: unknown }).issues;
  if (!Array.isArray(issues)) return [];
  const messages: string[] = [];
  const seen = new Set<string>();
  for (const issue of issues) {
    const rawMessage = typeof issue === 'string'
      ? issue
      : issue && typeof issue === 'object'
        ? (issue as { message?: unknown }).message
        : '';
    const message = compactErrorText(rawMessage);
    if (!message || seen.has(message)) continue;
    seen.add(message);
    messages.push(message);
  }
  return messages;
}

/** Ghép quality_gate.issues để admin thấy đúng chỗ bài bị chặn, không chỉ câu chung. */
export function formatNewsPublicationError(
  error: unknown,
  options?: { fallback?: string; maxIssues?: number },
): string {
  const fallback = compactErrorText(options?.fallback) || DEFAULT_PUBLICATION_ERROR;
  const err = error && typeof error === 'object'
    ? error as { message?: unknown; quality_gate?: unknown }
    : null;
  const headline = compactErrorText(err?.message) || fallback;
  const issues = qualityIssueMessages(err?.quality_gate);
  if (issues.length === 0) return headline;

  const maxIssues = Math.max(1, options?.maxIssues ?? MAX_QUALITY_ISSUE_LINES);
  const shown = issues.slice(0, maxIssues);
  const remaining = issues.length - shown.length;
  const lines = [headline, ...shown.map((message, index) => `${index + 1}. ${message}`)];
  if (remaining > 0) lines.push(`… và ${remaining} mục nữa.`);
  return lines.join('\n');
}

// Client writes contain editorial fields only; generated structured data remains server-owned.
export type NewsWrite = Omit<NewsArticle, 'id' | 'created_at' | 'updated_at' | 'views' | 'schema_markup' | 'content_version'>;

export async function createNews(n: NewsWrite): Promise<NewsArticle> {
  // Slug auto từ tiêu đề (+ hậu tố chống trùng). Chỉ dùng slug nhập tay khi admin
  // chủ động điền — còn lại luôn sinh tự động để đảm bảo chuẩn SEO.
  const slug = (n.slug && n.slug.trim()) || buildUniqueSlug(n.title);
  const publicationPayload = ensureNewsPublicationTimestamp(undefined, { ...n, is_published: false });
  const { schema_markup: _schemaMarkup, ...safePayload } = publicationPayload as NewsWrite & { schema_markup?: unknown };
  const { data, error } = await supabase.from('news').insert({ ...safePayload, slug }).select().single();
  if (error) throw error;
  const article = data as NewsArticle;
  await revalidateNewsContent('create', [{ current: newsRevalidationSnapshot(article) }]);
  return article;
}
export async function updateNews(id: string, n: Partial<Omit<NewsArticle, 'schema_markup' | 'content_version'>>): Promise<NewsArticle> {
  const { data: previousData, error: previousError } = await supabase
    .from('news')
    .select('id,slug,category,is_published,published_at')
    .eq('id', id)
    .maybeSingle();
  if (previousError) throw previousError;
  const publicationPatch = ensureNewsPublicationTimestamp(previousData, n);
  const { schema_markup: _schemaMarkup, is_published: _isPublished, ...safePatch } = publicationPatch as typeof n & { schema_markup?: unknown; is_published?: boolean };
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
const NEWS_REVALIDATION_SELECT = 'id,slug,category,is_published,published_at';
type NewsRevalidationSnapshotRow = Pick<NewsArticle, 'id' | 'slug' | 'category' | 'is_published' | 'published_at'>;

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
  const publicationTimestamp = new Date().toISOString();
  const idsToStamp = patch.is_published === true
    ? getNewsIdsToStampOnBulkPublish(previousRows)
    : [];
  const { error, count } = await supabase
    .from('news')
    .update({ ...patch, updated_at: publicationTimestamp }, { count: 'exact' })
    .in('id', ids);
  if (error) throw error;
  if (idsToStamp.length > 0) {
    const { error: timestampError } = await supabase
      .from('news')
      .update({ published_at: publicationTimestamp, updated_at: publicationTimestamp })
      .in('id', idsToStamp)
      .eq('is_published', true)
      .is('published_at', null);
    if (timestampError) throw timestampError;
  }
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
