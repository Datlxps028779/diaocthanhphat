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

export type NewsIssueEditTarget =
  | 'title'
  | 'slug'
  | 'excerpt'
  | 'author'
  | 'image_url'
  | 'geo_area'
  | 'geo_entity'
  | 'geo_notes'
  | 'faq'
  | 'citations'
  | 'content'
  | 'meta_title'
  | 'meta_description'
  | 'focus_keywords';

/**
 * Maps a user-facing blocker to the nearest editable field. The quality gate
 * remains code/message-driven; this helper only improves the admin correction
 * path and safely returns null for messages without a known target.
 */
export function newsIssueEditTarget(message: string): NewsIssueEditTarget | null {
  const text = compact(message).toLocaleLowerCase('vi');

  if (/slug|url bài viết/.test(text)) return 'slug';
  if (/tiêu đề phải|tiêu đề bài viết/.test(text)) return 'title';
  if (/tóm tắt/.test(text)) return 'excerpt';
  if (/ảnh đại diện/.test(text)) return 'image_url';
  if (/meta title|tiêu đề seo/.test(text)) return 'meta_title';
  if (/meta description/.test(text)) return 'meta_description';
  if (/từ khóa|keyword/.test(text)) return 'focus_keywords';
  if (/khu vực thật/.test(text)) return 'geo_area';
  if (/entity|chủ thể chính/.test(text)) return 'geo_entity';
  if (/ngữ cảnh địa phương|geo\/aeo/.test(text)) return 'geo_notes';
  if (/faq trong nội dung|h2|nội dung|liên kết nội bộ|ảnh trong nội dung|h1/.test(text)) return 'content';
  if (/faq|câu hỏi/.test(text)) return 'faq';
  if (/nguồn tham khảo|url nguồn|url http|nguồn \d+|citation/.test(text)) return 'citations';
  if (/tác giả/.test(text)) return 'author';

  return null;
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

/**
 * `publish: true` = đang chuyển sang công khai → gom cổng chất lượng.
 * `publish: false` = lưu nháp / sửa bài đã đăng → chỉ chặn tiêu đề + slug trùng.
 */
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

/** Cùng rule với POST publish. Dùng để hiện sẵn sàng đăng lại, không mutate bài live. */
export function collectNewsRepublishReadiness(input: {
  article: NewsSaveIssueArticle;
  existingArticles: NewsSlugRecord[];
  currentId?: string | null;
}): { ready: boolean; blocking: string[]; warnings: string[] } {
  const { blocking, warnings } = collectNewsAdminSaveIssues({
    article: input.article,
    existingArticles: input.existingArticles,
    currentId: input.currentId,
    publish: true,
  });
  return { ready: blocking.length === 0, blocking, warnings };
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
