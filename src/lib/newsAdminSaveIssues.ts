import type { ArticleRow } from './apiIngest';
import { evaluateArticleIngestQuality } from './articleIngestQuality';
import { evaluateNewsEditorialQuality } from './newsEditorialQuality';
import type { NewsArticle } from './supabase';

export type NewsSlugRecord = Pick<NewsArticle, 'id' | 'slug' | 'title'>;

export type NewsSaveIssueArticle = Pick<
  NewsArticle,
  | 'title'
  | 'slug'
  | 'excerpt'
  | 'content'
  | 'image_url'
  | 'category'
  | 'author'
  | 'author_type'
  | 'author_role'
  | 'published_at'
  | 'as_of_date'
  | 'reviewer_name'
  | 'reviewer_role'
  | 'source_note'
  | 'meta_title'
  | 'meta_description'
  | 'focus_keywords'
  | 'geo_area'
  | 'geo_entity'
  | 'geo_notes'
  | 'faq'
  | 'citations'
> & { id?: string | null };

function compact(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function addUnique(issues: string[], seen: Set<string>, message: string) {
  const text = compact(message);
  if (!text || seen.has(text)) return;
  seen.add(text);
  issues.push(text);
}

export function normalizeNewsSlug(value: unknown): string {
  return compact(value).toLocaleLowerCase('vi');
}

/** Bài khác đang giữ cùng slug — trùng unique constraint news_slug_key. */
export function findNewsSlugConflict(
  slug: string,
  existingArticles: NewsSlugRecord[],
  currentId?: string | null,
): NewsSlugRecord | null {
  const normalized = normalizeNewsSlug(slug);
  if (!normalized) return null;
  return existingArticles.find(article => (
    article.id !== currentId
    && normalizeNewsSlug(article.slug) === normalized
  )) ?? null;
}

function toArticleRow(article: NewsSaveIssueArticle): ArticleRow {
  return {
    title: article.title ?? '',
    content: article.content ?? '',
    excerpt: article.excerpt ?? null,
    category: article.category ?? '',
    author: article.author ?? '',
    author_type: article.author_type ?? 'Organization',
    author_role: article.author_role ?? null,
    published_at: article.published_at ?? null,
    as_of_date: article.as_of_date ?? null,
    reviewer_name: article.reviewer_name ?? null,
    reviewer_role: article.reviewer_role ?? null,
    source_note: article.source_note ?? null,
    image_url: article.image_url ?? null,
    meta_title: article.meta_title ?? null,
    meta_description: article.meta_description ?? null,
    focus_keywords: article.focus_keywords ?? null,
    external_id: article.id || 'draft',
    geo_area: article.geo_area ?? '',
    geo_entity: article.geo_entity ?? '',
    geo_notes: article.geo_notes ?? '',
    faq: Array.isArray(article.faq) ? article.faq : [],
    citations: Array.isArray(article.citations) ? article.citations : [],
    is_published: false,
  };
}

export function collectNewsAdminSaveIssues(input: {
  article: NewsSaveIssueArticle;
  existingArticles: NewsSlugRecord[];
  currentId?: string | null;
  publish: boolean;
}): { blocking: string[]; warnings: string[] } {
  const blocking: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  const title = compact(input.article.title);
  const slug = compact(input.article.slug);

  if (!title) addUnique(blocking, seen, 'Vui lòng nhập tiêu đề bài viết.');
  if (!slug) addUnique(blocking, seen, 'Slug URL đang trống. Nhập slug hoặc để hệ thống sinh từ tiêu đề.');

  const conflict = findNewsSlugConflict(slug, input.existingArticles, input.currentId ?? input.article.id);
  if (conflict) {
    addUnique(
      blocking,
      seen,
      `Slug "${slug}" đã trùng bài "${conflict.title}" (news_slug_key). Mỗi bài phải có URL /tin-tuc/... riêng — hãy đổi slug trước khi lưu.`,
    );
  }

  if (!input.publish) return { blocking, warnings };

  const quality = evaluateArticleIngestQuality(toArticleRow(input.article), {
    rawContent: input.article.content ?? '',
  });
  for (const issue of quality.issues) addUnique(blocking, seen, issue.message);
  for (const warning of quality.warnings) addUnique(warnings, seen, warning.message);

  const editorial = evaluateNewsEditorialQuality({
    citations: input.article.citations,
    faq: input.article.faq,
  });
  for (const issue of editorial.citationIssues) addUnique(blocking, seen, issue.message);

  return { blocking, warnings };
}

export function formatNewsIssueList(
  headline: string,
  issues: string[],
  options?: { warnings?: string[]; maxIssues?: number },
): string {
  const seen = new Set<string>();
  const uniqueIssues: string[] = [];
  for (const issue of issues) addUnique(uniqueIssues, seen, issue);
  const uniqueWarnings: string[] = [];
  for (const warning of options?.warnings ?? []) addUnique(uniqueWarnings, seen, warning);

  const compactHeadline = compact(headline) || 'Không lưu được bài viết.';
  if (uniqueIssues.length === 0 && uniqueWarnings.length === 0) return compactHeadline;

  const maxIssues = options?.maxIssues && options.maxIssues > 0
    ? options.maxIssues
    : uniqueIssues.length;
  const shown = uniqueIssues.slice(0, Math.max(uniqueIssues.length ? 1 : 0, maxIssues));
  const remaining = uniqueIssues.length - shown.length;
  const lines = [compactHeadline, ...shown.map((message, index) => `${index + 1}. ${message}`)];
  if (remaining > 0) lines.push(`… và ${remaining} mục nữa.`);
  if (uniqueWarnings.length > 0) {
    lines.push('Thiếu sót nên sửa (không chặn nếu chỉ còn các mục này):');
    for (const warning of uniqueWarnings) lines.push(`- ${warning}`);
  }
  return lines.join('\n');
}
