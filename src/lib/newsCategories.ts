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

// Cache slug-map runtime nạp từ DB (news_categories). Cho phép danh mục do admin thêm/
// đổi tên vẫn ra đúng slug ở pageToHref (đồng bộ, phía client) mà không phải async hóa.
// Rỗng cho tới khi client gọi setNewsCategorySlugMap sau khi fetch; khi rỗng thì rơi về
// map tĩnh bên dưới — luôn đúng cho 5 nhãn gốc, kể cả lúc SSR/build.
let runtimeLabelToSlug: Record<string, string> = {};
let runtimeSlugToLabel: Record<string, string> = {};

export function setNewsCategorySlugMap(rows: { label: string; slug: string }[]): void {
  const l2s: Record<string, string> = {};
  const s2l: Record<string, string> = {};
  for (const r of rows) {
    if (!r.label || !r.slug) continue;
    l2s[r.label] = r.slug;
    s2l[r.slug] = r.label;
  }
  runtimeLabelToSlug = l2s;
  runtimeSlugToLabel = s2l;
}

export function categoryToSlug(label: string): string | undefined {
  return runtimeLabelToSlug[label] ?? LABEL_TO_SLUG[label as NewsCategory];
}

export function slugToCategory(slug: string): string | undefined {
  return runtimeSlugToLabel[slug] ?? SLUG_TO_LABEL[slug];
}

export const NEWS_CATEGORY_SLUGS = Object.values(LABEL_TO_SLUG);
