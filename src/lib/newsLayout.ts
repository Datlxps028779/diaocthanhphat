import type { NewsListItem } from './supabase';

// Chọn tối đa `limit` bài để hiển thị trong khối chuyên mục của một danh mục.
// Ưu tiên bài KHÔNG nằm trong hero (heroIds) để không trùng khối nổi bật. Nếu sau khi
// loại hero mà rỗng (danh mục chỉ có đúng bài đang ở hero, ví dụ "Đầu tư" 1 bài), thì
// dùng lại bài hero đó thay vì để danh mục biến mất — đây là fallback có chủ đích.
export function pickSectionArticles(
  articles: NewsListItem[],
  heroIds: ReadonlySet<string>,
  limit = 4,
): NewsListItem[] {
  const nonHero = articles.filter(a => !heroIds.has(a.id));
  const chosen = nonHero.slice(0, limit);
  if (chosen.length === 0 && articles.length > 0) return articles.slice(0, limit);
  return chosen;
}

export type NewsSection = { category: string; items: NewsListItem[] };

// Dựng danh sách khối chuyên mục theo đúng thứ tự admin (sectionLabels). Mỗi danh mục
// lấy bài từ map riêng (đã fetch độc lập). Danh mục không có bài nào để hiển thị thì
// bỏ qua để không render khối trống.
export function buildNewsSections(
  sectionLabels: string[],
  articlesByCategory: Map<string, NewsListItem[]>,
  heroIds: ReadonlySet<string>,
  limit = 4,
): NewsSection[] {
  const sections: NewsSection[] = [];
  for (const category of sectionLabels) {
    const items = pickSectionArticles(articlesByCategory.get(category) ?? [], heroIds, limit);
    if (items.length > 0) sections.push({ category, items });
  }
  return sections;
}
export type EditorialNewsLayout = {
  lead: NewsListItem | null;
  support: NewsListItem[];
  sections: NewsSection[];
  unusedIds: Set<string>;
};

/**
 * Splits a loaded news collection into one lead, supporting stories and
 * category streams without reusing an article in two editorial blocks.
 */
export function buildEditorialNewsLayout(
  articles: NewsListItem[],
  magazine: boolean,
  supportLimit = 2,
): EditorialNewsLayout {
  const lead = articles[0] ?? null;
  const support = articles.slice(1, magazine ? 1 + supportLimit : undefined);
  const usedIds = new Set([lead?.id, ...support.map(article => article.id)].filter((id): id is string => Boolean(id)));
  const unused = articles.filter(article => !usedIds.has(article.id));
  const byCategory = new Map<string, NewsListItem[]>();
  for (const article of unused) {
    const category = article.category?.trim() || 'Tin khác';
    const list = byCategory.get(category);
    if (list) list.push(article);
    else byCategory.set(category, [article]);
  }
  return {
    lead,
    support,
    sections: magazine ? [...byCategory.entries()].map(([category, items]) => ({ category, items })) : [],
    unusedIds: new Set(unused.map(article => article.id)),
  };
}
