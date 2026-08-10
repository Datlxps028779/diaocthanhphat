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
