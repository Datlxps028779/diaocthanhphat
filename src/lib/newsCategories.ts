// Danh mục tin tức: nhãn hiển thị (tiếng Việt có dấu, khớp cột news.category trong DB)
// ↔ slug URL (bỏ dấu). Nguồn chân lý cho route /tin-tuc/danh-muc/{slug} và pageToHref.
// Nhãn phải khớp CHÍNH XÁC giá trị lưu ở DB để query .eq('category', label) trúng.

export const NEWS_CATEGORIES = ['Thị trường', 'Hạ tầng', 'Đầu tư', 'Hướng dẫn', 'Tài chính'] as const;
export type NewsCategory = (typeof NEWS_CATEGORIES)[number];

const LABEL_TO_SLUG: Record<NewsCategory, string> = {
  'Thị trường': 'thi-truong',
  'Hạ tầng': 'ha-tang',
  'Đầu tư': 'dau-tu',
  'Hướng dẫn': 'huong-dan',
  'Tài chính': 'tai-chinh',
};

const SLUG_TO_LABEL: Record<string, NewsCategory> = Object.fromEntries(
  Object.entries(LABEL_TO_SLUG).map(([label, slug]) => [slug, label as NewsCategory]),
) as Record<string, NewsCategory>;

export function categoryToSlug(label: string): string | undefined {
  return LABEL_TO_SLUG[label as NewsCategory];
}

export function slugToCategory(slug: string): NewsCategory | undefined {
  return SLUG_TO_LABEL[slug];
}

export const NEWS_CATEGORY_SLUGS = Object.values(LABEL_TO_SLUG);
